import admin from 'firebase-admin';

type Timestamp = admin.firestore.Timestamp;

/**
 * Report configuration for generating PDF reports from survey analyses
 */
export interface ReportConfiguration {
  // Identifiers
  id: string;
  customerId: string;
  studyId: string;
  packageName: string;
  
  // Configuration Details
  name: string;
  description?: string;
  
  // Report Settings
  formOrder: string[];                  // Ordered array of form IDs/indices
  selectedLanguages: string[];          // Languages to generate PDFs for
  includeMetadata: boolean;             // Include form titles and metadata
  pageOrientation: 'portrait' | 'landscape';
  pageSize: 'A4' | 'Letter' | 'Legal';
  
  // Screenshot Settings
  screenshotType: 'on-exit' | 'on-entry' | 'both';
  includeQuestionScreenshots: boolean;
  
  // Metadata
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastGeneratedAt?: Timestamp;
  generationCount: number;
  
  // Status
  status: 'draft' | 'active' | 'archived';
  isDefault: boolean;
  
  // Sharing
  sharedWith: string[];
  isPublic: boolean;
}

/**
 * Input for creating a new report configuration
 */
export interface CreateReportConfigurationInput {
  customerId: string;
  studyId: string;
  packageName: string;
  name: string;
  description?: string;
  formOrder: string[];
  selectedLanguages: string[];
  includeMetadata?: boolean;
  pageOrientation?: 'portrait' | 'landscape';
  pageSize?: 'A4' | 'Letter' | 'Legal';
  screenshotType?: 'on-exit' | 'on-entry' | 'both';
  includeQuestionScreenshots?: boolean;
  isDefault?: boolean;
}

/**
 * Input for updating an existing report configuration
 */
export interface UpdateReportConfigurationInput {
  customerId?: string;
  studyId?: string;
  packageName?: string;
  name?: string;
  description?: string;
  formOrder?: string[];
  selectedLanguages?: string[];
  includeMetadata?: boolean;
  pageOrientation?: 'portrait' | 'landscape';
  pageSize?: 'A4' | 'Letter' | 'Legal';
  screenshotType?: 'on-exit' | 'on-entry' | 'both';
  includeQuestionScreenshots?: boolean;
  status?: 'draft' | 'active' | 'archived';
  isDefault?: boolean;
  sharedWith?: string[];
  isPublic?: boolean;
}

/**
 * Report generation job tracking
 */
export interface ReportGenerationJob {
  // Identifiers
  id: string;
  configurationId: string;
  analysisId: string;
  
  // Request Details
  requestedBy: string;
  requestedAt: Timestamp;
  requestSource: 'ui' | 'api' | 'scheduled';
  
  // Processing Details
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  duration?: number;                    // milliseconds
  
  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;                     // 0-100
  currentStep: string;
  
  // Generation Settings
  languages: string[];
  formCount: number;
  pageOrientation: 'portrait' | 'landscape';
  
  // Results
  generatedFiles: Record<string, GeneratedFileInfo>;
  
  // Error Handling
  error?: GenerationError;
  
  // Retry Information
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Timestamp;
  
  // Metadata
  estimatedSize?: number;               // bytes
  priority: 'low' | 'normal' | 'high';
  notificationSent: boolean;
}

/**
 * Information about a generated PDF file
 */
export interface GeneratedFileInfo {
  url: string;                          // Signed Cloud Storage URL
  storageRef: string;                   // Cloud Storage reference path
  size: number;                         // bytes
  pageCount: number;
  generatedAt: Timestamp;
  expiresAt: Timestamp;
}

/**
 * Error information for failed generation jobs
 */
export interface GenerationError {
  code: string;
  message: string;
  details?: any;
  occurredAt: Timestamp;
}

/**
 * Input for requesting PDF generation
 */
export interface GenerateReportInput {
  configurationId: string;
  priority?: 'low' | 'normal' | 'high';
  notifyOnCompletion?: boolean;
}

/**
 * Report template for reusable configurations
 */
export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  formSelectionRule: 'all' | 'required' | 'custom';
  customFormIds?: string[];
  defaultLanguages: string[];
  pageSettings: {
    orientation: 'portrait' | 'landscape';
    size: 'A4' | 'Letter' | 'Legal';
  };
  createdBy: string;
  isSystemTemplate: boolean;
  usageCount: number;
}

/**
 * Form information for report configuration UI
 */
export interface ReportForm {
  id: string;
  formIndex: number;
  longTitle: string;
  shortName: string;
  questionCount: number;
  hasOnEntryScreenshot: boolean;
  hasOnExitScreenshot: boolean;
  order: number;
}

/**
 * Language option for report generation
 */
export interface LanguageOption {
  code: string;
  name: string;
  isAvailable: boolean;
  analysisId?: string;
  lastUpdated?: Timestamp;
}

/**
 * Report configuration list filters
 */
export interface ReportConfigurationFilters {
  customerId?: string;
  studyId?: string;
  packageName?: string;
  status?: 'draft' | 'active' | 'archived';
  createdBy?: string;
  isDefault?: boolean;
  search?: string;
}

/**
 * Report generation job filters
 */
export interface ReportGenerationJobFilters {
  configurationId?: string;
  requestedBy?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Statistics for report configurations
 */
export interface ReportConfigurationStats {
  totalConfigurations: number;
  activeConfigurations: number;
  totalGenerations: number;
  averageGenerationTime: number;
  mostUsedConfiguration?: string;
  lastGenerationDate?: Timestamp;
}

/**
 * Batch operation result
 */
export interface BatchOperationResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors?: Array<{
    id: string;
    error: string;
  }>;
}

/**
 * Export format options
 */
export type ExportFormat = 'json' | 'csv' | 'xml';

/**
 * Configuration export data
 */
export interface ConfigurationExport {
  version: string;
  exportedAt: string;
  configuration: Omit<ReportConfiguration, 'id' | 'createdAt' | 'updatedAt'>;
}

/**
 * Drag and drop item for form reordering
 */
export interface DraggableForm extends ReportForm {
  isDragging?: boolean;
  isOver?: boolean;
}