import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

export interface TestFixtureData {
  dbPath: string;
  adminUser: { id: number; username: string; password: string };
  classTeacher: { id: number; username: string; password: string; classId: number };
  subjectTeacher: { id: number; username: string; password: string; classId: number; subjectId: number };
  deactivatedUser: { id: number; username: string; password: string };
  testClassA: { id: number; name: string };
  testClassB: { id: number; name: string };
  testSubjectMath: { id: number; code: string; name: string };
  studentA: { id: number; admissionNo: string; name: string; classId: number };
  studentB: { id: number; admissionNo: string; name: string; classId: number };
}

/**
 * Creates an isolated, synthetic SQLite database strictly in a temporary folder.
 * NEVER accesses or modifies any existing production or development database.
 */
export function setupIsolatedTestDb(): TestFixtureData {
  const tempDir = os.tmpdir();
  const dbName = `skoolsys_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`;
  const dbPath = path.join(tempDir, dbName);

  const testDb = new DatabaseSync(dbPath);
  testDb.exec('PRAGMA journal_mode = WAL;');
  testDb.exec('PRAGMA foreign_keys = ON;');

  // Initialize schema
  testDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'class_teacher', 'subject_teacher')),
      is_active INTEGER DEFAULT 1,
      token_version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER DEFAULT 0
    );

    CREATE TABLE classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL CHECK(grade >= 6 AND grade <= 13),
      name TEXT NOT NULL,
      room_number TEXT,
      academic_year_id INTEGER REFERENCES academic_years(id),
      class_teacher_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Core',
      grade_level TEXT NOT NULL
    );

    CREATE TABLE class_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      UNIQUE(class_id, subject_id)
    );

    CREATE TABLE teacher_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
      assignment_type TEXT NOT NULL CHECK(assignment_type IN ('class_teacher', 'subject_teacher')),
      academic_year_id INTEGER REFERENCES academic_years(id)
    );

    CREATE TABLE students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_no TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      calling_name TEXT NOT NULL,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female', 'Other')),
      address TEXT,
      guardian_name TEXT NOT NULL,
      guardian_relation TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      guardian_email TEXT,
      guardian_nic TEXT,
      emergency_contact TEXT,
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Transferred', 'Graduated', 'Suspended')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
      roll_number INTEGER,
      status TEXT DEFAULT 'enrolled' CHECK(status IN ('enrolled', 'transferred', 'promoted')),
      UNIQUE(student_id, academic_year_id)
    );

    CREATE TABLE attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      academic_year_id INTEGER REFERENCES academic_years(id),
      taken_by_user_id INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'submitted' CHECK(status IN ('draft', 'submitted')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(class_id, date)
    );

    CREATE TABLE attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'excused')),
      remarks TEXT,
      synced_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, student_id)
    );

    CREATE TABLE examinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      term INTEGER NOT NULL CHECK(term IN (1, 2, 3)),
      academic_year_id INTEGER REFERENCES academic_years(id),
      start_date TEXT,
      end_date TEXT,
      is_published INTEGER DEFAULT 0
    );

    CREATE TABLE marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      score REAL,
      is_absent INTEGER DEFAULT 0,
      is_exempt INTEGER DEFAULT 0,
      max_score REAL DEFAULT 100,
      grade_letter TEXT,
      status TEXT DEFAULT 'submitted' CHECK(status IN ('draft', 'submitted', 'published')),
      entered_by_user_id INTEGER REFERENCES users(id),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(examination_id, subject_id, student_id)
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      username TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed strictly synthetic test fixtures
  testDb.exec(`
    INSERT INTO academic_years (name, start_date, end_date, is_current)
    VALUES ('2026-TEST', '2026-01-01', '2026-12-31', 1);
  `);
  const yearId = 1;

  const salt = bcrypt.genSaltSync(8); // Fast salt for tests
  const adminPass = 'AdminTest123!';
  const teacherPass = 'TeacherTest123!';
  const deactPass = 'DeactTest123!';

  const insertUser = testDb.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const adminRes = insertUser.run('synth_admin', 'synth_admin@test.local', bcrypt.hashSync(adminPass, salt), 'Synthetic Admin', 'admin', 1);
  const classTeacherRes = insertUser.run('synth_class_teacher', 'synth_ct@test.local', bcrypt.hashSync(teacherPass, salt), 'Synthetic Class Teacher', 'class_teacher', 1);
  const subjectTeacherRes = insertUser.run('synth_subject_teacher', 'synth_st@test.local', bcrypt.hashSync(teacherPass, salt), 'Synthetic Subject Teacher', 'subject_teacher', 1);
  const deactivatedRes = insertUser.run('synth_deactivated', 'synth_deact@test.local', bcrypt.hashSync(deactPass, salt), 'Synthetic Deactivated', 'class_teacher', 0);

  const adminId = Number(adminRes.lastInsertRowid);
  const classTeacherId = Number(classTeacherRes.lastInsertRowid);
  const subjectTeacherId = Number(subjectTeacherRes.lastInsertRowid);
  const deactivatedId = Number(deactivatedRes.lastInsertRowid);

  // Classes
  const insertClass = testDb.prepare(`
    INSERT INTO classes (grade, name, room_number, academic_year_id, class_teacher_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const classARes = insertClass.run(8, 'Grade 8-A Test', 'Room 101', yearId, classTeacherId);
  const classBRes = insertClass.run(8, 'Grade 8-B Test', 'Room 102', yearId, null);
  const classAId = Number(classARes.lastInsertRowid);
  const classBId = Number(classBRes.lastInsertRowid);

  // Subjects
  const insertSubject = testDb.prepare(`
    INSERT INTO subjects (code, name, category, grade_level)
    VALUES (?, ?, ?, ?)
  `);
  const subRes = insertSubject.run('MATH-TEST', 'Mathematics Test', 'Core', '8');
  const subjectId = Number(subRes.lastInsertRowid);

  testDb.prepare(`INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)`).run(classAId, subjectId);
  testDb.prepare(`INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)`).run(classBId, subjectId);

  // Teacher Assignments
  testDb.prepare(`
    INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(classTeacherId, classAId, null, 'class_teacher', yearId);

  testDb.prepare(`
    INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(subjectTeacherId, classAId, subjectId, 'subject_teacher', yearId);

  // Synthetic Students
  const insertStudent = testDb.prepare(`
    INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, status)
    VALUES (?, ?, ?, '2012-01-01', 'Male', '123 Test St', 'Synthetic Guardian', 'Father', '0770000000', 'Active')
  `);
  const stuARes = insertStudent.run('SYNTH-001', 'Synthetic Student Alpha', 'Alpha');
  const stuBRes = insertStudent.run('SYNTH-002', 'Synthetic Student Beta', 'Beta');
  const stuAId = Number(stuARes.lastInsertRowid);
  const stuBId = Number(stuBRes.lastInsertRowid);

  // Enrollments
  testDb.prepare(`
    INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status)
    VALUES (?, ?, ?, ?, 'enrolled')
  `).run(stuAId, classAId, yearId, 1);

  testDb.prepare(`
    INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status)
    VALUES (?, ?, ?, ?, 'enrolled')
  `).run(stuBId, classBId, yearId, 2);

  // Subject Enrollments (PR-005 synthetic test compatibility)
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS student_subject_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      enrollment_status TEXT NOT NULL DEFAULT 'confirmed' CHECK(enrollment_status IN (
        'confirmed',
        'provisional_unverified',
        'dropped',
        'transferred'
      )),
      enrollment_category TEXT NOT NULL DEFAULT 'core_compulsory',
      created_at TEXT DEFAULT (datetime('now')),
      verified_by_user_id INTEGER REFERENCES users(id),
      verified_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, subject_id, academic_year_id)
    );
  `);

  testDb.prepare(`
    INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at)
    VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory', ?, datetime('now'))
  `).run(stuAId, subjectId, classAId, yearId, adminId);

  testDb.prepare(`
    INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, is_published)
    VALUES ('Term 1 Test Exam', 1, ?, '2026-03-01', '2026-03-15', 1)
  `).run(yearId);

  // Stamp verified disposable fixture marker
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS _skoolsys_disposable_marker (
      marker_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      environment TEXT NOT NULL,
      disposable_token TEXT NOT NULL,
      disclaimer TEXT NOT NULL
    );
    INSERT OR REPLACE INTO _skoolsys_disposable_marker (marker_id, created_at, environment, disposable_token, disclaimer)
    VALUES ('primary_marker', datetime('now'), 'test', 'DISPOSABLE_ISOLATED_TEST_FIXTURE', 'AUTHORIZED_DISPOSABLE_DEMO_OR_SYNTHETIC_FIXTURE_ONLY');
  `);

  testDb.close();

  return {
    dbPath,
    adminUser: { id: adminId, username: 'synth_admin', password: adminPass },
    classTeacher: { id: classTeacherId, username: 'synth_class_teacher', password: teacherPass, classId: classAId },
    subjectTeacher: { id: subjectTeacherId, username: 'synth_subject_teacher', password: teacherPass, classId: classAId, subjectId },
    deactivatedUser: { id: deactivatedId, username: 'synth_deactivated', password: deactPass },
    testClassA: { id: classAId, name: 'Grade 8-A Test' },
    testClassB: { id: classBId, name: 'Grade 8-B Test' },
    testSubjectMath: { id: subjectId, code: 'MATH-TEST', name: 'Mathematics Test' },
    studentA: { id: stuAId, admissionNo: 'SYNTH-001', name: 'Synthetic Student Alpha', classId: classAId },
    studentB: { id: stuBId, admissionNo: 'SYNTH-002', name: 'Synthetic Student Beta', classId: classBId }
  };
}

/**
 * Deterministically cleans up an isolated test database and its temporary WAL/SHM artifacts.
 */
export function teardownIsolatedTestDb(dbPath: string): void {
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
    if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
  } catch {
    // Ignore cleanup errors on temp files
  }
}
