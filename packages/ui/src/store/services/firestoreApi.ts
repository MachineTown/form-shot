import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  DocumentData,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../services/firebase';

// Helper to handle Firestore Timestamp serialization
const convertTimestamps = (data: any): any => {
  if (!data) return data;
  
  if (data instanceof Timestamp) {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(convertTimestamps);
  }
  
  if (typeof data === 'object') {
    const converted: any = {};
    for (const key in data) {
      if (data[key] instanceof Timestamp) {
        converted[key] = data[key];
      } else if (data[key]?.seconds !== undefined && data[key]?.nanoseconds !== undefined) {
        // Handle serialized timestamp objects
        converted[key] = new Timestamp(data[key].seconds, data[key].nanoseconds);
      } else {
        converted[key] = convertTimestamps(data[key]);
      }
    }
    return converted;
  }
  
  return data;
};

export interface Customer {
  customerId: string;
  name: string;
  createdAt: Timestamp;
  lastAnalysisAt: Timestamp;
  totalAnalyses: number;
  activeStudies: string[];
}

export interface SurveyAnalysis {
  id: string;
  customerId: string;
  studyId: string;
  packageName: string;
  language: string;
  version: string;
  analysisDate: Timestamp;
  url: string;
  longTitle: string;
  shortName: string;
  viewportHeight: number;
  timestamp: Timestamp;
  fieldsCount: number;
  hasTestData: boolean;
  testDataSummary?: any;
  screenshotsPath: string;
  firstFormOnEntryScreenshotUrl?: string;
  status: string;
  processingDuration: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SurveyField {
  id: string;
  questionNumber: string;
  questionText: string;
  inputType: string;
  isRequired: boolean;
  choices?: string[];
  selector: string;
  cardBoxSelector: string;
  screenshotFilename: string;
  screenshotUrl: string;
  order: number;
  testData?: any;
}

export interface SurveyForm {
  id: string;
  formIndex: number;
  longTitle: string;
  shortName: string;
  viewportHeight: number;
  timestamp: Timestamp;
  fieldsCount: number;
  navigationButtons: string[];
  order: number;
  hasTestData: boolean;
  testDataSummary?: any;
  onEntryScreenshot: string;
  onExitScreenshot: string;
  onEntryScreenshotUrl: string;
  onExitScreenshotUrl: string;
}

export interface QueryParams {
  customerId?: string;
  studyId?: string;
  packageName?: string;
  language?: string;
  limit?: number;
}

export const firestoreApi = createApi({
  reducerPath: 'firestore',
  baseQuery: fakeBaseQuery(),
  tagTypes: ['Customer', 'Analysis', 'Field', 'Form'],
  endpoints: (builder) => ({
    // Get all customers
    getCustomers: builder.query<Customer[], void>({
      async queryFn() {
        try {
          const querySnapshot = await getDocs(collection(db, 'customers'));
          const customers: Customer[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const convertedData = convertTimestamps(data);
            customers.push({ ...convertedData as Customer });
          });
          return { data: customers };
        } catch (error) {
          return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
        }
      },
      providesTags: ['Customer'],
    }),

    // Get analyses with filters
    getAnalyses: builder.query<SurveyAnalysis[], QueryParams>({
      async queryFn(params) {
        try {
          let q = query(collection(db, 'survey-analyses'));
          
          if (params.customerId) {
            q = query(q, where('customerId', '==', params.customerId));
          }
          if (params.studyId) {
            q = query(q, where('studyId', '==', params.studyId));
          }
          if (params.packageName) {
            q = query(q, where('packageName', '==', params.packageName));
          }
          if (params.language) {
            q = query(q, where('language', '==', params.language));
          }
          
          q = query(q, orderBy('analysisDate', 'desc'));
          
          if (params.limit) {
            q = query(q, firestoreLimit(params.limit));
          }
          
          const querySnapshot = await getDocs(q);
          const analyses: SurveyAnalysis[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const convertedData = convertTimestamps(data);
            analyses.push({ id: docSnap.id, ...convertedData } as SurveyAnalysis);
          });
          
          console.log('Firestore getAnalyses query result:', {
            params,
            analysesCount: analyses.length,
            analyses: analyses.map(a => ({
              id: a.id,
              customerId: a.customerId,
              studyId: a.studyId,
              packageName: a.packageName,
              analysisDate: a.analysisDate
            }))
          });
          
          return { data: analyses };
        } catch (error) {
          return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
        }
      },
      providesTags: ['Analysis'],
    }),

    // Get single analysis with forms
    getAnalysisWithForms: builder.query<{ analysis: SurveyAnalysis; forms: SurveyForm[] }, string>({
      async queryFn(analysisId) {
        try {
          // Get main analysis document
          const analysisDoc = await getDoc(doc(db, 'survey-analyses', analysisId));
          if (!analysisDoc.exists()) {
            throw new Error('Analysis not found');
          }
          
          const analysisData = analysisDoc.data();
          const analysis = { id: analysisDoc.id, ...convertTimestamps(analysisData) } as SurveyAnalysis;
          
          // Get forms subcollection
          const formsQuery = query(
            collection(db, 'survey-analyses', analysisId, 'forms'),
            orderBy('order')
          );
          const formsSnapshot = await getDocs(formsQuery);
          const forms: SurveyForm[] = [];
          formsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            forms.push({ id: docSnap.id, ...convertTimestamps(data) } as SurveyForm);
          });
          
          return { data: { analysis, forms } };
        } catch (error) {
          return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
        }
      },
      providesTags: ['Analysis', 'Form'],
    }),

    // Get fields for a specific form
    getFormFields: builder.query<SurveyField[], { analysisId: string; formId: string }>({
      async queryFn({ analysisId, formId }) {
        try {
          const fieldsQuery = query(
            collection(db, 'survey-analyses', analysisId, 'forms', formId, 'fields'),
            orderBy('order')
          );
          const fieldsSnapshot = await getDocs(fieldsQuery);
          const fields: SurveyField[] = [];
          fieldsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            fields.push({ id: docSnap.id, ...convertTimestamps(data) } as SurveyField);
          });
          
          return { data: fields };
        } catch (error) {
          return { error: { status: 'CUSTOM_ERROR', error: String(error) } };
        }
      },
      providesTags: ['Field'],
    }),
  }),
});

export const {
  useGetCustomersQuery,
  useGetAnalysesQuery,
  useGetAnalysisWithFormsQuery,
  useGetFormFieldsQuery,
} = firestoreApi;