import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { 
  PuppeteerManager,
  FormNavigator,
  SurveyFormDetector,
  FormResetService,
  ScreenshotService,
  logger,
  Survey,
  SurveyForm,
  SurveyTuple
} from '@form-shot/shared';

export async function analyzeSurvey(url: string, tuple: SurveyTuple, navDelay: number = 3000): Promise<void> {
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
      await formResetService.navigateToFirstForm(puppeteerManager.getPage(), navDelay);
    } else {
      logger.info('Already on first form');
    }
    
    const forms: SurveyForm[] = [];
    let formIndex = 0;
    let isLastForm = false;
    
    while (!isLastForm) {
      logger.info(`Analyzing form ${formIndex + 1}...`);
      
      // Clear any existing values from the form before analysis (skip for cover/intro forms)
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
      
      // Debug: Log field details for forms with few fields
      if (form.fields.length <= 3) {
        form.fields.forEach(field => {
          logger.info(`  Field ${field.questionNumber}: "${field.questionText}" (type: ${field.inputType}, required: ${field.isRequired})`);
        });
      }
      
      forms.push(form);
      
      // Check if this is the last form (has finish button)
      isLastForm = navButtons.some(b => b.type === 'finish');
      
      if (!isLastForm) {
        // Fill required fields and navigate to next form
        try {
          // Check if this is an informational form (no fields)
          if (form.fields.length === 0) {
            logger.info('Form appears to have no input fields - checking if it might be a dynamic form');
            
            // Try clicking next to see if it triggers validation or reveals fields
            logger.info('Attempting navigation to check for dynamic content...');
            try {
              await formNavigator.clickNavigationButton(puppeteerManager.getPage(), 'next', 500); // Short delay for test
              
              // Check if we got a validation modal
              await new Promise(resolve => setTimeout(resolve, 1000));
              const hasModal = await formNavigator.detectValidationModal(puppeteerManager.getPage());
              
              if (hasModal) {
                logger.info('Validation modal appeared - form has hidden required fields');
                await formNavigator.closeValidationModal(puppeteerManager.getPage());
                
                // Re-analyze the form to find the now-visible fields
                await new Promise(resolve => setTimeout(resolve, 1000));
                const redetectedForm = await formDetector.detectSurveyForm(puppeteerManager.getPage(), tuple, screenshotService, formIndex);
                
                if (redetectedForm.fields.length > 0) {
                  logger.info(`Re-analysis found ${redetectedForm.fields.length} fields - this is a dynamic form`);
                  form.fields = redetectedForm.fields;
                  forms[forms.length - 1] = form; // Update the form in the array
                  
                  // Fill the fields
                  const allFields = await formNavigator.fillRequiredFields(puppeteerManager.getPage(), form.fields);
                  form.fields = allFields;
                } else {
                  logger.info('No fields found even after validation modal - treating as informational form');
                }
              } else {
                // Check if we actually navigated
                const transitioned = await formNavigator.waitForFormTransition(puppeteerManager.getPage(), form.longTitle);
                if (transitioned) {
                  logger.info('Form transitioned without fields - it was truly informational');
                  // We've already moved to the next form, so continue from there
                  formIndex++;
                  continue;
                }
              }
            } catch (error) {
              logger.warn('Error during dynamic form check:', error);
            }
          } else {
            logger.info('Filling required fields...');
            const allFields = await formNavigator.fillRequiredFields(puppeteerManager.getPage(), form.fields);
            
            // Update form fields to include any conditional fields that were discovered
            form.fields = allFields;
            
            // Take screenshots for any conditional fields that don't have them yet
            for (const field of allFields) {
              if (!field.screenshotPath && field.conditionalInfo?.isConditional) {
                // Check if field is actually visible before taking screenshot
                const isVisible = await puppeteerManager.getPage().evaluate((selector) => {
                  const element = document.querySelector(selector);
                  if (!element) return false;
                  
                  const style = window.getComputedStyle(element);
                  const htmlElement = element as HTMLElement;
                  return style.display !== 'none' && 
                         style.visibility !== 'hidden' && 
                         style.opacity !== '0' &&
                         htmlElement.offsetHeight > 0 && 
                         htmlElement.offsetWidth > 0;
                }, field.cardBoxSelector);
                
                if (isVisible) {
                  logger.info(`Taking screenshot for conditional field ${field.questionNumber}`);
                  const screenshot = await screenshotService.takeFieldScreenshot(
                    puppeteerManager.getPage(), 
                    field, 
                    allFields.indexOf(field), 
                    tuple,
                    formIndex
                  );
                  if (screenshot) {
                    field.screenshotPath = screenshot;
                  }
                } else {
                  logger.warn(`Skipping screenshot for conditional field ${field.questionNumber} - element not visible (selector: ${field.cardBoxSelector})`);
                }
              }
            }
          }
          
          // Take on-exit screenshot before navigation (for all forms, including informational)
          logger.info('Taking on-exit screenshot before navigation...');
          const onExitScreenshot = await screenshotService.takeOnExitScreenshot(puppeteerManager.getPage(), form, formIndex, tuple);
          if (onExitScreenshot) {
            form.onExitScreenshot = onExitScreenshot;
          }
          
          logger.info('Clicking next button...');
          await formNavigator.clickNavigationButton(puppeteerManager.getPage(), 'next', navDelay);
          
          // Check for validation modal
          const hasModal = await formNavigator.detectValidationModal(puppeteerManager.getPage());
          if (hasModal) {
            logger.warn('Validation modal detected, closing and retrying...');
            await formNavigator.closeValidationModal(puppeteerManager.getPage());
            // Try to fill any missing fields (including conditional fields) and click next again
            await formNavigator.fillMissingRequiredFields(puppeteerManager.getPage());
            await formNavigator.clickNavigationButton(puppeteerManager.getPage(), 'next', navDelay);
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
            if (!container) return { title: '', shortName: '', questionCount: 0, hasVASSlider: false, questionText: '' };
            
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
            
            // Get first question text for comparison
            let questionText = '';
            if (questions.length > 0) {
              const firstQuestion = questions[0];
              const questionTextElement = firstQuestion.querySelector('h4, h5, h6, p, span, div[class*="question"], [class*="Question"]');
              questionText = questionTextElement?.textContent?.trim().substring(0, 100) || '';
            }
            
            return { title, shortName, questionCount: questions.length, hasVASSlider, questionText };
          });
          
          logger.info(`New form preview: "${newFormPreview.title}" (${newFormPreview.shortName}) with ${newFormPreview.questionCount} questions, VAS: ${newFormPreview.hasVASSlider}`);
          logger.info(`Question text preview: "${newFormPreview.questionText.substring(0, 50)}..."`);
          
          // Check if we're stuck by comparing short name AND question text content (more specific than just counts)
          const currentQuestionText = form.fields.length > 0 ? form.fields[0].questionText.substring(0, 100) : '';
          
          if (newFormPreview.shortName === form.shortName && 
              newFormPreview.questionText === currentQuestionText) {
            logger.warn(`Detected same form after navigation (same short name "${form.shortName}" and question text). Stopping analysis.`);
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

