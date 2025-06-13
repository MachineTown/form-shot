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
    const maxAttempts = 10; // Prevent infinite loops
    
    while (attempts < maxAttempts) {
      const isFirst = await this.isFirstForm(page);
      if (isFirst) {
        logger.info('Reached first form');
        return;
      }
      
      // Click previous button
      try {
        await this.clickPreviousButton(page);
        await this.waitForFormTransition(page);
        attempts++;
        logger.info(`Clicked previous button, attempt ${attempts}`);
      } catch (error) {
        logger.warn(`Failed to click previous button on attempt ${attempts}:`, error);
        break;
      }
    }
    
    if (attempts >= maxAttempts) {
      logger.warn(`Reached maximum attempts (${maxAttempts}) trying to navigate to first form`);
    }
  }

  /**
   * Clear all field values on the current form using ActionMenu -> BaseButton
   */
  async clearFormValues(page: Page): Promise<void> {
    logger.info('Clearing form values...');
    
    try {
      // Find all CardBox elements that contain fields
      const cardBoxes = await page.$$('[class*="CardBox"]');
      logger.info(`Found ${cardBoxes.length} CardBox elements to check for clearing`);
      
      for (let i = 0; i < cardBoxes.length; i++) {
        try {
          await this.clearFieldValue(page, i);
          // Small delay between clearing fields
          await new Promise(resolve => setTimeout(resolve, 200));
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
    // Try to find ActionMenu button within this CardBox
    const actionMenuSelector = `[class*="CardBox"]:nth-of-type(${fieldIndex + 1}) [class*="ActionMenu"]`;
    
    const actionMenuButton = await page.$(actionMenuSelector);
    if (!actionMenuButton) {
      logger.debug(`No ActionMenu found for field ${fieldIndex + 1}`);
      return;
    }
    
    logger.debug(`Clicking ActionMenu for field ${fieldIndex + 1}`);
    await actionMenuButton.click();
    
    // Wait for popup menu to appear
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Look for BaseButton in the popup menu
    const baseButtonSelector = '[class*="BaseButton"]';
    const baseButton = await page.$(baseButtonSelector);
    
    if (baseButton) {
      logger.debug(`Clicking BaseButton to clear field ${fieldIndex + 1}`);
      await baseButton.click();
      
      // Wait for action to complete
      await new Promise(resolve => setTimeout(resolve, 200));
    } else {
      logger.debug(`No BaseButton found in popup for field ${fieldIndex + 1}`);
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