import { 
  TestData, 
  TestCase, 
  TestDataTemplate, 
  TestCaseTemplate, 
  SurveyField, 
  DetectionResult,
  TestDataSummary,
  GeneratorFunction 
} from '../types/types.js';
import { fieldTypeRegistry } from './field-type-registry.js';
import { logger } from '../utils/logger.js';

export class TestDataGenerator {
  private templates: Map<string, TestDataTemplate> = new Map();

  constructor() {
    this.initializeBuiltInTemplates();
  }

  private initializeBuiltInTemplates(): void {
    const builtInTemplates: TestDataTemplate[] = [
      {
        id: 'email_validation_v1',
        fieldType: 'email',
        version: '1.0.0',
        description: 'Standard email validation test cases',
        testCases: [
          {
            type: 'valid',
            valueType: 'static',
            value: 'test@example.com',
            description: 'Standard email format',
            weight: 10
          },
          {
            type: 'valid',
            valueType: 'static',
            value: 'user.name+tag@domain.co.uk',
            description: 'Complex email with plus sign and subdomain',
            weight: 8
          },
          {
            type: 'valid',
            valueType: 'static',
            value: 'firstname.lastname@company.org',
            description: 'Professional email format',
            weight: 9
          },
          {
            type: 'edge',
            valueType: 'static',
            value: 'test+filter@very-long-domain-name.museum',
            description: 'Email with long domain and unusual TLD',
            weight: 6
          },
          {
            type: 'edge',
            valueType: 'static',
            value: 'user@subdomain.example.co.uk',
            description: 'Multi-level domain email',
            weight: 7
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['email', 'validation', 'contact']
        }
      },
      {
        id: 'phone_validation_v1',
        fieldType: 'phone',
        version: '1.0.0',
        description: 'International phone number test cases',
        testCases: [
          {
            type: 'valid',
            valueType: 'static',
            value: '+1-555-123-4567',
            description: 'US phone number with dashes',
            weight: 10
          },
          {
            type: 'valid',
            valueType: 'static',
            value: '+44 20 7946 0958',
            description: 'UK phone number',
            weight: 9
          },
          {
            type: 'valid',
            valueType: 'static',
            value: '(555) 123-4567',
            description: 'US phone with parentheses',
            weight: 8
          },
          {
            type: 'edge',
            valueType: 'static',
            value: '+86 138 0013 8000',
            description: 'Chinese mobile number',
            weight: 6
          },
          {
            type: 'boundary',
            valueType: 'static',
            value: '555.123.4567',
            description: 'Phone with dots',
            weight: 7
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['phone', 'contact', 'international']
        }
      },
      {
        id: 'name_validation_v1',
        fieldType: 'name',
        version: '1.0.0',
        description: 'Personal name test cases',
        testCases: [
          {
            type: 'valid',
            valueType: 'static',
            value: 'John Smith',
            description: 'Common Western name',
            weight: 10
          },
          {
            type: 'valid',
            valueType: 'static',
            value: 'María José García-López',
            description: 'Hispanic name with accents and hyphen',
            weight: 8
          },
          {
            type: 'valid',
            valueType: 'static',
            value: '李小明',
            description: 'Chinese name',
            weight: 7
          },
          {
            type: 'edge',
            valueType: 'static',
            value: 'Jean-Luc O\'Connor-MacDonald III',
            description: 'Complex name with punctuation and suffix',
            weight: 5
          },
          {
            type: 'boundary',
            valueType: 'static',
            value: 'A',
            description: 'Single character name',
            weight: 4
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['name', 'personal', 'identity']
        }
      },
      {
        id: 'age_validation_v1',
        fieldType: 'age',
        version: '1.0.0',
        description: 'Age field test cases',
        testCases: [
          {
            type: 'valid',
            valueType: 'static',
            value: '25',
            description: 'Typical adult age',
            weight: 10
          },
          {
            type: 'boundary',
            valueType: 'static',
            value: '18',
            description: 'Legal adult age',
            weight: 9
          },
          {
            type: 'boundary',
            valueType: 'static',
            value: '65',
            description: 'Retirement age',
            weight: 8
          },
          {
            type: 'edge',
            valueType: 'static',
            value: '100',
            description: 'Centenarian age',
            weight: 6
          },
          {
            type: 'valid',
            valueType: 'static',
            value: '45',
            description: 'Middle age',
            weight: 8
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['age', 'demographic', 'number']
        }
      },
      {
        id: 'date_validation_v1',
        fieldType: 'date',
        version: '1.0.0',
        description: 'Date field test cases',
        testCases: [
          {
            type: 'valid',
            valueType: 'static',
            value: '2024-01-15',
            description: 'ISO date format',
            weight: 10
          },
          {
            type: 'valid',
            valueType: 'static',
            value: '01/15/2024',
            description: 'US date format',
            weight: 9
          },
          {
            type: 'valid',
            valueType: 'static',
            value: '15/01/2024',
            description: 'European date format',
            weight: 9
          },
          {
            type: 'edge',
            valueType: 'static',
            value: '02/29/2024',
            description: 'Leap year date',
            weight: 7
          },
          {
            type: 'boundary',
            valueType: 'static',
            value: '12/31/2023',
            description: 'Year end date',
            weight: 6
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['date', 'temporal', 'format']
        }
      },
      {
        id: 'rating_scale_v1',
        fieldType: 'rating_scale',
        version: '1.0.0',
        description: 'Rating scale test cases (position-based)',
        testCases: [
          {
            type: 'boundary',
            valueType: 'static',
            value: '0',
            description: 'First option (lowest rating)',
            weight: 10,
            position: 0
          },
          {
            type: 'valid',
            valueType: 'static',
            value: '1',
            description: 'Second option',
            weight: 8,
            position: 1
          },
          {
            type: 'valid',
            valueType: 'static',
            value: '2',
            description: 'Middle option',
            weight: 9,
            position: 2
          },
          {
            type: 'boundary',
            valueType: 'static',
            value: '-1',
            description: 'Last option (highest rating)',
            weight: 10,
            position: -1
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['rating', 'scale', 'position', 'choice']
        }
      },
      {
        id: 'yes_no_v1',
        fieldType: 'yes_no',
        version: '1.0.0',
        description: 'Yes/No question test cases',
        testCases: [
          {
            type: 'valid',
            valueType: 'static',
            value: '0',
            description: 'First option (typically Yes)',
            weight: 10,
            position: 0
          },
          {
            type: 'valid',
            valueType: 'static',
            value: '1',
            description: 'Second option (typically No)',
            weight: 10,
            position: 1
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['yes_no', 'binary', 'choice']
        }
      },
      {
        id: 'general_text_v1',
        fieldType: 'general_text',
        version: '1.0.0',
        description: 'General text input test cases',
        testCases: [
          {
            type: 'valid',
            valueType: 'static',
            value: 'Sample text response',
            description: 'Standard text input',
            weight: 10
          },
          {
            type: 'valid',
            valueType: 'static',
            value: 'Test input with numbers 123',
            description: 'Text with numbers',
            weight: 8
          },
          {
            type: 'edge',
            valueType: 'static',
            value: 'Spëcial chäracters & symbols!',
            description: 'Text with special characters',
            weight: 6
          },
          {
            type: 'boundary',
            valueType: 'static',
            value: 'A',
            description: 'Single character',
            weight: 5
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['text', 'general', 'input']
        }
      },
      {
        id: 'long_text_v1',
        fieldType: 'long_text',
        version: '1.0.0',
        description: 'Textarea/long text test cases',
        testCases: [
          {
            type: 'valid',
            valueType: 'static',
            value: 'This is a sample response for a textarea field.',
            description: 'Short paragraph',
            weight: 10
          },
          {
            type: 'valid',
            valueType: 'static',
            value: 'This is a longer response that spans multiple sentences. It demonstrates how users might provide detailed feedback or answers to open-ended questions.',
            description: 'Medium paragraph',
            weight: 9
          },
          {
            type: 'edge',
            valueType: 'static',
            value: 'This is an extended response that includes multiple paragraphs.\\n\\nIt demonstrates how users might structure their answers with line breaks and provide comprehensive feedback.\\n\\nThis type of input is common in survey forms that ask for detailed explanations or comments.',
            description: 'Multi-paragraph response',
            weight: 7
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['textarea', 'long_text', 'paragraph']
        }
      },
      {
        id: 'vas_slider_v1',
        fieldType: 'VAS',
        version: '1.0.0',
        description: 'Visual Analog Scale (VAS) slider test cases',
        testCases: [
          {
            type: 'boundary',
            valueType: 'static',
            value: 'low',
            description: 'Low end of the VAS scale',
            weight: 10
          },
          {
            type: 'valid',
            valueType: 'static',
            value: 'middle',
            description: 'Middle of the VAS scale',
            weight: 10
          },
          {
            type: 'boundary',
            valueType: 'static',
            value: 'high',
            description: 'High end of the VAS scale',
            weight: 10
          },
          {
            type: 'valid',
            valueType: 'static',
            value: 25,
            description: '25% position on VAS scale',
            weight: 8
          },
          {
            type: 'valid',
            valueType: 'static',
            value: 75,
            description: '75% position on VAS scale',
            weight: 8
          }
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: 'system',
          tags: ['VAS', 'slider', 'visual_analog', 'scale']
        }
      }
    ];

    builtInTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });

    logger.info(`Initialized ${builtInTemplates.length} built-in test data templates`);
  }

  generateTestData(field: SurveyField): TestData {
    const detectionResult = fieldTypeRegistry.detectFieldType(
      field.questionText,
      field.inputType,
      field.choices
    );

    logger.debug(`Detected field type: ${detectionResult.fieldType} (confidence: ${detectionResult.confidence})`);

    const testCases = this.generateTestCases(field, detectionResult);
    const summary = this.calculateSummary(testCases);

    return {
      detectedType: detectionResult.fieldType,
      confidence: detectionResult.confidence,
      detectionMethod: detectionResult.method,
      fallbackType: detectionResult.fallback,
      generatedAt: new Date().toISOString(),
      testCases,
      summary,
      metadata: {
        patterns: detectionResult.matchedPatterns,
        templateUsed: detectionResult.template
      }
    };
  }

  private generateTestCases(field: SurveyField, detection: DetectionResult): TestCase[] {
    const testCases: TestCase[] = [];

    // Handle radio buttons and dropdowns with position-based selection
    if ((field.inputType === 'radio' || field.inputType === 'dropdown') && field.choices) {
      return this.generateChoiceBasedTestCases(field, detection);
    }

    // Handle VAS sliders specifically
    if (field.inputType === 'VAS') {
      return this.generateVASTestCases(field, detection);
    }

    // Use template-based generation for other field types
    const templateId = detection.template || `${detection.fieldType}_validation_v1`;
    const template = this.templates.get(templateId) || this.templates.get('general_text_v1')!;

    template.testCases.forEach((templateCase, index) => {
      if (this.shouldIncludeTestCase(templateCase, field)) {
        const testCase = this.createTestCaseFromTemplate(templateCase, field, index);
        testCases.push(testCase);
      }
    });

    return testCases;
  }

  private generateVASTestCases(field: SurveyField, detection: DetectionResult): TestCase[] {
    const testCases: TestCase[] = [];
    
    // Use VAS-specific template
    const template = this.templates.get('vas_slider_v1')!;
    
    template.testCases.forEach((templateCase, index) => {
      const testCase = this.createTestCaseFromTemplate(templateCase, field, index);
      testCases.push(testCase);
    });

    return testCases;
  }

  private generateChoiceBasedTestCases(field: SurveyField, detection: DetectionResult): TestCase[] {
    if (!field.choices || field.choices.length === 0) {
      return [];
    }

    const testCases: TestCase[] = [];
    const choices = field.choices;

    // Generate test cases for each choice position only
    choices.forEach((choice, index) => {
      testCases.push({
        id: `choice_${field.questionNumber.replace('.', '_')}_${index}`,
        type: 'valid',
        value: index.toString(),
        position: index,
        description: `Option ${index + 1}: "${choice}"`,
        source: 'generated',
        provenance: {
          createdBy: 'system',
          createdAt: new Date().toISOString(),
          generator: {
            algorithm: 'choice_position_generator',
            version: '1.0.0',
            template: detection.template || 'choice_based_v1',
            confidence: detection.confidence
          },
          modifications: []
        },
        status: 'draft',
        quality: {
          confidence: detection.confidence,
          reviewCount: 0
        }
      });
    });

    return testCases;
  }

  private shouldIncludeTestCase(template: TestCaseTemplate, field: SurveyField): boolean {
    if (!template.conditions) {
      return true;
    }

    const conditions = template.conditions;

    // Check input type condition
    if (conditions.inputType && !conditions.inputType.includes(field.inputType)) {
      return false;
    }

    // Check choice count condition
    if (conditions.choiceCount && field.choices) {
      const choiceCount = field.choices.length;
      if (conditions.choiceCount.min && choiceCount < conditions.choiceCount.min) {
        return false;
      }
      if (conditions.choiceCount.max && choiceCount > conditions.choiceCount.max) {
        return false;
      }
    }

    // Check required condition
    if (conditions.required !== undefined && conditions.required !== field.isRequired) {
      return false;
    }

    return true;
  }

  private createTestCaseFromTemplate(
    template: TestCaseTemplate,
    field: SurveyField,
    index: number
  ): TestCase {
    let value: string | number;

    if (template.valueType === 'static') {
      value = template.value as string | number;
    } else if (template.valueType === 'generated') {
      // Handle generator functions (future enhancement)
      value = this.executeGenerator(template.value as GeneratorFunction, field);
    } else {
      // Pattern-based generation (future enhancement)
      value = template.value as string | number;
    }

    return {
      id: `gen_${field.questionNumber.replace('.', '_')}_${template.type}_${index}`,
      type: template.type,
      value,
      position: template.position,
      description: template.description,
      source: 'generated',
      provenance: {
        createdBy: 'system',
        createdAt: new Date().toISOString(),
        generator: {
          algorithm: 'template_based_generator',
          version: '1.0.0',
          template: `${field.inputType}_${template.type}`,
          confidence: template.weight * 10 // Convert weight to confidence
        },
        modifications: []
      },
      status: 'draft',
      quality: {
        confidence: template.weight * 10,
        reviewCount: 0
      }
    };
  }

  private executeGenerator(generator: GeneratorFunction, field: SurveyField): string {
    // Placeholder for future generator function implementation
    logger.debug(`Executing generator: ${generator.name}`);
    return 'Generated value';
  }

  private calculateSummary(testCases: TestCase[]): TestDataSummary {
    return {
      totalTestCases: testCases.length,
      generatedCount: testCases.filter(tc => tc.source === 'generated').length,
      humanCount: testCases.filter(tc => tc.source === 'human').length,
      hybridCount: testCases.filter(tc => tc.source === 'hybrid').length,
      approvedCount: testCases.filter(tc => tc.status === 'approved').length,
      pendingReviewCount: testCases.filter(tc => tc.status === 'draft' || tc.status === 'needs_review').length
    };
  }

  registerTemplate(template: TestDataTemplate): void {
    this.templates.set(template.id, template);
    logger.debug(`Registered test data template: ${template.id}`);
  }

  getTemplateStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    this.templates.forEach((template, id) => {
      stats[id] = {
        fieldType: template.fieldType,
        version: template.version,
        testCaseCount: template.testCases.length,
        tags: template.metadata.tags
      };
    });

    return {
      totalTemplates: this.templates.size,
      templates: stats
    };
  }
}

// Export singleton instance
export const testDataGenerator = new TestDataGenerator();