import { FormField, TestCase, TestCategory, ExpectedOutcome } from '../utils/types';
import { EdgeCaseStrategies } from './edge-case-strategies';
import logger from '../utils/logger';

export class TestCaseGenerator {
  generateTestCases(fields: FormField[]): TestCase[] {
    logger.info(`Generating test cases for ${fields.length} fields...`);
    
    const testCases: TestCase[] = [];
    let testIdCounter = 1;

    fields.forEach(field => {
      const fieldTestCases = this.generateFieldTestCases(field, testIdCounter);
      testCases.push(...fieldTestCases);
      testIdCounter += fieldTestCases.length;
    });

    logger.info(`Generated ${testCases.length} total test cases`);
    return testCases;
  }

  private generateFieldTestCases(field: FormField, startId: number): TestCase[] {
    const testCases: TestCase[] = [];
    const testValues = EdgeCaseStrategies.getTestValues(field);
    let currentId = startId;

    // Generate normal test cases
    testValues.normal.forEach(value => {
      testCases.push({
        id: `tc_${currentId.toString().padStart(3, '0')}`,
        category: 'normal',
        description: `Valid ${field.type} input for ${field.label || field.name || field.id}`,
        field: field.id,
        inputValue: value,
        expectedOutcome: this.getExpectedOutcome(field, value, 'normal')
      });
      currentId++;
    });

    // Generate edge test cases
    testValues.edge.forEach(value => {
      testCases.push({
        id: `tc_${currentId.toString().padStart(3, '0')}`,
        category: 'edge',
        description: `Edge case ${field.type} input for ${field.label || field.name || field.id}`,
        field: field.id,
        inputValue: value,
        expectedOutcome: this.getExpectedOutcome(field, value, 'edge')
      });
      currentId++;
    });

    // Generate boundary test cases for numeric fields
    if (field.type === 'number' || field.type === 'range') {
      const boundaryTests = this.generateBoundaryTests(field, currentId);
      testCases.push(...boundaryTests);
      currentId += boundaryTests.length;
    }

    // Generate invalid test cases
    testValues.invalid.forEach(value => {
      testCases.push({
        id: `tc_${currentId.toString().padStart(3, '0')}`,
        category: 'invalid',
        description: `Invalid ${field.type} input for ${field.label || field.name || field.id}`,
        field: field.id,
        inputValue: value,
        expectedOutcome: this.getExpectedOutcome(field, value, 'invalid')
      });
      currentId++;
    });

    // Generate required field test cases
    if (field.required) {
      testCases.push({
        id: `tc_${currentId.toString().padStart(3, '0')}`,
        category: 'invalid',
        description: `Empty required field ${field.label || field.name || field.id}`,
        field: field.id,
        inputValue: '',
        expectedOutcome: {
          valid: false,
          errorMessage: 'This field is required',
          formSubmittable: false,
          validationTrigger: 'submit'
        }
      });
      currentId++;
    }

    return testCases;
  }

  private generateBoundaryTests(field: FormField, startId: number): TestCase[] {
    const testCases: TestCase[] = [];
    const { min, max, step } = field.attributes;
    let currentId = startId;

    if (min !== undefined) {
      const minVal = parseFloat(min.toString());
      
      // Test exactly at minimum
      testCases.push({
        id: `tc_${currentId.toString().padStart(3, '0')}`,
        category: 'boundary',
        description: `Minimum boundary value for ${field.label || field.name || field.id}`,
        field: field.id,
        inputValue: min.toString(),
        expectedOutcome: {
          valid: true,
          formSubmittable: true
        }
      });
      currentId++;

      // Test just below minimum
      testCases.push({
        id: `tc_${currentId.toString().padStart(3, '0')}`,
        category: 'boundary',
        description: `Below minimum boundary value for ${field.label || field.name || field.id}`,
        field: field.id,
        inputValue: (minVal - 0.01).toString(),
        expectedOutcome: {
          valid: false,
          errorMessage: `Value must be at least ${min}`,
          formSubmittable: false,
          validationTrigger: 'input'
        }
      });
      currentId++;
    }

    if (max !== undefined) {
      const maxVal = parseFloat(max.toString());
      
      // Test exactly at maximum
      testCases.push({
        id: `tc_${currentId.toString().padStart(3, '0')}`,
        category: 'boundary',
        description: `Maximum boundary value for ${field.label || field.name || field.id}`,
        field: field.id,
        inputValue: max.toString(),
        expectedOutcome: {
          valid: true,
          formSubmittable: true
        }
      });
      currentId++;

      // Test just above maximum
      testCases.push({
        id: `tc_${currentId.toString().padStart(3, '0')}`,
        category: 'boundary',
        description: `Above maximum boundary value for ${field.label || field.name || field.id}`,
        field: field.id,
        inputValue: (maxVal + 0.01).toString(),
        expectedOutcome: {
          valid: false,
          errorMessage: `Value must be at most ${max}`,
          formSubmittable: false,
          validationTrigger: 'input'
        }
      });
      currentId++;
    }

    return testCases;
  }

  private getExpectedOutcome(field: FormField, value: string, category: TestCategory): ExpectedOutcome {
    const isEmptyValue = value === '' || value === null || value === undefined;
    
    switch (category) {
      case 'normal':
        return {
          valid: true,
          formSubmittable: true,
          validationTrigger: 'input'
        };
        
      case 'edge':
        // Edge cases might be valid or invalid depending on the specific case
        if (isEmptyValue && field.required) {
          return {
            valid: false,
            errorMessage: 'This field is required',
            formSubmittable: false,
            validationTrigger: 'submit'
          };
        }
        
        // Check length constraints for edge cases
        if (field.attributes.maxLength && value.length > field.attributes.maxLength) {
          return {
            valid: false,
            errorMessage: `Maximum length is ${field.attributes.maxLength} characters`,
            formSubmittable: false,
            validationTrigger: 'input'
          };
        }
        
        return {
          valid: true,
          formSubmittable: true,
          validationTrigger: 'input'
        };
        
      case 'invalid':
        return {
          valid: false,
          errorMessage: this.getErrorMessage(field, value),
          formSubmittable: false,
          validationTrigger: 'input'
        };
        
      case 'boundary':
        // Boundary case outcomes are determined in the boundary test generation
        return {
          valid: true,
          formSubmittable: true,
          validationTrigger: 'input'
        };
        
      default:
        return {
          valid: false,
          formSubmittable: false,
          validationTrigger: 'input'
        };
    }
  }

  private getErrorMessage(field: FormField, value: string): string {
    if (value === '' && field.required) {
      return 'This field is required';
    }

    switch (field.type) {
      case 'email':
        return 'Please enter a valid email address';
      case 'url':
        return 'Please enter a valid URL';
      case 'number':
        return 'Please enter a valid number';
      case 'tel':
        return 'Please enter a valid phone number';
      case 'date':
        return 'Please enter a valid date';
      default:
        if (field.attributes.maxLength && value.length > field.attributes.maxLength) {
          return `Maximum length is ${field.attributes.maxLength} characters`;
        }
        if (field.attributes.minLength && value.length < field.attributes.minLength) {
          return `Minimum length is ${field.attributes.minLength} characters`;
        }
        return 'Please enter a valid value';
    }
  }
}