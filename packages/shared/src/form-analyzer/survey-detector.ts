import { Page } from 'puppeteer';
import { ScreenshotService } from '../services/screenshot-service.js';
import { testDataGenerator } from '../test-generator/test-data-generator.js';
import { logger } from '../utils/logger.js';
import { SurveyField, SurveyForm, SurveyTuple } from '../types/types.js';

export class SurveyFormDetector {
  
  async detectSurveyForm(page: Page, tuple: SurveyTuple, screenshotService: ScreenshotService, formIndex?: number): Promise<SurveyForm> {
    // Find right panel and get its dimensions
    const rightPanel = await this.findRightPanel(page);
    logger.info(`Using container selector: ${rightPanel}`);
    
    // Calculate viewport height needed for full form
    const viewportHeight = await this.calculateRequiredViewportHeight(page, rightPanel);
    
    // Scroll to bottom to ensure all fields are loaded
    await this.scrollToBottom(page, rightPanel);
    
    // Scroll back to top to ensure title elements are accessible
    await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (element) {
        element.scrollTop = 0;
      } else {
        window.scrollTo(0, 0);
      }
    }, rightPanel);
    
    // Wait a bit for any animations/rendering
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Extract form title and short name
    const { longTitle, shortName } = await this.extractFormTitles(page);
    
    // Detect all form fields in right panel
    const fields = await this.detectFormFields(page, rightPanel, tuple, screenshotService, formIndex);
    
    return {
      longTitle,
      shortName,
      fields,
      viewportHeight,
      url: page.url(),
      timestamp: new Date().toISOString(),
      navigationButtons: [],  // Will be filled by the analyzer
      formIndex: 0  // Will be set by the analyzer
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

    logger.warn('survey-body-container not found, analysis may include irrelevant fields');
    
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
      } else {
        // Only scroll page if survey-body-container wasn't found
        if (selector === 'body') {
          window.scrollTo(0, document.body.scrollHeight);
        }
      }
    }, rightPanelSelector);

    // Wait for any lazy-loaded content to appear after scrolling
    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.debug('Completed scrolling and waiting for lazy-loaded content');
  }

  private async extractFormTitles(page: Page): Promise<{ longTitle: string; shortName: string }> {
    try {
      // Find the correct p and h3 tags that are together (form titles)
      const titles = await page.evaluate(() => {
        const container = document.querySelector('#survey-body-container');
        if (!container) {
          return {
            longTitle: 'Title not found',
            shortName: 'Title not found'
          };
        }
        
        // Find all p tags in the container
        const allPs = container.querySelectorAll('p');
        let formTitleP = null;
        let formTitleH3 = null;
        
        // Look for a p tag that has an h3 sibling in the same parent
        for (const p of allPs) {
          const parent = p.parentElement;
          if (parent) {
            const h3InParent = parent.querySelector('h3');
            if (h3InParent) {
              // Found the p and h3 that are together
              formTitleP = p;
              formTitleH3 = h3InParent;
              break;
            }
          }
        }
        
        const longTitle = formTitleP?.textContent?.trim() || 'Title not found';
        const shortName = formTitleH3?.textContent?.trim() || 'Title not found';
        
        return {
          longTitle,
          shortName
        };
      });
      
      return {
        longTitle: titles.longTitle,
        shortName: titles.shortName
      };
    } catch (error) {
      logger.error(`Error in extractFormTitles: ${error}`);
      return {
        longTitle: 'Title not found',
        shortName: 'Title not found'
      };
    }
  }

  private async detectFormFields(page: Page, rightPanelSelector: string, tuple: SurveyTuple, screenshotService: ScreenshotService, formIndex?: number): Promise<SurveyField[]> {
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
        // Match patterns like "1.", "2.3", "4.5.6", etc. at the start of text
        const match = text.match(/^(\d+(?:\.\d+)*\.?)\s*/);
        return match ? match[1] : '';
      }

      function cleanQuestionText(text: string, choices: string[]): { cleanText: string; isRequired: boolean } {
        let cleanText = text;
        
        // Remove question number from the beginning
        cleanText = cleanText.replace(/^\d+(?:\.\d+)*\.?\s*/, '');
        
        // Remove choice values from the end of question text first (before checking for *)
        if (choices && choices.length > 0) {
          // Remove choices from the end, trying longest matches first
          const sortedChoices = [...choices].sort((a, b) => b.length - a.length);
          for (const choice of sortedChoices) {
            const escapedChoice = choice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Remove choice from anywhere in the text (not just end) with word boundaries
            const regex = new RegExp('\\s*\\b' + escapedChoice + '\\b\\s*', 'gi');
            cleanText = cleanText.replace(regex, ' ');
          }
          
          // Clean up multiple spaces
          cleanText = cleanText.replace(/\s+/g, ' ').trim();
        }
        
        // Check if question is required (ends with *) - do this after choice removal
        const isRequired = cleanText.trim().endsWith('*');
        if (isRequired) {
          cleanText = cleanText.replace(/\s*\*\s*$/, '').trim();
        }
        
        return { cleanText: cleanText.trim(), isRequired };
      }

      function getInputType(input: Element): string {
        if (input.tagName === 'SELECT') return 'dropdown';
        if (input.tagName === 'TEXTAREA') return 'textarea';
        
        const type = (input as HTMLInputElement).type?.toLowerCase();
        return type || 'text';
      }

      function detectVASSlider(container: Element): boolean {
        // Check if this question contains a VAS slider (SliderTrack class)
        const sliderTrack = container.querySelector('[class*="SliderTrack"]');
        return !!sliderTrack;
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

      function generateSliderSelector(sliderTrack: Element, index: number): string {
        if (sliderTrack.id) {
          try {
            return `#${CSS.escape(sliderTrack.id)}`;
          } catch (e) {
            return `[id="${sliderTrack.id}"]`;
          }
        }
        
        // Use class-based selector for SliderTrack
        const className = Array.from(sliderTrack.classList).find(cls => cls.includes('SliderTrack'));
        if (className) {
          return `[class*="${className}"]`;
        }
        
        return `[class*="SliderTrack"]:nth-of-type(${index + 1})`;
      }

      const rightPanel = document.querySelector(selector);
      if (!rightPanel) {
        return [];
      }

      // Find all CardBox question containers within the survey-body-container
      const cardBoxElements = rightPanel.querySelectorAll('[class*="CardBox"]');
      const fieldGroups: any[] = [];

      cardBoxElements.forEach((cardBox, index) => {
        // Extract question text and number from the CardBox
        const rawQuestionText = extractQuestionText(cardBox);
        const questionNumber = extractQuestionNumber(rawQuestionText);
        
        // Check if this is a VAS slider first
        const isVASSlider = detectVASSlider(cardBox);
        
        // Find all inputs within this CardBox
        const questionInputs = cardBox.querySelectorAll('input, select, textarea');
        const nonHiddenInputs = Array.from(questionInputs).filter(inp => (inp as HTMLInputElement).type !== 'hidden');
        
        // For VAS sliders, we might not have traditional inputs, so don't skip if it's a VAS slider
        if (nonHiddenInputs.length === 0 && !isVASSlider) return; // Skip if no visible inputs and not a VAS slider
        
        let inputType = 'text';
        let choices: string[] = [];
        let elementSelector = '';

        // Handle VAS slider
        if (isVASSlider) {
          inputType = 'VAS';
          const sliderTrack = cardBox.querySelector('[class*="SliderTrack"]');
          if (sliderTrack) {
            elementSelector = generateSliderSelector(sliderTrack, index);
          }
        } else if (nonHiddenInputs.length === 1) {
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

        // Clean the question text by removing number, choices, and handling required indicator
        const { cleanText, isRequired } = cleanQuestionText(rawQuestionText, choices);

        // Only add if we have meaningful question text or a question number
        if (cleanText.length > 3 || questionNumber.length > 0) {
          const cardBoxSelector = generateCardBoxSelector(cardBox, index, questionNumber);
          
          fieldGroups.push({
            questionNumber,
            questionText: cleanText,
            inputType,
            isRequired,
            choices: choices.length > 0 ? choices : undefined,
            selector: elementSelector,
            screenshotPath: '', // Will be filled when taking screenshots
            cardBoxSelector: cardBoxSelector
          });
        }
      });

      function generateCardBoxSelector(cardBox: Element, index: number, questionNumber: string): string {
        // Always scope selectors to within #survey-body-container
        const surveyContainer = document.querySelector('#survey-body-container');
        if (!surveyContainer) {
          throw new Error('survey-body-container not found');
        }
        
        // Check if cardBox has an ID - if so, use it but scoped to survey container
        if (cardBox.id) {
          try {
            return `#survey-body-container #${CSS.escape(cardBox.id)}`;
          } catch (e) {
            return `#survey-body-container [id="${cardBox.id}"]`;
          }
        }
        
        // Try to find existing identifying attributes within survey container
        for (const attr of ['data-testid', 'data-id', 'data-question', 'aria-label']) {
          const value = cardBox.getAttribute(attr);
          if (value) {
            return `#survey-body-container [${attr}="${value}"]`;
          }
        }
        
        // Calculate nth-of-type position among elements with CardBox class within the parent
        const parent = cardBox.parentElement;
        if (parent) {
          // Get all CardBox siblings (including the current element) of the same tag type
          const tagName = cardBox.tagName;
          const sameTypeSiblings = Array.from(parent.children).filter(el => 
            el.tagName === tagName && el.classList.toString().includes('CardBox')
          );
          const typePosition = sameTypeSiblings.indexOf(cardBox);
          
          if (typePosition >= 0) {
            // Use a more specific selector that includes the parent structure
            const parentSelector = parent === surveyContainer ? '#survey-body-container' : 
                                  parent.id ? `#${CSS.escape(parent.id)}` : 
                                  parent.className ? `.${parent.className.split(' ')[0]}` : '';
            
            if (parentSelector) {
              return `${parentSelector} > ${tagName.toLowerCase()}[class*="CardBox"]:nth-of-type(${typePosition + 1})`;
            }
          }
        }
        
        // Fallback: use position among all CardBox elements with a more specific query
        const allCardBoxes = surveyContainer.querySelectorAll('[class*="CardBox"]');
        const position = Array.from(allCardBoxes).indexOf(cardBox);
        if (position >= 0) {
          // Try to get a unique path based on the element's position in the DOM tree
          const path = [];
          let current = cardBox;
          
          while (current && current !== surveyContainer && current.parentElement) {
            const parent = current.parentElement;
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(current);
            
            if (current.classList.toString().includes('CardBox')) {
              // For CardBox elements, use the class selector
              path.unshift(`[class*="CardBox"]:nth-child(${index + 1})`);
              break;
            } else if (current.tagName) {
              // For other elements, use tag name
              path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index + 1})`);
            }
            
            current = parent;
          }
          
          if (path.length > 0) {
            return `#survey-body-container ${path.join(' > ')}`;
          }
        }
        
        // Very last fallback - use the question number if available
        if (questionNumber) {
          return `#survey-body-container [class*="CardBox"]:contains("${questionNumber}")`;
        }
        
        return `#survey-body-container [class*="CardBox"]`;
      }

      return fieldGroups;
    }, rightPanelSelector);

    logger.info(`Found ${fields.length} survey questions`);

    // Take individual screenshots for each field using new screenshot service
    logger.info(`Taking screenshots for ${fields.length} questions`);
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const screenshotPath = await screenshotService.takeQuestionScreenshot(page, field, i, tuple, formIndex);
      field.screenshotPath = screenshotPath || '';
    }

    // Generate test data for each field
    logger.info(`Generating test data for ${fields.length} questions`);
    for (const field of fields) {
      try {
        field.testData = testDataGenerator.generateTestData(field);
        logger.debug(`Generated ${field.testData.testCases.length} test cases for question ${field.questionNumber}`);
      } catch (error) {
        logger.error(`Failed to generate test data for question ${field.questionNumber}:`, error);
        // Continue processing other fields even if one fails
      }
    }

    const totalTestCases = fields.reduce((sum, field) => sum + (field.testData?.testCases.length || 0), 0);
    logger.info(`Generated ${totalTestCases} total test cases across all fields`);

    return fields;
  }

}