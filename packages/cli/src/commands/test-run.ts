import { 
  PuppeteerManager, 
  FirestoreService, 
  logger, 
  SurveyTuple, 
  TestRunResult, 
  TestCaseResult 
} from '@form-shot/shared';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

export interface TestRunOptions {
  analysisId: string;
  url: string;
  outputDir?: string;
  delay?: number;
  skipValidation?: boolean;
  leaveFiles?: boolean;
  screenWidth?: number;
}

export async function runTests(options: TestRunOptions): Promise<TestRunResult> {
  const firestoreService = new FirestoreService();
  const puppeteerManager = new PuppeteerManager();
  
  const startTime = new Date();
  const outputDir = options.outputDir || './output/test-runs';
  
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const runId = `${options.analysisId}_${startTime.getTime()}`;
  const runOutputDir = join(outputDir, runId);
  mkdirSync(runOutputDir, { recursive: true });
  
  logger.info(`Starting test run for analysis: ${options.analysisId}`);
  logger.info(`Test run ID: ${runId}`);
  logger.info(`Output directory: ${runOutputDir}`);
  
  try {
    // Get analysis data with test cases from Firestore
    logger.info('Retrieving analysis data from Firestore...');
    const analysisData = await firestoreService.getAnalysisWithTestCases(options.analysisId);
    
    if (!analysisData.fields || analysisData.fields.length === 0) {
      throw new Error('No fields found in analysis data');
    }
    
    logger.info(`Found ${analysisData.fields.length} fields with test data`);
    
    // Initialize browser
    logger.info('Initializing browser...');
    await puppeteerManager.launch();
    const page = puppeteerManager.getPage();
    
    // Set viewport with custom width if provided
    const viewportWidth = options.screenWidth || 767;
    logger.info(`Setting viewport width to ${viewportWidth}px`);
    await page.setViewport({ width: viewportWidth, height: 1024, deviceScaleFactor: 1 });
    
    // Navigate to the form
    logger.info(`Navigating to: ${options.url}`);
    await page.goto(options.url, { waitUntil: 'networkidle2' });
    
    // Wait for survey container
    await page.waitForSelector('#survey-body-container', { timeout: 10000 });
    
    // Add a wait to ensure form is fully loaded and any dynamic content has rendered
    logger.info('Waiting for form to fully load...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Import necessary services for form navigation
    const { FormNavigator, FormResetService } = await import('@form-shot/shared');
    const formNavigator = new FormNavigator();
    const formResetService = new FormResetService();
    
    // Check if we need to navigate to first form
    logger.info('Checking if we need to navigate to first form...');
    const isFirstForm = await formResetService.isFirstForm(page);
    if (!isFirstForm) {
      logger.info('Not on first form, navigating to first form...');
      await formResetService.navigateToFirstForm(page, 3000);
    } else {
      logger.info('Already on first form');
    }
    
    const results: TestCaseResult[] = [];
    let fieldsProcessed = 0;
    let testCasesExecuted = 0;
    let successfulTestCases = 0;
    let failedTestCases = 0;
    let validationErrorsFound = 0;
    
    // Group fields by form index
    const fieldsByForm = new Map<number, any[]>();
    for (const field of analysisData.fields) {
      const formIndex = field.formIndex || 0;
      if (!fieldsByForm.has(formIndex)) {
        fieldsByForm.set(formIndex, []);
      }
      fieldsByForm.get(formIndex)!.push(field);
    }
    
    // Sort forms by index
    const sortedFormIndices = Array.from(fieldsByForm.keys()).sort((a, b) => a - b);
    logger.info(`Found ${sortedFormIndices.length} forms to process`);
    
    // Process each form
    for (const formIndex of sortedFormIndices) {
      const formFields = fieldsByForm.get(formIndex)!;
      logger.info(`\n=== Processing Form ${formIndex + 1} with ${formFields.length} fields ===`);
      
      // Add form state debugging
      logger.info(`Checking current form state before processing form ${formIndex + 1}...`);
      const currentFormInfo = await page.evaluate(() => {
        const container = document.querySelector('#survey-body-container');
        if (!container) return { error: 'No survey container found' };
        
        // Get form title
        const pElements = container.querySelectorAll('p');
        const h3Elements = container.querySelectorAll('h3');
        const longTitle = pElements[0]?.textContent?.trim() || 'Unknown';
        const shortName = h3Elements[0]?.textContent?.trim() || 'Unknown';
        
        // Get visible questions
        const visibleQuestions: string[] = [];
        const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
        cardBoxes.forEach((box) => {
          const style = window.getComputedStyle(box);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            const text = box.textContent || '';
            const match = text.match(/^(\d+\.?\d*\.?)/);
            if (match) {
              visibleQuestions.push(match[1]);
            }
          }
        });
        
        // Get navigation buttons
        const navArea = container.nextElementSibling;
        const buttons: string[] = [];
        if (navArea) {
          const buttonElements = navArea.querySelectorAll('button');
          buttonElements.forEach(btn => {
            if (!btn.disabled) {
              buttons.push(btn.textContent?.trim() || '');
            }
          });
        }
        
        return {
          longTitle,
          shortName,
          visibleQuestions,
          visibleQuestionCount: visibleQuestions.length,
          navigationButtons: buttons,
          hasContent: container.children.length > 0
        };
      });
      
      logger.info(`Current form state:`, JSON.stringify(currentFormInfo, null, 2));
      
      // Verify we're on the right form
      if (formIndex > 0 && currentFormInfo.visibleQuestionCount === 0) {
        logger.warn(`⚠️ Form ${formIndex + 1} appears to have no visible questions. Navigation may have failed.`);
      }
      
      // Sort fields within the form by order
      const sortedFields = formFields.sort((a: any, b: any) => a.order - b.order);
      
      // Process fields in the current form
      for (const field of sortedFields) {
        if (!field.testData || !field.testData.testCases || field.testData.testCases.length === 0) {
          logger.info(`Skipping field ${field.questionNumber} - no test cases`);
          continue;
        }
        
        logger.info(`Processing field ${field.questionNumber}: "${field.questionText}"`);
        
        // Check if this field is actually visible on the current form
        const isFieldVisible = await page.evaluate((questionNum: string) => {
          const container = document.querySelector('#survey-body-container');
          if (!container) return false;
          
          const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
          for (const box of cardBoxes) {
            const text = box.textContent || '';
            if (text.includes(questionNum)) {
              const style = window.getComputedStyle(box);
              return style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     (box as HTMLElement).offsetHeight > 0;
            }
          }
          return false;
        }, field.questionNumber);
        
        if (!isFieldVisible) {
          logger.warn(`⚠️ Field ${field.questionNumber} is not visible on current form. It may be on a different form or conditional. Skipping...`);
          continue;
        }
        
        fieldsProcessed++;
        
        // Process test cases for this field
        for (const testCase of field.testData.testCases) {
          const testCaseStart = Date.now();
          testCasesExecuted++;
          
          logger.info(`  Executing test case: ${testCase.id} (${testCase.description})`);
          
          const result: TestCaseResult = {
            fieldId: field.id,
            testCaseId: testCase.id,
            questionNumber: field.questionNumber,
            testCaseValue: testCase.value,
            applied: false,
            validationTriggered: false,
            validationMessages: [],
            screenshotPath: '',
            duration: 0
          };
          
          try {
            // Apply test case value to field
            await applyTestCaseValue(page, field, testCase);
            result.applied = true;
            
            // Move focus away to trigger validation
            await page.keyboard.press('Tab');
            
            // Wait for potential validation
            if (!options.skipValidation) {
              await new Promise(resolve => setTimeout(resolve, options.delay || 500));
              
              // Check for validation messages
              const validationResult = await checkValidationMessages(page, field);
              result.validationTriggered = validationResult.triggered;
              result.validationMessages = validationResult.messages;
              
              if (result.validationTriggered) {
                validationErrorsFound++;
                logger.info(`    Validation triggered: ${result.validationMessages.join(', ')}`);
              }
            }
            
            // Take screenshot of the field
            const screenshotPath = await captureFieldScreenshot(
              page, 
              field, 
              testCase, 
              runOutputDir
            );
            result.screenshotPath = screenshotPath;
            
            successfulTestCases++;
            logger.info(`    ✅ Test case completed successfully`);
            
          } catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
            failedTestCases++;
            logger.error(`    ❌ Test case failed: ${result.error}`);
          }
          
          result.duration = Date.now() - testCaseStart;
          results.push(result);
          
          // Small delay between test cases
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Delay between fields
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // After processing all fields in the form, navigate to next form if not the last
      if (formIndex < sortedFormIndices[sortedFormIndices.length - 1]) {
        logger.info(`\nPreparing to navigate from form ${formIndex + 1} to form ${formIndex + 2}...`);
        
        try {
          // First, fill any required fields that haven't been filled yet
          logger.info('Checking for unfilled required fields before navigation...');
          await formNavigator.fillMissingRequiredFields(page);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Detect navigation buttons
          const navButtons = await formNavigator.detectNavigationButtons(page);
          logger.info(`Available navigation buttons: ${navButtons.map(b => `${b.type}(${b.text})`).join(', ')}`);
          
          const nextButton = navButtons.find(b => b.type === 'next' && b.isEnabled);
          
          if (nextButton) {
            // Take screenshot before navigation
            const beforeNavPath = join(runOutputDir, `before_nav_form${formIndex + 1}_to_form${formIndex + 2}.png`) as `${string}.png`;
            await page.screenshot({ 
              path: beforeNavPath,
              fullPage: true 
            });
            
            // Click next button to go to next form
            logger.info(`Clicking next button: "${nextButton.text}"`);
            await formNavigator.clickNavigationButton(page, 'next', 3000);
            
            // Wait for form transition
            logger.info('Waiting for form transition...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if navigation was successful
            const afterNavInfo = await page.evaluate(() => {
              const container = document.querySelector('#survey-body-container');
              if (!container) return { error: 'No container' };
              
              const pElements = container.querySelectorAll('p');
              const h3Elements = container.querySelectorAll('h3');
              const cardBoxes = container.querySelectorAll('[class*="CardBox"]');
              
              return {
                longTitle: pElements[0]?.textContent?.trim() || 'Unknown',
                shortName: h3Elements[0]?.textContent?.trim() || 'Unknown',
                visibleCardBoxCount: cardBoxes.length,
                hasContent: container.children.length > 0
              };
            });
            
            logger.info(`After navigation state:`, JSON.stringify(afterNavInfo, null, 2));
            
            // Take screenshot after navigation
            const afterNavPath = join(runOutputDir, `after_nav_to_form${formIndex + 2}.png`) as `${string}.png`;
            await page.screenshot({ 
              path: afterNavPath,
              fullPage: true 
            });
            
            // Check for validation modal
            const hasModal = await formNavigator.detectValidationModal(page);
            if (hasModal) {
              logger.warn('Validation modal detected, closing and retrying...');
              await formNavigator.closeValidationModal(page);
              // Try to fill any missing required fields and navigate again
              await formNavigator.fillMissingRequiredFields(page);
              await formNavigator.clickNavigationButton(page, 'next', 3000);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // Clear any existing values on the new form
            logger.info(`Clearing any existing values on form ${formIndex + 2}...`);
            await formResetService.clearFormValues(page);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } else {
            logger.warn(`No enabled next button found on form ${formIndex + 1}`);
            logger.warn(`Available buttons: ${navButtons.map(b => `${b.type}(${b.text}, enabled:${b.isEnabled})`).join(', ')}`);
          }
        } catch (navError) {
          logger.error(`Failed to navigate from form ${formIndex + 1}:`, navError);
          // Continue with next form anyway
        }
      }
    }
    
    const endTime = new Date();
    const totalDuration = endTime.getTime() - startTime.getTime();
    
    const testRunResult: TestRunResult = {
      analysisId: options.analysisId,
      url: options.url,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalDuration,
      fieldsProcessed,
      testCasesExecuted,
      successfulTestCases,
      failedTestCases,
      validationErrorsFound,
      results
    };
    
    // Save test run results locally first
    const resultPath = join(runOutputDir, 'test-run-results.json');
    await require('fs').promises.writeFile(
      resultPath, 
      JSON.stringify(testRunResult, null, 2), 
      'utf8'
    );
    
    // Upload results to Firestore and Cloud Storage
    logger.info('Uploading test run results to Firestore and Cloud Storage...');
    await firestoreService.uploadTestRunResults(testRunResult, runOutputDir);
    
    logger.info(`\n📊 Test Run Summary:`);
    logger.info(`   Analysis ID: ${options.analysisId}`);
    logger.info(`   Fields Processed: ${fieldsProcessed}`);
    logger.info(`   Test Cases Executed: ${testCasesExecuted}`);
    logger.info(`   Successful: ${successfulTestCases}`);
    logger.info(`   Failed: ${failedTestCases}`);
    logger.info(`   Validation Errors Found: ${validationErrorsFound}`);
    logger.info(`   Duration: ${Math.round(totalDuration / 1000)}s`);
    logger.info(`   Results saved to: ${resultPath}`);
    logger.info(`   ✅ Results uploaded to Firestore and Cloud Storage`);
    
    // Clean up local files unless --leave flag is set
    if (!options.leaveFiles) {
      logger.info('Cleaning up local output files...');
      try {
        rmSync(runOutputDir, { recursive: true, force: true });
        logger.info('Local files cleaned up successfully');
      } catch (error) {
        logger.warn('Failed to clean up local files:', error);
      }
    } else {
      logger.info('Local files retained (--leave flag set)');
    }
    
    return testRunResult;
    
  } finally {
    await puppeteerManager.close();
  }
}

async function applyTestCaseValue(page: any, field: any, testCase: any): Promise<void> {
  const selector = field.selector || field.cardBoxSelector;
  
  if (!selector) {
    throw new Error(`No selector found for field ${field.questionNumber}`);
  }
  
  // Wait for element to be available - be more flexible with generic selectors
  try {
    if (selector.endsWith('[class*="CardBox"]')) {
      // For generic selectors, just ensure the survey container is there
      await page.waitForSelector('#survey-body-container', { timeout: 5000 });
    } else {
      await page.waitForSelector(selector, { timeout: 5000 });
    }
  } catch (error) {
    logger.warn(`Could not wait for selector ${selector}, proceeding anyway`);
  }
  
  switch (field.inputType.toLowerCase()) {
    case 'vas':
      await applyVASValue(page, field, testCase);
      break;
      
    case 'nrs':
      await applyNRSValue(page, field, testCase);
      break;
      
    case 'radio':
      await applyRadioValue(page, field, testCase);
      break;
      
    case 'dropdown':
    case 'select':
      await applySelectValue(page, field, testCase);
      break;
      
    case 'autocomplete_dropdown':
      await applyAutocompleteDropdownValue(page, field, testCase);
      break;
      
    case 'text':
    case 'email':
    case 'number':
    case 'tel':
      await applyTextValue(page, field, testCase);
      break;
      
    case 'date':
      await applyDateValue(page, field, testCase);
      break;
      
    case 'textarea':
      await applyTextareaValue(page, field, testCase);
      break;
      
    case 'checkbox':
      await applyCheckboxValue(page, field, testCase);
      break;
      
    default:
      logger.warn(`Unsupported input type: ${field.inputType}`);
      await applyTextValue(page, field, testCase);
  }
}

async function applyVASValue(page: any, field: any, testCase: any): Promise<void> {
  // For VAS sliders, find the SliderTrack element and click on it
  const sliderSelector = `${field.cardBoxSelector} [class*="SliderTrack"]`;
  
  // Wait for slider track to be available
  await page.waitForSelector(sliderSelector, { timeout: 5000 });
  
  const sliderTrack = await page.$(sliderSelector);
  if (!sliderTrack) {
    throw new Error(`VAS slider track not found for field ${field.questionNumber}`);
  }
  
  // Get the bounding box of the slider track
  const boundingBox = await sliderTrack.boundingBox();
  if (!boundingBox) {
    throw new Error(`Could not get bounding box for VAS slider in field ${field.questionNumber}`);
  }
  
  // Determine click position based on test case value
  // Value can be 'low', 'middle', 'high' or a number 0-100
  let clickX: number;
  let clickY: number;
  
  if (typeof testCase.value === 'string') {
    switch (testCase.value.toLowerCase()) {
      case 'low':
      case 'bottom':
        clickX = boundingBox.x + boundingBox.width * 0.1; // 10% from left
        clickY = boundingBox.y + boundingBox.height / 2;
        break;
      case 'middle':
      case 'center':
        clickX = boundingBox.x + boundingBox.width / 2; // Center
        clickY = boundingBox.y + boundingBox.height / 2;
        break;
      case 'high':
      case 'top':
        clickX = boundingBox.x + boundingBox.width * 0.9; // 90% from left
        clickY = boundingBox.y + boundingBox.height / 2;
        break;
      default:
        // Default to middle if unknown string value
        clickX = boundingBox.x + boundingBox.width / 2;
        clickY = boundingBox.y + boundingBox.height / 2;
    }
  } else if (typeof testCase.value === 'number') {
    // Treat number as percentage (0-100)
    const percentage = Math.max(0, Math.min(100, testCase.value)) / 100;
    clickX = boundingBox.x + boundingBox.width * percentage;
    clickY = boundingBox.y + boundingBox.height / 2;
  } else {
    // Default to middle for any other value type
    clickX = boundingBox.x + boundingBox.width / 2;
    clickY = boundingBox.y + boundingBox.height / 2;
  }
  
  // Click on the calculated position
  await page.mouse.click(clickX, clickY);
  
  logger.debug(`Clicked VAS slider at position (${Math.round(clickX)}, ${Math.round(clickY)}) with value "${testCase.value}" for field ${field.questionNumber}`);
}

async function applyNRSValue(page: any, field: any, testCase: any): Promise<void> {
  // For NRS (Numeric Rating Scale), find and click the appropriate button
  const buttonIndex = typeof testCase.value === 'number' ? testCase.value : parseInt(testCase.value);
  
  logger.info(`Attempting to click NRS button for field ${field.questionNumber} with index ${buttonIndex}`);
  
  try {
    // Find all buttons in the CardBox
    const buttonSelector = `${field.cardBoxSelector} button`;
    const buttons = await page.$$(buttonSelector);
    
    logger.debug(`Found ${buttons.length} buttons in CardBox for NRS field`);
    
    // Get button texts and find numeric ones
    const numericButtons = [];
    for (let i = 0; i < buttons.length; i++) {
      const text = await buttons[i].evaluate((el: any) => el.textContent?.trim() || '');
      if (/^\d+$/.test(text)) {
        numericButtons.push({ button: buttons[i], value: parseInt(text), originalIndex: i });
      }
    }
    
    logger.debug(`Found ${numericButtons.length} numeric buttons for NRS field`);
    
    if (numericButtons.length === 0) {
      throw new Error(`No numeric buttons found for NRS field ${field.questionNumber}`);
    }
    
    // Sort by numeric value
    numericButtons.sort((a, b) => a.value - b.value);
    
    // Select the button at the requested index
    if (buttonIndex >= 0 && buttonIndex < numericButtons.length) {
      const targetButton = numericButtons[buttonIndex];
      
      // Scroll button into view
      await targetButton.button.evaluate((el: any) => el.scrollIntoView({ block: 'center' }));
      
      // Click the button
      await targetButton.button.click();
      
      logger.info(`Clicked NRS button with value ${targetButton.value} (index ${buttonIndex}) for field ${field.questionNumber}`);
    } else {
      throw new Error(`Invalid button index ${buttonIndex} for NRS field with ${numericButtons.length} buttons`);
    }
  } catch (error) {
    logger.error(`Failed to apply NRS value for field ${field.questionNumber}:`, error);
    throw error;
  }
}

async function applyRadioValue(page: any, field: any, testCase: any): Promise<void> {
  // For radio buttons, value is typically the position/index
  const radioIndex = typeof testCase.value === 'number' ? testCase.value : parseInt(testCase.value);
  
  logger.info(`Attempting to select radio button for field ${field.questionNumber || 'NO_NUMBER'} with index ${radioIndex}`);
  logger.debug(`Field cardBoxSelector: ${field.cardBoxSelector}`);
  
  // First, try question number-based approach if cardBoxSelector is generic AND we have a question number
  if (field.questionNumber && field.questionNumber.trim() !== '' && 
      (field.cardBoxSelector === '#survey-body-container [class*="CardBox"]' || 
       field.cardBoxSelector.endsWith('[class*="CardBox"]'))) {
    logger.info(`Using question number-based approach for field ${field.questionNumber} due to generic selector`);
    
    // Try to find the specific CardBox by question number
    const result = await page.evaluate((questionNum: string, radioIdx: number) => {
      const cardBoxes = document.querySelectorAll('#survey-body-container [class*="CardBox"]');
      const debugInfo: any[] = [];
      
      for (let i = 0; i < cardBoxes.length; i++) {
        const cardBox = cardBoxes[i];
        // Look for question number more precisely
        const textElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
        let foundQuestion = false;
        let foundText = '';
        let foundMatch = '';
        
        for (const elem of textElements) {
          const text = elem.textContent?.trim() || '';
          // Try multiple patterns for question numbers
          const patterns = [
            /^(\d+\.?\d*\.?)\s/, // Original pattern: "1. " or "1.2. "
            /^(\d+\.?\d*\.?)$/, // Just the number: "1" or "1.2"
            /^(\d+)\.\s/, // Simple pattern: "1. "
            /^Question\s+(\d+\.?\d*\.?)/, // "Question 1"
          ];
          
          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              const matchedNum = match[1] || match[0];
              debugInfo.push({
                cardBoxIndex: i,
                text: text.substring(0, 50),
                pattern: pattern.toString(),
                matchedNum,
                targetNum: questionNum,
                isMatch: matchedNum === questionNum || matchedNum === questionNum.replace(/\.$/, '')
              });
              
              if (matchedNum === questionNum || matchedNum === questionNum.replace(/\.$/, '')) {
                foundQuestion = true;
                foundText = text;
                foundMatch = matchedNum;
                break;
              }
            }
          }
          if (foundQuestion) break;
        }
        
        if (foundQuestion) {
          // Found the right CardBox, now find radio buttons
          const radios = cardBox.querySelectorAll('input[type="radio"]');
          if (radios.length > radioIdx) {
            const radio = radios[radioIdx] as HTMLInputElement;
            radio.scrollIntoView({ block: 'center' });
            radio.click();
            return { 
              clicked: true, 
              count: radios.length, 
              found: true, 
              questionNum,
              foundText,
              foundMatch,
              debugInfo
            };
          }
          return { 
            clicked: false, 
            count: radios.length, 
            found: true, 
            questionNum,
            foundText,
            foundMatch,
            debugInfo
          };
        }
      }
      return { 
        clicked: false, 
        count: 0, 
        found: false, 
        questionNum,
        debugInfo,
        totalCardBoxes: cardBoxes.length
      };
    }, field.questionNumber, radioIndex);
    
    // Log debug info
    if (result.debugInfo && result.debugInfo.length > 0) {
      logger.debug(`Question matching debug info for "${field.questionNumber}":`);
      result.debugInfo.forEach((info: any) => {
        logger.debug(`  CardBox ${info.cardBoxIndex}: "${info.text}" | Pattern: ${info.pattern} | Matched: "${info.matchedNum}" | IsMatch: ${info.isMatch}`);
      });
    }
    
    if (result.found) {
      logger.info(`Found specific CardBox for question ${field.questionNumber} with ${result.count} radio buttons`);
      logger.info(`  Matched text: "${result.foundText?.substring(0, 50)}..."`);
      if (result.clicked) {
        logger.info(`Successfully selected radio button ${radioIndex} using question number approach`);
        
        // Verify the selection
        await new Promise(resolve => setTimeout(resolve, 200));
        return;
      } else {
        logger.warn(`Could not click radio ${radioIndex} - only ${result.count} radios found in CardBox for question ${field.questionNumber}`);
      }
    } else {
      logger.warn(`Could not find CardBox for question ${field.questionNumber} using question number approach`);
      logger.warn(`  Total CardBoxes found: ${result.totalCardBoxes}`);
      
      // Debug: log all visible questions with more detail
      const visibleQuestions = await page.evaluate(() => {
        const cardBoxes = document.querySelectorAll('#survey-body-container [class*="CardBox"]');
        const questions: any[] = [];
        cardBoxes.forEach((cardBox: Element, index: number) => {
          const textElements = cardBox.querySelectorAll('h4, h5, h6, span, p, div');
          const firstTexts: string[] = [];
          let questionFound = false;
          
          for (let i = 0; i < Math.min(5, textElements.length); i++) {
            const text = textElements[i].textContent?.trim() || '';
            if (text) {
              firstTexts.push(`${textElements[i].tagName}: "${text.substring(0, 30)}"`);
              const match = text.match(/^(\d+\.?\d*\.?)/);
              if (match && !questionFound) {
                questions.push({
                  cardBoxIndex: index,
                  questionNumber: match[1],
                  fullText: text.substring(0, 50),
                  tagName: textElements[i].tagName
                });
                questionFound = true;
              }
            }
          }
          
          if (!questionFound) {
            questions.push({
              cardBoxIndex: index,
              questionNumber: 'NOT_FOUND',
              firstTexts: firstTexts
            });
          }
        });
        return questions;
      });
      
      logger.info(`Detailed CardBox analysis:`);
      visibleQuestions.forEach((q: any) => {
        if (q.questionNumber === 'NOT_FOUND') {
          logger.info(`  CardBox ${q.cardBoxIndex}: No question number found. First texts: ${q.firstTexts?.join(' | ')}`);
        } else {
          logger.info(`  CardBox ${q.cardBoxIndex}: Question "${q.questionNumber}" in ${q.tagName} - "${q.fullText}"`);
        }
      });
    }
  }
  
  // If we have no question number and a generic selector, try position-based approach
  if ((!field.questionNumber || field.questionNumber.trim() === '') && 
      (field.cardBoxSelector === '#survey-body-container [class*="CardBox"]' || 
       field.cardBoxSelector.endsWith('[class*="CardBox"]'))) {
    logger.info(`Using position-based approach for field without question number`);
    
    // Try to find CardBox by position in form
    const fieldIndex = field.order || field.fieldIndex || field.index || 0; // Use order property
    const result = await page.evaluate((fieldIdx: number, radioIdx: number) => {
      const cardBoxes = document.querySelectorAll('#survey-body-container [class*="CardBox"]');
      if (fieldIdx < cardBoxes.length) {
        const cardBox = cardBoxes[fieldIdx];
        const radios = cardBox.querySelectorAll('input[type="radio"]');
        if (radios.length > radioIdx) {
          const radio = radios[radioIdx] as HTMLInputElement;
          radio.scrollIntoView({ block: 'center' });
          radio.click();
          return { clicked: true, count: radios.length, found: true };
        }
        return { clicked: false, count: radios.length, found: true };
      }
      return { clicked: false, count: 0, found: false, totalCardBoxes: cardBoxes.length };
    }, fieldIndex, radioIndex);
    
    if (result.found) {
      logger.info(`Found CardBox at position ${fieldIndex} with ${result.count} radio buttons`);
      if (result.clicked) {
        logger.info(`Successfully selected radio button ${radioIndex} using position-based approach`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return;
      } else {
        logger.warn(`Could not click radio ${radioIndex} - only ${result.count} radios found in CardBox at position ${fieldIndex}`);
      }
    } else {
      logger.warn(`Could not find CardBox at position ${fieldIndex} (total CardBoxes: ${result.totalCardBoxes})`);
    }
  }
  
  // Fallback to selector-based approach
  // Try multiple radio button selectors in order of preference, scoped to survey container
  const radioSelectors = [
    `${field.cardBoxSelector} input[type="radio"]`,
    `${field.cardBoxSelector} [role="radio"]`,
    `${field.cardBoxSelector} .radio-button`,
    `${field.cardBoxSelector} input[name*="radio"]`,
    // Try broader selectors if specific ones fail, but still scoped to survey container
    `#survey-body-container input[type="radio"]`
  ];
  
  let radioButtons: any[] = [];
  let usedSelector = '';
  
  // Try each selector until we find radio buttons
  for (const selector of radioSelectors) {
    try {
      radioButtons = await page.$$(selector);
      if (radioButtons.length > 0) {
        usedSelector = selector;
        logger.debug(`Found ${radioButtons.length} radio buttons using selector: ${selector}`);
        break;
      }
    } catch (error) {
      logger.debug(`Selector failed: ${selector} - ${error}`);
      continue;
    }
  }
  
  if (radioButtons.length === 0) {
    // Try to find elements that might be custom radio implementations
    const customRadioSelectors = [
      `${field.cardBoxSelector} [class*="radio"]`,
      `${field.cardBoxSelector} [data-value]`,
      `${field.cardBoxSelector} button`,
      `${field.cardBoxSelector} .option`,
      `${field.cardBoxSelector} .choice`
    ];
    
    for (const selector of customRadioSelectors) {
      try {
        radioButtons = await page.$$(selector);
        if (radioButtons.length > 0) {
          usedSelector = selector;
          logger.debug(`Found ${radioButtons.length} custom radio elements using selector: ${selector}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  // If still no radio buttons found and we have a question number, try one more approach
  if (radioButtons.length === 0 && field.questionNumber) {
    logger.info(`Last resort: searching for radio buttons by question text proximity`);
    
    const foundRadios = await page.evaluate((questionNum: string) => {
      const container = document.querySelector('#survey-body-container');
      if (!container) return [];
      
      // Find all elements containing the question number
      const allElements = container.querySelectorAll('*');
      for (const element of allElements) {
        if (element.textContent?.includes(questionNum)) {
          // Look for radio buttons in the parent elements
          let current = element;
          let maxLevels = 5;
          while (current && maxLevels > 0) {
            const radios = current.querySelectorAll('input[type="radio"]');
            if (radios.length > 0) {
              // Return selector info for these radios
              const radioInfo = Array.from(radios).map((r, idx) => ({
                index: idx,
                id: r.id,
                name: (r as HTMLInputElement).name,
                value: (r as HTMLInputElement).value
              }));
              return radioInfo;
            }
            current = current.parentElement as Element;
            maxLevels--;
          }
        }
      }
      return [];
    }, field.questionNumber);
    
    if (foundRadios.length > 0) {
      logger.info(`Found ${foundRadios.length} radio buttons near question ${field.questionNumber}`);
      // Try to click using the found radio info
      if (radioIndex < foundRadios.length) {
        const targetRadio = foundRadios[radioIndex];
        if (targetRadio.id) {
          await page.click(`#${targetRadio.id}`);
          logger.info(`Clicked radio by ID: ${targetRadio.id}`);
          return;
        } else if (targetRadio.name) {
          const radios = await page.$$(`input[type="radio"][name="${targetRadio.name}"]`);
          if (radios.length > radioIndex) {
            await radios[radioIndex].click();
            logger.info(`Clicked radio by name and index: ${targetRadio.name}[${radioIndex}]`);
            return;
          }
        }
      }
    }
  }
  
  if (radioButtons.length === 0) {
    throw new Error(`No radio buttons found for field ${field.questionNumber}. Tried selectors: ${radioSelectors.join(', ')}`);
  }
  
  if (radioIndex >= radioButtons.length) {
    throw new Error(`Radio index ${radioIndex} out of range (0-${radioButtons.length - 1}). Found ${radioButtons.length} radio buttons.`);
  }
  
  // Click the radio button at the specified index
  await radioButtons[radioIndex].click();
  logger.debug(`Selected radio button ${radioIndex} (${usedSelector}) for field ${field.questionNumber}`);
  
  // Wait a bit and verify the selection
  await new Promise(resolve => setTimeout(resolve, 200));
}

async function applySelectValue(page: any, field: any, testCase: any): Promise<void> {
  const selectSelector = `${field.cardBoxSelector} select`;
  
  // For dropdowns, value could be index or text
  if (typeof testCase.value === 'number') {
    // Select by index
    await page.select(selectSelector, await page.evaluate((sel: string, index: number) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (!select) throw new Error('Select element not found');
      if (index >= select.options.length) throw new Error('Index out of range');
      return select.options[index].value;
    }, selectSelector, testCase.value));
  } else {
    // Select by value or text
    await page.select(selectSelector, String(testCase.value));
  }
  
  logger.debug(`Selected option "${testCase.value}" for field ${field.questionNumber}`);
}

async function applyAutocompleteDropdownValue(page: any, field: any, testCase: any): Promise<void> {
  // For autocomplete dropdowns (e.g., weight fields), type first then select
  const inputSelector = field.selector || `${field.cardBoxSelector} input`;
  
  logger.info(`Handling autocomplete dropdown field ${field.questionNumber} with value "${testCase.value}"`);
  
  try {
    // Click to focus and clear any existing value
    await page.click(inputSelector);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    
    // Type the value (e.g., "1" for weight)
    const typedValue = String(testCase.value);
    await page.type(inputSelector, typedValue);
    
    logger.debug(`Typed "${typedValue}" into autocomplete dropdown`);
    
    // Wait for dropdown options to appear
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to select the first dropdown option
    const optionSelected = await page.evaluate(() => {
      // Common patterns for dropdown options that appear after typing
      const optionSelectors = [
        '[role="option"]',
        '[role="listbox"] [role="option"]',
        '[class*="option"]',
        '[class*="dropdown-item"]',
        '[class*="select-item"]',
        '[class*="menu-item"]',
        '[class*="list-item"]',
        'li[role="option"]',
        'div[role="option"]',
        'ul[role="listbox"] li',
        '[aria-selected]',
        '.dropdown-menu .dropdown-item',
        '.select-dropdown li'
      ];
      
      for (const selector of optionSelectors) {
        const options = document.querySelectorAll(selector);
        if (options.length > 0) {
          // Click the first visible option
          for (const option of options) {
            const elem = option as HTMLElement;
            const style = window.getComputedStyle(elem);
            if (style.display !== 'none' && 
                style.visibility !== 'hidden' && 
                elem.offsetWidth > 0 && 
                elem.offsetHeight > 0) {
              elem.click();
              return true;
            }
          }
        }
      }
      
      return false;
    });
    
    if (optionSelected) {
      logger.info(`Selected first option from autocomplete dropdown for field ${field.questionNumber}`);
    } else {
      logger.warn(`Could not find dropdown options after typing "${typedValue}", trying Enter key`);
      // Press Enter as a fallback
      await page.keyboard.press('Enter');
    }
    
    // Wait for dropdown to close and value to be set
    await new Promise(resolve => setTimeout(resolve, 500));
    
  } catch (error) {
    logger.error(`Failed to handle autocomplete dropdown field ${field.questionNumber}:`, error);
    // Fallback to treating it as a regular text field
    await applyTextValue(page, field, testCase);
  }
}

async function applyTextValue(page: any, field: any, testCase: any): Promise<void> {
  const inputSelector = `${field.cardBoxSelector} input[type="text"], ${field.cardBoxSelector} input[type="email"], ${field.cardBoxSelector} input[type="number"], ${field.cardBoxSelector} input[type="tel"], ${field.cardBoxSelector} input:not([type])`;
  
  // Clear existing value and type new value
  await page.focus(inputSelector);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.type(inputSelector, String(testCase.value));
  
  logger.debug(`Entered text "${testCase.value}" for field ${field.questionNumber}`);
}

async function applyTextareaValue(page: any, field: any, testCase: any): Promise<void> {
  const textareaSelector = `${field.cardBoxSelector} textarea`;
  
  // Clear existing value and type new value
  await page.focus(textareaSelector);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.type(textareaSelector, String(testCase.value));
  
  logger.debug(`Entered textarea text "${testCase.value}" for field ${field.questionNumber}`);
}

async function applyCheckboxValue(page: any, field: any, testCase: any): Promise<void> {
  const checkboxSelector = `${field.cardBoxSelector} input[type="checkbox"]`;
  
  const checkbox = await page.$(checkboxSelector);
  if (!checkbox) {
    throw new Error(`Checkbox not found for field ${field.questionNumber}`);
  }
  
  const isChecked = await checkbox.evaluate((el: HTMLInputElement) => el.checked);
  const shouldCheck = Boolean(testCase.value);
  
  if (isChecked !== shouldCheck) {
    await checkbox.click();
  }
  
  logger.debug(`Set checkbox to ${shouldCheck} for field ${field.questionNumber}`);
}

async function applyDateValue(page: any, field: any, testCase: any): Promise<void> {
  const dateSelector = `${field.cardBoxSelector} input[type="date"]`;
  
  logger.info(`Handling date field ${field.questionNumber} for test case ${testCase.id}`);
  
  try {
    // Click the date input to open date picker
    await page.click(dateSelector);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Determine the date to use
    let targetDate: Date;
    if (testCase.value === 'yesterday' || !testCase.value) {
      // Default to yesterday for required date fields
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - 1);
    } else if (testCase.value === 'today') {
      targetDate = new Date();
    } else if (testCase.value === 'tomorrow') {
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
    } else {
      // Try to parse the provided date value
      targetDate = new Date(testCase.value);
      if (isNaN(targetDate.getTime())) {
        // If invalid date, default to yesterday
        targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - 1);
      }
    }
    
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-indexed
    const day = targetDate.getDate();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month];
    
    logger.info(`Selecting date: ${monthName} ${day}, ${year}`);
    
    // Handle the specific MonthYearDropdownWrapper structure
    try {
      // Find the MonthYearDropdownWrapper
      const dropdownWrapper = await page.$('[class*="MonthYearDropdownWrapper"]');
      if (dropdownWrapper) {
        // Get the two divs inside
        const divs = await dropdownWrapper.$$('div');
        
        if (divs.length >= 2) {
          // Click the first div (month selector)
          logger.info('Clicking month selector div');
          await divs[0].click();
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Clear and type the month name
          await page.keyboard.down('Control');
          await page.keyboard.press('A');
          await page.keyboard.up('Control');
          await page.keyboard.type(monthName);
          await page.keyboard.press('Enter');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Click the second div (year selector)
          logger.info('Clicking year selector div');
          await divs[1].click();
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Clear and type the year
          await page.keyboard.down('Control');
          await page.keyboard.press('A');
          await page.keyboard.up('Control');
          await page.keyboard.type(String(year));
          await page.keyboard.press('Enter');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Now select the day from the calendar
          const daySelected = await page.evaluate((targetDay: number) => {
            // Look for day buttons in the calendar
            const daySelectors = [
              `[aria-label*="${targetDay}"]`,
              `[class*="day"]:not([class*="outside-month"]):not([class*="disabled"])`,
              `.react-datepicker__day--0${targetDay < 10 ? '0' : ''}${targetDay}:not(.react-datepicker__day--outside-month)`,
              `[role="button"][aria-label*="${targetDay}"]`,
              `button:not([disabled])`
            ];
            
            for (const selector of daySelectors) {
              const dayElements = document.querySelectorAll(selector);
              for (const dayElement of dayElements) {
                const elementText = dayElement.textContent?.trim();
                if (elementText === String(targetDay)) {
                  // Make sure it's not disabled or outside current month
                  const isDisabled = dayElement.classList.contains('disabled') || 
                                   dayElement.hasAttribute('disabled') ||
                                   dayElement.classList.contains('outside-month') ||
                                   dayElement.classList.contains('react-datepicker__day--outside-month');
                  
                  if (!isDisabled) {
                    (dayElement as HTMLElement).click();
                    return true;
                  }
                }
              }
            }
            
            // If exact match not found, try to find any clickable day element
            const allDayButtons = document.querySelectorAll('.react-datepicker__day:not(.react-datepicker__day--outside-month)');
            for (const dayBtn of allDayButtons) {
              if (dayBtn.textContent?.trim() === String(targetDay)) {
                (dayBtn as HTMLElement).click();
                return true;
              }
            }
            
            return false;
          }, day);
          
          if (daySelected) {
            logger.info(`Successfully selected date using MonthYearDropdownWrapper`);
          } else {
            logger.warn(`Could not find day ${day} in calendar`);
            
            // Try alternative approach - look for the specific day number
            await page.evaluate((targetDay: number) => {
              const dayElements = document.querySelectorAll('[class*="day"]');
              for (const elem of dayElements) {
                if (elem.textContent?.trim() === String(targetDay) && 
                    !elem.classList.contains('outside-month') &&
                    !elem.classList.contains('disabled')) {
                  (elem as HTMLElement).click();
                  return;
                }
              }
            }, day);
          }
        } else {
          logger.warn(`MonthYearDropdownWrapper found but doesn't have 2 divs`);
        }
      } else {
        logger.warn(`MonthYearDropdownWrapper not found`);
        
        // Fallback: Try to find any date picker elements
        const fallbackResult = await page.evaluate((targetYear: number, targetMonth: number, targetDay: number) => {
          // Try various date picker patterns
          const pickerElement = document.querySelector('.react-datepicker, [class*="datepicker"], [role="dialog"]');
          if (!pickerElement) return { success: false, message: 'No date picker found' };
          
          // Look for any clickable day elements
          const dayElements = pickerElement.querySelectorAll('[class*="day"], button, [role="button"]');
          for (const elem of dayElements) {
            if (elem.textContent?.trim() === String(targetDay)) {
              (elem as HTMLElement).click();
              return { success: true, message: 'Clicked day using fallback' };
            }
          }
          
          return { success: false, message: 'Could not find day element' };
        }, year, month, day);
        
        if (fallbackResult.success) {
          logger.info(`Date selected using fallback approach: ${fallbackResult.message}`);
        } else {
          logger.warn(`Fallback date selection failed: ${fallbackResult.message}`);
        }
      }
    } catch (dropdownError) {
      logger.error(`Error with date picker interaction:`, dropdownError);
    }
    
    // Wait for date picker to close
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.debug(`Applied date value for field ${field.questionNumber}`);
  } catch (error) {
    logger.error(`Failed to handle date field ${field.questionNumber}:`, error);
  }
}

