import { Page } from 'puppeteer';
import { SurveyTuple, SurveyForm, SurveyField } from '../types/types.js';
import { logger } from '../utils/logger.js';
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
      
      // Get the full scrollable height of the container
      const scrollHeight = surveyBody.scrollHeight;
      const clientHeight = surveyBody.clientHeight;
      const offsetHeight = (surveyBody as HTMLElement).offsetHeight;
      
      // Also check the height needed to show all questions
      const questions = surveyBody.querySelectorAll('[class*="CardBox"]');
      let totalQuestionHeight = 0;
      
      questions.forEach(question => {
        const rect = question.getBoundingClientRect();
        totalQuestionHeight = Math.max(totalQuestionHeight, rect.bottom);
      });
      
      // Get the navigation area height as well
      const navigationArea = surveyBody.nextElementSibling;
      let navHeight = 0;
      if (navigationArea) {
        const navRect = navigationArea.getBoundingClientRect();
        navHeight = navRect.height;
      }
      
      // Calculate required height including scroll position
      const bodyRect = surveyBody.getBoundingClientRect();
      const requiredHeight = Math.max(
        scrollHeight,
        clientHeight, 
        offsetHeight,
        totalQuestionHeight - bodyRect.top + navHeight + 100 // Add padding
      );
      
      console.log('Height calculation:', {
        scrollHeight,
        clientHeight,
        offsetHeight,
        totalQuestionHeight,
        navHeight,
        requiredHeight,
        questionCount: questions.length
      });
      
      // Return integer value to avoid float precision issues with Puppeteer
      return Math.floor(requiredHeight);
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

      // Ensure height is an integer and within reasonable limits
      const maxViewportHeight = 16384; // Chrome's maximum viewport height
      const extendedHeight = Math.min(
        Math.floor(Math.max(formHeight + 200, currentViewport.height)),
        maxViewportHeight
      );
      
      logger.info(`Form height: ${formHeight}, extending viewport to: ${currentViewport.width}x${extendedHeight}`);

      // Extend viewport to include full form
      try {
        await page.setViewport({
          width: currentViewport.width,
          height: extendedHeight,
          deviceScaleFactor: currentViewport.deviceScaleFactor || 1
        });
      } catch (error) {
        logger.warn(`Failed to set extended viewport (${extendedHeight}px), falling back to scrolling approach:`, error);
        
        // Fallback: Use default viewport and scroll to capture full form
        await page.setViewport({
          width: currentViewport.width,
          height: Math.min(currentViewport.height, 2048), // Safe fallback height
          deviceScaleFactor: currentViewport.deviceScaleFactor || 1
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500)); // Allow viewport to adjust

      // Take screenshot
      const filename = `form${formIndex + 1}_entry_${tuple.customerId}_${tuple.studyId}_${tuple.language}.png`;
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

      // Ensure height is an integer and within reasonable limits
      const maxViewportHeight = 16384; // Chrome's maximum viewport height
      const extendedHeight = Math.min(
        Math.floor(Math.max(formHeight + 200, currentViewport.height)),
        maxViewportHeight
      );

      // Extend viewport to include full form
      try {
        await page.setViewport({
          width: currentViewport.width,
          height: extendedHeight,
          deviceScaleFactor: currentViewport.deviceScaleFactor || 1
        });
      } catch (error) {
        logger.warn(`Failed to set extended viewport for exit screenshot (${extendedHeight}px), falling back to scrolling approach:`, error);
        
        // Fallback: Use default viewport
        await page.setViewport({
          width: currentViewport.width,
          height: Math.min(currentViewport.height, 2048), // Safe fallback height
          deviceScaleFactor: currentViewport.deviceScaleFactor || 1
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500)); // Allow viewport to adjust

      // Take screenshot
      const filename = `form${formIndex + 1}_exit_${tuple.customerId}_${tuple.studyId}_${tuple.language}.png`;
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

  async takeFieldScreenshot(page: Page, field: SurveyField, questionIndex: number, tuple: SurveyTuple, formIndex?: number): Promise<string | undefined> {
    return this.takeQuestionScreenshot(page, field, questionIndex, tuple, formIndex);
  }

  async takeQuestionScreenshot(page: Page, field: SurveyField, questionIndex: number, tuple: SurveyTuple, formIndex?: number): Promise<string | undefined> {
    try {
      const questionNum = field.questionNumber && field.questionNumber.trim() 
        ? field.questionNumber.replace(/\./g, '') 
        : `s${questionIndex + 1}`;
      logger.debug(`Taking screenshot for question ${field.questionNumber}`);

      // Scroll question into view
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, field.cardBoxSelector);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Wait for element to be visible with shorter timeout and better error handling
      try {
        await page.waitForFunction((selector) => {
          const element = document.querySelector(selector) as HTMLElement;
          return element && element.offsetHeight > 0;
        }, { timeout: 10000 }, field.cardBoxSelector);
        logger.debug(`Element visible for question ${field.questionNumber}`);
      } catch (timeoutError) {
        logger.warn(`Element visibility timeout for question ${field.questionNumber}, selector: ${field.cardBoxSelector}. Checking if element exists at all...`);
        
        // Check if element exists even if not visible
        const elementExists = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          if (element) {
            const style = window.getComputedStyle(element);
            return {
              exists: true,
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              offsetHeight: (element as HTMLElement).offsetHeight,
              offsetWidth: (element as HTMLElement).offsetWidth
            };
          }
          return { exists: false };
        }, field.cardBoxSelector);
        
        logger.warn(`Element check result for ${field.questionNumber}:`, elementExists);
        
        // If element doesn't exist, throw the error
        if (!elementExists.exists) {
          throw new Error(`Element not found with selector: ${field.cardBoxSelector}`);
        }
        
        // If element exists but not visible, continue anyway with a warning
        logger.warn(`Element exists but not visible, continuing with screenshot attempt...`);
      }

      // Take screenshot of the CardBox frame containing the question
      const formNum = formIndex !== undefined ? formIndex + 1 : 1;
      const filename = `form${formNum}_question${questionNum}_${tuple.customerId}_${tuple.studyId}_${tuple.language}.png`;
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
        logger.debug(`Taking element screenshot with selector: ${selector}`);
        await element.screenshot({ path: screenshotPath } as any);
      } else {
        logger.warn(`Element not found for selector: ${selector}, falling back to full page screenshot`);
        // Fallback to full page if element not found
        await page.screenshot({ path: screenshotPath, fullPage: true } as any);
      }
    } else {
      // Take full page screenshot
      logger.debug(`Taking full page screenshot: ${filename}`);
      await page.screenshot({ path: screenshotPath, fullPage: true } as any);
    }

    return filename;
  }

  getDefaultViewport(): ViewportConfig {
    return { ...this.defaultViewport };
  }
}