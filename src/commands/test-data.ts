import { testDataGenerator } from '../test-generator/test-data-generator';
import { fieldTypeRegistry } from '../test-generator/field-type-registry';
import { FirestoreService } from '../services/firestore';
import { logger } from '../utils/logger';
import { writeFileSync } from 'fs';
import { join } from 'path';



export async function generatePatternStats(): Promise<void> {
  try {
    const registryStats = fieldTypeRegistry.getPatternStats();
    const generatorStats = testDataGenerator.getTemplateStats();

    const stats = {
      timestamp: new Date().toISOString(),
      fieldTypeRegistry: registryStats,
      testDataGenerator: generatorStats,
      unknownFields: fieldTypeRegistry.exportUnknownFields()
    };

    const statsPath = join(process.cwd(), 'pattern_stats.json');
    writeFileSync(statsPath, JSON.stringify(stats, null, 2));

    logger.info(`Generated pattern statistics: ${statsPath}`);
    logger.info(`Total patterns: ${registryStats.totalPatterns}`);
    logger.info(`Total templates: ${generatorStats.totalTemplates}`);
    logger.info(`Unknown fields: ${registryStats.unknownFieldsCount}`);

    // Log top performing patterns
    const patternsByUsage = Object.entries(registryStats.patterns)
      .sort(([,a], [,b]) => (b as any).usage?.totalMatches - (a as any).usage?.totalMatches)
      .slice(0, 5);

    if (patternsByUsage.length > 0) {
      logger.info('Top performing patterns:');
      patternsByUsage.forEach(([id, stats]: [string, any]) => {
        logger.info(`  ${stats.name}: ${stats.usage?.totalMatches || 0} matches`);
      });
    }

  } catch (error) {
    logger.error('Failed to generate pattern statistics:', error);
    throw error;
  }
}

export async function exportUnknownFields(): Promise<void> {
  try {
    const unknownFields = fieldTypeRegistry.exportUnknownFields();
    
    if (unknownFields.length === 0) {
      logger.info('No unknown fields to export');
      return;
    }

    const exportData = {
      timestamp: new Date().toISOString(),
      totalFields: unknownFields.length,
      fields: unknownFields.map(field => ({
        id: field.id,
        questionText: field.questionText,
        inputType: field.inputType,
        choices: field.choices,
        context: field.context,
        analysisMetadata: field.analysisMetadata,
        suggestedClassification: field.suggestedType,
        needsClassification: field.needsClassification
      }))
    };

    const exportPath = join(process.cwd(), 'unknown_fields.json');
    writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

    logger.info(`Exported ${unknownFields.length} unknown fields: ${exportPath}`);
    
    // Clear the unknown fields cache after export
    fieldTypeRegistry.clearUnknownFields();
    logger.info('Cleared unknown fields cache');

  } catch (error) {
    logger.error('Failed to export unknown fields:', error);
    throw error;
  }
}

export async function queryTestCases(options: {
  analysis?: string;
  customer?: string;
  study?: string;
  status?: string;
  source?: string;
  limit?: string;
}): Promise<void> {
  const firestoreService = new FirestoreService();
  
  try {
    logger.info('Querying test cases from Firestore...');
    
    const filters = {
      analysisId: options.analysis,
      customerId: options.customer,
      studyId: options.study,
      status: options.status,
      source: options.source,
      limit: options.limit ? parseInt(options.limit) : 20
    };

    const testCases = await firestoreService.queryTestCases(filters);
    
    if (testCases.length === 0) {
      logger.info('No test cases found matching criteria');
      return;
    }
    
    logger.info(`Found ${testCases.length} test cases:`);
    
    testCases.forEach((testCase, index) => {
      const createdAt = testCase.createdAt?.toDate?.() || new Date(testCase.createdAt);
      logger.info(`${index + 1}. ${testCase.analysisId}/${testCase.fieldId}/${testCase.id}`);
      logger.info(`    Question: ${testCase.questionNumber} - Type: ${testCase.type}`);
      logger.info(`    Value: "${testCase.value}" (Position: ${testCase.position || 'N/A'})`);
      logger.info(`    Source: ${testCase.source}, Status: ${testCase.status}`);
      logger.info(`    Description: ${testCase.description}`);
      logger.info(`    Confidence: ${testCase.quality?.confidence || 'N/A'}`);
      logger.info(`    Created: ${createdAt.toISOString()}`);
      logger.info('');
    });
    
  } catch (error) {
    logger.error('Failed to query test cases:', error);
    throw error;
  }
}

export async function getCompleteAnalysis(analysisId: string): Promise<void> {
  const firestoreService = new FirestoreService();
  
  try {
    logger.info(`Retrieving complete analysis: ${analysisId}`);
    
    const analysis = await firestoreService.getAnalysisWithTestCases(analysisId);
    
    logger.info(`Analysis: ${analysis.longTitle} (${analysis.fieldsCount} fields)`);
    logger.info(`Customer: ${analysis.customerId}, Study: ${analysis.studyId}`);
    logger.info(`Language: ${analysis.language}, Version: ${analysis.version}`);
    logger.info(`Analysis Date: ${analysis.analysisDate?.toDate?.()?.toISOString() || analysis.analysisDate}`);
    logger.info('');
    
    if (analysis.testDataSummary) {
      logger.info('Test Data Summary:');
      logger.info(`  Fields with test data: ${analysis.testDataSummary.fieldsWithTestData}`);
      logger.info(`  Total test cases: ${analysis.testDataSummary.totalTestCases}`);
      logger.info(`  Generated: ${analysis.testDataSummary.generatedTestCases}`);
      logger.info(`  Human: ${analysis.testDataSummary.humanTestCases}`);
      logger.info(`  Hybrid: ${analysis.testDataSummary.hybridTestCases}`);
      logger.info('');
    }
    
    if (analysis.fields && analysis.fields.length > 0) {
      logger.info('Fields:');
      analysis.fields.forEach((field: any, index: number) => {
        logger.info(`${index + 1}. Q${field.questionNumber}: ${field.questionText}`);
        logger.info(`    Type: ${field.inputType}, Required: ${field.isRequired}`);
        
        if (field.testData) {
          logger.info(`    Test Data: ${field.testData.detectedType} (confidence: ${field.testData.confidence})`);
          if (field.testData.testCases && field.testData.testCases.length > 0) {
            logger.info(`    Test Cases (${field.testData.testCases.length}):`);
            field.testData.testCases.slice(0, 3).forEach((tc: any) => {
              logger.info(`      - ${tc.description} (${tc.source}, ${tc.status})`);
            });
            if (field.testData.testCases.length > 3) {
              logger.info(`      ... and ${field.testData.testCases.length - 3} more`);
            }
          }
        }
        logger.info('');
      });
    }
    
  } catch (error) {
    logger.error('Failed to get complete analysis:', error);
    throw error;
  }
}

export async function updateTestCaseStatus(
  analysisId: string, 
  fieldId: string, 
  testCaseId: string, 
  status: string, 
  reviewerId?: string
): Promise<void> {
  const firestoreService = new FirestoreService();
  
  try {
    const validStatuses = ['draft', 'approved', 'rejected', 'needs_review'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }
    
    logger.info(`Updating test case status: ${analysisId}/${fieldId}/${testCaseId} -> ${status}`);
    
    await firestoreService.updateTestCaseStatus(analysisId, fieldId, testCaseId, status, reviewerId);
    
    logger.info('Test case status updated successfully');
    
    if (reviewerId) {
      logger.info(`Reviewed by: ${reviewerId}`);
    }
    
  } catch (error) {
    logger.error('Failed to update test case status:', error);
    throw error;
  }
}