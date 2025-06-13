import { Page } from 'puppeteer';
import { NavigationButton } from '../utils/types';
import { logger } from '../utils/logger';

export class FormResetService {
  
  /**
   * Checks if the current form is the first form by examining navigation buttons
   * First form only has 'next' button, no 'previous' button
   */
  async isFirstForm(page: Page): Promise<boolean> {
    try {
      const navButtons = await this.detectNavigationButtons(page);
      const hasPrevious = navButtons.some(button => button.type === 'previous');
      const hasNext = navButtons.some(button => button.type === 'next');
      
      logger.info(`Navigation buttons found: ${navButtons.map(b => b.type).join(', ')}`);
      
      // First form should have 'next' but no 'previous'
      return hasNext && !hasPrevious;
    } catch (error) {
      logger.error('Error checking if first form:', error);
      return true; // Assume first form if error
    }
  }

  /**
   * Navigate to the first form by clicking previous buttons until no more previous buttons exist
   */
  async navigateToFirstForm(page: Page): Promise<void> {
    logger.info('Navigating to first form...');
    
    let attempts = 0;
    const maxAttempts = 15; // Increase attempts for EQ-5D which has many forms
    
    while (attempts < maxAttempts) {
      // Get detailed form info for logging
      const currentFormInfo = await this.getCurrentFormInfo(page);
      logger.info(`Current form: "${currentFormInfo.title}" (${currentFormInfo.shortName}), buttons: ${currentFormInfo.buttons.join(', ')}`);
      
      const isFirst = await this.isFirstForm(page);
      if (isFirst) {
        logger.info('Reached first form');
        return;
      }
      
      // Click previous button using a more robust approach
      try {
        const clicked = await this.clickPreviousButtonRobust(page);
        if (!clicked) {
          logger.info('No previous button available, assuming we reached first form');
          break;
        }
        
        await this.waitForFormTransition(page);
        attempts++;
        logger.info(`Successfully navigated backwards, attempt ${attempts}`);
      } catch (error) {
        logger.warn(`Failed to click previous button on attempt ${attempts}:`, error);
        // Try to continue anyway - maybe we can still detect the first form
        attempts++;
        if (attempts >= 3) {
          logger.warn('Multiple navigation failures, stopping attempts');
          break;
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      logger.warn(`Reached maximum attempts (${maxAttempts}) trying to navigate to first form`);
    }
    
    // Final check of where we ended up
    const finalFormInfo = await this.getCurrentFormInfo(page);
    logger.info(`Final form: "${finalFormInfo.title}" (${finalFormInfo.shortName}), buttons: ${finalFormInfo.buttons.join(', ')}`);
  }

  /**
   * Clear all field values on the current form using ActionMenu -> BaseButton
   */
  async clearFormValues(page: Page): Promise<void> {
    logger.info('Clearing form values...');
    
    try {
      // Find all CardBox elements that contain fields for clearing
      const cardBoxes = await page.$$('[class*="CardBox"]');
      logger.info(`Found ${cardBoxes.length} CardBox elements to check for clearing`);
      
      for (let i = 0; i < cardBoxes.length; i++) {
        try {
          await this.clearFieldValue(page, i);
          // Small delay between clearing fields
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          logger.debug(`Could not clear field ${i + 1}:`, error);
          // Continue to next field even if this one fails
        }
      }
      
      logger.info('Completed form value clearing');
    } catch (error) {
      logger.error('Error clearing form values:', error);
    }
  }


  /**
   * Clear a specific field value using ActionMenu button
   */
  private async clearFieldValue(page: Page, fieldIndex: number): Promise<void> {
    try {
      // First, check what type of field this is for better logging
      const fieldInfo = await page.evaluate((index) => {
        const cardBoxes = document.querySelectorAll('[class*="CardBox"]');
        if (index >= cardBoxes.length) return { type: 'unknown', hasVAS: false };
        
        const cardBox = cardBoxes[index];
        const hasVAS = cardBox.querySelector('[class*="SliderTrack"]') !== null;
        const hasRadio = cardBox.querySelector('input[type="radio"]') !== null;
        const hasText = cardBox.querySelector('input[type="text"], textarea') !== null;
        
        let type = 'unknown';
        if (hasVAS) type = 'VAS';
        else if (hasRadio) type = 'radio';
        else if (hasText) type = 'text';
        
        return { type, hasVAS, hasRadio, hasText };
      }, fieldIndex);
      
      logger.debug(`Clearing field ${fieldIndex + 1} (type: ${fieldInfo.type})`);
      
      // Try to find ActionMenu button within this CardBox
      const actionMenuSelector = `[class*="CardBox"]:nth-of-type(${fieldIndex + 1}) [class*="ActionMenu"]`;
      
      const actionMenuButton = await page.$(actionMenuSelector);
      if (!actionMenuButton) {
        logger.debug(`No ActionMenu found for field ${fieldIndex + 1} (${fieldInfo.type})`);
        return;
      }
      
      logger.info(`Clicking ActionMenu for field ${fieldIndex + 1} (${fieldInfo.type})`);
      await actionMenuButton.click();
      
      // Wait for popup menu to appear with longer timeout for VAS
      const waitTime = fieldInfo.type === 'VAS' ? 500 : 300;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Look for BaseButton in the popup menu
      const baseButtonSelector = '[class*="BaseButton"]';
      const baseButton = await page.$(baseButtonSelector);
      
      if (baseButton) {
        logger.info(`Clicking BaseButton to clear field ${fieldIndex + 1} (${fieldInfo.type})`);
        await baseButton.click();
        
        // Wait for action to complete with longer timeout for VAS
        const completionWait = fieldInfo.type === 'VAS' ? 500 : 200;
        await new Promise(resolve => setTimeout(resolve, completionWait));
        
        // For VAS fields, verify if clearing worked
        if (fieldInfo.type === 'VAS') {
          const vasCleared = await page.evaluate((index) => {
            const cardBoxes = document.querySelectorAll('[class*="CardBox"]');
            if (index >= cardBoxes.length) return false;
            
            const cardBox = cardBoxes[index];
            const slider = cardBox.querySelector('[class*="SliderTrack"]');
            
            // Check if there's any visual indication that the slider is set/filled
            if (slider) {
              const sliderElements = cardBox.querySelectorAll('[class*="Handle"], [class*="Thumb"], [class*="Fill"]');
              for (const element of sliderElements) {
                const style = window.getComputedStyle(element);
                // Look for indicators that the slider has a value
                if (style.left && style.left !== '0px' && style.left !== 'auto') {
                  return false; // Still has value
                }
                if (style.width && parseFloat(style.width) > 10) {
                  return false; // Fill width indicates value
                }
              }
            }
            return true; // Appears cleared
          }, fieldIndex);
          
          logger.info(`VAS field ${fieldIndex + 1} clear verification: ${vasCleared ? 'SUCCESS' : 'FAILED'}`);
        }
        
        logger.info(`Successfully cleared field ${fieldIndex + 1} (${fieldInfo.type})`);
      } else {
        logger.debug(`No BaseButton found in popup for field ${fieldIndex + 1} (${fieldInfo.type})`);
        
        // Try to close the menu by clicking elsewhere
        await page.evaluate(() => {
          document.body.click();
        });
      }
      
    } catch (error) {
      logger.debug(`Error clearing field ${fieldIndex + 1}:`, error);
    }
  }

  /**
   * Get current form information for debugging
   */
  private async getCurrentFormInfo(page: Page): Promise<{title: string, shortName: string, buttons: string[]}> {
    try {
      return await page.evaluate(() => {
        const container = document.querySelector('#survey-body-container');
        if (!container) return { title: 'No container', shortName: 'No container', buttons: [] };
        
        // Get title and short name using same logic as analysis
        const allPs = container.querySelectorAll('p');
        let formTitleP = null;
        
        for (const p of allPs) {
          const parent = p.parentElement;
          if (parent && parent.querySelector('h3')) {
            formTitleP = p;
            break;
          }
        }
        
        const title = formTitleP?.textContent?.trim() || 'Title not found';
        const h3Elements = container.querySelectorAll('h3');
        const shortName = h3Elements.length > 0 ? h3Elements[0].textContent?.trim() || 'Short name not found' : 'Short name not found';
        
        // Get navigation buttons
        const navigationArea = container.nextElementSibling;
        const buttons: string[] = [];
        if (navigationArea) {
          const buttonElements = navigationArea.querySelectorAll('button');
          buttonElements.forEach(btn => {
            const text = btn.textContent?.trim() || '';
            const disabled = btn.disabled ? ' (disabled)' : '';
            buttons.push(text + disabled);
          });
        }
        
        return { title, shortName, buttons };
      });
    } catch (error) {
      return { title: 'Error', shortName: 'Error', buttons: [] };
    }
  }

  /**
   * More robust previous button clicking with fallback strategies
   */
  private async clickPreviousButtonRobust(page: Page): Promise<boolean> {
    try {
      // Strategy 1: Use the previous button detection
      const navButtons = await this.detectNavigationButtons(page);
      const previousButton = navButtons.find(b => b.type === 'previous' && b.isEnabled);
      
      if (!previousButton) {
        logger.debug('No previous button found');
        return false;
      }
      
      logger.debug(`Attempting to click previous button: "${previousButton.text}"`);
      
      // Try direct click first (no navigation wait)
      try {
        await page.click(previousButton.selector);
        logger.debug('Direct click succeeded');
        return true;
      } catch (error) {
        logger.debug(`Direct click failed: ${error}`);
      }
      
      // Strategy 2: Use evaluate to click
      try {
        const clicked = await page.evaluate((buttonText) => {
          const surveyBody = document.querySelector('#survey-body-container');
          const navigationArea = surveyBody?.nextElementSibling;
          
          if (!navigationArea) return false;
          
          const buttons = Array.from(navigationArea.querySelectorAll('button'));
          const button = buttons.find(b => {
            const btnText = b.textContent?.trim().toLowerCase() || '';
            return btnText.includes('prev') || btnText.includes('back') || btnText.includes('←');
          });
          
          if (button && !button.disabled) {
            button.click();
            return true;
          }
          return false;
        }, previousButton.text);
        
        if (clicked) {
          logger.debug('Evaluate click succeeded');
          return true;
        }
      } catch (error) {
        logger.debug(`Evaluate click failed: ${error}`);
      }
      
      return false;
    } catch (error) {
      logger.error('Error in clickPreviousButtonRobust:', error);
      return false;
    }
  }

  /**
   * Click the previous navigation button
   */
  private async clickPreviousButton(page: Page): Promise<void> {
    const navButtons = await this.detectNavigationButtons(page);
    const previousButton = navButtons.find(b => b.type === 'previous' && b.isEnabled);
    
    if (!previousButton) {
      throw new Error('No enabled previous button found');
    }
    
    logger.debug(`Clicking previous button: "${previousButton.text}"`);
    
    // Use Promise.all to wait for navigation while clicking the button
    const waitOptions = { 
      waitUntil: 'networkidle2' as const, 
      timeout: 10000 
    };
    
    try {
      const [response] = await Promise.all([
        page.waitForNavigation(waitOptions),
        page.click(previousButton.selector)
      ]);
      
      logger.debug(`Previous navigation completed with response status: ${response?.status() || 'unknown'}`);
    } catch (error) {
      logger.debug(`Failed to click previous button with selector ${previousButton.selector}, trying fallback method`);
      
      // Fallback method using evaluate
      try {
        const [response] = await Promise.all([
          page.waitForNavigation(waitOptions),
          page.evaluate((text) => {
            const surveyBody = document.querySelector('#survey-body-container');
            const navigationArea = surveyBody?.nextElementSibling;
            
            if (!navigationArea) {
              throw new Error('Navigation area not found');
            }
            
            const buttons = Array.from(navigationArea.querySelectorAll('button'));
            const button = buttons.find(b => {
              const btnText = b.textContent?.trim().toLowerCase() || '';
              return btnText.includes('prev') || btnText.includes('back') || btnText.includes('←');
            });
            
            if (button && !button.disabled) {
              button.click();
            } else {
              throw new Error('Previous button not found or disabled');
            }
          }, previousButton.text)
        ]);
        
        logger.debug(`Fallback previous navigation completed with response status: ${response?.status() || 'unknown'}`);
      } catch (fallbackError) {
        throw new Error(`Failed to click previous button: ${fallbackError}`);
      }
    }
  }

  /**
   * Wait for form transition after navigation
   */
  private async waitForFormTransition(page: Page): Promise<void> {
    try {
      // Wait for DOM changes
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify form content has loaded
      const hasContent = await page.evaluate(() => {
        const surveyBody = document.querySelector('#survey-body-container');
        return surveyBody && surveyBody.children.length > 0;
      });
      
      if (!hasContent) {
        throw new Error('Form content not loaded after transition');
      }
      
      logger.debug('Form transition completed successfully');
    } catch (error) {
      logger.error('Error waiting for form transition:', error);
      throw error;
    }
  }

  /**
   * Detect navigation buttons (copied from FormNavigator for independence)
   */
  private async detectNavigationButtons(page: Page): Promise<NavigationButton[]> {
    return await page.evaluate(() => {
      const surveyBodyContainer = document.querySelector('#survey-body-container');
      if (!surveyBodyContainer) {
        return [];
      }
      
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
        
        if (text.toLowerCase().includes('next') || text.includes('→')) {
          type = 'next';
        } else if (text.toLowerCase().includes('prev') || text.toLowerCase().includes('back') || text.includes('←')) {
          type = 'previous';
        } else if (text.toLowerCase().includes('finish') || text.toLowerCase().includes('submit')) {
          type = 'finish';
        }
        
        if (type) {
          let selector = '';
          if (button.id) {
            selector = `#${CSS.escape(button.id)}`;
          } else if (button.className) {
            selector = `button.${button.className.split(' ').join('.')}`;
          } else {
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
}