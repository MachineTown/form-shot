import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  ReportConfiguration,
  CreateReportConfigurationInput,
  UpdateReportConfigurationInput,
  ReportGenerationJob,
  GenerateReportInput,
  ReportConfigurationFilters,
  ReportGenerationJobFilters,
  ReportConfigurationStats,
  ConfigurationExport,
  ReportForm,
  LanguageOption,
} from '@form-shot/shared/src/types/report-types';
import { auth, db } from '../../services/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

const CONFIGURATIONS_COLLECTION = 'report-configurations';
const GENERATION_JOBS_COLLECTION = 'report-generation-jobs';

/**
 * RTK Query API for report configuration management
 */
export const reportApi = createApi({
  reducerPath: 'reportApi',
  baseQuery: fakeBaseQuery(),
  tagTypes: ['ReportConfiguration', 'GenerationJob', 'ReportStats'],
  endpoints: (builder) => ({
    // Configuration CRUD operations
    createConfiguration: builder.mutation<ReportConfiguration, CreateReportConfigurationInput>({
      async queryFn(input) {
        try {
          const user = auth.currentUser;
          
          if (!user?.email) {
            return { error: { error: 'User not authenticated' } };
          }
          
          // If setting as default, clear other defaults first
          if (input.isDefault) {
            const q = query(
              collection(db, CONFIGURATIONS_COLLECTION),
              where('customerId', '==', input.customerId),
              where('studyId', '==', input.studyId),
              where('packageName', '==', input.packageName),
              where('isDefault', '==', true)
            );
            
            const querySnapshot = await getDocs(q);
            const updatePromises: Promise<void>[] = [];
            
            querySnapshot.forEach((docSnap) => {
              updatePromises.push(
                updateDoc(doc(db, CONFIGURATIONS_COLLECTION, docSnap.id), {
                  isDefault: false,
                  updatedAt: serverTimestamp(),
                })
              );
            });
            
            await Promise.all(updatePromises);
          }
          
          const configData = {
            ...input,
            includeMetadata: input.includeMetadata ?? true,
            pageOrientation: input.pageOrientation ?? 'portrait',
            pageSize: input.pageSize ?? 'A4',
            screenshotType: input.screenshotType ?? 'on-exit',
            includeQuestionScreenshots: input.includeQuestionScreenshots ?? false,
            createdBy: user.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            generationCount: 0,
            status: 'draft',
            isDefault: input.isDefault || false,
            sharedWith: [],
            isPublic: false,
          };

          const docRef = await addDoc(collection(db, CONFIGURATIONS_COLLECTION), configData);
          const newDoc = await getDoc(docRef);
          
          const result = {
            id: docRef.id,
            ...newDoc.data(),
          } as ReportConfiguration;
          
          return { data: result };
        } catch (error: any) {
          return { error: { error: error?.message || String(error) } };
        }
      },
      invalidatesTags: ['ReportConfiguration', 'ReportStats'],
    }),

    getConfiguration: builder.query<ReportConfiguration | null, string>({
      async queryFn(configId) {
        try {
          const docRef = doc(db, CONFIGURATIONS_COLLECTION, configId);
          const docSnap = await getDoc(docRef);
          
          if (!docSnap.exists()) {
            return { data: null };
          }
          
          return { 
            data: {
              id: docSnap.id,
              ...docSnap.data(),
            } as ReportConfiguration
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      providesTags: (result, error, id) => [{ type: 'ReportConfiguration', id }],
    }),

    updateConfiguration: builder.mutation<
      ReportConfiguration,
      { configId: string; input: UpdateReportConfigurationInput }
    >({
      async queryFn({ configId, input }) {
        try {
          const docRef = doc(db, CONFIGURATIONS_COLLECTION, configId);
          
          // If setting as default, clear other defaults first
          if (input.isDefault) {
            const q = query(
              collection(db, CONFIGURATIONS_COLLECTION),
              where('customerId', '==', input.customerId),
              where('studyId', '==', input.studyId),
              where('packageName', '==', input.packageName),
              where('isDefault', '==', true)
            );
            
            const querySnapshot = await getDocs(q);
            const updatePromises: Promise<void>[] = [];
            
            querySnapshot.forEach((docSnap) => {
              // Don't unset the current config if it's already default
              if (docSnap.id !== configId) {
                updatePromises.push(
                  updateDoc(doc(db, CONFIGURATIONS_COLLECTION, docSnap.id), {
                    isDefault: false,
                    updatedAt: serverTimestamp(),
                  })
                );
              }
            });
            
            await Promise.all(updatePromises);
          }
          
          const updateData = {
            ...input,
            updatedAt: serverTimestamp(),
          };
          
          await updateDoc(docRef, updateData);
          
          const updatedDoc = await getDoc(docRef);
          if (!updatedDoc.exists()) {
            return { error: { error: 'Configuration not found after update' } };
          }
          
          return { 
            data: {
              id: updatedDoc.id,
              ...updatedDoc.data(),
            } as ReportConfiguration
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      invalidatesTags: (result, error, { configId }) => [
        { type: 'ReportConfiguration', id: configId },
        'ReportStats',
      ],
    }),

    deleteConfiguration: builder.mutation<void, string>({
      async queryFn(configId) {
        try {
          const docRef = doc(db, CONFIGURATIONS_COLLECTION, configId);
          await deleteDoc(docRef);
          return { data: undefined };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      invalidatesTags: ['ReportConfiguration', 'ReportStats'],
    }),

    listConfigurations: builder.query<
      ReportConfiguration[],
      { filters: ReportConfigurationFilters; limit?: number }
    >({
      async queryFn({ filters, limit = 20 }) {
        try {
          let q = collection(db, CONFIGURATIONS_COLLECTION);
          const constraints = [];

          if (filters.customerId) {
            constraints.push(where('customerId', '==', filters.customerId));
          }
          if (filters.studyId) {
            constraints.push(where('studyId', '==', filters.studyId));
          }
          if (filters.packageName) {
            constraints.push(where('packageName', '==', filters.packageName));
          }
          if (filters.status) {
            constraints.push(where('status', '==', filters.status));
          }
          if (filters.createdBy) {
            constraints.push(where('createdBy', '==', filters.createdBy));
          }
          if (filters.isDefault !== undefined) {
            constraints.push(where('isDefault', '==', filters.isDefault));
          }

          // Note: orderBy with multiple where clauses may require a composite index
          // For now, we'll skip orderBy when filtering to avoid index requirements
          // TODO: Add composite index for better query performance
          const hasFilters = constraints.length > 0;
          if (!hasFilters) {
            constraints.push(orderBy('updatedAt', 'desc'));
          }
          constraints.push(firestoreLimit(limit));

          const finalQuery = query(q, ...constraints);
          
          console.log('Querying report configurations with filters:', filters);
          const querySnapshot = await getDocs(finalQuery);
          console.log('Found', querySnapshot.size, 'configurations');
          
          const configurations: ReportConfiguration[] = [];
          querySnapshot.forEach((doc) => {
            console.log('Configuration:', doc.id, doc.data());
            configurations.push({
              id: doc.id,
              ...doc.data(),
            } as ReportConfiguration);
          });

          // Apply text search filter if provided
          if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            return {
              data: configurations.filter(
                (config) =>
                  config.name.toLowerCase().includes(searchLower) ||
                  config.description?.toLowerCase().includes(searchLower)
              )
            };
          }

          return { data: configurations };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'ReportConfiguration' as const, id })),
              { type: 'ReportConfiguration', id: 'LIST' },
            ]
          : [{ type: 'ReportConfiguration', id: 'LIST' }],
    }),

    cloneConfiguration: builder.mutation<
      ReportConfiguration,
      { configId: string; newName: string }
    >({
      async queryFn({ configId, newName }) {
        try {
          const user = auth.currentUser;
          if (!user?.email) {
            return { error: { error: 'User not authenticated' } };
          }
          
          // Get original configuration
          const originalDoc = await getDoc(doc(db, CONFIGURATIONS_COLLECTION, configId));
          if (!originalDoc.exists()) {
            return { error: { error: 'Configuration not found' } };
          }
          
          const original = originalDoc.data() as ReportConfiguration;
          
          const newConfig = {
            ...original,
            name: newName,
            description: `Cloned from: ${original.name}`,
            createdBy: user.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            generationCount: 0,
            status: 'draft',
            isDefault: false,
          };
          
          delete (newConfig as any).id;
          delete (newConfig as any).lastGeneratedAt;
          
          const docRef = await addDoc(collection(db, CONFIGURATIONS_COLLECTION), newConfig);
          const newDoc = await getDoc(docRef);
          
          return { 
            data: {
              id: docRef.id,
              ...newDoc.data(),
            } as ReportConfiguration
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      invalidatesTags: ['ReportConfiguration', 'ReportStats'],
    }),

    setDefaultConfiguration: builder.mutation<
      void,
      {
        configId: string;
        customerId: string;
        studyId: string;
        packageName: string;
      }
    >({
      async queryFn({ configId, customerId, studyId, packageName }) {
        try {
          // First, unset any existing default
          const q = query(
            collection(db, CONFIGURATIONS_COLLECTION),
            where('customerId', '==', customerId),
            where('studyId', '==', studyId),
            where('packageName', '==', packageName),
            where('isDefault', '==', true)
          );
          
          const querySnapshot = await getDocs(q);
          const updatePromises: Promise<void>[] = [];
          
          querySnapshot.forEach((docSnap) => {
            updatePromises.push(
              updateDoc(doc(db, CONFIGURATIONS_COLLECTION, docSnap.id), {
                isDefault: false,
                updatedAt: serverTimestamp(),
              })
            );
          });
          
          await Promise.all(updatePromises);
          
          // Set the new default
          await updateDoc(doc(db, CONFIGURATIONS_COLLECTION, configId), {
            isDefault: true,
            updatedAt: serverTimestamp(),
          });
          
          return { data: undefined };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      invalidatesTags: ['ReportConfiguration'],
    }),

    shareConfiguration: builder.mutation<
      ReportConfiguration,
      { configId: string; userEmails: string[] }
    >({
      async queryFn({ configId, userEmails }) {
        try {
          const docRef = doc(db, CONFIGURATIONS_COLLECTION, configId);
          
          await updateDoc(docRef, {
            sharedWith: userEmails,
            updatedAt: serverTimestamp(),
          });
          
          const updatedDoc = await getDoc(docRef);
          
          return { 
            data: {
              id: updatedDoc.id,
              ...updatedDoc.data(),
            } as ReportConfiguration
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      invalidatesTags: (result, error, { configId }) => [
        { type: 'ReportConfiguration', id: configId },
      ],
    }),

    // Generation job operations
    createGenerationJob: builder.mutation<
      ReportGenerationJob,
      { input: GenerateReportInput; analysisId: string }
    >({
      async queryFn({ input, analysisId }) {
        try {
          const user = auth.currentUser;
          if (!user?.email) {
            return { error: { error: 'User not authenticated' } };
          }
          
          // Get configuration to extract details
          const configDoc = await getDoc(doc(db, CONFIGURATIONS_COLLECTION, input.configurationId));
          if (!configDoc.exists()) {
            return { error: { error: 'Configuration not found' } };
          }
          
          const config = configDoc.data() as ReportConfiguration;
          
          const jobData = {
            configurationId: input.configurationId,
            analysisId,
            requestedBy: user.email,
            requestedAt: serverTimestamp(),
            requestSource: 'ui',
            status: 'pending',
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
          
          const docRef = await addDoc(collection(db, GENERATION_JOBS_COLLECTION), jobData);
          const newDoc = await getDoc(docRef);
          
          // Update configuration's last generated timestamp
          await updateDoc(doc(db, CONFIGURATIONS_COLLECTION, input.configurationId), {
            lastGeneratedAt: serverTimestamp(),
            generationCount: (config.generationCount || 0) + 1,
          });
          
          return { 
            data: {
              id: docRef.id,
              ...newDoc.data(),
            } as ReportGenerationJob
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      invalidatesTags: ['GenerationJob', 'ReportStats'],
    }),

    getGenerationJob: builder.query<ReportGenerationJob | null, string>({
      async queryFn(jobId) {
        try {
          const docRef = doc(db, GENERATION_JOBS_COLLECTION, jobId);
          const docSnap = await getDoc(docRef);
          
          if (!docSnap.exists()) {
            return { data: null };
          }
          
          return { 
            data: {
              id: docSnap.id,
              ...docSnap.data(),
            } as ReportGenerationJob
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      providesTags: (result, error, id) => [{ type: 'GenerationJob', id }],
    }),

    listGenerationJobs: builder.query<
      ReportGenerationJob[],
      { filters: ReportGenerationJobFilters; limit?: number }
    >({
      async queryFn({ filters, limit = 20 }) {
        try {
          let q = collection(db, GENERATION_JOBS_COLLECTION);
          const constraints = [];

          if (filters.configurationId) {
            constraints.push(where('configurationId', '==', filters.configurationId));
          }
          if (filters.requestedBy) {
            constraints.push(where('requestedBy', '==', filters.requestedBy));
          }
          if (filters.status) {
            constraints.push(where('status', '==', filters.status));
          }

          constraints.push(orderBy('requestedAt', 'desc'));
          constraints.push(firestoreLimit(limit));

          const finalQuery = query(q, ...constraints);
          const querySnapshot = await getDocs(finalQuery);
          
          const jobs: ReportGenerationJob[] = [];
          querySnapshot.forEach((docSnap) => {
            const jobData = docSnap.data();
            
            // Apply date filters if provided
            if (filters.dateFrom || filters.dateTo) {
              const requestedAt = jobData.requestedAt?.toDate();
              if (requestedAt) {
                if (filters.dateFrom && requestedAt < filters.dateFrom) return;
                if (filters.dateTo && requestedAt > filters.dateTo) return;
              }
            }
            
            jobs.push({
              id: docSnap.id,
              ...jobData,
            } as ReportGenerationJob);
          });

          return { data: jobs };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'GenerationJob' as const, id })),
              { type: 'GenerationJob', id: 'LIST' },
            ]
          : [{ type: 'GenerationJob', id: 'LIST' }],
    }),

    // Statistics
    getConfigurationStats: builder.query<
      ReportConfigurationStats,
      { customerId: string; studyId?: string; packageName?: string }
    >({
      async queryFn({ customerId, studyId, packageName }) {
        try {
          const constraints = [
            where('customerId', '==', customerId),
          ];
          
          if (studyId) {
            constraints.push(where('studyId', '==', studyId));
          }
          if (packageName) {
            constraints.push(where('packageName', '==', packageName));
          }
          
          const q = query(collection(db, CONFIGURATIONS_COLLECTION), ...constraints);
          const querySnapshot = await getDocs(q);
          
          const configs: ReportConfiguration[] = [];
          querySnapshot.forEach((doc) => {
            configs.push({
              id: doc.id,
              ...doc.data(),
            } as ReportConfiguration);
          });
          
          const activeConfigs = configs.filter((c) => c.status === 'active');
          const totalGenerations = configs.reduce((sum, c) => sum + (c.generationCount || 0), 0);
          
          // Find most used configuration
          const mostUsed = configs.reduce((prev, curr) => 
            (curr.generationCount || 0) > (prev.generationCount || 0) ? curr : prev
          );
          
          return { 
            data: {
              totalConfigurations: configs.length,
              activeConfigurations: activeConfigs.length,
              totalGenerations,
              averageGenerationTime: 0, // Will be calculated from jobs
              mostUsedConfiguration: mostUsed?.name,
              lastGenerationDate: configs[0]?.lastGeneratedAt,
            }
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      providesTags: ['ReportStats'],
    }),

    // Export/Import
    exportConfiguration: builder.query<ConfigurationExport, string>({
      async queryFn(configId) {
        try {
          const docRef = doc(db, CONFIGURATIONS_COLLECTION, configId);
          const docSnap = await getDoc(docRef);
          
          if (!docSnap.exists()) {
            return { error: { error: 'Configuration not found' } };
          }
          
          const config = docSnap.data() as ReportConfiguration;
          const { createdAt, updatedAt, ...exportData } = config;
          
          return { 
            data: {
              version: '1.0.0',
              exportedAt: new Date().toISOString(),
              configuration: exportData,
            }
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
    }),

    importConfiguration: builder.mutation<ReportConfiguration, ConfigurationExport>({
      async queryFn(exportData) {
        try {
          const user = auth.currentUser;
          if (!user?.email) {
            return { error: { error: 'User not authenticated' } };
          }
          
          const configData = {
            ...exportData.configuration,
            name: `${exportData.configuration.name} (Imported)`,
            createdBy: user.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            generationCount: 0,
            status: 'draft',
            isDefault: false,
          };
          
          const docRef = await addDoc(collection(db, CONFIGURATIONS_COLLECTION), configData);
          const newDoc = await getDoc(docRef);
          
          return { 
            data: {
              id: docRef.id,
              ...newDoc.data(),
            } as ReportConfiguration
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      invalidatesTags: ['ReportConfiguration', 'ReportStats'],
    }),

    // Batch operations
    batchDeleteConfigurations: builder.mutation<
      { deletedCount: number; errors: string[] },
      string[]
    >({
      async queryFn(configIds) {
        try {
          const deletePromises = configIds.map(id => 
            deleteDoc(doc(db, CONFIGURATIONS_COLLECTION, id))
          );
          
          const results = await Promise.allSettled(deletePromises);
          
          const deletedCount = results.filter(r => r.status === 'fulfilled').length;
          const errors = results
            .filter(r => r.status === 'rejected')
            .map((r: any) => r.reason?.message || 'Unknown error');
          
          return { 
            data: {
              deletedCount,
              errors,
            }
          };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
      invalidatesTags: ['ReportConfiguration', 'ReportStats'],
    }),

    // Helper queries for UI
    getAvailableForms: builder.query<
      ReportForm[],
      { customerId: string; studyId: string; packageName: string; language: string }
    >({
      async queryFn({ customerId, studyId, packageName, language }) {
        try {
          // Query the survey-analyses collection to get forms
          const analysisQuery = query(
            collection(db, 'survey-analyses'),
            where('customerId', '==', customerId),
            where('studyId', '==', studyId),
            where('packageName', '==', packageName),
            where('language', '==', language),
            orderBy('analysisDate', 'desc')
          );

          const analysisSnapshot = await getDocs(analysisQuery);
          if (analysisSnapshot.empty) {
            return { data: [] };
          }

          const analysisDoc = analysisSnapshot.docs[0];
          const analysisId = analysisDoc.id;

          // Query the forms subcollection
          const formsQuery = query(
            collection(db, `survey-analyses/${analysisId}/forms`),
            orderBy('formIndex', 'asc')
          );

          const formsSnapshot = await getDocs(formsQuery);
          const forms: ReportForm[] = [];

          formsSnapshot.forEach((doc) => {
            const data = doc.data();
            forms.push({
              id: doc.id,
              formIndex: data.formIndex,
              longTitle: data.longTitle,
              shortName: data.shortName,
              questionCount: data.fieldsCount || 0,
              hasOnEntryScreenshot: !!data.onEntryScreenshot,
              hasOnExitScreenshot: !!data.onExitScreenshot,
              order: data.order || data.formIndex,
            });
          });

          return { data: forms };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
    }),

    getAvailableLanguages: builder.query<
      LanguageOption[],
      { customerId: string; studyId: string; packageName: string }
    >({
      async queryFn({ customerId, studyId, packageName }) {
        try {
          // Query all analyses for this package to get available languages
          const analysisQuery = query(
            collection(db, 'survey-analyses'),
            where('customerId', '==', customerId),
            where('studyId', '==', studyId),
            where('packageName', '==', packageName),
            orderBy('analysisDate', 'desc')
          );

          const analysisSnapshot = await getDocs(analysisQuery);
          const languageMap = new Map<string, LanguageOption>();

          analysisSnapshot.forEach((doc) => {
            const data = doc.data();
            const language = data.language;
            
            if (!languageMap.has(language)) {
              languageMap.set(language, {
                code: language,
                name: getLanguageName(language),
                isAvailable: true,
                analysisId: doc.id,
                lastUpdated: data.analysisDate,
              });
            }
          });

          const languages = Array.from(languageMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
          );

          return { data: languages };
        } catch (error) {
          return { error: { error: String(error) } };
        }
      },
    }),

    // Generate PDF Report
    generateReport: builder.mutation<
      { jobId: string; status: string; message: string },
      string // configurationId
    >({
      async queryFn(configurationId) {
        try {
          const user = auth.currentUser;
          if (!user) {
            return { error: { error: 'User not authenticated' } };
          }

          // Get ID token for authentication
          const idToken = await user.getIdToken();
          
          // Determine the Cloud Function URL based on environment
          const isEmulator = import.meta.env.VITE_USE_EMULATORS === 'true';
          const functionUrl = isEmulator
            ? 'http://localhost:5001/castor-form-shot/us-central1/generateReport'
            : 'https://us-central1-castor-form-shot.cloudfunctions.net/generateReport';
          
          // Call the Cloud Function
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ configurationId })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          const result = await response.json();
          return { data: result };
        } catch (error: any) {
          console.error('Failed to generate report:', error);
          return { error: { error: error?.message || String(error) } };
        }
      },
      invalidatesTags: ['GenerationJob'],
    }),
  }),
});

// Helper function to get language display name
function getLanguageName(code: string): string {
  const languageNames: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    nl: 'Dutch',
    ja: 'Japanese',
    zh: 'Chinese',
    ko: 'Korean',
    ar: 'Arabic',
    ru: 'Russian',
  };
  return languageNames[code] || code.toUpperCase();
}

// Export hooks for usage in functional components
export const {
  useCreateConfigurationMutation,
  useGetConfigurationQuery,
  useUpdateConfigurationMutation,
  useDeleteConfigurationMutation,
  useListConfigurationsQuery,
  useCloneConfigurationMutation,
  useSetDefaultConfigurationMutation,
  useShareConfigurationMutation,
  useCreateGenerationJobMutation,
  useGetGenerationJobQuery,
  useListGenerationJobsQuery,
  useGetConfigurationStatsQuery,
  useExportConfigurationQuery,
  useImportConfigurationMutation,
  useBatchDeleteConfigurationsMutation,
  useGetAvailableFormsQuery,
  useGetAvailableLanguagesQuery,
  useGenerateReportMutation,
} = reportApi;