import { PuppeteerManager } from '../browser/puppeteer-manager';
import { SurveyFormDetector } from '../form-analyzer/survey-detector';
import { FormNavigator } from '../form-analyzer/form-navigator';
import { SurveyTuple, Survey, SurveyForm } from '../utils/types';
import { logger } from '../utils/logger';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Page } from 'puppeteer';

export async function analyzeSurvey(url: string, tuple: SurveyTuple): Promise<void> {
  const puppeteerManager = new PuppeteerManager();
  const formDetector = new SurveyFormDetector();
  const formNavigator = new FormNavigator();
  
  try {
    logger.info('Launching browser...');
    await puppeteerManager.launch();
    
    logger.info('Navigating to survey...');
    await puppeteerManager.navigateToPage(url);
    
    const forms: SurveyForm[] = [];
    let formIndex = 0;
    let isLastForm = false;
    
    while (!isLastForm) {
      logger.info(`Analyzing form ${formIndex + 1}...`);
      
      // Detect current form
      const form = await formDetector.detectSurveyForm(puppeteerManager.getPage(), tuple);
      
      // Detect navigation buttons
      const navButtons = await formNavigator.detectNavigationButtons(puppeteerManager.getPage());
      form.navigationButtons = navButtons;
      form.formIndex = formIndex;
      
      logger.info(`Found form ${formIndex + 1}: "${form.longTitle}" with ${form.fields.length} fields`);
      logger.info(`Navigation buttons: ${navButtons.map(b => b.type).join(', ')}`);
      
      forms.push(form);
      
      // Check if this is the last form (has finish button)
      isLastForm = navButtons.some(b => b.type === 'finish');
      
      if (!isLastForm) {
        // Fill required fields and navigate to next form
        try {
          logger.info('Filling required fields...');
          await formNavigator.fillRequiredFields(puppeteerManager.getPage(), form.fields);
          
          // Take full form screenshot before navigation
          logger.info('Taking full form screenshot before navigation...');
          const screenshotFilename = await takeFullFormScreenshot(puppeteerManager.getPage(), form, formIndex, tuple);
          if (screenshotFilename) {
            form.fullFormScreenshot = screenshotFilename;
          }
          
          logger.info('Clicking next button...');
          await formNavigator.clickNavigationButton(puppeteerManager.getPage(), 'next');
          
          // Take viewport screenshot after clicking next
          logger.info('Taking viewport screenshot after navigation...');
          await takeViewportScreenshot(puppeteerManager.getPage(), formIndex, tuple);
          
          // Check for validation modal
          const hasModal = await formNavigator.detectValidationModal(puppeteerManager.getPage());
          if (hasModal) {
            logger.warn('Validation modal detected, closing and retrying...');
            await formNavigator.closeValidationModal(puppeteerManager.getPage());
            // Try to fill any missing fields and click next again
            await formNavigator.fillRequiredFields(puppeteerManager.getPage(), form.fields);
            await formNavigator.clickNavigationButton(puppeteerManager.getPage(), 'next');
          }
          
          // Wait for form transition
          const transitioned = await formNavigator.waitForFormTransition(puppeteerManager.getPage(), form.longTitle);
          if (!transitioned) {
            logger.error('Form transition failed, stopping analysis');
            break;
          }
          
          // Additional check: verify we're actually on a different form
          const newFormPreview = await puppeteerManager.getPage().evaluate(() => {
            const surveyBody = document.querySelector('#survey-body-container');
            if (!surveyBody) return { title: '', questionCount: 0 };
            
            // Get first title-like element
            const titleElement = surveyBody.querySelector('h1, h2, h3, p');
            const title = titleElement?.textContent?.trim() || '';
            
            // Count questions
            const questions = surveyBody.querySelectorAll('[class*="CardBox"]');
            
            return { title, questionCount: questions.length };
          });
          
          logger.info(`New form preview: "${newFormPreview.title}" with ${newFormPreview.questionCount} questions`);
          
          // If we have the same title and same number of questions, we might be stuck
          if (newFormPreview.title === form.longTitle && newFormPreview.questionCount === form.fields.length) {
            logger.warn('Detected same form after navigation, might be stuck. Stopping analysis.');
            break;
          }
          
          // Special check for GAD-7 which should have 7 questions
          if (newFormPreview.questionCount === 7) {
            logger.info('Found form with 7 questions - likely GAD-7');
          }
          
          formIndex++;
        } catch (error) {
          logger.error('Error navigating to next form:', error);
          break;
        }
      }
    }
    
    logger.info(`Analysis completed. Found ${forms.length} forms`);
    
    // Generate survey output
    const survey: Survey = {
      metadata: {
        tuple,
        analysisDate: new Date().toISOString(),
        url,
        totalForms: forms.length
      },
      forms
    };
    
    // Save results
    await saveResults(survey, tuple);
    
    logger.info(`Analysis completed successfully`);
    
  } finally {
    await puppeteerManager.close();
  }
}

