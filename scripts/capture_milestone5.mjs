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

const mockExams = [
  {
    id: 1,
    name: 'Term 1 Assessment 2026',
    academic_year_id: 1,
    academic_year_name: '2026',
    term: 1,
    grade_band: 'all',
    start_date: '2026-03-24',
    end_date: '2026-04-04',
    max_score: 100,
    status: 'published',
    is_published: 1,
    total_schedules: 18,
    approved_schedules: 18,
    total_sheets: 18,
    approved_sheets: 18
  },
  {
    id: 2,
    name: 'Mid-Year Examination 2026',
    academic_year_id: 1,
    academic_year_name: '2026',
    term: 2,
    grade_band: 'grade_6_11',
    start_date: '2026-07-15',
    end_date: '2026-07-28',
    max_score: 100,
    status: 'marking_open',
    is_published: 0,
    total_schedules: 18,
    approved_schedules: 18,
    total_sheets: 18,
    approved_sheets: 12
  },
  {
    id: 3,
    name: 'G.C.E. O/L Model Evaluation 2026',
    academic_year_id: 1,
    academic_year_name: '2026',
    term: 3,
    grade_band: 'grade_10_11',
    start_date: '2026-10-10',
    end_date: '2026-10-22',
    max_score: 100,
    status: 'scheduled',
    is_published: 0,
    total_schedules: 12,
    approved_schedules: 12,
    total_sheets: 12,
    approved_sheets: 0
  }
];

const mockRoster = [
  {
    student_id: 1,
    admission_no: 'SCH-2024-001',
    full_name: 'Kasun Malinda Ranasinghe',
    calling_name: 'Kasun',
    roll_number: 1,
    enrollment_category: 'Core'
  },
  {
    student_id: 2,
    admission_no: 'SCH-2024-002',
    full_name: 'Mohamed Fazil Ahamed',
    calling_name: 'Fazil',
    roll_number: 2,
    enrollment_category: 'Core'
  },
  {
    student_id: 3,
    admission_no: 'SCH-2024-003',
    full_name: 'Sithum Nimesh Jayasuriya',
    calling_name: 'Sithum',
    roll_number: 3,
    enrollment_category: 'Core'
  },
  {
    student_id: 4,
    admission_no: 'SCH-2024-004',
    full_name: 'Ahmed Yaseen Mohamed',
    calling_name: 'Yaseen',
    roll_number: 4,
    enrollment_category: 'Core'
  },
  {
    student_id: 5,
    admission_no: 'SCH-2024-005',
    full_name: 'Tharusha Dananjaya Silva',
    calling_name: 'Tharusha',
    roll_number: 5,
    enrollment_category: 'Core'
  },
  {
    student_id: 6,
    admission_no: 'SCH-2024-006',
    full_name: 'Abdul Rahman Salman',
    calling_name: 'Salman',
    roll_number: 6,
    enrollment_category: 'Core'
  },
  {
    student_id: 7,
    admission_no: 'SCH-2024-007',
    full_name: 'Kavindu Chamod Wickramasinghe',
    calling_name: 'Kavindu',
    roll_number: 7,
    enrollment_category: 'Core'
  },
  {
    student_id: 8,
    admission_no: 'SCH-2024-008',
    full_name: 'Mohamed Irfan Rizvi',
    calling_name: 'Irfan',
    roll_number: 8,
    enrollment_category: 'Core'
  }
];

const mockMarks = [
  { student_id: 1, score: 88, assessment_status: 'PRESENT' },
  { student_id: 2, score: null, assessment_status: 'MEDICAL' },
  { student_id: 3, score: 94, assessment_status: 'PRESENT' },
  { student_id: 4, score: 76, assessment_status: 'PRESENT' },
  { student_id: 5, score: 68, assessment_status: 'PRESENT' },
  { student_id: 6, score: 52, assessment_status: 'PRESENT' },
  { student_id: 7, score: 42, assessment_status: 'PRESENT' },
  { student_id: 8, score: null, assessment_status: 'ABSENT' }
];

const mockReviewSheets = [
  {
    id: 101,
    examination_id: 2,
    exam_name: 'Mid-Year Examination 2026',
    class_id: 1,
    class_name: 'Grade 8-A',
    subject_id: 1,
    subject_name: 'Mathematics',
    subject_code: 'MATH',
    teacher_name: 'Mr. Samantha Silva',
    status: 'submitted',
    revision: 2,
    total_students: 40,
    assessed_count: 40,
    submitted_at: '2026-07-22T10:30:00Z'
  },
  {
    id: 102,
    examination_id: 2,
    exam_name: 'Mid-Year Examination 2026',
    class_id: 1,
    class_name: 'Grade 8-A',
    subject_id: 2,
    subject_name: 'Science',
    subject_code: 'SCI',
    teacher_name: 'Mrs. Priya Fernando',
    status: 'submitted',
    revision: 1,
    total_students: 40,
    assessed_count: 40,
    submitted_at: '2026-07-22T11:15:00Z'
  },
  {
    id: 103,
    examination_id: 2,
    exam_name: 'Mid-Year Examination 2026',
    class_id: 2,
    class_name: 'Grade 11-A',
    subject_id: 1,
    subject_name: 'Mathematics',
    subject_code: 'MATH',
    teacher_name: 'Mr. K. Thevarajah',
    status: 'submitted',
    revision: 3,
    total_students: 35,
    assessed_count: 35,
    submitted_at: '2026-07-22T14:00:00Z'
  }
];

