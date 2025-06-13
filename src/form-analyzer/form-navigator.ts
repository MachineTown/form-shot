import { Page } from 'puppeteer';
import { NavigationButton, SurveyField } from '../utils/types';
import { logger } from '../utils/logger';

export class FormNavigator {
  
  async detectNavigationButtons(page: Page): Promise<NavigationButton[]> {
    return await page.evaluate(() => {
      // Navigation buttons are after survey-body-container
      const surveyBodyContainer = document.querySelector('#survey-body-container');
      if (!surveyBodyContainer) {
        return [];
      }
      
      // Look for navigation area after the survey body
      const navigationArea = surveyBodyContainer.nextElementSibling;
      if (!navigationArea) {
        return [];
      }
      
      const buttons: NavigationButton[] = [];
      const buttonElements = navigationArea.querySelectorAll('button');
      
      buttonElements.forEach((button) => {
        const text = button.textContent?.trim() || '';
        const isEnabled = !button.disabled;
        
        let type: 'next' | 'previous' | 'finish' | undefined;
        
        // Detect button type based on text content
        if (text.toLowerCase().includes('next') || text.includes('→')) {
          type = 'next';
        } else if (text.toLowerCase().includes('prev') || text.toLowerCase().includes('back') || text.includes('←')) {
          type = 'previous';
        } else if (text.toLowerCase().includes('finish') || text.toLowerCase().includes('submit')) {
          type = 'finish';
        }
        
        if (type) {
          // Generate selector for the button
          let selector = '';
          if (button.id) {
            selector = `#${CSS.escape(button.id)}`;
          } else if (button.className) {
            selector = `button.${button.className.split(' ').join('.')}`;
          } else {
            // Use index-based selector within navigation area
            const allButtons = Array.from(navigationArea.querySelectorAll('button'));
            const index = allButtons.indexOf(button);
            selector = `#survey-body-container + div button:nth-of-type(${index + 1})`;
          }
          
          buttons.push({
            type,
            text,
            selector,
            isEnabled
          });
        }
      });
      
      return buttons;
    });
  }
  
  async fillRequiredFields(page: Page, fields: SurveyField[]): Promise<SurveyField[]> {
    // This will return all fields including newly discovered conditional ones
    const allFields: SurveyField[] = [...fields];
    const filledQuestions = new Set<string>();
    
    // Get initial state of visible questions
    const initialQuestions = await this.getVisibleQuestions(page);
    logger.info(`Initial visible questions: ${initialQuestions.join(', ')}`);
    
    // Process fields in order, checking for new conditional fields after each one
    let fieldIndex = 0;
    while (fieldIndex < allFields.length) {
      const field = allFields[fieldIndex];
      
      // Skip if already filled
      if (filledQuestions.has(field.questionNumber)) {
        fieldIndex++;
        continue;
      }
      
      // Check if field is required or VAS (VAS needs interaction even if not required)
      if (!field.isRequired && field.inputType !== 'VAS') {
        fieldIndex++;
        continue;
      }
      
      try {
        // Record state before filling
        const questionsBefore = await this.getVisibleQuestions(page);
        
        // Fill the field
        logger.info(`Filling field ${field.questionNumber} (${field.inputType})`);
        const filledValue = await this.fillFieldAndGetValue(page, field);
        filledQuestions.add(field.questionNumber);
        
        // Wait for any conditional fields to appear
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check for new questions that appeared
        const questionsAfter = await this.getVisibleQuestions(page);
        const newQuestions = questionsAfter.filter(q => !questionsBefore.includes(q));
        
        if (newQuestions.length > 0) {
          logger.info(`New conditional questions appeared after filling ${field.questionNumber}: ${newQuestions.join(', ')}`);
          
          // Scan and add new conditional fields
          const conditionalFields = await this.scanConditionalFields(page, newQuestions, field.questionNumber, filledValue);
          
          // Insert conditional fields right after the current field
          for (let i = 0; i < conditionalFields.length; i++) {
            allFields.splice(fieldIndex + 1 + i, 0, conditionalFields[i]);
          }
          
          logger.info(`Added ${conditionalFields.length} conditional fields to processing queue`);
        }
        
        fieldIndex++;
      } catch (error) {
        logger.error(`Failed to fill field ${field.questionNumber}:`, error);
        throw error;
      }
    }
    
    logger.info(`Completed filling ${filledQuestions.size} fields (including ${allFields.length - fields.length} conditional fields)`);
    return allFields;
  }
  
