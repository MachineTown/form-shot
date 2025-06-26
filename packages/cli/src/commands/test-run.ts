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
      
    case 'radio':
      await applyRadioValue(page, field, testCase);
      break;
      
    case 'dropdown':
    case 'select':
      await applySelectValue(page, field, testCase);
      break;
      
    case 'text':
    case 'email':
    case 'number':
    case 'tel':
      await applyTextValue(page, field, testCase);
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

async function applyRadioValue(page: any, field: any, testCase: any): Promise<void> {
  // For radio buttons, value is typically the position/index
  const radioIndex = typeof testCase.value === 'number' ? testCase.value : parseInt(testCase.value);
  
  logger.info(`Attempting to select radio button for field ${field.questionNumber} with index ${radioIndex}`);
  logger.debug(`Field cardBoxSelector: ${field.cardBoxSelector}`);
  
  // First, try question number-based approach if cardBoxSelector is generic
  if (field.cardBoxSelector === '#survey-body-container [class*="CardBox"]' || 
      field.cardBoxSelector.endsWith('[class*="CardBox"]')) {
    logger.info(`Using question number-based approach for field ${field.questionNumber} due to generic selector`);
    
    // Try to find the specific CardBox by question number
    const result = await page.evaluate((questionNum: string, radioIdx: number) => {
      const cardBoxes = document.querySelectorAll('#survey-body-container [class*="CardBox"]');
      for (const cardBox of cardBoxes) {
        const text = cardBox.textContent || '';
        // Look for the question number at the start of the text content
        if (text.includes(questionNum) && text.indexOf(questionNum) < 50) {
          // Found the right CardBox, now find radio buttons
          const radios = cardBox.querySelectorAll('input[type="radio"]');
          if (radios.length > radioIdx) {
            const radio = radios[radioIdx] as HTMLInputElement;
            radio.scrollIntoView({ block: 'center' });
            radio.click();
            return { clicked: true, count: radios.length, found: true };
          }
          return { clicked: false, count: radios.length, found: true };
        }
      }
      return { clicked: false, count: 0, found: false };
    }, field.questionNumber, radioIndex);
    
    if (result.found) {
      logger.info(`Found specific CardBox for question ${field.questionNumber} with ${result.count} radio buttons`);
      if (result.clicked) {
        logger.info(`Successfully selected radio button ${radioIndex} using question number approach`);
        
        // Verify the selection
        await new Promise(resolve => setTimeout(resolve, 200));
        return;
      } else {
        logger.warn(`Could not click radio ${radioIndex} - only ${result.count} radios found in CardBox`);
      }
    } else {
      logger.warn(`Could not find CardBox for question ${field.questionNumber} using question number approach`);
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
  const filename = `test_${field.questionNumber.replace(/\./g, '_')}_${testCase.id}_${Date.now()}.png`;
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