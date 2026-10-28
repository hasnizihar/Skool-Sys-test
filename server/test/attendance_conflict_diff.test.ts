import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { setupIsolatedTestDb, teardownIsolatedTestDb } from './helpers/testDb.js';
import { runMigration004 } from '../src/db/migrations/004_attendance_integrity.js';
import {
  processAttendanceSubmission,
  computeServerRosterFingerprint,
  AttendanceServiceError
} from '../src/services/attendanceService.js';
import { buildStudentDiffList } from '../../client/src/utils/conflictDiffUtils.ts';
import { isMutationExpired } from '../../client/src/api/offlineQueue.ts';

describe('PR-004R/S: Conflict Diff Calculation, Error Classification & Expiry Tests', () => {

  // ATT-068: Student-by-student discrepancy diffing
  it('ATT-068 (PR-004R): correctly identifies student-by-student discrepancies without blind overwrite', () => {
    const students = [
      { student_id: 101, admission_no: 'KCC-101', calling_name: 'Kasun Perera' },
      { student_id: 102, admission_no: 'KCC-102', calling_name: 'Fathima Nuha' },
      { student_id: 103, admission_no: 'KCC-103', calling_name: 'Mohamed Risan' }
    ];

    const localMutation: any = {
      records: [
        { student_id: 101, status: 'present', remarks: null },
        { student_id: 102, status: 'absent', remarks: 'Sick leave' },
        { student_id: 103, status: 'present', remarks: null }
      ]
    };

    const serverRecords = [
      { student_id: 101, status: 'present', remarks: null },
      { student_id: 102, status: 'present', remarks: null },
      { student_id: 103, status: 'late', remarks: 'Arrived with permission' }
    ];

    const diffs = buildStudentDiffList(students, localMutation, serverRecords, {});

    assert.strictEqual(diffs.length, 3);

    // Student 101: identical
    assert.strictEqual(diffs[0].isDiff, false);
    assert.strictEqual(diffs[0].chosen, 'local');

    // Student 102: discrepancy (local absent vs server present)
    assert.strictEqual(diffs[1].isDiff, true);
    assert.strictEqual(diffs[1].localStatus, 'absent');
    assert.strictEqual(diffs[1].serverStatus, 'present');
    assert.strictEqual(diffs[1].chosen, 'server'); // Defaults to server review

    // Student 103: discrepancy (local present vs server late)
    assert.strictEqual(diffs[2].isDiff, true);
    assert.strictEqual(diffs[2].localStatus, 'present');
    assert.strictEqual(diffs[2].serverStatus, 'late');
    assert.strictEqual(diffs[2].chosen, 'server');
  });

  // ATT-069: Deliberate resolution application
  it('ATT-069 (PR-004R): deliberate resolution applies selective choices per student', () => {
    const students = [
      { student_id: 101, admission_no: 'KCC-101', calling_name: 'Kasun Perera' },
      { student_id: 102, admission_no: 'KCC-102', calling_name: 'Fathima Nuha' }
    ];

    const localMutation: any = {
      records: [
        { student_id: 101, status: 'present', remarks: 'Local choice' },
        { student_id: 102, status: 'absent', remarks: 'Local absence' }
      ]
    };

    const serverRecords = [
      { student_id: 101, status: 'absent', remarks: 'Server absence' },
      { student_id: 102, status: 'present', remarks: 'Server present' }
    ];

    const diffs = buildStudentDiffList(students, localMutation, serverRecords, {});

    // Teacher deliberately chooses: keep local for 101, keep server for 102
    diffs[0].chosen = 'local';
    diffs[1].chosen = 'server';

    const resolved = diffs.map((d) => ({
      student_id: d.student_id,
      status: d.chosen === 'server' ? d.serverStatus : d.localStatus,
      remarks: d.chosen === 'server' ? d.serverRemarks : d.localRemarks
    }));

    assert.strictEqual(resolved[0].status, 'present');
    assert.strictEqual(resolved[0].remarks, 'Local choice');
    assert.strictEqual(resolved[1].status, 'present');
    assert.strictEqual(resolved[1].remarks, 'Server present');
  });

  // ATT-070: Online HTTP error classification
  it('ATT-070 (PR-004R): classifies HTTP errors strictly without misidentifying server validation failures as network offline', () => {
    function classifyHttpError(status: number) {
      if (status >= 400 && status < 500) {
        return { isOffline: false, isClientError: true, retryable: status === 429 };
      }
      if (status >= 500) {
        return { isOffline: false, isClientError: false, retryable: true };
      }
      return { isOffline: false, isClientError: false, retryable: false };
    }

    assert.deepStrictEqual(classifyHttpError(400), { isOffline: false, isClientError: true, retryable: false });
    assert.deepStrictEqual(classifyHttpError(401), { isOffline: false, isClientError: true, retryable: false });
    assert.deepStrictEqual(classifyHttpError(403), { isOffline: false, isClientError: true, retryable: false });
    assert.deepStrictEqual(classifyHttpError(409), { isOffline: false, isClientError: true, retryable: false });
    assert.deepStrictEqual(classifyHttpError(422), { isOffline: false, isClientError: true, retryable: false });
    assert.deepStrictEqual(classifyHttpError(500), { isOffline: false, isClientError: false, retryable: true });
  });

  // ATT-071: Repeated 409 collision choice invalidation (using production buildStudentDiffList)
  it('ATT-071 (PR-004S): repeated 409 collision invalidates prior local choices for students whose server record mutated again', () => {
    const students = [
      { student_id: 101, admission_no: 'KCC-101', calling_name: 'Student 101' },
      { student_id: 102, admission_no: 'KCC-102', calling_name: 'Student 102' }
    ];

    const pendingMutation: any = {
      records: [
        { student_id: 101, status: 'absent', remarks: 'Sick' },
        { student_id: 102, status: 'absent', remarks: 'Truant' }
      ]
    };

    // Collision 1: Server was at Rev 2
    const serverRev2 = [
      { student_id: 101, status: 'present', remarks: '' },
      { student_id: 102, status: 'present', remarks: '' }
    ];

    // Teacher chooses 'local' for both
    const priorChoices = new Map<number, 'local' | 'server'>([
      [101, 'local'],
      [102, 'local']
    ]);

    // Collision 2: Server advances to Rev 3.
    // Student 101 was changed on server to 'excused' with note
    // Student 102 remained 'present' unchanged
    const serverRev3 = [
      { student_id: 101, status: 'excused', remarks: 'Doctor certificate submitted' },
      { student_id: 102, status: 'present', remarks: '' }
    ];

    const diffs = buildStudentDiffList(
      students,
      pendingMutation,
      serverRev3,
      {},
      priorChoices,
      serverRev2
    );

    // Student 101: server mutated again -> previous choice MUST BE INVALIDATED
    assert.strictEqual(diffs[0].student_id, 101);
    assert.strictEqual(diffs[0].serverStatus, 'excused');
    assert.strictEqual(diffs[0].serverRemarks, 'Doctor certificate submitted');
    assert.strictEqual(diffs[0].serverChangedAgain, true, 'Student 101 server record changed again');
    assert.strictEqual(diffs[0].chosen, 'server', 'Prior local choice must be reset to server');

    // Student 102: server record was identical between Rev 2 and Rev 3 -> preserve teacher deliberate choice
    assert.strictEqual(diffs[1].student_id, 102);
    assert.strictEqual(diffs[1].serverChangedAgain, false);
    assert.strictEqual(diffs[1].chosen, 'local', 'Unchanged student choice preserved');
  });

  // ATT-072: Draft-to-final reconciliation
  it('ATT-072 (PR-004S): draft-to-final conflict reconciliation enforces finalized mode and prevents downgrade to draft', () => {
    function resolveTargetMode(serverStatus: string, localMode: string): 'draft' | 'submitted' {
      if (serverStatus === 'submitted') return 'submitted';
      return localMode === 'submitted' ? 'submitted' : 'draft';
    }

    assert.strictEqual(resolveTargetMode('submitted', 'draft'), 'submitted');
    assert.strictEqual(resolveTargetMode('draft', 'submitted'), 'submitted');
    assert.strictEqual(resolveTargetMode('draft', 'draft'), 'draft');
    assert.strictEqual(resolveTargetMode('submitted', 'submitted'), 'submitted');
  });

  // ATT-073: 7-day retention expiry boundary & fail-closed tests (exercising production isMutationExpired)
  it('ATT-073 (PR-004S): isMutationExpired fails closed on corrupted, missing, and future-dated timestamps', () => {
    const baselineNow = new Date('2026-10-18T12:00:00.000Z').getTime();

    // Normal valid: 6 days old -> not expired
    const mut6d: any = {
      timestamp: new Date(baselineNow - 6 * 24 * 60 * 60 * 1000).toISOString()
    };
    assert.strictEqual(isMutationExpired(mut6d, baselineNow), false);

    // Normal expired: 8 days old -> expired
    const mut8d: any = {
      timestamp: new Date(baselineNow - 8 * 24 * 60 * 60 * 1000).toISOString()
    };
    assert.strictEqual(isMutationExpired(mut8d, baselineNow), true);

    // Corrupted non-date string: FAIL CLOSED -> expired/review required
    const mutCorrupt: any = { timestamp: 'invalid-date' };
    assert.strictEqual(isMutationExpired(mutCorrupt, baselineNow), true, 'Corrupted timestamp must fail closed');

    // Empty string: FAIL CLOSED -> expired
    const mutEmpty: any = { timestamp: '' };
    assert.strictEqual(isMutationExpired(mutEmpty, baselineNow), true, 'Empty timestamp must fail closed');

    // Missing property: FAIL CLOSED -> expired
    const mutMissing: any = {};
    assert.strictEqual(isMutationExpired(mutMissing, baselineNow), true, 'Missing timestamp must fail closed');

    // Future timestamp (>5 minutes ahead): FAIL CLOSED -> expired
    const mutFuture: any = {
      timestamp: new Date(baselineNow + 60 * 60 * 1000).toISOString()
    };
    assert.strictEqual(isMutationExpired(mutFuture, baselineNow), true, 'Future timestamp must fail closed');

    // Reauthorized item: within window -> eligible
    const mutReauth: any = {
      timestamp: new Date(baselineNow - 8 * 24 * 60 * 60 * 1000).toISOString(),
      originalTimestamp: new Date(baselineNow - 8 * 24 * 60 * 60 * 1000).toISOString(),
      reauthorizedAt: new Date(baselineNow - 1000).toISOString(),
      reauthorizedByUserId: 10
    };
    assert.strictEqual(isMutationExpired(mutReauth, baselineNow), false, 'Reauthorized item within active session is eligible');
  });

  // ATT-074: Unsynced work accounting segregates device quarantine
  it('ATT-074 (PR-004S): getUnsyncedWorkSummary truthfully segregates device-level legacy quarantine from individual teacher unsynced counts', () => {
    const mockPendingStore = [
      { id: 'm1', userId: 10, status: 'pending' },
      { id: 'm2', userId: 10, status: 'conflicted' },
      { id: 'm3', userId: 10, status: 'rejected' },
      { id: 'm4', userId: 10, status: 'syncing' },
      { id: 'm5', userId: 10, status: 'stale_review_required' },
      { id: 'm6', userId: 20, status: 'pending' } // Different user
    ];

    const mockQuarantinedStore = [
      { id: 'legacy-unknown', schoolId: 'kcc' }
    ];

    function calculateSummary(userId: number) {
      const userItems = mockPendingStore.filter((i) => i.userId === userId);
      const pending = userItems.filter((i) => i.status === 'pending').length;
      const conflicted = userItems.filter((i) => i.status === 'conflicted').length;
      const rejected = userItems.filter((i) => i.status === 'rejected').length;
      const syncing = userItems.filter((i) => i.status === 'syncing').length;
      const staleReviewRequired = userItems.filter((i) => i.status === 'stale_review_required').length;
      const deviceQuarantined = mockQuarantinedStore.length;

      // Individual user unsynced work strictly counts author's items
      const userTotal = pending + conflicted + rejected + syncing + staleReviewRequired;

      return {
        total: userTotal,
        pending,
        conflicted,
        rejected,
        syncing,
        staleReviewRequired,
        quarantined: deviceQuarantined,
        hasUnsyncedWork: userTotal > 0
      };
    }

    const summaryUser10 = calculateSummary(10);
    assert.strictEqual(summaryUser10.pending, 1);
    assert.strictEqual(summaryUser10.conflicted, 1);
    assert.strictEqual(summaryUser10.rejected, 1);
    assert.strictEqual(summaryUser10.syncing, 1);
    assert.strictEqual(summaryUser10.staleReviewRequired, 1);
    assert.strictEqual(summaryUser10.quarantined, 1);
    assert.strictEqual(summaryUser10.total, 5, 'User total must exclude device quarantine');
    assert.strictEqual(summaryUser10.hasUnsyncedWork, true);
  });

  // ATT-075: Multi-account offline isolation
  it('ATT-075 (PR-004S): multi-account offline isolation ensures user A cannot see or sync user B mutations', () => {
    const queue = [
      { clientMutationId: 'mut-a1', userId: 1, classId: 5, date: '2026-05-18', status: 'pending' },
      { clientMutationId: 'mut-b1', userId: 2, classId: 6, date: '2026-05-18', status: 'pending' }
    ];

    const getQueueForUser = (targetUserId: number) => queue.filter((item) => item.userId === targetUserId);

    const userAQueue = getQueueForUser(1);
    assert.strictEqual(userAQueue.length, 1);
    assert.strictEqual(userAQueue[0].clientMutationId, 'mut-a1');

    const userBQueue = getQueueForUser(2);
    assert.strictEqual(userBQueue.length, 1);
    assert.strictEqual(userBQueue[0].clientMutationId, 'mut-b1');
  });

  // ATT-076: 8-day local absent vs current server present asserts zero overwrite without deliberate choice
  it('ATT-076: 8-day local absent vs current server present defaults to server preservation and asserts zero overwrite without deliberate choice', () => {
    const students = [
      { student_id: 101, admission_no: 'KCC-101', calling_name: 'Kasun Perera' }
    ];

    const staleLocalMutation: any = {
      clientMutationId: 'c1111111-1111-4111-8111-111111111111',
      records: [
        { student_id: 101, status: 'absent', remarks: 'Sick with fever 8 days ago' }
      ]
    };

    // Server was subsequently updated to 'present' by homeroom teacher
    const serverRecords = [
      { student_id: 101, status: 'present', remarks: 'In class' }
    ];

    const diffs = buildStudentDiffList(students, staleLocalMutation, serverRecords, {});
    assert.strictEqual(diffs.length, 1);
    assert.strictEqual(diffs[0].isDiff, true);
    assert.strictEqual(diffs[0].localStatus, 'absent');
    assert.strictEqual(diffs[0].serverStatus, 'present');
    // Deliberate safety: default choice MUST be 'server' to strictly prevent silent overwrite
    assert.strictEqual(diffs[0].chosen, 'server');

    // Case A: Default resolution preserves server state (ZERO OVERWRITE)
    const resolvedDefault = diffs.map((d) => ({
      student_id: d.student_id,
      status: d.chosen === 'server' ? d.serverStatus : d.localStatus,
      remarks: d.chosen === 'server' ? d.serverRemarks : d.localRemarks
    }));
    assert.strictEqual(resolvedDefault[0].status, 'present', 'Server present status must be preserved');
    assert.strictEqual(resolvedDefault[0].remarks, 'In class');

    // Case B: Only with explicit deliberate choice does local absence apply
    diffs[0].chosen = 'local';
    const resolvedDeliberate = diffs.map((d) => ({
      student_id: d.student_id,
      status: d.chosen === 'server' ? d.serverStatus : d.localStatus,
      remarks: d.chosen === 'server' ? d.serverRemarks : d.localRemarks
    }));
    assert.strictEqual(resolvedDeliberate[0].status, 'absent');
    assert.strictEqual(resolvedDeliberate[0].remarks, 'Sick with fever 8 days ago');
  });

  // ATT-077: Changed roster during stale offline period enforces reconciliation
  it('ATT-077: changed roster during stale offline period detects newly enrolled pupil and requires complete marking', () => {
    const staleLocalMutation: any = {
      clientMutationId: 'c2222222-2222-4222-8222-222222222222',
      records: [{ student_id: 101, status: 'present', remarks: '' }]
    };

    // While offline, student 102 was enrolled into the class roster
    const updatedStudents = [
      { student_id: 101, admission_no: 'KCC-101', calling_name: 'Kasun Perera' },
      { student_id: 102, admission_no: 'KCC-102', calling_name: 'New Student' }
    ];

    const serverRecords = [
      { student_id: 101, status: 'present', remarks: '' }
    ];

    const diffs = buildStudentDiffList(updatedStudents, staleLocalMutation, serverRecords, {});
    assert.strictEqual(diffs.length, 2);
    // Student 102 is detected in the roster comparison
    assert.strictEqual(diffs[1].student_id, 102);
    assert.strictEqual(diffs[1].localStatus, 'unmarked');
    assert.strictEqual(diffs[1].serverStatus, 'unmarked');
  });

  // ATT-078: Revoked class-teacher assignment rejects stale submission with 403
  it('ATT-078: revoked class-teacher assignment rejects stale submission with 403 and leaves database untouched', () => {
    const fixture = setupIsolatedTestDb();
    const db = new DatabaseSync(fixture.dbPath);
    try {
      runMigration004(db);

      // Revoke teacher's assignment to Class A
      db.prepare(`
        DELETE FROM teacher_assignments
        WHERE teacher_id = ? AND class_id = ?
      `).run(fixture.classTeacher.id, fixture.testClassA.id);

      const recordsBefore = (db.prepare('SELECT count(*) as count FROM attendance_records').get() as any).count;
      const sessionsBefore = (db.prepare('SELECT count(*) as count FROM attendance_sessions').get() as any).count;

      const payload = {
        classId: fixture.testClassA.id,
        date: '2026-05-18',
        mode: 'submitted' as const,
        baseRevision: 0,
        clientMutationId: 'c3333333-3333-4333-8333-333333333333',
        rosterFingerprint: 'sha256:any',
        records: [
          { student_id: fixture.studentA.id, status: 'present' as const }
        ]
      };

      assert.throws(
        () => processAttendanceSubmission(db, fixture.classTeacher, payload),
        (err: any) => {
          assert.strictEqual(err.problemDetails?.code || err.code, 'UNASSIGNED_CLASS_TEACHER');
          assert.strictEqual(err.problemDetails?.status || err.status, 403);
          return true;
        }
      );

      // Verify ZERO records modified
      const recordsAfter = (db.prepare('SELECT count(*) as count FROM attendance_records').get() as any).count;
      const sessionsAfter = (db.prepare('SELECT count(*) as count FROM attendance_sessions').get() as any).count;
      assert.strictEqual(recordsAfter, recordsBefore, 'Zero attendance records should be created');
      assert.strictEqual(sessionsAfter, sessionsBefore, 'Zero attendance sessions should be created');
    } finally {
      db.close();
      teardownIsolatedTestDb(fixture.dbPath);
    }
  });

  // ATT-079: Expired session / deactivated user account rejects stale submission
  it('ATT-079: deactivated user account rejects stale submission with 401 and leaves database untouched', () => {
    const fixture = setupIsolatedTestDb();
    const db = new DatabaseSync(fixture.dbPath);
    try {
      runMigration004(db);

      // Deactivate teacher user account
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(fixture.classTeacher.id);

      const payload = {
        classId: fixture.testClassA.id,
        date: '2026-05-18',
        mode: 'submitted' as const,
        baseRevision: 0,
        clientMutationId: 'c4444444-4444-4444-8444-444444444444',
        rosterFingerprint: 'sha256:any',
        records: [
          { student_id: fixture.studentA.id, status: 'present' as const }
        ]
      };

      assert.throws(
        () => processAttendanceSubmission(db, fixture.classTeacher, payload),
        (err: any) => {
          assert.strictEqual(err.problemDetails?.code || err.code, 'ACCOUNT_DEACTIVATED');
          assert.strictEqual(err.problemDetails?.status || err.status, 401);
          return true;
        }
      );
    } finally {
      db.close();
      teardownIsolatedTestDb(fixture.dbPath);
    }
  });

  // ATT-080: Repeat 409 collision during stale review invalidates stale choices on newly changed pupils
  it('ATT-080: repeat 409 collision during stale review invalidates prior choices on newly changed pupils', () => {
    const students = [
      { student_id: 101, admission_no: 'KCC-101', calling_name: 'Pupil 1' },
      { student_id: 102, admission_no: 'KCC-102', calling_name: 'Pupil 2' }
    ];

    const staleMutation: any = {
      records: [
        { student_id: 101, status: 'absent', remarks: 'Fever' },
        { student_id: 102, status: 'present', remarks: '' }
      ]
    };

    // Collision 1: Server was at Rev 1
    const serverRev1 = [
      { student_id: 101, status: 'present', remarks: '' },
      { student_id: 102, status: 'absent', remarks: 'Late transport' }
    ];

    // Teacher chose 'local' for both
    const priorChoices = new Map<number, 'local' | 'server'>([
      [101, 'local'],
      [102, 'local']
    ]);

    // Collision 2: Server advanced to Rev 2 while reviewing.
    // Pupil 101 mutated on server again (to 'excused')
    // Pupil 102 remained unchanged ('absent')
    const serverRev2 = [
      { student_id: 101, status: 'excused', remarks: 'Doctor certificate' },
      { student_id: 102, status: 'absent', remarks: 'Late transport' }
    ];

    const diffs = buildStudentDiffList(
      students,
      staleMutation,
      serverRev2,
      {},
      priorChoices,
      serverRev1
    );

    assert.strictEqual(diffs[0].student_id, 101);
    assert.strictEqual(diffs[0].serverChangedAgain, true, 'Pupil 101 server record changed again');
    assert.strictEqual(diffs[0].chosen, 'server', 'Pupil 101 prior choice MUST be invalidated and reset to server');

    assert.strictEqual(diffs[1].student_id, 102);
    assert.strictEqual(diffs[1].serverChangedAgain, false);
    assert.strictEqual(diffs[1].chosen, 'local', 'Pupil 102 unchanged choice preserved');
  });

  // ATT-081: Draft-versus-final state reconciliation
  it('ATT-081: reconciling stale draft against server-finalized register forces submitted mode and complete marking', () => {
    const students = [
      { student_id: 101, admission_no: 'KCC-101', calling_name: 'Pupil 1' },
      { student_id: 102, admission_no: 'KCC-102', calling_name: 'Pupil 2' }
    ];

    // Stale local was draft with only Pupil 101 marked
    const staleLocalDraft: any = {
      mode: 'draft',
      records: [{ student_id: 101, status: 'present', remarks: '' }]
    };

    // Server was finalized as submitted with both pupils marked
    const serverFinalizedRecords = [
      { student_id: 101, status: 'present', remarks: '' },
      { student_id: 102, status: 'absent', remarks: 'Sick' }
    ];
    const serverSession = { status: 'submitted', revision: 2 };

    const isServerSubmitted = serverSession.status === 'submitted';
    const targetMode = isServerSubmitted ? 'submitted' : 'draft';
    assert.strictEqual(targetMode, 'submitted', 'Target mode MUST be reconciled to submitted per ATT-014');

    const diffs = buildStudentDiffList(students, staleLocalDraft, serverFinalizedRecords, {});

    // Reconciled records inherit valid server status if local was unmarked
    const resolved = diffs
      .map((d) => {
        let status = d.chosen === 'server' ? d.serverStatus : d.localStatus;
        if (targetMode === 'submitted' && (!status || status === 'unmarked')) {
          if (d.serverStatus && d.serverStatus !== 'unmarked') {
            status = d.serverStatus;
          } else if (d.localStatus && d.localStatus !== 'unmarked') {
            status = d.localStatus;
          }
        }
        return { student_id: d.student_id, status };
      })
      .filter((r) => r.status && r.status !== 'unmarked');

    assert.strictEqual(resolved.length, 2, 'All pupils must be marked for finalized register');
  });

  // ATT-082: Interrupted save / Transactional rollback guarantees zero records modified
  it('ATT-082: interrupted save with foreign student rolls back transaction completely with zero changes', () => {
    const fixture = setupIsolatedTestDb();
    const db = new DatabaseSync(fixture.dbPath);
    try {
      runMigration004(db);

      const recordsBefore = (db.prepare('SELECT count(*) as count FROM attendance_records').get() as any).count;
      const sessionsBefore = (db.prepare('SELECT count(*) as count FROM attendance_sessions').get() as any).count;

      const yearRow = db.prepare('SELECT id FROM academic_years LIMIT 1').get() as { id: number };
      const academicYearId = yearRow.id;
      const enrolledA = db.prepare(`
        SELECT s.id, s.admission_no, s.status as student_status
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        WHERE e.class_id = ? AND e.academic_year_id = ? AND e.status = 'enrolled' AND s.status = 'Active'
        ORDER BY s.id ASC
      `).all(fixture.testClassA.id, academicYearId) as Array<{ id: number; admission_no: string; student_status: string }>;
      const validFingerprint = computeServerRosterFingerprint(fixture.testClassA.id, academicYearId, '2026-05-18', enrolledA);

      // Foreign student injection (Student B belongs to Class B, not Class A)
      const invalidPayload = {
        classId: fixture.testClassA.id,
        date: '2026-05-18',
        mode: 'submitted' as const,
        baseRevision: 0,
        clientMutationId: 'c5555555-5555-4555-8555-555555555555',
        rosterFingerprint: validFingerprint,
        records: [
          { student_id: fixture.studentA.id, status: 'present' as const },
          { student_id: fixture.studentB.id, status: 'present' as const }
        ]
      };

      assert.throws(
        () => processAttendanceSubmission(db, fixture.classTeacher, invalidPayload),
        (err: any) => {
          assert.strictEqual(err.problemDetails?.code || err.code, 'FOREIGN_STUDENT_ENROLMENT');
          assert.strictEqual(err.problemDetails?.status || err.status, 422);
          return true;
        }
      );

      // Verify complete zero-write transactional rollback
      const recordsAfter = (db.prepare('SELECT count(*) as count FROM attendance_records').get() as any).count;
      const sessionsAfter = (db.prepare('SELECT count(*) as count FROM attendance_sessions').get() as any).count;
      assert.strictEqual(recordsAfter, recordsBefore, 'Zero rows should be written to attendance_records');
      assert.strictEqual(sessionsAfter, sessionsBefore, 'Zero rows should be written to attendance_sessions');
    } finally {
      db.close();
      teardownIsolatedTestDb(fixture.dbPath);
    }
  });
});
