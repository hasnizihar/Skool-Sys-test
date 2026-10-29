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
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

// 18 official classes for Kattankudy Central College
const mockClasses = [
  { id: 1, name: 'Grade 6-A', class_name: 'Grade 6-A', grade: 6, class_teacher_name: 'M. H. M. Fazil' },
  { id: 2, name: 'Grade 6-B', class_name: 'Grade 6-B', grade: 6, class_teacher_name: 'A. L. M. Rauf' },
  { id: 3, name: 'Grade 7-A', class_name: 'Grade 7-A', grade: 7, class_teacher_name: 'S. H. Fathima' },
  { id: 4, name: 'Grade 7-B', class_name: 'Grade 7-B', grade: 7, class_teacher_name: 'K. L. Naleer' },
  { id: 5, name: 'Grade 8-A', class_name: 'Grade 8-A', grade: 8, class_teacher_name: 'T. M. Junaid' },
  { id: 6, name: 'Grade 8-B', class_name: 'Grade 8-B', grade: 8, class_teacher_name: 'M. I. Safana' },
  { id: 7, name: 'Grade 9-A', class_name: 'Grade 9-A', grade: 9, class_teacher_name: 'A. C. M. Riyas' },
  { id: 8, name: 'Grade 9-B', class_name: 'Grade 9-B', grade: 9, class_teacher_name: 'N. F. Zakeeya' },
  { id: 9, name: 'Grade 10-A', class_name: 'Grade 10-A', grade: 10, class_teacher_name: 'P. M. Hafeel' },
  { id: 10, name: 'Grade 10-B', class_name: 'Grade 10-B', grade: 10, class_teacher_name: 'M. S. M. Ashraff' },
  { id: 11, name: 'Grade 11-A', class_name: 'Grade 11-A', grade: 11, class_teacher_name: 'A. R. M. Nazeer' },
  { id: 12, name: 'Grade 11-B', class_name: 'Grade 11-B', grade: 11, class_teacher_name: 'R. M. Razick' },
  { id: 13, name: 'Grade 12-Bio', class_name: 'Grade 12-Bio', grade: 12, class_teacher_name: 'Dr. A. L. Samad' },
  { id: 14, name: 'Grade 12-Maths', class_name: 'Grade 12-Maths', grade: 12, class_teacher_name: 'Eng. K. M. Kaleel' },
  { id: 15, name: 'Grade 12-Commerce', class_name: 'Grade 12-Commerce', grade: 12, class_teacher_name: 'M. T. M. Hameed' },
  { id: 16, name: 'Grade 13-Bio', class_name: 'Grade 13-Bio', grade: 13, class_teacher_name: 'Dr. S. L. Shifana' },
  { id: 17, name: 'Grade 13-Maths', class_name: 'Grade 13-Maths', grade: 13, class_teacher_name: 'M. I. Irfan' },
  { id: 18, name: 'Grade 13-Arts', class_name: 'Grade 13-Arts', grade: 13, class_teacher_name: 'U. L. M. Farook' }
];

const mockDailyClasses = mockClasses.map((c, i) => {
  const isSubmitted = i < 14; // 14 submitted, 4 pending
  const enrolled = 35 + (i % 8);
  const present = isSubmitted ? enrolled - (i % 4) : 0;
  const absent = isSubmitted ? enrolled - present : 0;
  return {
    class_id: c.id,
    class_name: c.name,
    grade: c.grade,
    class_teacher_name: c.class_teacher_name,
    session_id: isSubmitted ? 100 + c.id : null,
    session_status: isSubmitted ? 'submitted' : null,
    enrolled_count: enrolled,
    present_count: present,
    absent_count: absent,
    late_count: isSubmitted ? (i % 3) : 0
  };
});

