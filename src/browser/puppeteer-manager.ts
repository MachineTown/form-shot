import puppeteer, { Browser, Page } from 'puppeteer';
import logger from '../utils/logger';
import { Config } from '../config/env-loader';

export class PuppeteerManager {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async launch(viewport = '1024x768'): Promise<void> {
    logger.info('Launching browser...');
    
    const [width, height] = viewport.split('x').map(Number);
    
    this.browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width, height });
    
    // Clear all cookies, local storage, and session storage for clean state
    await this.page.evaluateOnNewDocument(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // Clear cookies
    const client = await this.page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
    
    logger.info(`Browser launched with viewport ${viewport} - cleared cookies and storage`);
  }

  async navigateToUrl(url: string, waitFor = 3000): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    logger.info(`Navigating to ${url}`);
    
    await this.page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await this.page.waitForTimeout(waitFor);
    logger.info('Page loaded successfully');
  }

  async handleLogin(config: Config): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    logger.info('Starting two-step login process...');
    
    try {
      // Step 1: Email/Username page
      logger.info('Step 1: Looking for email/username field...');
      
      // Wait for page to fully load
      await this.page.waitForTimeout(3000);
      
      // Find email field - try multiple selectors
      const emailSelectors = [
        'input[type="email"]',
        'input[id="Castor1"]', // Specific to Castor EDC
        'input[name="email"]',
        'input[name="username"]',
        'input[id*="email"]',
        'input[placeholder*="email"]'
      ];

      let emailField = null;
      for (const selector of emailSelectors) {
        try {
          emailField = await this.page.$(selector);
          if (emailField) {
            logger.info(`Found email field with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!emailField) {
        throw new Error('Email field not found on first login page');
      }

      // Enter email
      await emailField.click();
      await emailField.evaluate(el => (el as HTMLInputElement).value = '');
      await emailField.type(config.username);
      logger.info('Email entered successfully');

      // Submit first form (email step)
      await this.submitForm(emailField);
      logger.info('First login step completed');

      // Step 2: Password page
      logger.info('Step 2: Looking for password field...');
      
      // Wait for navigation to password page
      await this.page.waitForTimeout(3000);

      // Find password field
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[id*="password"]',
        'input[placeholder*="password"]'
      ];

      let passwordField = null;
      for (const selector of passwordSelectors) {
        try {
          passwordField = await this.page.$(selector);
          if (passwordField) {
            logger.info(`Found password field with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!passwordField) {
        throw new Error('Password field not found on second login page');
      }

      // Enter password
      await passwordField.click();
      await passwordField.evaluate(el => (el as HTMLInputElement).value = '');
      await passwordField.type(config.password);
      logger.info('Password entered successfully');

      // Submit second form (password step)
      await this.submitForm(passwordField);
      logger.info('Second login step completed - login process finished');

      // Wait for final page load
      await this.page.waitForTimeout(3000);
      
    } catch (error) {
      logger.error('Two-step login failed:', error);
      throw error; // Re-throw to let caller handle
    }
  }

  private async submitForm(inputElement: any): Promise<void> {
    // Look for submit button with various patterns
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.login-button',
      '#login-button',
      'button.btn-primary',
      'button.submit',
      'button'
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const submitButton = await this.page!.$(selector);
        if (submitButton) {
          logger.info(`Found submit button with selector: ${selector}`);
          await submitButton.click();
          await this.page!.waitForNavigation({ 
            waitUntil: 'networkidle2',
            timeout: 10000 
          });
          logger.info('Login submitted successfully');
          submitted = true;
          break;
        }
      } catch (e) {
        logger.warn(`Submit button selector ${selector} failed:`, (e as Error).message);
      }
    }
    
    // If no submit button found, try pressing Enter on the input field
    if (!submitted) {
      logger.info('No submit button found, trying Enter key...');
      await inputElement.press('Enter');
      try {
        await this.page!.waitForNavigation({ 
          waitUntil: 'networkidle2',
          timeout: 5000 
        });
        logger.info('Login submitted with Enter key');
      } catch (e) {
        logger.warn('Navigation after Enter key failed, but continuing...');
      }
    }
    
    // Wait a bit more for any post-login redirects or second login step
    await this.page!.waitForTimeout(3000);
  }

  async takeScreenshot(path: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    await this.page.screenshot({ path, fullPage: true });
    logger.info(`Screenshot saved to ${path}`);
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched');
    }
    return this.page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }
}