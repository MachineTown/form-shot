import { Page } from 'puppeteer';
import { SurveyForm, SurveyField, SurveyTuple } from '../utils/types';
import { join } from 'path';
import { mkdirSync } from 'fs';

export class SurveyFormDetector {
  
  async detectSurveyForm(page: Page, tuple: SurveyTuple): Promise<SurveyForm> {
    // Find right panel and get its dimensions
    const rightPanel = await this.findRightPanel(page);
    console.log(`Using container selector: ${rightPanel}`);
    
    // Calculate viewport height needed for full form
    const viewportHeight = await this.calculateRequiredViewportHeight(page, rightPanel);
    
    // Scroll to bottom to ensure all fields are loaded
    await this.scrollToBottom(page, rightPanel);
    
    // Extract form title and short name
    const { longTitle, shortName } = await this.extractFormTitles(page);
    
    // Detect all form fields in right panel
    const fields = await this.detectFormFields(page, rightPanel, tuple);
    
    return {
      longTitle,
      shortName,
      fields,
      viewportHeight,
      url: page.url(),
      timestamp: new Date().toISOString()
    };
  }

  private async findRightPanel(page: Page): Promise<string> {
    // Look specifically for survey-body-container by ID as specified in requirements
    const surveyBodyContainer = await page.$('#survey-body-container');
    if (surveyBodyContainer) {
      return '#survey-body-container';
    }

    // Fallback to class-based selector if ID not found
    const surveyBodyContainerByClass = await page.$('.survey-body-container');
    if (surveyBodyContainerByClass) {
      return '.survey-body-container';
    }

    console.warn('survey-body-container not found, analysis may include irrelevant fields');
    
    // Final fallback to body if no survey container found
    return 'body';
  }

  private async calculateRequiredViewportHeight(page: Page, rightPanelSelector: string): Promise<number> {
    return await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) return window.innerHeight;
      
