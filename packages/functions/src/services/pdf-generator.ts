import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
const PDFDocument = require('pdfkit');
import * as https from 'https';
import * as http from 'http';

interface ReportConfiguration {
  id: string;
  customerId: string;
  studyId: string;
  packageName: string;
  name: string;
  description?: string;
  formOrder: string[];
  selectedLanguages: string[];
  includeMetadata: boolean;
  pageOrientation: 'portrait' | 'landscape';
  pageSize: 'A4' | 'Letter' | 'Legal';
  screenshotType: 'on-exit' | 'on-entry' | 'both';
}

interface FormData {
  id: string;
  formIndex: number;
  longTitle: string;
  shortName?: string;
  questionCount: number;
  screenshotPath?: string;
  screenshotUrl?: string;
}

interface AnalysisData {
  id: string;
  customerId: string;
  studyId: string;
  packageName: string;
  language: string;
  version: string;
  forms: FormData[];
}

export class PDFGenerator {
  private firestore: admin.firestore.Firestore;
  private storage: admin.storage.Storage;

  constructor() {
    this.firestore = admin.firestore();
    this.storage = admin.storage();
  }

  /**
   * Generate PDF reports for a configuration
   */
  async generateReports(configurationId: string, jobId: string): Promise<void> {
    try {
      console.log(`Starting PDF generation for configuration: ${configurationId}, job: ${jobId}`);
      
      // Update job status to processing
      await this.updateJobStatus(jobId, 'processing');

      // Fetch configuration
      const config = await this.getConfiguration(configurationId);
      if (!config) {
        throw new Error(`Configuration not found: ${configurationId}`);
      }

      const generatedFiles: Record<string, any> = {};

      // Generate PDF for each selected language
      for (const language of config.selectedLanguages) {
        try {
          console.log(`Generating PDF for language: ${language}`);
          
          // Fetch analysis data for this language
          const analysisData = await this.getAnalysisData(
            config.customerId,
            config.studyId,
            config.packageName,
            language,
            config
          );

          if (!analysisData) {
            console.warn(`No analysis data found for language: ${language}`);
            continue;
          }

          // Generate the PDF
          const pdfBuffer = await this.generatePDF(config, analysisData);
          
          // Upload to Cloud Storage
          const uploadResult = await this.uploadPDF(
            pdfBuffer,
            config,
            language,
            jobId
          );

          generatedFiles[language] = {
            url: uploadResult.url,
            size: uploadResult.size,
            pageCount: uploadResult.pageCount
          };

          console.log(`PDF generated successfully for language: ${language}`);
        } catch (error) {
          console.error(`Failed to generate PDF for language ${language}:`, error);
          generatedFiles[language] = {
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }

      // Update job with results
      await this.updateJobStatus(jobId, 'completed', generatedFiles);
      console.log(`PDF generation completed for job: ${jobId}`);

    } catch (error) {
      console.error('PDF generation failed:', error);
      await this.updateJobStatus(jobId, 'failed', undefined, 
        error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Generate a single PDF document
   */
  private async generatePDF(
    config: ReportConfiguration,
    analysisData: AnalysisData
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      const chunks: Buffer[] = [];
      
      // Create PDF document
      const doc = new PDFDocument({
        size: config.pageSize || 'A4',
        layout: config.pageOrientation || 'portrait',
        margin: 50,
        info: {
          Title: `${config.name} - ${analysisData.language}`,
          Author: 'Form-Shot Report Generator',
          Subject: config.description || '',
          CreationDate: new Date()
        }
      });

      // Collect PDF data
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add title page
      this.addTitlePage(doc, config, analysisData);

      // Process forms in configured order
      const orderedForms = this.orderForms(analysisData.forms, config.formOrder);
      
      for (const form of orderedForms) {
        await this.addFormPage(doc, form, config, analysisData);
      }

      // Finalize PDF
      doc.end();
    });
  }

  /**
   * Add title page to PDF
   */
  private addTitlePage(
    doc: any,
    config: ReportConfiguration,
    analysisData: AnalysisData
  ): void {
    // Title
    doc.fontSize(24)
       .text(config.name, { align: 'center' });
    
    doc.moveDown();
    
    // Description
    if (config.description) {
      doc.fontSize(14)
         .fillColor('#666666')
         .text(config.description, { align: 'center' });
    }
    
    doc.moveDown(2);
    
    // Metadata
    doc.fontSize(12)
       .fillColor('#000000')
       .text(`Customer: ${analysisData.customerId}`)
       .text(`Study: ${analysisData.studyId}`)
       .text(`Package: ${analysisData.packageName}`)
       .text(`Language: ${analysisData.language}`)
       .text(`Generated: ${new Date().toLocaleDateString()}`);
    
    // Start new page for forms
    doc.addPage();
  }

  /**
   * Add a form page to PDF
   */
  private async addFormPage(
    doc: any,
    form: FormData,
    config: ReportConfiguration,
    analysisData: AnalysisData
  ): Promise<void> {
    // Form header
    doc.fontSize(16)
       .fillColor('#000000')
       .text(`Form ${form.formIndex + 1}: ${form.longTitle}`);
    
    if (form.shortName) {
      doc.fontSize(12)
         .fillColor('#666666')
         .text(`(${form.shortName})`);
    }
    
    doc.moveDown();
    
    // Add screenshot if available
    if (form.screenshotUrl) {
      try {
        const imageBuffer = await this.downloadImage(form.screenshotUrl);
        
        // Calculate image dimensions to fit page
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const maxHeight = doc.page.height - doc.y - doc.page.margins.bottom - 50;
        
        doc.image(imageBuffer, {
          fit: [pageWidth, maxHeight],
          align: 'center'
        });
      } catch (error) {
        console.error(`Failed to add screenshot for form ${form.id}:`, error);
        doc.fontSize(10)
           .fillColor('#ff0000')
           .text('Screenshot unavailable');
      }
    }
    
    // Add metadata if configured
    if (config.includeMetadata) {
      doc.moveDown()
         .fontSize(10)
         .fillColor('#666666')
         .text(`Questions: ${form.questionCount}`);
    }
    
    // Start new page for next form (except for last form)
    if (form !== analysisData.forms[analysisData.forms.length - 1]) {
      doc.addPage();
    }
  }

  /**
   * Order forms according to configuration
   */
  private orderForms(forms: FormData[], formOrder: string[]): FormData[] {
    const formMap = new Map(forms.map(f => [f.id, f]));
    const orderedForms: FormData[] = [];
    
    // Add forms in configured order
    for (const formId of formOrder) {
      const form = formMap.get(formId);
      if (form) {
        orderedForms.push(form);
      }
    }
    
    return orderedForms;
  }

  /**
   * Download image from URL
   */
  private async downloadImage(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      
      client.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }
        
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Upload PDF to Cloud Storage
   */
  private async uploadPDF(
    pdfBuffer: Buffer,
    config: ReportConfiguration,
    language: string,
    jobId: string
  ): Promise<{ url: string; size: number; pageCount: number }> {
    const bucket = this.storage.bucket('castor-form-shot.firebasestorage.app');
    const fileName = `reports/${config.customerId}/${config.studyId}/${config.packageName}/${jobId}/${language}.pdf`;
    const file = bucket.file(fileName);
    
    // Upload the PDF
    await file.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          configurationId: config.id,
          language: language,
          generatedAt: new Date().toISOString()
        }
      }
    });
    
