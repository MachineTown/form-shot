import { FirestoreService } from '../services/firestore';
import { Survey } from '../utils/types';
import { logger } from '../utils/logger';
import { readFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';

export async function uploadToFirestore(analysisJsonPath: string, leaveFiles: boolean = false): Promise<void> {
  const firestoreService = new FirestoreService();
  
  try {
    // Validate analysis.json exists
    if (!existsSync(analysisJsonPath)) {
      throw new Error(`Analysis file not found: ${analysisJsonPath}`);
    }
    
    logger.info(`Reading analysis from: ${analysisJsonPath}`);
    
    // Read and parse analysis.json
    const surveyData = JSON.parse(readFileSync(analysisJsonPath, 'utf8')) as Survey;
    
    // Validate required structure
    if (!surveyData.metadata || !surveyData.forms || surveyData.forms.length === 0) {
      throw new Error('Invalid analysis file structure. Missing metadata or forms data.');
    }
    
    if (!surveyData.metadata.tuple) {
      throw new Error('Invalid analysis file structure. Missing tuple information.');
    }
    
    logger.info(`Found survey for: ${surveyData.metadata.tuple.customerId}/${surveyData.metadata.tuple.studyId}`);
    logger.info(`Survey has ${surveyData.forms.length} forms with ${surveyData.forms.reduce((sum, f) => sum + f.fields.length, 0)} total fields`);
    
    // Screenshots directory is the same as analysis.json directory
    const screenshotsDir = dirname(analysisJsonPath);
    
    // Verify screenshots exist for all forms
    const missingScreenshots: {formIndex: number; field: any}[] = [];
    surveyData.forms.forEach((form, formIndex) => {
      form.fields
        .filter(field => field.screenshotPath)
        .filter(field => !existsSync(join(screenshotsDir, field.screenshotPath)))
        .forEach(field => missingScreenshots.push({formIndex, field}));
    });
    
    if (missingScreenshots.length > 0) {
      logger.warn(`Missing ${missingScreenshots.length} screenshots:`);
      missingScreenshots.forEach(({formIndex, field}) => {
        logger.warn(`  - Form ${formIndex + 1}: ${field.screenshotPath} for question ${field.questionNumber}`);
      });
    }
    
    // Upload to Firestore
    logger.info('Starting upload to Firestore...');
    await firestoreService.uploadSurvey(surveyData, screenshotsDir);
    
    logger.info('Upload completed successfully!');
    
    // Display summary
    const { tuple } = surveyData.metadata;
    logger.info(`Uploaded survey: ${tuple.customerId}/${tuple.studyId}/${tuple.packageName}/${tuple.language}/${tuple.version}`);
    logger.info(`Document ID: ${tuple.customerId}_${tuple.studyId}_${tuple.packageName}_${tuple.language}_${tuple.version}`);
    logger.info(`Total forms: ${surveyData.forms.length}`);
    surveyData.forms.forEach((form, index) => {
      logger.info(`  Form ${index + 1}: "${form.longTitle}" (${form.fields.length} fields)`);
    });
    
    // Clean up local files unless --leave flag is set
    if (!leaveFiles) {
      logger.info('Cleaning up local output files...');
      try {
        // Remove the entire output directory for this analysis
        const outputPath = dirname(analysisJsonPath);
        rmSync(outputPath, { recursive: true, force: true });
        logger.info('Local files cleaned up successfully');
      } catch (error) {
        logger.warn('Failed to clean up local files:', error);
      }
    } else {
      logger.info('Local files retained (--leave flag set)');
    }
    
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