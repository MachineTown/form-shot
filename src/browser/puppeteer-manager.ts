import puppeteer, { Browser, Page } from 'puppeteer';

export class PuppeteerManager {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async launch(): Promise<void> {
    // Try to find Chrome executable or use bundled version
    const launchOptions: any = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-gpu',
        '--disable-dev-tools',
        '--no-first-run',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    };

    // Only set executablePath in Docker environment
    if (process.env.NODE_ENV === 'production') {
      launchOptions.executablePath = '/usr/bin/google-chrome';
    }

    this.browser = await puppeteer.launch(launchOptions);

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async navigateToPage(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched');
    }

    await this.page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Wait for potential dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 3000));
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
      this.browser = null;
      this.page = null;
    }
  }
}