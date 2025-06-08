export interface FormField {
  id: string;
  selector: string;
  type: FieldType;
  name?: string;
  label?: string;
  required: boolean;
  attributes: FieldAttributes;
}

export interface FieldAttributes {
  maxLength?: number;
  minLength?: number;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
  placeholder?: string;
  autocomplete?: string;
  multiple?: boolean;
  accept?: string;
  options?: SelectOption[];
}

export interface SelectOption {
  value: string;
  text: string;
  selected: boolean;
}

export type FieldType = 
  | 'text' 
  | 'email' 
  | 'password' 
  | 'number' 
  | 'tel' 
  | 'url' 
  | 'date' 
  | 'datetime-local'
  | 'time'
  | 'month'
  | 'week'
  | 'color'
  | 'range'
  | 'file'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'textarea'
  | 'submit'
  | 'button';

export type TestCategory = 'normal' | 'edge' | 'invalid' | 'boundary';

export interface TestCase {
  id: string;
  category: TestCategory;
  description: string;
  field: string;
  inputValue: string | string[] | boolean;
  expectedOutcome: ExpectedOutcome;
}

export interface ExpectedOutcome {
  valid: boolean;
  errorMessage?: string;
  formSubmittable: boolean;
  validationTrigger?: 'input' | 'blur' | 'submit';
}

export interface FormMetadata {
  url: string;
  title: string;
  analyzedAt: string;
  totalFields: number;
  viewport: string;
  formSelector?: string;
}

export interface TestMatrix {
  formMetadata: FormMetadata;
  fields: FormField[];
  testCases: TestCase[];
}

export interface AnalyzeOptions {
  url: string;
  output?: string;
  viewport?: string;
  waitFor?: number;
  screenshot?: boolean;
}