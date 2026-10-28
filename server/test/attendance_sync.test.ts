import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { runMigration004 } from '../src/db/migrations/004_attendance_integrity.js';
import {
  processSyncBatch,
  computeServerRosterFingerprint,
  processAttendanceSubmission
} from '../src/services/attendanceService.js';

describe('PR-004 Offline Sync Batch Tests (ATT-023 - ATT-030, ATT-047 - ATT-050)', () => {
  let fixture: TestFixtureData;
  let db: DatabaseSync;

  beforeEach(() => {
    fixture = setupIsolatedTestDb();
    db = new DatabaseSync(fixture.dbPath);
    db.exec('PRAGMA busy_timeout = 5000;');
    runMigration004(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Ignore
    }
    teardownIsolatedTestDb(fixture.dbPath);
  });

  function getValidFingerprint(classId: number, academicYearId: number, dateStr: string) {
    const students = db.prepare(`
      SELECT s.id, s.admission_no, s.status as student_status
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      WHERE e.class_id = ? AND e.academic_year_id = ? AND e.status = 'enrolled' AND s.status = 'Active'
      ORDER BY s.id ASC
    `).all(classId, academicYearId) as Array<{ id: number; admission_no: string; student_status: string }>;

    return computeServerRosterFingerprint(classId, academicYearId, dateStr, students);
  }

  // ATT-023: Independent per-item atomicity in offline sync batch
  it('ATT-023: processes sync batch with per-item atomicity (valid commits, invalid rejects without aborting batch)', () => {
    const date1 = '2026-05-01';
    const date2 = '2026-05-02';
    const fp1 = getValidFingerprint(fixture.testClassA.id, 1, date1);
    const fp2 = getValidFingerprint(fixture.testClassA.id, 1, date2);

    const batch = [
      // Item 1: Valid submission for 2026-05-01
      {
        classId: fixture.testClassA.id,
        date: date1,
        mode: 'submitted',
        baseRevision: 0,
        clientMutationId: crypto.randomUUID(),
        rosterFingerprint: fp1,
        notes: 'Batch valid item',
        records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
      },
      // Item 2: Invalid submission (foreign student injection)
      {
        classId: fixture.testClassA.id,
        date: date2,
        mode: 'submitted',
        baseRevision: 0,
        clientMutationId: crypto.randomUUID(),
        rosterFingerprint: fp2,
        notes: 'Batch invalid item',
        records: [{ student_id: fixture.studentB.id, status: 'present', remarks: null }] // Student B in Class B!
      }
    ];

    const result = processSyncBatch(db, fixture.classTeacher, batch);
    assert.strictEqual(result.processedCount, 2);
    assert.strictEqual(result.results[0].status, 'applied');
    assert.strictEqual(result.results[0].revision, 1);
    assert.strictEqual(result.results[1].status, 'rejected');
    assert.strictEqual(result.results[1].code, 'FOREIGN_STUDENT_ENROLMENT');

    // Item 1 was committed to SQLite
    const s1 = db.prepare('SELECT id FROM attendance_sessions WHERE class_id = ? AND date = ?').get(fixture.testClassA.id, date1);
    assert(s1 !== undefined);

    // Item 2 was NOT committed to SQLite
    const s2 = db.prepare('SELECT id FROM attendance_sessions WHERE class_id = ? AND date = ?').get(fixture.testClassA.id, date2);
    assert.strictEqual(s2, undefined);
  });

  // ATT-024: Batch with mixed valid and conflicting revision items
  it('ATT-024: marks items with stale base revision as conflicted without aborting valid items', () => {
    const date1 = '2026-05-03';
    const date2 = '2026-05-04';
    const fp1 = getValidFingerprint(fixture.testClassA.id, 1, date1);
    const fp2 = getValidFingerprint(fixture.testClassA.id, 1, date2);

    // Pre-create session for date 2 at revision 1
    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date: date2,
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp2,
      notes: 'Initial session',
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    const batch = [
      // Item 1: Valid new session for date 1
      {
        classId: fixture.testClassA.id,
        date: date1,
        mode: 'submitted',
        baseRevision: 0,
        clientMutationId: crypto.randomUUID(),
        rosterFingerprint: fp1,
        notes: null,
        records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
      },
      // Item 2: Stale baseRevision 0 for date 2 (server is at revision 1)
      {
        classId: fixture.testClassA.id,
        date: date2,
        mode: 'draft',
        baseRevision: 0, // Stale!
        clientMutationId: crypto.randomUUID(),
        rosterFingerprint: fp2,
        notes: 'Stale offline update',
        records: [{ student_id: fixture.studentA.id, status: 'late', remarks: null }]
      }
    ];

    const result = processSyncBatch(db, fixture.classTeacher, batch);
    assert.strictEqual(result.results[0].status, 'applied');
    assert.strictEqual(result.results[1].status, 'conflicted');
    assert.strictEqual(result.results[1].code, 'ATTENDANCE_CONCURRENCY_CONFLICT');
  });

  // ATT-025: Idempotent replay within sync batch
  it('ATT-025: returns replayed status for identical mutation re-sent in sync batch', () => {
    const date = '2026-05-05';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);
    const mutationId = crypto.randomUUID();

    const item = {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: mutationId,
      rosterFingerprint: fp,
      notes: 'Idempotent batch item',
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    };

    // First sync
    const res1 = processSyncBatch(db, fixture.classTeacher, [item]);
    assert.strictEqual(res1.results[0].status, 'applied');

    // Second sync with exact same item
    const res2 = processSyncBatch(db, fixture.classTeacher, [item]);
    assert.strictEqual(res2.results[0].status, 'replayed');
    assert.strictEqual(res2.results[0].revision, 1);
  });

  // ATT-026: Quarantined legacy item without revision/fingerprint rejected from sync
  it('ATT-026: rejects legacy items missing required V2 concurrency fields with LEGACY_PAYLOAD_UNSUPPORTED', () => {
    const legacyItem = {
      classId: fixture.testClassA.id,
      date: '2026-05-06',
      records: [{ student_id: fixture.studentA.id, status: 'present' }]
    };

    const result = processSyncBatch(db, fixture.classTeacher, [legacyItem]);
    assert.strictEqual(result.results[0].status, 'rejected');
    assert.strictEqual(result.results[0].code, 'LEGACY_PAYLOAD_UNSUPPORTED');
  });

  // ATT-027: Replay of already synced item returns cached receipt with 0 duplicate sessions
  it('ATT-027: receipt check prevents duplicate session creation on redundant sync replay', () => {
    const date = '2026-05-07';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);
    const mutationId = crypto.randomUUID();

    const item = {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: mutationId,
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    };

    processSyncBatch(db, fixture.classTeacher, [item]);
    processSyncBatch(db, fixture.classTeacher, [item]);
    processSyncBatch(db, fixture.classTeacher, [item]);

    const sessionCount = db.prepare('SELECT COUNT(*) as count FROM attendance_sessions WHERE class_id = ? AND date = ?').get(fixture.testClassA.id, date) as { count: number };
    assert.strictEqual(sessionCount.count, 1);
  });

  // ATT-028: Quarantined legacy item without revision/fingerprint rejected from sync
  it('ATT-028: rejects items missing roster fingerprint with MISSING_ROSTER_FINGERPRINT', () => {
    const invalidItem = {
      classId: fixture.testClassA.id,
      date: '2026-05-08',
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      // Missing rosterFingerprint
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    };

    const result = processSyncBatch(db, fixture.classTeacher, [invalidItem]);
    assert.strictEqual(result.results[0].status, 'rejected');
    assert.strictEqual(result.results[0].code, 'INVALID_ROSTER_FINGERPRINT');
  });

  // ATT-029: Class teacher submitting for assigned class succeeds; unassigned class fails
  it('ATT-029: rejects sync item for unassigned class with UNASSIGNED_CLASS_TEACHER', () => {
    const date = '2026-05-09';
    const fp = getValidFingerprint(fixture.testClassB.id, 1, date);

    const item = {
      classId: fixture.testClassB.id, // Class Teacher is assigned to Class A, not B
      date,
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentB.id, status: 'present', remarks: null }]
    };

    const result = processSyncBatch(db, fixture.classTeacher, [item]);
    assert.strictEqual(result.results[0].status, 'rejected');
    assert.strictEqual(result.results[0].code, 'UNASSIGNED_CLASS_TEACHER');
  });

  // ATT-030: Sync receipt stored in attendance_sync_receipts table
  it('ATT-030: persists receipt with payload hash and resulting revision in attendance_sync_receipts', () => {
    const date = '2026-05-10';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);
    const mutationId = crypto.randomUUID();

    const item = {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: mutationId,
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    };

    processSyncBatch(db, fixture.classTeacher, [item]);

    const receipt = db.prepare('SELECT * FROM attendance_sync_receipts WHERE client_mutation_id = ?').get(mutationId) as any;
    assert(receipt !== undefined);
    assert.strictEqual(receipt.user_id, fixture.classTeacher.id);
    assert.strictEqual(receipt.resulting_revision, 1);
    assert(receipt.payload_hash.length === 64);
  });

  // ATT-048: Roster fingerprint mismatch inside sync batch returns conflicted
  it('ATT-048: rejects sync item with stale roster fingerprint with ROSTER_FINGERPRINT_MISMATCH', () => {
    const date = '2026-05-11';
    const staleFp = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';

    const item = {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: staleFp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    };

    const result = processSyncBatch(db, fixture.classTeacher, [item]);
    assert.strictEqual(result.results[0].status, 'conflicted');
    assert.strictEqual(result.results[0].code, 'ROSTER_FINGERPRINT_MISMATCH');
  });

  // ATT-049: Foreign student injection inside sync batch returns rejected
  it('ATT-049: rejects foreign student record inside sync batch with FOREIGN_STUDENT_ENROLMENT', () => {
    const date = '2026-05-12';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    const item = {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: 88888, status: 'present', remarks: null }]
    };

    const result = processSyncBatch(db, fixture.classTeacher, [item]);
    assert.strictEqual(result.results[0].status, 'rejected');
    assert.strictEqual(result.results[0].code, 'FOREIGN_STUDENT_ENROLMENT');
  });

  // ATT-050: Bounded batch size handling
  it('ATT-050: handles multiple independent items in a single sync batch correctly', () => {
    const items: any[] = [];
    for (let day = 13; day <= 17; day++) {
      const date = `2026-05-${day}`;
      const fp = getValidFingerprint(fixture.testClassA.id, 1, date);
      items.push({
        classId: fixture.testClassA.id,
        date,
        mode: 'submitted',
        baseRevision: 0,
        clientMutationId: crypto.randomUUID(),
        rosterFingerprint: fp,
        notes: `Day ${day}`,
        records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
      });
    }

    const result = processSyncBatch(db, fixture.classTeacher, items);
    assert.strictEqual(result.processedCount, 5);
    for (const r of result.results) {
      assert.strictEqual(r.status, 'applied');
    }

    const count = db.prepare("SELECT COUNT(*) as count FROM attendance_sessions WHERE date BETWEEN '2026-05-13' AND '2026-05-17'").get() as { count: number };
    assert.strictEqual(count.count, 5);
  });
});
