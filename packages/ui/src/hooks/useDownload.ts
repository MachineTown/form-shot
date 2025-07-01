import { useState, useCallback } from 'react';
import { 
  downloadStudyZip, 
  downloadPackageZip,
  pollDownloadStatus,
  type DownloadRequest,
  type DownloadStatus 
} from '../services/functions';
import { getAuth } from 'firebase/auth';

// Utility function to download files with proper authentication
const downloadFile = async (url: string, fileName: string) => {
  try {
    // For emulator URLs, we might need to add authentication headers
    const auth = getAuth();
    const currentUser = auth.currentUser;
    
    const headers: Record<string, string> = {};
    if (currentUser && url.includes('localhost')) {
      // For emulator, we might need to add auth token
      const token = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    
    // Create download link
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Download failed:', error);
    // Fallback to direct link
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

interface UseDownloadOptions {
  onProgress?: (status: DownloadStatus) => void;
  onComplete?: (status: DownloadStatus) => void;
  onError?: (error: Error) => void;
  autoDownload?: boolean; // Auto-download file when completed
}

interface UseDownloadState {
  isDownloading: boolean;
  requestId?: string;
  progress?: number;
  status?: DownloadStatus;
  error?: string;
}

export const useDownload = (options: UseDownloadOptions = {}) => {
  const { onProgress, onComplete, onError, autoDownload = true } = options;
  
  const [state, setState] = useState<UseDownloadState>({
    isDownloading: false
  });

  const downloadStudy = useCallback(async (
    customerId: string,
    studyId: string,
    includeMetadata = false
  ) => {
    try {
      setState({ isDownloading: true, error: undefined });

      const request: DownloadRequest = {
        customerId,
        studyId,
        includeMetadata
      };

      const response = await downloadStudyZip(request);

      setState(prev => ({
        ...prev,
        requestId: response.requestId,
        progress: 0
      }));

      const finalStatus = await pollDownloadStatus(
        response.requestId,
        (status) => {
          setState(prev => ({
            ...prev,
            progress: status.progress,
            status
          }));
          onProgress?.(status);
        }
      );

      setState(prev => ({
        ...prev,
        status: finalStatus,
        isDownloading: false
      }));

      if (finalStatus.status === 'completed') {
        onComplete?.(finalStatus);
        
        if (autoDownload && finalStatus.downloadUrl) {
          await downloadFile(finalStatus.downloadUrl, response.fileName);
        }
      } else if (finalStatus.status === 'failed') {
        throw new Error(finalStatus.errorMessage || 'Download failed');
      }

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Download failed');
      setState({
        isDownloading: false,
        error: errorObj.message
      });
      onError?.(errorObj);
      throw errorObj;
    }
  }, [onProgress, onComplete, onError, autoDownload]);

  const downloadPackage = useCallback(async (
    customerId: string,
    studyId: string,
    packageName: string,
    includeMetadata = false
  ) => {
    try {
      setState({ isDownloading: true, error: undefined });

      const request: DownloadRequest = {
        customerId,
        studyId,
        packageName,
        includeMetadata
      };

      const response = await downloadPackageZip(request);

      setState(prev => ({
        ...prev,
        requestId: response.requestId,
        progress: 0
      }));

      const finalStatus = await pollDownloadStatus(
        response.requestId,
        (status) => {
          setState(prev => ({
            ...prev,
            progress: status.progress,
            status
          }));
          onProgress?.(status);
        }
      );

      setState(prev => ({
        ...prev,
        status: finalStatus,
        isDownloading: false
      }));

      if (finalStatus.status === 'completed') {
        onComplete?.(finalStatus);
        
        if (autoDownload && finalStatus.downloadUrl) {
          await downloadFile(finalStatus.downloadUrl, response.fileName);
        }
      } else if (finalStatus.status === 'failed') {
        throw new Error(finalStatus.errorMessage || 'Download failed');
      }

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Download failed');
      setState({
        isDownloading: false,
        error: errorObj.message
      });
      onError?.(errorObj);
      throw errorObj;
    }
  }, [onProgress, onComplete, onError, autoDownload]);

  const reset = useCallback(() => {
    setState({ isDownloading: false });
  }, []);

  return {
    ...state,
    downloadStudy,
    downloadPackage,
    reset
  };
};

export default useDownload;