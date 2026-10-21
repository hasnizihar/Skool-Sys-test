import { DatabaseSync } from 'node:sqlite';

export const TARGET_SCHEMA_VERSION = 6;

export interface Migration006Result {
  applied: boolean;
  version: number;
}

/**
 * Migration 006: Examination Publication Governance, Versioned Policies, and Post-Publication Corrections
 *
 * Adds:
 * 1. Policy versioning and provenance fields to assessment_policy_profiles
 * 2. Examination publication tracking fields to examinations
 * 3. Immutable publication snapshot table examination_publications
 */
export function runMigration006(db: DatabaseSync): Migration006Result {
  const versionRow = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const currentVersion = Number(versionRow?.user_version || 0);

  // Check if target tables already exist
  const pubTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'examination_publications';"
  ).get() as { cnt: number };
  const hasPubTable = Number(pubTableCheck?.cnt || 0) > 0;

  if (currentVersion >= TARGET_SCHEMA_VERSION && hasPubTable) {
    return {
      applied: false,
      version: currentVersion
    };
  }

  // 1. Upgrade assessment_policy_profiles with versioning and provenance columns if missing
  const policyCols = db.prepare("SELECT name FROM pragma_table_info('assessment_policy_profiles')").all() as { name: string }[];
  const policyColNames = new Set(policyCols.map(c => c.name));

  if (!policyColNames.has('version')) {
    db.exec(`ALTER TABLE assessment_policy_profiles ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);`);
  }
  if (!policyColNames.has('subject_weights_json')) {
    db.exec(`ALTER TABLE assessment_policy_profiles ADD COLUMN subject_weights_json TEXT DEFAULT '{}';`);
  }
  if (!policyColNames.has('effective_from')) {
    db.exec(`ALTER TABLE assessment_policy_profiles ADD COLUMN effective_from TEXT;`);
  }
  if (!policyColNames.has('effective_to')) {
    db.exec(`ALTER TABLE assessment_policy_profiles ADD COLUMN effective_to TEXT;`);
  }
  if (!policyColNames.has('created_by_user_id')) {
    db.exec(`ALTER TABLE assessment_policy_profiles ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);`);
  }

  // 2. Upgrade examinations with publication metadata columns if missing
  const examCols = db.prepare("SELECT name FROM pragma_table_info('examinations')").all() as { name: string }[];
  const examColNames = new Set(examCols.map(c => c.name));

  if (!examColNames.has('assessment_policy_id')) {
    db.exec(`ALTER TABLE examinations ADD COLUMN assessment_policy_id INTEGER REFERENCES assessment_policy_profiles(id);`);
  }
  if (!examColNames.has('publication_version')) {
    db.exec(`ALTER TABLE examinations ADD COLUMN publication_version INTEGER DEFAULT 0;`);
  }

  // 3. Create immutable publication snapshot table
  db.exec(`
    CREATE TABLE IF NOT EXISTS examination_publications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE RESTRICT,
      publication_version INTEGER NOT NULL DEFAULT 1,
      policy_profile_id INTEGER NOT NULL REFERENCES assessment_policy_profiles(id) ON DELETE RESTRICT,
      policy_version INTEGER NOT NULL DEFAULT 1,
      published_by_user_id INTEGER NOT NULL REFERENCES users(id),
      published_at TEXT NOT NULL DEFAULT (datetime('now')),
      publication_snapshot_json TEXT NOT NULL,
      audit_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(examination_id, publication_version)
    );
  `);

  db.exec(`PRAGMA user_version = ${TARGET_SCHEMA_VERSION};`);

  return {
    applied: true,
    version: TARGET_SCHEMA_VERSION
  };
}
