import { httpsCallable } from 'firebase/functions';
import { functions, auth } from './firebase';

export interface HelloworldResponse {
  message: string;
  timestamp: string;
  user: {
    uid: string;
    email: string;
    emailVerified: boolean;
  } | null;
  requestId: string;
  processingTime: number;
}

// Download function interfaces
export interface DownloadRequest {
  customerId: string;
  studyId: string;
  packageName?: string;
  includeMetadata?: boolean;
}

export interface DownloadResponse {
  downloadUrl: string;
  expiresAt: number;
  fileName: string;
  fileSizeBytes?: number;
  requestId: string;
  estimatedGenerationTimeMs?: number;
}

export interface DownloadStatus {
  status: 'processing' | 'completed' | 'failed';
  progress?: number;
  errorMessage?: string;
  downloadUrl?: string;
  expiresAt?: number;
  totalFiles?: number;
  totalSizeBytes?: number;
  createdAt?: string;
  lastUpdated?: string;
  completedAt?: string;
  failedAt?: string;
}

export const callHelloworld = async (): Promise<HelloworldResponse> => {
  try {
    // Get the current user's ID token if authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to call functions');
    }

    const idToken = await currentUser.getIdToken();
    
    // Make HTTP request to the function
    const baseUrl = import.meta.env.VITE_USE_EMULATORS === 'true' 
      ? 'http://localhost:5001/castor-form-shot/us-central1'
      : 'https://us-central1-castor-form-shot.cloudfunctions.net';
    
    const response = await fetch(`${baseUrl}/helloworld`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Log success to console
    console.log('✅ Helloworld function called successfully:', {
      authenticated: !!data.user,
      user: data.user?.email,
      processingTime: data.processingTime,
      requestId: data.requestId,
      timestamp: data.timestamp
    });

    return data;
  } catch (error) {
    // Log failure to console
    console.error('❌ Helloworld function call failed:', {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
};

// Helper function to get authenticated request headers
const getAuthHeaders = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to call functions');
  }
  
  const idToken = await currentUser.getIdToken();
  return {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  };
};

// Helper function to get the base URL
const getBaseUrl = () => {
  return import.meta.env.VITE_USE_EMULATORS === 'true' 
    ? 'http://localhost:5001/castor-form-shot/us-central1'
    : 'https://us-central1-castor-form-shot.cloudfunctions.net';
};

/**
 * Download ZIP file containing all on-entry screenshots for a study
 */
export const downloadStudyZip = async (request: DownloadRequest): Promise<DownloadResponse> => {
  try {
    const headers = await getAuthHeaders();
    const baseUrl = getBaseUrl();
    
    console.log('📦 Starting study ZIP download:', {
      customerId: request.customerId,
      studyId: request.studyId,
      includeMetadata: request.includeMetadata
    });
    
    const response = await fetch(`${baseUrl}/downloadStudyZip`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data: DownloadResponse = await response.json();
    
    console.log('✅ Study ZIP download initiated:', {
      requestId: data.requestId,
      fileName: data.fileName,
      fileSizeBytes: data.fileSizeBytes,
      estimatedTime: data.estimatedGenerationTimeMs
    });

    return data;
  } catch (error) {
    console.error('❌ Study ZIP download failed:', {
      error: error instanceof Error ? error.message : String(error),
      request,
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
};

/**
 * Download ZIP file containing all on-entry screenshots for a specific package
 */
export const downloadPackageZip = async (request: DownloadRequest): Promise<DownloadResponse> => {
  try {
    if (!request.packageName) {
      throw new Error('Package name is required for package downloads');
    }
    
    const headers = await getAuthHeaders();
    const baseUrl = getBaseUrl();
    
    console.log('📦 Starting package ZIP download:', {
      customerId: request.customerId,
      studyId: request.studyId,
      packageName: request.packageName,
      includeMetadata: request.includeMetadata
    });
    
    const response = await fetch(`${baseUrl}/downloadPackageZip`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data: DownloadResponse = await response.json();
    
    console.log('✅ Package ZIP download initiated:', {
      requestId: data.requestId,
      fileName: data.fileName,
      fileSizeBytes: data.fileSizeBytes,
      estimatedTime: data.estimatedGenerationTimeMs
    });

    return data;
  } catch (error) {
    console.error('❌ Package ZIP download failed:', {
      error: error instanceof Error ? error.message : String(error),
      request,
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
};

/**
 * Check the status of a download request
 */
export const getDownloadStatus = async (requestId: string): Promise<DownloadStatus> => {
  try {
    const headers = await getAuthHeaders();
    const baseUrl = getBaseUrl();
    
    const response = await fetch(`${baseUrl}/getDownloadStatus?requestId=${encodeURIComponent(requestId)}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data: DownloadStatus = await response.json();
    
    console.log('📊 Download status retrieved:', {
      requestId,
      status: data.status,
      progress: data.progress,
      lastUpdated: data.lastUpdated
    });

    return data;
  } catch (error) {
    console.error('❌ Download status check failed:', {
      error: error instanceof Error ? error.message : String(error),
      requestId,
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
};

/**
 * Poll download status until completion or failure
 */
export const pollDownloadStatus = async (
  requestId: string, 
  onProgress?: (status: DownloadStatus) => void,
  intervalMs = 2000,
  maxRetries = 30
): Promise<DownloadStatus> => {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const status = await getDownloadStatus(requestId);
      
      if (onProgress) {
        onProgress(status);
      }
      
      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      retries++;
      
    } catch (error) {
      console.warn('⚠️ Download status poll failed, retrying...', {
        requestId,
        retry: retries + 1,
        error: error instanceof Error ? error.message : String(error)
      });
      
      retries++;
      if (retries >= maxRetries) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  throw new Error(`Download status polling timed out after ${maxRetries} retries`);
};