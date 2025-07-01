import { logger } from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import archiver from "archiver";
import { Readable } from "stream";
import { FileManifest, DownloadRequest } from "../types/download";

export class DownloadService {
  private storage = getStorage();
  private bucketName = "castor-form-shot.appspot.com"; // Default Firebase Storage bucket

  /**
   * Get all on-entry screenshots for a study across all packages
   */
  async getStudyScreenshots(customerId: string, studyId: string): Promise<FileManifest[]> {
    logger.info("Getting study screenshots", { customerId, studyId });
    
    try {
      const bucket = this.storage.bucket(this.bucketName);
      
      // Get all files with the pattern: test-runs/{analysisId}/{timestamp}/screenshots/*entry*.png
      const [files] = await bucket.getFiles({
        prefix: `test-runs/`,
        delimiter: '/'
      });

      const manifests: FileManifest[] = [];
      
      for (const file of files) {
        const fileName = file.name;
        
        // Filter for entry screenshots and matching customer/study
        if (fileName.includes('entry') && 
            fileName.includes(customerId) && 
            fileName.includes(studyId) &&
            fileName.endsWith('.png')) {
          
          // Parse the file path to extract package info
          // Expected format: test-runs/{analysisId}/{timestamp}/screenshots/form_{N}_entry_{timestamp}.png
          const pathParts = fileName.split('/');
          const screenshotName = pathParts[pathParts.length - 1];
          
          // Extract package info from analysisId (format: customerId_studyId_packageName_language_version)
          if (pathParts.length >= 2) {
            const analysisId = pathParts[1];
            const analysisParts = analysisId.split('_');
            
            if (analysisParts.length >= 5 && 
                analysisParts[0] === customerId && 
                analysisParts[1] === studyId) {
              
              const packageName = analysisParts[2];
              const language = analysisParts[3];
              const version = analysisParts[4];
              
              // Get file metadata
              const [metadata] = await file.getMetadata();
              const sizeBytes = parseInt(String(metadata.size || '0'));
              
              // Create ZIP path: packageName/language/version/screenshots/filename
              const zipPath = `${packageName}/${language}/${version}/screenshots/${screenshotName}`;
              
              manifests.push({
                sourcePath: fileName,
                zipPath,
                sizeBytes
              });
            }
          }
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
   * Get all on-entry screenshots for a specific package
   */
  async getPackageScreenshots(customerId: string, studyId: string, packageName: string): Promise<FileManifest[]> {
    logger.info("Getting package screenshots", { customerId, studyId, packageName });
    
    try {
      const studyScreenshots = await this.getStudyScreenshots(customerId, studyId);
      
      // Filter for specific package
      const packageScreenshots = studyScreenshots.filter(manifest => 
        manifest.zipPath.startsWith(`${packageName}/`)
      );

      // Update ZIP paths to remove package prefix for package-level download
      const manifests = packageScreenshots.map(manifest => ({
        ...manifest,
        zipPath: manifest.zipPath.replace(`${packageName}/`, '')
      }));

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
      const bucket = this.storage.bucket(this.bucketName);
      const tempPath = `temp-downloads/${Date.now()}_${fileName}`;
      const file = bucket.file(tempPath);

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

      // Wait for upload to complete
      await new Promise((resolve, reject) => {
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
      });

      // Generate signed URL
      const expiresAt = Date.now() + (expirationMinutes * 60 * 1000);
      const [downloadUrl] = await file.getSignedUrl({
        action: 'read',
        expires: expiresAt
      });

      logger.info("ZIP uploaded successfully", { 
        tempPath, 
        fileName, 
        expiresAt: new Date(expiresAt).toISOString()
      });

      return { downloadUrl, expiresAt };
    } catch (error) {
      logger.error("Error uploading ZIP", { fileName, error });
      throw error;
    }
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