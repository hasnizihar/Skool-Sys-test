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

async function setupCommonRoutes(page) {
  await page.route('**/api/auth/me', async (route) => {
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
          { id: 1, name: 'Grade 8-A', grade_level: 8, class_teacher_name: 'Mrs. Nimali Jayasinghe', academic_year_id: 1 },
          { id: 2, name: 'Grade 8-B', grade_level: 8, class_teacher_name: 'Mr. K. Theivendran', academic_year_id: 1 }
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

  // --- 1. Desktop Attendance Register View ---
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });
  const desktopPage = await desktopContext.newPage();
  await setupCommonRoutes(desktopPage);

  await desktopPage.route('**/api/attendance/session*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: { id: 101, class_id: 1, date: '2026-10-28', status: 'draft', revision: 2, taken_by_name: 'Mrs. Nimali Jayasinghe' },
        serverRevision: 2,
        rosterFingerprint: 'sha256-kcc-roster-fingerprint-v2',
        students: [
          { student_id: 101, admission_no: 'KCC-2024-001', full_name: 'Mohamed Aathif', calling_name: 'Aathif', roll_number: 1, attendance_status: 'present', attendance_remarks: '' },
          { student_id: 102, admission_no: 'KCC-2024-002', full_name: 'Fathima Rinosha', calling_name: 'Rinosha', roll_number: 2, attendance_status: 'present', attendance_remarks: '' },
          { student_id: 103, admission_no: 'KCC-2024-003', full_name: 'Ahmed Safras', calling_name: 'Safras', roll_number: 3, attendance_status: 'absent', attendance_remarks: 'Sick Leave; Medical' },
          { student_id: 104, admission_no: 'KCC-2024-004', full_name: 'Aysha Nuha', calling_name: 'Nuha', roll_number: 4, attendance_status: 'late', attendance_remarks: 'Transport' },
          { student_id: 105, admission_no: 'KCC-2024-005', full_name: 'Mohamed Zaid', calling_name: 'Zaid', roll_number: 5, attendance_status: 'excused', attendance_remarks: 'Official Duty' },
          { student_id: 106, admission_no: 'KCC-2024-006', full_name: 'Maryam Safiya', calling_name: 'Safiya', roll_number: 6, attendance_status: 'present', attendance_remarks: '' },
          { student_id: 107, admission_no: 'KCC-2024-007', full_name: 'Ibrahim Farhan', calling_name: 'Farhan', roll_number: 7, attendance_status: 'present', attendance_remarks: '' },
          { student_id: 108, admission_no: 'KCC-2024-008', full_name: 'Kavindi Senaratne', calling_name: 'Kavindi', roll_number: 8, attendance_status: 'present', attendance_remarks: '' }
        ]
      })
    });
  });

  await desktopPage.addInitScript(() => {
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

  await desktopPage.goto(`${url}/#/attendance`, { waitUntil: 'networkidle' });
  await desktopPage.waitForSelector('.attendance-page', { state: 'visible' });
  await desktopPage.waitForSelector('text=Mohamed Aathif', { state: 'visible' });
  await desktopPage.waitForTimeout(500);

  const shot1 = path.join(outDir, 'milestone3_attendance_desktop.png');
  await desktopPage.screenshot({ path: shot1 });
  fs.copyFileSync(shot1, path.join(docsDir, 'milestone3_attendance_desktop.png'));
  console.log('Saved Shot 1 (Desktop Attendance):', shot1);

  // --- 2. Mobile Attendance Register View (390px iPhone Viewport) ---
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
  });
  const mobilePage = await mobileContext.newPage();
  await setupCommonRoutes(mobilePage);

  await mobilePage.route('**/api/attendance/session*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: { id: 101, class_id: 1, date: '2026-10-28', status: 'draft', revision: 2, taken_by_name: 'Mrs. Nimali Jayasinghe' },
        serverRevision: 2,
        rosterFingerprint: 'sha256-kcc-roster-fingerprint-v2',
        students: [
          { student_id: 101, admission_no: 'KCC-2024-001', full_name: 'Mohamed Aathif', calling_name: 'Aathif', roll_number: 1, attendance_status: 'present', attendance_remarks: '' },
          { student_id: 102, admission_no: 'KCC-2024-002', full_name: 'Fathima Rinosha', calling_name: 'Rinosha', roll_number: 2, attendance_status: 'present', attendance_remarks: '' },
          { student_id: 103, admission_no: 'KCC-2024-003', full_name: 'Ahmed Safras', calling_name: 'Safras', roll_number: 3, attendance_status: 'absent', attendance_remarks: 'Sick Leave' }
        ]
      })
    });
  });

  await mobilePage.addInitScript(() => {
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
  });

  await mobilePage.goto(`${url}/#/attendance`, { waitUntil: 'networkidle' });
  await mobilePage.waitForSelector('.attendance-page', { state: 'visible' });
  await mobilePage.waitForSelector('.attendance-btn-group', { state: 'visible' });
  await mobilePage.waitForTimeout(500);

  const shot2 = path.join(outDir, 'milestone3_attendance_mobile.png');
  await mobilePage.screenshot({ path: shot2 });
  fs.copyFileSync(shot2, path.join(docsDir, 'milestone3_attendance_mobile.png'));
  console.log('Saved Shot 2 (Mobile Attendance):', shot2);
  await mobileContext.close();

  // --- 3. Concurrency Conflict Resolution Modal ---
  await desktopPage.unroute('**/api/attendance/session*');
  await desktopPage.route('**/api/attendance/session*', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://skoolsys.kcc.sch.lk/problems/concurrency-conflict',
          title: 'Attendance Register Concurrency Conflict',
          status: 409,
          code: 'CONCURRENCY_REVISION_MISMATCH',
          detail: 'Another user submitted changes to Grade 8-A register advancing server revision to 3.',
          serverRevision: 3,
          baseRevision: 2
        })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { id: 101, class_id: 1, date: '2026-10-28', status: 'draft', revision: 3, taken_by_name: 'Dr. M. S. M. Anfas' },
          serverRevision: 3,
          rosterFingerprint: 'sha256-kcc-roster-fingerprint-v2',
          records: [
            { student_id: 101, status: 'present', remarks: '' },
            { student_id: 102, status: 'absent', remarks: 'Unexcused' },
            { student_id: 103, status: 'present', remarks: 'Arrived at 8:30 AM' },
            { student_id: 104, status: 'late', remarks: 'Transport' }
          ],
          students: [
            { student_id: 101, admission_no: 'KCC-2024-001', full_name: 'Mohamed Aathif', calling_name: 'Aathif', roll_number: 1 },
            { student_id: 102, admission_no: 'KCC-2024-002', full_name: 'Fathima Rinosha', calling_name: 'Rinosha', roll_number: 2 },
            { student_id: 103, admission_no: 'KCC-2024-003', full_name: 'Ahmed Safras', calling_name: 'Safras', roll_number: 3 },
            { student_id: 104, admission_no: 'KCC-2024-004', full_name: 'Aysha Nuha', calling_name: 'Nuha', roll_number: 4 }
          ]
        })
      });
    }
  });

  const submitBtn = desktopPage.locator('button:has-text("Submit Final Register"), button:has-text("Update Register")');
  await submitBtn.click();
  await desktopPage.waitForSelector('text=Student-by-Student Concurrency Conflict Resolution', { state: 'visible', timeout: 8000 });
  await desktopPage.waitForTimeout(500);

  const shot3 = path.join(outDir, 'milestone3_conflict_modal.png');
  await desktopPage.screenshot({ path: shot3 });
  fs.copyFileSync(shot3, path.join(docsDir, 'milestone3_conflict_modal.png'));
  console.log('Saved Shot 3 (Conflict Modal):', shot3);

  // Close conflict modal by clicking reload server
  await desktopPage.locator('button:has-text("Discard & Reload Server")').click();
  await desktopPage.waitForTimeout(300);

  // --- 4. Offline State & Offline Banner ---
  await desktopPage.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });
  await desktopPage.waitForTimeout(400);

  const shot4 = path.join(outDir, 'milestone3_offline_state.png');
  await desktopPage.screenshot({ path: shot4 });
  fs.copyFileSync(shot4, path.join(docsDir, 'milestone3_offline_state.png'));
  console.log('Saved Shot 4 (Offline State):', shot4);

  await desktopContext.close();
  await browser.close();
  server.close();
  console.log('All Milestone 3 screenshots captured successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
