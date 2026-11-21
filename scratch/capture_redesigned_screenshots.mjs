import { chromium } from '../server/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const BASE_URL = 'http://127.0.0.1:5173';
const OUT_DIR = 'redesigned_screenshots';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function run() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  
  const viewports = [
    { name: '01_redesigned_principal_desktop_1440.png', width: 1440, height: 900, user: 'admin', pass: 'admin123', mobile: false },
    { name: '02_redesigned_principal_desktop_1280.png', width: 1280, height: 800, user: 'admin', pass: 'admin123', mobile: false },
    { name: '03_redesigned_principal_tablet_1024.png', width: 1024, height: 768, user: 'admin', pass: 'admin123', mobile: false },
    { name: '04_redesigned_principal_tablet_768.png', width: 768, height: 1024, user: 'admin', pass: 'admin123', mobile: false },
    { name: '05_redesigned_principal_mobile_390.png', width: 390, height: 844, user: 'admin', pass: 'admin123', mobile: true },
    { name: '06_redesigned_principal_mobile_375.png', width: 375, height: 812, user: 'admin', pass: 'admin123', mobile: true },
    { name: '07_redesigned_section_head_desktop_1280.png', width: 1280, height: 800, user: 'section_head_junior', pass: 'teacher123', mobile: false },
    { name: '08_redesigned_section_head_mobile_375.png', width: 375, height: 812, user: 'section_head_junior', pass: 'teacher123', mobile: true }
  ];

  for (const vp of viewports) {
    console.log(`Capturing ${vp.name}...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile
    });
    const page = await context.newPage();
    
    // Navigate to root
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    
    // Fill credentials
    await page.fill('input#username, input[name="username"], input[type="text"]', vp.user);
    await page.fill('input#password, input[name="password"], input[type="password"]', vp.pass);
    await page.click('button[type="submit"]');
    
    // Wait for Dashboard container
    await page.waitForSelector('.kcc-dashboard, .kcc-dash-title', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: `${OUT_DIR}/${vp.name}`, fullPage: false });
    await context.close();
  }

  await browser.close();
  console.log('Finished capturing all redesigned screenshots in', OUT_DIR);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
