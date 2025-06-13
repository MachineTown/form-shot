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
  
  async fillRequiredFields(page: Page, fields: SurveyField[]): Promise<void> {
    // Fill required fields first
    const requiredFields = fields.filter(f => f.isRequired);
    logger.info(`Filling ${requiredFields.length} required fields`);
    
    for (const field of requiredFields) {
      try {
        await this.fillField(page, field);
        // Small delay between fields to simulate user interaction
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        logger.error(`Failed to fill field ${field.questionNumber}:`, error);
        throw error;
      }
    }
    
    // Also fill VAS sliders even if not marked as required (they need interaction to set values)
    const vasFields = fields.filter(f => f.inputType === 'VAS' && !f.isRequired);
    if (vasFields.length > 0) {
      logger.info(`Filling ${vasFields.length} VAS slider fields (even if not required)`);
      for (const field of vasFields) {
        try {
          await this.fillField(page, field);
          // Small delay between fields to simulate user interaction
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          logger.error(`Failed to fill VAS field ${field.questionNumber}:`, error);
          // Don't throw for VAS fields, just log the error
        }
      }
    }
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