async function checkValidationMessages(page: any, field: any): Promise<{triggered: boolean, messages: string[]}> {
  try {
    // Common validation message selectors
    const validationSelectors = [
      `${field.cardBoxSelector} .error`,
      `${field.cardBoxSelector} .validation-error`,
      `${field.cardBoxSelector} .field-error`,
      `${field.cardBoxSelector} .invalid-feedback`,
      `${field.cardBoxSelector} [class*="error"]`,
      `${field.cardBoxSelector} [role="alert"]`
    ];
    
    const messages: string[] = [];
    
    for (const selector of validationSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          const text = await element.evaluate((el: Element) => el.textContent?.trim());
          if (text && text.length > 0) {
            messages.push(text);
          }
        }
      } catch (error) {
        // Continue checking other selectors
      }
    }
    
    return {
      triggered: messages.length > 0,
      messages: [...new Set(messages)] // Remove duplicates
    };
    
  } catch (error) {
    logger.debug(`Error checking validation messages: ${error}`);
    return { triggered: false, messages: [] };
  }
}

async function captureFieldScreenshot(page: any, field: any, testCase: any, outputDir: string): Promise<string> {
  const currentViewport = page.viewport();
  const width = currentViewport?.width || 767;
  const filename = `test_${field.questionNumber.replace(/\./g, '_')}_${testCase.id}_${Date.now()}_${width}.png`;
  const screenshotPath = join(outputDir, filename);
  
  try {
    // Try multiple selector strategies to find the field element, all scoped to survey container
    const selectors = [
      field.cardBoxSelector,
      field.selector,
      // Try position-based selectors within survey container using question number
      `#survey-body-container [class*="CardBox"]:nth-of-type(${field.questionNumber.replace('.', '')})`,
      // Try broader class-based selectors scoped to survey container
      `#survey-body-container [class*="CardBox"]`,
      `#survey-body-container .CardBox`
    ];
    
    let element = null;
    let usedSelector = '';
    
    // Try each selector until we find an element
    for (const selector of selectors) {
      if (!selector) continue;
      
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          // For broader selectors, try to find the one containing our field
          if (selector.includes('CardBox') && !selector.includes('nth-of-type')) {
            // Try to find the specific element that contains this question
            for (const el of elements) {
              const text = await el.evaluate((element: Element) => element.textContent || '');
              const questionWords = field.questionText.split(' ').slice(0, 3).join(' ');
              if (text.includes(questionWords) || text.includes(field.questionNumber)) {
                element = el;
                usedSelector = selector;
                break;
              }
            }
          } else {
            element = elements[0];
            usedSelector = selector;
          }
          
          if (element) {
            logger.debug(`Found element using selector: ${usedSelector}`);
            break;
          }
        }
      } catch (error) {
        logger.debug(`Selector failed: ${selector} - ${error}`);
        continue;
      }
    }
    
    if (!element) {
      // Fallback: take a full page screenshot and crop around the question area
      logger.warn(`No specific element found for field ${field.questionNumber}, taking full page screenshot`);
      
      // Take full page screenshot as fallback
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        type: 'png'
      });
      
      logger.debug(`Fallback screenshot saved: ${filename}`);
      return filename;
    }
    
    // Take screenshot of the specific element
    await element.screenshot({
      path: screenshotPath,
      type: 'png'
    });
    
    logger.debug(`Element screenshot saved using ${usedSelector}: ${filename}`);
    return filename;
    
  } catch (error) {
    logger.error(`Failed to capture screenshot for field ${field.questionNumber}: ${error}`);
    
    // Final fallback: try to take a basic page screenshot
    try {
      await page.screenshot({
        path: screenshotPath,
        type: 'png'
      });
      logger.debug(`Basic fallback screenshot saved: ${filename}`);
      return filename;
    } catch (fallbackError) {
      logger.error(`Even fallback screenshot failed: ${fallbackError}`);
      return '';
    }
  }
}