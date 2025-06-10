import { AnalysisOutput } from '../utils/types';
import { testDataGenerator } from '../test-generator/test-data-generator';
import { fieldTypeRegistry } from '../test-generator/field-type-registry';
import { FirestoreService } from '../services/firestore';
import { logger } from '../utils/logger';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export async function exportTestDataForReview(analysisJsonPath: string): Promise<void> {
  try {
    if (!existsSync(analysisJsonPath)) {
      throw new Error(`Analysis file not found: ${analysisJsonPath}`);
    }

    logger.info(`Reading analysis from: ${analysisJsonPath}`);
    const analysisData = JSON.parse(readFileSync(analysisJsonPath, 'utf8')) as AnalysisOutput;

    if (!analysisData.form.fields.some(field => field.testData)) {
      logger.warn('No test data found in analysis. Run analysis first to generate test data.');
      return;
    }

    // Prepare export data for UI review
    const exportData = {
      metadata: analysisData.metadata,
      form: {
        longTitle: analysisData.form.longTitle,
        shortName: analysisData.form.shortName
      },
      fields: analysisData.form.fields
        .filter(field => field.testData)
        .map(field => ({
          questionNumber: field.questionNumber,
          questionText: field.questionText,
          inputType: field.inputType,
          isRequired: field.isRequired,
          choices: field.choices,
          testData: {
            detectedType: field.testData!.detectedType,
            confidence: field.testData!.confidence,
            detectionMethod: field.testData!.detectionMethod,
            testCases: field.testData!.testCases.map(testCase => ({
              id: testCase.id,
              type: testCase.type,
              value: testCase.value,
              position: testCase.position,
              description: testCase.description,
              source: testCase.source,
              status: testCase.status,
              confidence: testCase.quality.confidence,
              needsReview: testCase.status === 'draft' || testCase.status === 'needs_review'
            })),
            summary: field.testData!.summary
          }
        })),
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0.0'
    };

    const exportPath = analysisJsonPath.replace('.json', '_test_data_review.json');
    writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

    logger.info(`Exported test data for review: ${exportPath}`);
    logger.info(`Fields with test data: ${exportData.fields.length}`);
    
    const totalTestCases = exportData.fields.reduce((sum, field) => 
      sum + field.testData.testCases.length, 0);
    const needsReview = exportData.fields.reduce((sum, field) => 
      sum + field.testData.testCases.filter(tc => tc.needsReview).length, 0);
    
    logger.info(`Total test cases: ${totalTestCases}, Needs review: ${needsReview}`);

  } catch (error) {
    logger.error('Failed to export test data for review:', error);
    throw error;
  }
}

export async function importReviewedTestData(reviewedJsonPath: string, originalAnalysisPath: string): Promise<void> {
  try {
    if (!existsSync(reviewedJsonPath)) {
      throw new Error(`Reviewed test data file not found: ${reviewedJsonPath}`);
    }

    if (!existsSync(originalAnalysisPath)) {
      throw new Error(`Original analysis file not found: ${originalAnalysisPath}`);
    }

    logger.info(`Reading reviewed test data from: ${reviewedJsonPath}`);
    const reviewedData = JSON.parse(readFileSync(reviewedJsonPath, 'utf8'));

    logger.info(`Reading original analysis from: ${originalAnalysisPath}`);
    const analysisData = JSON.parse(readFileSync(originalAnalysisPath, 'utf8')) as AnalysisOutput;

    // Update test data in original analysis
    for (const reviewedField of reviewedData.fields) {
      const originalField = analysisData.form.fields.find(f => 
        f.questionNumber === reviewedField.questionNumber
      );

      if (originalField && originalField.testData) {
        // Update test cases with reviewed status and any modifications
        for (const reviewedTestCase of reviewedField.testData.testCases) {
          const originalTestCase = originalField.testData.testCases.find(tc => 
            tc.id === reviewedTestCase.id
          );

          if (originalTestCase) {
            // Update status and quality metrics
            originalTestCase.status = reviewedTestCase.status || originalTestCase.status;
            originalTestCase.quality.reviewCount++;
            originalTestCase.quality.lastReviewed = new Date().toISOString();

            // Record modification if value or description changed
            if (reviewedTestCase.value !== originalTestCase.value || 
                reviewedTestCase.description !== originalTestCase.description) {
              
              originalTestCase.provenance.modifications.push({
                timestamp: new Date().toISOString(),
                modifiedBy: reviewedData.reviewedBy || 'unknown',
                action: 'updated',
                changes: {
                  value: {
                    from: originalTestCase.value,
                    to: reviewedTestCase.value
                  },
                  description: {
                    from: originalTestCase.description,
                    to: reviewedTestCase.description
                  }
                },
                reason: reviewedTestCase.reviewNotes || 'Manual review update'
              });

              // Update values
              originalTestCase.value = reviewedTestCase.value;
              originalTestCase.description = reviewedTestCase.description;
              
              // Mark as hybrid if it was originally generated
              if (originalTestCase.source === 'generated') {
                originalTestCase.source = 'hybrid';
                originalTestCase.provenance.human = {
                  userId: reviewedData.reviewedBy || 'unknown',
                  userName: reviewedData.reviewerName || 'Unknown Reviewer',
                  reason: 'Manual review modification',
                  context: reviewedTestCase.reviewNotes
                };
              }
            }
          }
        }

        // Add any new test cases that were added during review
        if (reviewedField.testData.newTestCases) {
          for (const newTestCase of reviewedField.testData.newTestCases) {
            originalField.testData.testCases.push({
              id: newTestCase.id || `human_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: newTestCase.type,
              value: newTestCase.value,
              position: newTestCase.position,
              description: newTestCase.description,
              source: 'human',
              provenance: {
                createdBy: 'user',
                createdAt: new Date().toISOString(),
                human: {
                  userId: reviewedData.reviewedBy || 'unknown',
                  userName: reviewedData.reviewerName || 'Unknown Reviewer',
                  reason: newTestCase.reason || 'Added during manual review',
                  context: newTestCase.context
                },
                modifications: []
              },
              status: 'approved',
              quality: {
                confidence: 100,
                reviewCount: 1,
                lastReviewed: new Date().toISOString()
              }
            });
          }
        }

        // Recalculate summary
        originalField.testData.summary = {
          totalTestCases: originalField.testData.testCases.length,
          generatedCount: originalField.testData.testCases.filter(tc => tc.source === 'generated').length,
          humanCount: originalField.testData.testCases.filter(tc => tc.source === 'human').length,
          hybridCount: originalField.testData.testCases.filter(tc => tc.source === 'hybrid').length,
          approvedCount: originalField.testData.testCases.filter(tc => tc.status === 'approved').length,
          pendingReviewCount: originalField.testData.testCases.filter(tc => 
            tc.status === 'draft' || tc.status === 'needs_review').length
        };
      }
    }

    // Save updated analysis
    const updatedPath = originalAnalysisPath.replace('.json', '_reviewed.json');
    writeFileSync(updatedPath, JSON.stringify(analysisData, null, 2));

    logger.info(`Imported reviewed test data and saved to: ${updatedPath}`);
    
    const totalFields = reviewedData.fields.length;
    const totalModified = reviewedData.fields.filter((field: any) => 
      field.testData.testCases.some((tc: any) => tc.status === 'approved')).length;
    
    logger.info(`Updated ${totalModified} out of ${totalFields} fields`);

  } catch (error) {
    logger.error('Failed to import reviewed test data:', error);
    throw error;
  }
}

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