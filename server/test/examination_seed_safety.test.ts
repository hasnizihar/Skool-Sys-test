import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { switchDatabase, db, closeDatabase } from '../src/db/database.js';
import { validateSeedSafety, runSeed } from '../src/db/seed.js';

describe('G5F-01: Demo Seeding Data-Loss Protection & Safety Verification', () => {
  let tempDbPath: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalArgv: string[];

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalArgv = [...process.argv];

    // Clean test flags
    delete process.env.NODE_ENV;
    delete process.env.CONFIRM_DISPOSABLE_SEED;
    delete process.env.ALLOW_DISPOSABLE_SEED;
    delete process.env.DISPOSABLE_DEV_DB;

    // Create a temporary test database
    tempDbPath = path.join(os.tmpdir(), `skoolsys_seed_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    switchDatabase(tempDbPath);
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
    closeDatabase();
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch {}
  });

  it('1. Refuses execution in production environment before checking flags or modifying records', () => {
    process.env.NODE_ENV = 'production';
    process.env.CONFIRM_DISPOSABLE_SEED = '1';
    process.env.ALLOW_DISPOSABLE_SEED = '1';

    assert.throws(
      () => validateSeedSafety(tempDbPath),
      (err: any) => err.message.includes('[SEED BLOCKED]') && err.message.includes('production')
    );
  });

  it('2. Refuses execution in staging environment before any execution', () => {
    process.env.NODE_ENV = 'staging';
    process.env.CONFIRM_DISPOSABLE_SEED = '1';
    process.env.ALLOW_DISPOSABLE_SEED = '1';

    assert.throws(
      () => validateSeedSafety(tempDbPath),
      (err: any) => err.message.includes('[SEED BLOCKED]') && err.message.includes('staging')
    );
  });

  it('3. Refuses execution when explicit confirmation flag is missing', () => {
    // No confirmation flag provided
    process.env.ALLOW_DISPOSABLE_SEED = '1';

    assert.throws(
      () => validateSeedSafety(tempDbPath),
      (err: any) => err.message.includes('[SEED BLOCKED]') && err.message.includes('Missing explicit confirmation flag')
    );
  });

  it('4. Refuses execution on production-named database path even with confirmation flags', () => {
    process.env.CONFIRM_DISPOSABLE_SEED = '1';
    process.env.ALLOW_DISPOSABLE_SEED = '1';

    const prodPath = path.join(os.tmpdir(), 'skoolsys_prod_database.db');
    assert.throws(
      () => validateSeedSafety(prodPath),
      (err: any) => err.message.includes('[SEED BLOCKED]') && err.message.includes('production or staging database')
    );
  });

  it('5. Refuses execution on non-disposable existing database without disposable environment declaration', () => {
    process.env.CONFIRM_DISPOSABLE_SEED = '1';
    // Path doesn't contain test/temp/disposable/demo keywords
    const neutralPath = 'C:\\skoolsys_regular_school_records.db';

    assert.throws(
      () => validateSeedSafety(neutralPath),
      (err: any) => err.message.includes('[SEED BLOCKED]') && err.message.includes('not an explicitly designated disposable')
    );
  });

  it('6. Proves accidental seed against populated database aborts without deleting any existing records', () => {
    // Initialize database schema and insert an initial user
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL
      );
      INSERT INTO users (username, email, password_hash, full_name, role)
      VALUES ('real_admin', 'real@kcc.edu', 'hash', 'Real Authorized Principal', 'admin');
    `);

    const countBefore = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
    assert.strictEqual(countBefore, 1);

    // Attempt seed with missing confirmation flag
    assert.throws(
      () => runSeed({ bypassInit: true, targetDbPath: tempDbPath }),
      (err: any) => err.message.includes('[SEED BLOCKED]')
    );

    // Verify existing record is 100% preserved and untouched
    const countAfter = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
    assert.strictEqual(countAfter, 1, 'Existing database records must NOT be deleted when seed safety check trips.');

    const user = db.prepare("SELECT username, full_name FROM users WHERE username = 'real_admin'").get() as any;
    assert.strictEqual(user.full_name, 'Real Authorized Principal');
  });

  it('7. Successfully seeds designated disposable fixture when all safety flags are explicitly satisfied', () => {
    process.env.CONFIRM_DISPOSABLE_SEED = '1';
    process.env.ALLOW_DISPOSABLE_SEED = '1';

    // Run seed against disposable temp database
    runSeed({ targetDbPath: tempDbPath });

    // Verify synthetic demo entities were safely created
    const admin = db.prepare("SELECT username, full_name, role FROM users WHERE username = 'admin'").get() as any;
    assert.ok(admin);
    assert.ok(admin.full_name.includes('DEMO ONLY') && admin.full_name.includes('Synthetic'));

    const exam = db.prepare("SELECT name, is_published, status FROM examinations WHERE name LIKE 'Term 1 Assessment 2026%'").get() as any;
    assert.ok(exam);
    assert.strictEqual(exam.status, 'published');
    assert.ok(exam.name.includes('Demo / Synthetic'));

    // Verify correction records are internally consistent
    const corrections = db.prepare("SELECT mc.*, s.name as subject_name FROM marks_corrections mc JOIN subjects s ON mc.subject_id = s.id").all() as any[];
    assert.strictEqual(corrections.length, 3);

    // Verify foreign key integrity remained enabled
    const fkPragma = (db.prepare('PRAGMA foreign_keys;').get() as any)?.foreign_keys;
    assert.strictEqual(fkPragma, 1, 'PRAGMA foreign_keys must remain active after seed.');
  });
});
