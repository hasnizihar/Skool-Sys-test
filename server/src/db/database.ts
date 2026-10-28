import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { runMigration004 } from './migrations/004_attendance_integrity.js';
import { runMigration005 } from './migrations/005_examination_integrity.js';
import { runMigration006 } from './migrations/006_examination_publication_policy.js';
import { createSafeDatabaseBackup, generateTimestampedBackupPath } from './backupUtils.js';

export function getDbPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), 'skoolsys.db');
}

export let DB_PATH = getDbPath();

let activeDb: DatabaseSync = new DatabaseSync(DB_PATH);
try {
  activeDb.exec('PRAGMA journal_mode = WAL;');
  activeDb.exec('PRAGMA foreign_keys = ON;');
  activeDb.exec('PRAGMA busy_timeout = 5000;');
} catch {
  // Silently ignore PRAGMA setup error if in special mode
}

export function switchDatabase(filePath?: string): DatabaseSync {
  try {
    activeDb.close();
  } catch {
    // Silently ignore if already closed
  }
  DB_PATH = filePath || getDbPath();
  activeDb = new DatabaseSync(DB_PATH);
  try {
    activeDb.exec('PRAGMA journal_mode = WAL;');
    activeDb.exec('PRAGMA foreign_keys = ON;');
    activeDb.exec('PRAGMA busy_timeout = 5000;');
  } catch {
    // Silently ignore
  }
  return activeDb;
}

export function closeDatabase(): void {
  try {
    activeDb.close();
  } catch {
    // Silently ignore if already closed
  }
}

// Transparent Proxy wrapper so all routes importing `db` seamlessly execute against activeDb
export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const value = Reflect.get(activeDb, prop);
    if (typeof value === 'function') {
      return value.bind(activeDb);
    }
    return value;
  }
});

export function getActiveDbPath(targetDb: DatabaseSync = activeDb): string {
  try {
    const rows = targetDb.prepare('PRAGMA database_list;').all() as Array<{ seq: number; name: string; file: string }>;
    const mainDb = rows.find(r => r.name === 'main');
    if (mainDb && mainDb.file) {
      return path.resolve(mainDb.file);
    }
    return DB_PATH === ':memory:' ? ':memory:' : path.resolve(DB_PATH);
  } catch {
    return DB_PATH === ':memory:' ? ':memory:' : path.resolve(DB_PATH);
  }
}

export const DISPOSABLE_MARKER_TABLE = '_skoolsys_disposable_marker';

