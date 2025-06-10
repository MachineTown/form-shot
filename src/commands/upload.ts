import { FirestoreService } from '../services/firestore';
import { AnalysisOutput } from '../utils/types';
import { logger } from '../utils/logger';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export async function uploadToFirestore(analysisJsonPath: string): Promise<void> {
  const firestoreService = new FirestoreService();
  
  try {
    // Validate analysis.json exists
    if (!existsSync(analysisJsonPath)) {
      throw new Error(`Analysis file not found: ${analysisJsonPath}`);
    }
    
    logger.info(`Reading analysis from: ${analysisJsonPath}`);
    
    // Read and parse analysis.json
    const analysisData = JSON.parse(readFileSync(analysisJsonPath, 'utf8')) as AnalysisOutput;
    
    // Validate required structure
    if (!analysisData.metadata || !analysisData.form) {
      throw new Error('Invalid analysis file structure. Missing metadata or form data.');
    }
    
    if (!analysisData.metadata.tuple) {
      throw new Error('Invalid analysis file structure. Missing tuple information.');
    }
    
    logger.info(`Found analysis for: ${analysisData.metadata.tuple.customerId}/${analysisData.metadata.tuple.studyId}`);
    logger.info(`Form: "${analysisData.form.longTitle}" with ${analysisData.form.fields.length} fields`);
    
    // Screenshots directory is the same as analysis.json directory
    const screenshotsDir = dirname(analysisJsonPath);
    
    // Verify screenshots exist
    const missingScreenshots = analysisData.form.fields
      .filter(field => field.screenshotPath)
      .filter(field => !existsSync(join(screenshotsDir, field.screenshotPath)));
    
    if (missingScreenshots.length > 0) {
      logger.warn(`Missing ${missingScreenshots.length} screenshots:`);
      missingScreenshots.forEach(field => {
        logger.warn(`  - ${field.screenshotPath} for question ${field.questionNumber}`);
      });
    }
    
    // Upload to Firestore
    logger.info('Starting upload to Firestore...');
    await firestoreService.uploadAnalysis(analysisData, screenshotsDir);
    
    logger.info('Upload completed successfully!');
    
    // Display summary
    const { tuple } = analysisData.metadata;
    logger.info(`Uploaded analysis: ${tuple.customerId}/${tuple.studyId}/${tuple.packageName}/${tuple.language}/${tuple.version}`);
    logger.info(`Document ID: ${tuple.customerId}_${tuple.studyId}_${tuple.packageName}_${tuple.language}_${tuple.version}`);
    
  } catch (error) {
    logger.error('Failed to upload to Firestore:', error);
    throw error;
  }
}

export async function queryFirestore(customerId?: string, studyId?: string, limit: number = 10): Promise<void> {
  const firestoreService = new FirestoreService();
  
  try {
    logger.info('Querying Firestore for analyses...');
    
    const analyses = await firestoreService.queryAnalyses(customerId, studyId, limit);
    
    if (analyses.length === 0) {
      logger.info('No analyses found matching criteria');
      return;
    }
    
    logger.info(`Found ${analyses.length} analyses:`);
    
    analyses.forEach((analysis, index) => {
      const date = analysis.analysisDate?.toDate?.() || new Date(analysis.analysisDate);
      logger.info(`${index + 1}. ${analysis.customerId}/${analysis.studyId}/${analysis.packageName}`);
      logger.info(`    Language: ${analysis.language}, Version: ${analysis.version}`);
      logger.info(`    Title: "${analysis.longTitle}" (${analysis.fieldsCount} fields)`);
      logger.info(`    Date: ${date.toISOString()}`);
      logger.info(`    Status: ${analysis.status}`);
      logger.info('');
    });
    
  } catch (error) {
    logger.error('Failed to query Firestore:', error);
    throw error;
  }
}

export async function clearFirestore(): Promise<void> {
  const firestoreService = new FirestoreService();
  
  try {
    logger.info('Starting to clear all Firestore data...');
    
    // Ask for confirmation in production
    logger.warn('⚠️  WARNING: This will permanently delete ALL survey analyses and screenshots from Firestore!');
    
    await firestoreService.clearAllData();
    
    logger.info('✅ Successfully cleared all Firestore data');
  } catch (error) {
    logger.error('❌ Failed to clear Firestore:', error);
    throw error;
  }
}