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
}

export interface SurveyField {
  questionNumber: string;
  questionText: string;
  inputType: 'text' | 'radio' | 'dropdown' | 'checkbox' | 'textarea' | 'number' | 'date';
  isRequired: boolean;
  choices?: string[];
  screenshotPath: string;
  selector: string;
  cardBoxSelector: string;
}

export interface AnalysisOutput {
  metadata: {
    tuple: SurveyTuple;
    analysisDate: string;
    url: string;
  };
  form: SurveyForm;
}