export function stampDisposableMarker(targetDb: DatabaseSync = db, token = 'DISPOSABLE_SYNTHETIC_TEST_RUN'): void {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS _skoolsys_disposable_marker (
      marker_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      environment TEXT NOT NULL,
      disposable_token TEXT NOT NULL,
      disclaimer TEXT NOT NULL
    );
  `);
  const stmt = targetDb.prepare(`
    INSERT OR REPLACE INTO _skoolsys_disposable_marker (marker_id, created_at, environment, disposable_token, disclaimer)
    VALUES (?, datetime('now'), ?, ?, ?)
  `);
  stmt.run('primary_marker', process.env.NODE_ENV || 'test', token, 'AUTHORIZED_DISPOSABLE_DEMO_OR_SYNTHETIC_FIXTURE_ONLY');
}

export function hasDisposableMarker(targetDb: DatabaseSync = db): boolean {
  try {
    const tableExists = targetDb.prepare(
      "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='_skoolsys_disposable_marker'"
    ).get() as { count: number } | undefined;
    if (!tableExists || tableExists.count === 0) return false;
    const row = targetDb.prepare(
      "SELECT disposable_token FROM _skoolsys_disposable_marker WHERE marker_id = 'primary_marker'"
    ).get() as { disposable_token?: string } | undefined;
    return !!row?.disposable_token;
  } catch {
    return false;
  }
}

export function getPopulatedApplicationTables(targetDb: DatabaseSync = db): string[] {
  try {
    const tables = targetDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_skoolsys_disposable_marker'"
    ).all() as Array<{ name: string }>;

    const populated: string[] = [];
    for (const table of tables) {
      if (!/^[a-zA-Z0-9_]+$/.test(table.name)) continue;
      try {
        const row = targetDb.prepare(`SELECT 1 FROM "${table.name}" LIMIT 1`).get();
        if (row) {
          populated.push(table.name);
        }
      } catch {
        // Table may be inaccessible or virtual, continue
      }
    }
    return populated;
  } catch {
    return [];
  }
}

export function isDatabasePopulated(targetDb: DatabaseSync = db): boolean {
  const populated = getPopulatedApplicationTables(targetDb);
  return populated.length > 0;
}

export function initDatabase() {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
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

    CREATE TABLE IF NOT EXISTS academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL CHECK(grade >= 6 AND grade <= 13),
      name TEXT NOT NULL,
      room_number TEXT,
      academic_year_id INTEGER REFERENCES academic_years(id),
      class_teacher_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Core',
      grade_level TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      UNIQUE(class_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
      assignment_type TEXT NOT NULL CHECK(assignment_type IN ('class_teacher', 'subject_teacher')),
      academic_year_id INTEGER REFERENCES academic_years(id)
    );

    CREATE TABLE IF NOT EXISTS students (
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

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
      roll_number INTEGER,
      status TEXT DEFAULT 'enrolled' CHECK(status IN ('enrolled', 'transferred', 'promoted')),
      UNIQUE(student_id, academic_year_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
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

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'excused')),
      remarks TEXT,
      synced_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS examinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      term INTEGER NOT NULL CHECK(term IN (1, 2, 3)),
      academic_year_id INTEGER REFERENCES academic_years(id),
      start_date TEXT,
      end_date TEXT,
      max_score REAL NOT NULL DEFAULT 100.0 CHECK(max_score > 0.0 AND max_score <= 1000.0),
      is_published INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS marks (
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

    CREATE TABLE IF NOT EXISTS audit_logs (
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

    CREATE TABLE IF NOT EXISTS examination_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      max_score REAL NOT NULL DEFAULT 100.0 CHECK(max_score > 0.0 AND max_score <= 1000.0),
      is_required INTEGER NOT NULL DEFAULT 1 CHECK(is_required IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('draft', 'approved')),
      approved_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(examination_id, class_id, subject_id)
    );

    CREATE TRIGGER IF NOT EXISTS trg_prevent_exam_schedule_insert_after_publish
    BEFORE INSERT ON examination_schedules
    BEGIN
      SELECT CASE
        WHEN (SELECT is_published FROM examinations WHERE id = NEW.examination_id) = 1
        THEN RAISE(ABORT, 'Cannot modify examination schedule after examination has been published.')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_prevent_exam_schedule_update_after_publish
    BEFORE UPDATE ON examination_schedules
    BEGIN
      SELECT CASE
        WHEN (SELECT is_published FROM examinations WHERE id = OLD.examination_id) = 1
        THEN RAISE(ABORT, 'Cannot modify examination schedule after examination has been published.')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_prevent_exam_schedule_delete_after_publish
    BEFORE DELETE ON examination_schedules
    BEGIN
      SELECT CASE
        WHEN (SELECT is_published FROM examinations WHERE id = OLD.examination_id) = 1
        THEN RAISE(ABORT, 'Cannot modify examination schedule after examination has been published.')
      END;
    END;

    CREATE INDEX IF NOT EXISTS idx_students_admission ON students(admission_no);
    CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id, academic_year_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_sessions(date, class_id);
    CREATE INDEX IF NOT EXISTS idx_marks_exam_subject ON marks(examination_id, subject_id, class_id);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_exam_schedules ON examination_schedules(examination_id, class_id);
  `;

  db.exec(schema);

  // Safe migration for existing databases lacking token_version column
  try {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1;');
  } catch {
    // Column already exists
  }

  // Safe column migrations for examination_schedules in existing databases
  try {
    db.exec("ALTER TABLE examination_schedules ADD COLUMN status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('draft', 'approved'));");
  } catch {}
  try {
    db.exec('ALTER TABLE examination_schedules ADD COLUMN approved_by_user_id INTEGER REFERENCES users(id);');
  } catch {}
  try {
    db.exec('ALTER TABLE examination_schedules ADD COLUMN approved_at TEXT;');
  } catch {}
  try {
    db.exec('ALTER TABLE examination_schedules ADD COLUMN max_score REAL NOT NULL DEFAULT 100.0 CHECK(max_score > 0.0 AND max_score <= 1000.0);');
  } catch {}

  // Safe column migrations for examinations in existing databases
  try {
    db.exec('ALTER TABLE examinations ADD COLUMN max_score REAL NOT NULL DEFAULT 100.0 CHECK(max_score > 0.0 AND max_score <= 1000.0);');
  } catch {}

  // Safe column migrations for marks_sheets in existing databases
  try {
    db.exec('ALTER TABLE marks_sheets ADD COLUMN max_score REAL NOT NULL DEFAULT 100.0 CHECK(max_score > 0.0 AND max_score <= 1000.0);');
  } catch {}

  // Safe column migrations for marks in existing databases
  try {
    db.exec("ALTER TABLE marks ADD COLUMN status TEXT DEFAULT 'submitted' CHECK(status IN ('draft', 'submitted', 'published'));");
  } catch {}

  // Safe migration 004: Attendance integrity, revisions & receipts
  // Inspect whether migration 004 is needed
  const versionRow = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const currentVersion = Number(versionRow?.user_version || 0);

  const revisionColCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM pragma_table_info('attendance_sessions') WHERE name = 'revision';"
  ).get() as { cnt: number };
  const hasRevisionCol = Number(revisionColCheck?.cnt || 0) > 0;

  const receiptsTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'attendance_sync_receipts';"
  ).get() as { cnt: number };
  const hasReceiptsTable = Number(receiptsTableCheck?.cnt || 0) > 0;

  const needsMigration004 = currentVersion < 4 || !hasRevisionCol || !hasReceiptsTable;

  if (needsMigration004) {
    let backupPath: string | null = null;
    // For file-backed databases, create a verified point-in-time snapshot before migration
    if (DB_PATH && DB_PATH !== ':memory:' && fs.existsSync(DB_PATH)) {
      try {
        const backupDir = path.join(path.dirname(path.resolve(DB_PATH)), 'backups');
        backupPath = generateTimestampedBackupPath(DB_PATH, backupDir);
        createSafeDatabaseBackup(db, backupPath);
        console.log(`[Database Migration] Pre-migration backup verified at: ${backupPath}`);
      } catch (backupErr: any) {
        console.error('\n❌ FATAL: Pre-migration database backup failed before applying Migration 004!');
        console.error(backupErr.message);
        console.error('Server startup halted. No schema changes were applied.\n');
        throw new Error(`Pre-migration database backup failed: ${backupErr.message}. Aborting startup.`);
      }
    }

    try {
      const result = runMigration004(db);
      if (result.applied) {
        console.log(`[Database Migration] Migration 004 applied successfully (Schema V${result.version}).`);
      }
    } catch (migErr: any) {
      console.error('\n❌ FATAL: Migration 004 failed during server startup!');
      console.error(migErr.message);
      if (backupPath) {
        console.error(`ACTION REQUIRED: Restore database from verified pre-migration backup: ${backupPath}`);
      }
      console.error('Server startup halted to prevent schema corruption or partial state.\n');
      throw new Error(`Migration 004 failed: ${migErr.message}. Server startup halted.`);
    }
  }

  // Safe migration 005: Examination integrity, canonical marks & audit trail
  const vRow5 = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const ver5 = Number(vRow5?.user_version || 0);

  const sheetsTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'marks_sheets';"
  ).get() as { cnt: number };
  const hasSheetsTable = Number(sheetsTableCheck?.cnt || 0) > 0;

  const marksSheetIdCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM pragma_table_info('marks') WHERE name = 'sheet_id';"
  ).get() as { cnt: number };
  const hasSheetIdCol = Number(marksSheetIdCheck?.cnt || 0) > 0;

  const needsMigration005 = ver5 < 5 || !hasSheetsTable || !hasSheetIdCol;

  if (needsMigration005) {
    let backupPath: string | null = null;
    if (DB_PATH && DB_PATH !== ':memory:' && fs.existsSync(DB_PATH)) {
      try {
        const backupDir = path.join(path.dirname(path.resolve(DB_PATH)), 'backups');
        backupPath = generateTimestampedBackupPath(DB_PATH, backupDir);
        createSafeDatabaseBackup(db, backupPath);
        console.log(`[Database Migration] Pre-migration backup verified at: ${backupPath}`);
      } catch (backupErr: any) {
        console.error('\n❌ FATAL: Pre-migration database backup failed before applying Migration 005!');
        console.error(backupErr.message);
        throw new Error(`Pre-migration database backup failed: ${backupErr.message}. Aborting startup.`);
      }
    }

    try {
      const result = runMigration005(db);
      if (result.applied) {
        console.log(
          `[Database Migration] Migration 005 applied successfully (Schema V${result.version}). Migrated ${result.migratedMarks} marks across ${result.migratedSheets} sheets, quarantined ${result.quarantinedMarks} ambiguous marks.`
        );
      }
    } catch (migErr: any) {
      console.error('\n❌ FATAL: Migration 005 failed during server startup!');
      console.error(migErr.message);
      if (backupPath) {
        console.error(`ACTION REQUIRED: Restore database from verified pre-migration backup: ${backupPath}`);
      }
      throw new Error(`Migration 005 failed: ${migErr.message}. Server startup halted.`);
    }
  }

  // Safe migration 006: Examination publication governance, versioned policies, and post-publication corrections
  const vRow6 = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const ver6 = Number(vRow6?.user_version || 0);

  const pubTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'examination_publications';"
  ).get() as { cnt: number };
  const hasPubTable = Number(pubTableCheck?.cnt || 0) > 0;

  const needsMigration006 = ver6 < 6 || !hasPubTable;

  if (needsMigration006) {
    let backupPath: string | null = null;
    if (DB_PATH && DB_PATH !== ':memory:' && fs.existsSync(DB_PATH)) {
      try {
        const backupDir = path.join(path.dirname(path.resolve(DB_PATH)), 'backups');
        backupPath = generateTimestampedBackupPath(DB_PATH, backupDir);
        createSafeDatabaseBackup(db, backupPath);
        console.log(`[Database Migration] Pre-migration backup verified at: ${backupPath}`);
      } catch (backupErr: any) {
        console.error('\n❌ FATAL: Pre-migration database backup failed before applying Migration 006!');
        console.error(backupErr.message);
        throw new Error(`Pre-migration database backup failed: ${backupErr.message}. Aborting startup.`);
      }
    }

    try {
      const result = runMigration006(db);
      if (result.applied) {
        console.log(`[Database Migration] Migration 006 applied successfully (Schema V${result.version}).`);
      }
    } catch (migErr: any) {
      console.error('\n❌ FATAL: Migration 006 failed during server startup!');
      console.error(migErr.message);
      if (backupPath) {
        console.error(`ACTION REQUIRED: Restore database from verified pre-migration backup: ${backupPath}`);
      }
      throw new Error(`Migration 006 failed: ${migErr.message}. Server startup halted.`);
    }
  }
}

