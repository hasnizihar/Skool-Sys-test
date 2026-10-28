import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runMigration005, TARGET_SCHEMA_VERSION } from '../src/db/migrations/005_examination_integrity.js';
import { createSafeDatabaseBackup, generateTimestampedBackupPath } from '../src/db/backupUtils.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { setupIsolatedTestDb, teardownIsolatedTestDb } from './helpers/testDb.js';
import { closeDatabase } from '../src/db/database.js';

/**
 * Creates an ephemeral test SQLite database representing the real PR-004 baseline schema.
 */
function createPR004TestDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // Real PR-004 schema definition
  db.exec(`
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
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
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

    CREATE TABLE attendance_sync_receipts (
      client_mutation_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      class_id INTEGER NOT NULL REFERENCES classes(id),
      date TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      resulting_revision INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('applied', 'replayed')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Legacy examinations schema (PR-004)
    CREATE TABLE examinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      term INTEGER NOT NULL CHECK(term IN (1, 2, 3)),
      academic_year_id INTEGER REFERENCES academic_years(id),
      start_date TEXT,
      end_date TEXT,
      is_published INTEGER DEFAULT 0
    );

    -- Legacy marks schema (PR-004: physical is_absent, is_exempt, no remarks column)
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

    PRAGMA user_version = 4;
  `);

  return db;
}

