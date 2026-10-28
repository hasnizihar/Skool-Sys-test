import { chromium } from '../server/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';

async function launchSupportedBrowser() {
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

async function captureLogin() {
  const browser = await launchSupportedBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173/#/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });

  const outDir = 'C:/Users/Haction Lanka/.gemini/antigravity/brain/61731a68-ae88-46dd-8df2-9fd5efd0ae72';
  const shotPath = path.join(outDir, 'login_current.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log('Saved login shot:', shotPath);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:5173/#/login', { waitUntil: 'networkidle' });
  const mobileShotPath = path.join(outDir, 'login_mobile.png');
  await mobilePage.screenshot({ path: mobileShotPath, fullPage: true });
  console.log('Saved mobile login shot:', mobileShotPath);

  await browser.close();
}

captureLogin().catch(console.error);
