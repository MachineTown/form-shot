import { Page } from 'puppeteer';
import { SurveyForm, SurveyField, NavigationButton } from '../types/types.js';
import { logger } from '../utils/logger.js';
import { FormNavigator } from './form-navigator.js';

export class BaselineNavigator {
  private formNavigator: FormNavigator;

  constructor() {
    this.formNavigator = new FormNavigator();
  }

  /**
   * Fill fields and navigate to next form using EN baseline data
   */
  async navigateWithBaseline(
    page: Page,
    baselineForms: SurveyForm[],
    navDelay: number = 3000
  ): Promise<{ formIndex: number; isComplete: boolean }> {
    // This method now only handles filling fields and navigation for a single form
    const baselineForm = baselineForms[0];
    logger.info(`Filling fields and navigating using baseline: ${baselineForm.shortName}`);

    // Fill fields based on baseline data
    if (baselineForm.fields && baselineForm.fields.length > 0) {
      logger.info(`Filling ${baselineForm.fields.length} fields from baseline`);
      await this.fillFieldsFromBaseline(page, baselineForm.fields);
    }

    // Navigate to next form
    try {
      logger.info('Clicking next button to proceed to next form...');
      await this.formNavigator.clickNavigationButton(page, 'next', navDelay);
      
      // Check for validation modal
      const hasModal = await this.formNavigator.detectValidationModal(page);
      if (hasModal) {
        logger.warn('Validation modal detected, closing and retrying...');
        await this.formNavigator.closeValidationModal(page);
        // Try to fill any missing fields and click next again
        await this.formNavigator.fillMissingRequiredFields(page);
        await this.formNavigator.clickNavigationButton(page, 'next', navDelay);
      }
      
      // Wait for form transition
      const transitioned = await this.formNavigator.waitForFormTransition(page, baselineForm.longTitle);
      if (!transitioned) {
        logger.error('Form transition failed');
        return { formIndex: 0, isComplete: false };
      }
      
      return { formIndex: 0, isComplete: true };
    } catch (error) {
      logger.error('Error navigating to next form:', error);
      return { formIndex: 0, isComplete: false };
    }
  }

  /**
   * Fill fields based on baseline field data
   */
  private async fillFieldsFromBaseline(page: Page, baselineFields: SurveyField[]): Promise<void> {
    for (const field of baselineFields) {
      if (!field.isRequired) continue;

      try {
        // Check if field exists on current page
        const fieldExists = await page.evaluate((selector) => {
          return document.querySelector(selector) !== null;
        }, field.selector);

        if (!fieldExists) {
          logger.warn(`Field not found with selector: ${field.selector}`);
          continue;
        }

        // Fill field based on type
        switch (field.inputType) {
          case 'radio':
            // Select first option for radio buttons
            if (field.choices && field.choices.length > 0) {
              await this.selectRadioOption(page, field.cardBoxSelector, 0);
            }
            break;

          case 'dropdown':
            // Select first option for dropdowns
            if (field.choices && field.choices.length > 0) {
              await this.selectDropdownOption(page, field.selector, 0);
            }
            break;

          case 'text':
          case 'email':
          case 'number':
            // Fill with appropriate test value
            await this.fillTextField(page, field.selector, field.inputType);
            break;

          case 'textarea':
            await page.type(field.selector, 'Test response for multi-language analysis');
            break;

          case 'checkbox':
            // Check the checkbox if unchecked
            await page.evaluate((selector) => {
              const checkbox = document.querySelector(selector) as HTMLInputElement;
              if (checkbox && !checkbox.checked) {
                checkbox.click();
              }
            }, field.selector);
            break;

          case 'VAS':
            // Click in the middle of the slider
            await this.clickVASSlider(page, field.cardBoxSelector);
            break;

          default:
            logger.warn(`Unknown field type: ${field.inputType}`);
        }

        // Small delay between fields
        await page.waitForFunction(() => new Promise(resolve => setTimeout(resolve, 200)));
      } catch (error) {
        logger.error(`Error filling field ${field.questionNumber}:`, error);
      }
    }
  }

  private async selectRadioOption(page: Page, cardBoxSelector: string, position: number): Promise<void> {
    await page.evaluate((cardSelector, pos) => {
      const cardBox = document.querySelector(cardSelector);
      if (cardBox) {
        const radioInputs = cardBox.querySelectorAll('input[type="radio"]');
        if (radioInputs[pos]) {
          (radioInputs[pos] as HTMLInputElement).click();
        }
      }
    }, cardBoxSelector, position);
  }

  private async selectDropdownOption(page: Page, selector: string, position: number): Promise<void> {
    const selectElement = await page.$(selector);
    if (selectElement) {
      const options = await page.$$eval(selector + ' option', opts => opts.map(opt => (opt as HTMLOptionElement).value));
      if (options[position + 1]) { // Skip first empty option
        await page.select(selector, options[position + 1]);
      }
    }
  }

  private async fillTextField(page: Page, selector: string, fieldType: string): Promise<void> {
    let value = 'Test';
    switch (fieldType) {
      case 'email':
        value = 'test@example.com';
        break;
      case 'number':
        value = '25';
        break;
      case 'text':
      default:
        value = 'Test Response';
        break;
    }
    
    await page.click(selector);
    await page.evaluate(sel => {
      const input = document.querySelector(sel) as HTMLInputElement;
      if (input) input.value = '';
    }, selector);
    await page.type(selector, value);
  }

  private async clickVASSlider(page: Page, cardBoxSelector: string): Promise<void> {
    await page.evaluate((cardSelector) => {
      const cardBox = document.querySelector(cardSelector);
      if (cardBox) {
        const sliderTrack = cardBox.querySelector('[class*="SliderTrack"]');
        if (sliderTrack) {
          const rect = sliderTrack.getBoundingClientRect();
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          });
          sliderTrack.dispatchEvent(clickEvent);
        }
      }
    }, cardBoxSelector);
  }

  private async extractCurrentFormTitles(page: Page): Promise<{ longTitle: string; shortName: string }> {
    return await page.evaluate(() => {
      const container = document.querySelector('#survey-body-container');
      if (!container) return { longTitle: '', shortName: '' };
      
      // Use same title detection logic as form detector
      const allPs = container.querySelectorAll('p');
      let formTitleP = null;
      
      for (const p of allPs) {
        const parent = p.parentElement;
        if (parent) {
          const h3InParent = parent.querySelector('h3');
          if (h3InParent) {
            formTitleP = p;
            break;
          }
        }
      }
      
      const longTitle = formTitleP?.textContent?.trim() || '';
      
      // Get short name (h3)
      const h3Elements = container.querySelectorAll('h3');
      const shortName = h3Elements.length > 0 ? h3Elements[0].textContent?.trim() || '' : '';
      
      return { longTitle, shortName };
    });
  }
}