import { FieldTypePattern, DetectionResult, UnknownField } from '../types/types.js';
import { logger } from '../utils/logger.js';

export class FieldTypeRegistry {
  private patterns: Map<string, FieldTypePattern> = new Map();
  private unknownFields: UnknownField[] = [];

  constructor() {
    this.initializeBuiltInPatterns();
  }

  private initializeBuiltInPatterns(): void {
    const builtInPatterns: FieldTypePattern[] = [
      {
        id: 'email_detection_v1',
        name: 'Email Field Detection',
        priority: 90,
        patterns: {
          questionText: [
            /\b(email|e-mail|correo|メール|邮件)\b/i,
            /\b(electronic\s+mail|mail\s+address)\b/i
          ],
          inputAttributes: {
            type: /^(email|text)$/i
          }
        },
        testDataTemplate: 'email_validation_v1',
        confidence: 95,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        usage: {
          totalMatches: 0,
          successRate: 1.0
        }
      },
      {
        id: 'phone_detection_v1',
        name: 'Phone Number Detection',
        priority: 85,
        patterns: {
          questionText: [
            /\b(phone|telephone|telefono|电话|téléphone)\b/i,
            /\b(mobile|cell|contact\s+number)\b/i
          ],
          inputAttributes: {
            type: /^(tel|text)$/i
          }
        },
        testDataTemplate: 'phone_validation_v1',
        confidence: 90,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        usage: {
          totalMatches: 0,
          successRate: 1.0
        }
      },
      {
        id: 'name_detection_v1',
        name: 'Name Field Detection',
        priority: 80,
        patterns: {
          questionText: [
            /\b(name|nom|nombre|姓名|이름)\b/i,
            /\b(first\s+name|last\s+name|full\s+name)\b/i,
            /\b(given\s+name|family\s+name|surname)\b/i
          ]
        },
        testDataTemplate: 'name_validation_v1',
        confidence: 85,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        usage: {
          totalMatches: 0,
          successRate: 1.0
        }
      },
      {
        id: 'age_detection_v1',
        name: 'Age Field Detection',
        priority: 85,
        patterns: {
          questionText: [
            /\b(age|edad|年齢|ages?)\b/i,
            /\b(how\s+old|years?\s+old)\b/i,
            /\b(birth\s+year|year\s+born)\b/i
          ],
          inputAttributes: {
            type: /^(number|text)$/i
          }
        },
        testDataTemplate: 'age_validation_v1',
        confidence: 90,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        usage: {
          totalMatches: 0,
          successRate: 1.0
        }
      },
      {
        id: 'date_detection_v1',
        name: 'Date Field Detection',
        priority: 88,
        patterns: {
          questionText: [
            /\b(date|fecha|日付|when)\b/i,
            /\b(birth\s*date|date\s+of\s+birth|dob)\b/i,
            /\b(appointment|meeting|event)\b/i
          ],
          inputAttributes: {
            type: /^(date|text)$/i
          }
        },
        testDataTemplate: 'date_validation_v1',
        confidence: 92,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        usage: {
          totalMatches: 0,
          successRate: 1.0
        }
      },
      {
        id: 'address_detection_v1',
        name: 'Address Field Detection',
        priority: 75,
        patterns: {
          questionText: [
            /\b(address|direccion|住所|street)\b/i,
            /\b(home\s+address|mailing\s+address)\b/i,
            /\b(zip\s+code|postal\s+code|postcode)\b/i
          ]
        },
        testDataTemplate: 'address_validation_v1',
        confidence: 80,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        usage: {
          totalMatches: 0,
          successRate: 1.0
        }
      },
      {
        id: 'rating_scale_detection_v1',
        name: 'Rating Scale Detection',
        priority: 70,
        patterns: {
          questionText: [
            /\b(rate|rating|scale|score)\b/i,
            /\b(satisfied|satisfaction|satisfecho)\b/i,
            /\b(likely|recommend|quality)\b/i,
            /\b(1\s*-\s*10|1\s+to\s+10|scale\s+of)\b/i
          ],
          contextClues: [
            /\b(strongly\s+agree|agree|disagree)\b/i,
            /\b(excellent|good|fair|poor)\b/i
          ]
        },
        testDataTemplate: 'rating_scale_v1',
        confidence: 75,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        usage: {
          totalMatches: 0,
          successRate: 1.0
        }
      },
      {
        id: 'yes_no_detection_v1',
        name: 'Yes/No Question Detection',
        priority: 65,
        patterns: {
          questionText: [
            /\b(yes|no|si|oui|non|はい|いいえ)\b/i,
            /\b(do\s+you|are\s+you|have\s+you)\b/i,
            /\b(true|false|verdadero|falso)\b/i
          ]
        },
        testDataTemplate: 'yes_no_v1',
        confidence: 85,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        usage: {
          totalMatches: 0,
          successRate: 1.0
        }
      },
      {
        id: 'weight_detection_v1',
        name: 'Weight Field Detection',
        priority: 87,
        patterns: {
          questionText: [
            /\b(weight|weigh|peso|gewicht|poids|体重)\b/i,
            /\b(how\s+much\s+do\s+you\s+weigh)\b/i,
            /\b(body\s+weight|current\s+weight)\b/i,
            /\b(kg|kilograms?|lbs?|pounds?)\b/i
          ],
          inputAttributes: {
            type: /^(text|number|autocomplete_dropdown)$/i
          }
        },
        testDataTemplate: 'weight_validation_v1',
        confidence: 88,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        usage: {
          totalMatches: 0,
          successRate: 1.0
        }
      }
    ];

    builtInPatterns.forEach(pattern => {
      this.patterns.set(pattern.id, pattern);
    });

    logger.info(`Initialized ${builtInPatterns.length} built-in field type patterns`);
  }

