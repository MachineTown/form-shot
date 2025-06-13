// Quick debug script to check what the first form actually is
const { PuppeteerManager } = require('./dist/browser/puppeteer-manager');
const { FormResetService } = require('./dist/form-analyzer/form-reset-service');

async function debugFirstForm() {
  const puppeteerManager = new PuppeteerManager();
  const formResetService = new FormResetService();
  
  try {
    console.log('Launching browser...');
    await puppeteerManager.launch();
    
    console.log('Navigating to EQ-5D survey...');
    await puppeteerManager.navigateToPage('https://data.castoredc.com/survey/GTP6T36B');
    
    // Wait a bit for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Checking initial state...');
    const page = puppeteerManager.getPage();
    
    // Check what navigation buttons are present initially
    const initialButtons = await page.evaluate(() => {
      const surveyBodyContainer = document.querySelector('#survey-body-container');
      if (!surveyBodyContainer) return { error: 'No survey body container' };
      
      const navigationArea = surveyBodyContainer.nextElementSibling;
      if (!navigationArea) return { error: 'No navigation area' };
      
      const buttons = Array.from(navigationArea.querySelectorAll('button'));
      return buttons.map(btn => ({
        text: btn.textContent?.trim(),
        disabled: btn.disabled,
        classes: btn.className
      }));
    });
    
    console.log('Initial navigation buttons:', JSON.stringify(initialButtons, null, 2));
    
    // Check current form info
    const currentForm = await page.evaluate(() => {
      const container = document.querySelector('#survey-body-container');
      if (!container) return { error: 'No container' };
      
      // Get title and short name
      const allPs = container.querySelectorAll('p');
      let formTitleP = null;
      
      for (const p of allPs) {
        const parent = p.parentElement;
        if (parent && parent.querySelector('h3')) {
          formTitleP = p;
          break;
        }
      }
      
      const title = formTitleP?.textContent?.trim() || 'Title not found';
      const h3Elements = container.querySelectorAll('h3');
      const shortName = h3Elements.length > 0 ? h3Elements[0].textContent?.trim() || 'Short name not found' : 'Short name not found';
      
      const questions = container.querySelectorAll('[class*="CardBox"]');
      
      return {
        title,
        shortName,
        questionCount: questions.length,
        questionTexts: Array.from(questions).slice(0, 2).map(q => q.textContent?.trim().substring(0, 100))
      };
    });
    
    console.log('Current form info:', JSON.stringify(currentForm, null, 2));
    
    // Test if this is detected as first form
    const isFirst = await formResetService.isFirstForm(page);
    console.log('Is detected as first form:', isFirst);
    
    if (!isFirst) {
      console.log('Attempting to navigate to first form...');
      
      // Try clicking previous button a few times manually
      let clickCount = 0;
      const maxClicks = 10;
      
      while (clickCount < maxClicks) {
        const hasBack = await page.evaluate(() => {
          const surveyBodyContainer = document.querySelector('#survey-body-container');
          const navigationArea = surveyBodyContainer?.nextElementSibling;
          if (!navigationArea) return false;
          
          const buttons = Array.from(navigationArea.querySelectorAll('button'));
          const backButton = buttons.find(btn => {
            const text = btn.textContent?.trim().toLowerCase() || '';
            return text.includes('prev') || text.includes('back') || text.includes('←');
          });
          
          if (backButton && !backButton.disabled) {
            backButton.click();
            return true;
          }
          return false;
        });
        
        if (!hasBack) {
          console.log('No more back buttons available');
          break;
        }
        
        clickCount++;
        console.log(`Clicked back button ${clickCount} times`);
        
        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check new form
        const newForm = await page.evaluate(() => {
          const container = document.querySelector('#survey-body-container');
          if (!container) return { error: 'No container' };
          
          const allPs = container.querySelectorAll('p');
          let formTitleP = null;
          
          for (const p of allPs) {
            const parent = p.parentElement;
            if (parent && parent.querySelector('h3')) {
              formTitleP = p;
              break;
            }
          }
          
          const title = formTitleP?.textContent?.trim() || 'Title not found';
          const h3Elements = container.querySelectorAll('h3');
          const shortName = h3Elements.length > 0 ? h3Elements[0].textContent?.trim() || 'Short name not found' : 'Short name not found';
          
          return { title, shortName };
        });
        
        console.log(`After ${clickCount} clicks - Form: "${newForm.title}" (${newForm.shortName})`);
        
        // Check navigation buttons again
        const newButtons = await page.evaluate(() => {
          const surveyBodyContainer = document.querySelector('#survey-body-container');
          const navigationArea = surveyBodyContainer?.nextElementSibling;
          if (!navigationArea) return [];
          
          const buttons = Array.from(navigationArea.querySelectorAll('button'));
          return buttons.map(btn => ({
            text: btn.textContent?.trim(),
            disabled: btn.disabled
          }));
        });
        
        console.log(`Navigation buttons after ${clickCount} clicks:`, newButtons.map(b => b.text).join(', '));
        
        // Check if we've reached the first form (only next button)
        const hasOnlyNext = newButtons.some(b => b.text.toLowerCase().includes('next')) && 
                           !newButtons.some(b => b.text.toLowerCase().includes('prev') || b.text.toLowerCase().includes('back'));
        
        if (hasOnlyNext) {
          console.log('Reached first form! (only next button available)');
          break;
        }
      }
    }
    
  } finally {
    await puppeteerManager.close();
  }
}

debugFirstForm().catch(console.error);