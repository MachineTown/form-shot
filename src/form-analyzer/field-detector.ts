import { Page } from 'puppeteer';
import { FormField, FieldType, FieldAttributes, SelectOption } from '../utils/types';
import logger from '../utils/logger';

export class FieldDetector {
  constructor(private page: Page) {}

  async detectFormFields(): Promise<FormField[]> {
    logger.info('Detecting form fields...');

    const fields = await this.page.evaluate(() => {
      const formElements: any[] = [];
      
      // Find all forms on the page
      const forms = document.querySelectorAll('form');
      
      forms.forEach((form, formIndex) => {
        // Get all input, select, and textarea elements within this form
        const inputs = form.querySelectorAll('input, select, textarea, button');
        
        inputs.forEach((element, index) => {
          const tagName = element.tagName.toLowerCase();
          const type = element.getAttribute('type') || 'text';
          
          // Skip hidden fields and buttons we don't want to test
          if (type === 'hidden' || type === 'submit' || type === 'button') {
            return;
          }

          const id = element.id || `${tagName}_${formIndex}_${index}`;
          const name = element.getAttribute('name') || '';
          const required = element.hasAttribute('required');
          
          // Get label text
          let label = '';
          const labelElement = document.querySelector(`label[for="${element.id}"]`) ||
                              element.closest('label') ||
                              element.previousElementSibling?.tagName === 'LABEL' ? element.previousElementSibling : null;
          
          if (labelElement) {
            label = labelElement.textContent?.trim() || '';
          }

          // Generate a unique selector
          let selector = '';
          if (element.id) {
            selector = `#${element.id}`;
          } else if (name) {
            selector = `[name="${name}"]`;
          } else {
            selector = `${tagName}:nth-of-type(${index + 1})`;
          }

          // Get field attributes
          const attributes: any = {
            maxLength: element.getAttribute('maxlength') ? parseInt(element.getAttribute('maxlength')!) : undefined,
            minLength: element.getAttribute('minlength') ? parseInt(element.getAttribute('minlength')!) : undefined,
            min: element.getAttribute('min') || undefined,
            max: element.getAttribute('max') || undefined,
            step: element.getAttribute('step') || undefined,
            pattern: element.getAttribute('pattern') || undefined,
            placeholder: element.getAttribute('placeholder') || undefined,
            autocomplete: element.getAttribute('autocomplete') || undefined,
            multiple: element.hasAttribute('multiple'),
            accept: element.getAttribute('accept') || undefined
          };

          // Handle select options
          if (tagName === 'select') {
            const options: SelectOption[] = [];
            const selectElement = element as HTMLSelectElement;
            
            Array.from(selectElement.options).forEach(option => {
              options.push({
                value: option.value,
                text: option.text,
                selected: option.selected
              });
            });
            
            attributes.options = options;
          }

          // Determine field type
          let fieldType: string = type;
          if (tagName === 'select') {
            fieldType = 'select';
          } else if (tagName === 'textarea') {
            fieldType = 'textarea';
          }

          formElements.push({
            id,
            selector,
            type: fieldType,
            name,
            label,
            required,
            attributes
          });
        });
      });

      return formElements;
    });

    logger.info(`Detected ${fields.length} form fields`);
    return fields.map(field => this.sanitizeField(field));
  }

  private sanitizeField(field: any): FormField {
    // Clean up attributes by removing undefined values
    const cleanAttributes: FieldAttributes = {};
    
    Object.keys(field.attributes).forEach(key => {
      if (field.attributes[key] !== undefined && field.attributes[key] !== null) {
        cleanAttributes[key as keyof FieldAttributes] = field.attributes[key];
      }
    });

    return {
      id: field.id,
      selector: field.selector,
      type: field.type as FieldType,
      name: field.name,
      label: field.label,
      required: field.required,
      attributes: cleanAttributes
    };
  }

  async getFormMetadata(): Promise<{ title: string; formSelector?: string }> {
    const metadata = await this.page.evaluate(() => {
      const title = document.title || 'Untitled Form';
      const forms = document.querySelectorAll('form');
      const formSelector = forms.length > 0 ? 'form' : undefined;
      
      return { title, formSelector };
    });

    return metadata;
  }
}