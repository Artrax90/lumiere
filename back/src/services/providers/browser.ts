import { chromium, type Browser, type Page } from 'playwright';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

export async function getPage(url: string, options?: { waitFor?: string; timeout?: number }): Promise<{ page: Page; html: string }> {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: options?.timeout || 30000 });

    if (options?.waitFor) {
      await page.waitForSelector(options.waitFor, { timeout: 10000 }).catch(() => {});
    }

    const html = await page.content();
    return { page, html };
  } catch (err) {
    await page.close();
    throw err;
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