async function saveResults(survey: Survey, tuple: SurveyTuple): Promise<void> {
  // Create output directory structure with proper permissions
  const outputDir = join('/app/output', tuple.customerId, tuple.studyId, tuple.packageName, tuple.language, tuple.version);
  try {
    mkdirSync(outputDir, { recursive: true, mode: 0o777 });
  } catch (error) {
    logger.warn('Failed to create output directory:', error);
    // Try fallback to current directory
    const fallbackDir = join(process.cwd(), 'output');
    mkdirSync(fallbackDir, { recursive: true });
    
    // Save to fallback location
    const analysisPath = join(fallbackDir, `analysis_${tuple.customerId}_${tuple.studyId}.json`);
    writeFileSync(analysisPath, JSON.stringify(survey, null, 2));
    logger.info(`Results saved to fallback location: ${analysisPath}`);
    return;
  }
  
  // Save main analysis JSON
  const analysisPath = join(outputDir, 'analysis.json');
  writeFileSync(analysisPath, JSON.stringify(survey, null, 2));
  
  logger.info(`Results saved to: ${analysisPath}`);
}

async function takeFullFormScreenshot(page: Page, form: SurveyForm, formIndex: number, tuple: SurveyTuple): Promise<string | undefined> {
  try {
    // Get current viewport
    const viewport = page.viewport();
    if (!viewport) {
      logger.warn('Could not get current viewport');
      return;
    }
    
    const originalHeight = viewport.height;
    logger.debug(`Original viewport height: ${originalHeight}`);
    
    // Get the full height needed for the form
    const formHeight = await page.evaluate(() => {
      const surveyBody = document.querySelector('#survey-body-container');
      if (!surveyBody) return 0;
      
      // Get the full scrollable height
      return Math.max(
        surveyBody.scrollHeight,
        surveyBody.clientHeight,
        (surveyBody as HTMLElement).offsetHeight
      );
    });
    
    if (formHeight === 0) {
      logger.warn('Could not determine form height');
      return;
    }
    
    logger.debug(`Form requires height: ${formHeight}`);
    
    // Set viewport to capture entire form
    await page.setViewport({
      width: viewport.width,
      height: Math.max(formHeight + 200, originalHeight), // Add some padding
      deviceScaleFactor: viewport.deviceScaleFactor || 1
    });
    
    // Wait a moment for viewport adjustment
    await page.waitForTimeout(500);
    
    // Create output directory if needed
    const outputDir = join('/app/output', tuple.customerId, tuple.studyId, tuple.packageName, tuple.language, tuple.version);
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch (error) {
      logger.warn('Failed to create screenshot directory:', error);
    }
    
    // Take screenshot of the survey body container
    const filename = `form_${formIndex + 1}_complete_${tuple.customerId}_${tuple.studyId}.png`;
    const screenshotPath = join(outputDir, filename);
    const surveyBodyElement = await page.$('#survey-body-container');
    
    if (surveyBodyElement) {
      await surveyBodyElement.screenshot({ 
        path: screenshotPath,
        fullPage: false // We want just the element, not the full page
      });
      logger.info(`Full form screenshot saved: ${filename}`);
    } else {
      // Fallback to full page screenshot
      await page.screenshot({ 
        path: screenshotPath,
        fullPage: true 
      });
      logger.info(`Full page screenshot saved: ${filename}`);
    }
    
    // Restore original viewport
    await page.setViewport({
      width: viewport.width,
      height: originalHeight,
      deviceScaleFactor: viewport.deviceScaleFactor || 1
    });
    
    logger.debug(`Viewport restored to height: ${originalHeight}`);
    
    // Wait a moment for viewport restoration
    await page.waitForTimeout(500);
    
    return filename;
    
  } catch (error) {
    logger.error('Failed to take full form screenshot:', error);
    return undefined;
  }
}

async function takeViewportScreenshot(page: Page, formIndex: number, tuple: SurveyTuple): Promise<void> {
  try {
    // Create output directory if needed
    const outputDir = join('/app/output', tuple.customerId, tuple.studyId, tuple.packageName, tuple.language, tuple.version);
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch (error) {
      logger.warn('Failed to create screenshot directory:', error);
    }
    
    // Take screenshot of the current viewport
    const filename = `form_${formIndex + 1}_after_next_${tuple.customerId}_${tuple.studyId}.png`;
    const screenshotPath = join(outputDir, filename);
    
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: false // Capture only the current viewport
    });
    
    logger.info(`Viewport screenshot saved: ${filename}`);
    
  } catch (error) {
    logger.error('Failed to take viewport screenshot:', error);
  }
}