const mockAbsentStudents = [
  { id: 101, admission_no: 'SCH-2024-004', full_name: 'Ahamed Rizwan', class_name: 'Grade 8-A', guardian_name: 'M. I. Rizwan', guardian_phone: '077-1234567' },
  { id: 102, admission_no: 'SCH-2024-012', full_name: 'Fathima Nusra', class_name: 'Grade 8-A', guardian_name: 'A. H. Nusra', guardian_phone: '071-9876543' },
  { id: 103, admission_no: 'SCH-2024-035', full_name: 'Mohamed Akram', class_name: 'Grade 9-B', guardian_name: 'K. L. Akram', guardian_phone: '076-5544332' },
  { id: 104, admission_no: 'SCH-2024-048', full_name: 'Ayesha Marzook', class_name: 'Grade 10-A', guardian_name: 'M. T. Marzook', guardian_phone: '075-8899001' },
  { id: 105, admission_no: 'SCH-2024-062', full_name: 'Salman Faris', class_name: 'Grade 11-B', guardian_name: 'S. H. Faris', guardian_phone: '078-3322110' }
];

const mockAuditLogs = [
  { id: 1, timestamp: '2026-10-28T08:15:22.000Z', username: 'junaid.tm', action: 'ATTENDANCE_SUBMIT', entity_type: 'attendance_sessions', details: 'Submitted Grade 8-A daily roll-call: 36 Present, 2 Absent' },
  { id: 2, timestamp: '2026-10-28T08:10:45.000Z', username: 'fazil.mhm', action: 'ATTENDANCE_SUBMIT', entity_type: 'attendance_sessions', details: 'Submitted Grade 6-A daily roll-call: 38 Present, 1 Absent' },
  { id: 3, timestamp: '2026-10-28T07:55:10.000Z', username: 'admin', action: 'USER_LOGIN', entity_type: 'users', details: 'Successful authentication from 192.168.1.10' },
  { id: 4, timestamp: '2026-10-27T14:30:00.000Z', username: 'vp.academic', action: 'EXAM_APPROVE', entity_type: 'marks_sheets', details: 'Approved Term 1 Grade 8 Mathematics marks sheet' },
  { id: 5, timestamp: '2026-10-27T11:20:15.000Z', username: 'samad.al', action: 'MARKS_SUBMIT', entity_type: 'marks_sheets', details: 'Submitted Grade 12-Bio Biology marks sheet for moderation' }
];

const mockExams = [
  { id: 1, name: 'Term 1 Assessment 2026', term: 1, academic_year_id: 1, status: 'published' },
  { id: 2, name: 'Mid-Year Examination 2026', term: 2, academic_year_id: 1, status: 'active' },
  { id: 3, name: 'National G.C.E. O/L Pilot 2026', term: 3, academic_year_id: 1, status: 'scheduled' }
];

const mockFacultyUsers = mockClasses.map((c, i) => ({
  id: 10 + i,
  username: `teacher_${c.id}`,
  full_name: c.class_teacher_name,
  role: 'class_teacher',
  is_active: 1
}));

const adminUser = {
  id: 1,
  username: 'admin',
  full_name: 'Dr. A. B. M. Mansoor (Principal)',
  role: 'admin',
  authorizations: [{ auth_role: 'principal' }],
  assignments: []
};

async function setupRoutes(page, currentUser) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.includes('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: currentUser })
      });
    }

    if (path.includes('/admin/users')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [adminUser, ...mockFacultyUsers] })
      });
    }

    if (path.includes('/academic/classes')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ classes: mockClasses })
      });
    }

    if (path.includes('/attendance/session')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: null,
          students: [
            { student_id: 1, full_name: 'Kasun Ranasinghe', admission_no: 'SCH-001', roll_number: 1, attendance_status: 'unmarked' },
            { student_id: 2, full_name: 'Fazil Rifky', admission_no: 'SCH-002', roll_number: 2, attendance_status: 'unmarked' }
          ]
        })
      });
    }

    if (path.includes('/attendance/reports/daily')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          date: '2026-10-28',
          classes: mockDailyClasses,
          absentStudents: mockAbsentStudents
        })
      });
    }

    if (path.includes('/academic/examinations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ examinations: mockExams })
      });
    }

    if (path.includes('/students')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 684, students: [] })
      });
    }

    if (path.includes('/admin/audit-logs') || path.includes('/audit')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ logs: mockAuditLogs })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });
}

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

