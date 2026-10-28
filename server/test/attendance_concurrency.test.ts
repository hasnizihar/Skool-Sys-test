import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { runMigration004 } from '../src/db/migrations/004_attendance_integrity.js';
import {
  processAttendanceSubmission,
  computeServerRosterFingerprint,
  AttendanceServiceError
} from '../src/services/attendanceService.js';
import { computeCanonicalPayloadHash } from '../src/validation/attendanceValidation.js';

describe('PR-004 Concurrency & Contention Tests (ATT-038, ATT-057, ATT-060)', () => {
  let fixture: TestFixtureData;
  let db1: DatabaseSync;
  let db2: DatabaseSync;

  beforeEach(() => {
    fixture = setupIsolatedTestDb();

    // Connection 1
    db1 = new DatabaseSync(fixture.dbPath);
    db1.exec('PRAGMA journal_mode = WAL;');
    db1.exec('PRAGMA busy_timeout = 5000;');
    runMigration004(db1);

    // Connection 2 (Simulating a second independent worker/connection)
    db2 = new DatabaseSync(fixture.dbPath);
    db2.exec('PRAGMA journal_mode = WAL;');
    db2.exec('PRAGMA busy_timeout = 5000;');
  });

  afterEach(() => {
    try {
      db1.close();
    } catch {
      // Ignore
    }
    try {
      db2.close();
    } catch {
      // Ignore
    }
    teardownIsolatedTestDb(fixture.dbPath);
  });

  function getValidFingerprint(dbInstance: DatabaseSync, classId: number, academicYearId: number, dateStr: string) {
    const students = dbInstance.prepare(`
      SELECT s.id, s.admission_no, s.status as student_status
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      WHERE e.class_id = ? AND e.academic_year_id = ? AND e.status = 'enrolled' AND s.status = 'Active'
      ORDER BY s.id ASC
    `).all(classId, academicYearId) as Array<{ id: number; admission_no: string; student_status: string }>;

    return computeServerRosterFingerprint(classId, academicYearId, dateStr, students);
  }

  // ATT-038: Multi-connection SQLite write contention
  it('ATT-038: handles multi-connection write lock contention gracefully without SQLITE_BUSY crash', () => {
    const date1 = '2026-04-01';
    const date2 = '2026-04-02';

    const fp1 = getValidFingerprint(db1, fixture.testClassA.id, 1, date1);
    const fp2 = getValidFingerprint(db2, fixture.testClassA.id, 1, date2);

    // Write on connection 1
    const res1 = processAttendanceSubmission(db1, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date: date1,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp1,
      notes: 'Written from db1',
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    // Write on connection 2 immediately afterwards on same DB file in WAL mode
    const res2 = processAttendanceSubmission(db2, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date: date2,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp2,
      notes: 'Written from db2',
      records: [{ student_id: fixture.studentA.id, status: 'absent', remarks: null }]
    });

    assert.strictEqual(res1.status, 'applied');
    assert.strictEqual(res2.status, 'applied');

    // Both sessions should be visible from both connections
    const sessionCount = db1.prepare('SELECT COUNT(*) as count FROM attendance_sessions').get() as { count: number };
    assert.strictEqual(sessionCount.count, 2);
  });

  // ATT-057: Deterministic canonical payload hashing
  it('ATT-057: computeCanonicalPayloadHash is deterministic regardless of object key order', () => {
    const payloadA: any = {
      classId: 1,
      date: '2026-04-05',
      mode: 'draft',
      baseRevision: 2,
      clientMutationId: '00000000-0000-0000-0000-000000000001',
      rosterFingerprint: 'sha256:abc',
      notes: 'Test',
      records: [
        { student_id: 10, status: 'present', remarks: 'Good' },
        { student_id: 5, status: 'absent', remarks: null }
      ]
    };

    // Reordered keys in outer payload and in records
    const payloadB: any = {
      notes: 'Test',
      records: [
        { remarks: null, status: 'absent', student_id: 5 },
        { status: 'present', remarks: 'Good', student_id: 10 }
      ],
      clientMutationId: '00000000-0000-0000-0000-000000000001',
      rosterFingerprint: 'sha256:abc',
      mode: 'draft',
      date: '2026-04-05',
      baseRevision: 2,
      classId: 1
    };

    const hashA = computeCanonicalPayloadHash(payloadA);
    const hashB = computeCanonicalPayloadHash(payloadB);

    assert.strictEqual(hashA, hashB, 'Hashes must be identical regardless of property ordering');
  });

  // ATT-060: Revision conflict race condition test
  it('ATT-060: detects revision conflict race condition when two concurrent clients submit against same base revision', () => {
    const date = '2026-04-06';
    const fp = getValidFingerprint(db1, fixture.testClassA.id, 1, date);

    // Initial session created at revision 1
    const initRes = processAttendanceSubmission(db1, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: 'Initial session',
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });
    assert.strictEqual(initRes.revision, 1);

    // Client 1 (Teacher on Device 1 via db1) updates basing on revision 1 -> advances to revision 2
    const client1Res = processAttendanceSubmission(db1, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft',
      baseRevision: 1,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: 'Update from Client 1',
      records: [{ student_id: fixture.studentA.id, status: 'late', remarks: 'Arrived at 8:15' }]
    });
    assert.strictEqual(client1Res.status, 'applied');
    assert.strictEqual(client1Res.revision, 2);

    // Client 2 (Principal/Admin on Device 2 via db2) attempts to submit also basing on revision 1
    assert.throws(
      () => {
        processAttendanceSubmission(db2, fixture.adminUser, {
          classId: fixture.testClassA.id,
          date,
          mode: 'submitted',
          baseRevision: 1, // Stale baseRevision! Server is now at 2
          clientMutationId: crypto.randomUUID(),
          rosterFingerprint: fp,
          notes: 'Concurrent update from Client 2',
          records: [{ student_id: fixture.studentA.id, status: 'excused', remarks: 'Sports meet' }]
        });
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 409);
        assert.strictEqual(err.problemDetails.code, 'ATTENDANCE_CONCURRENCY_CONFLICT');
        return true;
      }
    );

    // Verify session remained at revision 2 and has Client 1's record
    const finalSession = db1.prepare('SELECT revision, notes FROM attendance_sessions WHERE class_id = ? AND date = ?').get(fixture.testClassA.id, date) as any;
    assert.strictEqual(finalSession.revision, 2);
    assert.strictEqual(finalSession.notes, 'Update from Client 1');
  });
});
