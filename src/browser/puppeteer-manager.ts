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

  async takeComprehensiveScreenshots(fields: any[], screenshotDir: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    logger.info(`Taking comprehensive screenshots for ${fields.length} form fields...`);
    
    // Scroll to top first
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.page.waitForTimeout(500);
    
    // Take initial full page screenshot
    const initialPath = `${screenshotDir}/01-initial-form.png`;
    await this.page.screenshot({ path: initialPath, fullPage: true });
    logger.info(`Initial form screenshot saved: ${initialPath}`);

    // Take viewport screenshot at top
    const viewportPath = `${screenshotDir}/02-current-viewport.png`;
    await this.page.screenshot({ path: viewportPath, fullPage: false });
    logger.info(`Current viewport screenshot saved: ${viewportPath}`);

    // Find and get dimensions of the scrollable right panel container
    const dimensions = await this.page.evaluate(() => {
      // Find the scrollable container in the right panel
      const rightPanelSelectors = [
        '.right-panel',
        '.form-panel', 
        '.content-panel',
        '[class*="panel"]',
        '[class*="content"]',
        '.main-content',
        '#main-content'
      ];
      
      let scrollableContainer = null;
      
      // Look for containers that might be scrollable in the right side
      for (const selector of rightPanelSelectors) {
        const containers = document.querySelectorAll(selector);
        for (let j = 0; j < containers.length; j++) {
          const container = containers[j];
          const rect = container.getBoundingClientRect();
          const style = window.getComputedStyle(container);
          
          // Check if it's in the right area and scrollable
          if (rect.left > window.innerWidth * 0.3 && 
              (style.overflow === 'auto' || style.overflow === 'scroll' || 
               style.overflowY === 'auto' || style.overflowY === 'scroll' ||
               container.scrollHeight > container.clientHeight)) {
            scrollableContainer = container;
            break;
          }
        }
        if (scrollableContainer) break;
      }
      
      // If no specific scrollable container found, look for any div with scroll in right area
      if (!scrollableContainer) {
        const allDivs = document.querySelectorAll('div');
        for (let k = 0; k < allDivs.length; k++) {
          const div = allDivs[k];
          const rect = div.getBoundingClientRect();
          if (rect.left > window.innerWidth * 0.3 && 
              div.scrollHeight > div.clientHeight + 10) { // Some tolerance
            scrollableContainer = div;
            break;
          }
        }
      }
      
      if (scrollableContainer) {
        return {
          hasScrollableContainer: true,
          containerScrollHeight: scrollableContainer.scrollHeight,
          containerClientHeight: scrollableContainer.clientHeight,
          containerScrollTop: scrollableContainer.scrollTop,
          containerRect: {
            left: scrollableContainer.getBoundingClientRect().left,
            top: scrollableContainer.getBoundingClientRect().top,
            width: scrollableContainer.getBoundingClientRect().width,
            height: scrollableContainer.getBoundingClientRect().height
          },
          pageHeight: scrollableContainer.scrollHeight,
          viewportHeight: scrollableContainer.clientHeight,
          pageWidth: window.innerWidth,
          viewportWidth: window.innerWidth,
          currentScroll: scrollableContainer.scrollTop
        };
      } else {
        // Fallback to page scrolling
        return {
          hasScrollableContainer: false,
          pageHeight: document.body.scrollHeight,
          viewportHeight: window.innerHeight,
          pageWidth: document.body.scrollWidth,
          viewportWidth: window.innerWidth,
          currentScroll: window.pageYOffset,
          containerRect: undefined,
          containerScrollHeight: undefined,
          containerClientHeight: undefined,
          containerScrollTop: undefined
        };
      }
    });
    
    if (dimensions.hasScrollableContainer && dimensions.containerRect) {
      logger.info(`Found scrollable container at (${dimensions.containerRect.left}, ${dimensions.containerRect.top}) with size ${dimensions.containerRect.width}x${dimensions.containerRect.height}`);
      logger.info(`Container scroll: ${dimensions.containerScrollHeight}px total, ${dimensions.containerClientHeight}px visible`);
    } else {
      logger.info(`No scrollable container found, using page scroll: ${dimensions.pageWidth}x${dimensions.pageHeight}px`);
    }
    
    // Calculate how many scroll steps we need
    const viewportHeight = dimensions.viewportHeight;
    const pageHeight = dimensions.pageHeight;
    
    // Check if scrolling is needed
    const shouldScroll = pageHeight > viewportHeight + 50; // Need some tolerance
    
    if (shouldScroll) {
      const overlapPercent = 0.2; // 20% overlap (scroll 80% of viewport each time)
      const scrollDistance = Math.floor(viewportHeight * (1 - overlapPercent));
      const totalScrollSteps = Math.ceil((pageHeight - viewportHeight) / scrollDistance);
      
      logger.info(`Container requires scrolling. Taking ${totalScrollSteps} additional screenshots with ${scrollDistance}px scroll steps`);
      
      for (let i = 0; i < totalScrollSteps; i++) {
        const scrollTop = Math.min((i + 1) * scrollDistance, pageHeight - viewportHeight);
        
        logger.info(`Scrolling container to position: ${scrollTop}px`);
        
        if (dimensions.hasScrollableContainer) {
          // Scroll the specific container
          await this.page.evaluate((scroll) => {
            // Find the same scrollable container again
            const rightPanelSelectors = [
              '.right-panel',
              '.form-panel', 
              '.content-panel',
              '[class*="panel"]',
              '[class*="content"]',
              '.main-content',
              '#main-content'
            ];
            
            let scrollableContainer = null;
            for (const selector of rightPanelSelectors) {
              const containers = document.querySelectorAll(selector);
              for (let j = 0; j < containers.length; j++) {
          const container = containers[j];
                const rect = container.getBoundingClientRect();
                const style = window.getComputedStyle(container);
                if (rect.left > window.innerWidth * 0.3 && 
                    (style.overflow === 'auto' || style.overflow === 'scroll' || 
                     style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                     container.scrollHeight > container.clientHeight)) {
                  scrollableContainer = container;
                  break;
                }
              }
              if (scrollableContainer) break;
            }
            
            if (!scrollableContainer) {
              const allDivs = document.querySelectorAll('div');
              for (let k = 0; k < allDivs.length; k++) {
          const div = allDivs[k];
                const rect = div.getBoundingClientRect();
                if (rect.left > window.innerWidth * 0.3 && 
                    div.scrollHeight > div.clientHeight + 10) {
                  scrollableContainer = div;
                  break;
                }
              }
            }
            
            if (scrollableContainer) {
              scrollableContainer.scrollTop = scroll;
            }
          }, scrollTop);
        } else {
          // Fallback to page scrolling
          await this.page.evaluate((scroll) => {
            window.scrollTo(0, scroll);
          }, scrollTop);
        }

        // Wait for scroll to complete and any content to load
        await this.page.waitForTimeout(1000);
        
        // Verify scroll position
        const actualScroll = await this.page.evaluate((hasContainer) => {
          if (hasContainer) {
            // Get container scroll position
            const containers = document.querySelectorAll('div');
            for (let j = 0; j < containers.length; j++) {
          const container = containers[j];
              const rect = container.getBoundingClientRect();
              if (rect.left > window.innerWidth * 0.3 && 
                  container.scrollHeight > container.clientHeight + 10) {
                return container.scrollTop;
              }
            }
          }
          return window.pageYOffset;
        }, dimensions.hasScrollableContainer);
        logger.info(`Actual scroll position: ${actualScroll}px`);

        const screenshotIndex = i + 3; // Start from 03
        const screenshotPath = `${screenshotDir}/${screenshotIndex.toString().padStart(2, '0')}-scroll-${actualScroll}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: false });
        
        logger.info(`Screenshot ${screenshotIndex} saved: ${screenshotPath} (container scroll: ${actualScroll}px)`);
      }
      
      // Take one more screenshot at the very bottom of the container
      if (dimensions.hasScrollableContainer) {
        await this.page.evaluate(() => {
          const containers = document.querySelectorAll('div');
          for (let j = 0; j < containers.length; j++) {
          const container = containers[j];
            const rect = container.getBoundingClientRect();
            if (rect.left > window.innerWidth * 0.3 && 
                container.scrollHeight > container.clientHeight + 10) {
              container.scrollTop = container.scrollHeight;
              break;
            }
          }
        });
      } else {
        await this.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
      }
      await this.page.waitForTimeout(1000);
      
      const bottomScroll = await this.page.evaluate(() => {
        const containers = document.querySelectorAll('div');
        for (let j = 0; j < containers.length; j++) {
          const container = containers[j];
          const rect = container.getBoundingClientRect();
          if (rect.left > window.innerWidth * 0.3 && 
              container.scrollHeight > container.clientHeight + 10) {
            return container.scrollTop;
          }
        }
        return window.pageYOffset;
      });
      const bottomPath = `${screenshotDir}/98-bottom-${bottomScroll}.png`;
      await this.page.screenshot({ path: bottomPath, fullPage: false });
      logger.info(`Bottom screenshot saved: ${bottomPath} (container scroll: ${bottomScroll}px)`);
      
    } else {
      logger.info('Container fits in viewport - no additional scrolling needed');
    }

    // Scroll back to top
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.page.waitForTimeout(300);

    // Take a final full page screenshot to ensure we captured everything
    const finalPath = `${screenshotDir}/99-final-full-page.png`;
    await this.page.screenshot({ path: finalPath, fullPage: true });
    logger.info(`Final full page screenshot saved: ${finalPath}`);

    const totalScreenshots = pageHeight > viewportHeight ? Math.ceil((pageHeight - viewportHeight) / Math.floor(viewportHeight * 0.8)) + 4 : 3;
    logger.info(`Comprehensive screenshot capture complete - ${totalScreenshots} screenshots taken`);
    logger.info(`Field summary: ${fields.map(f => `${f.label || f.id} (${f.type})`).join(', ')}`);
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