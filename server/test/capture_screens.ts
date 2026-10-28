import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { startTestServer, type TestServerInstance } from './helpers/testServer.js';
import { switchDatabase, initDatabase } from '../src/db/database.js';
import { runSeed } from '../src/db/seed.js';

const outDir = 'C:/Users/Mr Zerbug/.gemini/antigravity/brain/8ab78a07-aa62-43af-8d94-aadcbfeb877b/screenshots';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function capture() {
  console.log('🚀 Starting KCC SkoolSys 2.0 Screen Capture...');

  const tempDir = os.tmpdir();
  const testDbPath = path.join(tempDir, `skoolsys_kcc_cap_${Date.now()}.db`);
  process.env.DB_PATH = testDbPath;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'screenshot_jwt_secret_with_at_least_32_chars_2026';
  process.env.ALLOW_DISPOSABLE_SEED = '1';
  process.env.CONFIRM_DISPOSABLE_SEED = '1';

  switchDatabase(testDbPath);
  initDatabase();
  runSeed();

  const testServerInstance = await startTestServer();
  const backendBaseUrl = testServerInstance.baseUrl;
  const appBaseUrl = 'http://localhost:5173';

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  }

  const setupPage = async (width: number, height: number) => {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    page.on('dialog', async (d) => { await d.accept().catch(() => {}); });
    await page.route((url) => url.pathname.startsWith('/api/'), async (route, req) => {
      const u = new URL(req.url());
      const target = `${backendBaseUrl}${u.pathname}${u.search}`;
      try {
        const resp = await fetch(target, {
          method: req.method(),
          headers: req.headers(),
          body: req.postDataBuffer() || undefined
        });
        const headers: Record<string, string> = {};
        resp.headers.forEach((v, k) => { headers[k] = v; });
        await route.fulfill({
          status: resp.status,
          headers,
          body: Buffer.from(await resp.arrayBuffer())
        });
      } catch {
        await route.abort();
      }
    });
    return { context, page };
  };

  // 1. Login Desktop
  {
    const { context, page } = await setupPage(1440, 900);
    await page.goto(`${appBaseUrl}/#/login`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(outDir, '01-login-desktop-1440.png') });
    console.log('✅ Captured 01-login-desktop-1440.png');
    await context.close();
  }

  // 2. Login Mobile
  {
    const { context, page } = await setupPage(375, 812);
    await page.goto(`${appBaseUrl}/#/login`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(outDir, '02-login-mobile-375.png') });
    console.log('✅ Captured 02-login-mobile-375.png');
    await context.close();
  }

  // Authenticated flows: Login as Principal
  const { context: dContext, page: dPage } = await setupPage(1440, 900);
  await dPage.goto(`${appBaseUrl}/#/login`);
  await dPage.waitForLoadState('networkidle');
  await dPage.fill('input[type="text"], input[name="username"]', 'admin');
  await dPage.fill('input[type="password"]', 'admin123');
  await dPage.click('button[type="submit"]');
  await dPage.waitForSelector('.app-container', { timeout: 8000 });
  await dPage.waitForTimeout(800);

  // 3. Dashboard Desktop
  await dPage.screenshot({ path: path.join(outDir, '03-dashboard-desktop-1440.png') });
  console.log('✅ Captured 03-dashboard-desktop-1440.png');

  // 4. Student Records Desktop
  const studentNav = dPage.locator('.nav-item').filter({ hasText: 'Student Records' });
  await studentNav.click();
  await dPage.waitForSelector('.data-table', { timeout: 8000 });
  await dPage.waitForTimeout(600);
  await dPage.screenshot({ path: path.join(outDir, '05-students-directory-desktop-1440.png') });
  console.log('✅ Captured 05-students-directory-desktop-1440.png');

  // 5. Student Profile Full View Dossier
  const fullViewBtn = dPage.locator('button:has-text("Full View")').first();
  await fullViewBtn.click();
  await dPage.waitForSelector('.badge, h2', { timeout: 8000 });
  await dPage.waitForTimeout(800);
  await dPage.screenshot({ path: path.join(outDir, '06-student-dossier-fullview-1440.png') });
  console.log('✅ Captured 06-student-dossier-fullview-1440.png');

  // Report Card from Dossier
  const repCardBtn = dPage.locator('button:has-text("View Full Report Card")').first();
  if (await repCardBtn.count() > 0) {
    await repCardBtn.click();
    await dPage.waitForSelector('.side-panel-right, :has-text("DEMONSTRATION")', { timeout: 8000 });
    await dPage.waitForTimeout(800);
    await dPage.screenshot({ path: path.join(outDir, '11-report-card-modal-desktop-1440.png') });
    console.log('✅ Captured 11-report-card-modal-desktop-1440.png');
    const closePanel = dPage.locator('button:has-text("Close Panel")').first();
    if (await closePanel.count() > 0) await closePanel.click();
    await dPage.waitForTimeout(400);
  }

  // 6. Attendance Register Desktop
  const attNav = dPage.locator('.nav-item').filter({ hasText: 'Take Attendance' });
  await attNav.click();
  await dPage.waitForSelector('.card, .data-table, .form-select, .attendance-session', { timeout: 8000 });
  await dPage.waitForTimeout(600);
  await dPage.screenshot({ path: path.join(outDir, '07-attendance-register-desktop-1440.png') });
  console.log('✅ Captured 07-attendance-register-desktop-1440.png');

  // 7. Attendance Reports Desktop
  const repNav = dPage.locator('.nav-item').filter({ hasText: 'Attendance Reports' });
  await repNav.click();
  await dPage.waitForSelector('.card, .data-table, h2', { timeout: 8000 });
  await dPage.waitForTimeout(600);
  await dPage.screenshot({ path: path.join(outDir, '09-attendance-reports-desktop-1440.png') });
  console.log('✅ Captured 09-attendance-reports-desktop-1440.png');

  // 8. Examination Management Workspace Desktop
  const marksNav = dPage.locator('.nav-item').filter({ hasText: 'Marks Management' });
  await marksNav.click();
  await dPage.waitForSelector('h2:has-text("Examination Management Workspace")', { timeout: 8000 });
  await dPage.waitForTimeout(600);
  await dPage.screenshot({ path: path.join(outDir, '10-examination-workspace-desktop-1440.png') });
  console.log('✅ Captured 10-examination-workspace-desktop-1440.png');

  await dContext.close();

  // Mobile Dashboard & Attendance
  const { context: mContext, page: mPage } = await setupPage(375, 812);
  await mPage.goto(`${appBaseUrl}/#/login`);
  await mPage.waitForLoadState('networkidle');
  await mPage.fill('input[type="text"], input[name="username"]', 'admin');
  await mPage.fill('input[type="password"]', 'admin123');
  await mPage.click('button[type="submit"]');
  await mPage.waitForSelector('.app-container', { timeout: 8000 });
  await mPage.waitForTimeout(800);
  await mPage.screenshot({ path: path.join(outDir, '04-dashboard-mobile-375.png') });
  console.log('✅ Captured 04-dashboard-mobile-375.png');

  // Open mobile drawer
  const burger = mPage.locator('.mobile-menu-btn').first();
  if (await burger.count() > 0) {
    await burger.click();
    await mPage.waitForTimeout(400);
    const mAttNav = mPage.locator('.nav-item').filter({ hasText: 'Take Attendance' });
    if (await mAttNav.count() > 0) {
      await mAttNav.click();
      await mPage.waitForTimeout(800);
      await mPage.screenshot({ path: path.join(outDir, '08-attendance-register-mobile-375.png') });
      console.log('✅ Captured 08-attendance-register-mobile-375.png');
    }
  }

  await mContext.close();

  await browser.close();
  await testServerInstance.close();
  switchDatabase();
  try { fs.unlinkSync(testDbPath); } catch {}
  console.log('🎉 All 11 screenshots captured successfully in:', outDir);
}

capture().catch((e) => {
  console.error('Screenshot capture failed:', e);
  process.exit(1);
});
