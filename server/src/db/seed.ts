import {
  db,
  initDatabase,
  DB_PATH,
  getActiveDbPath,
  hasDisposableMarker,
  stampDisposableMarker,
  isDatabasePopulated,
  getPopulatedApplicationTables
} from './database.js';
import bcrypt from 'bcryptjs';
import path from 'node:path';

/**
 * G6-01 Strong Disposable Seed Protection:
 * 1. Positive verifiable disposable fixture identity (_skoolsys_disposable_marker), NOT folder-name substring matching.
 * 2. Active SQLite connection path MUST match targetDbPath.
 * 3. Never destroy an arbitrary populated database just because a folder contains 'test' or 'temp'.
 * 4. Explicit confirmation flag and non-production environment checks.
 * 5. Atomic rollback and PRAGMA foreign_keys = ON.
 */
export function validateSeedSafety(targetDbPath: string = DB_PATH): void {
  // 1. Refuse in production or staging environments
  const env = (process.env.NODE_ENV || '').toLowerCase();
  if (env === 'production' || env === 'staging') {
    throw new Error(`[SEED BLOCKED] Seeding is strictly prohibited in '${env}' environment.`);
  }

  // 2. Refuse if path contains production or live keywords
  const normalizedPath = path.resolve(targetDbPath).toLowerCase();
  const isProductionNamed =
    normalizedPath.includes('prod') ||
    normalizedPath.includes('production') ||
    normalizedPath.includes('live') ||
    normalizedPath.includes('stage');

  if (isProductionNamed) {
    throw new Error(`[SEED BLOCKED] Database path '${targetDbPath}' appears to be a production or staging database. Refusing execution.`);
  }

  // 3. Explicit seed confirmation flag required
  const hasCliFlag = process.argv.includes('--confirm-seed') || process.argv.includes('--confirm-disposable-seed');
  const hasEnvFlag = process.env.CONFIRM_DISPOSABLE_SEED === '1' || process.env.CONFIRM_DISPOSABLE_SEED === 'true';
  if (!hasCliFlag && !hasEnvFlag) {
    throw new Error(
      '[SEED BLOCKED] Missing explicit confirmation flag. To seed a disposable database, pass --confirm-seed or set CONFIRM_DISPOSABLE_SEED=1.'
    );
  }

  // 4. Verify targetDbPath exactly matches active SQLite connection target
  const activePath = getActiveDbPath();
  if (activePath !== ':memory:' && targetDbPath !== ':memory:') {
    const resolvedActive = path.resolve(activePath).toLowerCase();
    const resolvedTarget = path.resolve(targetDbPath).toLowerCase();
    if (resolvedActive !== resolvedTarget) {
      throw new Error(
        `[SEED BLOCKED] Target database path '${targetDbPath}' does not match active SQLite connection path '${activePath}'. Mismatched targets are rejected before any operation.`
      );
    }
  }

  // 5. Must have explicit disposable authorization
  const isExplicitDisposableEnv =
    process.env.ALLOW_DISPOSABLE_SEED === '1' ||
    process.env.ALLOW_DISPOSABLE_SEED === 'true' ||
    process.env.DISPOSABLE_DEV_DB === '1' ||
    process.env.DISPOSABLE_DEV_DB === 'true';
  const hasCliAllow = process.argv.includes('--allow-disposable-seed');
  const isDisposableAuthorized = isExplicitDisposableEnv || hasCliAllow;

  if (!isDisposableAuthorized) {
    throw new Error(
      `[SEED BLOCKED] Target database '${targetDbPath}' is not authorized for disposable seeding. Set ALLOW_DISPOSABLE_SEED=1 or DISPOSABLE_DEV_DB=1 to confirm.`
    );
  }

  // 6. Strong Overwrite Protection: If database is populated, it MUST possess positive disposable fixture marker
  // Folder-name substring matching ('test', 'temp', 'Skool-Sys-test') is strictly rejected as proof of disposable nature!
  if (isDatabasePopulated(db)) {
    const hasMarker = hasDisposableMarker(db);
    if (!hasMarker) {
      const populatedTables = getPopulatedApplicationTables(db);
      throw new Error(
        `[SEED BLOCKED] Target database '${targetDbPath}' is already populated with data in application tables (${populatedTables.join(', ')}) but lacks the verified disposable fixture marker (_skoolsys_disposable_marker). Destroying or overwriting an arbitrary populated database without positive disposable fixture identity is strictly prohibited, regardless of folder name (${path.basename(path.dirname(targetDbPath))}) or confirmation flags.`
      );
    }
  }
}

