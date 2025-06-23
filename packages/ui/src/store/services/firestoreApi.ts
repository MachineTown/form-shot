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

interface QueryParams {
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
          querySnapshot.forEach((doc) => {
            customers.push({ ...doc.data() as Customer });
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
          querySnapshot.forEach((doc) => {
            analyses.push({ id: doc.id, ...doc.data() } as SurveyAnalysis);
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
          
          const analysis = { id: analysisDoc.id, ...analysisDoc.data() } as SurveyAnalysis;
          
          // Get forms subcollection
          const formsQuery = query(
            collection(db, 'survey-analyses', analysisId, 'forms'),
            orderBy('order')
          );
          const formsSnapshot = await getDocs(formsQuery);
          const forms: SurveyForm[] = [];
          formsSnapshot.forEach((doc) => {
            forms.push({ id: doc.id, ...doc.data() } as SurveyForm);
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
          fieldsSnapshot.forEach((doc) => {
            fields.push({ id: doc.id, ...doc.data() } as SurveyField);
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