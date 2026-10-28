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

async function main() {
  const { server, url } = await createStaticServer(distDir);
  console.log('Serving client on:', url);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  }

  // --- 1. Login Page (Desktop) ---
  const loginContext = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${url}/#/login`, { waitUntil: 'networkidle' });
  await loginPage.waitForSelector('.login-card-container', { state: 'visible' });
  await loginPage.waitForTimeout(400);

  const shotLogin = path.join(outDir, 'milestone2_login.png');
  await loginPage.screenshot({ path: shotLogin });
  fs.copyFileSync(shotLogin, path.join(docsDir, 'milestone2_login.png'));
  console.log('Saved Login screenshot:', shotLogin);
  await loginContext.close();

  // --- 2. Desktop Shell - Expanded Sidebar (240px) ---
  const desktopExpandedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const expandedPage = await desktopExpandedContext.newPage();
  await expandedPage.addInitScript(() => {
    localStorage.setItem('skoolsys_token', 'synthetic-token');
    localStorage.setItem(
      'skoolsys_user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        full_name: 'Dr. M. S. M. Anfas',
        role: 'admin'
      })
    );
    localStorage.setItem('skoolsys_sidebar_collapsed', 'false');
    localStorage.setItem('skoolsys_theme', 'light');
  });

  await expandedPage.goto(`${url}/#/dashboard`, { waitUntil: 'networkidle' });
  await expandedPage.waitForSelector('.sidebar', { state: 'visible' });
  await expandedPage.waitForSelector('.top-navbar', { state: 'visible' });
  await expandedPage.waitForTimeout(500);

  const shotExpanded = path.join(outDir, 'milestone2_desktop_expanded.png');
  await expandedPage.screenshot({ path: shotExpanded });
  fs.copyFileSync(shotExpanded, path.join(docsDir, 'milestone2_desktop_expanded.png'));
  console.log('Saved Desktop Expanded screenshot:', shotExpanded);

  // --- 3. Desktop Shell - Collapsed Sidebar (68px) ---
  const collapseBtn = expandedPage.locator('.sidebar-collapse-toggle');
  if (await collapseBtn.isVisible()) {
    await collapseBtn.click();
    await expandedPage.waitForTimeout(400);
  }

  const shotCollapsed = path.join(outDir, 'milestone2_desktop_collapsed.png');
  await expandedPage.screenshot({ path: shotCollapsed });
  fs.copyFileSync(shotCollapsed, path.join(docsDir, 'milestone2_desktop_collapsed.png'));
  console.log('Saved Desktop Collapsed screenshot:', shotCollapsed);
  await desktopExpandedContext.close();

  // --- 4. Mobile Shell - Bottom Navigation (390px) ---
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.addInitScript(() => {
    localStorage.setItem('skoolsys_token', 'synthetic-token');
    localStorage.setItem(
      'skoolsys_user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        full_name: 'Dr. M. S. M. Anfas',
        role: 'admin'
      })
    );
    localStorage.setItem('skoolsys_theme', 'light');
  });

  await mobilePage.goto(`${url}/#/dashboard`, { waitUntil: 'networkidle' });
  await mobilePage.waitForSelector('.mobile-bottom-nav', { state: 'visible' });
  await mobilePage.waitForTimeout(500);

  const shotMobile = path.join(outDir, 'milestone2_mobile_bottom_nav.png');
  await mobilePage.screenshot({ path: shotMobile });
  fs.copyFileSync(shotMobile, path.join(docsDir, 'milestone2_mobile_bottom_nav.png'));
  console.log('Saved Mobile Bottom Nav screenshot:', shotMobile);
  await mobileContext.close();

  // --- 5. Desktop Dark Shell ---
  const darkContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const darkPage = await darkContext.newPage();
  await darkPage.addInitScript(() => {
    localStorage.setItem('skoolsys_token', 'synthetic-token');
    localStorage.setItem(
      'skoolsys_user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        full_name: 'Dr. M. S. M. Anfas',
        role: 'admin'
      })
    );
    localStorage.setItem('skoolsys_sidebar_collapsed', 'false');
    localStorage.setItem('skoolsys_theme', 'dark');
  });
  await darkPage.goto(`${url}/#/dashboard`, { waitUntil: 'networkidle' });
  await darkPage.waitForSelector('.sidebar', { state: 'visible' });
  await darkPage.waitForTimeout(500);

  const shotDark = path.join(outDir, 'milestone2_desktop_dark.png');
  await darkPage.screenshot({ path: shotDark });
  fs.copyFileSync(shotDark, path.join(docsDir, 'milestone2_desktop_dark.png'));
  console.log('Saved Desktop Dark screenshot:', shotDark);
  await darkContext.close();

  await browser.close();
  server.close();
  console.log('All Milestone 2 screenshots captured successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
