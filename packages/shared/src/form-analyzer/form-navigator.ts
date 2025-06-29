import { Page } from 'puppeteer';
import { NavigationButton, SurveyField } from '../types/types.js';
import { logger } from '../utils/logger.js';

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
    
    // Check if this form needs at least one field filled for navigation
    const navButtons = await this.detectNavigationButtons(page);
    const hasNextButton = navButtons.some(b => b.type === 'next');
    const initiallyEmpty = filledQuestions.size === 0;
    const needsAtLeastOneField = hasNextButton && fields.length > 0 && initiallyEmpty;
    
    // Process fields in order, checking for new conditional fields after each one
    logger.info(`Processing ${allFields.length} fields total`);
    for (let i = 0; i < allFields.length; i++) {
      const field = allFields[i];
      // Skip if already filled (including conditional fields filled immediately)
      const fieldKey = field.questionNumber || `no_number_${i}`;
      logger.info(`Checking field ${i}: key="${fieldKey}", type="${field.inputType}", required=${field.isRequired}`);
      if (filledQuestions.has(fieldKey)) {
        logger.info(`  Field ${fieldKey} already filled, skipping`);
        continue;
      }
      
      // Check if field is required or VAS (VAS needs interaction even if not required)
      // OR if we need at least one field filled for navigation
      const shouldFillOptional = needsAtLeastOneField && filledQuestions.size === 0;
      if (!field.isRequired && field.inputType !== 'VAS' && !shouldFillOptional) {
        logger.info(`Skipping field ${field.questionNumber || 'NO_NUMBER'} - not required (type: ${field.inputType})`);
        continue;
      }
      
      logger.info(`Processing required field ${field.questionNumber || 'NO_NUMBER'} (type: ${field.inputType}, required: ${field.isRequired})`);
      logger.info(`  Field selector: ${field.selector}`);
      logger.info(`  CardBox selector: ${field.cardBoxSelector}`);
      
      try {
        // Record state before filling
        const questionsBefore = await this.getVisibleQuestions(page);
        
        // Fill the field
        logger.info(`Filling field ${field.questionNumber || 'NO_NUMBER'} (${field.inputType})`);
        const filledValue = await this.fillFieldAndGetValue(page, field);
        filledQuestions.add(fieldKey);
        
        // Wait for any conditional fields to appear
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check for new questions that appeared
        const questionsAfter = await this.getVisibleQuestions(page);
        const newQuestions = questionsAfter.filter(q => !questionsBefore.includes(q));
        
        if (newQuestions.length > 0) {
          logger.info(`New conditional questions appeared after filling ${field.questionNumber}: ${newQuestions.join(', ')}`);
          
          // Scan new conditional fields
          const conditionalFields = await this.scanConditionalFields(page, newQuestions, field.questionNumber, filledValue);
          
          // Fill conditional fields immediately
          logger.info(`Processing ${conditionalFields.length} conditional fields for immediate filling`);
          for (const conditionalField of conditionalFields) {
            logger.info(`Conditional field ${conditionalField.questionNumber}: required=${conditionalField.isRequired}, type=${conditionalField.inputType}, selector=${conditionalField.selector}`);
            // Always fill conditional fields, regardless of required status
            // Since they appeared due to user action, they likely need values
            if (true) {  // Was: if (conditionalField.isRequired || conditionalField.inputType === 'VAS') {
              try {
                logger.info(`Immediately filling conditional field ${conditionalField.questionNumber} (${conditionalField.inputType}) with selector: ${conditionalField.selector}`);
                const conditionalValue = await this.fillFieldAndGetValue(page, conditionalField);
                filledQuestions.add(conditionalField.questionNumber);
                
                // Add to allFields array for record keeping
                allFields.push(conditionalField);
                
                // Wait after filling each conditional field
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Check if this conditional field triggered more conditional fields
                const questionsAfterConditional = await this.getVisibleQuestions(page);
                const nestedNewQuestions = questionsAfterConditional.filter(q => 
                  !questionsAfter.includes(q) && !newQuestions.includes(q)
                );
                
                if (nestedNewQuestions.length > 0) {
                  logger.info(`Nested conditional questions appeared after filling ${conditionalField.questionNumber}: ${nestedNewQuestions.join(', ')}`);
                  // Recursively handle nested conditional fields
                  const nestedConditionalFields = await this.scanConditionalFields(
                    page, 
                    nestedNewQuestions, 
                    conditionalField.questionNumber, 
                    conditionalValue
                  );
                  
                  for (const nestedField of nestedConditionalFields) {
                    if (nestedField.isRequired || nestedField.inputType === 'VAS') {
                      logger.info(`Immediately filling nested conditional field ${nestedField.questionNumber}`);
                      await this.fillFieldAndGetValue(page, nestedField);
                      filledQuestions.add(nestedField.questionNumber);
                      allFields.push(nestedField);
                      await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                  }
                }
              } catch (error) {
                logger.error(`Failed to fill conditional field ${conditionalField.questionNumber}:`, error);
                // Continue with other fields instead of throwing
              }
            }
          }
          
          logger.info(`Filled ${conditionalFields.length} conditional fields immediately`);
        }
      } catch (error) {
        logger.error(`Failed to fill field ${field.questionNumber}:`, error);
        throw error;
      }
      
      // Don't break here - continue to fill all required fields
      // The needsAtLeastOneField logic is only to ensure we fill at least one field
      // for navigation, but we should still fill all required fields
    }
    
    // If we still haven't filled any fields but we have a next button and fields, fill the first field
    if (filledQuestions.size === 0 && hasNextButton && fields.length > 0) {
      logger.info('No fields filled yet, but form has next button. Filling first field to enable navigation...');
      const firstField = fields[0];
      try {
        logger.info(`Force filling field ${firstField.questionNumber} (${firstField.inputType})`);
        await this.fillFieldAndGetValue(page, firstField);
        filledQuestions.add(firstField.questionNumber);
      } catch (error) {
        logger.error(`Failed to force fill first field:`, error);
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
        // Check if visible - include size check to avoid hidden elements
        const style = window.getComputedStyle(cardBox);
        const element = cardBox as HTMLElement;
        if (style.display === 'none' || 
            style.visibility === 'hidden' || 
            style.opacity === '0' ||
            element.offsetHeight === 0 || 
            element.offsetWidth === 0) {
          return;
        }
        
        // Find question number or use a placeholder for unnumbered questions
        const textElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
        let questionId = '';
        for (const elem of textElements) {
          const text = elem.textContent?.trim() || '';
          const match = text.match(/^(\d+\.?\d*\.?)/);
          if (match) {
            questionId = match[1];
            break;
          }
        }
        
        // If no question number found, use a unique identifier based on position
        if (!questionId) {
          const allCardBoxes = Array.from(container.querySelectorAll('[class*="CardBox"]'));
          const position = allCardBoxes.indexOf(cardBox);
          questionId = `no_number_${position}`;
        }
        
        visibleQuestions.push(questionId);
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
    const { TestDataGenerator } = await import('../test-generator/test-data-generator.js');
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
              const inputId = firstInput.id;
              if (inputId && /^\d/.test(inputId)) {
                selector = `#\\3${inputId.charAt(0)} ${inputId.substring(1)}`;
              } else {
                selector = `#${inputId}`;
              }
              const options = firstInput.querySelectorAll('option');
              options.forEach(opt => {
                if (opt.textContent?.trim()) {
                  choices.push(opt.textContent.trim());
                }
              });
            } else if (firstInput.tagName === 'TEXTAREA') {
              inputType = 'textarea';
              const inputId = firstInput.id;
              if (inputId && /^\d/.test(inputId)) {
                selector = `#\\3${inputId.charAt(0)} ${inputId.substring(1)}`;
              } else {
                selector = `#${inputId}`;
              }
            } else if ((firstInput as HTMLInputElement).type === 'radio') {
              inputType = 'radio';
              const inputId = firstInput.id;
              if (inputId && /^\d/.test(inputId)) {
                selector = `#\\3${inputId.charAt(0)} ${inputId.substring(1)}`;
              } else {
                selector = `#${inputId}`;
              }
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
              const inputId = firstInput.id;
              if (inputId && /^\d/.test(inputId)) {
                selector = `#\\3${inputId.charAt(0)} ${inputId.substring(1)}`;
              } else {
                selector = `#${inputId}`;
              }
            }
            
            // Generate CardBox selector first
            let cardBoxSelector = '';
            if (cardBox.id) {
              cardBoxSelector = `#${cardBox.id}`;
            } else {
              // Create a more specific selector based on the question number
              // This is more reliable than position since conditional fields appear dynamically
              const questionNumElement = cardBox.querySelector('h4, h5, h6, span, p, div');
              if (questionNumElement && questionNumElement.textContent?.match(/^(\d+\.?\d*\.?)/)) {
                // Use a data attribute if available, or create a unique selector
                const dataAttrs = Array.from(cardBox.attributes).filter(attr => attr.name.startsWith('data-'));
                if (dataAttrs.length > 0) {
                  cardBoxSelector = `[${dataAttrs[0].name}="${dataAttrs[0].value}"]`;
                } else {
                  // For conditional fields, we need a unique selector
                  // Since the cardBox is the exact element we found, let's create a unique identifier
                  const allCardBoxes = Array.from(container.querySelectorAll('[class*="CardBox"]'));
                  const cardBoxIndex = allCardBoxes.indexOf(cardBox);
                  
                  if (cardBoxIndex >= 0) {
                    // Create a unique ID for this cardBox if it doesn't have one
                    if (!cardBox.id) {
                      cardBox.id = `conditional-field-${qNum.replace(/\./g, '_')}`;
                    }
                    cardBoxSelector = `#${cardBox.id}`;
                  } else {
                    // This shouldn't happen, but as a fallback
                    cardBoxSelector = `[class*="CardBox"]`;
                  }
                }
              } else if (cardBox.className) {
                // Fallback to class-based selector
                const cardBoxClass = cardBox.className.split(' ').find(c => c.includes('CardBox'));
                if (cardBoxClass) {
                  cardBoxSelector = `[class*="${cardBoxClass}"]`;
                } else {
                  cardBoxSelector = `.${cardBox.className.split(' ').join('.')}`;
                }
              }
            }
            
            // Check for VAS slider
            if (cardBox.querySelector('[class*="SliderTrack"]')) {
              inputType = 'VAS';
              const sliderElement = cardBox.querySelector('[class*="SliderTrack"]');
              if (sliderElement && sliderElement.id) {
                selector = `#${sliderElement.id}`;
              } else {
                selector = `${cardBoxSelector} [class*="SliderTrack"]`;
              }
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
          
          // Create the conditional field with improved cardBoxSelector
          const conditionalField: SurveyField = {
            ...fieldData,
            inputType: fieldData.inputType as any,
            isRequired: true, // Force conditional fields to be required since they appeared due to user action
            screenshotPath: '', // Will be set when screenshot is taken
            testData,
            // Use the existing cardBoxSelector from fieldData since it's already properly constructed
            cardBoxSelector: fieldData.cardBoxSelector,
            conditionalInfo: {
              isConditional: true,
              parentQuestion,
              parentValue,
              appearedAfter: new Date().toISOString()
            }
          };
          
          conditionalFields.push(conditionalField);
          logger.info(`Scanned conditional field ${questionNumber}: ${fieldData.questionText} (${fieldData.inputType}) - selector: ${fieldData.selector}, cardBoxSelector: ${fieldData.cardBoxSelector}`);
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
        
      case 'date':
        // For date fields, click to open date picker and select yesterday
        logger.info(`Handling date field ${field.questionNumber}`);
        try {
          // Click the date input to open date picker
          await page.click(field.selector);
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Calculate yesterday's date
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const year = yesterday.getFullYear();
          const month = yesterday.getMonth(); // 0-indexed
          const day = yesterday.getDate();
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                             'July', 'August', 'September', 'October', 'November', 'December'];
          const monthName = monthNames[month];
          
          logger.info(`Selecting date: ${monthName} ${day}, ${year} (yesterday)`);
          
          // Handle the specific MonthYearDropdownWrapper structure
          try {
            // Find the MonthYearDropdownWrapper
            const dropdownWrapper = await page.$('[class*="MonthYearDropdownWrapper"]');
            if (dropdownWrapper) {
              // Get the two divs inside
              const divs = await dropdownWrapper.$$('div');
              
              if (divs.length >= 2) {
                // Click the first div (month selector)
                logger.info('Clicking month selector div');
                await divs[0].click();
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Clear and type the month name
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.type(monthName);
                await page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Click the second div (year selector)
                logger.info('Clicking year selector div');
                await divs[1].click();
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Clear and type the year
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.type(String(year));
                await page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Now select the day from the calendar
                const daySelected = await page.evaluate((targetDay) => {
                  // Look for day buttons in the calendar
                  const daySelectors = [
                    `[aria-label*="${targetDay}"]`,
                    `[class*="day"]:not([class*="outside-month"]):not([class*="disabled"])`,
                    `.react-datepicker__day--0${targetDay < 10 ? '0' : ''}${targetDay}:not(.react-datepicker__day--outside-month)`,
                    `[role="button"][aria-label*="${targetDay}"]`,
                    `button:not([disabled])`
                  ];
                  
                  for (const selector of daySelectors) {
                    const dayElements = document.querySelectorAll(selector);
                    for (const dayElement of dayElements) {
                      const elementText = dayElement.textContent?.trim();
                      if (elementText === String(targetDay)) {
                        // Make sure it's not disabled or outside current month
                        const isDisabled = dayElement.classList.contains('disabled') || 
                                         dayElement.hasAttribute('disabled') ||
                                         dayElement.classList.contains('outside-month');
                        
                        if (!isDisabled) {
                          (dayElement as HTMLElement).click();
                          return true;
                        }
                      }
                    }
                  }
                  return false;
                }, day);
                
                if (daySelected) {
                  logger.info(`Successfully selected date using MonthYearDropdownWrapper`);
                } else {
                  logger.warn(`Could not find day ${day} in calendar`);
                }
              } else {
                logger.warn(`MonthYearDropdownWrapper found but doesn't have 2 divs`);
              }
            } else {
              logger.warn(`MonthYearDropdownWrapper not found, trying alternative approach`);
            }
          } catch (dropdownError) {
            logger.error(`Error with MonthYearDropdownWrapper approach:`, dropdownError);
          }
          
          // Wait for date picker to close
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          logger.error(`Failed to handle date field ${field.questionNumber}:`, error);
        }
        break;
        
      case 'textarea':
        await page.type(field.selector, String(testValue));
        break;
        
      case 'radio':
        // For radio buttons, we need to find the radio group and select by index
        const radioIndex = typeof testValue === 'number' ? testValue : 0;
        
        // Try multiple approaches to select radio buttons
        let radioSelected = false;
        
        // Log the selector we're using
        logger.info(`Attempting to fill radio field with selector: ${field.selector}, cardBoxSelector: ${field.cardBoxSelector}`);
        
        // Approach 1: Try to use the cardBoxSelector to find all radios in the question
        if (field.cardBoxSelector && !radioSelected) {
          try {
            // For fields with generic selector, find by question number or position
            if ((field.conditionalInfo?.isConditional || !field.questionNumber || field.questionNumber.trim() === '') && 
                field.cardBoxSelector === '[class*="CardBox"]') {
              
              // If no question number, use broader approach to find radio fields
              if (!field.questionNumber || field.questionNumber.trim() === '') {
                logger.info('Field has no question number, attempting to find radio buttons by input type');
                
                // Try to find all radio button groups on the page
                const result = await page.evaluate((radioIdx: number) => {
                  const container = document.querySelector('#survey-body-container');
                  if (!container) return { clicked: false, count: 0, found: false };
                  
                  // Find all CardBoxes with radio buttons
                  const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
                  const radioCardBoxes = [];
                  
                  for (const cardBox of cardBoxes) {
                    const radios = cardBox.querySelectorAll('input[type="radio"]');
                    if (radios.length > 0) {
                      radioCardBoxes.push({ cardBox, radios });
                    }
                  }
                  
                  // Assuming this is the second question (index 1) which has radio buttons
                  if (radioCardBoxes.length > 1) {
                    const targetRadios = radioCardBoxes[1].radios;
                    if (targetRadios.length > radioIdx) {
                      const radio = targetRadios[radioIdx] as HTMLInputElement;
                      radio.scrollIntoView({ block: 'center' });
                      radio.click();
                      return { clicked: true, count: targetRadios.length, found: true, totalGroups: radioCardBoxes.length };
                    }
                    return { clicked: false, count: targetRadios.length, found: true, totalGroups: radioCardBoxes.length };
                  } else if (radioCardBoxes.length === 1) {
                    // Only one radio group, use it
                    const targetRadios = radioCardBoxes[0].radios;
                    if (targetRadios.length > radioIdx) {
                      const radio = targetRadios[radioIdx] as HTMLInputElement;
                      radio.scrollIntoView({ block: 'center' });
                      radio.click();
                      return { clicked: true, count: targetRadios.length, found: true, totalGroups: 1 };
                    }
                  }
                  
                  return { clicked: false, count: 0, found: false, totalGroups: radioCardBoxes.length };
                }, radioIndex);
                
                if (result.found) {
                  logger.info(`Found ${result.totalGroups} radio button groups, selected from group with ${result.count} radio buttons`);
                  if (result.clicked) {
                    radioSelected = true;
                    logger.info(`Selected radio button ${radioIndex} for field without question number`);
                  } else {
                    logger.warn(`Could not click radio ${radioIndex} - only ${result.count} radios found`);
                  }
                } else {
                  logger.warn(`Could not find any radio button groups on the page`);
                }
              } else {
                // Use page.evaluate directly to find and click the radio button by question number
                const result = await page.evaluate((questionNum: string, radioIdx: number) => {
                const cardBoxes = document.querySelectorAll('#survey-body-container [class*="CardBox"]');
                for (const cardBox of cardBoxes) {
                  // Look for question number more precisely
                  const textElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
                  let foundQuestion = false;
                  
                  for (const elem of textElements) {
                    const text = elem.textContent?.trim() || '';
                    // Match question number at the beginning of the text
                    const match = text.match(/^(\d+\.?\d*\.?)\s/);
                    if (match && match[1] === questionNum) {
                      foundQuestion = true;
                      break;
                    }
                  }
                  
                  if (foundQuestion) {
                    // Found the right CardBox, now find radio buttons
                    const radios = cardBox.querySelectorAll('input[type="radio"]');
                    if (radios.length > radioIdx) {
                      const radio = radios[radioIdx] as HTMLInputElement;
                      radio.scrollIntoView({ block: 'center' });
                      radio.click();
                      return { clicked: true, count: radios.length, found: true };
                    }
                    return { clicked: false, count: radios.length, found: true };
                  }
                }
                return { clicked: false, count: 0, found: false };
              }, field.questionNumber, radioIndex);
              
                if (result.found) {
                  logger.info(`Found specific CardBox for question ${field.questionNumber} with ${result.count} radio buttons`);
                  if (result.clicked) {
                    radioSelected = true;
                    logger.info(`Selected radio button ${radioIndex} for conditional field using specific CardBox`);
                  } else {
                    logger.warn(`Could not click radio ${radioIndex} - only ${result.count} radios found in CardBox`);
                  }
                } else {
                  logger.warn(`Could not find CardBox for question ${field.questionNumber}`);
                }
              }
            } else {
              // Original approach for non-conditional fields
              const radioButtons = await page.$$(`${field.cardBoxSelector} input[type="radio"]`);
              logger.info(`CardBox selector search found ${radioButtons.length} radio buttons`);
              
              if (radioButtons.length > radioIndex) {
                // Make sure element is visible before clicking
                await radioButtons[radioIndex].evaluate(el => el.scrollIntoView({ block: 'center' }));
                await radioButtons[radioIndex].click();
                radioSelected = true;
                logger.info(`Selected radio button ${radioIndex} using cardBox selector (found ${radioButtons.length} radio buttons)`);
              } else {
                logger.warn(`CardBox selector found ${radioButtons.length} radio buttons, but trying to select index ${radioIndex}`);
              }
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
        
        // Wait a bit for the click to register
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify the radio was actually selected
        const verifyResult = await page.evaluate((selector, cardBoxSel) => {
          // First check the specific radio
          const radio = document.querySelector(selector);
          if (radio && (radio as HTMLInputElement).checked) {
            return { checked: true, method: 'direct' };
          }
          
          // If not, check all radios in the CardBox
          if (cardBoxSel) {
            const radios = document.querySelectorAll(`${cardBoxSel} input[type="radio"]`);
            for (let i = 0; i < radios.length; i++) {
              if ((radios[i] as HTMLInputElement).checked) {
                return { checked: true, method: 'cardbox', index: i };
              }
            }
          }
          
          return { checked: false };
        }, field.selector, field.cardBoxSelector);
        
        if (!verifyResult.checked) {
          logger.warn(`Radio button for field ${field.questionNumber} was clicked but not checked. Trying alternative approach.`);
          // Try clicking the label or parent element
          await page.evaluate((selector) => {
            const radio = document.querySelector(selector);
            if (radio) {
              const label = radio.closest('label') || radio.parentElement;
              if (label) {
                (label as HTMLElement).click();
              }
            }
          }, field.selector);
        } else {
          logger.info(`Radio button verified as checked using ${verifyResult.method} method${verifyResult.index !== undefined ? ` at index ${verifyResult.index}` : ''}`);
        }
        break;
        
      case 'checkbox':
        // For checkboxes, select the first one
        try {
          logger.info(`Attempting to fill checkbox field with selector: ${field.selector}`);
          
          // If we have a specific selector, try to click it
          if (field.selector && !field.selector.includes('[type="checkbox"]')) {
            // Selector might be for a specific checkbox
            await page.click(field.selector);
            logger.info(`Clicked checkbox using direct selector: ${field.selector}`);
          } else {
            // Find checkboxes in the CardBox
            const checkboxSelector = field.cardBoxSelector ? 
              `${field.cardBoxSelector} input[type="checkbox"]` : 
              `input[type="checkbox"]`;
            
            const checkboxes = await page.$$(checkboxSelector);
            if (checkboxes.length > 0) {
              // Click the first checkbox
              await checkboxes[0].click();
              logger.info(`Clicked first checkbox out of ${checkboxes.length} checkboxes`);
            } else {
              logger.warn(`No checkboxes found with selector: ${checkboxSelector}`);
            }
          }
        } catch (error) {
          logger.error(`Failed to fill checkbox field: ${error}`);
          throw error;
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
        
      case 'NRS':
        // Handle Numeric Rating Scale (buttons with numeric values)
        logger.info(`Handling NRS field ${field.questionNumber}`);
        try {
          const nrsIndex = typeof testValue === 'number' ? testValue : 0;
          
          // Try multiple strategies to find and click NRS buttons
          let nrsClicked = false;
          
          // Strategy 1: Use cardBox selector to find buttons
          if (field.cardBoxSelector) {
            try {
              const buttons = await page.$$(`${field.cardBoxSelector} button`);
              logger.info(`Found ${buttons.length} buttons in CardBox`);
              
              // Filter for numeric buttons
              const numericButtons = [];
              for (let i = 0; i < buttons.length; i++) {
                const text = await buttons[i].evaluate(el => el.textContent?.trim() || '');
                if (/^\d+$/.test(text)) {
                  numericButtons.push({ button: buttons[i], value: parseInt(text), index: i });
                }
              }
              
              logger.info(`Found ${numericButtons.length} numeric buttons`);
              
              if (numericButtons.length > nrsIndex) {
                // Sort by numeric value
                numericButtons.sort((a, b) => a.value - b.value);
                
                // Click the button at the requested index
                await numericButtons[nrsIndex].button.evaluate(el => el.scrollIntoView({ block: 'center' }));
                await numericButtons[nrsIndex].button.click();
                nrsClicked = true;
                logger.info(`Clicked NRS button with value ${numericButtons[nrsIndex].value} (index ${nrsIndex})`);
              }
            } catch (error) {
              logger.debug(`CardBox NRS selection failed: ${error}`);
            }
          }
          
          // Strategy 2: Use direct selector if available
          if (!nrsClicked && field.selector) {
            try {
              // If selector contains button text, extract it
              const match = field.selector.match(/button:contains\("(\d+)"\)/);
              if (match) {
                const targetValue = match[1];
                const clicked = await page.evaluate((cardBoxSel, targetVal) => {
                  const cardBox = document.querySelector(cardBoxSel);
                  if (!cardBox) return false;
                  
                  const buttons = cardBox.querySelectorAll('button');
                  for (const button of buttons) {
                    if (button.textContent?.trim() === targetVal) {
                      (button as HTMLElement).click();
                      return true;
                    }
                  }
                  return false;
                }, field.cardBoxSelector, targetValue);
                
                if (clicked) {
                  nrsClicked = true;
                  logger.info(`Clicked NRS button with value ${targetValue} using direct selector`);
                }
              }
            } catch (error) {
              logger.debug(`Direct NRS selector failed: ${error}`);
            }
          }
          
          if (!nrsClicked) {
            logger.error(`Could not click NRS button for field ${field.questionNumber}`);
          }
        } catch (error) {
          logger.error(`Failed to handle NRS field ${field.questionNumber}:`, error);
        }
        break;
        
      case 'dropdown':
        // For dropdowns, select by index
        const dropdownIndex = typeof testValue === 'number' ? testValue : 0;
        
        try {
          // First try native select element
          await page.select(field.selector, field.choices?.[dropdownIndex] || '');
          logger.info(`Selected dropdown option ${dropdownIndex} using native select`);
        } catch (error) {
          // If that fails, it's likely a custom dropdown
          logger.info(`Native select failed, trying custom dropdown approach for ${field.selector}`);
          
          try {
            // Click the dropdown to open it
            await page.click(field.selector);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Look for dropdown options - they might be in a separate container
            const optionSelected = await page.evaluate((dropdownIdx) => {
              // Common patterns for dropdown options
              const optionSelectors = [
                '[role="option"]',
                '[class*="option"]',
                '[class*="dropdown-item"]',
                '[class*="select-item"]',
                'li[role="option"]',
                'div[role="option"]'
              ];
              
              for (const selector of optionSelectors) {
                const options = document.querySelectorAll(selector);
                if (options.length > dropdownIdx) {
                  const option = options[dropdownIdx] as HTMLElement;
                  option.click();
                  return true;
                }
              }
              
              return false;
            }, dropdownIndex);
            
            if (!optionSelected) {
              logger.warn(`Could not find dropdown options for ${field.selector}`);
              // As a fallback, type the value if we have choices
              if (field.choices && field.choices[dropdownIndex]) {
                await page.type(field.selector, field.choices[dropdownIndex]);
              }
            } else {
              logger.info(`Selected dropdown option ${dropdownIndex} using custom dropdown`);
            }
          } catch (customError) {
            logger.error(`Failed to handle custom dropdown: ${customError}`);
          }
        }
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
        '[class*="alert"]',
        '[class*="Dialog"]',
        '[class*="Modal"]',
        '[class*="Popup"]'
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
            
            // Try to get the modal content for better debugging
            const modalContent = await page.evaluate((el) => {
              return el.textContent?.trim().substring(0, 200);
            }, modal);
            logger.warn(`Modal content: ${modalContent}`);
            
            return true;
          }
        }
      }
      
      // Also check for inline validation errors that might block navigation
      const hasInlineErrors = await page.evaluate(() => {
        const errorSelectors = [
          '[class*="error-message"]',
          '[class*="errorMessage"]',
          '[class*="validation-error"]',
          '[class*="field-error"]',
          '.error',
          '.invalid-feedback',
          '[aria-invalid="true"]'
        ];
        
        for (const selector of errorSelectors) {
          const errors = document.querySelectorAll(selector);
          for (const error of errors) {
            const element = error as HTMLElement;
            if (element.offsetWidth > 0 && element.offsetHeight > 0 && element.textContent?.trim()) {
              return true;
            }
          }
        }
        return false;
      });
      
      if (hasInlineErrors) {
        logger.warn('Inline validation errors detected on form');
        return true;
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
      '[class*="closeButton"]',
      '[class*="dismiss"]',
      'button[type="button"]:has-text("OK")',
      'button[type="button"]:has-text("Close")',
      'button[type="button"]:has-text("Got it")',
      'button[type="button"]:has-text("Understood")'
    ];
    
    // First try using Puppeteer's text content search
    try {
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await page.evaluate(el => el.textContent?.trim(), button);
        if (text && ['OK', 'Close', 'Got it', 'Understood', 'Dismiss'].includes(text)) {
          const isVisible = await page.evaluate(el => {
            const element = el as HTMLElement;
            return element.offsetWidth > 0 && element.offsetHeight > 0;
          }, button);
          
          if (isVisible) {
            logger.info(`Clicking modal button with text: ${text}`);
            await button.click();
            await new Promise(resolve => setTimeout(resolve, 500));
            return;
          }
        }
      }
    } catch (error) {
      logger.warn('Error finding modal buttons by text:', error);
    }
    
    // Fallback to selector-based approach
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
          const sliderSelectors = [
            '[class*="SliderTrack"]',
            '[class*="slider"]',
            '[class*="Slider"]',
            '[class*="vas"]',
            '[class*="VAS"]',
            '[role="slider"]',
            'input[type="range"]'
          ];
          
          let hasSliderTrack = false;
          for (const selector of sliderSelectors) {
            if (surveyBody.querySelector(selector)) {
              hasSliderTrack = true;
              break;
            }
          }
          
          // Check if we have an error message or validation that's blocking navigation
          const errorMessage = surveyBody.querySelector('[class*="error"], [class*="Error"], [class*="alert"], [class*="Alert"]');
          const hasError = errorMessage !== null;
          
          return {
            hasNewForm: true, // For now, assume we can transition
            currentFormTitle: currentFormTitle || 'Unknown',
            currentShortName: currentShortName || 'Unknown',
            questionCount: questions.length,
            questionTexts: questionTexts,
            hasSliderTrack: hasSliderTrack,
            hasError: hasError,
            errorText: errorMessage?.textContent?.trim() || '',
            reason: 'Form content available'
          };
        }, previousTitle);
        
        logger.info(`Form transition check ${attempts + 1}/${maxAttempts}: ${transitionResult.reason}`);
        logger.info(`Current form: "${transitionResult.currentFormTitle}", Short name: "${transitionResult.currentShortName}"`);
        logger.info(`Questions: ${transitionResult.questionCount}, Has VAS slider: ${transitionResult.hasSliderTrack}`);
        
        // Check for errors
        if (transitionResult.hasError) {
          logger.warn(`Error detected on form: ${transitionResult.errorText}`);
        }
        
        // Check if the form title or content has changed
        const hasFormChanged = transitionResult.currentFormTitle !== previousTitle && 
                             transitionResult.currentFormTitle !== 'Unknown';
        
        // For informational forms: if title changed and we have navigation buttons, that's a valid transition
        const hasNavButtons = await page.evaluate(() => {
          const surveyBody = document.querySelector('#survey-body-container');
          const navigationArea = surveyBody?.nextElementSibling;
          const buttons = navigationArea?.querySelectorAll('button') || [];
          return buttons.length > 0;
        });
        
        // Success conditions:
        // 1. Form has questions (regular form)
        // 2. Form has no questions but title changed and has nav buttons (informational form)
        // 3. After several attempts, if we have nav buttons, consider it valid (avoid infinite loops)
        if (transitionResult.questionCount && transitionResult.questionCount > 0) {
          logger.info(`Form transition successful - found ${transitionResult.questionCount} questions`);
          return true;
        } else if (hasFormChanged && hasNavButtons) {
          logger.info(`Form transition successful - informational form (title changed: "${transitionResult.currentFormTitle}")`);
          return true;
        } else if (attempts >= 5 && hasNavButtons) {
          logger.info('Form transition assumed successful - has navigation buttons after 5 attempts');
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