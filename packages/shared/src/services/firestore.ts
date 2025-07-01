import admin from 'firebase-admin';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { AnalysisOutput, Survey, SurveyField, SurveyForm, TestRunResult } from '../types/types.js';

export class FirestoreService {
  private db!: admin.firestore.Firestore;
  private storage!: admin.storage.Storage;
  private initialized = false;
  private useEmulator: boolean;

  constructor(useEmulator: boolean = false) {
    this.useEmulator = useEmulator;
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    try {
      // Configure emulator environment variables if using local emulators
      if (this.useEmulator) {
        process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
        process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
        logger.info('Using Firebase emulators (Firestore: 8080, Auth: 9099, Storage: 9199)');
      }

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
      
      // Check if Firebase is already initialized
      const apps = admin.apps || [];
      if (apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
        });
      }

      this.db = admin.firestore();
      this.storage = admin.storage();
      this.initialized = true;
      
      logger.info(`Firestore service initialized successfully${this.useEmulator ? ' (using emulators)' : ''}`);
    } catch (error) {
      logger.error('Failed to initialize Firestore service:', error);
      throw error;
    }
  }

  async uploadSurvey(survey: Survey, screenshotsDir: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Firestore service not initialized');
    }

    const { metadata, forms } = survey;
    const { tuple } = metadata;

    try {
      // Create document ID from tuple
      const docId = `${tuple.customerId}_${tuple.studyId}_${tuple.packageName}_${tuple.language}_${tuple.version}`;
      
      logger.info(`Uploading survey to Firestore with ID: ${docId}`);

      // Upload screenshots for all forms to Cloud Storage first
      const screenshotsPath = `survey-screenshots/${tuple.customerId}/${tuple.studyId}/${tuple.packageName}/${tuple.language}/${tuple.version}`;
      const uploadedScreenshots: Record<string, string> = {};
      
      for (const form of forms) {
        // Upload field screenshots
        const formScreenshots = await this.uploadScreenshots(form.fields, screenshotsDir, screenshotsPath);
        Object.assign(uploadedScreenshots, formScreenshots);
        
        // Upload form-level screenshots (on-entry and on-exit)
        const formLevelScreenshots = await this.uploadFormLevelScreenshots(form, screenshotsDir, screenshotsPath);
        Object.assign(uploadedScreenshots, formLevelScreenshots);
      }

      // Get the first form's title information for the analysis level
      const firstForm = forms[0];
      
      // Prepare main document data
      const surveyDoc = {
        // Tuple fields
        customerId: tuple.customerId,
        studyId: tuple.studyId,
        packageName: tuple.packageName,
        language: tuple.language,
        version: tuple.version,
        
        // Survey metadata
        analysisDate: admin.firestore.Timestamp.fromDate(new Date(metadata.analysisDate)),
        url: metadata.url,
        totalForms: metadata.totalForms,
        
        // Form metadata from first form (for UI compatibility)
        longTitle: firstForm?.longTitle || '',
        shortName: firstForm?.shortName || '',
        viewportHeight: firstForm?.viewportHeight || 0,
        timestamp: firstForm ? admin.firestore.Timestamp.fromDate(new Date(firstForm.timestamp)) : admin.firestore.FieldValue.serverTimestamp(),
        
        // First form screenshot for preview
        firstFormOnEntryScreenshotUrl: firstForm?.onEntryScreenshot ? uploadedScreenshots[firstForm.onEntryScreenshot] || '' : '',
        
        // Summary data from all forms
        fieldsCount: forms.reduce((sum, form) => sum + form.fields.length, 0),
        totalFields: forms.reduce((sum, form) => sum + form.fields.length, 0),
        hasTestData: forms.some(form => form.fields.some(field => field.testData)),
        testDataSummary: this.calculateTestDataSummary(forms.flatMap(f => f.fields)),
        
        // Cloud Storage references
        screenshotsPath: screenshotsPath,
        
        // Status and tracking
        status: 'completed',
        processingDuration: 0,
        
        // Audit fields
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Start batch write
      const batch = this.db.batch();

      // Add main survey document
      const surveyRef = this.db.collection('survey-analyses').doc(docId);
      batch.set(surveyRef, surveyDoc);

      // Add forms as subcollection documents
      const formsCollection = surveyRef.collection('forms');
      
      for (let formIndex = 0; formIndex < forms.length; formIndex++) {
        const form = forms[formIndex];
        const formId = `form_${formIndex + 1}`;
        const formRef = formsCollection.doc(formId);
        
        // Create form document
        const formDoc = {
          formIndex: formIndex,
          longTitle: form.longTitle,
          shortName: form.shortName,
          viewportHeight: form.viewportHeight,
          timestamp: admin.firestore.Timestamp.fromDate(new Date(form.timestamp)),
          fieldsCount: form.fields.length,
          navigationButtons: form.navigationButtons || [],
          order: formIndex + 1,
          hasTestData: form.fields.some(field => field.testData),
          testDataSummary: this.calculateTestDataSummary(form.fields),
          onEntryScreenshot: form.onEntryScreenshot || '',
          onExitScreenshot: form.onExitScreenshot || '',
          onEntryScreenshotUrl: uploadedScreenshots[form.onEntryScreenshot || ''] || '',
          onExitScreenshotUrl: uploadedScreenshots[form.onExitScreenshot || ''] || ''
        };
        
        batch.set(formRef, formDoc);
        
        // Add fields as subcollection documents under each form
        const fieldsCollection = formRef.collection('fields');
        
        for (let fieldIndex = 0; fieldIndex < form.fields.length; fieldIndex++) {
          const field = form.fields[fieldIndex];
          const fieldId = field.questionNumber ? `q${field.questionNumber.replace(/\./g, '_')}` : `field_${fieldIndex + 1}`;
          const fieldRef = fieldsCollection.doc(fieldId);
          
          // Create field document without embedded test cases
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
            order: fieldIndex + 1,
            formIndex: formIndex,
            // Store only test data metadata, not the test cases themselves
            testData: field.testData ? {
              detectedType: field.testData.detectedType,
              confidence: field.testData.confidence,
              detectionMethod: field.testData.detectionMethod,
              generatedAt: field.testData.generatedAt,
              summary: field.testData.summary,
              metadata: field.testData.metadata
            } : undefined
          };
          
          batch.set(fieldRef, fieldDoc);
          
          // Add test cases as sub-collection documents
          if (field.testData && field.testData.testCases.length > 0) {
            const testCasesCollection = fieldRef.collection('test-cases');
            
            field.testData.testCases.forEach((testCase) => {
              const testCaseRef = testCasesCollection.doc(testCase.id);
              const testCaseDoc: any = {
                id: testCase.id,
                type: testCase.type,
                value: testCase.value,
                description: testCase.description,
                source: testCase.source,
                provenance: testCase.provenance,
                status: testCase.status,
                quality: testCase.quality,
                // Add references for easier querying
                fieldId: fieldId,
                formId: formId,
                formIndex: formIndex,
                questionNumber: field.questionNumber,
                analysisId: docId,
                customerId: tuple.customerId,
                studyId: tuple.studyId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              };
              
              // Only add position if it's defined
              if (testCase.position !== undefined) {
                testCaseDoc.position = testCase.position;
              }
              
              batch.set(testCaseRef, testCaseDoc);
            });
          }
        }
      }

      // Update customer metadata
      await this.updateCustomerMetadata(tuple.customerId, tuple.studyId);
      
      // Update survey metadata
      await this.updateSurveyMetadata(tuple.studyId, tuple.packageName, tuple.language, tuple.version);

      // Commit batch
      await batch.commit();
      
      logger.info(`Successfully uploaded survey with ${forms.length} forms and ${forms.reduce((sum, f) => sum + f.fields.length, 0)} total fields to Firestore`);
      
    } catch (error) {
      logger.error('Failed to upload survey to Firestore:', error);
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
        hasTestData: form.fields.some(field => field.testData),
        testDataSummary: this.calculateTestDataSummary(form.fields),
        
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
      
      for (let index = 0; index < form.fields.length; index++) {
        const field = form.fields[index];
        const fieldId = field.questionNumber ? `q${field.questionNumber.replace(/\./g, '_')}` : `field_${index + 1}`;
        const fieldRef = fieldsCollection.doc(fieldId);
        
        // Create field document without embedded test cases
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
          order: index + 1,
          // Store only test data metadata, not the test cases themselves
          testData: field.testData ? {
            detectedType: field.testData.detectedType,
            confidence: field.testData.confidence,
            detectionMethod: field.testData.detectionMethod,
            generatedAt: field.testData.generatedAt,
            summary: field.testData.summary,
            metadata: field.testData.metadata
          } : undefined
        };
        
        batch.set(fieldRef, fieldDoc);
        
        // Add test cases as sub-collection documents
        if (field.testData && field.testData.testCases.length > 0) {
          const testCasesCollection = fieldRef.collection('test-cases');
          
          field.testData.testCases.forEach((testCase) => {
            const testCaseRef = testCasesCollection.doc(testCase.id);
            const testCaseDoc: any = {
              id: testCase.id,
              type: testCase.type,
              value: testCase.value,
              description: testCase.description,
              source: testCase.source,
              provenance: testCase.provenance,
              status: testCase.status,
              quality: testCase.quality,
              // Add references for easier querying
              fieldId: fieldId,
              questionNumber: field.questionNumber,
              analysisId: docId,
              customerId: tuple.customerId,
              studyId: tuple.studyId,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            // Only add position if it's defined
            if (testCase.position !== undefined) {
              testCaseDoc.position = testCase.position;
            }
            
            batch.set(testCaseRef, testCaseDoc);
          });
        }
      }

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

  private async uploadFormLevelScreenshots(form: SurveyForm, screenshotsDir: string, basePath: string): Promise<Record<string, string>> {
    const uploadedScreenshots: Record<string, string> = {};
    const bucket = this.storage.bucket();

    logger.info(`Uploading form-level screenshots for form: ${form.shortName}`);

    // Upload on-entry screenshot
    if (form.onEntryScreenshot) {
      try {
        const localPath = join(screenshotsDir, form.onEntryScreenshot);
        if (!existsSync(localPath)) {
          logger.warn(`On-entry screenshot not found: ${localPath}`);
        } else {
          const cloudPath = `${basePath}/${form.onEntryScreenshot}`;
          const file = bucket.file(cloudPath);
          
          await file.save(readFileSync(localPath), {
            metadata: {
              contentType: 'image/png',
              metadata: {
                type: 'on-entry',
                formTitle: form.longTitle,
                formShortName: form.shortName
              }
            }
          });

          await file.makePublic();
          uploadedScreenshots[form.onEntryScreenshot] = `https://storage.googleapis.com/${bucket.name}/${cloudPath}`;
          logger.debug(`Uploaded on-entry screenshot: ${form.onEntryScreenshot}`);
        }
      } catch (error) {
        logger.error(`Failed to upload on-entry screenshot ${form.onEntryScreenshot}:`, error);
      }
    }

    // Upload on-exit screenshot
    if (form.onExitScreenshot) {
      try {
        const localPath = join(screenshotsDir, form.onExitScreenshot);
        if (!existsSync(localPath)) {
          logger.warn(`On-exit screenshot not found: ${localPath}`);
        } else {
          const cloudPath = `${basePath}/${form.onExitScreenshot}`;
          const file = bucket.file(cloudPath);
          
          await file.save(readFileSync(localPath), {
            metadata: {
              contentType: 'image/png',
              metadata: {
                type: 'on-exit',
                formTitle: form.longTitle,
                formShortName: form.shortName
              }
            }
          });

          await file.makePublic();
          uploadedScreenshots[form.onExitScreenshot] = `https://storage.googleapis.com/${bucket.name}/${cloudPath}`;
          logger.debug(`Uploaded on-exit screenshot: ${form.onExitScreenshot}`);
        }
      } catch (error) {
        logger.error(`Failed to upload on-exit screenshot ${form.onExitScreenshot}:`, error);
      }
    }

    return uploadedScreenshots;
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
          activeStudies: admin.firestore.FieldValue.arrayUnion(studyId)
        });
      } else {
        // Create new customer document
        await customerRef.set({
          customerId,
          name: customerId, // Could be enhanced with full name mapping
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastAnalysisAt: admin.firestore.FieldValue.serverTimestamp(),
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

  async getAnalysisWithTestCases(analysisId: string): Promise<any> {
    if (!this.initialized) {
      throw new Error('Firestore service not initialized');
    }

    try {
      // Get main analysis document
      const analysisDoc = await this.db.collection('survey-analyses').doc(analysisId).get();
      if (!analysisDoc.exists) {
        throw new Error(`Analysis not found: ${analysisId}`);
      }

      const analysisData = { id: analysisDoc.id, ...analysisDoc.data() };

      // Get all fields
      const fieldsSnapshot = await analysisDoc.ref.collection('fields').orderBy('order').get();
      const fields = [];

      for (const fieldDoc of fieldsSnapshot.docs) {
        const fieldData: any = { id: fieldDoc.id, ...fieldDoc.data() };

        // Get test cases for this field
        const testCasesSnapshot = await fieldDoc.ref.collection('test-cases').get();
        const testCases = testCasesSnapshot.docs.map(tcDoc => ({
          id: tcDoc.id,
          ...tcDoc.data()
        }));

        // Reconstruct testData structure for compatibility
        if (fieldData.testData && testCases.length > 0) {
          fieldData.testData.testCases = testCases;
        }

        fields.push(fieldData);
      }

      (analysisData as any).fields = fields;
      return analysisData;

    } catch (error) {
      logger.error('Failed to get analysis with test cases:', error);
      throw error;
    }
  }

  async queryTestCases(filters: {
    analysisId?: string;
    customerId?: string;
    studyId?: string;
    status?: string;
    source?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    if (!this.initialized) {
      throw new Error('Firestore service not initialized');
    }

    try {
      let query: any = this.db.collectionGroup('test-cases');

      if (filters.analysisId) {
        query = query.where('analysisId', '==', filters.analysisId);
      }
      if (filters.customerId) {
        query = query.where('customerId', '==', filters.customerId);
      }
      if (filters.studyId) {
        query = query.where('studyId', '==', filters.studyId);
      }
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }
      if (filters.source) {
        query = query.where('source', '==', filters.source);
      }

      query = query.orderBy('createdAt', 'desc');
      
      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const snapshot = await query.get();
      return snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.error('Failed to query test cases:', error);
      throw error;
    }
  }

  async updateTestCaseStatus(analysisId: string, fieldId: string, testCaseId: string, status: string, reviewerId?: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Firestore service not initialized');
    }

    try {
      const testCaseRef = this.db
        .collection('survey-analyses')
        .doc(analysisId)
        .collection('fields')
        .doc(fieldId)
        .collection('test-cases')
        .doc(testCaseId);

      const updateData: any = {
        status,
        'quality.reviewCount': admin.firestore.FieldValue.increment(1),
        'quality.lastReviewed': admin.firestore.FieldValue.serverTimestamp()
      };

      if (reviewerId) {
        updateData['provenance.modifications'] = admin.firestore.FieldValue.arrayUnion({
          timestamp: new Date().toISOString(),
          modifiedBy: reviewerId,
          action: 'status_update',
          changes: { status: { to: status } },
          reason: 'Manual review'
        });
      }

      await testCaseRef.update(updateData);
      logger.debug(`Updated test case ${testCaseId} status to ${status}`);

    } catch (error) {
      logger.error('Failed to update test case status:', error);
      throw error;
    }
  }

  private calculateTestDataSummary(fields: SurveyField[]): any {
    const fieldsWithTestData = fields.filter(field => field.testData);
    
    if (fieldsWithTestData.length === 0) {
      return {
        fieldsWithTestData: 0,
        totalTestCases: 0,
        generatedTestCases: 0,
        humanTestCases: 0,
        hybridTestCases: 0
      };
    }

    const totalTestCases = fieldsWithTestData.reduce((sum, field) => 
      sum + (field.testData?.testCases.length || 0), 0);
    
    const generatedTestCases = fieldsWithTestData.reduce((sum, field) => 
      sum + (field.testData?.summary.generatedCount || 0), 0);
    
    const humanTestCases = fieldsWithTestData.reduce((sum, field) => 
      sum + (field.testData?.summary.humanCount || 0), 0);
    
    const hybridTestCases = fieldsWithTestData.reduce((sum, field) => 
      sum + (field.testData?.summary.hybridCount || 0), 0);

    return {
      fieldsWithTestData: fieldsWithTestData.length,
      totalTestCases,
      generatedTestCases,
      humanTestCases,
      hybridTestCases,
      averageTestCasesPerField: Math.round(totalTestCases / fieldsWithTestData.length * 100) / 100
    };
  }

  async clearAllData(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Firestore service not initialized');
    }

    try {
      logger.info('Starting to clear all Firestore data...');

      // Clear survey-analyses collection and all subcollections
      await this.clearCollection('survey-analyses');
      
      // Clear Cloud Storage screenshots
      await this.clearStorageFolder('survey-screenshots');

      logger.info('Successfully cleared all Firestore data and storage');
    } catch (error) {
      logger.error('Failed to clear Firestore data:', error);
      throw error;
    }
  }

  private async clearCollection(collectionName: string): Promise<void> {
    const collectionRef = this.db.collection(collectionName);
    const snapshot = await collectionRef.get();

    logger.info(`Found ${snapshot.size} documents in ${collectionName} collection`);

    if (snapshot.empty) {
      logger.info(`Collection ${collectionName} is already empty`);
      return;
    }

    // Process documents in batches
    const batchSize = 500;
    const batches: admin.firestore.DocumentSnapshot[][] = [];
    
    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      batches.push(snapshot.docs.slice(i, i + batchSize));
    }

    for (const [batchIndex, batch] of batches.entries()) {
      logger.info(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} documents)`);
      
      for (const doc of batch) {
        // Clear subcollections first
        await this.clearSubcollections(doc.ref);
        
        // Delete the document
        await doc.ref.delete();
      }
    }

    logger.info(`Cleared ${snapshot.size} documents from ${collectionName} collection`);
  }

  private async clearSubcollections(docRef: admin.firestore.DocumentReference): Promise<void> {
    const subcollections = await docRef.listCollections();
    
    for (const subcollection of subcollections) {
      const snapshot = await subcollection.get();
      
      for (const doc of snapshot.docs) {
        // Recursively clear nested subcollections
        await this.clearSubcollections(doc.ref);
        await doc.ref.delete();
      }
    }
  }

  private async clearStorageFolder(folderPath: string): Promise<void> {
    try {
      const bucket = this.storage.bucket();
      const [files] = await bucket.getFiles({ prefix: folderPath });
      
      logger.info(`Found ${files.length} files in storage folder: ${folderPath}`);
      
      if (files.length === 0) {
        logger.info(`Storage folder ${folderPath} is already empty`);
        return;
      }

      // Delete files in batches
      const batchSize = 100;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.all(batch.map(file => file.delete()));
        logger.info(`Deleted ${batch.length} files (${i + batch.length}/${files.length})`);
      }

      logger.info(`Cleared ${files.length} files from storage folder: ${folderPath}`);
    } catch (error: any) {
      if (error.code === 404) {
        logger.info(`Storage folder ${folderPath} does not exist`);
      } else {
        logger.error(`Failed to clear storage folder ${folderPath}:`, error);
        throw error;
      }
    }
  }

  async uploadTestRunResults(testRunResult: TestRunResult, outputDir: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Firestore service not initialized');
    }

    try {
      const runId = `${testRunResult.analysisId}_${new Date(testRunResult.startTime).getTime()}`;
      logger.info(`Uploading test run results with ID: ${runId}`);

      // Upload screenshots to Cloud Storage first
      const screenshotsPath = `test-runs/${testRunResult.analysisId}/${new Date(testRunResult.startTime).getTime()}`;
      const uploadedScreenshots = await this.uploadTestRunScreenshots(testRunResult.results, outputDir, screenshotsPath);

      // Create test run document
      const testRunDoc = {
        runId,
        analysisId: testRunResult.analysisId,
        url: testRunResult.url,
        startTime: admin.firestore.Timestamp.fromDate(new Date(testRunResult.startTime)),
        endTime: admin.firestore.Timestamp.fromDate(new Date(testRunResult.endTime)),
        totalDuration: testRunResult.totalDuration,
        fieldsProcessed: testRunResult.fieldsProcessed,
        testCasesExecuted: testRunResult.testCasesExecuted,
        successfulTestCases: testRunResult.successfulTestCases,
        failedTestCases: testRunResult.failedTestCases,
        validationErrorsFound: testRunResult.validationErrorsFound,
        screenshotsPath,
        status: testRunResult.failedTestCases > 0 ? 'completed_with_failures' : 'completed',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Start batch write
      const batch = this.db.batch();

      // Add main test run document
      const testRunRef = this.db.collection('test-runs').doc(runId);
      batch.set(testRunRef, testRunDoc);

      // Add test case results as subcollection
      const resultsCollection = testRunRef.collection('results');
      
      for (const result of testRunResult.results) {
        const resultId = `${result.fieldId}_${result.testCaseId}`;
        const resultRef = resultsCollection.doc(resultId);
        
        const resultDoc = {
          ...result,
          screenshotUrl: uploadedScreenshots[result.screenshotPath] || '',
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        
        batch.set(resultRef, resultDoc);
      }

      // Update analysis document with latest test run info
      const analysisRef = this.db.collection('survey-analyses').doc(testRunResult.analysisId);
      batch.update(analysisRef, {
        lastTestRunAt: admin.firestore.FieldValue.serverTimestamp(),
        totalTestRuns: admin.firestore.FieldValue.increment(1),
        lastTestRunId: runId,
        lastTestRunStatus: testRunDoc.status
      });

      // Commit batch
      await batch.commit();
      
      logger.info(`Successfully uploaded test run results with ${testRunResult.results.length} test case results`);
      
    } catch (error) {
      logger.error('Failed to upload test run results to Firestore:', error);
      throw error;
    }
  }

  private async uploadTestRunScreenshots(results: any[], outputDir: string, basePath: string): Promise<Record<string, string>> {
    const uploadedScreenshots: Record<string, string> = {};
    const bucket = this.storage.bucket();

    // Get all PNG files from the output directory
    const screenshotFiles = readdirSync(outputDir).filter(file => file.endsWith('.png'));
    logger.info(`Uploading ${screenshotFiles.length} test run screenshots to Cloud Storage`);

    for (const filename of screenshotFiles) {
      try {
        const localPath = join(outputDir, filename);
        const cloudPath = `${basePath}/${filename}`;
        const file = bucket.file(cloudPath);
        
        await file.save(readFileSync(localPath), {
          metadata: {
            contentType: 'image/png',
            metadata: {
              testRun: true,
              timestamp: new Date().toISOString()
            }
          }
        });

        // Make file publicly readable
        await file.makePublic();
        
        // Get public URL
        uploadedScreenshots[filename] = `https://storage.googleapis.com/${bucket.name}/${cloudPath}`;
        
        logger.debug(`Uploaded test run screenshot: ${filename}`);
        
      } catch (error) {
        logger.error(`Failed to upload test run screenshot ${filename}:`, error);
      }
    }

    logger.info(`Uploaded ${Object.keys(uploadedScreenshots).length} test run screenshots successfully`);
    return uploadedScreenshots;
  }
}