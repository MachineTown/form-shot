import { PuppeteerManager } from '../browser/puppeteer-manager';
import { SurveyFormDetector } from '../form-analyzer/survey-detector';
import { SurveyTuple, AnalysisOutput } from '../utils/types';
import { logger } from '../utils/logger';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export async function analyzeSurvey(url: string, tuple: SurveyTuple): Promise<void> {
  const puppeteerManager = new PuppeteerManager();
  const formDetector = new SurveyFormDetector();
  
  try {
    logger.info('Launching browser...');
    await puppeteerManager.launch();
    
    logger.info('Navigating to survey...');
    await puppeteerManager.navigateToPage(url);
    
    logger.info('Detecting survey form...');
    const form = await formDetector.detectSurveyForm(puppeteerManager.getPage(), tuple);
    
    logger.info(`Found survey: "${form.longTitle}" with ${form.fields.length} fields`);
    
    // Generate output
    const output: AnalysisOutput = {
      metadata: {
        tuple,
        analysisDate: new Date().toISOString(),
        url
      },
      form
    };
    
    // Save results
    await saveResults(output, tuple);
    
    logger.info(`Analysis completed successfully`);
    
  } finally {
    await puppeteerManager.close();
  }
}

async function saveResults(output: AnalysisOutput, tuple: SurveyTuple): Promise<void> {
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
    writeFileSync(analysisPath, JSON.stringify(output, null, 2));
    logger.info(`Results saved to fallback location: ${analysisPath}`);
    return;
  }
  
  // Save main analysis JSON
  const analysisPath = join(outputDir, 'analysis.json');
  writeFileSync(analysisPath, JSON.stringify(output, null, 2));
  
  logger.info(`Results saved to: ${analysisPath}`);
}