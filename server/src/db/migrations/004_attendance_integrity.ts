import { DatabaseSync } from 'node:sqlite';

export const TARGET_SCHEMA_VERSION = 4;

/**
 * Migration 004: Attendance Integrity, Revision Concurrency & Sync Receipts
 * Idempotent, transaction-enclosed DDL migration with schema drift detection
 * and post-migration foreign key & integrity invariant verification.
 */
export function runMigration004(db: DatabaseSync): { applied: boolean; version: number } {
  // 1. Inspect current schema version
  const versionRow = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const currentVersion = Number(versionRow?.user_version || 0);

  // Check if columns and tables already exist to detect schema drift
  const revisionColCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM pragma_table_info('attendance_sessions') WHERE name = 'revision';"
  ).get() as { cnt: number };
  const hasRevisionCol = Number(revisionColCheck?.cnt || 0) > 0;

  const receiptsTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'attendance_sync_receipts';"
  ).get() as { cnt: number };
  const hasReceiptsTable = Number(receiptsTableCheck?.cnt || 0) > 0;

  if (currentVersion >= TARGET_SCHEMA_VERSION && hasRevisionCol && hasReceiptsTable) {
    return { applied: false, version: currentVersion };
  }

  // 2. Execute migration inside transaction
  db.exec('BEGIN IMMEDIATE;');
  try {
    // A. Add revision column to attendance_sessions if not present
    if (!hasRevisionCol) {
      db.exec(`
        ALTER TABLE attendance_sessions 
        ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1);
      `);
    }

    // B. Create attendance_sync_receipts table if not present
    if (!hasReceiptsTable) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS attendance_sync_receipts (
          client_mutation_id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          class_id INTEGER NOT NULL REFERENCES classes(id),
          date TEXT NOT NULL,
          payload_hash TEXT NOT NULL,
          resulting_revision INTEGER NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('applied', 'replayed')),
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
    }

    // C. Create dedicated composite indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_enrollments_active_class_year 
        ON enrollments(academic_year_id, class_id, status);

      CREATE INDEX IF NOT EXISTS idx_attendance_sessions_rev_lookup 
        ON attendance_sessions(class_id, date, revision);

      CREATE INDEX IF NOT EXISTS idx_sync_receipts_hash_lookup 
        ON attendance_sync_receipts(client_mutation_id, payload_hash);
    `);

    // D. Run invariant checks before committing
    const fkCheck = db.prepare('PRAGMA foreign_key_check;').all();
    if (fkCheck.length > 0) {
      throw new Error(`Migration 004 foreign key invariant violation: ${JSON.stringify(fkCheck)}`);
    }

    const integrityCheck = db.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
    if (integrityCheck?.integrity_check !== 'ok') {
      throw new Error(`Migration 004 database integrity check failed: ${JSON.stringify(integrityCheck)}`);
    }

    // E. Update schema version ledger
    db.exec(`PRAGMA user_version = ${TARGET_SCHEMA_VERSION};`);

    db.exec('COMMIT;');
    return { applied: true, version: TARGET_SCHEMA_VERSION };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback errors if already aborted
    }
    throw err;
  }
}