describe('PR-005 Gate 1R: SQLite Migration 005 & Canonical Marks Integrity Tests', () => {
  let tmpDir: string;

  function getTmpDbPath(): string {
    return path.join(tmpDir, `test_mig005_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
  }

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skoolsys_mig005_test_'));
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('EXAM-MIG-01: point-in-time snapshot created before schema alteration; user_version advances to 5', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    // Initial state: version 4
    const vBefore = db.prepare('PRAGMA user_version;').get() as any;
    assert.strictEqual(vBefore.user_version, 4);

    // 1. Create verified pre-migration backup using VACUUM INTO outside the transaction
    const backupPath = generateTimestampedBackupPath(dbPath, path.join(tmpDir, 'backups'));
    const backupResult = createSafeDatabaseBackup(db, backupPath);

    assert.ok(fs.existsSync(backupPath), 'Backup file must exist');
    assert.ok(backupResult.bytes > 0, 'Backup file size must be > 0');
    assert.strictEqual(backupResult.verified, true);

    // Verify backup database is valid SQLite and at version 4
    const backupDb = new DatabaseSync(backupPath);
    const backupVersion = backupDb.prepare('PRAGMA user_version;').get() as any;
    assert.strictEqual(backupVersion.user_version, 4);
    backupDb.close();

    // 2. Run Migration 005
    const result = runMigration005(db);

    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.version, TARGET_SCHEMA_VERSION);

    // Verify user_version advanced to 5
    const vAfter = db.prepare('PRAGMA user_version;').get() as any;
    assert.strictEqual(vAfter.user_version, 5);

    // Verify all target tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const tableNames = new Set(tables.map((t) => t.name));

    assert.ok(tableNames.has('marks_sheets'), 'marks_sheets table must exist');
    assert.ok(tableNames.has('marks'), 'canonical marks table must exist');
    assert.ok(tableNames.has('quarantined_legacy_marks'), 'quarantined_legacy_marks must exist');
    assert.ok(tableNames.has('student_subject_enrollments'), 'student_subject_enrollments must exist');
    assert.ok(tableNames.has('academic_staff_authorizations'), 'academic_staff_authorizations must exist');
    assert.ok(tableNames.has('assessment_policy_profiles'), 'assessment_policy_profiles must exist');
    assert.ok(tableNames.has('academic_terms'), 'academic_terms must exist');
    assert.ok(tableNames.has('marks_corrections'), 'marks_corrections must exist');
    assert.ok(tableNames.has('marks_audit_history'), 'marks_audit_history must exist');

    db.close();
  });

  it('EXAM-MIG-02: valid legacy marks successfully migrated; migrated_count + quarantined_count === original_count', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    // Seed base entities
    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date, is_current) VALUES (1, '2026', '2026-01-01', '2026-12-31', 1);
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 'teacher_math', 'math@test.edu', 'hash', 'Mr. Math', 'subject_teacher');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (2, 'teacher_sci', 'sci@test.edu', 'hash', 'Ms. Science', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO subjects (id, code, name, grade_level) VALUES (2, 'SCI', 'Science', '6-11');
      INSERT INTO class_subjects (class_id, subject_id) VALUES (1, 1), (1, 2);
      INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
        VALUES (1, 1, 1, 'subject_teacher', 1), (2, 1, 2, 'subject_teacher', 1);

      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111'),
               (102, 'S-102', 'Student B', 'B', '2012-01-01', 'Female', 'G', 'M', '0772222222'),
               (103, 'S-103', 'Student C', 'C', '2012-01-01', 'Male', 'G', 'F', '0773333333'),
               (104, 'S-104', 'Student D', 'D', '2012-01-01', 'Female', 'G', 'M', '0774444444');

      INSERT INTO enrollments (student_id, class_id, academic_year_id, status)
        VALUES (101, 1, 1, 'enrolled'), (102, 1, 1, 'enrolled'), (103, 1, 1, 'enrolled'), (104, 1, 1, 'enrolled');

      INSERT INTO examinations (id, name, term, academic_year_id, is_published)
        VALUES (1, 'Term 1 Exam 2026', 1, 1, 1);
    `);

    // Seed 4 valid legacy marks in Math
    db.exec(`
      INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, is_absent, is_exempt, max_score, grade_letter, status, entered_by_user_id)
      VALUES 
        (1, 1, 1, 101, 85.5, 0, 0, 100, 'A', 'published', 1),
        (1, 1, 1, 102, NULL, 1, 0, 100, 'AB', 'published', 1),
        (1, 1, 1, 103, NULL, 0, 1, 100, 'EX', 'published', 1),
        (1, 1, 1, 104, NULL, 0, 0, 100, '-', 'draft', 1);
    `);

    // Seed 2 ambiguous legacy marks in Science
    db.exec(`
      INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, is_absent, is_exempt, max_score, grade_letter, status, entered_by_user_id)
      VALUES 
        (1, 1, 2, 101, 105.0, 0, 0, 100, 'A', 'published', 2),
        (1, 1, 2, 102, 75.0, 1, 0, 100, 'AB', 'published', 2);
    `);

    const totalLegacyMarks = (db.prepare('SELECT COUNT(*) as cnt FROM marks').get() as any).cnt;
    assert.strictEqual(totalLegacyMarks, 6);

    const result = runMigration005(db);

    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.migratedMarks, 4);
    assert.strictEqual(result.quarantinedMarks, 2);

    // Reconciliation Invariant Proof
    assert.strictEqual(result.migratedMarks + result.quarantinedMarks, totalLegacyMarks);

    db.close();
  });

  it('EXAM-MIG-03: zero orphan marks (sheet_id IS NULL === 0) and truthful sheet metadata', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'hash', 'Teacher', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id, is_published) VALUES (1, 'Exam 1', 1, 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111');

      INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, is_absent, is_exempt)
        VALUES (1, 1, 1, 101, 78.0, 0, 0);
    `);

    runMigration005(db);

    // Verify zero orphan marks
    const orphanCount = (db.prepare('SELECT COUNT(*) as cnt FROM marks WHERE sheet_id IS NULL').get() as any).cnt;
    assert.strictEqual(orphanCount, 0, 'Must have zero orphan marks without sheet_id');

    // Verify sheet status is legacy_unmoderated without inventing approval
    const sheet = db.prepare('SELECT * FROM marks_sheets WHERE examination_id = 1 AND class_id = 1 AND subject_id = 1').get() as any;
    assert.ok(sheet, 'Sheet container must exist');
    assert.strictEqual(sheet.status, 'legacy_unmoderated');
    assert.strictEqual(sheet.approved_by_user_id, null, 'Must never invent approval');

    db.close();
  });

  it('EXAM-MIG-04: generated virtual columns is_absent and is_exempt evaluate correctly', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);
    runMigration005(db);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'hash', 'Teacher', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id) VALUES (1, 'Exam 1', 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111'),
               (102, 'S-102', 'Student B', 'B', '2012-01-01', 'Female', 'G', 'M', '0772222222'),
               (103, 'S-103', 'Student C', 'C', '2012-01-01', 'Male', 'G', 'F', '0773333333');

      INSERT INTO marks_sheets (id, examination_id, class_id, subject_id, academic_year_id, teacher_id)
        VALUES (1, 1, 1, 1, 1, 1);

      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status)
        VALUES 
          (1, 1, 1, 1, 101, 100.0, 88.0, 'PRESENT'),
          (1, 1, 1, 1, 102, 100.0, NULL, 'ABSENT'),
          (1, 1, 1, 1, 103, 100.0, NULL, 'EXEMPT');
    `);

    const rowPresent = db.prepare('SELECT is_absent, is_exempt FROM marks WHERE student_id = 101').get() as any;
    assert.strictEqual(rowPresent.is_absent, 0);
    assert.strictEqual(rowPresent.is_exempt, 0);

    const rowAbsent = db.prepare('SELECT is_absent, is_exempt FROM marks WHERE student_id = 102').get() as any;
    assert.strictEqual(rowAbsent.is_absent, 1);
    assert.strictEqual(rowAbsent.is_exempt, 0);

    const rowExempt = db.prepare('SELECT is_absent, is_exempt FROM marks WHERE student_id = 103').get() as any;
    assert.strictEqual(rowExempt.is_absent, 0);
    assert.strictEqual(rowExempt.is_exempt, 1);

    db.close();
  });

  it('EXAM-MIG-05: rejection of score = 105.0 on max_score = 100.0 and negative scores', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);
    runMigration005(db);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'hash', 'Teacher', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id) VALUES (1, 'Exam 1', 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111');

      INSERT INTO marks_sheets (id, examination_id, class_id, subject_id, academic_year_id, teacher_id)
        VALUES (1, 1, 1, 1, 1, 1);
    `);

    // Rejection of score > max_score (105.0 on max 100.0)
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status)
          VALUES (1, 1, 1, 1, 101, 100.0, 105.0, 'PRESENT')
        `).run();
      },
      /CHECK constraint failed/,
      'Must reject score > max_score via genuine SQL CHECK'
    );

    // Rejection of negative score (-5.0)
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status)
          VALUES (1, 1, 1, 1, 101, 100.0, -5.0, 'PRESENT')
        `).run();
      },
      /CHECK constraint failed/,
      'Must reject negative scores via genuine SQL CHECK'
    );

    db.close();
  });

  it('EXAM-MIG-06: rejection of numeric score when assessment_status = MEDICAL or ABSENT', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);
    runMigration005(db);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'hash', 'Teacher', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id) VALUES (1, 'Exam 1', 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111');

      INSERT INTO marks_sheets (id, examination_id, class_id, subject_id, academic_year_id, teacher_id)
        VALUES (1, 1, 1, 1, 1, 1);
    `);

    // Rejects non-null score when status is MEDICAL
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status)
          VALUES (1, 1, 1, 1, 101, 100.0, 75.0, 'MEDICAL')
        `).run();
      },
      /CHECK constraint failed: chk_score_status_integrity/,
      'Must reject numeric score when status is MEDICAL'
    );

    // Rejects non-null score when status is ABSENT
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status)
          VALUES (1, 1, 1, 1, 101, 100.0, 40.0, 'ABSENT')
        `).run();
      },
      /CHECK constraint failed: chk_score_status_integrity/,
      'Must reject numeric score when status is ABSENT'
    );

    db.close();
  });

  it('EXAM-MIG-07: rejection of NULL score when assessment_status = PRESENT', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);
    runMigration005(db);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'hash', 'Teacher', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id) VALUES (1, 'Exam 1', 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111');

      INSERT INTO marks_sheets (id, examination_id, class_id, subject_id, academic_year_id, teacher_id)
        VALUES (1, 1, 1, 1, 1, 1);
    `);

    // Rejects NULL score when status is PRESENT
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status)
          VALUES (1, 1, 1, 1, 101, 100.0, NULL, 'PRESENT')
        `).run();
      },
      /CHECK constraint failed: chk_score_status_integrity/,
      'Must reject NULL score when status is PRESENT'
    );

    db.close();
  });

  it('EXAM-MIG-08: lossless quarantine of contradictory legacy rows and academic year mismatch', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2025', '2025-01-01', '2025-12-31');
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (2, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'hash', 'T', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 2);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id) VALUES (1, 'Exam 2025', 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111');

      -- Mismatched academic year between exam (1) and class (2)
      INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, is_absent, is_exempt, max_score)
        VALUES (1, 1, 1, 101, 75.0, 0, 0, 100);
    `);

    const result = runMigration005(db);

    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.migratedMarks, 0);
    assert.strictEqual(result.quarantinedMarks, 1);

    const q = db.prepare('SELECT * FROM quarantined_legacy_marks').get() as any;
    assert.ok(q.quarantine_reason.includes('ACADEMIC_YEAR_MISMATCH'));
    assert.strictEqual(q.student_id, 101);

    db.close();
  });

  it('EXAM-MIG-09: deliberate failure triggers rollback, restoring original schema and data intact; idempotency confirmed', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'hash', 'T', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id) VALUES (1, 'Exam 2026', 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111');

      INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, is_absent, is_exempt)
        VALUES (1, 1, 1, 101, 82.0, 0, 0);
    `);

    // 1. Force intentional error during rebuild to test rollback
    db.exec('CREATE TABLE marks_new (id INTEGER PRIMARY KEY);');

    assert.throws(
      () => {
        runMigration005(db);
      },
      /marks_new/,
      'Migration must throw on failure'
    );

    // Verify rollback restored user_version to 4
    const vCheck = db.prepare('PRAGMA user_version;').get() as any;
    assert.strictEqual(vCheck.user_version, 4, 'Version must remain 4 after rollback');

    // Original marks table still intact
    const originalMarks = db.prepare('SELECT * FROM marks').all();
    assert.strictEqual(originalMarks.length, 1);

    // Clean up collision table
    db.exec('DROP TABLE marks_new;');

    // 2. Successful run
    const firstRun = runMigration005(db);
    assert.strictEqual(firstRun.applied, true);
    assert.strictEqual(firstRun.version, 5);

    // 3. Idempotency: second run is clean no-op
    const secondRun = runMigration005(db);
    assert.strictEqual(secondRun.applied, false, 'Second run must not apply again');
    assert.strictEqual(secondRun.version, 5);

    db.close();
  });

  it('EXAM-MIG-10: truthful academic terms — terms 1, 2, and 3 are created with provisional is_verified = 0 and NULL boundaries without fabricating dates', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
    `);

    runMigration005(db);

    const terms = db.prepare('SELECT * FROM academic_terms WHERE academic_year_id = 1 ORDER BY term_number').all() as any[];
    assert.strictEqual(terms.length, 3, 'Must create terms 1, 2, 3');

    for (let i = 0; i < 3; i++) {
      const t = terms[i];
      assert.strictEqual(t.term_number, i + 1);
      assert.strictEqual(t.start_date, null, `Term ${i + 1} start_date must be NULL (never fabricated)`);
      assert.strictEqual(t.end_date, null, `Term ${i + 1} end_date must be NULL (never fabricated)`);
      assert.strictEqual(t.is_verified, 0, `Term ${i + 1} is_verified must be 0 pending school ratification`);
    }

    db.close();
  });

  it('EXAM-MIG-11: unverified teacher attribution — marks_sheets.teacher_id remains NULL when no appointment exists, despite known entered_by_user_id', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 'entrant', 'e@test.edu', 'h', 'Entrant User', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id, is_published) VALUES (1, 'Exam 1', 1, 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111');

      -- NO teacher_assignments row seeded for this class and subject!
      -- But entered_by_user_id is 1
      INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, is_absent, is_exempt, max_score, entered_by_user_id)
        VALUES (1, 1, 1, 101, 75.0, 0, 0, 100, 1);
    `);

    const result = runMigration005(db);
    assert.strictEqual(result.applied, true);

    const sheet = db.prepare('SELECT * FROM marks_sheets WHERE examination_id = 1 AND class_id = 1 AND subject_id = 1').get() as any;
    assert.ok(sheet);
    assert.strictEqual(sheet.teacher_id, null, 'Must never substitute entrant for appointed teacher ownership');
    assert.strictEqual(sheet.status, 'legacy_unmoderated');

    const mark = db.prepare('SELECT * FROM marks WHERE student_id = 101').get() as any;
    assert.strictEqual(mark.entered_by_user_id, 1, 'Mark row must preserve original entrant provenance');

    db.close();
  });

  it('EXAM-MIG-12: exact score precision preservation — score 81.25 is losslessly quarantined, never silently rounded to 81.3', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'h', 'T', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id, is_published) VALUES (1, 'Exam 1', 1, 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111');

      -- Raw score has 2 decimal places (81.25)
      INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, is_absent, is_exempt, max_score)
        VALUES (1, 1, 1, 101, 81.25, 0, 0, 100);
    `);

    const result = runMigration005(db);
    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.migratedMarks, 0, 'Must not migrate unrounded 81.25 into active marks table');
    assert.strictEqual(result.quarantinedMarks, 1, 'Must losslessly quarantine 81.25');

    const q = db.prepare('SELECT * FROM quarantined_legacy_marks WHERE student_id = 101').get() as any;
    assert.ok(q.quarantine_reason.includes('NON_CANONICAL_PRECISION'));
    assert.strictEqual(q.raw_score, 81.25, 'Quarantine must preserve exact original raw score');

    db.close();
  });

  it('EXAM-MIG-13: comprehensive invalid max_score quarantine — 0, negative, and 1200 max scores are losslessly quarantined without aborting migration', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'h', 'T', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id, is_published) VALUES (1, 'Exam 1', 1, 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111'),
               (102, 'S-102', 'Student B', 'B', '2012-01-01', 'Female', 'G', 'M', '0772222222'),
               (103, 'S-103', 'Student C', 'C', '2012-01-01', 'Male', 'G', 'F', '0773333333'),
               (104, 'S-104', 'Student D', 'D', '2012-01-01', 'Female', 'G', 'M', '0774444444');

      -- Student 101: max_score = 0
      -- Student 102: max_score = -10
      -- Student 103: max_score = 1200 (exceeds DB limit of 1000)
      -- Student 104: max_score = 100 (valid)
      INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, is_absent, is_exempt, max_score)
        VALUES 
          (1, 1, 1, 101, 0, 0, 0, 0),
          (1, 1, 1, 102, 10, 0, 0, -10),
          (1, 1, 1, 103, 500, 0, 0, 1200),
          (1, 1, 1, 104, 75.0, 0, 0, 100);
    `);

    const result = runMigration005(db);
    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.migratedMarks, 1, 'Only valid max_score=100 row should migrate');
    assert.strictEqual(result.quarantinedMarks, 3, 'All 3 invalid max_score rows must be quarantined');

    const quarantined = db.prepare('SELECT student_id, quarantine_reason FROM quarantined_legacy_marks ORDER BY student_id').all() as any[];
    assert.strictEqual(quarantined.length, 3);
    assert.ok(quarantined[0].quarantine_reason.includes('INVALID_MAX_SCORE: 0'));
    assert.ok(quarantined[1].quarantine_reason.includes('INVALID_MAX_SCORE: -10'));
    assert.ok(quarantined[2].quarantine_reason.includes('INVALID_MAX_SCORE: 1200'));

    db.close();
  });

  it('EXAM-MIG-14: in-transaction reconciliation invariant strictly enforces migratedMarks + quarantinedMarks === preflightTotal', () => {
    const dbPath = getTmpDbPath();
    const db = createPR004TestDb(dbPath);

    db.exec(`
      INSERT INTO academic_years (id, name, start_date, end_date) VALUES (1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES (1, 't', 't@test.edu', 'h', 'T', 'subject_teacher');
      INSERT INTO classes (id, grade, name, academic_year_id) VALUES (1, 8, 'Grade 8-A', 1);
      INSERT INTO subjects (id, code, name, grade_level) VALUES (1, 'MATH', 'Mathematics', '6-11');
      INSERT INTO examinations (id, name, term, academic_year_id, is_published) VALUES (1, 'Exam 1', 1, 1, 1);
      INSERT INTO students (id, admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES (101, 'S-101', 'Student A', 'A', '2012-01-01', 'Male', 'G', 'F', '0771111111'),
               (102, 'S-102', 'Student B', 'B', '2012-01-01', 'Female', 'G', 'M', '0772222222'),
               (103, 'S-103', 'Student C', 'C', '2012-01-01', 'Male', 'G', 'F', '0773333333'),
               (104, 'S-104', 'Student D', 'D', '2012-01-01', 'Female', 'G', 'M', '0774444444'),
               (105, 'S-105', 'Student E', 'E', '2012-01-01', 'Male', 'G', 'F', '0775555555');

      -- 5 legacy marks: 2 valid, 3 quarantined (precision, out-of-bounds, absent+score)
      INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, is_absent, is_exempt, max_score)
        VALUES 
          (1, 1, 1, 101, 80.0, 0, 0, 100),
          (1, 1, 1, 102, 90.5, 0, 0, 100),
          (1, 1, 1, 103, 75.25, 0, 0, 100),
          (1, 1, 1, 104, 150.0, 0, 0, 100),
          (1, 1, 1, 105, 50.0, 1, 0, 100);
    `);

    const result = runMigration005(db);
    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.migratedMarks, 2);
    assert.strictEqual(result.quarantinedMarks, 3);
    assert.strictEqual(result.migratedMarks + result.quarantinedMarks, 5);

    db.close();
  });

  describe('EXAM-MIG-15: legacy POST /api/marks/sheet security hardening', () => {
    let fixtures: any;
    let server: TestServerInstance;
    let teacherToken: string;

    before(async () => {
      fixtures = setupIsolatedTestDb();
      process.env.DB_PATH = fixtures.dbPath;
      process.env.NODE_ENV = 'test';
      server = await startTestServer();

      // Authenticate Subject Teacher
      const stLogin = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: fixtures.subjectTeacher.username,
          password: fixtures.subjectTeacher.password
        })
      });
      teacherToken = (await stLogin.json()).token;
    });

    after(async () => {
      await server.close();
      closeDatabase();
      teardownIsolatedTestDb(fixtures.dbPath);
    });

    it('rejects privileged status injection like approved or published with 400', async () => {
      const res = await server.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: 1,
          classId: fixtures.testClassA.id,
          subjectId: fixtures.testSubjectMath.id,
          status: 'approved',
          marks: [{ student_id: fixtures.studentA.id, score: 85 }]
        })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Invalid status'));
    });

    it('rejects scores with invalid precision (>1 decimal) with 400', async () => {
      const res = await server.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: 1,
          classId: fixtures.testClassA.id,
          subjectId: fixtures.testSubjectMath.id,
          marks: [{ student_id: fixtures.studentA.id, score: 85.25 }]
        })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('exceeds allowed 1-decimal precision'));
    });

    it('rejects out of bounds score (<0 or >100) with 400 without silent clamping', async () => {
      const res = await server.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: 1,
          classId: fixtures.testClassA.id,
          subjectId: fixtures.testSubjectMath.id,
          marks: [{ student_id: fixtures.studentA.id, score: 105 }]
        })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('out of bounds'));
    });
  });
});
