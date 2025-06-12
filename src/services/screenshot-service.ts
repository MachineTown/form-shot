import { Page } from 'puppeteer';
import { SurveyTuple, SurveyForm, SurveyField } from '../utils/types';
import { logger } from '../utils/logger';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';

export interface ViewportConfig {
  width: number;
  height: number;
}

export class ScreenshotService {
  private defaultViewport: ViewportConfig = {
    width: 767,
    height: 1024
  };

  constructor(customViewport?: ViewportConfig) {
    if (customViewport) {
      this.defaultViewport = customViewport;
    }
  }

  async setDefaultViewport(page: Page): Promise<void> {
    await page.setViewport({
      width: this.defaultViewport.width,
      height: this.defaultViewport.height,
      deviceScaleFactor: 1
    });
    logger.debug(`Set default viewport: ${this.defaultViewport.width}x${this.defaultViewport.height}`);
  }

  async calculateFormHeight(page: Page): Promise<number> {
    return await page.evaluate(() => {
      const surveyBody = document.querySelector('#survey-body-container');
      if (!surveyBody) return 0;
      
      // Get the full scrollable height
      return Math.max(
        surveyBody.scrollHeight,
        surveyBody.clientHeight,
        (surveyBody as HTMLElement).offsetHeight
      );
    });
  }

  async takeOnEntryScreenshot(page: Page, form: SurveyForm, formIndex: number, tuple: SurveyTuple): Promise<string | undefined> {
    try {
      logger.info(`Taking on-entry screenshot for form ${formIndex + 1}`);
      
      // Get current viewport
      const currentViewport = page.viewport();
      if (!currentViewport) {
        logger.warn('Could not get current viewport');
        return;
      }

      // Calculate required height
      const formHeight = await this.calculateFormHeight(page);
      if (formHeight === 0) {
        logger.warn('Could not determine form height');
        return;
      }

      // Extend viewport to include full form
      await page.setViewport({
        width: currentViewport.width,
        height: Math.max(formHeight + 200, currentViewport.height),
        deviceScaleFactor: currentViewport.deviceScaleFactor || 1
      });

      await new Promise(resolve => setTimeout(resolve, 500)); // Allow viewport to adjust

      // Take screenshot
      const filename = `form_${formIndex + 1}_on_entry_${tuple.customerId}_${tuple.studyId}.png`;
      const screenshotPath = await this.saveScreenshot(page, filename, tuple, '#survey-body-container');

      // Restore original viewport
      await page.setViewport(currentViewport);
      await new Promise(resolve => setTimeout(resolve, 500));

      logger.info(`On-entry screenshot saved: ${filename}`);
      return filename;

    } catch (error) {
      logger.error('Failed to take on-entry screenshot:', error);
      return undefined;
    }
  }

  async takeOnExitScreenshot(page: Page, form: SurveyForm, formIndex: number, tuple: SurveyTuple): Promise<string | undefined> {
    try {
      logger.info(`Taking on-exit screenshot for form ${formIndex + 1}`);
      
      // Get current viewport
      const currentViewport = page.viewport();
      if (!currentViewport) {
        logger.warn('Could not get current viewport');
        return;
      }

      // Calculate required height
      const formHeight = await this.calculateFormHeight(page);
      if (formHeight === 0) {
        logger.warn('Could not determine form height');
        return;
      }

      // Extend viewport to include full form
      await page.setViewport({
        width: currentViewport.width,
        height: Math.max(formHeight + 200, currentViewport.height),
        deviceScaleFactor: currentViewport.deviceScaleFactor || 1
      });

      await new Promise(resolve => setTimeout(resolve, 500)); // Allow viewport to adjust

      // Take screenshot
      const filename = `form_${formIndex + 1}_on_exit_${tuple.customerId}_${tuple.studyId}.png`;
      const screenshotPath = await this.saveScreenshot(page, filename, tuple, '#survey-body-container');

      // Restore original viewport
      await page.setViewport(currentViewport);
      await new Promise(resolve => setTimeout(resolve, 500));

      logger.info(`On-exit screenshot saved: ${filename}`);
      return filename;

    } catch (error) {
      logger.error('Failed to take on-exit screenshot:', error);
      return undefined;
    }
  }

  async takeQuestionScreenshot(page: Page, field: SurveyField, questionIndex: number, tuple: SurveyTuple, formIndex?: number): Promise<string | undefined> {
    try {
      const questionNum = field.questionNumber.replace(/\./g, '');
      logger.debug(`Taking screenshot for question ${field.questionNumber}`);

      // Scroll question into view
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, field.cardBoxSelector);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Wait for element to be visible
      await page.waitForFunction((selector) => {
        const element = document.querySelector(selector) as HTMLElement;
        return element && element.offsetHeight > 0;
      }, {}, field.cardBoxSelector);

      // Take screenshot of the CardBox frame containing the question
      const formPrefix = formIndex !== undefined ? `form${formIndex + 1}_` : '';
      const filename = `${formPrefix}question_${questionNum}_${tuple.customerId}_${tuple.studyId}.png`;
      const screenshotPath = await this.saveScreenshot(page, filename, tuple, field.cardBoxSelector);

      logger.debug(`Question screenshot saved: ${filename}`);
      return filename;

    } catch (error) {
      logger.error(`Failed to take screenshot for question ${field.questionNumber}:`, error);
      return '';
    }
  }

  private async saveScreenshot(page: Page, filename: string, tuple: SurveyTuple, selector?: string): Promise<string> {
    // Create output directory
    const outputDir = join('/app/output', tuple.customerId, tuple.studyId, tuple.packageName, tuple.language, tuple.version);
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch (error) {
      logger.warn('Failed to create screenshot directory:', error);
    }

    const screenshotPath = join(outputDir, filename);

    if (selector) {
      // Take screenshot of specific element
      const element = await page.$(selector);
      if (element) {
        await element.screenshot({ path: screenshotPath } as any);
      } else {
        // Fallback to full page if element not found
        await page.screenshot({ path: screenshotPath, fullPage: true } as any);
      }
    } else {
      // Take full page screenshot
      await page.screenshot({ path: screenshotPath, fullPage: true } as any);
    }

    return filename;
  }

  getDefaultViewport(): ViewportConfig {
    return { ...this.defaultViewport };
  }
}