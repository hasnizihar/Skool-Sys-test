import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../server/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../client/dist');
const outDir = 'C:\\Users\\Haction Lanka\\.gemini\\antigravity\\brain\\61731a68-ae88-46dd-8df2-9fd5efd0ae72';
const docsDir = path.resolve(__dirname, '../docs/screenshots');

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

function createStaticServer(dist) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url ? req.url.split('?')[0] : '/';
      let filePath = path.join(dist, reqPath === '/' ? 'index.html' : reqPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(dist, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
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
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function setupCommonRoutes(page, role = 'admin') {
  await page.route('**/api/auth/me', async (route) => {
    if (role === 'class_teacher') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 2,
            username: 'teacher_nimali',
            full_name: 'Mrs. Nimali Jayasinghe',
            role: 'class_teacher',
            assignedClassIds: [1]
          }
        })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 1,
            username: 'admin',
            full_name: 'Dr. M. A. C. Mohamed Principal',
            role: 'admin',
            academicLeadershipRole: 'Principal'
          }
        })
      });
    }
  });

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'healthy', system: 'SkoolSys' })
    });
  });

  await page.route('**/api/academic/classes*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        classes: [
          { id: 1, name: 'Grade 8-A', grade: 8, grade_level: 8, class_teacher_name: 'Mrs. Nimali Jayasinghe', academic_year_id: 1 },
          { id: 2, name: 'Grade 8-B', grade: 8, grade_level: 8, class_teacher_name: 'Mr. K. Theivendran', academic_year_id: 1 }
        ]
      })
    });
  });

  await page.route('**/api/academic/period/active', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ activePeriod: 'Academic Year 2026 • Term 1 Assessment Period' })
    });
  });

  await page.route('**/api/academic/years', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        years: [{ id: 1, name: '2026', is_current: 1 }]
      })
    });
  });

  await page.route('**/api/academic/years/1/terms', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        terms: [{ id: 1, name: 'Term 1', is_current: 1 }]
      })
    });
  });
}

