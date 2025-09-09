import admin from 'firebase-admin';
import { FirestoreService } from './firestore.js';
import {
  ReportConfiguration,
  CreateReportConfigurationInput,
  UpdateReportConfigurationInput,
  ReportGenerationJob,
  GenerateReportInput,
  ReportConfigurationFilters,
  ReportGenerationJobFilters,
  ReportConfigurationStats,
  BatchOperationResult,
  ConfigurationExport,
} from '../types/report-types.js';
import { logger } from '../utils/logger.js';

type Timestamp = admin.firestore.Timestamp;
type DocumentData = admin.firestore.DocumentData;

const CONFIGURATIONS_COLLECTION = 'report-configurations';
const GENERATION_JOBS_COLLECTION = 'report-generation-jobs';

/**
 * Service for managing report configurations in Firestore
 */
export class ReportConfigurationService {
  private db: admin.firestore.Firestore;
  private firestoreService: FirestoreService;

  constructor() {
    this.firestoreService = new FirestoreService();
    this.db = admin.firestore();
  }

  /**
   * Create a new report configuration
   */
  async createConfiguration(
    input: CreateReportConfigurationInput,
    userEmail: string
  ): Promise<ReportConfiguration> {
    try {
      const configData = {
        ...input,
        includeMetadata: input.includeMetadata ?? true,
        pageOrientation: input.pageOrientation ?? 'portrait',
        pageSize: input.pageSize ?? 'A4',
        screenshotType: input.screenshotType ?? 'on-exit',
        includeQuestionScreenshots: input.includeQuestionScreenshots ?? false,
        createdBy: userEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        generationCount: 0,
        status: 'draft' as const,
        isDefault: false,
        sharedWith: [],
        isPublic: false,
      };

      const docRef = await this.db.collection(CONFIGURATIONS_COLLECTION).add(configData);
      const newDoc = await docRef.get();
      
      if (!newDoc.exists) {
        throw new Error('Failed to create configuration');
      }

      return {
        id: docRef.id,
        ...newDoc.data(),
      } as ReportConfiguration;
    } catch (error) {
      logger.error('Failed to create report configuration:', error);
      throw error;
    }
  }

