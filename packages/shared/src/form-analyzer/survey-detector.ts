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
    
    // Wait longer for any animations/rendering and dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if any content has been dynamically loaded
    const dynamicContent = await page.evaluate(() => {
      const container = document.querySelector('#survey-body-container');
      if (!container) return { hasSlider: false, sliderInfo: '' };
      
      // Look for any slider elements
      const sliderSelectors = [
        '[class*="SliderTrack"]',
        '[class*="slider"]',
        '[class*="Slider"]',
        '[class*="vas"]',
        '[class*="VAS"]',
        '[role="slider"]',
        'input[type="range"]',
        '.slider',
        '#slider'
      ];
      
      let foundSlider = false;
      let sliderInfo = '';
      
      for (const selector of sliderSelectors) {
        const elements = container.querySelectorAll(selector);
        if (elements.length > 0) {
          foundSlider = true;
          sliderInfo += `Found ${elements.length} elements with selector: ${selector}. `;
          // Get some info about the first element
          if (elements[0]) {
            const elem = elements[0] as HTMLElement;
            sliderInfo += `First element: tag=${elem.tagName}, class="${elem.className}", id="${elem.id}". `;
          }
        }
      }
      
      return { hasSlider: foundSlider, sliderInfo };
    });
    
    logger.info(`Dynamic content check: hasSlider=${dynamicContent.hasSlider}, info=${dynamicContent.sliderInfo}`);
    
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
              
              // Don't skip button text - it might contain important labels or asterisks
              // We'll handle button text removal later if needed
              
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
        
        // Check if question is required BEFORE removing choices
        // Look for asterisk at the end of the text OR after common patterns like "Check all that apply *"
        // Also check for asterisk in parentheses like "( MM/dd/yyyy )*"
        const isRequired = text.includes('*');
        
        // Remove choice values from the end of question text
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
        
        // For NRS fields, also clean up standalone numeric values but preserve asterisk
        if (text.includes('0') && text.includes('10')) {
          // This looks like an NRS scale, remove standalone numbers but keep asterisk
          // Be careful not to remove asterisk that might be near numbers
          cleanText = cleanText.replace(/\b(\d+)\b(?!\s*\*)/g, '').replace(/\s+/g, ' ').trim();
        }
        
        // Remove any remaining asterisks from the cleaned text
        cleanText = cleanText.replace(/\s*\*\s*/g, ' ').trim();
        
        return { cleanText: cleanText.trim(), isRequired };
      }

      function getInputType(input: Element): string {
        if (input.tagName === 'SELECT') return 'dropdown';
        if (input.tagName === 'TEXTAREA') return 'textarea';
        
        // Check for custom implementations
        if (input.tagName === 'INPUT') {
          const inputEl = input as HTMLInputElement;
          
          // Check for date field indicators
          // Check for date patterns in various attributes
          const placeholder = inputEl.placeholder?.toLowerCase() || '';
          const value = inputEl.value?.toLowerCase() || '';
          const id = inputEl.id?.toLowerCase() || '';
          const className = inputEl.className?.toLowerCase() || '';
          const ariaLabel = inputEl.getAttribute('aria-label')?.toLowerCase() || '';
          const name = inputEl.name?.toLowerCase() || '';
          
          // Date field indicators - check even if not readonly as some date pickers work on regular text inputs
          if (placeholder.includes('date') || placeholder.includes('dd/mm/yyyy') || 
              placeholder.includes('mm/dd/yyyy') || placeholder.includes('yyyy-mm-dd') ||
              placeholder.includes('dd-mm-yyyy') ||
              value.includes('date') || 
              id.includes('date') || 
              name.includes('date') ||
              className.includes('date') || className.includes('datepicker') ||
              ariaLabel.includes('date')) {
            return 'date';
          }
          
          // Additional check for readonly inputs that might be other custom widgets
          if (inputEl.readOnly || inputEl.getAttribute('readonly') === 'true') {
            // Could be a date picker even without explicit date indicators
            if (placeholder.includes('/') || placeholder.includes('-')) {
              return 'date';
            }
          }
          
          // Check if ID contains "Dropdown" indicating a custom dropdown
          if (input.id && input.id.toLowerCase().includes('dropdown')) {
            return 'dropdown';
          }
          
          // Check for common dropdown indicators in placeholder or value
          if (inputEl.placeholder?.toLowerCase().includes('select') || 
              inputEl.value?.toLowerCase() === 'select...') {
            return 'dropdown';
          }
          
          // Check for dropdown-related class names
          const classNames = input.className?.toLowerCase() || '';
          if (classNames.includes('dropdown') || classNames.includes('select')) {
            return 'dropdown';
          }
          
          // Check for autocomplete dropdown indicators (case-insensitive)
          const hasAutocomplete = inputEl.hasAttribute('aria-autocomplete') || 
                                 inputEl.getAttribute('autocomplete') === 'off' ||
                                 inputEl.hasAttribute('list') ||
                                 classNames.includes('autocomplete') ||
                                 classNames.includes('typeahead') ||
                                 placeholder.toLowerCase().includes('type to search') ||
                                 placeholder.includes('search') ||
                                 value.toLowerCase().includes('type to search');
          
          // Check if this might be a weight field with autocomplete
          const isWeightField = placeholder.includes('weight') || 
                               placeholder.includes('kg') || 
                               placeholder.includes('lbs') ||
                               placeholder.includes('pounds') ||
                               ariaLabel.includes('weight') ||
                               name.includes('weight') ||
                               id.includes('weight');
          
          if (hasAutocomplete || isWeightField) {
            return 'autocomplete_dropdown';
          }
        }
        
        const type = (input as HTMLInputElement).type?.toLowerCase();
        return type || 'text';
      }

      function detectVASSlider(container: Element): boolean {
        // Check if this question contains a VAS slider (SliderTrack class)
        const sliderTrack = container.querySelector('[class*="SliderTrack"]');
        return !!sliderTrack;
      }

      function detectNRS(container: Element): boolean {
        // Check if this question contains an NRS (Numeric Rating Scale)
        // Look for multiple buttons with numeric labels (0-10, 0-11, etc.)
        const buttons = container.querySelectorAll('button');
        if (buttons.length < 2 || buttons.length > 12) return false;
        
        // Check if buttons have numeric labels
        let numericCount = 0;
        buttons.forEach(button => {
          const text = button.textContent?.trim() || '';
          if (/^\d+$/.test(text)) {
            numericCount++;
          }
        });
        
        // If most buttons are numeric, it's likely an NRS
        return numericCount >= buttons.length * 0.8;
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

      function generateNRSSelector(button: Element, index: number): string {
        if (button.id) {
          try {
            return `#${CSS.escape(button.id)}`;
          } catch (e) {
            return `[id="${button.id}"]`;
          }
        }
        
        // Get the button text to use in selector
        const buttonText = button.textContent?.trim() || '';
        if (/^\d+$/.test(buttonText)) {
          // If it's a numeric button, use the number in the selector
          return `button:contains("${buttonText}")`;
        }
        
        // Fallback to nth-of-type
        return `button:nth-of-type(${index + 1})`;
      }

      const rightPanel = document.querySelector(selector);
      if (!rightPanel) {
        return [];
      }

      // Find all CardBox question containers within the survey-body-container
      const cardBoxElements = rightPanel.querySelectorAll('[class*="CardBox"]');
      const fieldGroups: any[] = [];

      // Also check for standalone VAS sliders that might not be in CardBox
      const standaloneSliders = rightPanel.querySelectorAll('[class*="SliderTrack"]');
      console.log(`Found ${standaloneSliders.length} SliderTrack elements in form`);
      
      // Also try alternative selectors for VAS sliders
      const alternativeSliders = rightPanel.querySelectorAll('[class*="slider"], [class*="Slider"], [class*="vas"], [class*="VAS"], [role="slider"]');
      console.log(`Found ${alternativeSliders.length} alternative slider elements`);
      
      const sliderParents = new Set();
      standaloneSliders.forEach(slider => {
        // Find the nearest container that's not already a CardBox
        let parent = slider.parentElement;
        while (parent && parent !== rightPanel) {
          if (parent.className && parent.className.includes('CardBox')) {
            // This slider is already inside a CardBox, will be handled below
            break;
          }
          parent = parent.parentElement;
        }
        if (parent && parent !== rightPanel && !parent.className?.includes('CardBox')) {
          sliderParents.add(slider.parentElement);
        }
      });

      // Process CardBox elements first
      console.log(`Found ${cardBoxElements.length} CardBox elements`);
      cardBoxElements.forEach((cardBox, index) => {
        // Extract question text and number from the CardBox
        const rawQuestionText = extractQuestionText(cardBox);
        const questionNumber = extractQuestionNumber(rawQuestionText);
        
        console.log(`CardBox ${index}: questionNumber="${questionNumber}", text="${rawQuestionText.substring(0, 50)}..."`);
        
        // Check if this is a VAS slider or NRS first
        const isVASSlider = detectVASSlider(cardBox);
        const isNRS = detectNRS(cardBox);
        console.log(`CardBox ${index}: isVASSlider=${isVASSlider}, isNRS=${isNRS}`);
        
        // Find all inputs within this CardBox
        const questionInputs = cardBox.querySelectorAll('input, select, textarea');
        const nonHiddenInputs = Array.from(questionInputs).filter(inp => (inp as HTMLInputElement).type !== 'hidden');
        
        // For VAS sliders or NRS, we might not have traditional inputs, so don't skip
        if (nonHiddenInputs.length === 0 && !isVASSlider && !isNRS) return; // Skip if no visible inputs and not a special component
        
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
        } else if (isNRS) {
          // Handle NRS (Numeric Rating Scale)
          inputType = 'NRS';
          const buttons = cardBox.querySelectorAll('button');
          choices = [];
          
          // Collect numeric button values
          buttons.forEach(button => {
            const text = button.textContent?.trim() || '';
            if (/^\d+$/.test(text)) {
              choices.push(text);
            }
          });
          
          // Sort choices numerically
          choices.sort((a, b) => parseInt(a) - parseInt(b));
          
          // Use the first button as selector base
          if (buttons.length > 0) {
            elementSelector = generateNRSSelector(buttons[0], index);
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
        // For NRS fields, don't pass choices to cleanQuestionText to preserve asterisk detection
        const { cleanText, isRequired } = cleanQuestionText(rawQuestionText, inputType === 'NRS' ? [] : choices);

        // Only add if we have meaningful question text or a question number
        if (cleanText.length > 3 || questionNumber.length > 0) {
          // Additional check: if detected as text but question suggests date field
          if (inputType === 'text' && nonHiddenInputs.length > 0) {
            const questionLower = cleanText.toLowerCase();
            const rawTextLower = rawQuestionText.toLowerCase();
            const firstInput = nonHiddenInputs[0] as HTMLInputElement;
            
            // Check if this is likely a date field based on question text and input properties
            // Also check the raw text for date format patterns
            if ((questionLower.includes('date') || 
                 questionLower.includes('when') || 
                 questionLower.includes('birthday') || 
                 questionLower.includes('birth') ||
                 questionLower.includes('dob') ||
                 rawTextLower.includes('mm/dd/yyyy') ||
                 rawTextLower.includes('dd/mm/yyyy') ||
                 rawTextLower.includes('yyyy-mm-dd')) ||
                (firstInput.readOnly || 
                 firstInput.getAttribute('readonly') === 'true' ||
                 firstInput.placeholder?.toLowerCase().includes('date') ||
                 firstInput.placeholder?.includes('dd') ||
                 firstInput.placeholder?.includes('mm') ||
                 firstInput.placeholder?.includes('yyyy'))) {
              inputType = 'date';
            }
            
            // Check if this is likely a weight field with autocomplete based on question text
            if (questionLower.includes('weight') || 
                questionLower.includes('weigh') ||
                rawTextLower.includes('kg') ||
                rawTextLower.includes('lbs') ||
                rawTextLower.includes('pounds')) {
              inputType = 'autocomplete_dropdown';
            }
          }
          
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

      // Process standalone VAS sliders (not in CardBox)
      // Check both original sliders and alternative selectors
      const allSliders = [...standaloneSliders, ...alternativeSliders];
      const uniqueSliders = Array.from(new Set(allSliders)); // Remove duplicates
      
      if (uniqueSliders.length > 0 && fieldGroups.length === 0) {
        console.log(`Processing ${uniqueSliders.length} potential VAS sliders`);
        // Check if there's a standalone VAS slider on this form
        uniqueSliders.forEach((slider, index) => {
          // Find the CardBox container for this slider
          let cardBoxContainer = slider.parentElement;
          while (cardBoxContainer && cardBoxContainer !== rightPanel) {
            if (cardBoxContainer.className && cardBoxContainer.className.includes('CardBox')) {
              break;
            }
            cardBoxContainer = cardBoxContainer.parentElement;
          }
          
          // If no CardBox found, use the direct container with text content
          let container = cardBoxContainer;
          if (!container || container === rightPanel || !container.className?.includes('CardBox')) {
            container = slider.parentElement;
            while (container && !container.textContent?.trim() && container !== rightPanel) {
              container = container.parentElement;
            }
          }
          
          if (container && container !== rightPanel) {
            // Extract any question text near the slider
            const questionText = extractQuestionText(container);
            const questionNumber = extractQuestionNumber(questionText) || '';
            
            // Clean the question text
            const { cleanText, isRequired } = cleanQuestionText(questionText, []);
            
            // Generate selector for the slider
            const sliderSelector = generateSliderSelector(slider, index);
            
            // Generate CardBox selector - prioritize CardBox if found
            let cardBoxSelector = '';
            if (cardBoxContainer && cardBoxContainer !== rightPanel && cardBoxContainer.className?.includes('CardBox')) {
              cardBoxSelector = generateCardBoxSelector(cardBoxContainer, index, questionNumber);
            } else {
              // Fallback to container selector if no CardBox found
              if (container.id) {
                cardBoxSelector = `#survey-body-container #${CSS.escape(container.id)}`;
              } else if (container.className) {
                const className = container.className.split(' ')[0];
                cardBoxSelector = `#survey-body-container .${className}`;
              } else {
                cardBoxSelector = `#survey-body-container > *:nth-child(${Array.from(rightPanel.children).indexOf(container) + 1})`;
              }
            }
            
            fieldGroups.push({
              questionNumber: questionNumber || 'VAS',
              questionText: cleanText || 'Visual Analog Scale',
              inputType: 'VAS',
              isRequired: isRequired || true, // VAS sliders are typically required
              choices: undefined,
              selector: sliderSelector,
              screenshotPath: '',
              cardBoxSelector: cardBoxSelector
            });
          }
        });
      }

      return fieldGroups;
    }, rightPanelSelector);

    if (fields.length === 0) {
      logger.info('No survey questions found - this appears to be an informational form');
    } else {
      logger.info(`Found ${fields.length} survey questions`);
    }

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