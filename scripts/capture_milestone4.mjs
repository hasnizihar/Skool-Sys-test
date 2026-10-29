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

const mockStudents = [
  {
    id: 1,
    admission_no: 'SCH-2024-001',
    full_name: 'Kasun Malinda Ranasinghe',
    calling_name: 'Kasun',
    gender: 'Male',
    dob: '2012-05-14',
    class_name: 'Grade 8-A',
    class_id: 1,
    grade: 8,
    grade_level: 8,
    roll_number: 1,
    status: 'Active',
    guardian_name: 'Sunil Ranasinghe',
    guardian_phone: '0771234567',
    guardian_relation: 'Father'
  },
  {
    id: 2,
    admission_no: 'SCH-2024-002',
    full_name: 'Mohamed Rizvi Ahamed',
    calling_name: 'Rizvi',
    gender: 'Male',
    dob: '2012-08-22',
    class_name: 'Grade 8-A',
    class_id: 1,
    grade: 8,
    grade_level: 8,
    roll_number: 2,
    status: 'Active',
    guardian_name: 'Abdul Rizvi',
    guardian_phone: '0772345678',
    guardian_relation: 'Father'
  },
  {
    id: 3,
    admission_no: 'SCH-2024-003',
    full_name: 'Fathima Nusra',
    calling_name: 'Nusra',
    gender: 'Female',
    dob: '2012-11-03',
    class_name: 'Grade 8-B',
    class_id: 2,
    grade: 8,
    grade_level: 8,
    roll_number: 1,
    status: 'Active',
    guardian_name: 'M. Farook',
    guardian_phone: '0773456789',
    guardian_relation: 'Mother'
  },
  {
    id: 4,
    admission_no: 'SCH-2024-004',
    full_name: 'Kavindi Tharushika Senaratne',
    calling_name: 'Kavindi',
    gender: 'Female',
    dob: '2011-03-19',
    class_name: 'Grade 9-A',
    class_id: 3,
    grade: 9,
    grade_level: 9,
    roll_number: 1,
    status: 'Transferred',
    guardian_name: 'Bandula Senaratne',
    guardian_phone: '0774567890',
    guardian_relation: 'Guardian'
  },
  {
    id: 5,
    admission_no: 'SCH-2024-005',
    full_name: 'Dinesh Kumara Gunawardena',
    calling_name: 'Dinesh',
    gender: 'Male',
    dob: '2012-01-30',
    class_name: 'Grade 8-A',
    class_id: 1,
    grade: 8,
    grade_level: 8,
    roll_number: 3,
    status: 'Active',
    guardian_name: 'Gamini Gunawardena',
    guardian_phone: '0775678901',
    guardian_relation: 'Father'
  }
];

const mockStudentFull = {
  student: {
    id: 1,
    admission_no: 'SCH-2024-001',
    full_name: 'Kasun Malinda Ranasinghe',
    calling_name: 'Kasun',
    gender: 'Male',
    dob: '2012-05-14',
    address: '42, Lake Road, Kattankudy, Sri Lanka',
    status: 'Active',
    class_id: 1,
    class_name: 'Grade 8-A',
    grade: 8,
    grade_level: 8,
    class_teacher_name: 'Mrs. Nimali Jayasinghe',
    roll_number: 1,
    academic_year: 'Academic Year 2026',
    guardian_name: 'Sunil Ranasinghe',
    guardian_relation: 'Father',
    guardian_phone: '+94 77 123 4567',
    guardian_email: 'sunil.ranasinghe@example.com',
    guardian_nic: '821450987V',
    emergency_contact: '+94 71 987 6543'
  },
  attendance: {
    total_days: 60,
    present_days: 57,
    absent_days: 2,
    late_days: 1,
    excused_days: 0,
    attendanceRate: 95.0,
    history: [
      { date: '2026-05-18', status: 'present', remarks: 'Normal session', class_name: 'Grade 8-A' },
      { date: '2026-05-17', status: 'present', remarks: '', class_name: 'Grade 8-A' },
      { date: '2026-05-16', status: 'late', remarks: 'School bus delayed', class_name: 'Grade 8-A' },
      { date: '2026-05-15', status: 'present', remarks: '', class_name: 'Grade 8-A' },
      { date: '2026-05-14', status: 'absent', remarks: 'Medical appointment', class_name: 'Grade 8-A' }
    ]
  },
  marks: [
    {
      examination_id: 1,
      examination_name: 'Term 1 Mid-Year Summative Evaluation 2026',
      subject_id: 1,
      subject_name: 'Mathematics',
      subject_code: 'MATH-8',
      score: 88,
      grade: 'A',
      assessment_status: 'PRESENT',
      is_published: 1,
      rank: 2
    },
    {
      examination_id: 1,
      examination_name: 'Term 1 Mid-Year Summative Evaluation 2026',
      subject_id: 2,
      subject_name: 'Science',
      subject_code: 'SCI-8',
      score: 92,
      grade: 'A',
      assessment_status: 'PRESENT',
      is_published: 1,
      rank: 1
    },
    {
      examination_id: 1,
      examination_name: 'Term 1 Mid-Year Summative Evaluation 2026',
      subject_id: 3,
      subject_name: 'English Language',
      subject_code: 'ENG-8',
      score: 81,
      grade: 'A',
      assessment_status: 'PRESENT',
      is_published: 1,
      rank: 4
    },
    {
      examination_id: 1,
      examination_name: 'Term 1 Mid-Year Summative Evaluation 2026',
      subject_id: 4,
      subject_name: 'History',
      subject_code: 'HIST-8',
      score: 76,
      grade: 'B',
      assessment_status: 'PRESENT',
      is_published: 1,
      rank: 5
    }
  ]
};

