import { DatabaseSync } from 'node:sqlite';

export const TARGET_SCHEMA_VERSION = 7;

export interface Migration007Result {
  applied: boolean;
  version: number;
}

/**
 * Migration 007: School Sections & Explicit Multi-Head / Multi-Teacher Assignments
 *
 * Implements Phase 1 foundation:
 * 1. Explicit `sections` table for school structural groupings (e.g. Junior, Senior, A/L).
 * 2. Additive `classes.section_id` foreign key linking classes to their containing section.
 * 3. Explicit `section_head_assignments` table allowing multiple section heads per section.
 * 4. Preserves legacy `classes.class_teacher_id` and canonical `teacher_assignments`.
 */
export function runMigration007(db: DatabaseSync): Migration007Result {
  const versionRow = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const currentVersion = Number(versionRow?.user_version || 0);

  // Check if target tables and columns already exist
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

  if (currentVersion >= TARGET_SCHEMA_VERSION && hasSectionsTable && hasSectionHeadsTable && hasClassesSectionId) {
    return {
      applied: false,
      version: currentVersion
    };
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    // 1. Create sections table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        description TEXT,
        grade_range TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Ensure grade_range column exists if sections table was pre-existing
    const secCols = db.prepare("SELECT name FROM pragma_table_info('sections')").all() as { name: string }[];
    if (!secCols.some((c) => c.name === 'grade_range')) {
      db.exec('ALTER TABLE sections ADD COLUMN grade_range TEXT;');
    }

    // 2. Add section_id to classes if missing
    if (!hasClassesSectionId) {
      db.exec(`
        ALTER TABLE classes ADD COLUMN section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL;
      `);
    }

    // 3. Create section_head_assignments table (many-to-many: section <-> users)
    db.exec(`
      CREATE TABLE IF NOT EXISTS section_head_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        assigned_at TEXT DEFAULT (datetime('now')),
        UNIQUE(section_id, user_id)
      );
    `);

    // 4. Create composite and performance indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_classes_section ON classes(section_id);
      CREATE INDEX IF NOT EXISTS idx_section_head_assignments_user ON section_head_assignments(user_id);
      CREATE INDEX IF NOT EXISTS idx_section_head_assignments_section ON section_head_assignments(section_id);
    `);

    // 5. Invariant Checks
    const fkCheck = db.prepare('PRAGMA foreign_key_check;').all();
    if (fkCheck.length > 0) {
      throw new Error(`Migration 007 foreign key invariant violation: ${JSON.stringify(fkCheck)}`);
    }

    const integrityCheck = db.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
    if (integrityCheck?.integrity_check !== 'ok') {
      throw new Error(`Migration 007 database integrity check failed: ${JSON.stringify(integrityCheck)}`);
    }

    // 6. Bump schema version
    db.exec(`PRAGMA user_version = ${TARGET_SCHEMA_VERSION};`);

    db.exec('COMMIT;');
    return {
      applied: true,
      version: TARGET_SCHEMA_VERSION
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback errors if already aborted
    }
    throw err;
  }
}
