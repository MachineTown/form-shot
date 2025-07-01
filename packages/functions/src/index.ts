import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { DownloadService } from "./services/downloadService";
import { DownloadRequest, DownloadResponse } from "./types/download";

// Initialize Firebase Admin SDK
initializeApp();

export const helloworld = onRequest({
  cors: true
}, async (request, response) => {
  const startTime = Date.now();
  
  try {
    // Log the request details
    logger.info("Helloworld function called", {
      method: request.method,
      userAgent: request.get("User-Agent"),
      ip: request.ip,
      timestamp: new Date().toISOString()
    });

    // Check if user is authenticated
    const authHeader = request.get("Authorization");
    let userInfo = null;
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await getAuth().verifyIdToken(idToken);
        userInfo = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified
        };
        
        logger.info("Authenticated user accessing helloworld", {
          uid: userInfo.uid,
          email: userInfo.email,
          emailVerified: userInfo.emailVerified
        });
      } catch (authError) {
        logger.warn("Invalid token provided", { error: authError });
      }
    } else {
      logger.info("Unauthenticated request to helloworld");
    }

    // Prepare response data
    const responseData = {
      message: "Hello from Firebase Functions!",
      timestamp: new Date().toISOString(),
      user: userInfo,
      requestId: Math.random().toString(36).substring(7),
      processingTime: Date.now() - startTime
    };

    // Log successful response
    logger.info("Helloworld function completed successfully", {
      processingTimeMs: responseData.processingTime,
      authenticated: !!userInfo,
      requestId: responseData.requestId
    });

    response.status(200).json(responseData);

  } catch (error) {
    // Log error
    logger.error("Helloworld function failed", {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    response.status(500).json({
      error: "Internal server error",
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substring(7)
    });
  }
});

// Helper function to authenticate user
async function authenticateUser(request: any): Promise<{ uid: string; email: string; emailVerified: boolean } | null> {
  const authHeader = request.get("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  try {
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    
    // In emulator mode, be more permissive for development
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    
    logger.info("Auth token decoded", {
      uid: decodedToken.uid,
      email: decodedToken.email,
      isEmulator,
      env: process.env.FUNCTIONS_EMULATOR
    });
    
    return {
      uid: decodedToken.uid,
      email: decodedToken.email || (isEmulator ? 'dev@test.com' : ''),
      emailVerified: decodedToken.email_verified || isEmulator
    };
  } catch (error) {
    logger.warn("Authentication failed", { error });
    return null;
  }
}

export const downloadStudyZip = onRequest({
  cors: true,
  timeoutSeconds: 60, // 1 minute
  memory: "2GiB"
}, async (request, response) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    logger.info("Download study ZIP function called", {
      method: request.method,
      requestId,
      timestamp: new Date().toISOString()
    });

    // Authenticate user
    const userInfo = await authenticateUser(request);
    if (!userInfo) {
      response.status(401).json({
        error: "Authentication required",
        timestamp: new Date().toISOString(),
        requestId
      });
      return;
    }

    // Parse request body
    const { customerId, studyId, includeMetadata = false } = request.body as DownloadRequest;
    
    if (!customerId || !studyId) {
      response.status(400).json({
        error: "Missing required parameters: customerId, studyId",
        timestamp: new Date().toISOString(),
        requestId
      });
      return;
    }

    logger.info("Processing study download request", {
      customerId,
      studyId,
      includeMetadata,
      userId: userInfo.uid,
      requestId
    });

    const downloadService = new DownloadService();
    
    // Get all screenshots for the study
    const manifests = await downloadService.getStudyScreenshots(customerId, studyId);
    
    if (manifests.length === 0) {
      response.status(404).json({
        error: "No on-entry screenshots found for this study",
        timestamp: new Date().toISOString(),
        requestId
      });
      return;
    }

    // Create download status tracking
    const totalSizeBytes = manifests.reduce((sum, m) => sum + m.sizeBytes, 0);
    await downloadService.createDownloadStatus(requestId, manifests.length, totalSizeBytes);

    let downloadUrl: string, expiresAt: number, fileName: string;

    try {
      // Generate ZIP stream with progress tracking
      const zipStream = await downloadService.generateZipStreamWithProgress(manifests, requestId, includeMetadata);
      
      // Generate filename
      fileName = downloadService.generateFileName({ customerId, studyId, includeMetadata });
      
      // Upload to temporary storage and get signed URL
      const uploadResult = await downloadService.uploadAndGetSignedUrl(zipStream, fileName);
      downloadUrl = uploadResult.downloadUrl;
      expiresAt = uploadResult.expiresAt;

      // Mark as completed
      await downloadService.completeDownloadStatus(requestId, downloadUrl, expiresAt, fileName);
    } catch (zipError) {
      await downloadService.failDownloadStatus(requestId, zipError instanceof Error ? zipError.message : String(zipError));
      throw zipError;
    }

    const responseData: DownloadResponse = {
      downloadUrl,
      expiresAt,
      fileName,
      fileSizeBytes: totalSizeBytes,
      requestId,
      estimatedGenerationTimeMs: Date.now() - startTime
    };

    logger.info("Study download completed successfully", {
      customerId,
      studyId,
      fileCount: manifests.length,
      processingTimeMs: responseData.estimatedGenerationTimeMs,
      requestId
    });

    response.status(200).json(responseData);

  } catch (error) {
    logger.error("Download study ZIP function failed", {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      requestId,
      stack: error instanceof Error ? error.stack : undefined
    });

    response.status(500).json({
      error: "Failed to generate study download",
      timestamp: new Date().toISOString(),
      requestId
    });
  }
});

