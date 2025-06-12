import { PuppeteerManager } from '../browser/puppeteer-manager';
import { FirestoreService } from '../services/firestore';
import { logger } from '../utils/logger';
import { SurveyTuple } from '../utils/types';
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

export interface TestCaseResult {
  fieldId: string;
  testCaseId: string;
  questionNumber: string;
  testCaseValue: any;
  applied: boolean;
  validationTriggered: boolean;
  validationMessages: string[];
  screenshotPath: string;
  error?: string;
  duration: number;
}

export interface TestRunResult {
  analysisId: string;
  url: string;
  startTime: string;
  endTime: string;
  totalDuration: number;
  fieldsProcessed: number;
  testCasesExecuted: number;
  successfulTestCases: number;
  failedTestCases: number;
  validationErrorsFound: number;
  results: TestCaseResult[];
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
    
    const results: TestCaseResult[] = [];
    let fieldsProcessed = 0;
    let testCasesExecuted = 0;
    let successfulTestCases = 0;
    let failedTestCases = 0;
    let validationErrorsFound = 0;
    
    // Process fields in order
    const sortedFields = analysisData.fields.sort((a: any, b: any) => a.order - b.order);
    
    for (const field of sortedFields) {
      if (!field.testData || !field.testData.testCases || field.testData.testCases.length === 0) {
        logger.info(`Skipping field ${field.questionNumber} - no test cases`);
        continue;
      }
      
      logger.info(`Processing field ${field.questionNumber}: "${field.questionText}"`);
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
  
  // Wait for element to be available
  await page.waitForSelector(selector, { timeout: 5000 });
  
  switch (field.inputType.toLowerCase()) {
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

async function applyRadioValue(page: any, field: any, testCase: any): Promise<void> {
  // For radio buttons, value is typically the position/index
  const radioIndex = typeof testCase.value === 'number' ? testCase.value : parseInt(testCase.value);
  
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
  
  if (radioButtons.length === 0) {
    throw new Error(`No radio buttons found for field ${field.questionNumber}. Tried selectors: ${radioSelectors.join(', ')}`);
  }
  
  if (radioIndex >= radioButtons.length) {
    throw new Error(`Radio index ${radioIndex} out of range (0-${radioButtons.length - 1}). Found ${radioButtons.length} radio buttons.`);
  }
  
  // Click the radio button at the specified index
  await radioButtons[radioIndex].click();
  logger.debug(`Selected radio button ${radioIndex} (${usedSelector}) for field ${field.questionNumber}`);
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