  /**
   * Get a report configuration by ID
   */
  async getConfiguration(configId: string): Promise<ReportConfiguration | null> {
    try {
      const docRef = this.db.collection(CONFIGURATIONS_COLLECTION).doc(configId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return null;
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as ReportConfiguration;
    } catch (error) {
      logger.error('Failed to get report configuration:', error);
      throw error;
    }
  }

  /**
   * Update a report configuration
   */
  async updateConfiguration(
    configId: string,
    input: UpdateReportConfigurationInput
  ): Promise<ReportConfiguration> {
    try {
      const docRef = this.db.collection(CONFIGURATIONS_COLLECTION).doc(configId);
      
      const updateData: any = {
        ...input,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await docRef.update(updateData);
      
      const updatedDoc = await docRef.get();
      if (!updatedDoc.exists) {
        throw new Error('Configuration not found after update');
      }

      return {
        id: updatedDoc.id,
        ...updatedDoc.data(),
      } as ReportConfiguration;
    } catch (error) {
      logger.error('Failed to update report configuration:', error);
      throw error;
    }
  }

  /**
   * Delete a report configuration
   */
  async deleteConfiguration(configId: string): Promise<void> {
    try {
      const docRef = this.db.collection(CONFIGURATIONS_COLLECTION).doc(configId);
      await docRef.delete();
      logger.info(`Deleted report configuration: ${configId}`);
    } catch (error) {
      logger.error('Failed to delete report configuration:', error);
      throw error;
    }
  }

  /**
   * List report configurations with filters
   */
  async listConfigurations(
    filters: ReportConfigurationFilters,
    limitCount: number = 20
  ): Promise<ReportConfiguration[]> {
    try {
      let q = this.db.collection(CONFIGURATIONS_COLLECTION) as admin.firestore.Query;

      if (filters.customerId) {
        q = q.where('customerId', '==', filters.customerId);
      }
      if (filters.studyId) {
        q = q.where('studyId', '==', filters.studyId);
      }
      if (filters.packageName) {
        q = q.where('packageName', '==', filters.packageName);
      }
      if (filters.status) {
        q = q.where('status', '==', filters.status);
      }
      if (filters.createdBy) {
        q = q.where('createdBy', '==', filters.createdBy);
      }
      if (filters.isDefault !== undefined) {
        q = q.where('isDefault', '==', filters.isDefault);
      }

      q = q.orderBy('updatedAt', 'desc').limit(limitCount);

      const querySnapshot = await q.get();

      const configurations: ReportConfiguration[] = [];
      querySnapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
        configurations.push({
          id: doc.id,
          ...doc.data(),
        } as ReportConfiguration);
      });

      // Apply text search filter if provided
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return configurations.filter(
          (config) =>
            config.name.toLowerCase().includes(searchLower) ||
            config.description?.toLowerCase().includes(searchLower)
        );
      }

      return configurations;
    } catch (error) {
      logger.error('Failed to list report configurations:', error);
      throw error;
    }
  }

  /**
   * Clone an existing configuration
   */
  async cloneConfiguration(
    configId: string,
    newName: string,
    userEmail: string
  ): Promise<ReportConfiguration> {
    try {
      const original = await this.getConfiguration(configId);
      if (!original) {
        throw new Error('Configuration not found');
      }

      const input: CreateReportConfigurationInput = {
        customerId: original.customerId,
        studyId: original.studyId,
        packageName: original.packageName,
        name: newName,
        description: `Cloned from: ${original.name}`,
        formOrder: [...original.formOrder],
        selectedLanguages: [...original.selectedLanguages],
        includeMetadata: original.includeMetadata,
        pageOrientation: original.pageOrientation,
        pageSize: original.pageSize,
        screenshotType: original.screenshotType,
        includeQuestionScreenshots: original.includeQuestionScreenshots,
      };

      return await this.createConfiguration(input, userEmail);
    } catch (error) {
      logger.error('Failed to clone configuration:', error);
      throw error;
    }
  }

  /**
   * Set a configuration as default for a package
   */
  async setDefaultConfiguration(
    configId: string,
    customerId: string,
    studyId: string,
    packageName: string
  ): Promise<void> {
    try {
      // First, unset any existing default
      const existingDefaults = await this.listConfigurations({
        customerId,
        studyId,
        packageName,
        isDefault: true,
      });

      for (const config of existingDefaults) {
        await this.updateConfiguration(config.id, { isDefault: false });
      }

      // Set the new default
      await this.updateConfiguration(configId, { isDefault: true });
      logger.info(`Set default configuration: ${configId}`);
    } catch (error) {
      logger.error('Failed to set default configuration:', error);
      throw error;
    }
  }

  /**
   * Share a configuration with other users
   */
  async shareConfiguration(
    configId: string,
    userEmails: string[]
  ): Promise<ReportConfiguration> {
    try {
      return await this.updateConfiguration(configId, {
        sharedWith: userEmails,
      });
    } catch (error) {
      logger.error('Failed to share configuration:', error);
      throw error;
    }
  }

  /**
   * Create a report generation job
   */
  async createGenerationJob(
    input: GenerateReportInput,
    userEmail: string,
    analysisId: string
  ): Promise<ReportGenerationJob> {
    try {
      const config = await this.getConfiguration(input.configurationId);
      if (!config) {
        throw new Error('Configuration not found');
      }

      const jobData = {
        configurationId: input.configurationId,
        analysisId,
        requestedBy: userEmail,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        requestSource: 'ui' as const,
        status: 'pending' as const,
        progress: 0,
        currentStep: 'Initializing',
        languages: config.selectedLanguages,
        formCount: config.formOrder.length,
        pageOrientation: config.pageOrientation,
        generatedFiles: {},
        retryCount: 0,
        maxRetries: 3,
        priority: input.priority ?? 'normal',
        notificationSent: false,
      };

      const docRef = await this.db.collection(GENERATION_JOBS_COLLECTION).add(jobData);
      const newDoc = await docRef.get();

      if (!newDoc.exists) {
        throw new Error('Failed to create generation job');
      }

      // Update configuration's last generated timestamp
      await this.db.collection(CONFIGURATIONS_COLLECTION).doc(input.configurationId).update({
        lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Increment generation count
      const currentConfig = await this.getConfiguration(input.configurationId);
      if (currentConfig) {
        await this.db.collection(CONFIGURATIONS_COLLECTION).doc(input.configurationId).update({
          generationCount: (currentConfig.generationCount || 0) + 1,
        });
      }

      return {
        id: docRef.id,
        ...newDoc.data(),
      } as ReportGenerationJob;
    } catch (error) {
      logger.error('Failed to create generation job:', error);
      throw error;
    }
  }

  /**
   * Get a generation job by ID
   */
  async getGenerationJob(jobId: string): Promise<ReportGenerationJob | null> {
    try {
      const docRef = this.db.collection(GENERATION_JOBS_COLLECTION).doc(jobId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return null;
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as ReportGenerationJob;
    } catch (error) {
      logger.error('Failed to get generation job:', error);
      throw error;
    }
  }

  /**
   * List generation jobs with filters
   */
  async listGenerationJobs(
    filters: ReportGenerationJobFilters,
    limitCount: number = 20
  ): Promise<ReportGenerationJob[]> {
    try {
      let q = this.db.collection(GENERATION_JOBS_COLLECTION) as admin.firestore.Query;

      if (filters.configurationId) {
        q = q.where('configurationId', '==', filters.configurationId);
      }
      if (filters.requestedBy) {
        q = q.where('requestedBy', '==', filters.requestedBy);
      }
      if (filters.status) {
        q = q.where('status', '==', filters.status);
      }

      q = q.orderBy('requestedAt', 'desc').limit(limitCount);

      const querySnapshot = await q.get();

      const jobs: ReportGenerationJob[] = [];
      querySnapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
        const jobData = doc.data();
        
        if (!jobData) return;
        
        // Apply date filters if provided
        if (filters.dateFrom || filters.dateTo) {
          const requestedAt = jobData.requestedAt?.toDate();
          if (requestedAt) {
            if (filters.dateFrom && requestedAt < filters.dateFrom) return;
            if (filters.dateTo && requestedAt > filters.dateTo) return;
          }
        }

        jobs.push({
          id: doc.id,
          ...jobData,
        } as ReportGenerationJob);
      });

      return jobs;
    } catch (error) {
      logger.error('Failed to list generation jobs:', error);
      throw error;
    }
  }

  /**
   * Get statistics for report configurations
   */
  async getConfigurationStats(
    customerId: string,
    studyId?: string,
    packageName?: string
  ): Promise<ReportConfigurationStats> {
    try {
      const filters: ReportConfigurationFilters = { customerId, studyId, packageName };
      const configs = await this.listConfigurations(filters, 1000);
      
      const activeConfigs = configs.filter((c) => c.status === 'active');
      const totalGenerations = configs.reduce((sum, c) => sum + (c.generationCount || 0), 0);
      
      // Get recent generation jobs for timing stats
      const recentJobs = await this.listGenerationJobs(
        { status: 'completed' },
        100
      );
      
      const durations = recentJobs
        .filter((j) => j.duration)
        .map((j) => j.duration!);
      
      const avgDuration = durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;

      // Find most used configuration
      const mostUsed = configs.reduce((prev, curr) => 
        (curr.generationCount || 0) > (prev.generationCount || 0) ? curr : prev
      );

      return {
        totalConfigurations: configs.length,
        activeConfigurations: activeConfigs.length,
        totalGenerations,
        averageGenerationTime: avgDuration,
        mostUsedConfiguration: mostUsed?.name,
        lastGenerationDate: configs[0]?.lastGeneratedAt,
      };
    } catch (error) {
      logger.error('Failed to get configuration stats:', error);
      throw error;
    }
  }

  /**
   * Export a configuration as JSON
   */
  async exportConfiguration(configId: string): Promise<ConfigurationExport> {
    try {
      const config = await this.getConfiguration(configId);
      if (!config) {
        throw new Error('Configuration not found');
      }

      const { id, createdAt, updatedAt, ...exportData } = config;

      return {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        configuration: exportData,
      };
    } catch (error) {
      logger.error('Failed to export configuration:', error);
      throw error;
    }
  }

  /**
   * Import a configuration from JSON
   */
  async importConfiguration(
    exportData: ConfigurationExport,
    userEmail: string
  ): Promise<ReportConfiguration> {
    try {
      const input: CreateReportConfigurationInput = {
        ...exportData.configuration,
        name: `${exportData.configuration.name} (Imported)`,
      };

      return await this.createConfiguration(input, userEmail);
    } catch (error) {
      logger.error('Failed to import configuration:', error);
      throw error;
    }
  }

  /**
   * Batch delete configurations
   */
  async batchDeleteConfigurations(configIds: string[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      success: true,
      processedCount: 0,
      failedCount: 0,
      errors: [],
    };

    for (const configId of configIds) {
      try {
        await this.deleteConfiguration(configId);
        result.processedCount++;
      } catch (error) {
        result.failedCount++;
        result.success = false;
        result.errors?.push({
          id: configId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }
}

// Export singleton instance
export const reportConfigurationService = new ReportConfigurationService();