export function runSeed(options?: { bypassInit?: boolean; targetDbPath?: string; fixtureToken?: string }) {
  const targetPath = options?.targetDbPath || DB_PATH;
  validateSeedSafety(targetPath);

  if (!options?.bypassInit) {
    initDatabase();
  }

  // Verify connection target and safety again after initialization before destructive operations
  const activePath = getActiveDbPath();
  if (activePath !== ':memory:' && targetPath !== ':memory:') {
    if (path.resolve(activePath).toLowerCase() !== path.resolve(targetPath).toLowerCase()) {
      throw new Error(
        `[SEED BLOCKED] Active SQLite connection '${activePath}' does not match seed target '${targetPath}'.`
      );
    }
  }
  validateSeedSafety(targetPath);

  console.log('🌱 Starting SkoolSys PR-005 database seed against disposable target...');

  // Topological table deletion child-before-parent under PRAGMA foreign_keys = ON within transaction
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('BEGIN IMMEDIATE;');

  try {
    // 1. Clean existing tables in topological dependency order (child before parent)
    const tablesToDelete = [
      '_skoolsys_disposable_marker',
      'marks_corrections',
      'quarantined_legacy_marks',
      'marks_audit_history',
      'marks',
      'marks_sheet_revisions',
      'marks_sheets',
      'examination_publications',
      'examination_schedules',
      'student_subject_enrollments',
      'attendance_records',
      'attendance_sessions',
      'enrollments',
      'teacher_assignments',
      'class_subjects',
      'academic_staff_authorizations',
      'examinations',
      'assessment_policy_profiles',
      'classes',
      'subjects',
      'students',
      'audit_logs',
      'users',
      'academic_years'
    ];

    for (const tbl of tablesToDelete) {
      try {
        db.exec(`DELETE FROM ${tbl};`);
      } catch {
        // Ignore if table does not exist in target schema
      }
    }

    // 2. Academic Year
    const yearStmt = db.prepare(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES (?, ?, ?, ?)
    `);
    yearStmt.run('2026', '2026-01-05', '2026-12-15', 1);
    const currentYear = db.prepare("SELECT id FROM academic_years WHERE name = '2026'").get() as { id: number };

    // 3. System Users & Passwords (Fictional Demo Synthetic Accounts)
    const salt = bcrypt.genSaltSync(10);
    const adminPass = bcrypt.hashSync('admin123', salt);
    const teacherPass = bcrypt.hashSync('teacher123', salt);

    const userStmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    userStmt.run('admin', 'admin@skoolsys.edu', adminPass, 'DEMO ONLY: Mr. A.L.M. Mukthar (Synthetic Principal / Admin)', 'admin');
    userStmt.run('vp_academic', 'vp.academic@skoolsys.edu', teacherPass, 'DEMO ONLY: Mr. M.I.M. Nawas (Synthetic VP Academic)', 'class_teacher');
    userStmt.run('section_head_junior', 'sh.junior@skoolsys.edu', teacherPass, 'DEMO ONLY: Mr. K.L.M. Farook (Synthetic Section Head Grades 6-9)', 'class_teacher');
    userStmt.run('teacher_nimali', 'nimali.perera@skoolsys.edu', teacherPass, 'DEMO ONLY: Mrs. Nimali Perera (Synthetic Teacher)', 'class_teacher');
    userStmt.run('teacher_samantha', 'samantha.silva@skoolsys.edu', teacherPass, 'DEMO ONLY: Mr. Samantha Silva (Synthetic Teacher)', 'subject_teacher');
    userStmt.run('teacher_priya', 'priya.wickrama@skoolsys.edu', teacherPass, 'DEMO ONLY: Ms. Priyanthi Wickramasinghe (Synthetic Teacher)', 'subject_teacher');

    const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number };
    const vpUser = db.prepare("SELECT id FROM users WHERE username = 'vp_academic'").get() as { id: number };
    const sectionHeadUser = db.prepare("SELECT id FROM users WHERE username = 'section_head_junior'").get() as { id: number };
    const teacherNimali = db.prepare("SELECT id FROM users WHERE username = 'teacher_nimali'").get() as { id: number };
    const teacherSamantha = db.prepare("SELECT id FROM users WHERE username = 'teacher_samantha'").get() as { id: number };
    const teacherPriya = db.prepare("SELECT id FROM users WHERE username = 'teacher_priya'").get() as { id: number };

    // 4. Academic Staff Authorizations (PR-005 Multi-Tier Leadership - Synthetic Test Fixtures)
    const authStmt = db.prepare(`
      INSERT INTO academic_staff_authorizations (user_id, academic_year_id, auth_role, grade_band, is_active, granted_by_user_id)
      VALUES (?, ?, ?, ?, 1, ?)
    `);

    authStmt.run(adminUser.id, currentYear.id, 'principal', 'all', adminUser.id);
    authStmt.run(vpUser.id, currentYear.id, 'vice_principal_academic', 'all', adminUser.id);
    authStmt.run(sectionHeadUser.id, currentYear.id, 'section_head', 'junior_6_9', adminUser.id);

    // 5. Classes (Grades 6 to 13)
    const classStmt = db.prepare(`
      INSERT INTO classes (grade, name, room_number, academic_year_id, class_teacher_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    classStmt.run(6, 'Grade 6-A', 'Block A - 101', currentYear.id, null);
    classStmt.run(6, 'Grade 6-B', 'Block A - 102', currentYear.id, null);
    classStmt.run(7, 'Grade 7-A', 'Block A - 201', currentYear.id, null);
    classStmt.run(7, 'Grade 7-B', 'Block A - 202', currentYear.id, null);
    classStmt.run(8, 'Grade 8-A', 'Block B - 101', currentYear.id, teacherNimali.id);
    classStmt.run(8, 'Grade 8-B', 'Block B - 102', currentYear.id, null);
    classStmt.run(9, 'Grade 9-A', 'Block B - 201', currentYear.id, null);
    classStmt.run(9, 'Grade 9-B', 'Block B - 202', currentYear.id, null);
    classStmt.run(10, 'Grade 10-A', 'Block C - 101', currentYear.id, null);
    classStmt.run(10, 'Grade 10-B', 'Block C - 102', currentYear.id, null);
    classStmt.run(11, 'Grade 11-A', 'Block C - 201', currentYear.id, null);
    classStmt.run(11, 'Grade 11-B', 'Block C - 202', currentYear.id, null);
    classStmt.run(12, 'Grade 12-Science', 'Science Lab 1', currentYear.id, null);
    classStmt.run(12, 'Grade 12-Commerce', 'Block D - 101', currentYear.id, null);
    classStmt.run(12, 'Grade 12-Arts', 'Block D - 201', currentYear.id, null);
    classStmt.run(13, 'Grade 13-Science', 'Science Lab 2', currentYear.id, null);
    classStmt.run(13, 'Grade 13-Commerce', 'Block D - 102', currentYear.id, null);
    classStmt.run(13, 'Grade 13-Arts', 'Block D - 202', currentYear.id, null);

    const grade8A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 8-A'").get() as { id: number };
    const grade8B = db.prepare("SELECT id FROM classes WHERE name = 'Grade 8-B'").get() as { id: number };
    const grade11A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 11-A'").get() as { id: number };

    // 6. Subjects (National Curriculum Junior & Senior Secondary)
    const subStmt = db.prepare(`
      INSERT INTO subjects (code, name, category, grade_level)
      VALUES (?, ?, ?, ?)
    `);

    subStmt.run('MATH', 'Mathematics', 'Core', '6-11');
    subStmt.run('SCI', 'Science', 'Core', '6-11');
    subStmt.run('ENG', 'English Language', 'Core', '6-13');
    subStmt.run('SIN', 'Sinhala Language & Lit.', 'Core', '6-11');
    subStmt.run('HIST', 'History', 'Core', '6-11');
    subStmt.run('ICT', 'Info. & Comm. Technology', 'Science', '6-13');
    subStmt.run('HPE', 'Health & Physical Education', 'Core', '6-11');
    subStmt.run('ART', 'Art & Aesthetics', 'Aesthetic', '6-11');
    subStmt.run('COMM', 'Commerce & Accounting', 'Commerce', '10-11');
    subStmt.run('PHY', 'Physics', 'Science', '12-13');
    subStmt.run('CHEM', 'Chemistry', 'Science', '12-13');
    subStmt.run('CMATH', 'Combined Mathematics', 'Science', '12-13');

    const math = db.prepare("SELECT id FROM subjects WHERE code = 'MATH'").get() as { id: number };
    const sci = db.prepare("SELECT id FROM subjects WHERE code = 'SCI'").get() as { id: number };
    const eng = db.prepare("SELECT id FROM subjects WHERE code = 'ENG'").get() as { id: number };
    const his = db.prepare("SELECT id FROM subjects WHERE code = 'HIST'").get() as { id: number };
    const ict = db.prepare("SELECT id FROM subjects WHERE code = 'ICT'").get() as { id: number };
    const art = db.prepare("SELECT id FROM subjects WHERE code = 'ART'").get() as { id: number };
    const hpe = db.prepare("SELECT id FROM subjects WHERE code = 'HPE'").get() as { id: number };

    // 7. Class Subjects Association (Grade 8-A Curriculum)
    const csStmt = db.prepare(`
      INSERT INTO class_subjects (class_id, subject_id)
      VALUES (?, ?)
    `);

    [math, sci, eng, his, ict, art, hpe].forEach((sub) => {
      csStmt.run(grade8A.id, sub.id);
      csStmt.run(grade8B.id, sub.id);
    });

    // 8. Teacher Assignments
    const taStmt = db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type)
      VALUES (?, ?, ?, ?, ?)
    `);

    taStmt.run(teacherNimali.id, grade8A.id, null, currentYear.id, 'class_teacher');
    taStmt.run(teacherSamantha.id, grade8A.id, math.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherPriya.id, grade8A.id, sci.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherNimali.id, grade8A.id, eng.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherSamantha.id, grade8A.id, his.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherPriya.id, grade8A.id, ict.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherNimali.id, grade8A.id, art.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherSamantha.id, grade8A.id, hpe.id, currentYear.id, 'subject_teacher');

    // 9. Students & Enrollments (Realistic Grade 8-A roster)
    const studentData = [
      { adm: 'SCH-2024-001', name: 'Kasun Malinda Ranasinghe', call: 'Kasun', dob: '2012-03-14', gender: 'Male', gName: 'Sunil Ranasinghe', gRel: 'Father', phone: '0771234567', addr: 'No 45, Temple Road, Colombo 05' },
      { adm: 'SCH-2024-002', name: 'Tharushi Nilakshi Fernando', call: 'Tharushi', dob: '2012-05-22', gender: 'Female', gName: 'Kamal Fernando', gRel: 'Father', phone: '0712345678', addr: 'No 12/A, Station Lane, Dehiwala' },
      { adm: 'SCH-2024-003', name: 'Dineth Sathsara Jayawardena', call: 'Dineth', dob: '2012-01-19', gender: 'Male', gName: 'Rohan Jayawardena', gRel: 'Father', phone: '0763456789', addr: '23, Galle Road, Mount Lavinia' },
      { adm: 'SCH-2024-004', name: 'Chamodi Sandunika Senanayake', call: 'Chamodi', dob: '2012-07-08', gender: 'Female', gName: 'Malini Senanayake', gRel: 'Mother', phone: '0784567890', addr: '56, School Lane, Moratuwa' },
      { adm: 'SCH-2024-005', name: 'Kavindu Theekshana Weerasinghe', call: 'Kavindu', dob: '2012-09-15', gender: 'Male', gName: 'Prasanna Weerasinghe', gRel: 'Father', phone: '0755678901', addr: '89, Kandy Road, Kiribathgoda' },
      { adm: 'SCH-2024-006', name: 'Oshadi Bhagya Wickramasinghe', call: 'Oshadi', dob: '2012-11-30', gender: 'Female', gName: 'Chithra Wickramasinghe', gRel: 'Mother', phone: '0716789012', addr: '104, Hill Street, Nugegoda' },
      { adm: 'SCH-2024-007', name: 'Bawantha Nimnada Abeykoon', call: 'Bawantha', dob: '2012-04-05', gender: 'Male', gName: 'Ajith Abeykoon', gRel: 'Father', phone: '0777890123', addr: '71, High Level Rd, Maharagama' },
      { adm: 'SCH-2024-008', name: 'Hiruni Himasha Dissanayake', call: 'Hiruni', dob: '2012-08-12', gender: 'Female', gName: 'Sujith Dissanayake', gRel: 'Father', phone: '0728901234', addr: '15, Park Avenue, Rajagiriya' },
      { adm: 'SCH-2024-009', name: 'Akeel Mohamed Rizwan', call: 'Akeel', dob: '2012-02-28', gender: 'Male', gName: 'Mohamed Rizwan', gRel: 'Father', phone: '0779012345', addr: '34, Main Street, Dematagoda' },
      { adm: 'SCH-2024-010', name: 'Dilini Hansika Ratnayake', call: 'Dilini', dob: '2012-06-17', gender: 'Female', gName: 'Gamini Ratnayake', gRel: 'Father', phone: '0760123456', addr: '92, Circular Road, Kotte' },
      { adm: 'SCH-2024-011', name: 'Sahan Prabhashwara Gunathilake', call: 'Sahan', dob: '2012-10-03', gender: 'Male', gName: 'Bandula Gunathilake', gRel: 'Father', phone: '0781234567', addr: '18, Lake Road, Battaramulla' },
      { adm: 'SCH-2024-012', name: 'Methmi Rashmika Kulatunga', call: 'Methmi', dob: '2012-12-25', gender: 'Female', gName: 'Deepani Kulatunga', gRel: 'Mother', phone: '0752345678', addr: '63, Hospital Road, Kalubowila' },
      { adm: 'SCH-2024-013', name: 'Sithum Nimsara Karunaratne', call: 'Sithum', dob: '2012-01-11', gender: 'Male', gName: 'Nihal Karunaratne', gRel: 'Father', phone: '0713456789', addr: '41, Jaya Road, Wellawatte' },
      { adm: 'SCH-2024-014', name: 'Praveena Janani Warnakulasuriya', call: 'Praveena', dob: '2012-04-19', gender: 'Female', gName: 'Anthony Warnakulasuriya', gRel: 'Father', phone: '0774567890', addr: '09, Church Lane, Wattala' },
      { adm: 'SCH-2024-015', name: 'Naveen Lakshan Alahakoon', call: 'Naveen', dob: '2012-07-27', gender: 'Male', gName: 'Sarath Alahakoon', gRel: 'Father', phone: '0725678901', addr: '82, Old Road, Pannipitiya' },
      { adm: 'SCH-2024-016', name: 'Sanduni Kaushalya Samaraweera', call: 'Sanduni', dob: '2012-09-02', gender: 'Female', gName: 'Anoma Samaraweera', gRel: 'Mother', phone: '0766789012', addr: '27, Cross Road, Malabe' },
      { adm: 'SCH-2024-017', name: 'Thevindu Hasaranga Mendis', call: 'Thevindu', dob: '2012-03-21', gender: 'Male', gName: 'Upali Mendis', gRel: 'Father', phone: '0787890123', addr: '50, Riverside, Kelaniya' },
      { adm: 'SCH-2024-018', name: 'Anuki Dahamya Jayasuriya', call: 'Anuki', dob: '2012-08-30', gender: 'Female', gName: 'Priyantha Jayasuriya', gRel: 'Father', phone: '0758901234', addr: '11, Flower Terrace, Colombo 07' },
      { adm: 'SCH-2024-019', name: 'Lithira Senhas Hettiarachchi', call: 'Lithira', dob: '2012-10-14', gender: 'Male', gName: 'Lalith Hettiarachchi', gRel: 'Father', phone: '0719012345', addr: '38, Sri Sumangala Mawatha, Panadura' },
      { adm: 'SCH-2024-020', name: 'Vethum Sanjaya Rajapaksha', call: 'Vethum', dob: '2012-05-09', gender: 'Male', gName: 'Janaka Rajapaksha', gRel: 'Father', phone: '0770123456', addr: '99, Moragaha Lane, Piliyandala' }
    ];

    const studentInsert = db.prepare(`
      INSERT INTO students (
        admission_no, full_name, calling_name, dob, gender, address,
        guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
    `);

    const enrollInsert = db.prepare(`
      INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status)
      VALUES (?, ?, ?, ?, 'enrolled')
    `);

    const createdStudents: number[] = [];
    studentData.forEach((s, idx) => {
      studentInsert.run(
        s.adm, s.name, s.call, s.dob, s.gender, s.addr,
        s.gName, s.gRel, s.phone, `${s.call.toLowerCase()}@family.lk`, s.phone
      );
      const st = db.prepare("SELECT id FROM students WHERE admission_no = ?").get(s.adm) as { id: number };
      createdStudents.push(st.id);
      enrollInsert.run(st.id, grade8A.id, currentYear.id, idx + 1);
    });

    // 10. Student-Subject Confirmed Enrolments (Core + Elective demo)
    const sseInsert = db.prepare(`
      INSERT INTO student_subject_enrollments (
        student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at
      ) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, '2026-01-15 08:00:00')
    `);

    const sin = db.prepare("SELECT id FROM subjects WHERE code = 'SIN'").get() as { id: number };
    const comm = db.prepare("SELECT id FROM subjects WHERE code = 'COMM'").get() as { id: number };

    createdStudents.forEach((studentId, idx) => {
      // Core compulsory subjects for all
      [math, sci, eng, sin, his, ict, hpe].forEach(s => {
        sseInsert.run(studentId, s.id, grade8A.id, currentYear.id, 'core_compulsory', adminUser.id);
      });
      // Elective subjects (Demonstrating elective-subject participation)
      if (idx < 10) {
        sseInsert.run(studentId, art.id, grade8A.id, currentYear.id, 'ol_basket_1', adminUser.id);
      } else {
        sseInsert.run(studentId, comm.id, grade8A.id, currentYear.id, 'ol_basket_1', adminUser.id);
      }
    });

    // 11. Synthetic Attendance Sessions & Records
    const sessionInsert = db.prepare(`
      INSERT INTO attendance_sessions (uuid, class_id, date, academic_year_id, taken_by_user_id, status, notes)
      VALUES (?, ?, ?, ?, ?, 'submitted', ?)
    `);

    const recordInsert = db.prepare(`
      INSERT INTO attendance_records (session_id, student_id, status, remarks)
      VALUES (?, ?, ?, ?)
    `);

    const recentDates = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
    recentDates.forEach((dt, dayIdx) => {
      const uuid = `session-8a-${dt}`;
      sessionInsert.run(uuid, grade8A.id, dt, currentYear.id, teacherNimali.id, `Daily register for Grade 8-A`);
      const sess = db.prepare("SELECT id FROM attendance_sessions WHERE uuid = ?").get(uuid) as { id: number };

      createdStudents.forEach((studentId, sIdx) => {
        let status = 'present';
        let remarks = '';
        if ((sIdx + dayIdx) % 15 === 0) {
          status = 'absent';
          remarks = 'Sick leave requested';
        } else if ((sIdx + dayIdx) % 11 === 0) {
          status = 'late';
          remarks = 'School bus delayed 15 mins';
        } else if ((sIdx + dayIdx) % 19 === 0) {
          status = 'excused';
          remarks = 'Representing school chess team';
        }
        recordInsert.run(sess.id, studentId, status, remarks);
      });
    });

    // 11. Assessment Policy Profiles (Synthetic Demo Profiles - Not Official Approval)
    const policyInsert = db.prepare(`
      INSERT INTO assessment_policy_profiles (
        academic_year_id, grade_band, policy_code, title,
        grading_scale_json, absence_rules_json, ranking_rules_json,
        correction_window_days, is_approved_by_school, approved_by_user_id, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 30, ?, ?, ?)
    `);

    const gradingScales = JSON.stringify([
      { gradeLetter: 'A', minScore: 75, maxScore: 100, description: 'Distinction' },
      { gradeLetter: 'B', minScore: 65, maxScore: 74, description: 'Very Good' },
      { gradeLetter: 'C', minScore: 50, maxScore: 64, description: 'Credit' },
      { gradeLetter: 'S', minScore: 35, maxScore: 49, description: 'Pass' },
      { gradeLetter: 'F', minScore: 0, maxScore: 34, description: 'Fail' }
    ]);

    const absenceRules = JSON.stringify({
      absentTreatedAsZero: true,
      medicalExcludedFromRank: true
    });

    const rankingRules = JSON.stringify({
      includeElectives: true,
      minSubjectsForRank: 6,
      tieBreakingCriteria: 'aggregate_score'
    });

    policyInsert.run(
      currentYear.id, 'junior_6_9', 'KCC-SEC-STD-2026-V1',
      'Demo Junior Secondary Standard Policy (Synthetic Fixture Only)',
      gradingScales, absenceRules, rankingRules,
      1, adminUser.id, '2026-01-10 09:00:00'
    );

    policyInsert.run(
      currentYear.id, 'junior_6_9', 'KCC-PILOT-2026-V2',
      'Demo Pilot Weighted Assessment Policy (Synthetic Fixture Only)',
      gradingScales, absenceRules, rankingRules,
      0, null, null
    );

    const approvedPolicy = db.prepare("SELECT id FROM assessment_policy_profiles WHERE policy_code = 'KCC-SEC-STD-2026-V1'").get() as { id: number };

    // 12. Examinations (Demo Lifecycle States)
    const examStmt = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, grade_band, start_date, end_date, is_published, status, assessment_policy_id, publication_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    examStmt.run('Term 1 Assessment 2026 (Demo / Synthetic)', 1, currentYear.id, 'all', '2026-03-20', '2026-03-31', 0, 'approved', approvedPolicy.id, 0);
    examStmt.run('Mid-Year Examination 2026 (Demo / Synthetic)', 2, currentYear.id, 'all', '2026-07-15', '2026-07-28', 0, 'scheduled', null, 0);
    examStmt.run('Year-End Final Examination 2026 (Demo / Synthetic)', 3, currentYear.id, 'all', '2026-11-20', '2026-12-05', 0, 'draft', null, 0);

    const term1Exam = db.prepare("SELECT id FROM examinations WHERE name LIKE 'Term 1 Assessment 2026%'").get() as { id: number };
    const midYearExam = db.prepare("SELECT id FROM examinations WHERE name LIKE 'Mid-Year Examination 2026%'").get() as { id: number };

    // 13. Examination Schedules (PR-005 Schedules Workflow)
    const scheduleInsert = db.prepare(`
      INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Term 1: All schedules Approved
    [math, sci, eng, his, ict, art, hpe].forEach((sub) => {
      scheduleInsert.run(term1Exam.id, grade8A.id, sub.id, 1, 'approved', adminUser.id, '2026-03-10 10:00:00');
    });

    // Mid-Year: Draft Schedules
    [math, sci, eng].forEach((sub) => {
      scheduleInsert.run(midYearExam.id, grade8A.id, sub.id, 1, 'draft', null, null);
    });

    // 14. Marks Sheets across Multi-Tier Moderation Lifecycle
    const sheetInsert = db.prepare(`
      INSERT INTO marks_sheets (
        examination_id, class_id, subject_id, academic_year_id, teacher_id,
        revision, status, submission_notes, submitted_at,
        reviewed_by_user_id, reviewed_at, review_remarks,
        approved_by_user_id, approved_at, approval_remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Sheet 1: Mathematics (Grade 8-A) -> APPROVED
    sheetInsert.run(
      term1Exam.id, grade8A.id, math.id, currentYear.id, teacherSamantha.id,
      2, 'approved', 'Marks submitted after full internal checking', '2026-03-28 12:00:00',
      sectionHeadUser.id, '2026-03-29 10:00:00', 'Endorsed for final sign-off',
      adminUser.id, '2026-03-29 15:00:00', 'Approved by Principal'
    );
    const mathSheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND subject_id = ?").get(term1Exam.id, math.id) as { id: number };

    // Sheet 2: Science (Grade 8-A) -> REVIEWED (Awaiting Principal approval)
    sheetInsert.run(
      term1Exam.id, grade8A.id, sci.id, currentYear.id, teacherPriya.id,
      1, 'reviewed', 'Science lab marks included', '2026-03-28 14:00:00',
      sectionHeadUser.id, '2026-03-29 11:30:00', 'Endorsed by Section Head',
      null, null, null
    );
    const sciSheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND subject_id = ?").get(term1Exam.id, sci.id) as { id: number };

    // Sheet 3: English (Grade 8-A) -> SUBMITTED (Awaiting Section Head review)
    sheetInsert.run(
      term1Exam.id, grade8A.id, eng.id, currentYear.id, teacherNimali.id,
      1, 'submitted', 'All grammar and essay marks compiled', '2026-03-28 16:00:00',
      null, null, null,
      null, null, null
    );
    const engSheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND subject_id = ?").get(term1Exam.id, eng.id) as { id: number };

    // Sheet 4: History (Grade 8-A) -> DRAFT
    sheetInsert.run(
      term1Exam.id, grade8A.id, his.id, currentYear.id, teacherSamantha.id,
      1, 'draft', null, null,
      null, null, null,
      null, null, null
    );

    // 15. Student Marks Records
    const marksInsert = db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, score, max_score, assessment_status, grade_letter, entered_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, 100, 'PRESENT', ?, ?)
    `);

    function calcGrade(score: number): string {
      if (score >= 75) return 'A';
      if (score >= 65) return 'B';
      if (score >= 50) return 'C';
      if (score >= 35) return 'S';
      return 'F';
    }

    const subjectsToScore = [
      { sub: math, sheetId: mathSheet.id, user: teacherSamantha.id, base: 78 },
      { sub: sci, sheetId: sciSheet.id, user: teacherPriya.id, base: 72 },
      { sub: eng, sheetId: engSheet.id, user: teacherNimali.id, base: 82 }
    ];

    subjectsToScore.forEach(({ sub, sheetId, user, base }) => {
      createdStudents.forEach((studentId, idx) => {
        const variance = ((idx * 7) % 35) - 15;
        let score = Math.min(98, Math.max(30, base + variance));
        const grade = calcGrade(score);
        marksInsert.run(sheetId, term1Exam.id, grade8A.id, sub.id, studentId, score, grade, user);
      });
    });

    // 16. Post-Publication Corrections (Demonstrating Reissued report cards & negative states)
    const firstStudentId = createdStudents[0];
    const secondStudentId = createdStudents[1];
    const thirdStudentId = createdStudents[2];

    const correctionInsert = db.prepare(`
      INSERT INTO marks_corrections (
        mark_id, sheet_id, examination_id, student_id, subject_id,
        requested_by_user_id, expected_previous_score, expected_previous_status,
        requested_score, requested_status, correction_category, detailed_justification,
        status, reviewed_by_user_id, reviewed_at, review_comments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Approved Correction (Triggers Reissued Report Card on Student 1)
    const st1Mark = db.prepare("SELECT id, score, assessment_status FROM marks WHERE student_id = ? AND subject_id = ? AND examination_id = ?").get(firstStudentId, math.id, term1Exam.id) as any;
    const st1InitialScore = Number(st1Mark.score);
    correctionInsert.run(
      st1Mark.id, mathSheet.id, term1Exam.id, firstStudentId, math.id,
      teacherSamantha.id, st1InitialScore, st1Mark.assessment_status, 85, 'PRESENT',
      'clerical_addition', 'Recalculation of Section B marks upon formal re-examination appeal (Demo Case)',
      'approved', adminUser.id, '2026-04-02 10:30:00', 'Approved following script inspection (Demo Approval)'
    );
    // Update student 1 mark to reflect the approved correction accurately
    db.prepare("UPDATE marks SET score = 85, grade_letter = 'A', updated_at = '2026-04-02 10:30:00' WHERE id = ?").run(st1Mark.id);

    // Pending Correction on Science sheet
    const st2Mark = db.prepare("SELECT id, score, assessment_status FROM marks WHERE student_id = ? AND subject_id = ? AND examination_id = ?").get(secondStudentId, sci.id, term1Exam.id) as any;
    correctionInsert.run(
      st2Mark.id, sciSheet.id, term1Exam.id, secondStudentId, sci.id,
      teacherPriya.id, Number(st2Mark.score), st2Mark.assessment_status, 79, 'PRESENT',
      're_scrutiny', 'Formal appeal registered by parent regarding paper 2 question 4 (Demo Case)',
      'pending', null, null, null
    );

    // Rejected Correction on English sheet
    const st3Mark = db.prepare("SELECT id, score, assessment_status FROM marks WHERE student_id = ? AND subject_id = ? AND examination_id = ?").get(thirdStudentId, eng.id, term1Exam.id) as any;
    correctionInsert.run(
      st3Mark.id, engSheet.id, term1Exam.id, thirdStudentId, eng.id,
      teacherNimali.id, Number(st3Mark.score), st3Mark.assessment_status, 95, 'PRESENT',
      'other', 'Requested additional discretionary marks (Demo Case)',
      'rejected', adminUser.id, '2026-04-05 14:15:00', 'Rejected: No arithmetic error found on original script (Demo Rejection)'
    );

    // 17. Transition Term 1 to Published and Insert Immutable Publication Snapshot Record
    const recentPublishedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    db.prepare(`
      UPDATE examinations
      SET is_published = 1, status = 'published', assessment_policy_id = ?, publication_version = 1, published_at = ?
      WHERE id = ?
    `).run(approvedPolicy.id, recentPublishedAt, term1Exam.id);

    // Transition marks sheets in published examination to published status
    db.prepare(`
      UPDATE marks_sheets
      SET status = 'published'
      WHERE examination_id = ? AND status = 'approved'
    `).run(term1Exam.id);

    const pubInsert = db.prepare(`
      INSERT INTO examination_publications (
        examination_id, publication_version, policy_profile_id, policy_version,
        published_by_user_id, published_at, publication_snapshot_json, audit_hash
      ) VALUES (?, 1, ?, 1, ?, ?, ?, 'a1b2c3d4e5f67890123456789abcdef0')
    `);

    const mockSnapshot = JSON.stringify({
      publishedAt: recentPublishedAt,
      publisher: { id: adminUser.id, username: 'admin', role: 'principal' },
      policy: { id: approvedPolicy.id, policy_code: 'KCC-SEC-STD-2026-V1' },
      classes: [{ classId: grade8A.id, className: 'Grade 8-A', studentCount: createdStudents.length }]
    });

    try {
      pubInsert.run(term1Exam.id, approvedPolicy.id, adminUser.id, recentPublishedAt, mockSnapshot);
    } catch (err: any) {
      console.log('Publication snapshot insert notice:', err.message);
    }

    // 18. Audit log entries
    const auditInsert = db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    auditInsert.run(adminUser.id, 'admin', 'SYSTEM_INIT', 'System', '0', JSON.stringify({ message: 'SkoolSys 2.0 PR-005 Examination Management initial seed completed (Demo Data).' }));
    auditInsert.run(teacherNimali.id, 'teacher_nimali', 'ATTENDANCE_SUBMIT', 'attendance_sessions', recentDates[4], JSON.stringify({ class: 'Grade 8-A', recordsCount: createdStudents.length }));
    auditInsert.run(adminUser.id, 'admin', 'EXAMINATION_PUBLISH', 'examinations', String(term1Exam.id), JSON.stringify({ exam: 'Term 1 Assessment 2026', policy: 'KCC-SEC-STD-2026-V1' }));

    // Stamp verified disposable fixture marker
    stampDisposableMarker(db, options?.fixtureToken || 'DISPOSABLE_DEMO_SEED_2026');

    db.exec('COMMIT;');

    console.log('✅ SkoolSys Database seeded successfully with synthetic demo data:');
    console.log('   - 1 Academic Year (2026)');
    console.log('   - 6 Synthetic System Users (Principal, VP Academic, Section Head, Class Teacher, Subject Teachers)');
    console.log('   - 3 Active Leadership Authorizations (Principal, VP, Section Head)');
    console.log('   - 18 Classes (Grades 6 to 13)');
    console.log('   - 12 Core & Secondary Subjects');
    console.log('   - 20 Students with Confirmed Subject Enrolments (Core + Elective)');
    console.log('   - 2 Assessment Policy Profiles (Approved & Provisional)');
    console.log('   - 3 Examinations across different lifecycle stages (Published, Scheduled, Draft)');
    console.log('   - Approved & Draft Examination Schedules');
    console.log('   - 4 Marks Sheets in Approved, Reviewed, Submitted, and Draft states');
    console.log('   - 3 Post-Publication Corrections (Approved/Reissued, Pending, Rejected)');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {}
    throw err;
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  try {
    runSeed();
  } catch (err: any) {
    console.error('❌ Seeding aborted:', err.message);
    process.exit(1);
  }
}
