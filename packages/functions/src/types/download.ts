export interface DownloadRequest {
  customerId: string;
  studyId: string;
  packageName?: string; // Optional - if provided, download single package
  includeMetadata?: boolean;
}

export interface DownloadResponse {
  downloadUrl: string;
  expiresAt: number; // Unix timestamp
  fileName: string;
  fileSizeBytes?: number;
  requestId: string;
  estimatedGenerationTimeMs?: number;
}

export interface FileManifest {
  sourcePath: string; // Cloud Storage path
  zipPath: string;    // Path within ZIP file
  sizeBytes: number;
}

export interface DownloadStatus {
  status: 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100 percentage
  errorMessage?: string;
  downloadUrl?: string;
  expiresAt?: number;
}

export interface ScreenshotMetadata {
  formIndex: number;
  formTitle: string;
  language: string;
  version: string;
  packageName: string;
  screenshotType: 'entry' | 'exit' | 'field';
  timestamp: string;
  fileName: string;
}