async function capture() {
  console.log('Starting Administrator Dashboard Visual Verification Captures...');
  const { server, url } = await createStaticServer(distDir);
  console.log(`Static server running at ${url}`);

  const browser = await launchSupportedBrowser();
  if (!browser) {
    throw new Error('Could not launch Chrome or Edge browser');
  }

  try {
    // ------------------------------------------------------------------------
    // Capture 1: Administrator Dashboard (Desktop 1440x900)
    // ------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await setupRoutes(page, adminUser);

      await page.addInitScript((user) => {
        localStorage.setItem('skoolsys_token', 'mock_admin_token');
        localStorage.setItem('skoolsys_user', JSON.stringify(user));
      }, adminUser);

      await page.goto(`${url}/#dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stat-card', { timeout: 10000 });
      await page.waitForTimeout(600);

      const filePath1 = path.join(docsDir, 'admin_dashboard_desktop.png');
      const outPath1 = path.join(outDir, 'admin_dashboard_desktop.png');
      await page.screenshot({ path: filePath1, fullPage: true });
      fs.copyFileSync(filePath1, outPath1);
      console.log('✓ Captured: admin_dashboard_desktop.png (1440x900)');

      // ------------------------------------------------------------------------
      // Capture 4: Attendance Matrix and Institutional Summary Close-up
      // ------------------------------------------------------------------------
      const matrixElement = await page.locator('.dashboard-card:has(.attendance-summary-bar)').first();
      const targetElement = (await matrixElement.count()) > 0 ? matrixElement : page.locator('.dashboard-grid-dual').first();
      const filePath4 = path.join(docsDir, 'admin_dashboard_attendance.png');
      const outPath4 = path.join(outDir, 'admin_dashboard_attendance.png');
      await targetElement.screenshot({ path: filePath4 });
      fs.copyFileSync(filePath4, outPath4);
      console.log('✓ Captured: admin_dashboard_attendance.png (Matrix & Summary close-up)');

      // ------------------------------------------------------------------------
      // Capture 5: Student Records Filter Card Close-up
      // ------------------------------------------------------------------------
      const studentNav = page.locator('.nav-item').filter({ hasText: 'Student Records' });
      if ((await studentNav.count()) > 0) {
        await studentNav.click();
        await page.waitForSelector('.students-filter-card', { timeout: 10000 });
        await page.waitForTimeout(600);
        const filterCard = page.locator('.students-filter-card').first();
        const filePath5 = path.join(docsDir, 'students_filter_card.png');
        const outPath5 = path.join(outDir, 'students_filter_card.png');
        await filterCard.screenshot({ path: filePath5 });
        fs.copyFileSync(filePath5, outPath5);
        console.log('✓ Captured: students_filter_card.png (Filter toolbar close-up)');
      }

      // ------------------------------------------------------------------------
      // Capture 6: Attendance Controls & Top Cards Close-up
      // ------------------------------------------------------------------------
      const attendanceNav = page.locator('.nav-item').filter({ hasText: 'Take Attendance' });
      if ((await attendanceNav.count()) > 0) {
        await attendanceNav.click();
        await page.waitForSelector('.attendance-controls-card', { timeout: 10000 });
        await page.waitForTimeout(600);
        const filePath6 = path.join(docsDir, 'attendance_controls_closeup.png');
        const outPath6 = path.join(outDir, 'attendance_controls_closeup.png');
        await page.screenshot({ path: filePath6 });
        fs.copyFileSync(filePath6, outPath6);
        console.log('✓ Captured: attendance_controls_closeup.png');
      }

      // ------------------------------------------------------------------------
      // Capture 7: Attendance Reports & Registry Close-up
      // ------------------------------------------------------------------------
      const reportsNav = page.locator('.nav-item').filter({ hasText: 'Attendance Reports' });
      if ((await reportsNav.count()) > 0) {
        await reportsNav.click();
        await page.waitForSelector('.attendance-reports-page', { timeout: 10000 });
        await page.waitForTimeout(600);
        const filePath7 = path.join(docsDir, 'attendance_reports_closeup.png');
        const outPath7 = path.join(outDir, 'attendance_reports_closeup.png');
        await page.screenshot({ path: filePath7 });
        fs.copyFileSync(filePath7, outPath7);
        console.log('✓ Captured: attendance_reports_closeup.png');
      }

      // ------------------------------------------------------------------------
      // Capture 8: Examination Workspace Close-up
      // ------------------------------------------------------------------------
      const marksNav = page.locator('.nav-item').filter({ hasText: 'Marks Management' });
      if ((await marksNav.count()) > 0) {
        await marksNav.click();
        await page.waitForSelector('.marks-workspace', { timeout: 10000 });
        await page.waitForTimeout(600);
        const filePath8 = path.join(docsDir, 'examinations_workspace_closeup.png');
        const outPath8 = path.join(outDir, 'examinations_workspace_closeup.png');
        await page.screenshot({ path: filePath8 });
        fs.copyFileSync(filePath8, outPath8);
        console.log('✓ Captured: examinations_workspace_closeup.png');
      }

      await context.close();
    }

    // ------------------------------------------------------------------------
    // Capture 2: Administrator Dashboard (Tablet 768x1024)
    // ------------------------------------------------------------------------
    {
      const context = await browser.newContext({
        viewport: { width: 768, height: 1024 },
        isMobile: false
      });
      const page = await context.newPage();
      await setupRoutes(page, adminUser);

      await page.addInitScript((user) => {
        localStorage.setItem('skoolsys_token', 'mock_admin_token');
        localStorage.setItem('skoolsys_user', JSON.stringify(user));
      }, adminUser);

      await page.goto(`${url}/#dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stat-card', { timeout: 10000 });
      await page.waitForTimeout(600);

      const filePath2 = path.join(docsDir, 'admin_dashboard_tablet.png');
      const outPath2 = path.join(outDir, 'admin_dashboard_tablet.png');
      await page.screenshot({ path: filePath2, fullPage: true });
      fs.copyFileSync(filePath2, outPath2);
      console.log('✓ Captured: admin_dashboard_tablet.png (768x1024)');

      await context.close();
    }

    // ------------------------------------------------------------------------
    // Capture 3: Administrator Dashboard (Mobile iPhone 390x844)
    // ------------------------------------------------------------------------
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();
      await setupRoutes(page, adminUser);

      await page.addInitScript((user) => {
        localStorage.setItem('skoolsys_token', 'mock_admin_token');
        localStorage.setItem('skoolsys_user', JSON.stringify(user));
      }, adminUser);

      await page.goto(`${url}/#dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stat-card', { timeout: 10000 });
      await page.waitForTimeout(600);

      const filePath3 = path.join(docsDir, 'admin_dashboard_mobile.png');
      const outPath3 = path.join(outDir, 'admin_dashboard_mobile.png');
      await page.screenshot({ path: filePath3, fullPage: true });
      fs.copyFileSync(filePath3, outPath3);
      console.log('✓ Captured: admin_dashboard_mobile.png (390x844)');

      await context.close();
    }

    console.log('All 4 Administrator Dashboard screenshots captured successfully!');
  } finally {
    await browser.close();
    server.close();
  }
}

capture().catch((err) => {
  console.error('Failed to capture screenshots:', err);
  process.exit(1);
});

