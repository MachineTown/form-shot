export interface SurveyTuple {
  customerId: string;
  studyId: string;
  packageName: string;
  language: string;
  version: string;
}

export interface SurveyForm {
  longTitle: string;
  shortName: string;
  fields: SurveyField[];
  viewportHeight: number;
  url: string;
  timestamp: string;
  navigationButtons: NavigationButton[];
  formIndex?: number;
  onEntryScreenshot?: string;
  onExitScreenshot?: string;
}

export interface SurveyField {
  questionNumber: string;
  questionText: string;
  inputType: 'text' | 'radio' | 'dropdown' | 'checkbox' | 'textarea' | 'number' | 'date' | 'email' | 'phone' | 'url';
  isRequired: boolean;
  choices?: string[];
  screenshotPath: string;
  selector: string;
  cardBoxSelector: string;
  testData?: TestData;
}

export interface TestData {
  detectedType: string;
  confidence: number;
  detectionMethod: 'pattern_match' | 'input_type' | 'fallback';
  fallbackType?: string;
  generatedAt: string;
  testCases: TestCase[];
  summary: TestDataSummary;
  metadata?: {
    patterns: string[];
    templateUsed?: string;
    customRules?: string[];
  };
}

export interface TestCase {
  id: string;
  type: 'valid' | 'boundary' | 'edge' | 'invalid';
  value: string | number;
  position?: number;
  description: string;
  source: 'generated' | 'human' | 'hybrid';
  provenance: TestCaseProvenance;
  status: 'draft' | 'approved' | 'rejected' | 'needs_review';
  quality: {
    confidence: number;
    reviewCount: number;
    lastReviewed?: string;
  };
}

export interface TestCaseProvenance {
  createdBy: 'system' | 'user' | 'admin';
  createdAt: string;
  generator?: {
    algorithm: string;
    version: string;
    template: string;
    confidence: number;
  };
  human?: {
    userId: string;
    userName: string;
    reason?: string;
    context?: string;
  };
  modifications: TestCaseModification[];
}

export interface TestCaseModification {
  timestamp: string;
  modifiedBy: string;
  action: 'created' | 'updated' | 'approved' | 'rejected' | 'enhanced';
  changes: Record<string, any>;
  reason?: string;
}

export interface TestDataSummary {
  totalTestCases: number;
  generatedCount: number;
  humanCount: number;
  hybridCount: number;
  approvedCount: number;
  pendingReviewCount: number;
}

export interface FieldTypePattern {
  id: string;
  name: string;
  priority: number;
  patterns: {
    questionText: RegExp[];
    inputAttributes?: Record<string, RegExp>;
    contextClues?: RegExp[];
  };
  testDataTemplate: string;
  confidence: number;
  version: string;
  createdAt: string;
  usage?: {
    totalMatches: number;
    successRate: number;
    lastUsed?: string;
  };
}

export interface TestDataTemplate {
  id: string;
  fieldType: string;
  version: string;
  description: string;
  testCases: TestCaseTemplate[];
  variations?: VariationSet[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    author: string;
    tags: string[];
  };
}

export interface TestCaseTemplate {
  type: 'valid' | 'boundary' | 'edge' | 'invalid';
  valueType: 'static' | 'generated' | 'pattern';
  value: string | GeneratorFunction;
  description: string;
  weight: number;
  position?: number;
  conditions?: {
    inputType?: string[];
    choiceCount?: { min?: number; max?: number; };
    required?: boolean;
  };
}

export interface VariationSet {
  id: string;
  name: string;
  locale?: string;
  culture?: string;
  testCases: TestCaseTemplate[];
}

export interface GeneratorFunction {
  type: 'function';
  name: string;
  params?: Record<string, any>;
}

export interface DetectionResult {
  fieldType: string;
  confidence: number;
  method: 'pattern_match' | 'input_type' | 'fallback';
  matchedPatterns: string[];
  template?: string;
  fallback?: string;
}

export interface UnknownField {
  id: string;
  questionText: string;
  inputType: string;
  choices?: string[];
  context: {
    surveyTitle?: string;
    previousQuestions?: string[];
    nextQuestions?: string[];
  };
  analysisMetadata: {
    customerId: string;
    studyId: string;
    timestamp: string;
  };
  suggestedType?: string;
  needsClassification: boolean;
}

export interface NavigationButton {
  type: 'next' | 'previous' | 'finish';
  text: string;
  selector: string;
  isEnabled: boolean;
}

export interface Survey {
  metadata: {
    tuple: SurveyTuple;
    analysisDate: string;
    url: string;
    totalForms: number;
  };
  forms: SurveyForm[];
}

export interface AnalysisOutput {
  metadata: {
    tuple: SurveyTuple;
    analysisDate: string;
    url: string;
  };
  form: SurveyForm;
}

export interface TestRunResult {
  fieldId: string;
  questionNumber: string;
  testCaseId: string;
  value: string | number;
  screenshotPath: string;
  timestamp: string;
  triggeredFields?: SurveyField[];
  validationErrors?: string[];
}