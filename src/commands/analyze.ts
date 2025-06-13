import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PuppeteerManager } from '../browser/puppeteer-manager';
import { FormNavigator } from '../form-analyzer/form-navigator';
import { SurveyFormDetector } from '../form-analyzer/survey-detector';
import { FormResetService } from '../form-analyzer/form-reset-service';
import { ScreenshotService } from '../services/screenshot-service';
import { logger } from '../utils/logger';
import { Survey, SurveyForm, SurveyTuple } from '../utils/types';

export async function analyzeSurvey(url: string, tuple: SurveyTuple): Promise<void> {
  const puppeteerManager = new PuppeteerManager();
  const formDetector = new SurveyFormDetector();
  const formNavigator = new FormNavigator();
  const formResetService = new FormResetService();
  const screenshotService = new ScreenshotService();
  
  try {
    logger.info('Launching browser...');
    await puppeteerManager.launch();
    
    logger.info('Navigating to survey...');
    await puppeteerManager.navigateToPage(url);
    
    // Set default viewport (767x1024)
    await screenshotService.setDefaultViewport(puppeteerManager.getPage());
    
    // Reset form to first form and clear any existing values
    logger.info('Checking if we need to navigate to first form...');
    const isFirstForm = await formResetService.isFirstForm(puppeteerManager.getPage());
    if (!isFirstForm) {
      logger.info('Not on first form, navigating to first form...');
      await formResetService.navigateToFirstForm(puppeteerManager.getPage());
    } else {
      logger.info('Already on first form');
    }
    
    const forms: SurveyForm[] = [];
    let formIndex = 0;
    let isLastForm = false;
    
    while (!isLastForm) {
      logger.info(`Analyzing form ${formIndex + 1}...`);
      
      // Clear any existing values from the form before analysis
      logger.info('Clearing any existing field values...');
      await formResetService.clearFormValues(puppeteerManager.getPage());
      
      // Take on-entry screenshot after clearing values
      const onEntryScreenshot = await screenshotService.takeOnEntryScreenshot(puppeteerManager.getPage(), {} as SurveyForm, formIndex, tuple);
      
      // Detect current form
      const form = await formDetector.detectSurveyForm(puppeteerManager.getPage(), tuple, screenshotService, formIndex);
      
      // Detect navigation buttons
      const navButtons = await formNavigator.detectNavigationButtons(puppeteerManager.getPage());
      form.navigationButtons = navButtons;
      form.formIndex = formIndex;
      
      // Set screenshot paths
      if (onEntryScreenshot) {
        form.onEntryScreenshot = onEntryScreenshot;
      }
      
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
          
          // Take on-exit screenshot before navigation
          logger.info('Taking on-exit screenshot before navigation...');
          const onExitScreenshot = await screenshotService.takeOnExitScreenshot(puppeteerManager.getPage(), form, formIndex, tuple);
          if (onExitScreenshot) {
            form.onExitScreenshot = onExitScreenshot;
          }
          
          logger.info('Clicking next button...');
          await formNavigator.clickNavigationButton(puppeteerManager.getPage(), 'next');
          
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
            const container = document.querySelector('#survey-body-container');
            if (!container) return { title: '', shortName: '', questionCount: 0, hasVASSlider: false };
            
            // Use same title detection logic as extractFormTitles()
            const allPs = container.querySelectorAll('p');
            let formTitleP = null;
            
            // Look for a p tag that has an h3 sibling in the same parent
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
            
            const title = formTitleP?.textContent?.trim() || 'Title not found';
            
            // Get short name (h3)
            const h3Elements = container.querySelectorAll('h3');
            const shortName = h3Elements.length > 0 ? h3Elements[0].textContent?.trim() || 'Short name not found' : 'Short name not found';
            
            // Count questions
            const questions = container.querySelectorAll('[class*="CardBox"]');
            
            // Check for VAS slider
            const hasVASSlider = container.querySelector('[class*="SliderTrack"]') !== null;
            
            return { title, shortName, questionCount: questions.length, hasVASSlider };
          });
          
          logger.info(`New form preview: "${newFormPreview.title}" (${newFormPreview.shortName}) with ${newFormPreview.questionCount} questions, VAS: ${newFormPreview.hasVASSlider}`);
          
          // Check if we're stuck by comparing both title AND short name
          if (newFormPreview.title === form.longTitle && 
              newFormPreview.shortName === form.shortName && 
              newFormPreview.questionCount === form.fields.length) {
            logger.warn('Detected same form after navigation (same title, short name, and question count). Stopping analysis.');
            break;
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

