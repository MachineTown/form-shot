import { FieldType, FormField } from '../utils/types';

export class EdgeCaseStrategies {
  static getTestValues(field: FormField): { normal: string[], edge: string[], invalid: string[] } {
    const { type, attributes } = field;
    
    switch (type) {
      case 'text':
        return this.getTextTestValues(attributes);
      case 'email':
        return this.getEmailTestValues(attributes);
      case 'password':
        return this.getPasswordTestValues(attributes);
      case 'number':
        return this.getNumberTestValues(attributes);
      case 'tel':
        return this.getTelTestValues(attributes);
      case 'url':
        return this.getUrlTestValues(attributes);
      case 'date':
        return this.getDateTestValues();
      case 'textarea':
        return this.getTextareaTestValues(attributes);
      case 'select':
        return this.getSelectTestValues(field);
      case 'checkbox':
      case 'radio':
        return { normal: ['true', 'false'], edge: [], invalid: [] };
      default:
        return this.getTextTestValues(attributes);
    }
  }

  private static getTextTestValues(attributes: any) {
    const maxLength = attributes.maxLength || 100;
    const minLength = attributes.minLength || 0;
    
    return {
      normal: [
        'John Doe',
        'Valid Text',
        'Sample Input'
      ],
      edge: [
        '', // Empty string
        'a'.repeat(minLength), // Minimum length
        'a'.repeat(maxLength), // Maximum length
        'Special!@#$%^&*()Characters',
        '   Leading and trailing spaces   ',
        'Unicode: 你好 🌟 émojis'
      ],
      invalid: [
        'a'.repeat(maxLength + 1), // Exceeds max length
        minLength > 0 ? 'a'.repeat(minLength - 1) : '', // Below minimum (if applicable)
        '\x00\x01\x02', // Control characters
        '<script>alert("xss")</script>' // XSS attempt
      ]
    };
  }

  private static getEmailTestValues(attributes: any) {
    return {
      normal: [
        'user@example.com',
        'test.email@domain.co.uk',
        'valid.email+tag@company.org'
      ],
      edge: [
        'a@b.co', // Minimum valid email
        'very.long.email.address@very.long.domain.name.com', // Long email
        'user+tag@example.com', // With plus sign
        'user.name@example-domain.com' // With hyphen
      ],
      invalid: [
        'invalid-email', // No @ symbol
        '@example.com', // Missing local part
        'user@', // Missing domain
        'user@.com', // Invalid domain
        'user space@example.com', // Space in email
        'user@example', // Missing TLD
        'user@example..com' // Double dot
      ]
    };
  }

  private static getPasswordTestValues(attributes: any) {
    const minLength = attributes.minLength || 8;
    const maxLength = attributes.maxLength || 128;
    
    return {
      normal: [
        'SecurePass123!',
        'MyPassword@2024',
        'ComplexP@ssw0rd'
      ],
      edge: [
        'a'.repeat(minLength), // Minimum length
        'a'.repeat(maxLength), // Maximum length
        '!@#$%^&*()_+-={}[]|;:,.<>?', // Special characters only
        'ALLUPPERCASE123!',
        'alllowercase123!',
        '1234567890!@#$%' // Numbers and symbols
      ],
      invalid: [
        '', // Empty password
        minLength > 1 ? 'a'.repeat(minLength - 1) : 'a', // Too short
        'a'.repeat(maxLength + 1), // Too long
        'password', // Common weak password
        '123456789' // Numeric only weak password
      ]
    };
  }

  private static getNumberTestValues(attributes: any) {
    const min = attributes.min ? parseFloat(attributes.min) : -1000;
    const max = attributes.max ? parseFloat(attributes.max) : 1000;
    const step = attributes.step ? parseFloat(attributes.step) : 1;
    
    return {
      normal: [
        '0',
        '42',
        Math.floor((min + max) / 2).toString()
      ],
      edge: [
        min.toString(), // Minimum value
        max.toString(), // Maximum value
        '0', // Zero
        step.toString(), // Step value
        (min + step).toString() // Min + step
      ],
      invalid: [
        (min - 1).toString(), // Below minimum
        (max + 1).toString(), // Above maximum
        'abc', // Non-numeric
        '12.34.56', // Invalid decimal
        '', // Empty
        ' 123 ' // With spaces
      ]
    };
  }

