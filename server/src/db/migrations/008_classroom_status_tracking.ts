import { DatabaseSync } from 'node:sqlite';

export const TARGET_SCHEMA_VERSION = 8;

export interface Migration008Result {
  applied: boolean;
  version: number;
}

/**
 * Migration 008: Period-Based Live Classroom Status Tracking
 *
 * Implements Phase 2 foundation:
 * 1. `school_periods`: Configurable 9 teaching periods (Period 1 through 9).
 * 2. `timetable_settings`: Configurable school timetable settings (timezone, break interval after period 4, active days).
 * 3. `classroom_period_statuses`: Period-level status records (teaching, not_teaching, other_activity) with optimistic concurrency revision tracking.
 * 4. Composite indexes for high-frequency lookup and zero duplicate canonical status records.
 */
export function runMigration008(db: DatabaseSync): Migration008Result {
  const versionRow = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const currentVersion = Number(versionRow?.user_version || 0);

  // Check if target tables already exist
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

  if (currentVersion >= TARGET_SCHEMA_VERSION && hasPeriodsTable && hasStatusTable && hasSettingsTable) {
    return {
      applied: false,
      version: currentVersion
    };
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    // Ensure sections.grade_range exists
    const secCols = db.prepare("SELECT name FROM pragma_table_info('sections')").all() as { name: string }[];
    if (secCols.length > 0 && !secCols.some((c) => c.name === 'grade_range')) {
      db.exec('ALTER TABLE sections ADD COLUMN grade_range TEXT;');
    }

    // 1. Create school_periods table (9 periods)
    db.exec(`
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
    `);

    // 2. Create timetable_settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS timetable_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Seed default unconfigured settings (does NOT fabricate fake period times)
    db.exec(`
      INSERT OR IGNORE INTO timetable_settings (setting_key, setting_value) VALUES
        ('timezone', 'Asia/Colombo'),
        ('break_after_period', '4'),
        ('break_name', 'Interval / Recess'),
        ('break_start_time', ''),
        ('break_end_time', ''),
        ('school_days', '1,2,3,4,5'),
        ('is_configured', '0');
    `);

    // 3. Create classroom_period_statuses table
    db.exec(`
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
    `);

    // 4. Create performance indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_classroom_period_lookup ON classroom_period_statuses(school_date, period_number, class_id);
      CREATE INDEX IF NOT EXISTS idx_classroom_period_class ON classroom_period_statuses(class_id, school_date);
      CREATE INDEX IF NOT EXISTS idx_classroom_period_recorded_by ON classroom_period_statuses(recorded_by_user_id);
    `);

    // 5. Invariant Checks
    const fkCheck = db.prepare('PRAGMA foreign_key_check;').all();
    if (fkCheck.length > 0) {
      throw new Error(`Migration 008 foreign key invariant violation: ${JSON.stringify(fkCheck)}`);
    }

    const integrityCheck = db.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
    if (integrityCheck?.integrity_check !== 'ok') {
      throw new Error(`Migration 008 database integrity check failed: ${JSON.stringify(integrityCheck)}`);
    }

    // 6. Bump schema version to 8
    db.exec(`PRAGMA user_version = ${TARGET_SCHEMA_VERSION};`);

    db.exec('COMMIT;');

    return {
      applied: true,
      version: TARGET_SCHEMA_VERSION
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {}
    throw err;
  }
}
