import { chromium } from '../server/node_modules/playwright/index.mjs';

async function test() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage();
  const errors = [];
  page.on('response', res => {
    if (res.status() >= 400) {
      console.log('Resource 404/Error:', res.status(), res.url());
    }
  });
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  console.log('Navigating to http://localhost:5173/...');
  const res = await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(2000);
  const title = await page.title();
  const hasOverlay = await page.$('vite-error-overlay');
  console.log('Status:', res.status(), 'Title:', title, 'HasOverlay:', !!hasOverlay, 'Errors:', errors);
  await page.screenshot({ path: 'scratch/verified_localhost.png' });
  await browser.close();
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});