  private static getTelTestValues(attributes: any) {
    return {
      normal: [
        '+1-555-123-4567',
        '(555) 123-4567',
        '555.123.4567'
      ],
      edge: [
        '+44 20 7946 0958', // International format
        '1234567890', // 10 digits
        '+1234567890123456', // Very long international
        '123-456-7890 ext 123' // With extension
      ],
      invalid: [
        'not-a-phone', // Non-numeric text
        '123', // Too short
        '++123456789', // Invalid format
        '', // Empty
        '123-456-78901234567890' // Too long
      ]
    };
  }

  private static getUrlTestValues(attributes: any) {
    return {
      normal: [
        'https://www.example.com',
        'http://example.org',
        'https://subdomain.example.co.uk/path'
      ],
      edge: [
        'ftp://ftp.example.com', // Different protocol
        'https://localhost:8080', // With port
        'https://example.com/path?query=value&other=data', // With query params
        'https://example.com/very/long/path/that/goes/deep' // Long path
      ],
      invalid: [
        'not-a-url', // Not a URL
        'http://', // Incomplete URL
        'https://invalid space.com', // Space in URL
        'example.com', // Missing protocol
        '', // Empty
        'javascript:alert("xss")' // Potentially malicious
      ]
    };
  }

  private static getDateTestValues() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return {
      normal: [
        today.toISOString().split('T')[0], // Today
        '2024-06-15', // Fixed valid date
        '1990-12-25' // Past date
      ],
      edge: [
        '1900-01-01', // Very old date
        '2099-12-31', // Future date
        yesterday.toISOString().split('T')[0], // Yesterday
        tomorrow.toISOString().split('T')[0] // Tomorrow
      ],
      invalid: [
        '2024-02-30', // Invalid date (Feb 30)
        '2024-13-01', // Invalid month
        '2024-12-32', // Invalid day
        'not-a-date', // Non-date text
        '24-06-15', // Wrong format
        '' // Empty
      ]
    };
  }

  private static getTextareaTestValues(attributes: any) {
    const maxLength = attributes.maxLength || 1000;
    
    return {
      normal: [
        'This is a normal textarea content with multiple words.',
        'Line 1\nLine 2\nLine 3',
        'A longer paragraph with more detailed content that spans multiple sentences and provides a realistic example of textarea input.'
      ],
      edge: [
        '', // Empty
        'Single word',
        'a'.repeat(maxLength), // Maximum length
        'Special characters: !@#$%^&*()_+-={}[]|\\:";\'<>?,./',
        'Unicode content: 你好世界 🌍 émojis and symbols ✓ ✗ ★',
        'Multiple\n\nLine\n\nBreaks\n\nWith\n\nSpacing'
      ],
      invalid: [
        'a'.repeat(maxLength + 1), // Exceeds max length
        '\x00\x01\x02Control characters',
        '<script>alert("XSS attempt")</script>',
        '<?xml version="1.0"?><root>XML content</root>'
      ]
    };
  }

  private static getSelectTestValues(field: FormField) {
    const options = field.attributes.options || [];
    
    if (options.length === 0) {
      return { normal: [], edge: [], invalid: ['invalid-option'] };
    }
    
    return {
      normal: options.slice(0, 2).map(opt => opt.value), // First few valid options
      edge: [
        options[0]?.value || '', // First option
        options[options.length - 1]?.value || '', // Last option
        '' // Empty selection
      ],
      invalid: [
        'non-existent-option', // Option that doesn't exist
        '999999', // Numeric that doesn't exist
        '<script>alert("xss")</script>' // XSS attempt
      ]
    };
  }
}