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

const adminUser = {
  id: 1,
  username: 'admin',
  full_name: 'Dr. A. B. M. Mansoor (Principal)',
  role: 'admin',
  authorizations: [{ auth_role: 'principal' }],
  assignments: []
};

const teacherUser = {
  id: 5,
  username: 'junaid.tm',
  full_name: 'T. M. Junaid (Grade 8-A In-Charge)',
  role: 'class_teacher',
  classTeacherClassIds: [5],
  assignments: [
    { class_id: 5, class_name: 'Grade 8-A', grade: 8, assignment_type: 'class_teacher', subject_id: 1, subject_name: 'Mathematics', subject_code: 'MAT8' },
    { class_id: 6, class_name: 'Grade 8-B', grade: 8, assignment_type: 'subject_teacher', subject_id: 1, subject_name: 'Mathematics', subject_code: 'MAT8' },
    { class_id: 7, class_name: 'Grade 9-A', grade: 9, assignment_type: 'subject_teacher', subject_id: 1, subject_name: 'Mathematics', subject_code: 'MAT9' }
  ]
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

    if (path.includes('/academic/classes')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ classes: mockClasses })
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
  console.log('Starting Milestone 6 Visual Verification Captures...');
  const { server, url } = await createStaticServer(distDir);
  console.log(`Static server running at ${url}`);

  const browser = await launchSupportedBrowser();
  if (!browser) {
    throw new Error('Could not launch Chrome or Edge browser');
  }

  try {
    // ------------------------------------------------------------------------
    // Capture 1: Screen 02 Administrator / Principal Dashboard (Desktop 1440x900)
    // ------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await setupRoutes(page, adminUser);

      await page.addInitScript((user) => {
        localStorage.setItem('skoolsys_token', 'mock_admin_token');
        localStorage.setItem('skoolsys_user', JSON.stringify(user));
      }, adminUser);

      await page.goto(`${url}/#dashboard`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.stat-card', { timeout: 10000 });
      await page.waitForTimeout(500);

      const filePath1 = path.join(docsDir, 'milestone6_admin_dashboard_desktop.png');
      const outPath1 = path.join(outDir, 'milestone6_admin_dashboard_desktop.png');
      await page.screenshot({ path: filePath1, fullPage: true });
      fs.copyFileSync(filePath1, outPath1);
      console.log('✓ Captured: milestone6_admin_dashboard_desktop.png');

      // ------------------------------------------------------------------------
      // Capture 2: Screen 02 Dynamic Attendance Matrix (Desktop close-up)
      // ------------------------------------------------------------------------
      const matrixElement = await page.locator('.dashboard-grid-dual').first();
      const filePath2 = path.join(docsDir, 'milestone6_attendance_matrix_desktop.png');
      const outPath2 = path.join(outDir, 'milestone6_attendance_matrix_desktop.png');
      await matrixElement.screenshot({ path: filePath2 });
      fs.copyFileSync(filePath2, outPath2);
      console.log('✓ Captured: milestone6_attendance_matrix_desktop.png');

      await context.close();
    }

    // ------------------------------------------------------------------------
    // Capture 3: Screen 03 Teacher Dashboard (Desktop 1440x900)
    // ------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await setupRoutes(page, teacherUser);

      await page.addInitScript((user) => {
        localStorage.setItem('skoolsys_token', 'mock_teacher_token');
        localStorage.setItem('skoolsys_user', JSON.stringify(user));
      }, teacherUser);

      await page.goto(`${url}/#dashboard`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.teacher-hero-card', { timeout: 10000 });
      await page.waitForTimeout(500);

      const filePath3 = path.join(docsDir, 'milestone6_teacher_dashboard_desktop.png');
      const outPath3 = path.join(outDir, 'milestone6_teacher_dashboard_desktop.png');
      await page.screenshot({ path: filePath3, fullPage: true });
      fs.copyFileSync(filePath3, outPath3);
      console.log('✓ Captured: milestone6_teacher_dashboard_desktop.png');

      await context.close();
    }

    // ------------------------------------------------------------------------
    // Capture 4: Screen 03 Teacher Dashboard (Mobile iPhone 390x844)
    // ------------------------------------------------------------------------
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();
      await setupRoutes(page, teacherUser);

      await page.addInitScript((user) => {
        localStorage.setItem('skoolsys_token', 'mock_teacher_token');
        localStorage.setItem('skoolsys_user', JSON.stringify(user));
      }, teacherUser);

      await page.goto(`${url}/#dashboard`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.teacher-hero-card', { timeout: 10000 });
      await page.waitForTimeout(500);

      const filePath4 = path.join(docsDir, 'milestone6_teacher_dashboard_mobile.png');
      const outPath4 = path.join(outDir, 'milestone6_teacher_dashboard_mobile.png');
      await page.screenshot({ path: filePath4, fullPage: true });
      fs.copyFileSync(filePath4, outPath4);
      console.log('✓ Captured: milestone6_teacher_dashboard_mobile.png');

      await context.close();
    }

    console.log('All 4 Milestone 6 visual verification screenshots captured successfully!');
  } finally {
    await browser.close();
    server.close();
  }
}

capture().catch((err) => {
  console.error('Failed to capture screenshots:', err);
  process.exit(1);
});
