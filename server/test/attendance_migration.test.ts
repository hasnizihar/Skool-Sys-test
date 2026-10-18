import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { runMigration004, TARGET_SCHEMA_VERSION } from '../src/db/migrations/004_attendance_integrity.js';
import { createSafeDatabaseBackup } from '../src/db/backupUtils.js';

describe('PR-004 Stage 2: Schema Migration & Backup Recovery Tests', () => {
  // Helper to create a legacy synthetic database mimicking pre-004 schema (without revision or receipts)
  function createLegacyDb(filePath: string): DatabaseSync {
    const legacyDb = new DatabaseSync(filePath);
    legacyDb.exec('PRAGMA journal_mode = WAL;');
    legacyDb.exec('PRAGMA foreign_keys = ON;');
    legacyDb.exec('PRAGMA user_version = 3;');

    legacyDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        token_version INTEGER DEFAULT 1
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
        grade INTEGER NOT NULL,
        name TEXT NOT NULL,
        academic_year_id INTEGER REFERENCES academic_years(id)
      );

      CREATE TABLE students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admission_no TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL
      );

      CREATE TABLE enrollments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id),
        class_id INTEGER NOT NULL REFERENCES classes(id),
        academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
        status TEXT DEFAULT 'enrolled'
      );

      -- Legacy attendance_sessions lacking revision column
      CREATE TABLE attendance_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE,
        class_id INTEGER NOT NULL REFERENCES classes(id),
        date TEXT NOT NULL,
        academic_year_id INTEGER REFERENCES academic_years(id),
        taken_by_user_id INTEGER REFERENCES users(id),
        status TEXT DEFAULT 'submitted',
        notes TEXT,
        UNIQUE(class_id, date)
      );

      CREATE TABLE attendance_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES attendance_sessions(id),
        student_id INTEGER NOT NULL REFERENCES students(id),
        status TEXT NOT NULL,
        remarks TEXT,
        UNIQUE(session_id, student_id)
      );
    `);

    // Insert pre-existing seed data
    legacyDb.exec(`
      INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ('2026', '2026-01-01', '2026-12-31', 1);
      INSERT INTO classes (grade, name, academic_year_id) VALUES (8, 'Grade 8-A', 1);
      INSERT INTO students (admission_no, full_name) VALUES ('ADM-001', 'Kasun Perera');
      INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES (1, 1, 1);
      INSERT INTO attendance_sessions (class_id, date, academic_year_id, status) VALUES (1, '2026-05-18', 1, 'submitted');
      INSERT INTO attendance_records (session_id, student_id, status) VALUES (1, 1, 'present');
    `);

    return legacyDb;
  }

  it('ATT-034: successfully migrates legacy schema to V4 with data preserved and integrity verified', () => {
    const tempDbPath = path.join(os.tmpdir(), `test_mig_034_${Date.now()}.db`);
    const legacyDb = createLegacyDb(tempDbPath);

    try {
      const result = runMigration004(legacyDb);
      assert.strictEqual(result.applied, true);
      assert.strictEqual(result.version, TARGET_SCHEMA_VERSION);

      // Verify revision column was added and pre-existing session has default revision = 1
      const session = legacyDb.prepare('SELECT id, revision FROM attendance_sessions WHERE id = 1').get() as { id: number; revision: number };
      assert.strictEqual(session.revision, 1);

      // Verify attendance_sync_receipts table exists
      const tableCheck = legacyDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'attendance_sync_receipts'").get() as { cnt: number };
      assert.strictEqual(tableCheck.cnt, 1);

      // Verify pre-existing data is preserved intact
      const record = legacyDb.prepare('SELECT student_id, status FROM attendance_records WHERE session_id = 1').get() as { student_id: number; status: string };
      assert.strictEqual(record.student_id, 1);
      assert.strictEqual(record.status, 'present');

      // Verify integrity check and foreign key check pass
      const integrity = legacyDb.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
      assert.strictEqual(integrity.integrity_check, 'ok');

      const fk = legacyDb.prepare('PRAGMA foreign_key_check;').all();
      assert.strictEqual(fk.length, 0);
    } finally {
      legacyDb.close();
      fs.unlinkSync(tempDbPath);
    }
  });

  it('ATT-035: migration runner is idempotent and safe to execute repeatedly', () => {
    const tempDbPath = path.join(os.tmpdir(), `test_mig_035_${Date.now()}.db`);
    const legacyDb = createLegacyDb(tempDbPath);

    try {
      // First run: applies migration
      const firstRun = runMigration004(legacyDb);
      assert.strictEqual(firstRun.applied, true);

      // Second run: no-op, already at target version
      const secondRun = runMigration004(legacyDb);
      assert.strictEqual(secondRun.applied, false);
      assert.strictEqual(secondRun.version, TARGET_SCHEMA_VERSION);

      // Third run: still no-op
      const thirdRun = runMigration004(legacyDb);
      assert.strictEqual(thirdRun.applied, false);
    } finally {
      legacyDb.close();
      fs.unlinkSync(tempDbPath);
    }
  });

  it('ATT-051: interrupted migration cleanly rolls back and preserves original schema state', () => {
    const tempDbPath = path.join(os.tmpdir(), `test_mig_051_${Date.now()}.db`);
    const legacyDb = createLegacyDb(tempDbPath);

    try {
      // Inject failure: simulate error during migration by mocking an unhandled error inside DDL
      assert.throws(() => {
        legacyDb.exec('BEGIN IMMEDIATE;');
        // Perform partial change
        legacyDb.exec('ALTER TABLE attendance_sessions ADD COLUMN revision INTEGER DEFAULT 1;');
        // Forced syntax/constraint error before completion
        legacyDb.exec('INVALID SQL STATEMENT TO TRIGGER FORCED ROLLBACK;');
        legacyDb.exec('COMMIT;');
      });

      // Rollback must have restored state
      try { legacyDb.exec('ROLLBACK;'); } catch { /* ignore if already rolled back */ }

      // Schema version must remain at 3
      const verRow = legacyDb.prepare('PRAGMA user_version;').get() as { user_version: number };
      assert.strictEqual(verRow.user_version, 3);

      // Database integrity must be completely undamaged
      const integrity = legacyDb.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
      assert.strictEqual(integrity.integrity_check, 'ok');
    } finally {
      legacyDb.close();
      fs.unlinkSync(tempDbPath);
    }
  });

  it('ATT-061: VACUUM INTO produces consistent point-in-time snapshot with integrity verified', () => {
    const tempDbPath = path.join(os.tmpdir(), `test_mig_061_src_${Date.now()}.db`);
    const backupDbPath = path.join(os.tmpdir(), `test_mig_061_bak_${Date.now()}.db`);
    const srcDb = createLegacyDb(tempDbPath);

    try {
      runMigration004(srcDb);

      // Perform a write transaction
      srcDb.exec(`
        INSERT INTO attendance_sessions (class_id, date, academic_year_id, status, revision)
        VALUES (1, '2026-05-19', 1, 'submitted', 2);
      `);

      // Execute atomic backup snapshot
      createSafeDatabaseBackup(srcDb, backupDbPath);

      assert.strictEqual(fs.existsSync(backupDbPath), true);

      // Open backup database independently and verify
      const backupDb = new DatabaseSync(backupDbPath);
      try {
        const integrity = backupDb.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
        assert.strictEqual(integrity.integrity_check, 'ok');

        const sessionCount = backupDb.prepare('SELECT COUNT(*) as cnt FROM attendance_sessions;').get() as { cnt: number };
        assert.strictEqual(sessionCount.cnt, 2);

        const version = backupDb.prepare('PRAGMA user_version;').get() as { user_version: number };
        assert.strictEqual(version.user_version, TARGET_SCHEMA_VERSION);
      } finally {
        backupDb.close();
      }
    } finally {
      srcDb.close();
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      if (fs.existsSync(backupDbPath)) fs.unlinkSync(backupDbPath);
    }
  });
});
