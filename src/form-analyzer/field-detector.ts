import { Page } from 'puppeteer';
import { FormField, FieldType, FieldAttributes, SelectOption } from '../utils/types';
import logger from '../utils/logger';

export class FieldDetector {
  constructor(private page: Page) {}

  async detectFormFields(): Promise<FormField[]> {
    logger.info('Detecting form fields...');

    const fields = await this.page.evaluate(() => {
      const formElements: any[] = [];
      
      // Function to extract label text from parent divs
      const extractLabelFromParent = (element: Element): string => {
        let current = element.parentElement;
        let labelTexts: string[] = [];
        
        // Walk up the DOM tree to collect text content from parent divs
        for (let i = 0; i < 5 && current; i++) { // Limit to 5 levels up
          if (current.tagName === 'DIV') {
            // Get text content but exclude text from child inputs
            const childInputs = current.querySelectorAll('input, select, textarea');
            let textContent = current.textContent || '';
            
            // Remove text from child inputs to get clean labels
            childInputs.forEach(childInput => {
              const inputValue = childInput instanceof HTMLInputElement ? childInput.value : '';
              if (inputValue && textContent.includes(inputValue)) {
                textContent = textContent.replace(inputValue, '');
              }
            });
            
            // Clean up the text
            const cleanText = textContent.trim()
              .replace(/\s+/g, ' ') // normalize whitespace
              .replace(/^\d+\.?\s*/, '') // remove leading numbers like "1.1", "1.2"
              .trim();
            
            if (cleanText && cleanText.length > 0 && cleanText.length < 200) {
              labelTexts.push(cleanText);
            }
          }
          current = current.parentElement;
        }
        
        // Return the most specific (closest) non-empty label
        return labelTexts.find(text => text.length > 0 && text.length < 100) || '';
      };

      // Function to check if element is in right panel (heuristic)
      const isInRightPanel = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        
        // Assume right panel is roughly the right half or more of the screen
        return rect.left > windowWidth * 0.3;
      };

      // Find all input, select, and textarea elements in the document
      const allInputs = document.querySelectorAll('input, select, textarea');
      
      allInputs.forEach((element, index) => {
        const tagName = element.tagName.toLowerCase();
        const type = element.getAttribute('type') || 'text';
        
        // Skip hidden fields, buttons, and elements not in right panel
        if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') {
          return;
        }

        // Check if element is in the right panel
        if (!isInRightPanel(element)) {
          return;
        }

        const id = element.id || `${tagName}_${index}`;
        const name = element.getAttribute('name') || '';
        const required = element.hasAttribute('required') || element.hasAttribute('aria-required');
        
        // Get label text from parent divs
        const label = extractLabelFromParent(element);

        // Generate a unique selector with proper CSS escaping
        let selector = '';
        if (element.id) {
          // Use CSS.escape if available, otherwise fallback to basic escaping
          try {
            const escapedId = CSS.escape(element.id);
            selector = `#${escapedId}`;
          } catch (e) {
            // Fallback: use attribute selector for problematic IDs
            selector = `[id="${element.id}"]`;
          }
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

        // Handle radio buttons - group them by name
        if (type === 'radio') {
          const radioGroup = document.querySelectorAll(`input[name="${name}"]`);
          const radioOptions: SelectOption[] = [];
          
          radioGroup.forEach(radio => {
            const radioElement = radio as HTMLInputElement;
            const radioLabel = extractLabelFromParent(radio);
            radioOptions.push({
              value: radioElement.value,
              text: radioLabel || radioElement.value,
              selected: radioElement.checked
            });
          });
          
          attributes.options = radioOptions;
        }

        // Determine field type
        let fieldType: string = type;
        if (tagName === 'select') {
          fieldType = 'select';
        } else if (tagName === 'textarea') {
          fieldType = 'textarea';
        }

        // Only add unique fields (avoid duplicates from radio button groups)
        const existingField = formElements.find(f => f.name === name && f.type === 'radio');
        if (type === 'radio' && existingField) {
          return; // Skip duplicate radio buttons
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
      const formSelector = forms.length > 0 ? 'form' : 'div-based form';
      
      return { title, formSelector };
    });

    return metadata;
  }
}