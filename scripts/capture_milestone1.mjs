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

  // 1. Desktop Light Context
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await desktopContext.newPage();

  await page.addInitScript(() => {
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

  await page.goto(`${url}/#/design-system`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Screenshot 1: Desktop Full Preview
  const shot1 = path.join(outDir, 'milestone1_desktop.png');
  await page.screenshot({ path: shot1, fullPage: true });
  fs.copyFileSync(shot1, path.join(docsDir, 'milestone1_desktop.png'));
  console.log('Saved shot 1:', shot1);

  // Screenshot 2: Modal Open
  await page.locator('button:has-text("Open Medium Modal")').click();
  await page.waitForSelector('.sk-modal-dialog', { state: 'visible' });
  await page.waitForTimeout(300);
  const shot2 = path.join(outDir, 'milestone1_modal.png');
  await page.screenshot({ path: shot2 });
  fs.copyFileSync(shot2, path.join(docsDir, 'milestone1_modal.png'));
  console.log('Saved shot 2:', shot2);

  // Close modal and trigger Toast
  await page.locator('button:has-text("Cancel")').click();
  await page.waitForTimeout(200);

  await page.locator('button:has-text("Trigger \\"Mark All Present\\"")').click();
  await page.waitForSelector('.sk-toast', { state: 'visible' });
  await page.waitForTimeout(300);
  const shot3 = path.join(outDir, 'milestone1_toast.png');
  await page.screenshot({ path: shot3 });
  fs.copyFileSync(shot3, path.join(docsDir, 'milestone1_toast.png'));
  console.log('Saved shot 3:', shot3);

  // Screenshot 4: Dark Theme
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(300);
  const shot4 = path.join(outDir, 'milestone1_dark.png');
  await page.screenshot({ path: shot4, fullPage: true });
  fs.copyFileSync(shot4, path.join(docsDir, 'milestone1_dark.png'));
  console.log('Saved shot 4:', shot4);

  await desktopContext.close();

  // 2. Mobile Context (iPhone 12/13/14: 390x844)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
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

  await mobilePage.goto(`${url}/#/design-system`, { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(500);

  // Screenshot 5: Mobile View
  const shot5 = path.join(outDir, 'milestone1_mobile.png');
  await mobilePage.screenshot({ path: shot5, fullPage: true });
  fs.copyFileSync(shot5, path.join(docsDir, 'milestone1_mobile.png'));
  console.log('Saved shot 5:', shot5);

  // Screenshot 6: Mobile Bottom Sheet Modal
  await mobilePage.locator('button:has-text("Open Small Dialog")').click();
  await mobilePage.waitForSelector('.sk-modal-dialog', { state: 'visible' });
  await mobilePage.waitForTimeout(300);
  const shot6 = path.join(outDir, 'milestone1_bottom_sheet.png');
  await mobilePage.screenshot({ path: shot6 });
  fs.copyFileSync(shot6, path.join(docsDir, 'milestone1_bottom_sheet.png'));
  console.log('Saved shot 6:', shot6);

  await mobileContext.close();
  await browser.close();
  server.close();
  console.log('All screenshots captured successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