  registerPattern(pattern: FieldTypePattern): void {
    this.patterns.set(pattern.id, pattern);
    logger.debug(`Registered pattern: ${pattern.name} (${pattern.id})`);
  }

  detectFieldType(
    questionText: string,
    inputType: string,
    choices?: string[],
    context?: any
  ): DetectionResult {
    const results: Array<{ pattern: FieldTypePattern; confidence: number; matches: string[] }> = [];

    // Sort patterns by priority (higher first)
    const sortedPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.priority - a.priority);

    for (const pattern of sortedPatterns) {
      const matches: string[] = [];
      let confidence = 0;

      // Check question text patterns
      for (const regex of pattern.patterns.questionText) {
        const match = questionText.match(regex);
        if (match) {
          matches.push(`questionText: ${match[0]}`);
          confidence += pattern.confidence * 0.8; // 80% weight for question text
        }
      }

      // Check input attributes if provided
      if (pattern.patterns.inputAttributes) {
        for (const [attr, regex] of Object.entries(pattern.patterns.inputAttributes)) {
          if (attr === 'type' && regex.test(inputType)) {
            matches.push(`inputType: ${inputType}`);
            confidence += pattern.confidence * 0.6; // 60% weight for input type
          }
        }
      }

      // Check context clues if provided
      if (pattern.patterns.contextClues && choices) {
        const allChoicesText = choices.join(' ');
        for (const regex of pattern.patterns.contextClues) {
          const match = allChoicesText.match(regex);
          if (match) {
            matches.push(`contextClue: ${match[0]}`);
            confidence += pattern.confidence * 0.4; // 40% weight for context
          }
        }
      }

      if (matches.length > 0) {
        // Normalize confidence (prevent over 100)
        confidence = Math.min(confidence, 100);
        results.push({ pattern, confidence, matches });

        // Update usage statistics
        pattern.usage = pattern.usage || { totalMatches: 0, successRate: 1.0 };
        pattern.usage.totalMatches++;
        pattern.usage.lastUsed = new Date().toISOString();
      }
    }

    // Return the best match
    if (results.length > 0) {
      const best = results.reduce((prev, current) => 
        current.confidence > prev.confidence ? current : prev
      );

      return {
        fieldType: best.pattern.testDataTemplate.replace('_validation_v1', '').replace('_v1', ''),
        confidence: best.confidence,
        method: 'pattern_match',
        matchedPatterns: best.matches,
        template: best.pattern.testDataTemplate
      };
    }

    // Fallback based on input type
    const fallbackType = this.getFallbackType(inputType, choices);
    return {
      fieldType: fallbackType,
      confidence: 50,
      method: 'fallback',
      matchedPatterns: [],
      fallback: `inputType:${inputType}`
    };
  }

  private getFallbackType(inputType: string, choices?: string[]): string {
    if (choices && choices.length > 0) {
      if (choices.length <= 5 && choices.some(c => /^(yes|no|true|false)$/i.test(c))) {
        return 'yes_no';
      }
      if (choices.length >= 3 && choices.length <= 10) {
        return 'rating_scale';
      }
      return 'multiple_choice';
    }

    switch (inputType.toLowerCase()) {
      case 'vas':
        return 'VAS';
      case 'email':
        return 'email';
      case 'tel':
      case 'phone':
        return 'phone';
      case 'date':
        return 'date';
      case 'number':
        return 'number';
      case 'url':
        return 'url';
      case 'textarea':
        return 'long_text';
      case 'radio':
        return 'radio_group';
      case 'checkbox':
        return 'checkbox_group';
      case 'dropdown':
      case 'select':
        return 'dropdown';
      case 'autocomplete_dropdown':
        return 'weight'; // Default to weight for autocomplete dropdowns
      default:
        return 'general_text';
    }
  }

  recordUnknownField(field: UnknownField): void {
    this.unknownFields.push(field);
    logger.debug(`Recorded unknown field: ${field.questionText.substring(0, 50)}...`);
  }

  exportUnknownFields(): UnknownField[] {
    return [...this.unknownFields];
  }

  getPatternStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    this.patterns.forEach((pattern, id) => {
      stats[id] = {
        name: pattern.name,
        priority: pattern.priority,
        confidence: pattern.confidence,
        usage: pattern.usage
      };
    });

    return {
      totalPatterns: this.patterns.size,
      unknownFieldsCount: this.unknownFields.length,
      patterns: stats
    };
  }

  clearUnknownFields(): void {
    this.unknownFields = [];
    logger.info('Cleared unknown fields cache');
  }
}

// Export singleton instance
export const fieldTypeRegistry = new FieldTypeRegistry();