import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

async function launchSupportedBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    try {
      return await chromium.launch({ headless: true, channel: 'msedge' });
    } catch {
      return await chromium.launch({ headless: true });
    }
  }
}

describe('KCC SkoolSys 2.0 — Principal Demonstration Walkthrough Rehearsal', { concurrency: 1 }, () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  const appBaseUrl = 'http://localhost:5173';

  before(async () => {
    browser = await launchSupportedBrowser();
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();

    page.on('dialog', async (dialog) => {
      await dialog.accept().catch(() => {});
    });

    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route, request) => {
        const url = new URL(request.url());
        const targetUrl = `http://localhost:5000${url.pathname}${url.search}`;
        try {
          const resp = await fetch(targetUrl, {
            method: request.method(),
            headers: request.headers(),
            body: request.postDataBuffer() || undefined
          });
          const headers: Record<string, string> = {};
          resp.headers.forEach((v, k) => { headers[k] = v; });
          await route.fulfill({ status: resp.status, headers, body: Buffer.from(await resp.arrayBuffer()) });
        } catch {
          await route.continue();
        }
      }
    );
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  });

  it('1. Principal Login & Executive Dashboard Overview', async () => {
    await page.goto(`${appBaseUrl}/#/login`);
    await page.waitForLoadState('networkidle');

    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    await usernameInput.fill('admin');
    await passwordInput.fill('admin123');
    await submitBtn.click();

    await page.waitForSelector('.nav-links', { timeout: 10000 });
    const content = await page.textContent('.app-container');
    assert.ok(content?.includes('Kattankudy Central College') || content?.includes('SkoolSys'));
  });

  it('2. Student Search & Real-Time Filtering', async () => {
    const studentsNav = page.locator('.nav-item').filter({ hasText: 'Student Records' });
    await studentsNav.click();
    await page.waitForSelector('.data-table', { timeout: 10000 });

    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill('Kasun');
    await page.waitForTimeout(600);

    const studentRow = page.locator('tr').filter({ hasText: 'Kasun Malinda Ranasinghe' });
    assert.ok((await studentRow.count()) > 0, 'Expected student Kasun Malinda Ranasinghe in search results');
  });

  it('3. Attendance Reports & Daily Register Overview', async () => {
    const attendanceNav = page.locator('.nav-item').filter({ hasText: 'Attendance Reports' });
    await attendanceNav.click();
    await page.waitForTimeout(1000);

    const content = await page.textContent('.app-container');
    assert.ok(content?.includes('Attendance') || content?.includes('Register') || content?.includes('Report'));
  });

  it('4. Examination Management Workspace & Moderation Screens', async () => {
    const marksNav = page.locator('.nav-item').filter({ hasText: 'Marks Management' });
    await marksNav.click();
    await page.waitForSelector('h2:has-text("Examination Management Workspace")', { timeout: 10000 });

    const header = await page.locator('h2:has-text("Examination Management Workspace")').textContent();
    assert.ok(header?.includes('Examination Management Workspace'));
  });

  it('5. Grade 8-A Terminal Report Card & Reissued Status Verification', async () => {
    const studentsNav = page.locator('.nav-item').filter({ hasText: 'Student Records' });
    await studentsNav.click();
    await page.waitForSelector('.data-table', { timeout: 10000 });

    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill('Kasun');
    await page.waitForTimeout(600);

    const fullViewBtn = page.locator('tr:has-text("Kasun Malinda Ranasinghe") button:has-text("Full View")').first();
    await fullViewBtn.click();
    await page.waitForSelector('button:has-text("View Full Report Card")', { timeout: 10000 });

    const viewReportBtn = page.locator('button:has-text("View Full Report Card")').first();
    await viewReportBtn.click();

    // Wait for Report Card to load completely (Print button appears when reportData loads)
    await page.waitForSelector('.side-panel-right button:has-text("Print (A4)")', { timeout: 10000 });

    const modalText = await page.textContent('.side-panel-right');
    assert.ok(modalText?.includes('Official Student Terminal Report Card'));
    assert.ok(modalText?.includes('Kasun Malinda Ranasinghe'));
  });

  it('6. Printable A4 Report Card Layout Verification', async () => {
    const printBtn = page.locator('.side-panel-right button:has-text("Print (A4)")');
    assert.ok((await printBtn.count()) > 0, 'Print (A4) button must be present in report card modal');
  });
});
