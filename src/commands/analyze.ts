import fs from 'fs/promises';
import path from 'path';
import { PuppeteerManager } from '../browser/puppeteer-manager';
import { FieldDetector } from '../form-analyzer/field-detector';
import { TestCaseGenerator } from '../test-generator/test-case-generator';
import { loadConfig } from '../config/env-loader';
import { AnalyzeOptions, TestMatrix, FormMetadata } from '../utils/types';
import logger from '../utils/logger';

export class AnalyzeCommand {
  async execute(options: AnalyzeOptions): Promise<void> {
    const config = loadConfig();
    const puppeteerManager = new PuppeteerManager();
    
    try {
      logger.info('Starting form analysis...');
      
      // Launch browser
      await puppeteerManager.launch(options.viewport);
      
      // Navigate to URL
      await puppeteerManager.navigateToUrl(options.url, options.waitFor);
      
      // Handle login if credentials are available
      try {
        await puppeteerManager.handleLogin(config);
      } catch (error) {
        logger.warn('Login attempt failed, proceeding without authentication:', error);
      }
      
      // Take screenshot if requested
      if (options.screenshot) {
        const screenshotPath = path.join(process.cwd(), 'output', 'screenshots', 'form-analysis.png');
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await puppeteerManager.takeScreenshot(screenshotPath);
      }
      
      // Detect form fields
      const fieldDetector = new FieldDetector(puppeteerManager.getPage());
      const fields = await fieldDetector.detectFormFields();
      const metadata = await fieldDetector.getFormMetadata();
      
      if (fields.length === 0) {
        logger.warn('No form fields detected on the page');
        return;
      }
      
      // Generate test cases
      const testGenerator = new TestCaseGenerator();
      const testCases = testGenerator.generateTestCases(fields);
      
      // Create test matrix
      const formMetadata: FormMetadata = {
        url: options.url,
        title: metadata.title,
        analyzedAt: new Date().toISOString(),
        totalFields: fields.length,
        viewport: options.viewport || '1024x768',
        formSelector: metadata.formSelector
      };
      
      const testMatrix: TestMatrix = {
        formMetadata,
        fields,
        testCases
      };
      
      // Save test matrix to file
      const outputPath = options.output || path.join(process.cwd(), 'output', 'test-matrix.json');
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(testMatrix, null, 2));
      
      logger.info(`Analysis complete! Test matrix saved to: ${outputPath}`);
      logger.info(`Found ${fields.length} fields, generated ${testCases.length} test cases`);
      
      // Log summary
      this.logSummary(testMatrix);
      
    } catch (error) {
      logger.error('Analysis failed:', error);
      throw error;
    } finally {
      await puppeteerManager.close();
    }
  }
  
  private logSummary(testMatrix: TestMatrix): void {
    logger.info('=== Analysis Summary ===');
    logger.info(`Form: ${testMatrix.formMetadata.title}`);
    logger.info(`URL: ${testMatrix.formMetadata.url}`);
    logger.info(`Fields detected: ${testMatrix.fields.length}`);
    
    // Count test cases by category
    const categoryCounts = testMatrix.testCases.reduce((counts, testCase) => {
      counts[testCase.category] = (counts[testCase.category] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    logger.info('Test cases by category:');
    Object.entries(categoryCounts).forEach(([category, count]) => {
      logger.info(`  ${category}: ${count}`);
    });
    
    // Field type summary
    const fieldTypes = testMatrix.fields.reduce((types, field) => {
      types[field.type] = (types[field.type] || 0) + 1;
      return types;
    }, {} as Record<string, number>);
    
    logger.info('Field types detected:');
    Object.entries(fieldTypes).forEach(([type, count]) => {
      logger.info(`  ${type}: ${count}`);
    });
  }
}