async function setupCommonRoutes(page) {
  await page.route('**/api/auth/me', async (route) => {
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
          { id: 2, name: 'Grade 8-B', grade: 8, grade_level: 8, class_teacher_name: 'Mr. K. Theivendran', academic_year_id: 1 },
          { id: 3, name: 'Grade 9-A', grade: 9, grade_level: 9, class_teacher_name: 'Mr. M. S. Farook', academic_year_id: 1 }
        ]
      })
    });
  });

  await page.route('**/api/academic/grades*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        grades: [6, 7, 8, 9, 10, 11, 12, 13]
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

  await page.route(
    (url) => url.pathname.startsWith('/api/students'),
    async (route, request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/students/1' || url.pathname.endsWith('/1')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockStudentFull)
        });
        return;
      }
      const q = url.searchParams.get('q') || '';
      const grade = url.searchParams.get('grade');
      const classId = url.searchParams.get('classId');
      const status = url.searchParams.get('status');

      let filtered = [...mockStudents];
      if (q) {
        const lq = q.toLowerCase();
        filtered = filtered.filter(s =>
          s.full_name.toLowerCase().includes(lq) ||
          s.calling_name.toLowerCase().includes(lq) ||
          s.admission_no.toLowerCase().includes(lq)
        );
      }
      if (grade) {
        filtered = filtered.filter(s => s.grade === Number(grade) || s.grade_level === Number(grade));
      }
      if (classId) {
        filtered = filtered.filter(s => s.class_id === Number(classId));
      }
      if (status) {
        filtered = filtered.filter(s => s.status.toLowerCase() === status.toLowerCase());
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ students: filtered })
      });
    }
  );

  await page.route('**/api/examinations*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        examinations: [
          { id: 1, name: 'Term 1 Mid-Year Summative Evaluation 2026', is_published: 1 }
        ]
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
    // 1. Desktop View of Student Directory
    console.log('[Capture] 1. Desktop Student Directory...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 2
    });
    const desktopPage = await desktopContext.newPage();
    await setupCommonRoutes(desktopPage);

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

    await desktopPage.goto(`${url}/#/students`, { waitUntil: 'networkidle' });
    await desktopPage.waitForSelector('.students-page', { timeout: 8000 });
    await desktopPage.waitForSelector('text=Kasun Malinda Ranasinghe', { timeout: 8000 });
    await desktopPage.waitForTimeout(600);

    const desktopPath = path.join(outDir, 'milestone4_students_desktop.png');
    const desktopDocs = path.join(docsDir, 'milestone4_students_desktop.png');
    await desktopPage.screenshot({ path: desktopPath });
    fs.copyFileSync(desktopPath, desktopDocs);
    console.log(`[Capture] Saved ${desktopPath}`);

    // 2. Active Filters State
    console.log('[Capture] 2. Active Filters State...');
    const gradeSelect = desktopPage.locator('select').nth(0);
    await gradeSelect.selectOption({ label: 'Grade 8' });
    await desktopPage.waitForTimeout(300);

    const statusSelect = desktopPage.locator('select').nth(2);
    await statusSelect.selectOption({ label: 'Active' });
    await desktopPage.waitForTimeout(400);

    const filtersPath = path.join(outDir, 'milestone4_students_filters.png');
    const filtersDocs = path.join(docsDir, 'milestone4_students_filters.png');
    await desktopPage.screenshot({ path: filtersPath });
    fs.copyFileSync(filtersPath, filtersDocs);
    console.log(`[Capture] Saved ${filtersPath}`);

    // Reset filters
    const resetBtn = desktopPage.locator('.students-reset-filters-btn');
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
      await desktopPage.waitForTimeout(400);
    }

    // 3. Student Dossier / Full View
    console.log('[Capture] 3. Student Full View / Dossier...');
    await desktopPage.click('tr:has-text("Kasun Malinda Ranasinghe") button:has-text("Full View")');
    await desktopPage.waitForSelector('.dossier-page', { timeout: 8000 });
    await desktopPage.waitForSelector('.dossier-hero-card', { timeout: 8000 });
    await desktopPage.waitForSelector('text=Mathematics', { timeout: 8000 });
    await desktopPage.waitForTimeout(600);

    const dossierPath = path.join(outDir, 'milestone4_student_dossier.png');
    const dossierDocs = path.join(docsDir, 'milestone4_student_dossier.png');
    await desktopPage.screenshot({ path: dossierPath });
    fs.copyFileSync(dossierPath, dossierDocs);
    console.log(`[Capture] Saved ${dossierPath}`);

    await desktopContext.close();

    // 4. Mobile View of Student Directory
    console.log('[Capture] 4. Mobile Student Directory...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();
    await setupCommonRoutes(mobilePage);

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

    await mobilePage.goto(`${url}/#/students`, { waitUntil: 'networkidle' });
    await mobilePage.waitForSelector('.students-page', { timeout: 8000 });
    await mobilePage.waitForSelector('.students-table tbody tr', { timeout: 8000 });
    await mobilePage.waitForTimeout(600);

    const mobilePath = path.join(outDir, 'milestone4_students_mobile.png');
    const mobileDocs = path.join(docsDir, 'milestone4_students_mobile.png');
    await mobilePage.screenshot({ path: mobilePath });
    fs.copyFileSync(mobilePath, mobileDocs);
    console.log(`[Capture] Saved ${mobilePath}`);

    await mobileContext.close();

    console.log('✅ All Milestone 4 screenshots captured successfully!');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[Capture Error]', err);
  process.exit(1);
});
