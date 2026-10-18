import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { runMigration004 } from '../src/db/migrations/004_attendance_integrity.js';
import {
  processAttendanceSubmission,
  getAttendanceSessionWithRoster,
  computeServerRosterFingerprint,
  AttendanceServiceError
} from '../src/services/attendanceService.js';
import { validateAttendancePayload } from '../src/validation/attendanceValidation.js';

describe('PR-004 Stage 3: Attendance Integrity & Atomic Submission Tests (ATT-001 - ATT-022)', () => {
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
      // Ignore close errors
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

  // ATT-001: Legacy payload without concurrency metadata rejected with 400
  it('ATT-001: rejects legacy payload lacking V2 concurrency metadata with 400 LEGACY_PAYLOAD_UNSUPPORTED', () => {
    const legacyPayload = {
      classId: fixture.testClassA.id,
      date: '2026-03-02',
      records: [{ student_id: fixture.studentA.id, status: 'present' }]
    };

    const val = validateAttendancePayload(legacyPayload);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.error?.status, 400);
    assert.strictEqual(val.error?.code, 'LEGACY_PAYLOAD_UNSUPPORTED');
  });

  // ATT-002: Cross-class student injection blocked with 422
  it('ATT-002: blocks cross-class student injection with 422 FOREIGN_STUDENT_ENROLMENT', () => {
    const date = '2026-03-02';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    const payload = {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft' as const,
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [
        { student_id: fixture.studentA.id, status: 'present' as const, remarks: null },
        { student_id: fixture.studentB.id, status: 'present' as const, remarks: null } // Student B is enrolled in Class B!
      ]
    };

    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, payload);
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 422);
        assert.strictEqual(err.problemDetails.code, 'FOREIGN_STUDENT_ENROLMENT');
        return true;
      }
    );
  });

  // ATT-003: Zero-write transactional rollback on single invalid record
  it('ATT-003: guarantees zero-write rollback when a submission contains an invalid foreign student', () => {
    const date = '2026-03-03';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    const payload = {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft' as const,
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [
        { student_id: fixture.studentA.id, status: 'present' as const, remarks: null },
        { student_id: 99999, status: 'present' as const, remarks: null } // Non-existent student
      ]
    };

    try {
      processAttendanceSubmission(db, fixture.classTeacher, payload);
      assert.fail('Should have thrown an error');
    } catch (err: any) {
      assert(err instanceof AttendanceServiceError);
    }

    // Verify ZERO writes occurred
    const session = db.prepare('SELECT id FROM attendance_sessions WHERE class_id = ? AND date = ?').get(fixture.testClassA.id, date);
    assert.strictEqual(session, undefined);

    const records = db.prepare('SELECT COUNT(*) as count FROM attendance_records').get() as { count: number };
    assert.strictEqual(records.count, 0);
  });

  // ATT-004: In-transaction account status revalidation
  it('ATT-004: revalidates active account inside transaction and rejects deactivated users with 401', () => {
    const date = '2026-03-04';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    const payload = {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft' as const,
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present' as const, remarks: null }]
    };

    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.deactivatedUser, payload);
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 401);
        assert.strictEqual(err.problemDetails.code, 'ACCOUNT_DEACTIVATED');
        return true;
      }
    );
  });

  // ATT-005: In-transaction class teacher permission revalidation
  it('ATT-005: revalidates class teacher authorization inside transaction and rejects unassigned teacher with 403', () => {
    const date = '2026-03-05';
    // Class Teacher is assigned to Class A, NOT Class B
    const fp = getValidFingerprint(fixture.testClassB.id, 1, date);

    const payload = {
      classId: fixture.testClassB.id,
      date,
      mode: 'draft' as const,
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentB.id, status: 'present' as const, remarks: null }]
    };

    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, payload);
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 403);
        assert.strictEqual(err.problemDetails.code, 'UNASSIGNED_CLASS_TEACHER');
        return true;
      }
    );
  });

  // ATT-006: Academic-year date boundary enforcement
  it('ATT-006: rejects dates outside the academic year boundary with 422 DATE_OUTSIDE_ACADEMIC_YEAR', () => {
    const outOfBoundsDate = '2025-12-31'; // Academic year 2026-TEST starts 2026-01-01
    const fp = getValidFingerprint(fixture.testClassA.id, 1, outOfBoundsDate);

    const payload = {
      classId: fixture.testClassA.id,
      date: outOfBoundsDate,
      mode: 'draft' as const,
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present' as const, remarks: null }]
    };

    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, payload);
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 422);
        assert.strictEqual(err.problemDetails.code, 'DATE_OUTSIDE_ACADEMIC_YEAR');
        return true;
      }
    );
  });

  // ATT-007: Server-calculated roster fingerprint mismatch detection
  it('ATT-007: rejects stale client roster fingerprint with 409 ROSTER_FINGERPRINT_MISMATCH', () => {
    const date = '2026-03-06';
    const staleFp = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

    const payload = {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft' as const,
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: staleFp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present' as const, remarks: null }]
    };

    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, payload);
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 409);
        assert.strictEqual(err.problemDetails.code, 'ROSTER_FINGERPRINT_MISMATCH');
        return true;
      }
    );
  });

  // ATT-008: Idempotency replay with exact same mutation ID and payload
  it('ATT-008: replays identical mutation ID and payload idempotently without duplicating session or revision', () => {
    const date = '2026-03-07';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);
    const mutationId = crypto.randomUUID();

    const payload = {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted' as const,
      baseRevision: 0,
      clientMutationId: mutationId,
      rosterFingerprint: fp,
      notes: 'First submission',
      records: [{ student_id: fixture.studentA.id, status: 'present' as const, remarks: null }]
    };

    const firstResult = processAttendanceSubmission(db, fixture.classTeacher, payload);
    assert.strictEqual(firstResult.status, 'applied');
    assert.strictEqual(firstResult.revision, 1);

    // Replay with exact same mutationId & payload
    const secondResult = processAttendanceSubmission(db, fixture.classTeacher, payload);
    assert.strictEqual(secondResult.status, 'replayed');
    assert.strictEqual(secondResult.revision, 1);
    assert.strictEqual(secondResult.sessionId, firstResult.sessionId);

    // Verify only 1 session exists
    const sessions = db.prepare('SELECT COUNT(*) as count FROM attendance_sessions WHERE class_id = ? AND date = ?').get(fixture.testClassA.id, date) as { count: number };
    assert.strictEqual(sessions.count, 1);
  });

  // ATT-008B (PR-004S): Idempotent replay succeeds even after subsequent student enrollment changes roster fingerprint
  it('ATT-008B (PR-004S): replays committed mutation idempotently even after subsequent student enrollment changes roster fingerprint', () => {
    const date = '2026-03-07';
    const oldFp = getValidFingerprint(fixture.testClassA.id, 1, date);
    const mutationId = crypto.randomUUID();

    const payload = {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted' as const,
      baseRevision: 0,
      clientMutationId: mutationId,
      rosterFingerprint: oldFp,
      notes: 'Initial register taken before student transfer',
      records: [{ student_id: fixture.studentA.id, status: 'present' as const, remarks: null }]
    };

    // 1. First submission commits successfully
    const firstResult = processAttendanceSubmission(db, fixture.classTeacher, payload);
    assert.strictEqual(firstResult.status, 'applied');
    assert.strictEqual(firstResult.revision, 1);

    // 2. Intervening event: A new student is admitted to Class A
    const newStudentResult = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status)
      VALUES ('KCC-2026-NEW99', 'New Admitted Pupil', 'Pupil', '2010-05-15', 'Male', 'Guardian Name', 'Father', '0771234567', 'Active')
    `).run();
    const newStudentId = Number(newStudentResult.lastInsertRowid);

    db.prepare(`
      INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status)
      VALUES (?, ?, 1, 99, 'enrolled')
    `).run(newStudentId, fixture.testClassA.id);

    // 3. Verify server fingerprint has genuinely changed due to new enrollment
    const newServerFp = getValidFingerprint(fixture.testClassA.id, 1, date);
    assert.notStrictEqual(newServerFp, oldFp);

    // 4. Exact retry of committed mutation with OLD fingerprint must succeed with 'replayed' (NOT 409)
    const replayedResult = processAttendanceSubmission(db, fixture.classTeacher, payload);
    assert.strictEqual(replayedResult.status, 'replayed');
    assert.strictEqual(replayedResult.revision, 1);
    assert.strictEqual(replayedResult.sessionId, firstResult.sessionId);

    // 5. Conversely, a NEW mutation with the old fingerprint must still be rejected with 409
    const newPayload = {
      ...payload,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: oldFp // Stale fingerprint on new write
    };
    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, newPayload);
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 409);
        assert.strictEqual(err.problemDetails.code, 'ROSTER_FINGERPRINT_MISMATCH');
        return true;
      }
    );
  });

  // ATT-009: Idempotency key reuse with differing payload rejected with 409
  it('ATT-009: rejects mutation ID reuse with altered payload with 409 IDEMPOTENCY_KEY_REUSE', () => {
    const date = '2026-03-08';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);
    const mutationId = crypto.randomUUID();

    const payload1 = {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted' as const,
      baseRevision: 0,
      clientMutationId: mutationId,
      rosterFingerprint: fp,
      notes: 'Initial notes',
      records: [{ student_id: fixture.studentA.id, status: 'present' as const, remarks: null }]
    };

    processAttendanceSubmission(db, fixture.classTeacher, payload1);

    // Same mutationId, altered notes
    const payload2 = {
      ...payload1,
      notes: 'Altered notes trying to hijack mutation ID'
    };

    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, payload2);
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 409);
        assert.strictEqual(err.problemDetails.code, 'IDEMPOTENCY_KEY_REUSE');
        return true;
      }
    );
  });

  // ATT-010: Idempotency key replay by different user rejected with 403
  it('ATT-010: rejects mutation replay under a different user with 403 ACTOR_IDEMPOTENCY_MISMATCH', () => {
    const date = '2026-03-09';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);
    const mutationId = crypto.randomUUID();

    const payload = {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted' as const,
      baseRevision: 0,
      clientMutationId: mutationId,
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present' as const, remarks: null }]
    };

    processAttendanceSubmission(db, fixture.classTeacher, payload);

    // Admin attempts to replay class teacher's mutation ID
    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.adminUser, payload);
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 403);
        assert.strictEqual(err.problemDetails.code, 'ACTOR_IDEMPOTENCY_MISMATCH');
        return true;
      }
    );
  });

  // ATT-011: First session write requires baseRevision = 0
  it('ATT-011: requires baseRevision = 0 for initial session creation', () => {
    const date = '2026-03-10';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    const payload = {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft' as const,
      baseRevision: 1, // Non-zero for non-existent session
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present' as const, remarks: null }]
    };

    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, payload);
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 409);
        assert.strictEqual(err.problemDetails.code, 'ATTENDANCE_CONCURRENCY_CONFLICT');
        return true;
      }
    );
  });

  // ATT-012: Concurrency revision mismatch rejected with 409
  it('ATT-012: rejects updates where baseRevision does not match server revision with 409', () => {
    const date = '2026-03-11';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    // Create session at revision 1
    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    // Update with stale baseRevision = 0 (server is at revision 1)
    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, {
          classId: fixture.testClassA.id,
          date,
          mode: 'draft',
          baseRevision: 0, // Stale!
          clientMutationId: crypto.randomUUID(),
          rosterFingerprint: fp,
          notes: 'Stale update',
          records: [{ student_id: fixture.studentA.id, status: 'absent', remarks: null }]
        });
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 409);
        assert.strictEqual(err.problemDetails.code, 'ATTENDANCE_CONCURRENCY_CONFLICT');
        return true;
      }
    );
  });

  // ATT-013: Revision increments monotonically on successive updates
  it('ATT-013: increments revision monotonically from 1 to 2 to 3 on successful updates', () => {
    const date = '2026-03-12';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    const res1 = processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: 'Rev 1',
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });
    assert.strictEqual(res1.revision, 1);

    const res2 = processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft',
      baseRevision: 1,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: 'Rev 2',
      records: [{ student_id: fixture.studentA.id, status: 'late', remarks: 'Late arrival' }]
    });
    assert.strictEqual(res2.revision, 2);

    const res3 = processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 2,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: 'Final Rev 3',
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });
    assert.strictEqual(res3.revision, 3);
  });

  // ATT-014: Submitted finalized register cannot be downgraded to draft
  it('ATT-014: rejects downgrading a submitted register to draft with 422 CANNOT_REVERT_SUBMITTED_TO_DRAFT', () => {
    const date = '2026-03-13';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: 'Submitted',
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, {
          classId: fixture.testClassA.id,
          date,
          mode: 'draft', // Attempt downgrade
          baseRevision: 1,
          clientMutationId: crypto.randomUUID(),
          rosterFingerprint: fp,
          notes: 'Try downgrade',
          records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
        });
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 422);
        assert.strictEqual(err.problemDetails.code, 'CANNOT_REVERT_SUBMITTED_TO_DRAFT');
        return true;
      }
    );
  });

  // ATT-015: Submitted register requires 100% complete roster records
  it('ATT-015: rejects incomplete records on submitted register with 422 INCOMPLETE_SUBMITTED_ROSTER', () => {
    // Enroll a second student in Class A
    const stu2Res = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status)
      VALUES ('SYNTH-003', 'Student Three', 'Three', '2012-01-01', 'Male', 'G', 'F', '0770000000', 'Active')
    `).run();
    const stu2Id = Number(stu2Res.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, 1, ?)').run(stu2Id, fixture.testClassA.id, 'enrolled');

    const date = '2026-03-14';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    // Only 1 record provided out of 2 enrolled students
    assert.throws(
      () => {
        processAttendanceSubmission(db, fixture.classTeacher, {
          classId: fixture.testClassA.id,
          date,
          mode: 'submitted',
          baseRevision: 0,
          clientMutationId: crypto.randomUUID(),
          rosterFingerprint: fp,
          notes: null,
          records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
        });
      },
      (err: any) => {
        assert(err instanceof AttendanceServiceError);
        assert.strictEqual(err.problemDetails.status, 422);
        assert.strictEqual(err.problemDetails.code, 'INCOMPLETE_SUBMITTED_ROSTER');
        return true;
      }
    );
  });

  // ATT-016: Draft register allows partial records (unmarked allowed)
  it('ATT-016: allows partial records in draft mode without error', () => {
    // Two students enrolled in Class A
    const stu2Res = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status)
      VALUES ('SYNTH-004', 'Student Four', 'Four', '2012-01-01', 'Male', 'G', 'F', '0770000000', 'Active')
    `).run();
    const stu2Id = Number(stu2Res.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, 1, ?)').run(stu2Id, fixture.testClassA.id, 'enrolled');

    const date = '2026-03-15';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    // Only provide studentA in draft
    const res = processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: 'Partial draft',
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    assert.strictEqual(res.status, 'applied');
    assert.strictEqual(res.mode, 'draft');
    assert.strictEqual(res.recordsCount, 1);
  });

  // ATT-017: Snapshot reconciliation guard preserves historical attendance records of transferred pupils
  it('ATT-017: preserves historical records of transferred pupils during snapshot reconciliation', () => {
    // 1. Student A is recorded present on 2026-03-16
    const date = '2026-03-16';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    // 2. Student A transfers out of Class A mid-year
    db.prepare("UPDATE enrollments SET status = 'transferred' WHERE student_id = ? AND class_id = ?").run(fixture.studentA.id, fixture.testClassA.id);

    // 3. Student C is enrolled into Class A
    const stuCRes = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status)
      VALUES ('SYNTH-005', 'Student Charlie', 'Charlie', '2012-01-01', 'Male', 'G', 'F', '0770000000', 'Active')
    `).run();
    const stuCId = Number(stuCRes.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, 1, ?)').run(stuCId, fixture.testClassA.id, 'enrolled');

    // 4. An admin modifies the session for 2026-03-16 supplying ONLY Student C
    const newFp = getValidFingerprint(fixture.testClassA.id, 1, date);
    processAttendanceSubmission(db, fixture.adminUser, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 1,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: newFp,
      notes: 'Updated after transfer',
      records: [{ student_id: stuCId, status: 'present', remarks: null }]
    });

    // 5. Verify Student A's historical record was NOT deleted by snapshot reconciliation
    const studentARecord = db.prepare(`
      SELECT ar.* FROM attendance_records ar
      JOIN attendance_sessions sess ON ar.session_id = sess.id
      WHERE sess.class_id = ? AND sess.date = ? AND ar.student_id = ?
    `).get(fixture.testClassA.id, date, fixture.studentA.id);

    assert(studentARecord !== undefined, 'Transferred student record must NOT be deleted by reconciliation');
  });

  // ATT-018: In-transaction fail-closed audit logging
  it('ATT-018: writes fail-closed audit log inside the attendance transaction', () => {
    const date = '2026-03-17';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    const auditEntry = db.prepare(`
      SELECT * FROM audit_logs WHERE action = 'ATTENDANCE_SUBMIT' ORDER BY id DESC LIMIT 1
    `).get() as any;

    assert(auditEntry !== undefined);
    assert.strictEqual(auditEntry.user_id, fixture.classTeacher.id);
    assert.strictEqual(auditEntry.username, fixture.classTeacher.username);
    assert.strictEqual(auditEntry.entity_type, 'attendance_sessions');
  });

  // ATT-019: GET /session returns server fingerprint and current revision
  it('ATT-019: getAttendanceSessionWithRoster returns current server fingerprint and revision', () => {
    const date = '2026-03-18';
    const sessionData = getAttendanceSessionWithRoster(db, fixture.classTeacher, fixture.testClassA.id, date);

    assert.strictEqual(sessionData.session, null);
    assert.strictEqual(sessionData.serverRevision, 0);
    assert(sessionData.rosterFingerprint.startsWith('sha256:'));
    assert.strictEqual(sessionData.students.length, 1);
    assert.strictEqual(sessionData.summary.unmarked, 1);
  });

  // ATT-020: GET /session preserves historical transferred pupils
  it('ATT-020: getAttendanceSessionWithRoster includes historical transferred students who have existing records', () => {
    const date = '2026-03-19';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    // Transfer Student A out
    db.prepare("UPDATE enrollments SET status = 'transferred' WHERE student_id = ?").run(fixture.studentA.id);

    const sessionData = getAttendanceSessionWithRoster(db, fixture.classTeacher, fixture.testClassA.id, date);
    const found = sessionData.students.find((s: any) => s.student_id === fixture.studentA.id);
    assert(found !== undefined, 'Transferred student must still appear in historical session roster');
    assert.strictEqual(found.attendance_status, 'present');
  });

  // ATT-021: Daily attendance report reflects active enrollments and session status accurately
  it('ATT-021: accurately aggregates class attendance in daily report', () => {
    const date = '2026-03-20';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    const report = db.prepare(`
      SELECT 
        c.id as class_id,
        sess.status as session_status,
        COUNT(DISTINCT CASE WHEN e.status = 'enrolled' AND s.status = 'Active' THEN e.student_id END) as enrolled_count,
        COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.student_id END) as present_count
      FROM classes c
      LEFT JOIN enrollments e ON e.class_id = c.id AND e.academic_year_id = c.academic_year_id AND e.status = 'enrolled'
      LEFT JOIN students s ON e.student_id = s.id AND s.status = 'Active'
      LEFT JOIN attendance_sessions sess ON sess.class_id = c.id AND sess.date = ?
      LEFT JOIN attendance_records ar ON ar.session_id = sess.id AND ar.student_id = e.student_id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(date, fixture.testClassA.id) as any;

    assert.strictEqual(report.session_status, 'submitted');
    assert.strictEqual(report.enrolled_count, 1);
    assert.strictEqual(report.present_count, 1);
  });

  // ATT-022: Monthly attendance grid report shows attendance statuses across dates
  it('ATT-022: provides monthly attendance records per enrolled student', () => {
    const dates = ['2026-03-21', '2026-03-22'];
    for (const d of dates) {
      const fp = getValidFingerprint(fixture.testClassA.id, 1, d);
      processAttendanceSubmission(db, fixture.classTeacher, {
        classId: fixture.testClassA.id,
        date: d,
        mode: 'submitted',
        baseRevision: 0,
        clientMutationId: crypto.randomUUID(),
        rosterFingerprint: fp,
        notes: null,
        records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
      });
    }

    const records = db.prepare(`
      SELECT ar.student_id, ar.status, sess.date
      FROM attendance_records ar
      JOIN attendance_sessions sess ON ar.session_id = sess.id
      WHERE sess.class_id = ? AND sess.date LIKE '2026-03%'
      ORDER BY sess.date ASC
    `).all(fixture.testClassA.id) as any[];

    assert.strictEqual(records.length, 2);
    assert.strictEqual(records[0].date, '2026-03-21');
    assert.strictEqual(records[1].date, '2026-03-22');
  });
});