export const downloadPackageZip = onRequest({
  cors: true,
  timeoutSeconds: 30, // 30 seconds
  memory: "1GiB"
}, async (request, response) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    logger.info("Download package ZIP function called", {
      method: request.method,
      requestId,
      timestamp: new Date().toISOString()
    });

    // Authenticate user
    const userInfo = await authenticateUser(request);
    if (!userInfo) {
      response.status(401).json({
        error: "Authentication required",
        timestamp: new Date().toISOString(),
        requestId
      });
      return;
    }

    // Parse request body
    const { customerId, studyId, packageName, includeMetadata = false } = request.body as DownloadRequest;
    
    if (!customerId || !studyId || !packageName) {
      response.status(400).json({
        error: "Missing required parameters: customerId, studyId, packageName",
        timestamp: new Date().toISOString(),
        requestId
      });
      return;
    }

    logger.info("Processing package download request", {
      customerId,
      studyId,
      packageName,
      includeMetadata,
      userId: userInfo.uid,
      requestId
    });

    const downloadService = new DownloadService();
    
    // Get all screenshots for the package
    const manifests = await downloadService.getPackageScreenshots(customerId, studyId, packageName);
    
    if (manifests.length === 0) {
      response.status(404).json({
        error: "No on-entry screenshots found for this package",
        timestamp: new Date().toISOString(),
        requestId
      });
      return;
    }

    // Create download status tracking
    const totalSizeBytes = manifests.reduce((sum, m) => sum + m.sizeBytes, 0);
    await downloadService.createDownloadStatus(requestId, manifests.length, totalSizeBytes);

    let downloadUrl: string, expiresAt: number, fileName: string;

    try {
      // Generate ZIP stream with progress tracking
      const zipStream = await downloadService.generateZipStreamWithProgress(manifests, requestId, includeMetadata);
      
      // Generate filename
      fileName = downloadService.generateFileName({ customerId, studyId, packageName, includeMetadata });
      
      // Upload to temporary storage and get signed URL
      const uploadResult = await downloadService.uploadAndGetSignedUrl(zipStream, fileName);
      downloadUrl = uploadResult.downloadUrl;
      expiresAt = uploadResult.expiresAt;

      // Mark as completed
      await downloadService.completeDownloadStatus(requestId, downloadUrl, expiresAt, fileName);
    } catch (zipError) {
      await downloadService.failDownloadStatus(requestId, zipError instanceof Error ? zipError.message : String(zipError));
      throw zipError;
    }

    const responseData: DownloadResponse = {
      downloadUrl,
      expiresAt,
      fileName,
      fileSizeBytes: totalSizeBytes,
      requestId,
      estimatedGenerationTimeMs: Date.now() - startTime
    };

    logger.info("Package download completed successfully", {
      customerId,
      studyId,
      packageName,
      fileCount: manifests.length,
      processingTimeMs: responseData.estimatedGenerationTimeMs,
      requestId
    });

    response.status(200).json(responseData);

  } catch (error) {
    logger.error("Download package ZIP function failed", {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      requestId,
      stack: error instanceof Error ? error.stack : undefined
    });

    response.status(500).json({
      error: "Failed to generate package download",
      timestamp: new Date().toISOString(),
      requestId
    });
  }
});

export const getDownloadStatus = onRequest({
  cors: true
}, async (request, response) => {
  const startTime = Date.now();
  
  try {
    logger.info("Get download status function called", {
      method: request.method,
      timestamp: new Date().toISOString()
    });

    // Authenticate user
    const userInfo = await authenticateUser(request);
    if (!userInfo) {
      response.status(401).json({
        error: "Authentication required",
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Get request ID from query parameters
    const requestId = request.query.requestId as string;
    
    if (!requestId) {
      response.status(400).json({
        error: "Missing required parameter: requestId",
        timestamp: new Date().toISOString()
      });
      return;
    }

    const downloadService = new DownloadService();
    const status = await downloadService.getDownloadStatus(requestId);

    if (!status) {
      response.status(404).json({
        error: "Download request not found",
        timestamp: new Date().toISOString()
      });
      return;
    }

    logger.info("Download status retrieved", {
      requestId,
      status: status.status,
      progress: status.progress,
      processingTimeMs: Date.now() - startTime
    });

    response.status(200).json(status);

  } catch (error) {
    logger.error("Get download status function failed", {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    response.status(500).json({
      error: "Failed to get download status",
      timestamp: new Date().toISOString()
    });
  }
});

export const downloadFile = onRequest({
  cors: true
}, async (request, response) => {
  const startTime = Date.now();
  
  try {
    logger.info("Download file proxy function called", {
      method: request.method,
      timestamp: new Date().toISOString()
    });

    // Only allow in emulator mode for security
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    if (!isEmulator) {
      response.status(403).json({
        error: "File proxy only available in emulator mode",
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Get file path from query parameters
    const filePath = request.query.path as string;
    
    if (!filePath) {
      response.status(400).json({
        error: "Missing required parameter: path",
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Get file from storage
    const { getStorage } = require("firebase-admin/storage");
    const storage = getStorage();
    const bucket = storage.bucket("castor-form-shot.firebasestorage.app");
    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      response.status(404).json({
        error: "File not found",
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Get file metadata
    const [metadata] = await file.getMetadata();
    
    // Set appropriate headers
    response.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
    response.setHeader('Content-Length', metadata.size || 0);
    response.setHeader('Content-Disposition', `attachment; filename="${filePath.split('/').pop()}"`);

    // Stream the file
    const readStream = file.createReadStream();
    readStream.pipe(response);

    logger.info("File download completed", {
      filePath,
      contentType: metadata.contentType,
      size: metadata.size,
      processingTimeMs: Date.now() - startTime
    });

  } catch (error) {
    logger.error("Download file proxy function failed", {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    response.status(500).json({
      error: "Failed to download file",
      timestamp: new Date().toISOString()
    });
  }
});