    // Generate URL for accessing the PDF
    let url: string;
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      // In emulator, use public URL instead of signed URL
      url = `http://localhost:9199/v0/b/castor-form-shot.firebasestorage.app/o/${encodeURIComponent(fileName)}?alt=media`;
    } else {
      // In production, generate signed URL (24 hours expiration)
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000
      });
      url = signedUrl;
    }
    
    // TODO: Calculate actual page count from PDF
    const pageCount = config.formOrder.length + 1; // Forms + title page
    
    return {
      url,
      size: pdfBuffer.length,
      pageCount
    };
  }

  /**
   * Get configuration from Firestore
   */
  private async getConfiguration(configId: string): Promise<ReportConfiguration | null> {
    const doc = await this.firestore
      .collection('report-configurations')
      .doc(configId)
      .get();
    
    if (!doc.exists) {
      return null;
    }
    
    return {
      id: doc.id,
      ...doc.data()
    } as ReportConfiguration;
  }

  /**
   * Get analysis data from Firestore
   */
  private async getAnalysisData(
    customerId: string,
    studyId: string,
    packageName: string,
    language: string,
    config?: ReportConfiguration
  ): Promise<AnalysisData | null> {
    console.log(`Looking for analysis data: ${customerId}/${studyId}/${packageName}/${language}`);
    
    // Query survey-analyses collection with the tuple of identifiers
    const querySnapshot = await this.firestore
      .collection('survey-analyses')
      .where('customerId', '==', customerId)
      .where('studyId', '==', studyId)
      .where('packageName', '==', packageName)
      .where('language', '==', language)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (querySnapshot.empty) {
      console.log(`No analysis found for language ${language}, trying without language filter...`);
      
      // Try to find any analysis for this package
      const anyLangQuery = await this.firestore
        .collection('survey-analyses')
        .where('customerId', '==', customerId)
        .where('studyId', '==', studyId)
        .where('packageName', '==', packageName)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
      
      if (!anyLangQuery.empty) {
        const doc = anyLangQuery.docs[0];
        console.log(`Found analysis with language: ${doc.data().language}`);
        console.log('Available analyses:', anyLangQuery.docs.map(d => ({
          id: d.id,
          language: d.data().language,
          version: d.data().version
        })));
      }
      
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    
    // Fetch forms from the subcollection
    const formsSnapshot = await this.firestore
      .collection('survey-analyses')
      .doc(doc.id)
      .collection('forms')
      .orderBy('formIndex')
      .get();
    
    // Transform forms data and use stored screenshot URLs
    const forms = await Promise.all(formsSnapshot.docs.map(async (formDoc) => {
      const form = formDoc.data();
      let screenshotUrl = null;
      
      // Select screenshot URL based on config.screenshotType (default to on-exit)
      // The URLs are already stored in Firestore from the upload process
      const screenshotType = config?.screenshotType || 'on-exit';
      
      if (screenshotType === 'on-entry' && form.onEntryScreenshotUrl) {
        screenshotUrl = form.onEntryScreenshotUrl;
        console.log(`Using on-entry screenshot URL for form ${formDoc.id}`);
      } else if (screenshotType === 'both') {
        // For 'both', prefer on-exit but fallback to on-entry
        screenshotUrl = form.onExitScreenshotUrl || form.onEntryScreenshotUrl;
        console.log(`Using ${form.onExitScreenshotUrl ? 'on-exit' : 'on-entry'} screenshot URL for form ${formDoc.id} (both mode)`);
      } else if (form.onExitScreenshotUrl) {
        // Default to on-exit
        screenshotUrl = form.onExitScreenshotUrl;
        console.log(`Using on-exit screenshot URL for form ${formDoc.id}`);
      } else if (form.onEntryScreenshotUrl) {
        // Fallback to on-entry if on-exit not available
        screenshotUrl = form.onEntryScreenshotUrl;
        console.log(`Using on-entry screenshot URL for form ${formDoc.id} (fallback)`);
      } else {
        console.log(`No screenshot URLs found for form ${formDoc.id}. Available fields: onExitScreenshotUrl=${form.onExitScreenshotUrl}, onEntryScreenshotUrl=${form.onEntryScreenshotUrl}`);
      }
      
      return {
        id: formDoc.id,
        formIndex: form.formIndex,
        longTitle: form.longTitle,
        shortName: form.shortName,
        questionCount: form.questions?.length || 0,
        screenshotPath: form.onExitScreenshot,
        screenshotUrl: screenshotUrl || undefined
      };
    }));
    
    return {
      id: doc.id,
      customerId: data.customerId,
      studyId: data.studyId,
      packageName: data.packageName,
      language: data.language,
      version: data.version,
      forms
    };
  }

  /**
   * Update job status in Firestore
   */
  private async updateJobStatus(
    jobId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    generatedFiles?: Record<string, any>,
    error?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      updatedAt: FieldValue.serverTimestamp()
    };
    
    if (status === 'processing') {
      updateData.startedAt = FieldValue.serverTimestamp();
    }
    
    if (status === 'completed') {
      updateData.completedAt = FieldValue.serverTimestamp();
      if (generatedFiles) {
        updateData.generatedFiles = generatedFiles;
      }
    }
    
    if (status === 'failed' && error) {
      updateData.error = error;
      updateData.failedAt = FieldValue.serverTimestamp();
    }
    
    await this.firestore
      .collection('report-generation-jobs')
      .doc(jobId)
      .update(updateData);
  }
}