const mockReadiness = {
  isReady: true,
  status: 'ready',
  summary: {
    totalSchedules: 18,
    approvedSchedules: 18,
    totalSheets: 18,
    approvedSheets: 18,
    pendingSheets: 0,
    completenessPercentage: 100
  },
  checks: {
    scheduleApproved: true,
    allSheetsApproved: true,
    enrolmentsConfirmed: true,
    policyCompliance: true,
    noDuplicateMarks: true,
    moderationEndorsed: true,
    principalAuthorized: true
  },
  blockers: []
};

async function main() {
  console.log('[Capture M5] Starting server...');
  const { server, url } = await createStaticServer(distDir);
  console.log(`[Capture M5] Static app served at: ${url}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    try {
      browser = await chromium.launch({ headless: true, channel: 'msedge' });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  // Route API mock endpoints
  await page.route('**/api/**', async (route) => {
    const reqUrl = new URL(route.request().url());
    const pathname = reqUrl.pathname;

    if (pathname.includes('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 1,
            username: 'principal_kcc',
            name: 'Al-Haj M.I.M. Nawas',
            role: 'principal',
            authorizations: [
              { auth_role: 'principal' },
              { auth_role: 'administrator' }
            ]
          }
        })
      });
    }

    if (pathname.includes('/academic/years')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          academicYears: [{ id: 1, name: '2026', is_current: 1 }]
        })
      });
    }

    if (pathname.includes('/examinations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          examinations: mockExams
        })
      });
    }

    if (pathname.includes('/academic/classes') && !pathname.includes('/roster') && !pathname.includes('/subjects')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          classes: [
            { id: 1, name: 'Grade 8-A', grade_level: 8 },
            { id: 2, name: 'Grade 11-A', grade_level: 11 }
          ]
        })
      });
    }

    if (pathname.includes('/subjects')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subjects: [
            { id: 1, name: 'Mathematics', code: 'MATH', category: 'Core' },
            { id: 2, name: 'Science', code: 'SCI', category: 'Core' },
            { id: 3, name: 'English Language', code: 'ENG', category: 'Core' }
          ]
        })
      });
    }

    if (pathname.includes('/marks/sheet')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sheet: {
            id: 101,
            examination_id: 2,
            class_id: 1,
            subject_id: 1,
            status: 'draft',
            revision: 2,
            max_score: 100
          },
          roster: mockRoster,
          marks: mockMarks,
          stats: {
            average: 74.5,
            passRate: 87.5,
            maxScore: 94,
            totalGraded: 7,
            totalStudents: 8
          },
          policy: {
            id: 1,
            policy_code: 'SEC-CORE-V2',
            title: 'Secondary National Assessment Standard',
            is_approved_by_school: 1,
            grading_scale_json: JSON.stringify([
              { minPercentage: 75, gradeLetter: 'A' },
              { minPercentage: 65, gradeLetter: 'B' },
              { minPercentage: 50, gradeLetter: 'C' },
              { minPercentage: 35, gradeLetter: 'S' },
              { minPercentage: 0, gradeLetter: 'F' }
            ])
          }
        })
      });
    }

    if (pathname.includes('/marks/review/queue')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sheets: mockReviewSheets
        })
      });
    }

    if (pathname.includes('/marks/readiness')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockReadiness)
      });
    }

    if (pathname.includes('/marks/policies')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          policies: [
            {
              id: 1,
              policy_code: 'SEC-CORE-V2',
              title: 'Secondary National Assessment Standard',
              version: 2,
              grade_band: 'all',
              is_approved_by_school: 1,
              grading_scales: [
                { gradeLetter: 'A', minScore: 75, maxScore: 100, description: 'Distinction' },
                { gradeLetter: 'B', minScore: 65, maxScore: 74, description: 'Very Good' },
                { gradeLetter: 'C', minScore: 50, maxScore: 64, description: 'Credit Pass' },
                { gradeLetter: 'S', minScore: 35, maxScore: 49, description: 'Simple Pass' },
                { gradeLetter: 'F', minScore: 0, maxScore: 34, description: 'Fail / Unclassified' }
              ]
            }
          ]
        })
      });
    }

    if (pathname.includes('/marks/corrections')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          corrections: []
        })
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  // Inject user into localStorage
  await page.goto(`${url}/#/login`);
  await page.evaluate(() => {
    localStorage.setItem(
      'skoolsys_user',
      JSON.stringify({
        id: 1,
        username: 'principal_kcc',
        name: 'Al-Haj M.I.M. Nawas',
        role: 'principal',
        authorizations: [
          { auth_role: 'principal' },
          { auth_role: 'administrator' }
        ]
      })
    );
    localStorage.setItem('skoolsys_token', 'mock_jwt_token_for_capture');
    localStorage.setItem('skoolsys_theme', 'light');
    localStorage.setItem('skoolsys_sidebar_collapsed', 'false');
  });
  await page.reload({ waitUntil: 'networkidle' });

  // 1. Capture Desktop Marks Spreadsheet Grid
  console.log('[Capture M5] Capturing Desktop Marks Spreadsheet Grid...');
  await page.goto(`${url}/#/marks`);
  await page.waitForSelector('.marks-workspace', { timeout: 6000 });
  await page.waitForTimeout(400);

  // Switch to Marks Entry tab
  const marksTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Marks Entry' });
  await marksTab.click();
  await page.waitForSelector('#marks-exam-select', { timeout: 6000 });
  await page.waitForFunction(() => {
    const sel = document.getElementById('marks-exam-select');
    return sel && sel.options.length > 0;
  }, { timeout: 8000 });

  // Select Mid-Year Examination 2026, Grade 8-A, Mathematics
  await page.selectOption('#marks-exam-select', { value: '2' }).catch(() => {
    return page.selectOption('#marks-exam-select', { index: 1 });
  });
  await page.waitForTimeout(400);

  await page.waitForFunction(() => {
    const sel = document.getElementById('marks-class-select');
    return sel && sel.options.length > 0;
  }, { timeout: 8000 });

  await page.selectOption('#marks-class-select', { value: '1' }).catch(() => {
    return page.selectOption('#marks-class-select', { index: 0 });
  });
  await page.waitForTimeout(400);

  await page.waitForFunction(() => {
    const sel = document.getElementById('marks-subject-select');
    return sel && sel.options.length > 0;
  }, { timeout: 8000 });

  await page.selectOption('#marks-subject-select', { value: '1' }).catch(() => {
    return page.selectOption('#marks-subject-select', { index: 0 });
  });

  await page.waitForSelector('.data-table tbody tr', { timeout: 6000 });
  await page.waitForTimeout(600);

  const desktopSpreadsheetPath = path.join(docsDir, 'milestone5_marks_spreadsheet_desktop.png');
  const brainDesktopPath = path.join(outDir, 'milestone5_marks_spreadsheet_desktop.png');
  await page.screenshot({ path: desktopSpreadsheetPath, fullPage: true });
  fs.copyFileSync(desktopSpreadsheetPath, brainDesktopPath);
  console.log('✅ Captured Desktop Spreadsheet:', desktopSpreadsheetPath);

  // 2. Capture Mobile Single-Student Stepper Mode (< 768px)
  console.log('[Capture M5] Capturing Mobile Single-Student Stepper...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);

  // Switch to Stepper mode button
  const stepperBtn = page.locator('.marks-view-toggle-btn').filter({ hasText: 'Stepper' });
  if (await stepperBtn.isVisible()) {
    await stepperBtn.click();
    await page.waitForSelector('.marks-stepper-card', { timeout: 5000 });
  }
  await page.waitForTimeout(500);

  const mobileStepperPath = path.join(docsDir, 'milestone5_marks_mobile_stepper.png');
  const brainMobilePath = path.join(outDir, 'milestone5_marks_mobile_stepper.png');
  await page.screenshot({ path: mobileStepperPath, fullPage: false });
  fs.copyFileSync(mobileStepperPath, brainMobilePath);
  console.log('✅ Captured Mobile Stepper Card:', mobileStepperPath);

  // Reset viewport for desktop tabs
  await page.setViewportSize({ width: 1440, height: 900 });

  // 3. Capture Review & Approvals Queue
  console.log('[Capture M5] Capturing Review & Approvals Queue...');
  const reviewTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Review & Approvals' });
  await reviewTab.click();
  await page.waitForSelector('.data-table', { timeout: 6000 });
  await page.waitForTimeout(500);

  const reviewQueuePath = path.join(docsDir, 'milestone5_review_queue.png');
  const brainReviewPath = path.join(outDir, 'milestone5_review_queue.png');
  await page.screenshot({ path: reviewQueuePath, fullPage: true });
  fs.copyFileSync(reviewQueuePath, brainReviewPath);
  console.log('✅ Captured Review Queue:', reviewQueuePath);

  // 4. Capture Publication & Release Ceremony Card
  console.log('[Capture M5] Capturing Publication & Release Readiness Checklist...');
  const pubTab = page.locator('.workspace-tab-btn').filter({ hasText: 'Publication & Release' });
  await pubTab.click();
  await page.waitForSelector('.readiness-item', { timeout: 6000 });
  await page.waitForTimeout(500);

  const pubPath = path.join(docsDir, 'milestone5_publication_ceremony.png');
  const brainPubPath = path.join(outDir, 'milestone5_publication_ceremony.png');
  await page.screenshot({ path: pubPath, fullPage: true });
  fs.copyFileSync(pubPath, brainPubPath);
  console.log('✅ Captured Publication Ceremony:', pubPath);

  await browser.close();
  server.close();
  console.log('[Capture M5] All 4 Milestone 5 screenshots captured successfully!');
}

main().catch((err) => {
  console.error('[Capture Error]', err);
  process.exit(1);
});
