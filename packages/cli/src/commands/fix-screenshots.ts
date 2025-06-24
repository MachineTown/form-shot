import { FirestoreService } from '@form-shot/shared';
import { logger } from '@form-shot/shared';

export async function fixScreenshots(): Promise<void> {
  const firestoreService = new FirestoreService();
  
  try {
    // Direct Firestore access
    const db = (firestoreService as any).db;
    
    // Get all analyses
    const analysesSnapshot = await db.collection('survey-analyses').get();
    
    logger.info(`Found ${analysesSnapshot.size} analyses to process`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const analysisDoc of analysesSnapshot.docs) {
      const analysisId = analysisDoc.id;
      const analysisData = analysisDoc.data();
      
      // Skip if already has the screenshot URL
      if (analysisData.firstFormOnEntryScreenshotUrl) {
        skipped++;
        continue;
      }
      
      try {
        // Get the first form
        const formsSnapshot = await analysisDoc.ref.collection('forms').orderBy('order').limit(1).get();
        
        if (formsSnapshot.empty) {
          logger.warn(`No forms found for analysis: ${analysisId}`);
          continue;
        }
        
        const firstForm = formsSnapshot.docs[0].data();
        
        // Update the analysis document with the first form's on-entry screenshot URL
        if (firstForm.onEntryScreenshotUrl) {
          await analysisDoc.ref.update({
            firstFormOnEntryScreenshotUrl: firstForm.onEntryScreenshotUrl
          });
          updated++;
          logger.info(`Updated analysis ${analysisId} with screenshot URL`);
        } else {
          logger.info(`No on-entry screenshot URL found for analysis: ${analysisId}`);
        }
        
      } catch (error) {
        logger.error(`Failed to process analysis ${analysisId}:`, error);
      }
    }
    
    logger.info(`Completed: ${updated} updated, ${skipped} skipped`);
  } catch (error) {
    logger.error('Failed to fix screenshots:', error);
    throw error;
  }
}