      return Math.max(element.scrollHeight, element.clientHeight, window.innerHeight);
    }, rightPanelSelector);
  }

  private async scrollToBottom(page: Page, rightPanelSelector: string): Promise<void> {
    await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (element && element.scrollHeight > element.clientHeight) {
        // Scroll the survey-body-container to bottom to reveal all form fields
        element.scrollTop = element.scrollHeight;
        console.log(`Scrolled ${selector} to bottom: ${element.scrollTop}px of ${element.scrollHeight}px`);
      } else {
        console.log(`${selector} does not need scrolling or not found`);
        // Only scroll page if survey-body-container wasn't found
        if (selector === 'body') {
          window.scrollTo(0, document.body.scrollHeight);
        }
      }
    }, rightPanelSelector);

    // Wait for any lazy-loaded content to appear after scrolling
    await page.waitForTimeout(3000);
  }

  private async extractFormTitles(page: Page): Promise<{ longTitle: string; shortName: string }> {
    const titles = await page.evaluate(() => {
      // Look for form titles in common locations
      const titleSelectors = [
        'h1', 'h2', 'h3',
        '[class*="title"]',
        '[class*="header"]',
        '[class*="form-title"]',
        '.survey-title'
      ];

      let longTitle = '';
      let shortName = '';

      for (const selector of titleSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.textContent?.trim() || '';
          if (text.length > 0) {
            if (!longTitle || text.length > longTitle.length) {
              longTitle = text;
            }
            if (!shortName) {
              // Extract a shorter version (first few words or up to first punctuation)
              shortName = text.split(/[.!?:]|\\s+/).slice(0, 3).join(' ').trim();
            }
          }
        }
      }

      return {
        longTitle: longTitle || 'Survey Form',
        shortName: shortName || 'Survey'
      };
    });

    return titles;
  }

  private async detectFormFields(page: Page, rightPanelSelector: string, tuple: SurveyTuple): Promise<SurveyField[]> {
    const fields = await page.evaluate((selector) => {
      // Helper functions that run in browser context
      function extractQuestionText(container: Element): string {
        const textNodes: string[] = [];
        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              
              // Skip input values and hidden content
              if (parent.tagName === 'INPUT' || parent.tagName === 'OPTION' || 
                  parent.style.display === 'none' || parent.style.visibility === 'hidden') {
                return NodeFilter.FILTER_REJECT;
              }
              
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent?.trim();
          if (text && text.length > 0) {
            textNodes.push(text);
          }
        }

        return textNodes.join(' ').replace(/\\s+/g, ' ').trim();
      }

      function extractQuestionNumber(text: string): string {
        const match = text.match(/^(\\d+(?:\\.\\d+)*\\.?)\\s*/);
        return match ? match[1] : '';
      }

      function getInputType(input: Element): string {
        if (input.tagName === 'SELECT') return 'dropdown';
        if (input.tagName === 'TEXTAREA') return 'textarea';
        
        const type = (input as HTMLInputElement).type?.toLowerCase();
        return type || 'text';
      }

      function getChoices(input: Element, container: Element): string[] {
        if (input.tagName === 'SELECT') {
          const options = Array.from(input.querySelectorAll('option'));
          return options
            .map(opt => opt.textContent?.trim())
            .filter(text => text && text.length > 0) as string[];
        }
        
        if ((input as HTMLInputElement).type === 'radio') {
          const name = (input as HTMLInputElement).name;
          if (name) {
            const radios = container.querySelectorAll(`input[type="radio"][name="${name}"]`);
            const choices: string[] = [];
            
            radios.forEach(radio => {
              const label = radio.nextElementSibling?.textContent?.trim() || 
                           radio.closest('label')?.textContent?.trim() ||
                           (radio as HTMLInputElement).value;
              if (label) choices.push(label);
            });
            
            return choices;
          }
        }
        
        return [];
      }

      function generateSelector(input: Element, index: number): string {
        if (input.id) {
          // Use CSS.escape for IDs with special characters, fallback to attribute selector
          try {
            return `#${CSS.escape(input.id)}`;
          } catch (e) {
            return `[id="${input.id}"]`;
          }
        }
        
        const tagName = input.tagName.toLowerCase();
        const type = (input as HTMLInputElement).type;
        const name = (input as HTMLInputElement).name;
        
        if (name) return `${tagName}[name="${name}"]`;
        if (type) return `${tagName}[type="${type}"]:nth-of-type(${index + 1})`;
        
        return `${tagName}:nth-of-type(${index + 1})`;
      }

      const rightPanel = document.querySelector(selector);
      if (!rightPanel) {
        console.log(`Container not found: ${selector}`);
        return [];
      }

      // Find all CardBox question containers within the survey-body-container
      const cardBoxElements = rightPanel.querySelectorAll('[class*="CardBox"]');
      console.log(`Found ${cardBoxElements.length} CardBox elements in ${selector}`);
      const fieldGroups: any[] = [];

      cardBoxElements.forEach((cardBox, index) => {
        // Extract question text and number from the CardBox
        const questionText = extractQuestionText(cardBox);
        const questionNumber = extractQuestionNumber(questionText);
        const isRequired = questionText.endsWith('*');
        
        // Find all inputs within this CardBox
        const questionInputs = cardBox.querySelectorAll('input, select, textarea');
        const nonHiddenInputs = Array.from(questionInputs).filter(inp => (inp as HTMLInputElement).type !== 'hidden');
        
        if (nonHiddenInputs.length === 0) return; // Skip if no visible inputs
        
        let inputType = 'text';
        let choices: string[] = [];
        let elementSelector = '';

        if (nonHiddenInputs.length === 1) {
          // Single input - use its type and selector
          const singleInput = nonHiddenInputs[0];
          inputType = getInputType(singleInput);
          choices = getChoices(singleInput, cardBox);
          elementSelector = generateSelector(singleInput, index);
        } else {
          // Multiple inputs - check if they're radio buttons or similar grouped inputs
          const radioInputs = nonHiddenInputs.filter(inp => (inp as HTMLInputElement).type === 'radio');
          const checkboxInputs = nonHiddenInputs.filter(inp => (inp as HTMLInputElement).type === 'checkbox');
          
          if (radioInputs.length > 1) {
            inputType = 'radio';
            // Get choices from all radio buttons in this CardBox
            choices = [];
            radioInputs.forEach(radio => {
              const label = radio.nextElementSibling?.textContent?.trim() || 
                           radio.closest('label')?.textContent?.trim() ||
                           (radio as HTMLInputElement).value;
              if (label && !choices.includes(label)) choices.push(label);
            });
            elementSelector = generateSelector(radioInputs[0], index);
          } else if (checkboxInputs.length > 1) {
            inputType = 'checkbox';
            choices = [];
            checkboxInputs.forEach(checkbox => {
              const label = checkbox.nextElementSibling?.textContent?.trim() || 
                           checkbox.closest('label')?.textContent?.trim() ||
                           (checkbox as HTMLInputElement).value;
              if (label && !choices.includes(label)) choices.push(label);
            });
            elementSelector = generateSelector(checkboxInputs[0], index);
          } else {
            // Mixed input types - use the first non-hidden input
            const firstInput = nonHiddenInputs[0];
            inputType = getInputType(firstInput);
            choices = getChoices(firstInput, cardBox);
            elementSelector = generateSelector(firstInput, index);
          }
        }

        // Only add if we have meaningful question text or a question number
        if (questionText.length > 3 || questionNumber.length > 0) {
          fieldGroups.push({
            questionNumber,
            questionText: questionText.replace(/\\*$/, '').trim(),
            inputType,
            isRequired,
            choices: choices.length > 0 ? choices : undefined,
            selector: elementSelector,
            screenshotPath: '', // Will be filled when taking screenshots
            cardBoxSelector: generateCardBoxSelector(cardBox, index) // Add selector for the CardBox container
          });
        }
      });

      function generateCardBoxSelector(cardBox: Element, index: number): string {
        if (cardBox.id) {
          try {
            return `#${CSS.escape(cardBox.id)}`;
          } catch (e) {
            return `[id="${cardBox.id}"]`;
          }
        }
        
        if (cardBox.className) {
          const classes = cardBox.className.split(' ').filter(c => c.length > 0);
          const cardBoxClass = classes.find(c => c.startsWith('CardBox'));
          if (cardBoxClass) {
            return `.${cardBoxClass}`;
          }
          if (classes.length > 0) {
            return `.${classes.join('.')}`;
          }
        }
        
        return `[class*="CardBox"]:nth-of-type(${index + 1})`;
      }

      return fieldGroups;
    }, rightPanelSelector);

    // Take individual screenshots for each field
    console.log(`Taking screenshots for ${fields.length} questions`);
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const screenshotPath = await this.takeFieldScreenshot(page, field.cardBoxSelector, i, tuple);
      field.screenshotPath = screenshotPath;
    }

    return fields;
  }

  private async takeFieldScreenshot(page: Page, cardBoxSelector: string, index: number, tuple: SurveyTuple): Promise<string> {
    try {
      const cardBoxElement = await page.$(cardBoxSelector);
      if (!cardBoxElement) return '';

      // Scroll CardBox element into view
      await cardBoxElement.scrollIntoView();
      await page.waitForTimeout(500);

      // Generate screenshot filename
      const filename = `field_${index + 1}_${tuple.customerId}_${tuple.studyId}.png`;
      
      // Create output directory if it doesn't exist
      const outputDir = join('/app/output', tuple.customerId, tuple.studyId, tuple.packageName, tuple.language, tuple.version);
      try {
        mkdirSync(outputDir, { recursive: true });
      } catch (error) {
        console.warn('Failed to create screenshot directory:', error);
      }
      
      const screenshotPath = join(outputDir, filename);
      
      // Take screenshot of the entire CardBox container
      await cardBoxElement.screenshot({ path: screenshotPath });

      return filename;
    } catch (error) {
      console.warn(`Failed to take screenshot for field ${index + 1}:`, error);
      return '';
    }
  }
}