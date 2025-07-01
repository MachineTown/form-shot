import { logger } from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import archiver from "archiver";
import { Readable } from "stream";
import { FileManifest, DownloadRequest, DownloadStatus } from "../types/download";

export class DownloadService {
  private storage = getStorage();
  private firestore = getFirestore();
  private bucketName: string;

  constructor() {
    // Get bucket name from environment or use default
    this.bucketName = process.env.FIREBASE_STORAGE_BUCKET || "castor-form-shot.firebasestorage.app";
    
    // In production, try to use the default bucket if no explicit bucket is set
    if (!process.env.FIREBASE_STORAGE_BUCKET && process.env.FUNCTIONS_EMULATOR !== 'true') {
      try {
        // Get the default bucket from the storage instance
        const defaultBucket = this.storage.bucket();
        this.bucketName = defaultBucket.name;
        logger.info("Using default storage bucket", { bucketName: this.bucketName });
      } catch (error) {
        logger.warn("Could not get default bucket, using configured bucket", { 
          bucketName: this.bucketName,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    logger.info("DownloadService initialized", { 
      bucketName: this.bucketName,
      isEmulator: process.env.FUNCTIONS_EMULATOR === 'true'
    });
  }

  /**
   * Get all on-entry screenshots for a study across all packages
   */
  async getStudyScreenshots(customerId: string, studyId: string): Promise<FileManifest[]> {
    logger.info("Getting study screenshots", { customerId, studyId });
    
    try {
      const bucket = this.storage.bucket(this.bucketName);
      
      // Get all files with the pattern: survey-screenshots/{customerId}/{studyId}/...
      const [files] = await bucket.getFiles({
        prefix: `survey-screenshots/${customerId}/${studyId}/`,
      });

      logger.info("Raw files found for study", { 
        prefix: `survey-screenshots/${customerId}/${studyId}/`,
        totalFiles: files.length,
        fileNames: files.slice(0, 10).map(f => f.name) // Show first 10 files
      });

      // Group files by package/language to find latest versions
      const packageLanguageVersions = new Map<string, { version: string, files: Array<{ fileName: string, pathParts: string[] }> }>();
      
      for (const file of files) {
        const fileName = file.name;
        
        // Filter for entry screenshots only
        if (fileName.includes('entry') && fileName.endsWith('.png')) {
          
          // Parse the file path to extract package info
          // Expected format: survey-screenshots/{customerId}/{studyId}/{packageName}/{language}/{version}/form_{N}_entry_{timestamp}.png
          const pathParts = fileName.split('/');
          
          // Extract package info from path structure
          if (pathParts.length >= 6 && 
              pathParts[1] === customerId && 
              pathParts[2] === studyId) {
            
            const packageName = pathParts[3];
            const language = pathParts[4];
            const version = pathParts[5];
            
            const key = `${packageName}/${language}`;
            const existing = packageLanguageVersions.get(key);
            
            if (!existing || this.compareVersions(version, existing.version) > 0) {
              // This is a newer version, replace the existing one
              packageLanguageVersions.set(key, {
                version,
                files: [{ fileName, pathParts }]
              });
            } else if (existing && version === existing.version) {
              // Same version, add to files list
              existing.files.push({ fileName, pathParts });
            }
          }
        }
      }

      // Build manifests from the latest versions only
      const manifests: FileManifest[] = [];
      
      for (const [, versionData] of packageLanguageVersions) {
        for (const { fileName, pathParts } of versionData.files) {
          const screenshotName = pathParts[pathParts.length - 1];
          const packageName = pathParts[3];
          const language = pathParts[4];
          const version = pathParts[5];
          
          // Get file metadata
          const file = bucket.file(fileName);
          const [metadata] = await file.getMetadata();
          const sizeBytes = parseInt(String(metadata.size || '0'));
          
          // Create ZIP path: packageName/language/version/filename
          const zipPath = `${packageName}/${language}/${version}/${screenshotName}`;
          
          manifests.push({
            sourcePath: fileName,
            zipPath,
            sizeBytes
          });
        }
      }

      logger.info("Found study screenshots", { 
        customerId, 
        studyId, 
        count: manifests.length,
        totalSize: manifests.reduce((sum, m) => sum + m.sizeBytes, 0)
      });
      
      return manifests;
    } catch (error) {
      logger.error("Error getting study screenshots", { customerId, studyId, error });
      throw error;
    }
  }

  /**
   * Get all on-entry screenshots for a specific package (all languages, latest version of each)
   */
  async getPackageScreenshots(customerId: string, studyId: string, packageName: string): Promise<FileManifest[]> {
    logger.info("Getting package screenshots", { customerId, studyId, packageName });
    
    try {
      const bucket = this.storage.bucket(this.bucketName);
      
      // Get all files for this specific package
      const [files] = await bucket.getFiles({
        prefix: `survey-screenshots/${customerId}/${studyId}/${packageName}/`,
      });

      logger.info("Raw files found", { 
        prefix: `survey-screenshots/${customerId}/${studyId}/${packageName}/`,
        totalFiles: files.length,
        fileNames: files.slice(0, 10).map(f => f.name) // Show first 10 files
      });

      // If no files found, try broader search to understand storage structure
      if (files.length === 0) {
        logger.info("No files found with package prefix, checking broader paths...");
        
        // Check if customer/study exists
        const [studyFiles] = await bucket.getFiles({
          prefix: `survey-screenshots/${customerId}/${studyId}/`,
          maxResults: 10
        });
        
        logger.info("Files found at study level", {
          prefix: `survey-screenshots/${customerId}/${studyId}/`,
          count: studyFiles.length,
          fileNames: studyFiles.map(f => f.name)
        });
        
        // Check if customer exists
        const [customerFiles] = await bucket.getFiles({
          prefix: `survey-screenshots/${customerId}/`,
          maxResults: 10
        });
        
        logger.info("Files found at customer level", {
          prefix: `survey-screenshots/${customerId}/`,
          count: customerFiles.length,
          fileNames: customerFiles.map(f => f.name)
        });
        
        // Check what's actually in the survey-screenshots root
        const [rootFiles] = await bucket.getFiles({
          prefix: `survey-screenshots/`,
          maxResults: 20
        });
        
        logger.info("Files found at survey-screenshots root", {
          prefix: `survey-screenshots/`,
          count: rootFiles.length,
          fileNames: rootFiles.map(f => f.name)
        });
        
        // Check bucket name and list ALL files to see what's actually there
        logger.info("Bucket info and sample files", {
          bucketName: this.bucketName,
          totalRootFiles: rootFiles.length
        });
      }

      // Group files by language to find latest versions
      const languageVersions = new Map<string, { version: string, files: Array<{ fileName: string, pathParts: string[] }> }>();
      
      for (const file of files) {
        const fileName = file.name;
        
        logger.info("Checking file", { 
          fileName,
          hasEntry: fileName.includes('entry'),
          isPng: fileName.endsWith('.png'),
          pathParts: fileName.split('/')
        });
        
        // Filter for entry screenshots only
        if (fileName.includes('entry') && fileName.endsWith('.png')) {
          
          // Parse the file path to extract language/version info
          // Expected format: survey-screenshots/{customerId}/{studyId}/{packageName}/{language}/{version}/form_{N}_entry_{timestamp}.png
          const pathParts = fileName.split('/');
          
          // Extract language and version from path structure
          if (pathParts.length >= 6 && 
              pathParts[1] === customerId && 
              pathParts[2] === studyId &&
              pathParts[3] === packageName) {
            
            const language = pathParts[4];
            const version = pathParts[5];
            
            const existing = languageVersions.get(language);
            
            if (!existing || this.compareVersions(version, existing.version) > 0) {
              // This is a newer version, replace the existing one
              languageVersions.set(language, {
                version,
                files: [{ fileName, pathParts }]
              });
            } else if (existing && version === existing.version) {
              // Same version, add to files list
              existing.files.push({ fileName, pathParts });
            }
          }
        }
      }

      // Build manifests from the latest versions only
      const manifests: FileManifest[] = [];
      
      for (const [language, versionData] of languageVersions) {
        for (const { fileName, pathParts } of versionData.files) {
          const screenshotName = pathParts[pathParts.length - 1];
          const version = pathParts[5];
          
          // Get file metadata
          const file = bucket.file(fileName);
          const [metadata] = await file.getMetadata();
          const sizeBytes = parseInt(String(metadata.size || '0'));
          
          // Create ZIP path for package download: language/version/filename (no package prefix)
          const zipPath = `${language}/${version}/${screenshotName}`;
          
          manifests.push({
            sourcePath: fileName,
            zipPath,
            sizeBytes
          });
        }
      }

      logger.info("Found package screenshots", { 
        customerId, 
        studyId, 
        packageName,
        count: manifests.length,
        totalSize: manifests.reduce((sum, m) => sum + m.sizeBytes, 0)
      });
      
      return manifests;
    } catch (error) {
      logger.error("Error getting package screenshots", { customerId, studyId, packageName, error });
      throw error;
    }
  }

  /**
   * Compare version strings (e.g., "v1", "v2", "v10", "v1.1")
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  private compareVersions(v1: string, v2: string): number {
    // Remove 'v' prefix if present
    const clean1 = v1.replace(/^v/, '');
    const clean2 = v2.replace(/^v/, '');
    
    // Split by dots and compare numerically
    const parts1 = clean1.split('.').map(n => parseInt(n) || 0);
    const parts2 = clean2.split('.').map(n => parseInt(n) || 0);
    
    const maxLength = Math.max(parts1.length, parts2.length);
    
    for (let i = 0; i < maxLength; i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;
      
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    
    return 0;
  }

  /**
   * Generate a ZIP stream from file manifests
   */
  async generateZipStream(manifests: FileManifest[], includeMetadata = false): Promise<Readable> {
    logger.info("Generating ZIP stream", { fileCount: manifests.length, includeMetadata });
    
    const archive = archiver('zip', {
      zlib: { level: 6 } // Balance compression vs CPU
    });

    // Add files to archive
    for (const manifest of manifests) {
      try {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(manifest.sourcePath);
        
        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
          logger.warn("File not found, skipping", { path: manifest.sourcePath });
          continue;
        }

        // Add file to archive as a stream
        const fileStream = file.createReadStream();
        archive.append(fileStream, { name: manifest.zipPath });
        
      } catch (error) {
        logger.warn("Error adding file to ZIP", { 
          path: manifest.sourcePath, 
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with other files
      }
    }

    // Add metadata file if requested
    if (includeMetadata) {
      const metadata = {
        generatedAt: new Date().toISOString(),
        fileCount: manifests.length,
        totalSizeBytes: manifests.reduce((sum, m) => sum + m.sizeBytes, 0),
        files: manifests.map(m => ({
          path: m.zipPath,
          sizeBytes: m.sizeBytes
        }))
      };
      
      archive.append(JSON.stringify(metadata, null, 2), { name: 'download_metadata.json' });
    }

    // Finalize the archive
    archive.finalize();
    
    return archive;
  }

  /**
   * Upload ZIP stream to temporary storage and get signed URL
   */
  async uploadAndGetSignedUrl(
    zipStream: Readable, 
    fileName: string, 
    expirationMinutes = 60
  ): Promise<{ downloadUrl: string; expiresAt: number }> {
    logger.info("Uploading ZIP to temporary storage", { fileName, expirationMinutes });
    
    try {
      logger.info("Starting file upload", { 
        fileName, 
        bucketName: this.bucketName,
        expirationMinutes 
      });

      const bucket = this.storage.bucket(this.bucketName);
      const tempPath = `temp-downloads/${Date.now()}_${fileName}`;
      const file = bucket.file(tempPath);

      logger.info("Creating write stream", { tempPath, bucketName: this.bucketName });

      // Upload the ZIP stream
      const writeStream = file.createWriteStream({
        metadata: {
          contentType: 'application/zip',
          metadata: {
            temporary: 'true',
            createdAt: new Date().toISOString()
          }
        }
      });

      // Pipe the ZIP stream to Cloud Storage
      zipStream.pipe(writeStream);

      logger.info("Piped stream, waiting for upload to complete", { tempPath });

      // Wait for upload to complete
      await new Promise((resolve, reject) => {
        writeStream.on('error', (error) => {
          logger.error("Write stream error", { 
            tempPath, 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          reject(error);
        });
        writeStream.on('finish', () => {
          logger.info("Write stream finished successfully", { tempPath });
          resolve(void 0);
        });
      });

      logger.info("Upload completed, verifying file exists", { tempPath });

      const expiresAt = Date.now() + (expirationMinutes * 60 * 1000);
      
      // Check if we're in emulator mode
      const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
      
      logger.info("Generating download URL", { 
        isEmulator, 
        tempPath, 
        bucketName: this.bucketName,
        expiresAt: new Date(expiresAt).toISOString()
      });
      
      let downloadUrl: string;
      
      if (isEmulator) {
        // In emulator mode, proxy through function to avoid CORS issues
        downloadUrl = `http://localhost:5001/castor-form-shot/us-central1/downloadFile?path=${encodeURIComponent(tempPath)}`;
        logger.info("Using emulator proxy download URL", { tempPath, downloadUrl });
      } else {
        try {
          // In production, use signed URL with proper configuration
          logger.info("Attempting to generate signed URL", { 
            tempPath, 
            bucketName: this.bucketName,
            expiresAt 
          });
          
          // Try with proper Date object for expires
          const expirationDate = new Date(expiresAt);
          
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: expirationDate,
            version: 'v4' // Use v4 signing
          });
          downloadUrl = signedUrl;
          logger.info("Successfully generated signed URL", { tempPath, urlLength: signedUrl.length });
        } catch (signError) {
          logger.error("Failed to generate signed URL, trying fallback", { 
            tempPath, 
            bucketName: this.bucketName,
            error: signError instanceof Error ? signError.message : String(signError),
            stack: signError instanceof Error ? signError.stack : undefined
          });
          
          // Fallback: try to make the file public and return public URL
          try {
            logger.info("Attempting fallback: making file public", { tempPath });
            await file.makePublic();
            downloadUrl = `https://storage.googleapis.com/${this.bucketName}/${tempPath}`;
            logger.info("Successfully created public URL", { tempPath, downloadUrl });
          } catch (publicError) {
            logger.error("Failed to create public URL", { 
              tempPath, 
              error: publicError instanceof Error ? publicError.message : String(publicError)
            });
            throw signError; // Throw original signing error
          }
        }
      }

      logger.info("ZIP uploaded successfully", { 
        tempPath, 
        fileName, 
        expiresAt: new Date(expiresAt).toISOString(),
        isEmulator
      });

      return { downloadUrl, expiresAt };
    } catch (error) {
      logger.error("Error uploading ZIP", { fileName, error });
      throw error;
    }
  }

  /**
   * Create download status tracking in Firestore
   */
  async createDownloadStatus(requestId: string, totalFiles: number, totalSizeBytes: number): Promise<void> {
    const downloadRef = this.firestore.collection('download-requests').doc(requestId);
    
    const status: DownloadStatus = {
      status: 'processing',
      progress: 0
    };

    await downloadRef.set({
      ...status,
      totalFiles,
      totalSizeBytes,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });

    logger.info("Download status created", { requestId, totalFiles, totalSizeBytes });
  }

  /**
   * Update download progress in Firestore
   */
  async updateDownloadProgress(requestId: string, progress: number): Promise<void> {
    const downloadRef = this.firestore.collection('download-requests').doc(requestId);
    
    await downloadRef.update({
      progress,
      lastUpdated: new Date().toISOString()
    });

    logger.info("Download progress updated", { requestId, progress });
  }

  /**
   * Mark download as completed in Firestore
   */
  async completeDownloadStatus(
    requestId: string, 
    downloadUrl: string, 
    expiresAt: number,
    fileName: string
  ): Promise<void> {
    const downloadRef = this.firestore.collection('download-requests').doc(requestId);
    
    await downloadRef.update({
      status: 'completed',
      progress: 100,
      downloadUrl,
      expiresAt,
      fileName,
      completedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });

    logger.info("Download completed", { requestId, fileName, expiresAt });
  }

  /**
   * Mark download as failed in Firestore
   */
  async failDownloadStatus(requestId: string, errorMessage: string): Promise<void> {
    const downloadRef = this.firestore.collection('download-requests').doc(requestId);
    
    await downloadRef.update({
      status: 'failed',
      errorMessage,
      failedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });

    logger.error("Download failed", { requestId, errorMessage });
  }

  /**
   * Get download status from Firestore
   */
  async getDownloadStatus(requestId: string): Promise<DownloadStatus | null> {
    const downloadRef = this.firestore.collection('download-requests').doc(requestId);
    const doc = await downloadRef.get();
    
    if (!doc.exists) {
      return null;
    }

    return doc.data() as DownloadStatus;
  }

  /**
   * Generate ZIP stream with progress tracking
   */
  async generateZipStreamWithProgress(
    manifests: FileManifest[], 
    requestId: string,
    includeMetadata = false
  ): Promise<Readable> {
    logger.info("Generating ZIP stream with progress tracking", { 
      fileCount: manifests.length, 
      includeMetadata,
      requestId 
    });
    
    const archive = archiver('zip', {
      zlib: { level: 6 } // Balance compression vs CPU
    });

    let processedFiles = 0;
    const totalFiles = manifests.length;

    // Add files to archive with progress tracking
    for (const manifest of manifests) {
      try {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(manifest.sourcePath);
        
        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
          logger.warn("File not found, skipping", { path: manifest.sourcePath });
          processedFiles++;
          continue;
        }

        // Add file to archive as a stream
        const fileStream = file.createReadStream();
        archive.append(fileStream, { name: manifest.zipPath });
        
        processedFiles++;
        const progress = Math.round((processedFiles / totalFiles) * 90); // Reserve 10% for finalization
        
        // Update progress every 10 files or on completion
        if (processedFiles % 10 === 0 || processedFiles === totalFiles) {
          await this.updateDownloadProgress(requestId, progress);
        }
        
      } catch (error) {
        logger.warn("Error adding file to ZIP", { 
          path: manifest.sourcePath, 
          error: error instanceof Error ? error.message : String(error)
        });
        processedFiles++;
        // Continue with other files
      }
    }

    // Add metadata file if requested
    if (includeMetadata) {
      const metadata = {
        generatedAt: new Date().toISOString(),
        fileCount: manifests.length,
        totalSizeBytes: manifests.reduce((sum, m) => sum + m.sizeBytes, 0),
        files: manifests.map(m => ({
          path: m.zipPath,
          sizeBytes: m.sizeBytes
        }))
      };
      
      archive.append(JSON.stringify(metadata, null, 2), { name: 'download_metadata.json' });
    }

    // Finalize the archive
    archive.finalize();
    
    // Update progress to 95% (finalizing)
    await this.updateDownloadProgress(requestId, 95);
    
    return archive;
  }

  /**
   * Generate filename for download
   */
  generateFileName(request: DownloadRequest): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (request.packageName) {
      return `${request.customerId}_${request.studyId}_${request.packageName}_on-entry-screenshots_${timestamp}.zip`;
    } else {
      return `${request.customerId}_${request.studyId}_on-entry-screenshots_${timestamp}.zip`;
    }
  }
}