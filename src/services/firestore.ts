import * as admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';
import { AnalysisOutput, SurveyField } from '../utils/types';

export class FirestoreService {
  private db!: admin.firestore.Firestore;
  private storage!: admin.storage.Storage;
  private initialized = false;

  constructor() {
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    try {
      // Try to find service account key in different locations
      const possiblePaths = [
        '/app/firestore.json',  // Docker container path
        join(process.env.HOME || '', 'firestore.json'),  // Home directory
        './firestore.json'      // Current directory
      ];

      let serviceAccountPath: string | null = null;
      for (const path of possiblePaths) {
        if (existsSync(path)) {
          serviceAccountPath = path;
          break;
        }
      }

      if (!serviceAccountPath) {
        throw new Error('Service account key not found. Expected at ~/firestore.json or /app/firestore.json');
      }

      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
        });
      }

      this.db = admin.firestore();
      this.storage = admin.storage();
      this.initialized = true;
      
      logger.info('Firestore service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Firestore service:', error);
      throw error;
    }
  }

  async uploadAnalysis(analysisOutput: AnalysisOutput, screenshotsDir: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Firestore service not initialized');
    }

    const { metadata, form } = analysisOutput;
    const { tuple } = metadata;

    try {
      // Create document ID from tuple
      const docId = `${tuple.customerId}_${tuple.studyId}_${tuple.packageName}_${tuple.language}_${tuple.version}`;
      
      logger.info(`Uploading analysis to Firestore with ID: ${docId}`);

      // Upload screenshots to Cloud Storage first
      const screenshotsPath = `survey-screenshots/${tuple.customerId}/${tuple.studyId}/${tuple.packageName}/${tuple.language}/${tuple.version}`;
      const uploadedScreenshots = await this.uploadScreenshots(form.fields, screenshotsDir, screenshotsPath);

      // Prepare main document data
      const analysisDoc = {
        // Tuple fields
        customerId: tuple.customerId,
        studyId: tuple.studyId,
        packageName: tuple.packageName,
        language: tuple.language,
        version: tuple.version,
        
        // Analysis metadata
        analysisDate: admin.firestore.Timestamp.fromDate(new Date(metadata.analysisDate)),
        url: metadata.url,
        
        // Form metadata
        longTitle: form.longTitle,
        shortName: form.shortName,
        viewportHeight: form.viewportHeight,
        timestamp: admin.firestore.Timestamp.fromDate(new Date(form.timestamp)),
        
        // Form fields summary
        fieldsCount: form.fields.length,
        
        // Cloud Storage references
        screenshotsPath: screenshotsPath,
        
        // Status and tracking
        status: 'completed',
        processingDuration: 0, // Could be calculated if we track timing
        
        // Audit fields
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Start batch write
      const batch = this.db.batch();

      // Add main analysis document
      const analysisRef = this.db.collection('survey-analyses').doc(docId);
      batch.set(analysisRef, analysisDoc);

      // Add fields as subcollection documents
      const fieldsCollection = analysisRef.collection('fields');
      
      form.fields.forEach((field, index) => {
        const fieldId = field.questionNumber ? `q${field.questionNumber.replace(/\./g, '_')}` : `field_${index + 1}`;
        const fieldRef = fieldsCollection.doc(fieldId);
        
        const fieldDoc = {
          questionNumber: field.questionNumber,
          questionText: field.questionText,
          inputType: field.inputType,
          isRequired: field.isRequired,
          choices: field.choices || [],
          selector: field.selector,
          cardBoxSelector: field.cardBoxSelector,
          screenshotFilename: field.screenshotPath,
          screenshotUrl: uploadedScreenshots[field.screenshotPath] || '',
          order: index + 1
        };
        
        batch.set(fieldRef, fieldDoc);
      });

      // Update customer metadata
      await this.updateCustomerMetadata(tuple.customerId, tuple.studyId);
      
      // Update survey metadata
      await this.updateSurveyMetadata(tuple.studyId, tuple.packageName, tuple.language, tuple.version);

      // Commit batch
      await batch.commit();
      
      logger.info(`Successfully uploaded analysis with ${form.fields.length} fields to Firestore`);
      
    } catch (error) {
      logger.error('Failed to upload analysis to Firestore:', error);
      throw error;
    }
  }

  private async uploadScreenshots(fields: SurveyField[], screenshotsDir: string, basePath: string): Promise<Record<string, string>> {
    const uploadedScreenshots: Record<string, string> = {};
    const bucket = this.storage.bucket();

    logger.info(`Uploading ${fields.length} screenshots to Cloud Storage`);

    for (const field of fields) {
      if (!field.screenshotPath) continue;

      try {
        const localPath = join(screenshotsDir, field.screenshotPath);
        if (!existsSync(localPath)) {
          logger.warn(`Screenshot not found: ${localPath}`);
          continue;
        }

        const cloudPath = `${basePath}/${field.screenshotPath}`;
        const file = bucket.file(cloudPath);
        
        await file.save(readFileSync(localPath), {
          metadata: {
            contentType: 'image/png',
            metadata: {
              questionNumber: field.questionNumber,
              questionText: field.questionText
            }
          }
        });

        // Make file publicly readable (optional - adjust based on security requirements)
        await file.makePublic();
        
        // Get public URL
        uploadedScreenshots[field.screenshotPath] = `https://storage.googleapis.com/${bucket.name}/${cloudPath}`;
        
        logger.debug(`Uploaded screenshot: ${field.screenshotPath}`);
        
      } catch (error) {
        logger.error(`Failed to upload screenshot ${field.screenshotPath}:`, error);
      }
    }

    logger.info(`Uploaded ${Object.keys(uploadedScreenshots).length} screenshots successfully`);
    return uploadedScreenshots;
  }

  private async updateCustomerMetadata(customerId: string, studyId: string): Promise<void> {
    const customerRef = this.db.collection('customers').doc(customerId);
    
    try {
      const customerDoc = await customerRef.get();
      
      if (customerDoc.exists) {
        // Update existing customer
        await customerRef.update({
          lastAnalysisAt: admin.firestore.FieldValue.serverTimestamp(),
          totalAnalyses: admin.firestore.FieldValue.increment(1),
          activeStudies: admin.firestore.FieldValue.arrayUnion(studyId)
        });
      } else {
        // Create new customer document
        await customerRef.set({
          customerId,
          name: customerId, // Could be enhanced with full name mapping
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastAnalysisAt: admin.firestore.FieldValue.serverTimestamp(),
          totalAnalyses: 1,
          activeStudies: [studyId]
        });
      }
    } catch (error) {
      logger.warn('Failed to update customer metadata:', error);
    }
  }

  private async updateSurveyMetadata(studyId: string, packageName: string, language: string, version: string): Promise<void> {
    const metadataId = `${studyId}_${packageName}`;
    const metadataRef = this.db.collection('survey-metadata').doc(metadataId);
    
    try {
      const metadataDoc = await metadataRef.get();
      
      if (metadataDoc.exists) {
        // Update existing metadata
        await metadataRef.update({
          lastUsed: admin.firestore.FieldValue.serverTimestamp(),
          supportedLanguages: admin.firestore.FieldValue.arrayUnion(language),
          versions: admin.firestore.FieldValue.arrayUnion(version)
        });
      } else {
        // Create new metadata document
        await metadataRef.set({
          studyId,
          packageName,
          description: `${packageName} survey`,
          category: 'general',
          averageQuestions: 0,
          supportedLanguages: [language],
          versions: [version],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUsed: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      logger.warn('Failed to update survey metadata:', error);
    }
  }

  async queryAnalyses(customerId?: string, studyId?: string, limit: number = 10): Promise<any[]> {
    if (!this.initialized) {
      throw new Error('Firestore service not initialized');
    }

    try {
      let query = this.db.collection('survey-analyses')
        .orderBy('analysisDate', 'desc')
        .limit(limit);

      if (customerId) {
        query = query.where('customerId', '==', customerId);
      }

      if (studyId) {
        query = query.where('studyId', '==', studyId);
      }

      const snapshot = await query.get();
      return snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.error('Failed to query analyses:', error);
      throw error;
    }
  }
}