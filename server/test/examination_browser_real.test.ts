import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// ============================================================================
// PR-005 Examination Workspace Real Browser E2E Test Suite
// Verifies UI Workflows, Schedules, Marks Entry, Review, Policy, Publication,
// Student Report Cards, and Multi-Tier Separation of Duties in Real Chromium.
// ============================================================================

let browser: Browser | null = null;
let staticServer: http.Server | null = null;
let spawnedViteProcess: ChildProcess | null = null;
let appBaseUrl = 'http://localhost:5173';

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

describe('PR-005: Examination Management Workspace Browser E2E Tests', () => {
  let context: BrowserContext;
  let page: Page;

  before(async () => {
    // 1. Establish App URL
    let appFound = false;
    try {
      const resp = await fetch('http://localhost:5173', { signal: AbortSignal.timeout(800) });
      if (resp.ok || resp.status === 200 || resp.status === 304) {
        appBaseUrl = 'http://localhost:5173';
        appFound = true;
        console.log(`[Browser E2E] Connected to live Vite dev server at ${appBaseUrl}`);
      }
    } catch {
      // Dev server not running on 5173
    }

    if (!appFound) {
      const distDir = path.resolve(import.meta.dirname, '../../client/dist');
      if (fs.existsSync(distDir) && fs.existsSync(path.join(distDir, 'index.html'))) {
        const info = await createStaticServer(distDir);
        staticServer = info.server;
        appBaseUrl = info.url;
        appFound = true;
        console.log(`[Browser E2E] Serving prebuilt client bundle from ${distDir} at ${appBaseUrl}`);
      }
    }

    if (!appFound) {
      throw new Error('[Browser E2E] Neither Vite dev server nor client/dist found.');
    }

    // 2. Launch real browser
    browser = await launchSupportedBrowser();
    if (!browser) {
      throw new Error('[Browser E2E] Playwright failed to launch Chromium browser.');
    }

    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (staticServer) staticServer.close();
    if (spawnedViteProcess) spawnedViteProcess.kill();
  });

  it('1. Principal Login & Examination Management Workspace Navigation', async () => {
    await page.goto(`${appBaseUrl}/#/login`);
    await page.waitForLoadState('networkidle');

    // Fill login form with admin / Principal credentials
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    await usernameInput.fill('admin');
    await passwordInput.fill('admin123');
    await submitBtn.click();

    // Wait for Dashboard to appear
    await page.waitForSelector('.app-container', { timeout: 8000 });

    // Navigate to Marks Management tab
    const marksNavBtn = page.locator('.nav-item').filter({ hasText: 'Marks Management' });
    await marksNavBtn.click();

    // Verify Workspace Header & Appointment Badges
    await page.waitForSelector('h2:has-text("Examination Management Workspace")', { timeout: 6000 });
    const headerTitle = await page.textContent('h2:has-text("Examination Management Workspace")');
    assert.ok(headerTitle?.includes('Examination Management Workspace'));

    // Verify appointment badge: Principal or Administrator
    const badges = await page.locator('.badge').allTextContents();
    assert.ok(badges.some((b) => b.includes('Administrator') || b.includes('Principal')));

    // Verify presence of all 7 workspace tabs
    const tabs = page.locator('.workspace-tab-btn');
    const tabCount = await tabs.count();
    assert.strictEqual(tabCount, 7);

    const tabTexts = await tabs.allTextContents();
    assert.ok(tabTexts.some((t) => t.includes('Overview & Exams')));
    assert.ok(tabTexts.some((t) => t.includes('Schedules')));
    assert.ok(tabTexts.some((t) => t.includes('Marks Entry')));
    assert.ok(tabTexts.some((t) => t.includes('Review & Approvals')));
    assert.ok(tabTexts.some((t) => t.includes('Assessment Policies')));
    assert.ok(tabTexts.some((t) => t.includes('Publication & Release')));
    assert.ok(tabTexts.some((t) => t.includes('Post-Publication Corrections')));
  });

  it('2. Examination Overview & Filter Functionality', async () => {
    // We are on the Overview tab by default
    const examTable = page.locator('.data-table');
    await examTable.waitFor({ timeout: 5000 });

    // Verify seeded exams appear in table
    const tableText = await examTable.textContent();
    assert.ok(tableText?.includes('Term 1 Assessment 2026'));
    assert.ok(tableText?.includes('Mid-Year Examination 2026'));

    // Test search filter input
    const searchInput = page.locator('input[placeholder*="Search title"]');
    await searchInput.fill('Mid-Year');
    await page.waitForTimeout(300);

    const filteredText = await examTable.textContent();
    assert.ok(filteredText?.includes('Mid-Year Examination 2026'));
    assert.ok(!filteredText?.includes('Term 1 Assessment 2026'));

    // Clear search filter
    await searchInput.fill('');
    await page.waitForTimeout(300);
  });

  it('3. Examination Schedules Management Tab', async () => {
    // Switch to Schedules tab
    const schedulesTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Schedules' });
    await schedulesTab.click();

    // Verify Schedules table and summary indicators
    await page.waitForSelector('.data-table', { timeout: 5000 });
    const schedulesText = await page.textContent('.page-container');
    assert.ok(schedulesText?.includes('Completeness') || schedulesText?.includes('Active Examination'));

    // Verify Add Subject Offering button is visible
    const addBtn = page.locator('button:has-text("Add Subject Offering")');
    assert.ok(await addBtn.isVisible());
  });

  it('4. Teacher Marks Entry & Student Report Card Preview Modal', async () => {
    try {
      // Switch to Marks Entry tab
      const marksEntryTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Marks Entry' });
      await marksEntryTab.click();

      // Select Term 1 Assessment 2026 in exam selector
      const examSelect = page.locator('#marks-exam-select');
      await examSelect.waitFor({ state: 'visible', timeout: 5000 });
      const examVal = await examSelect.locator('option', { hasText: 'Term 1 Assessment 2026' }).getAttribute('value');
      if (examVal) await examSelect.selectOption(examVal);

      // Select Grade 8-A in class selector to load enrolled students
      const classSelect = page.locator('#marks-class-select');
      await classSelect.waitFor({ state: 'visible', timeout: 5000 });
      const classVal = await classSelect.locator('option', { hasText: 'Grade 8-A' }).getAttribute('value');
      if (classVal) await classSelect.selectOption(classVal);

      // Wait for subjects to load and select Mathematics
      const subjectSelect = page.locator('#marks-subject-select');
      await page.waitForFunction(() => {
        const sel = document.getElementById('marks-subject-select') as HTMLSelectElement | null;
        return sel && sel.options.length > 0;
      }, { timeout: 6000 });
      const subVal = await subjectSelect.locator('option', { hasText: 'Math' }).getAttribute('value');
      if (subVal) await subjectSelect.selectOption(subVal);

      // Wait for marks roster table to render student records
      await page.waitForSelector('.data-table tbody tr:has-text("SCH-2024-001"), .data-table tbody tr:has-text("Kasun")', { timeout: 8000 });

      // Verify student records are listed
      const rosterText = await page.textContent('.data-table');
      assert.ok(rosterText?.includes('Kasun Malinda Ranasinghe') || rosterText?.includes('SCH-2024-001'));

      // Open Student Report Card modal
      const reportCardBtn = page.locator('button:has-text("Report Card")').first();
      await reportCardBtn.click();

      // Verify modal overlay opens and report card content finishes loading
      await page.waitForSelector('.side-panel-right', { timeout: 6000 });
      await page.waitForSelector('.side-panel-right .print-report-card', { timeout: 8000 });

      const modalContent = await page.textContent('.side-panel-right');
      assert.ok(modalContent?.includes('Kattankudy Central College'));
      assert.ok(modalContent?.includes('Academic Performance by Subject'));
      assert.ok(modalContent?.includes('Admission Number:'));
    } finally {
      // Close the report card modal safely
      const closeBtn = page.locator('.side-panel-right button[title="Close Panel"]');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForSelector('.side-panel-overlay', { state: 'detached', timeout: 5000 }).catch(() => {});
      }
    }
  });

  it('5. Marks Review & Approval Queue Tab', async () => {
    // Switch to Review & Approvals tab
    const reviewTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Review & Approvals' });
    await reviewTab.click();

    await page.waitForSelector('.data-table', { timeout: 5000 });
    const reviewText = await page.textContent('.page-container');
    assert.ok(reviewText?.includes('Independent Marks Review & Approval Queue'));
    assert.ok(reviewText?.includes('Grade 8-A'));

    // Click revision history button for first sheet
    const historyBtn = page.locator('.data-table button[title="View Revision Audit Trail"]').first();
    if (await historyBtn.isVisible()) {
      await historyBtn.click();
      await page.waitForSelector('.modal-content', { timeout: 5000 });
      const modalText = await page.textContent('.modal-content');
      assert.ok(modalText?.includes('Marks Sheet Revision History & Provenance'));

      // Close history modal
      const closeHistory = page.locator('.modal-footer button:has-text("Close")');
      await closeHistory.click();
      await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    }
  });

  it('6. Assessment Policies Governance Tab', async () => {
    // Switch to Assessment Policies tab
    const policiesTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Assessment Policies' });
    await policiesTab.click();

    await page.waitForSelector('.card', { timeout: 5000 });
    const policiesText = await page.textContent('.page-container');
    assert.ok(policiesText?.includes('Assessment Policies'));
    assert.ok(policiesText?.includes('KCC-SEC-STD-2026-V1') || policiesText?.includes('Grading Scales'));
  });

  it('7. Controlled Results Publication & Release Tab', async () => {
    // Switch to Publication & Release tab
    const pubTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Publication & Release' });
    await pubTab.click();

    // Select Term 1 Assessment 2026 if not selected
    const examSelect = page.locator('label:has-text("Active Examination") + select').first();
    if (await examSelect.isVisible()) {
      const options = await examSelect.locator('option').allTextContents();
      const term1Opt = options.find((o) => o.includes('Term 1 Assessment 2026'));
      if (term1Opt) {
        await examSelect.selectOption({ label: term1Opt });
      }
    }

    await page.waitForSelector('.readiness-item', { timeout: 6000 });
    const pubText = await page.textContent('.page-container');
    assert.ok(pubText?.includes('Pre-Publication Integrity Verification Checklist'));
    assert.ok(pubText?.includes('Approved Examination Schedule'));
    assert.ok(pubText?.includes('Marks Sheet Coverage'));
    assert.ok(pubText?.includes('Confirmed Subject Enrolments'));
  });

  it('8. Post-Publication Corrections History Tab', async () => {
    // Switch to Post-Publication Corrections tab
    const correctionsTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Post-Publication Corrections' });
    await correctionsTab.click();

    await page.waitForSelector('.data-table', { timeout: 5000 });
    const correctionsText = await page.textContent('.page-container');
    assert.ok(correctionsText?.includes('Previous vs Requested Mark') || correctionsText?.includes('Correction Category'));
  });

  it('9. Teacher Role Scoping & Separation of Duties Boundary Checks', async () => {
    // Logout from Principal
    const logoutBtn = page.locator('button[aria-label="Sign Out"], button[title="Sign Out"]').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    } else {
      await page.goto(`${appBaseUrl}/#/login`);
    }

    await page.waitForSelector('input[type="text"], input[name="username"]', { timeout: 8000 });

    // Login as Subject Teacher (Mr. Samantha Silva)
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    await usernameInput.fill('teacher_samantha');
    await passwordInput.fill('teacher123');
    await submitBtn.click();

    // Wait for Dashboard and navigate to Marks tab
    await page.waitForSelector('.app-container', { timeout: 8000 });
    const marksNavBtn = page.locator('.nav-item').filter({ hasText: 'Marks Management' });
    await marksNavBtn.click();

    await page.waitForSelector('h2:has-text("Examination Management Workspace")', { timeout: 6000 });

    // Verify teacher does NOT see Principal badge
    const badges = await page.locator('.badge').allTextContents();
    assert.ok(!badges.some((b) => b.includes('Principal')));

    // Verify teacher cannot publish examination
    const pubTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Publication & Release' });
    await pubTab.click();
    await page.waitForTimeout(500);

    // Publish Results button should not be available or enabled for subject teacher
    const publishBtn = page.locator('button:has-text("Publish Results Officially")');
    const isVisible = await publishBtn.isVisible().catch(() => false);
    assert.strictEqual(isVisible, false, 'Ordinary teacher must not see or access the Publish Results action.');
  });
});
