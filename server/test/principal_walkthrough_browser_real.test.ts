import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { switchDatabase, initDatabase, closeDatabase } from '../src/db/database.js';
import { runSeed } from '../src/db/seed.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';

function createStaticServer(distDir: string): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url ? req.url.split('?')[0] : '/';
      let filePath = path.join(distDir, reqPath === '/' ? 'index.html' : reqPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function launchSupportedBrowser(): Promise<Browser | null> {
  try {
    return await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    try {
      return await chromium.launch({ headless: true, channel: 'msedge' });
    } catch {
      try {
        return await chromium.launch({ headless: true });
      } catch {
        console.warn('⚠️ No compatible browser binary installed in environment.');
        return null;
      }
    }
  }
}

describe('KCC SkoolSys 2.0 — Principal Demonstration Walkthrough Rehearsal (Browser E2E)', { concurrency: 1 }, () => {
  let browser: Browser | null = null;
  let context: BrowserContext;
  let page: Page;
  let testServerInstance: TestServerInstance | null = null;
  let staticServer: http.Server | null = null;
  let backendBaseUrl = 'http://localhost:5000';
  let appBaseUrl = 'http://localhost:5173';
  let testDbPath: string;

  before(async () => {
    // 1. Setup isolated, disposable SQLite database in temp directory
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `skoolsys_kcc_walkthrough_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`);
    process.env.DB_PATH = testDbPath;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'walkthrough_test_jwt_secret_with_at_least_32_chars_2026';
    process.env.ALLOW_DISPOSABLE_SEED = '1';
    process.env.CONFIRM_DISPOSABLE_SEED = '1';

    switchDatabase(testDbPath);
    initDatabase();
    runSeed();

    // 2. Start isolated backend test server on ephemeral port
    testServerInstance = await startTestServer();
    backendBaseUrl = testServerInstance.baseUrl;

    // 3. Establish Frontend App URL (Live dev server or built static distribution)
    let appFound = false;
    try {
      const resp = await fetch('http://localhost:5173', { signal: AbortSignal.timeout(600) });
      if (resp.ok || resp.status === 200 || resp.status === 304) {
        appBaseUrl = 'http://localhost:5173';
        appFound = true;
      }
    } catch {}

    if (!appFound) {
      const clientDist = path.resolve(import.meta.dirname, '../../client/dist');
      if (fs.existsSync(clientDist)) {
        const { server, url } = await createStaticServer(clientDist);
        staticServer = server;
        appBaseUrl = url;
      } else {
        throw new Error(`Client build not found at ${clientDist}. Please build client first.`);
      }
    }

    // 4. Launch browser context with desktop viewport
    browser = await launchSupportedBrowser();
    if (!browser) {
      console.warn('Skipping browser walkthrough tests because browser could not be launched');
      return;
    }

    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();

    page.on('dialog', async (dialog) => {
      await dialog.accept().catch(() => {});
    });

    // Route /api/* from browser to isolated backend test server
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route, request) => {
        const url = new URL(request.url());
        const targetUrl = `${backendBaseUrl}${url.pathname}${url.search}`;
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
    if (testServerInstance) await testServerInstance.close().catch(() => {});
    if (staticServer) {
      await new Promise<void>((resolve) => staticServer!.close(() => resolve()));
    }
    closeDatabase();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch {}
  });

  it('Step 1: KCC-Branded Login Screen & Institutional Profile Verification', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    await page.goto(`${appBaseUrl}/#/login`);
    await page.waitForLoadState('networkidle');

    const brandText = await page.textContent('.card');
    assert.ok(brandText?.includes('Kattankudy Central College'), 'Login must display Kattankudy Central College');
    assert.ok(brandText?.includes('காத்தான்குடி மத்திய கல்லூரி'), 'Login must display Tamil school name');
    assert.ok(brandText?.includes('14145'), 'Login must display School Census No. 14145');
    const hasDemoPanel = (await page.locator('text=Testing & Demo Accounts').count()) > 0;
    if (hasDemoPanel) {
      assert.ok(brandText?.includes('Principal — Demo Account'), 'Demo panel must feature Principal Demo Account');
    }
  });

  it('Step 2: Authenticate with Principal Demo Account', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

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

  it('Step 3: Executive Dashboard & School Overview KPIs', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    await page.waitForSelector('.stat-card', { timeout: 10000 });
    const dashboardText = await page.textContent('.app-container');

    // Asserts active school operations
    assert.ok(dashboardText?.includes('Kattankudy Central College'), 'Dashboard must display school name');
    assert.ok(dashboardText?.includes('Total Enrolled Students'), 'Dashboard must display student enrollment card');
    assert.ok(dashboardText?.includes('Active School Classes'), 'Dashboard must display classes count');
    assert.ok(dashboardText?.includes('Daily Attendance Register Status'), 'Dashboard must display attendance progress');
  });

  it('Step 4: Student Records Search & Real-Time Filtering', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    const studentsNav = page.locator('.nav-item').filter({ hasText: 'Student Records' });
    await studentsNav.click();
    await page.waitForSelector('.data-table', { timeout: 10000 });

    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill('Kasun');
    await page.waitForTimeout(600);

    const studentRow = page.locator('tr').filter({ hasText: 'Kasun Malinda Ranasinghe' });
    assert.ok((await studentRow.count()) > 0, 'Expected student Kasun Malinda Ranasinghe in search results');

    // Search by admission number
    await searchInput.fill('SCH-2024-001');
    await page.waitForTimeout(400);
    assert.ok((await studentRow.count()) > 0, 'Expected student by admission no SCH-2024-001');
  });

  it('Step 5 & 6: Student Profile Full View, Class & Subject Assignments', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    const fullViewBtn = page.locator('tr:has-text("Kasun Malinda Ranasinghe") button:has-text("Full View")').first();
    await fullViewBtn.click();
    await page.waitForSelector('button:has-text("View Full Report Card")', { timeout: 10000 });

    const profileText = await page.textContent('.app-container');
    assert.ok(profileText?.includes('Grade 8-A'), 'Student must belong to Grade 8-A');
    assert.ok(profileText?.includes('Mathematics'), 'Student must have Mathematics enrolled');
    assert.ok(profileText?.includes('Science'), 'Student must have Science enrolled');
  });

  it('Step 7: Daily Attendance Register Access & Overview', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    const attendanceNav = page.locator('.nav-item').filter({ hasText: 'Take Attendance' });
    if ((await attendanceNav.count()) > 0) {
      await attendanceNav.click();
      await page.waitForTimeout(800);
      const appText = await page.textContent('.app-container');
      assert.ok(appText?.includes('Attendance') || appText?.includes('Register'));
    }
  });

  it('Step 8: Attendance Reports & Absentee Registry Directory', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    const reportsNav = page.locator('.nav-item').filter({ hasText: 'Attendance Reports' });
    await reportsNav.click();
    await page.waitForTimeout(800);

    const reportsText = await page.textContent('.app-container');
    assert.ok(reportsText?.includes('Attendance') || reportsText?.includes('Register') || reportsText?.includes('Report'));
  });

  it('Step 9 & 10: Examination Management Workspace & Moderation Lifecycle', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    const marksNav = page.locator('.nav-item').filter({ hasText: 'Marks Management' });
    await marksNav.click();
    await page.waitForSelector('h2:has-text("Examination Management Workspace")', { timeout: 10000 });

    const header = await page.locator('h2:has-text("Examination Management Workspace")').textContent();
    assert.ok(header?.includes('Examination Management Workspace'));

    const workspaceText = await page.textContent('.app-container');
    assert.ok(workspaceText?.includes('Term 1 Assessment 2026'), 'Must display Term 1 published exam');
    assert.ok(workspaceText?.includes('Mid-Year Examination 2026'), 'Must display Mid-Year scheduled exam');
  });

  it('Step 11 & 12: Published Student Report Card & Canonical Demonstration Notice', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

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

    // Wait for Report Card side panel modal
    await page.waitForSelector('.side-panel-right button:has-text("Print (A4)")', { timeout: 10000 });

    const modalText = await page.textContent('.side-panel-right');
    assert.ok(modalText?.includes('Kattankudy Central College'), 'Report card must display KCC');
    assert.ok(modalText?.includes('காத்தான்குடி மத்திய கல்லூரி'), 'Report card must display Tamil school name');
    assert.ok(modalText?.includes('Kasun Malinda Ranasinghe'), 'Report card must display student name');
    assert.ok(modalText?.includes('DEMONSTRATION — NOT AN OFFICIAL SCHOOL RESULT'), 'Report card must carry demonstration watermark');
    assert.ok(modalText?.includes('Mathematics'), 'Report card must contain Mathematics');
    assert.ok(modalText?.includes('Principal'), 'Report card must contain Principal signature section');
  });

  it('Step 13: Printable A4 Card Layout Verification', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    const printBtn = page.locator('.side-panel-right button:has-text("Print (A4)")');
    assert.ok((await printBtn.count()) > 0, 'Print (A4) button must be present in report card modal');

    // Close panel
    const closeBtn = page.locator('.side-panel-right button:has-text("Close Panel")');
    await closeBtn.click();
  });

  it('Step 14: Sign Out & Session Security Protection', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    const logoutBtn = page.locator('button[title="Sign Out"], button[aria-label="Sign Out"]').first();
    await logoutBtn.click();

    await page.waitForSelector('input[name="username"], input[type="text"]', { timeout: 10000 });
    const loginText = await page.textContent('.card');
    assert.ok(loginText?.includes('Kattankudy Central College'));
  });

  it('Responsive Layout Verification (Mobile 375px)', async (t) => {
    if (!browser) return t.skip('Browser unavailable');

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${appBaseUrl}/#/login`);
    await page.waitForLoadState('networkidle');

    const mobileLoginCard = page.locator('.card').first();
    assert.ok((await mobileLoginCard.count()) > 0, 'Login card must render on mobile');

    // Reset viewport to desktop
    await page.setViewportSize({ width: 1280, height: 800 });
  });
});