async function main() {
  const { server, url } = await createStaticServer(distDir);
  console.log(`[Capture] Static server running at ${url}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  }

  try {
    // 1. Desktop Expanded Sidebar & Top Navbar (Admin Role)
    console.log('[Capture] 1. Desktop Expanded Navigation (Admin)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const desktopPage = await desktopContext.newPage();
    await setupCommonRoutes(desktopPage, 'admin');

    await desktopPage.addInitScript(() => {
      localStorage.setItem('skoolsys_token', 'synthetic-token');
      localStorage.setItem(
        'skoolsys_user',
        JSON.stringify({
          id: 1,
          username: 'admin',
          full_name: 'Dr. M. A. C. Mohamed Principal',
          role: 'admin',
          academicLeadershipRole: 'Principal'
        })
      );
      localStorage.setItem('skoolsys_theme', 'light');
      localStorage.setItem('skoolsys_sidebar_collapsed', 'false');
    });

    await desktopPage.goto(`${url}/#/dashboard`, { waitUntil: 'networkidle' });
    await desktopPage.waitForSelector('.sidebar', { timeout: 8000 });
    await desktopPage.waitForSelector('.top-navbar', { timeout: 8000 });
    await desktopPage.waitForTimeout(600);

    const shot1Brain = path.join(outDir, 'nav_desktop_expanded_admin.png');
    const shot1Docs = path.join(docsDir, 'nav_desktop_expanded_admin.png');
    await desktopPage.screenshot({ path: shot1Brain });
    fs.copyFileSync(shot1Brain, shot1Docs);
    console.log(`[Capture] Saved ${shot1Brain}`);

    // 2. Desktop Collapsed Sidebar Mode
    console.log('[Capture] 2. Desktop Collapsed Navigation...');
    const collapseToggle = desktopPage.locator('.sidebar-collapse-toggle');
    if (await collapseToggle.isVisible()) {
      await collapseToggle.click();
      await desktopPage.waitForTimeout(500);
    }

    const shot2Brain = path.join(outDir, 'nav_desktop_collapsed_admin.png');
    const shot2Docs = path.join(docsDir, 'nav_desktop_collapsed_admin.png');
    await desktopPage.screenshot({ path: shot2Brain });
    fs.copyFileSync(shot2Brain, shot2Docs);
    console.log(`[Capture] Saved ${shot2Brain}`);

    await desktopContext.close();

    // 3. Desktop Navigation (Class Teacher Role)
    console.log('[Capture] 3. Desktop Navigation (Teacher Role)...');
    const teacherContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const teacherPage = await teacherContext.newPage();
    await setupCommonRoutes(teacherPage, 'class_teacher');

    await teacherPage.addInitScript(() => {
      localStorage.setItem('skoolsys_token', 'synthetic-token');
      localStorage.setItem(
        'skoolsys_user',
        JSON.stringify({
          id: 2,
          username: 'teacher_nimali',
          full_name: 'Mrs. Nimali Jayasinghe',
          role: 'class_teacher',
          assignedClassIds: [1]
        })
      );
      localStorage.setItem('skoolsys_theme', 'light');
      localStorage.setItem('skoolsys_sidebar_collapsed', 'false');
    });

    await teacherPage.goto(`${url}/#/dashboard`, { waitUntil: 'networkidle' });
    await teacherPage.waitForSelector('.sidebar', { timeout: 8000 });
    await teacherPage.waitForTimeout(600);

    const shot3Brain = path.join(outDir, 'nav_desktop_expanded_teacher.png');
    const shot3Docs = path.join(docsDir, 'nav_desktop_expanded_teacher.png');
    await teacherPage.screenshot({ path: shot3Brain });
    fs.copyFileSync(shot3Brain, shot3Docs);
    console.log(`[Capture] Saved ${shot3Brain}`);

    await teacherContext.close();

    // 4. Mobile Primary Navigation (Bottom Tab Bar at 390px)
    console.log('[Capture] 4. Mobile Bottom Navigation...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();
    await setupCommonRoutes(mobilePage, 'admin');

    await mobilePage.addInitScript(() => {
      localStorage.setItem('skoolsys_token', 'synthetic-token');
      localStorage.setItem(
        'skoolsys_user',
        JSON.stringify({
          id: 1,
          username: 'admin',
          full_name: 'Dr. M. A. C. Mohamed Principal',
          role: 'admin',
          academicLeadershipRole: 'Principal'
        })
      );
      localStorage.setItem('skoolsys_theme', 'light');
    });

    await mobilePage.goto(`${url}/#/dashboard`, { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('.mobile-bottom-nav', { timeout: 8000 });
    await mobilePage.waitForTimeout(600);

    const shot4Brain = path.join(outDir, 'nav_mobile_bottom_nav.png');
    const shot4Docs = path.join(docsDir, 'nav_mobile_bottom_nav.png');
    await mobilePage.screenshot({ path: shot4Brain });
    fs.copyFileSync(shot4Brain, shot4Docs);
    console.log(`[Capture] Saved ${shot4Brain}`);

    // 5. Mobile Secondary Navigation / Slide-Over Drawer
    console.log('[Capture] 5. Mobile Drawer Open...');
    const moreBtn = mobilePage.locator('.mobile-nav-btn:has-text("More")');
    await moreBtn.click();
    await mobilePage.waitForSelector('.sidebar.open', { timeout: 8000 });
    await mobilePage.waitForTimeout(500);

    const shot5Brain = path.join(outDir, 'nav_mobile_drawer_open.png');
    const shot5Docs = path.join(docsDir, 'nav_mobile_drawer_open.png');
    await mobilePage.screenshot({ path: shot5Brain });
    fs.copyFileSync(shot5Brain, shot5Docs);
    console.log(`[Capture] Saved ${shot5Brain}`);

    await mobileContext.close();

    // 6. Tablet View (768px width)
    console.log('[Capture] 6. Tablet Navigation (768px)...');
    const tabletContext = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 2
    });
    const tabletPage = await tabletContext.newPage();
    await setupCommonRoutes(tabletPage, 'admin');

    await tabletPage.addInitScript(() => {
      localStorage.setItem('skoolsys_token', 'synthetic-token');
      localStorage.setItem(
        'skoolsys_user',
        JSON.stringify({
          id: 1,
          username: 'admin',
          full_name: 'Dr. M. A. C. Mohamed Principal',
          role: 'admin',
          academicLeadershipRole: 'Principal'
        })
      );
      localStorage.setItem('skoolsys_theme', 'light');
    });

    await tabletPage.goto(`${url}/#/students`, { waitUntil: 'networkidle' });
    await tabletPage.waitForSelector('.top-navbar', { timeout: 8000 });
    await tabletPage.waitForTimeout(600);

    const shot6Brain = path.join(outDir, 'nav_tablet_view.png');
    const shot6Docs = path.join(docsDir, 'nav_tablet_view.png');
    await tabletPage.screenshot({ path: shot6Brain });
    fs.copyFileSync(shot6Brain, shot6Docs);
    console.log(`[Capture] Saved ${shot6Brain}`);

    await tabletContext.close();

    console.log('✅ All Navigation Refinement screenshots captured successfully!');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[Capture Error]', err);
  process.exit(1);
});