  private async getVisibleQuestions(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
      const container = document.querySelector('#survey-body-container');
      if (!container) return [];
      
      const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
      const visibleQuestions: string[] = [];
      
      cardBoxes.forEach((cardBox) => {
        // Check if visible
        const style = window.getComputedStyle(cardBox);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return;
        }
        
        // Find question number
        const textElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
        for (const elem of textElements) {
          const text = elem.textContent?.trim() || '';
          const match = text.match(/^(\d+\.?\d*\.?)/);
          if (match) {
            visibleQuestions.push(match[1]);
            break;
          }
        }
      });
      
      return visibleQuestions;
    });
  }

  private async fillFieldAndGetValue(page: Page, field: SurveyField): Promise<string | number> {
    // Fill the field and return the actual value that was set
    const testValue = field.testData?.testCases[0]?.value || 0;
    
    await this.fillField(page, field);
    
    // For radio buttons, return the index that was selected
    if (field.inputType === 'radio') {
      return typeof testValue === 'number' ? testValue : 0;
    }
    
    // For other types, return the string value
    return String(testValue);
  }

  private async scanConditionalFields(page: Page, newQuestionNumbers: string[], parentQuestion: string, parentValue: string | number): Promise<SurveyField[]> {
    logger.info(`Scanning ${newQuestionNumbers.length} conditional fields that appeared after ${parentQuestion} = ${parentValue}`);
    
    // Import necessary services
    const { TestDataGenerator } = await import('../test-generator/test-data-generator');
    const testGenerator = new TestDataGenerator();
    
    const conditionalFields: SurveyField[] = [];
    
    for (const questionNumber of newQuestionNumbers) {
      try {
        const fieldData = await page.evaluate((qNum) => {
          const container = document.querySelector('#survey-body-container');
          if (!container) return null;
          
          // Find the CardBox with this question number
          const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
          for (const cardBox of cardBoxes) {
            const textElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
            let foundQuestion = false;
            let questionText = '';
            let isRequired = false;
            
            for (const elem of textElements) {
              const text = elem.textContent?.trim() || '';
              const match = text.match(/^(\d+\.?\d*\.?)\s*(.*)/);
              if (match && match[1] === qNum) {
                foundQuestion = true;
                questionText = text;
                isRequired = text.endsWith('*');
                break;
              }
            }
            
            if (!foundQuestion) continue;
            
            // Extract field information
            const inputs = cardBox.querySelectorAll('input, select, textarea');
            if (inputs.length === 0) continue;
            
            const firstInput = inputs[0];
            let inputType = 'text';
            let selector = '';
            const choices: string[] = [];
            
            if (firstInput.tagName === 'SELECT') {
              inputType = 'dropdown';
              selector = `#${firstInput.id}`;
              const options = firstInput.querySelectorAll('option');
              options.forEach(opt => {
                if (opt.textContent?.trim()) {
                  choices.push(opt.textContent.trim());
                }
              });
            } else if (firstInput.tagName === 'TEXTAREA') {
              inputType = 'textarea';
              selector = `#${firstInput.id}`;
            } else if ((firstInput as HTMLInputElement).type === 'radio') {
              inputType = 'radio';
              selector = `#${firstInput.id}`;
              // Get all radio choices
              const radioName = (firstInput as HTMLInputElement).name;
              const radios = cardBox.querySelectorAll(`input[type="radio"][name="${radioName}"]`);
              radios.forEach(radio => {
                const label = radio.parentElement?.textContent?.trim() || 
                            radio.nextSibling?.textContent?.trim() || '';
                if (label) choices.push(label);
              });
            } else {
              inputType = (firstInput as HTMLInputElement).type || 'text';
              selector = `#${firstInput.id}`;
            }
            
            // Check for VAS slider
            if (cardBox.querySelector('[class*="SliderTrack"]')) {
              inputType = 'VAS';
              selector = '[class*="SliderTrack"]';
            }
            
            // Generate CardBox selector
            let cardBoxSelector = '';
            if (cardBox.id) {
              cardBoxSelector = `#${cardBox.id}`;
            } else if (cardBox.className) {
              cardBoxSelector = `.${cardBox.className.split(' ').join('.')}`;
            }
            
            return {
              questionNumber: qNum,
              questionText: questionText.replace(/^\d+\.?\d*\.?\s*/, '').replace(/\*\s*$/, '').trim(),
              inputType,
              isRequired,
              selector,
              cardBoxSelector,
              choices
            };
          }
          
          return null;
        }, questionNumber);
        
        if (fieldData) {
          // Generate test data
          const testData = await testGenerator.generateTestData({
            ...fieldData,
            inputType: fieldData.inputType as any,
            screenshotPath: '' // Will be set later
          });
          
          // Create the conditional field
          const conditionalField: SurveyField = {
            ...fieldData,
            inputType: fieldData.inputType as any,
            screenshotPath: '', // Will be set when screenshot is taken
            testData,
            conditionalInfo: {
              isConditional: true,
              parentQuestion,
              parentValue,
              appearedAfter: new Date().toISOString()
            }
          };
          
          conditionalFields.push(conditionalField);
          logger.info(`Scanned conditional field ${questionNumber}: ${fieldData.questionText} (${fieldData.inputType})`);
        }
      } catch (error) {
        logger.error(`Error scanning conditional field ${questionNumber}:`, error);
      }
    }
    
    return conditionalFields;
  }

  private async fillField(page: Page, field: SurveyField): Promise<void> {
    logger.info(`Filling field ${field.questionNumber} (${field.inputType}) with selector: ${field.selector}`);
    
    // Get the first test case value
    const testValue = field.testData?.testCases[0]?.value;
    if (!testValue) {
      logger.warn(`No test data available for field ${field.questionNumber}`);
      return;
    }
    
    logger.info(`Using test value: ${testValue}`);
    
    switch (field.inputType) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
        await page.type(field.selector, String(testValue));
        break;
        
      case 'textarea':
        await page.type(field.selector, String(testValue));
        break;
        
      case 'radio':
        // For radio buttons, we need to find the radio group and select by index
        const radioIndex = typeof testValue === 'number' ? testValue : 0;
        
        // Try multiple approaches to select radio buttons
        let radioSelected = false;
        
        // Approach 1: Try to use the cardBoxSelector to find all radios in the question
        if (field.cardBoxSelector && !radioSelected) {
          try {
            const radioButtons = await page.$$(`${field.cardBoxSelector} input[type="radio"]`);
            if (radioButtons.length > radioIndex) {
              await radioButtons[radioIndex].click();
              radioSelected = true;
              logger.info(`Selected radio button ${radioIndex} using cardBox selector`);
            }
          } catch (error) {
            logger.debug(`CardBox radio selection failed: ${error}`);
          }
        }
        
        // Approach 2: Try to find radio by name attribute from the main selector
        if (!radioSelected) {
          try {
            // Extract name from the selector or try to find the input element first
            const firstRadio = await page.$(field.selector);
            if (firstRadio) {
              const radioName = await firstRadio.evaluate(el => (el as HTMLInputElement).name);
              if (radioName) {
                const radioButtons = await page.$$(`input[type="radio"][name="${radioName}"]`);
                if (radioButtons.length > radioIndex) {
                  await radioButtons[radioIndex].click();
                  radioSelected = true;
                  logger.info(`Selected radio button ${radioIndex} using name attribute: ${radioName}`);
                }
              }
            }
          } catch (error) {
            logger.debug(`Name-based radio selection failed: ${error}`);
          }
        }
        
        // Approach 3: Fallback - try to click the specific selector directly
        if (!radioSelected) {
          try {
            await page.click(field.selector);
            radioSelected = true;
            logger.info(`Selected radio button using direct selector`);
          } catch (error) {
            logger.debug(`Direct radio selection failed: ${error}`);
          }
        }
        
        if (!radioSelected) {
          throw new Error(`Failed to select radio button for field ${field.questionNumber}`);
        }
        break;
        
      case 'VAS':
        // For VAS sliders, click at the middle position
        try {
          // Try multiple selector strategies for VAS sliders
          let sliderTrack = null;
          let usedSelector = '';
          
          // Strategy 1: Use the field's direct selector
          if (field.selector) {
            try {
              sliderTrack = await page.$(field.selector);
              if (sliderTrack) {
                usedSelector = field.selector;
                logger.info(`Found VAS slider using direct selector: ${field.selector}`);
              }
            } catch (error) {
              logger.debug(`Direct selector failed: ${error}`);
            }
          }
          
          // Strategy 2: Use cardBox + SliderTrack
          if (!sliderTrack && field.cardBoxSelector) {
            try {
              const cardBoxSelector = `${field.cardBoxSelector} [class*="SliderTrack"]`;
              sliderTrack = await page.$(cardBoxSelector);
              if (sliderTrack) {
                usedSelector = cardBoxSelector;
                logger.info(`Found VAS slider using cardBox selector: ${cardBoxSelector}`);
              }
            } catch (error) {
              logger.debug(`CardBox selector failed: ${error}`);
            }
          }
          
          // Strategy 3: General SliderTrack search
          if (!sliderTrack) {
            try {
              sliderTrack = await page.$('[class*="SliderTrack"]');
              if (sliderTrack) {
                usedSelector = '[class*="SliderTrack"]';
                logger.info(`Found VAS slider using general SliderTrack selector`);
              }
            } catch (error) {
              logger.debug(`General SliderTrack selector failed: ${error}`);
            }
          }
          
          if (sliderTrack) {
            const boundingBox = await sliderTrack.boundingBox();
            if (boundingBox) {
              // Click at the middle of the slider  
              const clickX = boundingBox.x + boundingBox.width / 2;
              const clickY = boundingBox.y + boundingBox.height / 2;
              
              logger.info(`Clicking VAS slider at (${Math.round(clickX)}, ${Math.round(clickY)}) using selector: ${usedSelector}`);
              await page.mouse.click(clickX, clickY);
              
              // Wait a bit for the slider to respond
              await new Promise(resolve => setTimeout(resolve, 500));
              
              logger.info(`Successfully clicked VAS slider for field ${field.questionNumber}`);
            } else {
              logger.error(`Could not get bounding box for VAS slider`);
            }
          } else {
            logger.error(`Could not find VAS slider element for field ${field.questionNumber}`);
          }
        } catch (error) {
          logger.error(`Failed to click VAS slider for field ${field.questionNumber}:`, error);
        }
        break;
        
      case 'dropdown':
        // For dropdowns, select by index
        const dropdownIndex = typeof testValue === 'number' ? testValue : 0;
        await page.select(field.selector, field.choices?.[dropdownIndex] || '');
        break;
        
      case 'checkbox':
        // For checkboxes, click if test value is truthy
        if (testValue) {
          await page.click(field.selector);
        }
        break;
        
      default:
        logger.warn(`Unknown input type: ${field.inputType}`);
    }
    
    // Move focus away to trigger validation
    await page.evaluate(() => {
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && activeElement.blur) {
        activeElement.blur();
      }
    });
  }
  
  async detectValidationModal(page: Page): Promise<boolean> {
    try {
      // Common modal selectors
      const modalSelectors = [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '.modal',
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="alert"]'
      ];
      
      for (const selector of modalSelectors) {
        const modal = await page.$(selector);
        if (modal) {
          const isVisible = await page.evaluate((el) => {
            const element = el as HTMLElement;
            return element.offsetWidth > 0 && element.offsetHeight > 0;
          }, modal);
          
          if (isVisible) {
            logger.debug(`Validation modal detected with selector: ${selector}`);
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      logger.error('Error detecting validation modal:', error);
      return false;
    }
  }
  
  async closeValidationModal(page: Page): Promise<void> {
    // Try common close button selectors
    const closeSelectors = [
      'button[aria-label*="close"]',
      'button[aria-label*="Close"]',
      'button.close',
      '[class*="close-button"]',
      'button:contains("OK")',
      'button:contains("Close")'
    ];
    
    for (const selector of closeSelectors) {
      try {
        const closeButton = await page.$(selector);
        if (closeButton) {
          await closeButton.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          return;
        }
      } catch (error) {
        // Continue trying other selectors
      }
    }
    
    // If no close button found, try pressing Escape
    await page.keyboard.press('Escape');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  async clickNavigationButton(page: Page, type: 'next' | 'previous' | 'finish', navDelay: number = 3000): Promise<void> {
    const buttons = await this.detectNavigationButtons(page);
    const button = buttons.find(b => b.type === type && b.isEnabled);
    
    if (!button) {
      throw new Error(`No enabled ${type} button found`);
    }
    
    // Add configurable pause before clicking navigation button
    logger.info(`Pausing ${navDelay / 1000} seconds before clicking ${type} button: "${button.text}"`);
    await new Promise(resolve => setTimeout(resolve, navDelay));
    
    logger.info(`Clicking ${type} button: "${button.text}"`);
    
    // Use Promise.all to wait for navigation while clicking the button
    const waitOptions = { 
      waitUntil: 'networkidle2' as const, 
      timeout: 10000 
    };
    
    try {
      // Method 1: Try using Puppeteer's click with waitForNavigation
      const [response] = await Promise.all([
        page.waitForNavigation(waitOptions),
        page.click(button.selector)
      ]);
      
      logger.debug(`Navigation completed with response status: ${response?.status() || 'unknown'}`);
    } catch (error) {
      logger.debug(`Failed to click with selector ${button.selector} or no navigation occurred, trying fallback method`);
      
      // Method 2: Click using evaluate to handle dynamic selectors
      try {
        const [response] = await Promise.all([
          page.waitForNavigation(waitOptions),
          page.evaluate((text, type) => {
            // Find navigation area
            const surveyBody = document.querySelector('#survey-body-container');
            const navigationArea = surveyBody?.nextElementSibling;
            
            if (!navigationArea) {
              throw new Error('Navigation area not found');
            }
            
            // Find button by text content
            const buttons = Array.from(navigationArea.querySelectorAll('button'));
            const button = buttons.find(b => {
              const btnText = b.textContent?.trim().toLowerCase() || '';
              return btnText === text.toLowerCase() || 
                     (type === 'next' && (btnText.includes('next') || btnText.includes('→'))) ||
                     (type === 'previous' && (btnText.includes('prev') || btnText.includes('back') || btnText.includes('←'))) ||
                     (type === 'finish' && (btnText.includes('finish') || btnText.includes('submit')));
            });
            
            if (button && !button.disabled) {
              button.click();
            } else {
              throw new Error(`${type} button not found or disabled`);
            }
          }, button.text, type)
        ]);
        
        logger.debug(`Fallback navigation completed with response status: ${response?.status() || 'unknown'}`);
      } catch (fallbackError) {
        logger.warn(`No navigation occurred after clicking ${type} button. This might indicate a validation error or single-form survey.`);
        // Don't throw error - let the caller handle this case
      }
    }
  }
  
  async fillMissingRequiredFields(page: Page): Promise<void> {
    try {
      logger.info('Scanning for missing required fields (likely conditional fields)...');
      
      // Find all visible required fields that aren't filled
      const missingFields = await page.evaluate(() => {
        const container = document.querySelector('#survey-body-container');
        if (!container) return [];
        
        const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
        const missingRequired: Array<{questionNumber: string, selector: string, inputType: string}> = [];
        
        cardBoxes.forEach((cardBox) => {
          // Skip if hidden
          const style = window.getComputedStyle(cardBox);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return;
          }
          
          // Look for question number and check if required
          let questionNumber = '';
          let isRequired = false;
          let questionText = '';
          
          const textElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
          for (const elem of textElements) {
            const text = elem.textContent?.trim() || '';
            const match = text.match(/^(\d+\.?\d*\.?)\s*(.*)/);
            if (match) {
              questionNumber = match[1];
              questionText = match[2];
              // Check if the question text ends with *
              isRequired = text.endsWith('*');
              break;
            }
          }
          
          if (questionNumber && isRequired) {
            // Check if this field has a value
            const inputs = cardBox.querySelectorAll('input, select, textarea');
            let hasValue = false;
            let inputType = 'unknown';
            let selector = '';
            
            for (const input of inputs) {
              if (input.tagName === 'SELECT') {
                const selectEl = input as HTMLSelectElement;
                hasValue = selectEl.selectedIndex > 0;
                inputType = 'dropdown';
                selector = `#${input.id || ''}`;
              } else if (input.tagName === 'TEXTAREA') {
                hasValue = (input as HTMLTextAreaElement).value.trim().length > 0;
                inputType = 'textarea';
                selector = `#${input.id || ''}`;
              } else if ((input as HTMLInputElement).type === 'radio') {
                const radioGroup = cardBox.querySelectorAll(`input[type="radio"][name="${(input as HTMLInputElement).name}"]`);
                hasValue = Array.from(radioGroup).some(r => (r as HTMLInputElement).checked);
                inputType = 'radio';
                if (!hasValue && input.id) {
                  selector = `#${input.id}`;
                }
              } else if ((input as HTMLInputElement).type === 'text' || (input as HTMLInputElement).type === 'email' || (input as HTMLInputElement).type === 'number') {
                hasValue = (input as HTMLInputElement).value.trim().length > 0;
                inputType = (input as HTMLInputElement).type;
                selector = `#${input.id || ''}`;
              }
              
              if (!hasValue && selector) {
                break; // Found an unfilled input
              }
            }
            
            if (!hasValue && selector) {
              missingRequired.push({
                questionNumber,
                selector,
                inputType
              });
            }
          }
        });
        
        return missingRequired;
      });
      
      if (missingFields.length > 0) {
        logger.info(`Found ${missingFields.length} missing required fields: ${missingFields.map(f => f.questionNumber).join(', ')}`);
        
        // Fill each missing field
        for (const missingField of missingFields) {
          try {
            logger.info(`Filling missing field ${missingField.questionNumber} (${missingField.inputType})`);
            
            // Create a minimal SurveyField object for filling
            const field: Partial<SurveyField> = {
              questionNumber: missingField.questionNumber,
              selector: missingField.selector,
              inputType: missingField.inputType as any,
              testData: {
                detectedType: 'unknown',
                confidence: 0.5,
                detectionMethod: 'fallback',
                generatedAt: new Date().toISOString(),
                testCases: [{
                  id: 'emergency_fill',
                  type: 'valid',
                  value: missingField.inputType === 'radio' ? 0 : 'Test response',
                  description: 'Emergency fill for conditional field',
                  source: 'generated',
                  status: 'draft',
                  provenance: {
                    createdBy: 'system',
                    createdAt: new Date().toISOString(),
                    generator: {
                      algorithm: 'conditional_field_filler',
                      version: '1.0.0',
                      template: 'emergency_fill',
                      confidence: 0.5
                    },
                    modifications: []
                  },
                  quality: {
                    confidence: 0.5,
                    reviewCount: 0
                  }
                }],
                summary: {
                  totalTestCases: 1,
                  generatedCount: 1,
                  humanCount: 0,
                  hybridCount: 0,
                  approvedCount: 0,
                  pendingReviewCount: 1
                }
              }
            };
            
            await this.fillField(page, field as SurveyField);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            logger.error(`Failed to fill missing field ${missingField.questionNumber}:`, error);
          }
        }
      } else {
        logger.info('No missing required fields found');
      }
    } catch (error) {
      logger.error('Error filling missing required fields:', error);
    }
  }

  private async checkForNewFields(page: Page, knownQuestionNumbers: Set<string>): Promise<string[]> {
    try {
      const newQuestionNumbers = await page.evaluate(() => {
        const container = document.querySelector('#survey-body-container');
        if (!container) return [];
        
        const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
        const questionNumbers: string[] = [];
        
        cardBoxes.forEach((cardBox) => {
          // Skip if hidden
          const style = window.getComputedStyle(cardBox);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return;
          }
          
          // Look for question number
          const questionElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
          for (const elem of questionElements) {
            const text = elem.textContent?.trim() || '';
            const match = text.match(/^(\d+\.?\d*\.?)/);
            if (match) {
              questionNumbers.push(match[1]);
              break;
            }
          }
        });
        
        return questionNumbers;
      });
      
      // Filter out known question numbers
      const newFields = newQuestionNumbers.filter(qNum => !knownQuestionNumbers.has(qNum));
      return newFields;
    } catch (error) {
      logger.error('Error checking for new fields:', error);
      return [];
    }
  }

  private async scanForNewRequiredFields(page: Page, filledQuestions: Set<string>, knownQuestionNumbers: Set<string>): Promise<string[]> {
    try {
      const requiredFields = await page.evaluate(() => {
        const container = document.querySelector('#survey-body-container');
        if (!container) return [];
        
        const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
        const requiredQuestions: string[] = [];
        
        cardBoxes.forEach((cardBox) => {
          // Skip if hidden
          const style = window.getComputedStyle(cardBox);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return;
          }
          
          // Look for question number and check if required
          let questionNumber = '';
          let isRequired = false;
          
          const questionElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
          for (const elem of questionElements) {
            const text = elem.textContent?.trim() || '';
            const match = text.match(/^(\d+\.?\d*\.?)/);
            if (match) {
              questionNumber = match[1];
              // Check if the question text ends with *
              const fullText = elem.textContent?.trim() || '';
              isRequired = fullText.endsWith('*');
              break;
            }
          }
          
          if (questionNumber && isRequired) {
            requiredQuestions.push(questionNumber);
          }
        });
        
        return requiredQuestions;
      });
      
      // Filter out already filled questions
      return requiredFields.filter(qNum => !filledQuestions.has(qNum));
    } catch (error) {
      logger.error('Error scanning for new required fields:', error);
      return [];
    }
  }

  private async detectNewlyVisibleRequiredFields(page: Page, allFields: SurveyField[], filledQuestions: Set<string>): Promise<SurveyField[]> {
    try {
      // Look for visible required fields that haven't been filled yet
      const newFields: SurveyField[] = [];
      
      // Check each field in the original list to see if it's now visible
      for (const field of allFields) {
        // Skip if already filled or already marked as required
        if (filledQuestions.has(field.questionNumber) || field.isRequired) {
          continue;
        }
        
        // Check if the field is now visible and required
        const isNowVisible = await page.evaluate((selector) => {
          try {
            const element = document.querySelector(selector);
            if (!element) return false;
            
            // Check if element is visible
            const style = window.getComputedStyle(element);
            const isVisible = style.display !== 'none' && 
                            style.visibility !== 'hidden' && 
                            style.opacity !== '0';
            
            if (!isVisible) return false;
            
            // Check if the containing CardBox is visible
            const cardBox = element.closest('[class*="CardBox"]');
            if (cardBox) {
              const cardBoxStyle = window.getComputedStyle(cardBox);
              return cardBoxStyle.display !== 'none' && 
                     cardBoxStyle.visibility !== 'hidden';
            }
            
            return true;
          } catch (e) {
            return false;
          }
        }, field.selector);
        
        if (isNowVisible) {
          // Mark as required since it's now visible and needs to be filled
          field.isRequired = true;
          newFields.push(field);
        }
      }
      
      // Also check for completely new fields that weren't in the original scan
      const newQuestionNumbers = await page.evaluate(() => {
        const container = document.querySelector('#survey-body-container');
        if (!container) return [];
        
        const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
        const questionNumbers: string[] = [];
        
        cardBoxes.forEach((cardBox) => {
          // Look for question number
          const questionElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
          for (const elem of questionElements) {
            const text = elem.textContent?.trim() || '';
            const match = text.match(/^(\d+\.?\d*\.?)/);
            if (match) {
              questionNumbers.push(match[1]);
              break;
            }
          }
        });
        
        return questionNumbers;
      });
      
      // Log any question numbers that we haven't seen before
      for (const qNum of newQuestionNumbers) {
        if (!allFields.some(f => f.questionNumber === qNum) && !filledQuestions.has(qNum)) {
          logger.info(`Detected new question number ${qNum} that wasn't in original scan`);
        }
      }
      
      return newFields;
    } catch (error) {
      logger.error('Error detecting newly visible fields:', error);
      return [];
    }
  }

  async waitForFormTransition(page: Page, previousTitle: string): Promise<boolean> {
    try {
      logger.info(`Waiting for form transition from: "${previousTitle}"`);
      
      // Give more time for the form to load and check multiple times
      let attempts = 0;
      const maxAttempts = 10;
      const waitBetweenAttempts = 1000; // 1 second
      
      while (attempts < maxAttempts) {
        // Wait a bit for DOM changes
        await new Promise(resolve => setTimeout(resolve, waitBetweenAttempts));
        
        // Check if we're on a new form using multiple strategies
        const transitionResult = await page.evaluate((prevTitle) => {
          const surveyBody = document.querySelector('#survey-body-container');
          if (!surveyBody) return { hasNewForm: false, reason: 'No survey body container' };
          
          // Strategy 1: Check for different content in form titles
          const allPs = surveyBody.querySelectorAll('p');
          let currentFormTitle = null;
          
          for (const p of allPs) {
            const parent = p.parentElement;
            if (parent && parent.querySelector('h3')) {
              currentFormTitle = p.textContent?.trim();
              break;
            }
          }
          
          // Strategy 2: Check short name (h3) changes
          const h3Elements = surveyBody.querySelectorAll('h3');
          const currentShortName = h3Elements.length > 0 ? h3Elements[0].textContent?.trim() : '';
          
          // Strategy 3: Check for different question content
          const questions = surveyBody.querySelectorAll('[class*="CardBox"]');
          const questionTexts = Array.from(questions).map(q => q.textContent?.trim().substring(0, 50));
          
          // Strategy 4: Check if any questions contain different selectors or types
          const hasSliderTrack = surveyBody.querySelector('[class*="SliderTrack"]') !== null;
          
          return {
            hasNewForm: true, // For now, assume we can transition
            currentFormTitle: currentFormTitle || 'Unknown',
            currentShortName: currentShortName || 'Unknown',
            questionCount: questions.length,
            questionTexts: questionTexts,
            hasSliderTrack: hasSliderTrack,
            reason: 'Form content available'
          };
        }, previousTitle);
        
        logger.info(`Form transition check ${attempts + 1}/${maxAttempts}: ${transitionResult.reason}`);
        logger.info(`Current form: "${transitionResult.currentFormTitle}", Short name: "${transitionResult.currentShortName}"`);
        logger.info(`Questions: ${transitionResult.questionCount}, Has VAS slider: ${transitionResult.hasSliderTrack}`);
        
        // If we have questions, consider it a valid form
        if (transitionResult.questionCount && transitionResult.questionCount > 0) {
          logger.info('Form transition successful - found questions');
          return true;
        }
        
        attempts++;
      }
      
      logger.warn(`Form transition failed after ${maxAttempts} attempts`);
      return false;
    } catch (error) {
      logger.error('Error waiting for form transition:', error);
      return false;
    }
  }
}