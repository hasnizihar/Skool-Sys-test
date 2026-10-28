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
import {
  GradingScaleItem,
  AbsenceRules,
  RankingRules
} from '../services/assessmentPolicyService.js';
import { publishExamination } from '../services/examinationPublicationService.js';
import { requestMarkCorrection, reviewMarkCorrection } from '../services/marksCorrectionService.js';
import { AuthUser } from '../middleware/auth.js';

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

  console.log('🌱 Starting Kattankudy Central College MVP database seed against disposable target...');

  // Topological table deletion child-before-parent under PRAGMA foreign_keys = ON within transaction
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('BEGIN IMMEDIATE;');

  try {
    // 1. Clean existing tables in topological dependency order (child before parent)
    const tablesToDelete = [
      '_skoolsys_disposable_marker',
      'attendance_sync_receipts',
      'quarantined_legacy_marks',
      'marks_audit_history',
      'marks_corrections',
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
      'academic_terms',
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

    // 2. Academic Year & Terms
    const yearStmt = db.prepare(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES (?, ?, ?, ?)
    `);
    yearStmt.run('2026', '2026-01-05', '2026-12-15', 1);
    const currentYear = db.prepare("SELECT id FROM academic_years WHERE name = '2026'").get() as { id: number };

    try {
      const termStmt = db.prepare(`
        INSERT INTO academic_terms (academic_year_id, term_number, name, start_date, end_date, is_current)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      termStmt.run(currentYear.id, 1, 'Term 1', '2026-01-05', '2026-04-10', 0);
      termStmt.run(currentYear.id, 2, 'Term 2', '2026-04-27', '2026-08-14', 0);
      termStmt.run(currentYear.id, 3, 'Term 3', '2026-09-01', '2026-12-15', 1);
    } catch {
      // Table may not exist in all environments
    }

    // 3. System Users & Passwords (Fictional Demo Synthetic Personas)
    const salt = bcrypt.genSaltSync(10);
    const adminPass = bcrypt.hashSync('admin123', salt);
    const teacherPass = bcrypt.hashSync('teacher123', salt);

    const userStmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Demonstrative administrative and faculty roles (All labeled DEMO ONLY & Synthetic)
    userStmt.run('admin', 'admin@skoolsys.edu', adminPass, 'DEMO ONLY: Principal — Demo Account (Synthetic Admin)', 'admin');
    userStmt.run('vp_academic', 'vp.academic@skoolsys.edu', teacherPass, 'DEMO ONLY: Mr. M.I.M. Nawas (Synthetic VP Academic)', 'class_teacher');
    userStmt.run('section_head_junior', 'sh.junior@skoolsys.edu', teacherPass, 'DEMO ONLY: Mr. K.L.M. Farook (Synthetic Section Head Grades 6-9)', 'class_teacher');
    userStmt.run('section_head_senior', 'sh.senior@skoolsys.edu', teacherPass, 'DEMO ONLY: Mr. S.H.M. Jameel (Synthetic Section Head Grades 10-13)', 'class_teacher');
    userStmt.run('it_admin', 'it.admin@skoolsys.edu', adminPass, 'DEMO ONLY: IT Administrator — Demo Account (Synthetic)', 'admin');
    userStmt.run('teacher_nimali', 'nimali.perera@skoolsys.edu', teacherPass, 'DEMO ONLY: Mrs. Nimali Perera (Synthetic Teacher)', 'class_teacher');
    userStmt.run('teacher_samantha', 'samantha.silva@skoolsys.edu', teacherPass, 'DEMO ONLY: Mr. Samantha Silva (Synthetic Teacher)', 'subject_teacher');
    userStmt.run('teacher_priya', 'priya.wickrama@skoolsys.edu', teacherPass, 'DEMO ONLY: Ms. Priyanthi Wickramasinghe (Synthetic Teacher)', 'subject_teacher');
    userStmt.run('teacher_fathima', 'fathima.rameeza@skoolsys.edu', teacherPass, 'DEMO ONLY: Mrs. Fathima Rameeza (Synthetic Teacher)', 'class_teacher');
    userStmt.run('teacher_mansoor', 'mansoor.ahmed@skoolsys.edu', teacherPass, 'DEMO ONLY: Mr. M.A. Mansoor (Synthetic Teacher)', 'class_teacher');
    userStmt.run('teacher_kamal', 'kamal.wickremesooriya@skoolsys.edu', teacherPass, 'DEMO ONLY: Mr. Kamal Wickremesooriya (Synthetic Teacher)', 'class_teacher');
    userStmt.run('teacher_zareena', 'zareena.begum@skoolsys.edu', teacherPass, 'DEMO ONLY: Mrs. Zareena Begum (Synthetic Teacher)', 'class_teacher');

    const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number };
    const vpUser = db.prepare("SELECT id FROM users WHERE username = 'vp_academic'").get() as { id: number };
    const sectionHeadUser = db.prepare("SELECT id FROM users WHERE username = 'section_head_junior'").get() as { id: number };
    const sectionHeadSeniorUser = db.prepare("SELECT id FROM users WHERE username = 'section_head_senior'").get() as { id: number };
    const itAdminUser = db.prepare("SELECT id FROM users WHERE username = 'it_admin'").get() as { id: number };
    const teacherNimali = db.prepare("SELECT id FROM users WHERE username = 'teacher_nimali'").get() as { id: number };
    const teacherSamantha = db.prepare("SELECT id FROM users WHERE username = 'teacher_samantha'").get() as { id: number };
    const teacherPriya = db.prepare("SELECT id FROM users WHERE username = 'teacher_priya'").get() as { id: number };
    const teacherFathima = db.prepare("SELECT id FROM users WHERE username = 'teacher_fathima'").get() as { id: number };
    const teacherMansoor = db.prepare("SELECT id FROM users WHERE username = 'teacher_mansoor'").get() as { id: number };
    const teacherKamal = db.prepare("SELECT id FROM users WHERE username = 'teacher_kamal'").get() as { id: number };
    const teacherZareena = db.prepare("SELECT id FROM users WHERE username = 'teacher_zareena'").get() as { id: number };

    // 4. Academic Staff Authorizations (PR-005 Multi-Tier Leadership Authorizations)
    // Notice: itAdminUser has NO academic authorization record (enforcing segregation of duties)
    const authStmt = db.prepare(`
      INSERT INTO academic_staff_authorizations (user_id, academic_year_id, auth_role, grade_band, is_active, granted_by_user_id)
      VALUES (?, ?, ?, ?, 1, ?)
    `);

    authStmt.run(adminUser.id, currentYear.id, 'principal', 'all', adminUser.id);
    authStmt.run(vpUser.id, currentYear.id, 'vice_principal_academic', 'all', adminUser.id);
    authStmt.run(sectionHeadUser.id, currentYear.id, 'section_head', 'junior_6_9', adminUser.id);
    authStmt.run(sectionHeadSeniorUser.id, currentYear.id, 'section_head', 'ol_10_11', adminUser.id);
    authStmt.run(sectionHeadSeniorUser.id, currentYear.id, 'section_head', 'al_12_13', adminUser.id);

    // 5. Classes (Grades 6 to 13 — Kattankudy Central College Institutional Structure)
    const classStmt = db.prepare(`
      INSERT INTO classes (grade, name, room_number, academic_year_id, class_teacher_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    classStmt.run(6, 'Grade 6-A', 'Block A - 101', currentYear.id, teacherFathima.id);
    classStmt.run(6, 'Grade 6-B', 'Block A - 102', currentYear.id, teacherZareena.id);
    classStmt.run(7, 'Grade 7-A', 'Block A - 201', currentYear.id, teacherZareena.id);
    classStmt.run(7, 'Grade 7-B', 'Block A - 202', currentYear.id, teacherFathima.id);
    classStmt.run(8, 'Grade 8-A', 'Block B - 101', currentYear.id, teacherNimali.id);
    classStmt.run(8, 'Grade 8-B', 'Block B - 102', currentYear.id, teacherSamantha.id);
    classStmt.run(9, 'Grade 9-A', 'Block B - 201', currentYear.id, teacherSamantha.id);
    classStmt.run(9, 'Grade 9-B', 'Block B - 202', currentYear.id, teacherPriya.id);
    classStmt.run(10, 'Grade 10-A', 'Block C - 101', currentYear.id, teacherZareena.id);
    classStmt.run(10, 'Grade 10-B', 'Block C - 102', currentYear.id, teacherMansoor.id);
    classStmt.run(11, 'Grade 11-A', 'Block C - 201', currentYear.id, teacherMansoor.id);
    classStmt.run(11, 'Grade 11-B', 'Block C - 202', currentYear.id, teacherNimali.id);
    classStmt.run(12, 'Grade 12-Science', 'Science Lab 1', currentYear.id, teacherKamal.id);
    classStmt.run(12, 'Grade 12-Commerce', 'Block D - 101', currentYear.id, teacherMansoor.id);
    classStmt.run(12, 'Grade 12-Arts', 'Block D - 201', currentYear.id, teacherPriya.id);
    classStmt.run(13, 'Grade 13-Science', 'Science Lab 2', currentYear.id, teacherKamal.id);
    classStmt.run(13, 'Grade 13-Commerce', 'Block D - 102', currentYear.id, teacherMansoor.id);
    classStmt.run(13, 'Grade 13-Arts', 'Block D - 202', currentYear.id, teacherPriya.id);

    const grade6A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 6-A'").get() as { id: number };
    const grade6B = db.prepare("SELECT id FROM classes WHERE name = 'Grade 6-B'").get() as { id: number };
    const grade7A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 7-A'").get() as { id: number };
    const grade7B = db.prepare("SELECT id FROM classes WHERE name = 'Grade 7-B'").get() as { id: number };
    const grade8A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 8-A'").get() as { id: number };
    const grade8B = db.prepare("SELECT id FROM classes WHERE name = 'Grade 8-B'").get() as { id: number };
    const grade9A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 9-A'").get() as { id: number };
    const grade9B = db.prepare("SELECT id FROM classes WHERE name = 'Grade 9-B'").get() as { id: number };
    const grade10A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 10-A'").get() as { id: number };
    const grade10B = db.prepare("SELECT id FROM classes WHERE name = 'Grade 10-B'").get() as { id: number };
    const grade11A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 11-A'").get() as { id: number };
    const grade11B = db.prepare("SELECT id FROM classes WHERE name = 'Grade 11-B'").get() as { id: number };
    const grade12Sci = db.prepare("SELECT id FROM classes WHERE name = 'Grade 12-Science'").get() as { id: number };
    const grade12Com = db.prepare("SELECT id FROM classes WHERE name = 'Grade 12-Commerce'").get() as { id: number };
    const grade12Art = db.prepare("SELECT id FROM classes WHERE name = 'Grade 12-Arts'").get() as { id: number };
    const grade13Sci = db.prepare("SELECT id FROM classes WHERE name = 'Grade 13-Science'").get() as { id: number };
    const grade13Com = db.prepare("SELECT id FROM classes WHERE name = 'Grade 13-Commerce'").get() as { id: number };
    const grade13Art = db.prepare("SELECT id FROM classes WHERE name = 'Grade 13-Arts'").get() as { id: number };

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
    subStmt.run('TAM', 'Tamil Language & Lit.', 'Core', '6-11');
    subStmt.run('ISL', 'Islam / Islamic Studies', 'Religion', '6-11');
    subStmt.run('BUD', 'Buddhism / Buddhist Culture', 'Religion', '6-11');
    subStmt.run('BIO', 'Biology', 'Science', '12-13');
    subStmt.run('ACC', 'Accounting', 'Commerce', '12-13');
    subStmt.run('BS', 'Business Studies', 'Commerce', '12-13');
    subStmt.run('ECON', 'Economics', 'Commerce', '12-13');

    const math = db.prepare("SELECT id FROM subjects WHERE code = 'MATH'").get() as { id: number };
    const sci = db.prepare("SELECT id FROM subjects WHERE code = 'SCI'").get() as { id: number };
    const eng = db.prepare("SELECT id FROM subjects WHERE code = 'ENG'").get() as { id: number };
    const sin = db.prepare("SELECT id FROM subjects WHERE code = 'SIN'").get() as { id: number };
    const his = db.prepare("SELECT id FROM subjects WHERE code = 'HIST'").get() as { id: number };
    const ict = db.prepare("SELECT id FROM subjects WHERE code = 'ICT'").get() as { id: number };
    const art = db.prepare("SELECT id FROM subjects WHERE code = 'ART'").get() as { id: number };
    const hpe = db.prepare("SELECT id FROM subjects WHERE code = 'HPE'").get() as { id: number };
    const comm = db.prepare("SELECT id FROM subjects WHERE code = 'COMM'").get() as { id: number };
    const phy = db.prepare("SELECT id FROM subjects WHERE code = 'PHY'").get() as { id: number };
    const chem = db.prepare("SELECT id FROM subjects WHERE code = 'CHEM'").get() as { id: number };
    const cmath = db.prepare("SELECT id FROM subjects WHERE code = 'CMATH'").get() as { id: number };
    const tam = db.prepare("SELECT id FROM subjects WHERE code = 'TAM'").get() as { id: number };
    const isl = db.prepare("SELECT id FROM subjects WHERE code = 'ISL'").get() as { id: number };
    const acc = db.prepare("SELECT id FROM subjects WHERE code = 'ACC'").get() as { id: number };
    const bs = db.prepare("SELECT id FROM subjects WHERE code = 'BS'").get() as { id: number };
    const econ = db.prepare("SELECT id FROM subjects WHERE code = 'ECON'").get() as { id: number };

    // 7. Class Subjects Association (Curriculum Mapping)
    const csStmt = db.prepare(`
      INSERT INTO class_subjects (class_id, subject_id)
      VALUES (?, ?)
    `);

    // Junior: 8-A and 8-B (Baseline preserved)
    [math, sci, eng, his, ict, art, hpe].forEach((sub) => {
      csStmt.run(grade8A.id, sub.id);
      csStmt.run(grade8B.id, sub.id);
    });

    // Junior: 6-A, 6-B, 7-A, 7-B
    [math, sci, eng, tam, isl, his, hpe, art].forEach((sub) => {
      csStmt.run(grade6A.id, sub.id);
      csStmt.run(grade6B.id, sub.id);
      csStmt.run(grade7A.id, sub.id);
      csStmt.run(grade7B.id, sub.id);
    });

    // Junior: 9-A, 9-B
    [math, sci, eng, tam, isl, his, ict, hpe].forEach((sub) => {
      csStmt.run(grade9A.id, sub.id);
      csStmt.run(grade9B.id, sub.id);
    });

    // Senior Secondary: 10-A, 10-B, 11-A, 11-B
    [math, sci, eng, tam, comm, his, ict, isl].forEach((sub) => {
      csStmt.run(grade10A.id, sub.id);
      csStmt.run(grade10B.id, sub.id);
      csStmt.run(grade11A.id, sub.id);
      csStmt.run(grade11B.id, sub.id);
    });

    // Collegiate Science: 12-Science and 13-Science
    [phy, chem, cmath, eng, ict].forEach((sub) => {
      csStmt.run(grade12Sci.id, sub.id);
      csStmt.run(grade13Sci.id, sub.id);
    });

    // Collegiate Commerce: 12-Commerce and 13-Commerce
    [acc, bs, econ, eng, ict].forEach((sub) => {
      csStmt.run(grade12Com.id, sub.id);
      csStmt.run(grade13Com.id, sub.id);
    });

    // Collegiate Arts: 12-Arts and 13-Arts
    [tam, his, eng, ict, art].forEach((sub) => {
      csStmt.run(grade12Art.id, sub.id);
      csStmt.run(grade13Art.id, sub.id);
    });

    // 8. Teacher Assignments
    const taStmt = db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Grade 8-A assignments (Preserve baseline)
    taStmt.run(teacherNimali.id, grade8A.id, null, currentYear.id, 'class_teacher');
    taStmt.run(teacherSamantha.id, grade8A.id, math.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherPriya.id, grade8A.id, sci.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherNimali.id, grade8A.id, eng.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherSamantha.id, grade8A.id, his.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherPriya.id, grade8A.id, ict.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherNimali.id, grade8A.id, art.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherSamantha.id, grade8A.id, hpe.id, currentYear.id, 'subject_teacher');

    // Grade 6-A assignments
    taStmt.run(teacherFathima.id, grade6A.id, null, currentYear.id, 'class_teacher');
    taStmt.run(teacherFathima.id, grade6A.id, tam.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherFathima.id, grade6A.id, eng.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherSamantha.id, grade6A.id, math.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherPriya.id, grade6A.id, sci.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherZareena.id, grade6A.id, isl.id, currentYear.id, 'subject_teacher');

    // Grade 11-A assignments
    taStmt.run(teacherMansoor.id, grade11A.id, null, currentYear.id, 'class_teacher');
    taStmt.run(teacherMansoor.id, grade11A.id, comm.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherSamantha.id, grade11A.id, math.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherPriya.id, grade11A.id, sci.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherNimali.id, grade11A.id, eng.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherFathima.id, grade11A.id, tam.id, currentYear.id, 'subject_teacher');

    // Grade 12-Science assignments
    taStmt.run(teacherKamal.id, grade12Sci.id, null, currentYear.id, 'class_teacher');
    taStmt.run(teacherKamal.id, grade12Sci.id, phy.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherKamal.id, grade12Sci.id, chem.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherSamantha.id, grade12Sci.id, cmath.id, currentYear.id, 'subject_teacher');

    // Grade 12-Commerce assignments
    taStmt.run(teacherMansoor.id, grade12Com.id, null, currentYear.id, 'class_teacher');
    taStmt.run(teacherMansoor.id, grade12Com.id, acc.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherMansoor.id, grade12Com.id, bs.id, currentYear.id, 'subject_teacher');
    taStmt.run(teacherMansoor.id, grade12Com.id, econ.id, currentYear.id, 'subject_teacher');

    // 9. Students & Enrollments across Grades 6 to 13 (220 Fictional Boys Profiles)
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

    const sseInsert = db.prepare(`
      INSERT INTO student_subject_enrollments (
        student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at
      ) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, '2026-01-15 08:00:00')
    `);

    // A. Grade 8-A (20 students) — BASELINE FIXTURE FOR REGRESSION TESTS
    // SCH-2024-001 (Kasun) is preserved; all profiles are male and representative of Kattankudy / Batticaloa.
    const grade8AStudents = [
      { adm: 'SCH-2024-001', name: 'Kasun Malinda Ranasinghe', call: 'Kasun', dob: '2012-03-14', gender: 'Male', gName: 'Sunil Ranasinghe', gRel: 'Father', phone: '0770001001', addr: 'No. 45, Beach Road, New Kattankudy 06' },
      { adm: 'SCH-2024-002', name: 'Mohamed Tariq Rameez', call: 'Tariq', dob: '2012-05-22', gender: 'Male', gName: 'Rameez Lebbe', gRel: 'Father', phone: '0770001002', addr: 'No. 12, Station Road, New Kattankudy 02' },
      { adm: 'SCH-2024-003', name: 'Dineth Sathsara Jayawardena', call: 'Dineth', dob: '2012-01-19', gender: 'Male', gName: 'Rohan Jayawardena', gRel: 'Father', phone: '0770001003', addr: 'No. 23, Central Road, Kattankudy 04' },
      { adm: 'SCH-2024-004', name: 'Abdul Majeed Salman', call: 'Salman', dob: '2012-07-08', gender: 'Male', gName: 'Majeed Farook', gRel: 'Father', phone: '0770001004', addr: 'No. 56, Lake Road, Kattankudy 05' },
      { adm: 'SCH-2024-005', name: 'Kavindu Theekshana Weerasinghe', call: 'Kavindu', dob: '2012-09-15', gender: 'Male', gName: 'Prasanna Weerasinghe', gRel: 'Father', phone: '0770001005', addr: 'No. 89, Beach Road, New Kattankudy 01' },
      { adm: 'SCH-2024-006', name: 'Mohamed Ashfaq Naleem', call: 'Ashfaq', dob: '2012-11-30', gender: 'Male', gName: 'Naleem Hadjiar', gRel: 'Father', phone: '0770001006', addr: 'No. 104, Old Mosque Road, Kattankudy 03' },
      { adm: 'SCH-2024-007', name: 'Bawantha Nimnada Abeykoon', call: 'Bawantha', dob: '2012-04-05', gender: 'Male', gName: 'Ajith Abeykoon', gRel: 'Father', phone: '0770001007', addr: 'No. 71, Main Street, Kattankudy 06' },
      { adm: 'SCH-2024-008', name: 'Mohamed Sajid Hafeel', call: 'Sajid', dob: '2012-08-12', gender: 'Male', gName: 'Hafeel Mohamed', gRel: 'Father', phone: '0770001008', addr: 'No. 15, Post Office Lane, Kattankudy 02' },
      { adm: 'SCH-2024-009', name: 'Akeel Mohamed Rizwan', call: 'Akeel', dob: '2012-02-28', gender: 'Male', gName: 'Mohamed Rizwan', gRel: 'Father', phone: '0770001009', addr: 'No. 34, Beach Road, New Kattankudy 06' },
      { adm: 'SCH-2024-010', name: 'Mohamed Nabeel Irfan', call: 'Nabeel', dob: '2012-06-17', gender: 'Male', gName: 'Irfan Cassim', gRel: 'Father', phone: '0770001010', addr: 'No. 92, Circular Road, Kattankudy 04' },
      { adm: 'SCH-2024-011', name: 'Sahan Prabhashwara Gunathilake', call: 'Sahan', dob: '2012-10-03', gender: 'Male', gName: 'Bandula Gunathilake', gRel: 'Father', phone: '0770001011', addr: 'No. 18, Lake Road, Kattankudy 05' },
      { adm: 'SCH-2024-012', name: 'Mohamed Zaid Subair', call: 'Zaid', dob: '2012-12-25', gender: 'Male', gName: 'Subair Hajiar', gRel: 'Father', phone: '0770001012', addr: 'No. 63, Hospital Road, Kattankudy 04' },
      { adm: 'SCH-2024-013', name: 'Sithum Nimsara Karunaratne', call: 'Sithum', dob: '2012-01-11', gender: 'Male', gName: 'Nihal Karunaratne', gRel: 'Father', phone: '0770001013', addr: 'No. 41, Central Road, Kattankudy 03' },
      { adm: 'SCH-2024-014', name: 'Mohamed Safwan Thahir', call: 'Safwan', dob: '2012-04-19', gender: 'Male', gName: 'Thahir Aliyar', gRel: 'Father', phone: '0770001014', addr: 'No. 09, Mosque Lane, Kattankudy 01' },
      { adm: 'SCH-2024-015', name: 'Naveen Lakshan Alahakoon', call: 'Naveen', dob: '2012-07-27', gender: 'Male', gName: 'Sarath Alahakoon', gRel: 'Father', phone: '0770001015', addr: 'No. 82, Beach Road, New Kattankudy 02' },
      { adm: 'SCH-2024-016', name: 'Mohamed Farhan Nizam', call: 'Farhan', dob: '2012-09-02', gender: 'Male', gName: 'Nizamdeen Seeni', gRel: 'Father', phone: '0770001016', addr: 'No. 27, Cross Street, Kattankudy 05' },
      { adm: 'SCH-2024-017', name: 'Thevindu Hasaranga Mendis', call: 'Thevindu', dob: '2012-03-21', gender: 'Male', gName: 'Upali Mendis', gRel: 'Father', phone: '0770001017', addr: 'No. 50, Old Road, Manjanthoduvai' },
      { adm: 'SCH-2024-018', name: 'Mohamed Aslam Faizal', call: 'Aslam', dob: '2012-08-30', gender: 'Male', gName: 'Faizal Cassim', gRel: 'Father', phone: '0770001018', addr: 'No. 11, Beach View, New Kattankudy 06' },
      { adm: 'SCH-2024-019', name: 'Lithira Senhas Hettiarachchi', call: 'Lithira', dob: '2012-10-14', gender: 'Male', gName: 'Lalith Hettiarachchi', gRel: 'Father', phone: '0770001019', addr: 'No. 38, Sea View Road, Kattankudy 05' },
      { adm: 'SCH-2024-020', name: 'Vethum Sanjaya Rajapaksha', call: 'Vethum', dob: '2012-05-09', gender: 'Male', gName: 'Janaka Rajapaksha', gRel: 'Father', phone: '0770001020', addr: 'No. 99, Central Lane, Kattankudy 04' }
    ];

    const createdGrade8AIds: number[] = [];
    grade8AStudents.forEach((s, idx) => {
      studentInsert.run(s.adm, s.name, s.call, s.dob, s.gender, s.addr, s.gName, s.gRel, s.phone, `${s.call.toLowerCase()}@demo.kcc.sch.lk`, s.phone);
      const st = db.prepare("SELECT id FROM students WHERE admission_no = ?").get(s.adm) as { id: number };
      createdGrade8AIds.push(st.id);
      enrollInsert.run(st.id, grade8A.id, currentYear.id, idx + 1);

      // Core subjects
      [math, sci, eng, sin, his, ict, hpe].forEach(sub => {
        sseInsert.run(st.id, sub.id, grade8A.id, currentYear.id, 'core_compulsory', adminUser.id);
      });
      // Elective subjects
      if (idx < 10) {
        sseInsert.run(st.id, art.id, grade8A.id, currentYear.id, 'ol_basket_1', adminUser.id);
      } else {
        sseInsert.run(st.id, comm.id, grade8A.id, currentYear.id, 'ol_basket_1', adminUser.id);
      }
    });

    // Helper to batch seed realistic synthetic boy student rosters for other classes
    const seedClassRoster = (
      classRecord: { id: number },
      gradeLevel: number,
      admPrefix: string,
      startNum: number,
      count: number,
      names: Array<{ name: string; call: string; gName: string; addr: string }>,
      subjectList: Array<{ id: number }>
    ): number[] => {
      const studentIds: number[] = [];
      for (let i = 0; i < count; i++) {
        const item = names[i % names.length];
        const numStr = String(startNum + i).padStart(3, '0');
        const adm = `${admPrefix}-${numStr}`;
        const birthYear = 2026 - (gradeLevel + 6);
        const dobMonth = String((i % 12) + 1).padStart(2, '0');
        const dobDay = String(((i * 3) % 27) + 1).padStart(2, '0');
        const dob = `${birthYear}-${dobMonth}-${dobDay}`;
        const phone = `0770001${String(startNum + i).padStart(3, '0')}`;

        studentInsert.run(
          adm,
          item.name,
          item.call,
          dob,
          'Male',
          item.addr,
          item.gName,
          'Father',
          phone,
          `${item.call.toLowerCase()}.${startNum + i}@demo.kcc.sch.lk`,
          phone
        );

        const st = db.prepare("SELECT id FROM students WHERE admission_no = ?").get(adm) as { id: number };
        studentIds.push(st.id);
        enrollInsert.run(st.id, classRecord.id, currentYear.id, i + 1);

        subjectList.forEach(sub => {
          sseInsert.run(st.id, sub.id, classRecord.id, currentYear.id, 'core_compulsory', adminUser.id);
        });
      }
      return studentIds;
    };

    // Fictional realistic Kattankudy name/address fixture pools
    const juniorPool1 = [
      { name: 'Mohamed Ashfaq Farzan', call: 'Ashfaq', gName: 'Farzan Mohamed', addr: 'No. 15, Beach Road, New Kattankudy 01' },
      { name: 'Abdul Rahman Salman', call: 'Salman', gName: 'Salman Farook', addr: 'No. 22, Central Road, Kattankudy 06' },
      { name: 'Mohamed Hisham Risvi', call: 'Hisham', gName: 'Risvi Mohamed', addr: 'No. 12, Main Street, New Kattankudy 03' },
      { name: 'Mohamed Aadhil Mansoor', call: 'Aadhil', gName: 'Mansoor Ali', addr: 'No. 31, Hospital Road, Kattankudy 04' },
      { name: 'Mohamed Bilal Azhar', call: 'Bilal', gName: 'Azhar Moulana', addr: 'No. 54, Lake Road, Kattankudy 06' },
      { name: 'Mohamed Luqman Thahir', call: 'Luqman', gName: 'Thahir Aliyar', addr: 'No. 88, Old Road, Manjanthoduvai' },
      { name: 'Mohamed Umair Rauf', call: 'Umair', gName: 'Rauf Bawa', addr: 'No. 40, Cross Street, Kattankudy 05' },
      { name: 'Mohamed Zayan Majeed', call: 'Zayan', gName: 'Majeed Sultan', addr: 'No. 73, Court Road, Batticaloa' },
      { name: 'Mohamed Ilham Sheriff', call: 'Ilham', gName: 'Sheriffdeen Hadjiar', addr: 'No. 19, Beach Lane, New Kattankudy 02' },
      { name: 'Mohamed Danish Faizal', call: 'Danish', gName: 'Faizal Cassim', addr: 'No. 28, Circular Road, Kattankudy 01' },
      { name: 'Abdul Basith Jameel', call: 'Basith', gName: 'Jameel Ahmed', addr: 'No. 65, Market Lane, Kattankudy 02' },
      { name: 'Mohamed Rinas Shihab', call: 'Rinas', gName: 'Shihab Marikkar', addr: 'No. 47, Post Office Road, Kattankudy 03' },
      { name: 'Mohamed Mushtaq Subair', call: 'Mushtaq', gName: 'Subair Hajiar', addr: 'No. 14, Grand Mosque Road, Kattankudy 01' },
      { name: 'Mohamed Hamza Nizam', call: 'Hamza', gName: 'Nizamdeen Seeni', addr: 'No. 36, Beach View, New Kattankudy 06' },
      { name: 'Mohamed Anas Latheef', call: 'Anas', gName: 'Latheef Kariapper', addr: 'No. 52, Sea View Avenue, Kattankudy 05' }
    ];

    const juniorPool2 = [
      { name: 'Mohamed Rayan Niyas', call: 'Rayan', gName: 'Niyas Mohamed', addr: 'No. 18, Central Street, Kattankudy 03' },
      { name: 'Abdul Hadi Basheer', call: 'Hadi', gName: 'Basheer Ahmed', addr: 'No. 42, Hospital Road, Kattankudy 04' },
      { name: 'Mohamed Zaheem Siraj', call: 'Zaheem', gName: 'Sirajdeen Moulana', addr: 'No. 09, Beach Road, New Kattankudy 02' },
      { name: 'Mohamed Afnan Haris', call: 'Afnan', gName: 'Haris Mohamed', addr: 'No. 60, Lake Road, Kattankudy 06' },
      { name: 'Mohamed Shuaib Thowfeek', call: 'Shuaib', gName: 'Thowfeek Bawa', addr: 'No. 33, Station Road, Batticaloa' },
      { name: 'Mohamed Waseem Aslam', call: 'Waseem', gName: 'Aslam Lebbe', addr: 'No. 81, Old Mosque Road, Kattankudy 01' },
      { name: 'Abdul Malik Kaleel', call: 'Malik', gName: 'Kaleelur Rahman', addr: 'No. 25, Bazaar Street, Kattankudy 02' },
      { name: 'Mohamed Nihal Fouzul', call: 'Nihal', gName: 'Fouzul Hameed', addr: 'No. 76, New Road, Kattankudy 04' },
      { name: 'Mohamed Sarfan Anwer', call: 'Sarfan', gName: 'Anwer Sadath', addr: 'No. 14, Library Road, Kattankudy 03' },
      { name: 'Mohamed Azim Nafeez', call: 'Azim', gName: 'Nafeez Marikkar', addr: 'No. 90, Central Avenue, Kattankudy 05' },
      { name: 'Mohamed Hafeel Yoonus', call: 'Hafeel', gName: 'Yoonus Moulavi', addr: 'No. 38, Beach Lane, New Kattankudy 01' },
      { name: 'Mohamed Mursheed Jalal', call: 'Mursheed', gName: 'Jalaldeen Hadjiar', addr: 'No. 57, Circular Road, Kattankudy 06' }
    ];

    // Seed Junior Secondary: Grade 6, 7, 8-B, 9
    const createdGrade6AIds = seedClassRoster(grade6A, 6, 'KCC-2026', 1, 15, juniorPool1, [math, sci, eng, tam, isl, his, hpe, art]);
    seedClassRoster(grade6B, 6, 'KCC-2026', 16, 12, juniorPool2, [math, sci, eng, tam, isl, his, hpe, art]);
    seedClassRoster(grade7A, 7, 'KCC-2025', 1, 12, juniorPool1, [math, sci, eng, tam, isl, his, hpe, art]);
    seedClassRoster(grade7B, 7, 'KCC-2025', 13, 12, juniorPool2, [math, sci, eng, tam, isl, his, hpe, art]);
    seedClassRoster(grade8B, 8, 'KCC-2024', 21, 12, juniorPool2, [math, sci, eng, his, ict, art, hpe]);
    seedClassRoster(grade9A, 9, 'KCC-2023', 1, 12, juniorPool1, [math, sci, eng, tam, isl, his, ict, hpe]);
    seedClassRoster(grade9B, 9, 'KCC-2023', 13, 12, juniorPool2, [math, sci, eng, tam, isl, his, ict, hpe]);

    // Seed Senior O/L: Grade 10-A, 10-B
    seedClassRoster(grade10A, 10, 'KCC-2022', 1, 12, juniorPool1, [math, sci, eng, tam, comm, his, ict, isl]);
    seedClassRoster(grade10B, 10, 'KCC-2022', 13, 12, juniorPool2, [math, sci, eng, tam, comm, his, ict, isl]);

    // B. Grade 11-A (15 students - G.C.E. O/L Candidate Class) — BASELINE FIXTURE FOR REGRESSION TESTS
    // SCH-2021-001 (Akram) preserved; all profiles are male.
    const grade11AStudents = [
      { adm: 'SCH-2021-001', name: 'Mohamed Akram Ilham', call: 'Akram', dob: '2009-03-10', gender: 'Male', gName: 'Ilham Sheriff', gRel: 'Father', phone: '0770001081', addr: 'No. 10, Grand Mosque Road, Kattankudy 01' },
      { adm: 'SCH-2021-002', name: 'Abdul Majeed Naleer', call: 'Majeed', dob: '2009-05-14', gender: 'Male', gName: 'Naleer Hadjiar', gRel: 'Father', phone: '0770001082', addr: 'No. 24, Bazaar Street, Kattankudy 02' },
      { adm: 'SCH-2021-003', name: 'Mohamed Afzal Raheem', call: 'Afzal', dob: '2009-01-20', gender: 'Male', gName: 'Abdul Raheem', gRel: 'Father', phone: '0770001083', addr: 'No. 58, New Road, Kattankudy 04' },
      { adm: 'SCH-2021-004', name: 'Abdul Rahman Salman', call: 'Salman', dob: '2009-07-09', gender: 'Male', gName: 'Salman Farook', gRel: 'Father', phone: '0770001084', addr: 'No. 33, College Road, Kattankudy 03' },
      { adm: 'SCH-2021-005', name: 'Mohamed Sarfan Anwer', call: 'Sarfan', dob: '2009-09-17', gender: 'Male', gName: 'Anwer Sadath', gRel: 'Father', phone: '0770001085', addr: 'No. 17, Main Street, Batticaloa' },
      { adm: 'SCH-2021-006', name: 'Mohamed Ashfaq Hameed', call: 'Ashfaq', dob: '2009-11-25', gender: 'Male', gName: 'Hameed Sultan', gRel: 'Father', phone: '0770001086', addr: 'No. 76, Hospital Road, Kattankudy 04' },
      { adm: 'SCH-2021-007', name: 'Mohamed Nihal Jabir', call: 'Nihal', dob: '2009-04-03', gender: 'Male', gName: 'Jabir Mohamed', gRel: 'Father', phone: '0770001087', addr: 'No. 41, Central Lane, Kattankudy 05' },
      { adm: 'SCH-2021-008', name: 'Abdul Wahid Rauf', call: 'Wahid', dob: '2009-08-11', gender: 'Male', gName: 'Abdul Rauf', gRel: 'Father', phone: '0770001088', addr: 'No. 19, Beach Road, New Kattankudy 02' },
      { adm: 'SCH-2021-009', name: 'Mohamed Mursheed Jalal', call: 'Mursheed', dob: '2009-02-18', gender: 'Male', gName: 'Jalaldeen Marikkar', gRel: 'Father', phone: '0770001089', addr: 'No. 62, Station Road, Batticaloa' },
      { adm: 'SCH-2021-010', name: 'Mohamed Ziyad Zubair', call: 'Ziyad', dob: '2009-06-22', gender: 'Male', gName: 'Zubair Alim', gRel: 'Father', phone: '0770001090', addr: 'No. 05, Library Road, Kattankudy 03' },
      { adm: 'SCH-2021-011', name: 'Mohamed Shakir Bazeer', call: 'Shakir', dob: '2009-10-05', gender: 'Male', gName: 'Bazeer Lebbe', gRel: 'Father', phone: '0770001091', addr: 'No. 83, Mosque Lane, Kattankudy 05' },
      { adm: 'SCH-2021-012', name: 'Mohamed Aadhil Latheef', call: 'Aadhil', dob: '2009-12-30', gender: 'Male', gName: 'Latheef Kariapper', gRel: 'Father', phone: '0770001092', addr: 'No. 29, Old Post Road, Kattankudy 01' },
      { adm: 'SCH-2021-013', name: 'Mohamed Sajid Hafeel', call: 'Sajid', dob: '2009-01-16', gender: 'Male', gName: 'Hafeel Mohamed', gRel: 'Father', phone: '0770001093', addr: 'No. 51, Sea View Road, Kattankudy 05' },
      { adm: 'SCH-2021-014', name: 'Mohamed Bilal Yoonus', call: 'Bilal', dob: '2009-04-28', gender: 'Male', gName: 'Yoonus Moulavi', gRel: 'Father', phone: '0770001094', addr: 'No. 14, Beach Side, Kattankudy 02' },
      { adm: 'SCH-2021-015', name: 'Mohamed Azim Nafeez', call: 'Azim', dob: '2009-07-31', gender: 'Male', gName: 'Nafeez Marikkar', gRel: 'Father', phone: '0770001095', addr: 'No. 90, Central Avenue, Kattankudy 06' }
    ];

    const createdGrade11AIds: number[] = [];
    grade11AStudents.forEach((s, idx) => {
      studentInsert.run(s.adm, s.name, s.call, s.dob, s.gender, s.addr, s.gName, s.gRel, s.phone, `${s.call.toLowerCase()}@demo.kcc.sch.lk`, s.phone);
      const st = db.prepare("SELECT id FROM students WHERE admission_no = ?").get(s.adm) as { id: number };
      createdGrade11AIds.push(st.id);
      enrollInsert.run(st.id, grade11A.id, currentYear.id, idx + 1);

      [math, sci, eng, tam, comm, his, ict, isl].forEach(sub => {
        sseInsert.run(st.id, sub.id, grade11A.id, currentYear.id, 'core_compulsory', adminUser.id);
      });
    });

    seedClassRoster(grade11B, 11, 'KCC-2021', 16, 12, juniorPool2, [math, sci, eng, tam, comm, his, ict, isl]);

    // C. Grade 12-Science (12 students - G.C.E. A/L Physical Science Stream) — BASELINE FIXTURE FOR REGRESSION TESTS
    // SCH-2020-001 (Irfan) preserved; all profiles are male.
    const grade12SciStudents = [
      { adm: 'SCH-2020-001', name: 'Mohamed Irfan Shakaf', call: 'Irfan', dob: '2007-03-08', gender: 'Male', gName: 'Shakaf Mohamed', gRel: 'Father', phone: '0770001151', addr: 'No. 25, Main Road, New Kattankudy 02' },
      { adm: 'SCH-2020-002', name: 'Mohamed Rifas Hadjiar', call: 'Rifas', dob: '2007-05-19', gender: 'Male', gName: 'Hadjiar Lebbe', gRel: 'Father', phone: '0770001152', addr: 'No. 42, Beach View, New Kattankudy 06' },
      { adm: 'SCH-2020-003', name: 'Mohamed Hamdan Naheem', call: 'Hamdan', dob: '2007-01-14', gender: 'Male', gName: 'Naheem Kariapper', gRel: 'Father', phone: '0770001153', addr: 'No. 18, Central Street, Kattankudy 03' },
      { adm: 'SCH-2020-004', name: 'Abdul Basheer Ahmed', call: 'Basheer', dob: '2007-07-26', gender: 'Male', gName: 'Ahmed Sultan', gRel: 'Father', phone: '0770001154', addr: 'No. 60, Hospital Road, Kattankudy 04' },
      { adm: 'SCH-2020-005', name: 'Mohamed Fawwaz Siraj', call: 'Fawwaz', dob: '2007-09-02', gender: 'Male', gName: 'Sirajdeen Moulana', gRel: 'Father', phone: '0770001155', addr: 'No. 33, College Road, Kattankudy 01' },
      { adm: 'SCH-2020-006', name: 'Mohamed Niyas Bawa', call: 'Niyas', dob: '2007-11-17', gender: 'Male', gName: 'Bawa Marikkar', gRel: 'Father', phone: '0770001156', addr: 'No. 07, Market Road, Kattankudy 02' },
      { adm: 'SCH-2020-007', name: 'Mohamed Luqman Thowfeek', call: 'Luqman', dob: '2007-04-12', gender: 'Male', gName: 'Thowfeek Bawa', gRel: 'Father', phone: '0770001157', addr: 'No. 84, Sea Beach Lane, Kattankudy 05' },
      { adm: 'SCH-2020-008', name: 'Abdul Aslam Lebbe', call: 'Aslam', dob: '2007-08-29', gender: 'Male', gName: 'Lebbe Aliyar', gRel: 'Father', phone: '0770001158', addr: 'No. 51, Circular Road, Kattankudy 06' },
      { adm: 'SCH-2020-009', name: 'Mohamed Danial Haris', call: 'Danial', dob: '2007-02-23', gender: 'Male', gName: 'Haris Mohamed', gRel: 'Father', phone: '0770001159', addr: 'No. 14, Old Post Road, Batticaloa' },
      { adm: 'SCH-2020-010', name: 'Mohamed Kaleelur Rahman', call: 'Kaleel', dob: '2007-06-05', gender: 'Male', gName: 'Rahman Marikkar', gRel: 'Father', phone: '0770001160', addr: 'No. 79, Mosque Avenue, Kattankudy 03' },
      { adm: 'SCH-2020-011', name: 'Mohamed Saajid Waseem', call: 'Saajid', dob: '2007-10-18', gender: 'Male', gName: 'Waseem Marikkar', gRel: 'Father', phone: '0770001161', addr: 'No. 36, Grand Lane, Kattankudy 01' },
      { adm: 'SCH-2020-012', name: 'Mohamed Faizal Cassim', call: 'Faizal', dob: '2007-12-07', gender: 'Male', gName: 'Cassim Hajiar', gRel: 'Father', phone: '0770001162', addr: 'No. 21, New Beach Road, Kattankudy 06' }
    ];

    const createdGrade12SciIds: number[] = [];
    grade12SciStudents.forEach((s, idx) => {
      studentInsert.run(s.adm, s.name, s.call, s.dob, s.gender, s.addr, s.gName, s.gRel, s.phone, `${s.call.toLowerCase()}@demo.kcc.sch.lk`, s.phone);
      const st = db.prepare("SELECT id FROM students WHERE admission_no = ?").get(s.adm) as { id: number };
      createdGrade12SciIds.push(st.id);
      enrollInsert.run(st.id, grade12Sci.id, currentYear.id, idx + 1);

      [phy, chem, cmath, eng, ict].forEach(sub => {
        sseInsert.run(st.id, sub.id, grade12Sci.id, currentYear.id, 'al_stream_main', adminUser.id);
      });
    });

    // Seed Collegiate Commerce & Arts: Grade 12-Commerce, 12-Arts, 13-Science, 13-Commerce, 13-Arts
    seedClassRoster(grade12Com, 12, 'KCC-2020', 13, 10, juniorPool1, [acc, bs, econ, eng, ict]);
    seedClassRoster(grade12Art, 12, 'KCC-2020', 23, 10, juniorPool2, [tam, his, eng, ict, art]);
    seedClassRoster(grade13Sci, 13, 'KCC-2019', 1, 10, juniorPool1, [phy, chem, cmath, eng, ict]);
    seedClassRoster(grade13Com, 13, 'KCC-2019', 11, 10, juniorPool2, [acc, bs, econ, eng, ict]);
    seedClassRoster(grade13Art, 13, 'KCC-2019', 21, 10, juniorPool1, [tam, his, eng, ict, art]);

    const totalStudentsCount = (db.prepare('SELECT COUNT(*) as cnt FROM students').get() as { cnt: number }).cnt;

    // 10. Attendance Sessions & Records across Multiple Grades and Dates
    const sessionInsert = db.prepare(`
      INSERT INTO attendance_sessions (uuid, class_id, date, academic_year_id, taken_by_user_id, status, notes)
      VALUES (?, ?, ?, ?, ?, 'submitted', ?)
    `);

    const recordInsert = db.prepare(`
      INSERT INTO attendance_records (session_id, student_id, status, remarks)
      VALUES (?, ?, ?, ?)
    `);

    const recentDates = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];

    // Grade 8-A attendance (Preserve baseline)
    recentDates.forEach((dt, dayIdx) => {
      const uuid = `session-8a-${dt}`;
      sessionInsert.run(uuid, grade8A.id, dt, currentYear.id, teacherNimali.id, `Daily register for Grade 8-A`);
      const sess = db.prepare("SELECT id FROM attendance_sessions WHERE uuid = ?").get(uuid) as { id: number };

      createdGrade8AIds.forEach((studentId, sIdx) => {
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

    // Grade 6-A attendance
    recentDates.forEach((dt, dayIdx) => {
      const uuid = `session-6a-${dt}`;
      sessionInsert.run(uuid, grade6A.id, dt, currentYear.id, teacherFathima.id, `Daily register for Grade 6-A`);
      const sess = db.prepare("SELECT id FROM attendance_sessions WHERE uuid = ?").get(uuid) as { id: number };

      createdGrade6AIds.forEach((studentId, sIdx) => {
        let status = 'present';
        let remarks = '';
        if ((sIdx + dayIdx) % 14 === 0) {
          status = 'absent';
          remarks = 'Family function';
        } else if ((sIdx + dayIdx) % 12 === 0) {
          status = 'late';
          remarks = 'Rain delay';
        }
        recordInsert.run(sess.id, studentId, status, remarks);
      });
    });

    // Grade 11-A attendance
    recentDates.forEach((dt, dayIdx) => {
      const uuid = `session-11a-${dt}`;
      sessionInsert.run(uuid, grade11A.id, dt, currentYear.id, teacherMansoor.id, `Daily register for Grade 11-A`);
      const sess = db.prepare("SELECT id FROM attendance_sessions WHERE uuid = ?").get(uuid) as { id: number };

      createdGrade11AIds.forEach((studentId, sIdx) => {
        let status = 'present';
        let remarks = '';
        if ((sIdx + dayIdx) % 16 === 0) {
          status = 'absent';
          remarks = 'Medical appointment';
        } else if ((sIdx + dayIdx) % 13 === 0) {
          status = 'late';
          remarks = 'Traffic congestion';
        }
        recordInsert.run(sess.id, studentId, status, remarks);
      });
    });

    // Grade 12-Science attendance
    recentDates.forEach((dt, dayIdx) => {
      const uuid = `session-12sci-${dt}`;
      sessionInsert.run(uuid, grade12Sci.id, dt, currentYear.id, teacherKamal.id, `Daily register for Grade 12-Science`);
      const sess = db.prepare("SELECT id FROM attendance_sessions WHERE uuid = ?").get(uuid) as { id: number };

      createdGrade12SciIds.forEach((studentId, sIdx) => {
        let status = 'present';
        let remarks = '';
        if ((sIdx + dayIdx) % 15 === 0) {
          status = 'absent';
          remarks = 'Flu';
        }
        recordInsert.run(sess.id, studentId, status, remarks);
      });
    });

    // 11. Assessment Policy Profiles (Junior, O/L, A/L - Canonical Synthetic Fixtures)
    const policyInsert = db.prepare(`
      INSERT INTO assessment_policy_profiles (
        academic_year_id, grade_band, policy_code, title,
        grading_scale_json, absence_rules_json, ranking_rules_json,
        correction_window_days, is_approved_by_school, approved_by_user_id, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 30, ?, ?, ?)
    `);

    const standardGradingScale: GradingScaleItem[] = [
      { grade: 'A', minPercentage: 75.0, label: 'Distinction' },
      { grade: 'B', minPercentage: 65.0, label: 'Very Good Pass' },
      { grade: 'C', minPercentage: 50.0, label: 'Credit Pass' },
      { grade: 'S', minPercentage: 35.0, label: 'Ordinary Pass' },
      { grade: 'F', minPercentage: 0.0, label: 'Fail' }
    ];

    const standardAbsenceRules: AbsenceRules = {
      absentHandling: 'zero',
      medicalHandling: 'exclude',
      exemptHandling: 'exclude'
    };

    const standardRankingRules: RankingRules = {
      rankingMethod: 'competition',
      tieHandling: 'equal_rank_skip_next',
      minimumSubjectsRequired: 3
    };

    const standardGradingJson = JSON.stringify(standardGradingScale);
    const standardAbsenceJson = JSON.stringify(standardAbsenceRules);
    const standardRankingJson = JSON.stringify(standardRankingRules);

    policyInsert.run(
      currentYear.id, 'junior_6_9', 'KCC-SEC-STD-2026-V1',
      'Demo Junior Secondary Standard Policy (Synthetic Fixture Only)',
      standardGradingJson, standardAbsenceJson, standardRankingJson,
      1, adminUser.id, '2026-01-10 09:00:00'
    );

    policyInsert.run(
      currentYear.id, 'ol_10_11', 'KCC-OL-STD-2026-V1',
      'Demo G.C.E. O/L Secondary Standard Policy (Synthetic Fixture Only)',
      standardGradingJson, standardAbsenceJson, standardRankingJson,
      1, adminUser.id, '2026-01-10 09:00:00'
    );

    policyInsert.run(
      currentYear.id, 'al_12_13', 'KCC-AL-STD-2026-V1',
      'Demo G.C.E. A/L Collegiate Standard Policy (Synthetic Fixture Only)',
      standardGradingJson, standardAbsenceJson, standardRankingJson,
      1, adminUser.id, '2026-01-10 09:00:00'
    );

    policyInsert.run(
      currentYear.id, 'junior_6_9', 'KCC-PILOT-2026-V2',
      'Demo Pilot Weighted Assessment Policy (Synthetic Fixture Only)',
      standardGradingJson, standardAbsenceJson, standardRankingJson,
      0, null, null
    );

    const approvedJuniorPolicy = db.prepare("SELECT id FROM assessment_policy_profiles WHERE policy_code = 'KCC-SEC-STD-2026-V1'").get() as { id: number };

    // 12. Examinations (Demo Lifecycle States)
    const examStmt = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, grade_band, start_date, end_date, is_published, status, assessment_policy_id, publication_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    examStmt.run('Term 1 Assessment 2026 (Demo / Synthetic)', 1, currentYear.id, 'all', '2026-03-20', '2026-03-31', 0, 'scheduled', approvedJuniorPolicy.id, 0);
    examStmt.run('Mid-Year Examination 2026 (Demo / Synthetic)', 2, currentYear.id, 'all', '2026-07-15', '2026-07-28', 0, 'scheduled', null, 0);
    examStmt.run('Year-End Final Examination 2026 (Demo / Synthetic)', 3, currentYear.id, 'all', '2026-11-20', '2026-12-05', 0, 'draft', null, 0);

    const term1Exam = db.prepare("SELECT id FROM examinations WHERE name LIKE 'Term 1 Assessment 2026%'").get() as { id: number };
    const midYearExam = db.prepare("SELECT id FROM examinations WHERE name LIKE 'Mid-Year Examination 2026%'").get() as { id: number };

    // 13. Examination Schedules (PR-005 Schedules Workflow)
    const scheduleInsert = db.prepare(`
      INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Term 1: Grade 8-A Approved Schedules (Scheduled subjects have full approved sheets and complete marks)
    [math, sci, eng].forEach((sub) => {
      scheduleInsert.run(term1Exam.id, grade8A.id, sub.id, 1, 'approved', adminUser.id, '2026-03-10 10:00:00');
    });

    // Term 1: Grade 11-A Approved Schedules (O/L Demo)
    [math, sci, eng, comm].forEach((sub) => {
      scheduleInsert.run(term1Exam.id, grade11A.id, sub.id, 1, 'approved', adminUser.id, '2026-03-10 10:00:00');
    });

    // Term 1: Grade 12-Science Approved Schedules (A/L Demo)
    [phy, chem, cmath].forEach((sub) => {
      scheduleInsert.run(term1Exam.id, grade12Sci.id, sub.id, 1, 'approved', adminUser.id, '2026-03-10 10:00:00');
    });

    // Mid-Year: Draft Schedules (Preserve baseline for E2E tests and moderation demos)
    [math, his, eng, sci, hpe].forEach((sub) => {
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

    // Term 1 - Grade 8-A Sheets (All complete, distinct approver, and approved prior to publication)
    sheetInsert.run(
      term1Exam.id, grade8A.id, math.id, currentYear.id, teacherSamantha.id,
      2, 'approved', 'Marks submitted after full internal checking', '2026-03-28 12:00:00',
      sectionHeadUser.id, '2026-03-29 10:00:00', 'Endorsed for final sign-off',
      adminUser.id, '2026-03-29 15:00:00', 'Approved by Principal'
    );
    const math8ASheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade8A.id, math.id) as { id: number };

    sheetInsert.run(
      term1Exam.id, grade8A.id, sci.id, currentYear.id, teacherPriya.id,
      1, 'approved', 'Science lab and theory marks compiled', '2026-03-28 14:00:00',
      sectionHeadUser.id, '2026-03-29 11:30:00', 'Endorsed by Section Head',
      adminUser.id, '2026-03-29 15:15:00', 'Approved by Principal'
    );
    const sci8ASheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade8A.id, sci.id) as { id: number };

    sheetInsert.run(
      term1Exam.id, grade8A.id, eng.id, currentYear.id, teacherNimali.id,
      1, 'approved', 'All grammar and essay marks compiled', '2026-03-28 16:00:00',
      sectionHeadUser.id, '2026-03-29 12:00:00', 'Endorsed by Section Head',
      adminUser.id, '2026-03-29 15:30:00', 'Approved by Principal'
    );
    const eng8ASheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade8A.id, eng.id) as { id: number };

    // Mid-Year - Separate Unpublished Moderation Demonstrations (Draft, Submitted, Reviewed, Approved)
    // History: DRAFT state (assigned to teacherSamantha)
    sheetInsert.run(
      midYearExam.id, grade8A.id, his.id, currentYear.id, teacherSamantha.id,
      1, 'draft', null, null,
      null, null, null,
      null, null, null
    );

    // English: SUBMITTED state (assigned to teacherNimali)
    sheetInsert.run(
      midYearExam.id, grade8A.id, eng.id, currentYear.id, teacherNimali.id,
      1, 'submitted', 'Draft marks compiled for mid-year moderation', '2026-07-20 14:00:00',
      null, null, null,
      null, null, null
    );

    // Science: REVIEWED state (assigned to teacherPriya, endorsed by sectionHeadUser)
    sheetInsert.run(
      midYearExam.id, grade8A.id, sci.id, currentYear.id, teacherPriya.id,
      1, 'reviewed', 'Mid-year practical marks submitted', '2026-07-20 15:00:00',
      sectionHeadUser.id, '2026-07-21 10:00:00', 'Endorsed by Junior Section Head',
      null, null, null
    );

    // HPE: APPROVED state (assigned to teacherSamantha, approved by adminUser)
    sheetInsert.run(
      midYearExam.id, grade8A.id, hpe.id, currentYear.id, teacherSamantha.id,
      1, 'approved', 'Physical education assessment verified', '2026-07-20 16:00:00',
      sectionHeadUser.id, '2026-07-21 11:00:00', 'Endorsed by Junior Section Head',
      adminUser.id, '2026-07-22 14:00:00', 'Approved by Principal'
    );

    // Note: Mathematics in Mid-Year is intentionally unseeded so interactive entry, draft save, and submit can be demonstrated live.

    // Grade 11-A Sheets (O/L Demo: Approved -> will be Published)
    sheetInsert.run(
      term1Exam.id, grade11A.id, math.id, currentYear.id, teacherSamantha.id,
      1, 'approved', 'Grade 11 Mathematics marks verified', '2026-03-28 11:00:00',
      sectionHeadSeniorUser.id, '2026-03-29 09:30:00', 'Endorsed by Senior Section Head',
      adminUser.id, '2026-03-29 14:00:00', 'Approved by Principal'
    );
    const math11ASheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade11A.id, math.id) as { id: number };

    sheetInsert.run(
      term1Exam.id, grade11A.id, sci.id, currentYear.id, teacherPriya.id,
      1, 'approved', 'Grade 11 Science marks verified', '2026-03-28 11:30:00',
      sectionHeadSeniorUser.id, '2026-03-29 10:00:00', 'Endorsed by Senior Section Head',
      adminUser.id, '2026-03-29 14:15:00', 'Approved by Principal'
    );
    const sci11ASheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade11A.id, sci.id) as { id: number };

    sheetInsert.run(
      term1Exam.id, grade11A.id, eng.id, currentYear.id, teacherNimali.id,
      1, 'approved', 'Grade 11 English marks verified', '2026-03-28 12:00:00',
      sectionHeadSeniorUser.id, '2026-03-29 10:30:00', 'Endorsed by Senior Section Head',
      adminUser.id, '2026-03-29 14:30:00', 'Approved by Principal'
    );
    const eng11ASheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade11A.id, eng.id) as { id: number };

    sheetInsert.run(
      term1Exam.id, grade11A.id, comm.id, currentYear.id, teacherMansoor.id,
      1, 'approved', 'Grade 11 Commerce marks verified', '2026-03-28 12:30:00',
      sectionHeadSeniorUser.id, '2026-03-29 11:00:00', 'Endorsed by Senior Section Head',
      adminUser.id, '2026-03-29 14:45:00', 'Approved by Principal'
    );
    const comm11ASheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade11A.id, comm.id) as { id: number };

    // Grade 12-Science Sheets (A/L Demo: Approved -> will be Published)
    sheetInsert.run(
      term1Exam.id, grade12Sci.id, phy.id, currentYear.id, teacherKamal.id,
      1, 'approved', 'Grade 12 Physics theory and practical marks', '2026-03-28 13:00:00',
      sectionHeadSeniorUser.id, '2026-03-29 11:30:00', 'Endorsed by Senior Section Head',
      adminUser.id, '2026-03-29 15:15:00', 'Approved by Principal'
    );
    const phy12Sheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade12Sci.id, phy.id) as { id: number };

    sheetInsert.run(
      term1Exam.id, grade12Sci.id, chem.id, currentYear.id, teacherKamal.id,
      1, 'approved', 'Grade 12 Chemistry marks', '2026-03-28 13:30:00',
      sectionHeadSeniorUser.id, '2026-03-29 11:45:00', 'Endorsed by Senior Section Head',
      adminUser.id, '2026-03-29 15:30:00', 'Approved by Principal'
    );
    const chem12Sheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade12Sci.id, chem.id) as { id: number };

    sheetInsert.run(
      term1Exam.id, grade12Sci.id, cmath.id, currentYear.id, teacherSamantha.id,
      1, 'approved', 'Grade 12 Combined Mathematics marks', '2026-03-28 14:00:00',
      sectionHeadSeniorUser.id, '2026-03-29 12:00:00', 'Endorsed by Senior Section Head',
      adminUser.id, '2026-03-29 15:45:00', 'Approved by Principal'
    );
    const cmath12Sheet = db.prepare("SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?").get(term1Exam.id, grade12Sci.id, cmath.id) as { id: number };

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

    // Grade 8-A Marks (Baseline preserved: Math, Sci, Eng)
    const grade8ASubjectsToScore = [
      { sub: math, sheetId: math8ASheet.id, user: teacherSamantha.id, base: 78 },
      { sub: sci, sheetId: sci8ASheet.id, user: teacherPriya.id, base: 72 },
      { sub: eng, sheetId: eng8ASheet.id, user: teacherNimali.id, base: 82 }
    ];

    grade8ASubjectsToScore.forEach(({ sub, sheetId, user, base }) => {
      createdGrade8AIds.forEach((studentId, idx) => {
        const variance = ((idx * 7) % 35) - 15;
        let score = Math.min(98, Math.max(30, base + variance));
        const grade = calcGrade(score);
        marksInsert.run(sheetId, term1Exam.id, grade8A.id, sub.id, studentId, score, grade, user);
      });
    });

    // Grade 11-A Marks (Complete O/L Demo Roster)
    const grade11ASubjectsToScore = [
      { sub: math, sheetId: math11ASheet.id, user: teacherSamantha.id, base: 75 },
      { sub: sci, sheetId: sci11ASheet.id, user: teacherPriya.id, base: 70 },
      { sub: eng, sheetId: eng11ASheet.id, user: teacherNimali.id, base: 80 },
      { sub: comm, sheetId: comm11ASheet.id, user: teacherMansoor.id, base: 77 }
    ];

    grade11ASubjectsToScore.forEach(({ sub, sheetId, user, base }) => {
      createdGrade11AIds.forEach((studentId, idx) => {
        const variance = ((idx * 8) % 36) - 14;
        let score = Math.min(96, Math.max(35, base + variance));
        const grade = calcGrade(score);
        marksInsert.run(sheetId, term1Exam.id, grade11A.id, sub.id, studentId, score, grade, user);
      });
    });

    // Grade 12-Science Marks (Complete A/L Science Demo Roster)
    const grade12SciSubjectsToScore = [
      { sub: phy, sheetId: phy12Sheet.id, user: teacherKamal.id, base: 68 },
      { sub: chem, sheetId: chem12Sheet.id, user: teacherKamal.id, base: 71 },
      { sub: cmath, sheetId: cmath12Sheet.id, user: teacherSamantha.id, base: 66 }
    ];

    grade12SciSubjectsToScore.forEach(({ sub, sheetId, user, base }) => {
      createdGrade12SciIds.forEach((studentId, idx) => {
        const variance = ((idx * 9) % 38) - 16;
        let score = Math.min(94, Math.max(32, base + variance));
        const grade = calcGrade(score);
        marksInsert.run(sheetId, term1Exam.id, grade12Sci.id, sub.id, studentId, score, grade, user);
      });
    });

    // Commit initial setup transaction before publication (publishExamination manages its own atomic transaction)
    db.exec('COMMIT;');

    // 16. Execute Canonical Examination Publication (PR-005 Examination Publication Service)
    const publisherUser: AuthUser = {
      id: adminUser.id,
      username: 'admin',
      email: 'admin@skoolsys.edu',
      full_name: 'DEMO ONLY: Principal — Demo Account (Synthetic Admin)',
      role: 'admin'
    };
    publishExamination({
      examinationId: term1Exam.id,
      policyProfileId: approvedJuniorPolicy.id,
      user: publisherUser,
      ipAddress: '127.0.0.1'
    });

    // 17. Post-Publication Corrections (Demonstrating Reissued report cards & negative states)
    const firstStudentId = createdGrade8AIds[0];
    const secondStudentId = createdGrade8AIds[1];
    const thirdStudentId = createdGrade8AIds[2];

    const teacherSamanthaUser: AuthUser = {
      id: teacherSamantha.id,
      username: 'teacher_samantha',
      email: 'samantha.silva@skoolsys.edu',
      full_name: 'DEMO ONLY: Mr. Samantha Silva (Synthetic Teacher)',
      role: 'subject_teacher'
    };

    const vpNawasUser: AuthUser = {
      id: vpUser.id,
      username: 'vp_academic',
      email: 'vp.academic@skoolsys.edu',
      full_name: 'DEMO ONLY: Mr. M.I.M. Nawas (Synthetic VP Academic)',
      role: 'class_teacher'
    };

    const teacherPriyaUser: AuthUser = {
      id: teacherPriya.id,
      username: 'teacher_priya',
      email: 'priya.wickrama@skoolsys.edu',
      full_name: 'DEMO ONLY: Ms. Priyanthi Wickramasinghe (Synthetic Teacher)',
      role: 'subject_teacher'
    };

    const teacherNimaliUser: AuthUser = {
      id: teacherNimali.id,
      username: 'teacher_nimali',
      email: 'nimali.perera@skoolsys.edu',
      full_name: 'DEMO ONLY: Mrs. Nimali Perera (Synthetic Teacher)',
      role: 'class_teacher'
    };

    // Case 1: Approved Correction (Triggers Reissued Report Card on Student 1)
    const st1Mark = db.prepare("SELECT id, score, assessment_status FROM marks WHERE student_id = ? AND subject_id = ? AND examination_id = ?").get(firstStudentId, math.id, term1Exam.id) as any;
    const req1 = requestMarkCorrection({
      markId: st1Mark.id,
      expectedPreviousScore: Number(st1Mark.score),
      expectedPreviousStatus: st1Mark.assessment_status,
      requestedScore: 85,
      requestedStatus: 'PRESENT',
      correctionCategory: 'clerical_addition',
      detailedJustification: 'Recalculation of Section B marks upon formal re-examination appeal (Demo Case)',
      user: teacherSamanthaUser,
      ipAddress: '127.0.0.1'
    });

    reviewMarkCorrection({
      correctionId: req1.correctionId,
      decision: 'approve',
      reviewComments: 'Approved following script inspection (Demo Approval)',
      user: vpNawasUser,
      ipAddress: '127.0.0.1'
    });

    // Case 2: Pending Correction on Science sheet (Student 2)
    const st2Mark = db.prepare("SELECT id, score, assessment_status FROM marks WHERE student_id = ? AND subject_id = ? AND examination_id = ?").get(secondStudentId, sci.id, term1Exam.id) as any;
    requestMarkCorrection({
      markId: st2Mark.id,
      expectedPreviousScore: Number(st2Mark.score),
      expectedPreviousStatus: st2Mark.assessment_status,
      requestedScore: 79,
      requestedStatus: 'PRESENT',
      correctionCategory: 're_scrutiny',
      detailedJustification: 'Formal appeal registered by parent regarding paper 2 question 4 (Demo Case)',
      user: teacherPriyaUser,
      ipAddress: '127.0.0.1'
    });

    // Case 3: Rejected Correction on English sheet (Student 3)
    const st3Mark = db.prepare("SELECT id, score, assessment_status FROM marks WHERE student_id = ? AND subject_id = ? AND examination_id = ?").get(thirdStudentId, eng.id, term1Exam.id) as any;
    const req3 = requestMarkCorrection({
      markId: st3Mark.id,
      expectedPreviousScore: Number(st3Mark.score),
      expectedPreviousStatus: st3Mark.assessment_status,
      requestedScore: 95,
      requestedStatus: 'PRESENT',
      correctionCategory: 'other',
      detailedJustification: 'Requested additional discretionary marks (Demo Case)',
      user: teacherNimaliUser,
      ipAddress: '127.0.0.1'
    });

    reviewMarkCorrection({
      correctionId: req3.correctionId,
      decision: 'reject',
      reviewComments: 'Rejected: No arithmetic error found on original script (Demo Rejection)',
      user: publisherUser,
      ipAddress: '127.0.0.1'
    });

    // Begin transaction for audit entries and disposable marker
    db.exec('BEGIN IMMEDIATE;');

    // 18. Audit log entries
    const auditInsert = db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    auditInsert.run(adminUser.id, 'admin', 'SYSTEM_INIT', 'System', '0', JSON.stringify({ message: 'Kattankudy Central College SkoolSys 2.0 MVP database seed completed (Synthetic Data).' }));
    auditInsert.run(teacherNimali.id, 'teacher_nimali', 'ATTENDANCE_SUBMIT', 'attendance_sessions', recentDates[4], JSON.stringify({ class: 'Grade 8-A', recordsCount: createdGrade8AIds.length }));
    auditInsert.run(teacherFathima.id, 'teacher_fathima', 'ATTENDANCE_SUBMIT', 'attendance_sessions', recentDates[4], JSON.stringify({ class: 'Grade 6-A', recordsCount: createdGrade6AIds.length }));
    auditInsert.run(teacherMansoor.id, 'teacher_mansoor', 'ATTENDANCE_SUBMIT', 'attendance_sessions', recentDates[4], JSON.stringify({ class: 'Grade 11-A', recordsCount: createdGrade11AIds.length }));

    // Stamp verified disposable fixture marker
    stampDisposableMarker(db, options?.fixtureToken || 'DISPOSABLE_DEMO_SEED_2026');

    db.exec('COMMIT;');

    console.log('✅ Kattankudy Central College Database seeded successfully with synthetic demo data:');
    console.log('   - 1 Academic Year (2026) with 3 Terms');
    console.log('   - 12 Synthetic System Users (Principal, VP Academic, Junior & Senior Section Heads, IT Admin, Teachers)');
    console.log('   - 5 Active Leadership Authorizations (Principal, VP, Junior & Senior Section Heads; IT Admin unprivileged)');
    console.log('   - 18 Classes across all Grades 6 to 13 (Junior Secondary, O/L, and Collegiate Science/Commerce/Arts)');
    console.log('   - 19 Subjects (Core, Religion, Aesthetic, Commerce, Science)');
    console.log(`   - ${totalStudentsCount} Synthetic Boy Students across Grades 6 to 13 with Confirmed Enrolments & Unique Admission Nos`);
    console.log('   - 4 Assessment Policy Profiles across Junior, O/L, and A/L grade bands');
    console.log('   - 3 Examinations across lifecycle stages (Published Term 1, Scheduled Mid-Year, Draft Year-End)');
    console.log('   - Approved Schedules for Grade 8-A, 11-A, and 12-Science');
    console.log('   - 11 Marks Sheets across Approved, Published, Reviewed, Submitted, and Draft states');
    console.log('   - Canonical Publication with authentic SHA-256 audit hash over snapshot');
    console.log('   - Published Marks and Official Report Cards ready for Junior, O/L, and A/L students');
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
