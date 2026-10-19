import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { setupIsolatedTestDb, teardownIsolatedTestDb } from './helpers/testDb.js';

describe('3. Database Isolation and Fixture Safety Verification', () => {
  it('setupIsolatedTestDb creates a database exclusively in the system temp directory', () => {
    const fixtures = setupIsolatedTestDb();
    const tempDir = os.tmpdir();

    // Verify file path is in temp directory
    assert.ok(
      fixtures.dbPath.startsWith(tempDir),
      `Test DB path (${fixtures.dbPath}) must reside inside os.tmpdir (${tempDir})`
    );
    assert.ok(fs.existsSync(fixtures.dbPath), 'Isolated test DB file must exist on disk');

    teardownIsolatedTestDb(fixtures.dbPath);
    assert.ok(!fs.existsSync(fixtures.dbPath), 'Isolated test DB file must be cleaned up on teardown');
  });

  it('verifies that mutations in isolated test DB do not touch the local workspace database', () => {
    const localDbPath = path.join(process.cwd(), 'skoolsys.db');
    let localDbExists = fs.existsSync(localDbPath);
    let originalMtime = localDbExists ? fs.statSync(localDbPath).mtimeMs : 0;

    // Create isolated test database and perform insert operations
    const fixtures = setupIsolatedTestDb();
    const testDb = new DatabaseSync(fixtures.dbPath);

    testDb.exec(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status)
      VALUES ('ISOLATION-CHECK-999', 'Isolation Check Student', 'Isolation', '2012-01-01', 'Male', 'Guardian', 'Father', '0779999999', 'Active');
    `);

    const inserted = testDb.prepare("SELECT * FROM students WHERE admission_no = 'ISOLATION-CHECK-999'").get() as any;
    assert.ok(inserted, 'Record should exist in the isolated test DB');
    testDb.close();

    // If local database exists, verify the synthetic record does NOT exist in it
    if (localDbExists) {
      const liveDb = new DatabaseSync(localDbPath);
      const liveRecord = liveDb.prepare("SELECT * FROM students WHERE admission_no = 'ISOLATION-CHECK-999'").get();
      liveDb.close();

      assert.equal(liveRecord, undefined, 'Synthetic test student MUST NOT exist in local database!');
      const postMtime = fs.statSync(localDbPath).mtimeMs;
      assert.equal(originalMtime, postMtime, 'Local database modification time must remain unchanged');
    }

    teardownIsolatedTestDb(fixtures.dbPath);
  });

  it('synthetic fixtures contain expected test seed entities with deterministic properties', () => {
    const fixtures = setupIsolatedTestDb();
    const testDb = new DatabaseSync(fixtures.dbPath);

    const userCount = testDb.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const classCount = testDb.prepare('SELECT COUNT(*) as count FROM classes').get() as { count: number };
    const studentCount = testDb.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number };

    assert.equal(userCount.count, 4, 'Must seed exactly 4 synthetic users');
    assert.equal(classCount.count, 2, 'Must seed exactly 2 synthetic classes');
    assert.equal(studentCount.count, 2, 'Must seed exactly 2 synthetic students');

    testDb.close();
    teardownIsolatedTestDb(fixtures.dbPath);
  });
});
