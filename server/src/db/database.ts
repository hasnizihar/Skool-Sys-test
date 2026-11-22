import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { runMigration004 } from './migrations/004_attendance_integrity.js';
import { runMigration007 } from './migrations/007_school_sections_and_assignments.js';
import { runMigration008 } from './migrations/008_classroom_status_tracking.js';
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
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_skoolsys_disposable_marker', 'timetable_settings')"
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

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      grade_range TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL CHECK(grade >= 6 AND grade <= 13),
      name TEXT NOT NULL,
      academic_year_id INTEGER REFERENCES academic_years(id),
      class_teacher_id INTEGER REFERENCES users(id),
      section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS section_head_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      assigned_at TEXT DEFAULT (datetime('now')),
      UNIQUE(section_id, user_id)
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

    CREATE TABLE IF NOT EXISTS academic_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      term_number INTEGER NOT NULL CHECK(term_number IN (1, 2, 3)),
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      is_verified INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0, 1)),
      UNIQUE(academic_year_id, term_number)
    );

    CREATE TABLE IF NOT EXISTS academic_staff_authorizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      auth_role TEXT NOT NULL CHECK(auth_role IN (
        'principal',
        'vice_principal_academic',
        'section_head'
      )),
      grade_band TEXT NOT NULL CHECK(grade_band IN ('junior_6_9', 'ol_10_11', 'al_12_13', 'all')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      granted_by_user_id INTEGER NOT NULL REFERENCES users(id),
      granted_at TEXT DEFAULT (datetime('now')),
      revoked_by_user_id INTEGER REFERENCES users(id),
      revoked_at TEXT,
      revocation_reason TEXT,
      UNIQUE(user_id, academic_year_id, auth_role, grade_band)
    );

    CREATE TABLE IF NOT EXISTS student_subject_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      enrollment_status TEXT NOT NULL DEFAULT 'provisional_unverified' CHECK(enrollment_status IN (
        'confirmed',
        'provisional_unverified',
        'dropped',
        'transferred'
      )),
      enrollment_category TEXT NOT NULL CHECK(enrollment_category IN (
        'core_compulsory',
        'religion_specific',
        'language_specific',
        'ol_basket_1',
        'ol_basket_2',
        'ol_basket_3',
        'al_stream_main',
        'al_common_compulsory'
      )),
      created_at TEXT DEFAULT (datetime('now')),
      verified_by_user_id INTEGER REFERENCES users(id),
      verified_at TEXT,
      UNIQUE(student_id, subject_id, academic_year_id)
    );

    CREATE INDEX IF NOT EXISTS idx_students_admission ON students(admission_no);
    CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id, academic_year_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_sessions(date, class_id);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp DESC);

    CREATE TABLE IF NOT EXISTS school_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_number INTEGER NOT NULL UNIQUE CHECK(period_number >= 1 AND period_number <= 9),
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
      sort_order INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS timetable_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classroom_period_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      school_date TEXT NOT NULL,
      period_number INTEGER NOT NULL CHECK(period_number >= 1 AND period_number <= 9),
      status TEXT NOT NULL CHECK(status IN ('teaching', 'not_teaching', 'other_activity')),
      substitute_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      activity_note TEXT,
      recorded_by_user_id INTEGER NOT NULL REFERENCES users(id),
      revision INTEGER DEFAULT 1 CHECK(revision >= 1),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(class_id, school_date, period_number)
    );

    CREATE INDEX IF NOT EXISTS idx_classroom_period_lookup ON classroom_period_statuses(school_date, period_number, class_id);
    CREATE INDEX IF NOT EXISTS idx_classroom_period_class ON classroom_period_statuses(class_id, school_date);
    CREATE INDEX IF NOT EXISTS idx_classroom_period_recorded_by ON classroom_period_statuses(recorded_by_user_id);

    CREATE TABLE IF NOT EXISTS school_information (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      school_name_en TEXT NOT NULL,
      school_name_ta TEXT,
      school_name_si TEXT,
      secondary_title TEXT,
      census_no TEXT NOT NULL,
      school_type TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      address_line2 TEXT,
      district TEXT NOT NULL,
      province TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Sri Lanka',
      postal_code TEXT,
      zone TEXT NOT NULL,
      division TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      principal_name TEXT NOT NULL,
      principal_notes TEXT,
      founded_year INTEGER,
      student_category TEXT DEFAULT 'Boys',
      medium TEXT DEFAULT 'Tamil / English',
      supported_grades TEXT DEFAULT 'Grades 6–13',
      emblem_status TEXT DEFAULT 'verified',
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS school_daily_period_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week TEXT NOT NULL CHECK(day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
      period_number INTEGER NOT NULL CHECK(period_number >= 1 AND period_number <= 12),
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      period_type TEXT NOT NULL DEFAULT 'teaching' CHECK(period_type IN ('assembly', 'teaching', 'interval', 'prayer', 'extra_curricular', 'other')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      sort_order INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(day_of_week, period_number)
    );

    CREATE INDEX IF NOT EXISTS idx_school_daily_schedule ON school_daily_period_schedules(day_of_week, period_number);
  `;

  db.exec(schema);

  // Safe migration for existing databases lacking token_version column
  try {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1;');
  } catch {
    // Column already exists
  }

  // Safe column migration for classes in existing databases
  try {
    db.exec('ALTER TABLE classes ADD COLUMN section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;');
  } catch { }

  // Safe migration: drop 'room_number' column from classes if it exists in pre-existing database
  try {
    const classTableCols = db.prepare("SELECT name FROM pragma_table_info('classes')").all() as { name: string }[];
    if (classTableCols.some((c) => c.name === 'room_number')) {
      db.exec('ALTER TABLE classes DROP COLUMN room_number;');
    }
  } catch { }

  // Safe migration: drop 'code' column from sections if it exists in pre-existing database
  try {
    const secTableCols = db.prepare("SELECT name FROM pragma_table_info('sections')").all() as { name: string }[];
    if (secTableCols.some((c) => c.name === 'code')) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE IF NOT EXISTS sections_nocode (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          grade_range TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO sections_nocode (id, name, description, grade_range, created_at, updated_at)
        SELECT id, name, description, grade_range, created_at, updated_at FROM sections;
        DROP TABLE sections;
        ALTER TABLE sections_nocode RENAME TO sections;
        PRAGMA foreign_keys = ON;
      `);
    }
  } catch (err) {
    // Ignore migration notice
  }

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

  // Safe migration 007: School Sections & Multi-Head / Multi-Teacher Assignments
  const vRow7 = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const ver7 = Number(vRow7?.user_version || 0);

  const sectionsTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'sections';"
  ).get() as { cnt: number };
  const hasSectionsTable = Number(sectionsTableCheck?.cnt || 0) > 0;

  const sectionHeadsTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'section_head_assignments';"
  ).get() as { cnt: number };
  const hasSectionHeadsTable = Number(sectionHeadsTableCheck?.cnt || 0) > 0;

  const classCols = db.prepare("SELECT name FROM pragma_table_info('classes')").all() as { name: string }[];
  const hasClassesSectionId = classCols.some((c) => c.name === 'section_id');

  const needsMigration007 = ver7 < 7 || !hasSectionsTable || !hasSectionHeadsTable || !hasClassesSectionId;

  if (needsMigration007) {
    let backupPath: string | null = null;
    if (DB_PATH && DB_PATH !== ':memory:' && fs.existsSync(DB_PATH)) {
      try {
        const backupDir = path.join(path.dirname(path.resolve(DB_PATH)), 'backups');
        backupPath = generateTimestampedBackupPath(DB_PATH, backupDir);
        createSafeDatabaseBackup(db, backupPath);
        console.log(`[Database Migration] Pre-migration backup verified at: ${backupPath}`);
      } catch (backupErr: any) {
        console.error('\n❌ FATAL: Pre-migration database backup failed before applying Migration 007!');
        console.error(backupErr.message);
        throw new Error(`Pre-migration database backup failed: ${backupErr.message}. Aborting startup.`);
      }
    }

    try {
      const result = runMigration007(db);
      if (result.applied) {
        console.log(`[Database Migration] Migration 007 applied successfully (Schema V${result.version}).`);
      }
    } catch (migErr: any) {
      console.error('\n❌ FATAL: Migration 007 failed during server startup!');
      console.error(migErr.message);
      if (backupPath) {
        console.error(`ACTION REQUIRED: Restore database from verified pre-migration backup: ${backupPath}`);
      }
      throw new Error(`Migration 007 failed: ${migErr.message}. Server startup halted.`);
    }
  }

  // Safe migration 008: Period-Based Live Classroom Status Tracking
  const vRow8 = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const ver8 = Number(vRow8?.user_version || 0);

  const periodsTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'school_periods';"
  ).get() as { cnt: number };
  const hasPeriodsTable = Number(periodsTableCheck?.cnt || 0) > 0;

  const statusTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'classroom_period_statuses';"
  ).get() as { cnt: number };
  const hasStatusTable = Number(statusTableCheck?.cnt || 0) > 0;

  const settingsTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'timetable_settings';"
  ).get() as { cnt: number };
  const hasSettingsTable = Number(settingsTableCheck?.cnt || 0) > 0;

  const needsMigration008 = ver8 < 8 || !hasPeriodsTable || !hasStatusTable || !hasSettingsTable;

  if (needsMigration008) {
    let backupPath: string | null = null;
    if (DB_PATH && DB_PATH !== ':memory:' && fs.existsSync(DB_PATH)) {
      try {
        const backupDir = path.join(path.dirname(path.resolve(DB_PATH)), 'backups');
        backupPath = generateTimestampedBackupPath(DB_PATH, backupDir);
        createSafeDatabaseBackup(db, backupPath);
        console.log(`[Database Migration] Pre-migration backup verified at: ${backupPath}`);
      } catch (backupErr: any) {
        console.error('\n❌ FATAL: Pre-migration database backup failed before applying Migration 008!');
        console.error(backupErr.message);
        throw new Error(`Pre-migration database backup failed: ${backupErr.message}. Aborting startup.`);
      }
    }

    try {
      const result = runMigration008(db);
      if (result.applied) {
        console.log(`[Database Migration] Migration 008 applied successfully (Schema V${result.version}).`);
      }
    } catch (migErr: any) {
      console.error('\n❌ FATAL: Migration 008 failed during server startup!');
      console.error(migErr.message);
      if (backupPath) {
        console.error(`ACTION REQUIRED: Restore database from verified pre-migration backup: ${backupPath}`);
      }
      throw new Error(`Migration 008 failed: ${migErr.message}. Server startup halted.`);
    }
  }
}

