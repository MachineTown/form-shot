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
    const requiredFields = fields.filter(f => f.isRequired);
    logger.info(`Filling ${requiredFields.length} required fields`);
    
    for (const field of requiredFields) {
      try {
        await this.fillField(page, field);
        // Small delay between fields to simulate user interaction
        await page.waitForTimeout(300);
      } catch (error) {
        logger.error(`Failed to fill field ${field.questionNumber}:`, error);
        throw error;
      }
    }
  }
  
  private async fillField(page: Page, field: SurveyField): Promise<void> {
    logger.debug(`Filling field ${field.questionNumber} (${field.inputType})`);
    
    // Get the first test case value
    const testValue = field.testData?.testCases[0]?.value;
    if (!testValue) {
      logger.warn(`No test data available for field ${field.questionNumber}`);
      return;
    }
    
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
        // For radio buttons, select by index
        const radioIndex = typeof testValue === 'number' ? testValue : 0;
        const radioSelector = `${field.selector}:nth-of-type(${radioIndex + 1})`;
        await page.click(radioSelector);
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
          await page.waitForTimeout(500);
          return;
        }
      } catch (error) {
        // Continue trying other selectors
      }
    }
    
    // If no close button found, try pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  
  async clickNavigationButton(page: Page, type: 'next' | 'previous' | 'finish'): Promise<void> {
    const buttons = await this.detectNavigationButtons(page);
    const button = buttons.find(b => b.type === type && b.isEnabled);
    
    if (!button) {
      throw new Error(`No enabled ${type} button found`);
    }
    
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
      // Wait for navigation to complete (URL change or DOM update)
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {
        // If no navigation, wait for DOM changes
        return page.waitForTimeout(2000);
      });
      
      // Check if we're on a new form by looking for title changes
      const hasNewForm = await page.evaluate((prevTitle) => {
        // Look for title elements within survey-body-container
        const surveyBody = document.querySelector('#survey-body-container');
        if (!surveyBody) return false;
        
        // Check for form titles
        const titleSelectors = ['h1', 'h2', 'h3', 'p', '[class*="title"]'];
        for (const selector of titleSelectors) {
          const elements = surveyBody.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.textContent?.trim() || '';
            // Look for a different title that's not empty and not the previous one
            if (text && text.length > 3 && text !== prevTitle) {
              // Also check if there are new question fields
              const newQuestions = surveyBody.querySelectorAll('[class*="CardBox"]');
              if (newQuestions.length > 0) {
                return true;
              }
            }
          }
        }
        
        // Alternative: check if question numbers have reset (indicating new form)
        const firstQuestion = surveyBody.querySelector('[class*="CardBox"]');
        if (firstQuestion) {
          const questionText = firstQuestion.textContent || '';
          if (questionText.match(/^1\.\s/)) {
            // First question starts with "1." - likely a new form
            return true;
          }
        }
        
        return false;
      }, previousTitle);
      
      return hasNewForm;
    } catch (error) {
      logger.error('Error waiting for form transition:', error);
      return false;
    }
  }
}