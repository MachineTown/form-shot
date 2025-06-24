import { FirestoreService } from '@form-shot/shared';
import { logger } from '@form-shot/shared';

export async function fixAnalysis(): Promise<void> {
  const firestoreService = new FirestoreService();
  
  try {
    // Direct Firestore access
    const db = (firestoreService as any).db;
    
    // Get the analysis document
    const analysisId = 'TFS_BRILL_EU_baseline_en_v1';
    const analysisRef = db.collection('survey-analyses').doc(analysisId);
    
    logger.info(`Fixing analysis: ${analysisId}`);
    
    // Get the first form to extract title information
    const formsSnapshot = await analysisRef.collection('forms').orderBy('order').limit(1).get();
    
    if (formsSnapshot.empty) {
      logger.error('No forms found');
      return;
    }
    
    const firstForm = formsSnapshot.docs[0].data();
    logger.info(`Found first form: ${firstForm.longTitle}`);
    
    // Count total fields across all forms
    const allFormsSnapshot = await analysisRef.collection('forms').get();
    let totalFields = 0;
    
    for (const formDoc of allFormsSnapshot.docs) {
      const formData = formDoc.data();
      totalFields += formData.fieldsCount || 0;
    }
    
    logger.info(`Total fields across all forms: ${totalFields}`);
    
    // Update the analysis document with the missing fields
    await analysisRef.update({
      longTitle: firstForm.longTitle || 'SF-36 Survey',
      shortName: firstForm.shortName || 'SF-36',
      viewportHeight: firstForm.viewportHeight || 1024,
      timestamp: firstForm.timestamp,
      fieldsCount: totalFields,
      processingDuration: 0,
      testDataSummary: {
        fieldsWithTestData: 0,
        totalTestCases: 0,
        generatedTestCases: 0,
        humanTestCases: 0,
        hybridTestCases: 0
      }
    });
    
    logger.info('Successfully updated analysis document');
  } catch (error) {
    logger.error('Failed to fix analysis:', error);
    throw error;
  }
}