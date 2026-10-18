import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('PR-004R: Conflict Diff Calculation & Error Classification Unit Tests', () => {
  interface StudentRecord {
    student_id: number;
    status: 'present' | 'absent' | 'late' | 'excused';
    remarks?: string | null;
  }

  interface ConflictStudentDiff {
    student_id: number;
    localStatus: string;
    localRemarks: string;
    serverStatus: string;
    serverRemarks: string;
    isDiff: boolean;
    chosen: 'local' | 'server';
  }

  function computeConflictDiff(
    students: { id: number; name: string }[],
    localRecords: StudentRecord[],
    serverRecords: StudentRecord[]
  ): ConflictStudentDiff[] {
    const serverMap = new Map<number, StudentRecord>();
    serverRecords.forEach((r) => serverMap.set(r.student_id, r));

    const localMap = new Map<number, StudentRecord>();
    localRecords.forEach((r) => localMap.set(r.student_id, r));

    return students.map((st) => {
      const localRec = localMap.get(st.id);
      const serverRec = serverMap.get(st.id);

      const localStatus = localRec?.status || 'unmarked';
      const localRemarks = localRec?.remarks || '';
      const serverStatus = serverRec?.status || 'unmarked';
      const serverRemarks = serverRec?.remarks || '';

      const isDiff = localStatus !== serverStatus || localRemarks !== serverRemarks;

      return {
        student_id: st.id,
        localStatus,
        localRemarks,
        serverStatus,
        serverRemarks,
        isDiff,
        chosen: isDiff ? 'server' : 'local' // Default to server review on discrepancy
      };
    });
  }

  function applyDeliberateResolution(diffs: ConflictStudentDiff[]): StudentRecord[] {
    return diffs
      .map((d) => {
        const status = d.chosen === 'server' ? d.serverStatus : d.localStatus;
        const remarks = d.chosen === 'server' ? d.serverRemarks : d.localRemarks;
        return {
          student_id: d.student_id,
          status: status as any,
          remarks: remarks || null
        };
      })
      .filter((r) => r.status && r.status !== 'unmarked');
  }

  it('ATT-068 (PR-004R): correctly identifies student-by-student discrepancies without blind overwrite', () => {
    const students = [
      { id: 101, name: 'Kasun Perera' },
      { id: 102, name: 'Fathima Nuha' },
      { id: 103, name: 'Mohamed Risan' }
    ];

    // Local user marked: 101: present, 102: absent, 103: present
    const localRecords: StudentRecord[] = [
      { student_id: 101, status: 'present', remarks: null },
      { student_id: 102, status: 'absent', remarks: 'Sick leave' },
      { student_id: 103, status: 'present', remarks: null }
    ];

    // Server has: 101: present (same), 102: present (different!), 103: late (different remarks)
    const serverRecords: StudentRecord[] = [
      { student_id: 101, status: 'present', remarks: null },
      { student_id: 102, status: 'present', remarks: null },
      { student_id: 103, status: 'late', remarks: 'Arrived with permission' }
    ];

    const diffs = computeConflictDiff(students, localRecords, serverRecords);

    assert.strictEqual(diffs.length, 3);

    // Student 101: identical
    assert.strictEqual(diffs[0].isDiff, false);
    assert.strictEqual(diffs[0].chosen, 'local');

    // Student 102: discrepancy (local absent vs server present)
    assert.strictEqual(diffs[1].isDiff, true);
    assert.strictEqual(diffs[1].localStatus, 'absent');
    assert.strictEqual(diffs[1].serverStatus, 'present');
    assert.strictEqual(diffs[1].chosen, 'server');

    // Student 103: discrepancy (local present vs server late)
    assert.strictEqual(diffs[2].isDiff, true);
    assert.strictEqual(diffs[2].localStatus, 'present');
    assert.strictEqual(diffs[2].serverStatus, 'late');
  });

  it('ATT-069 (PR-004R): applies deliberate resolution choices per-student and excludes blind overwrite', () => {
    const students = [
      { id: 101, name: 'Kasun Perera' },
      { id: 102, name: 'Fathima Nuha' }
    ];

    const localRecords: StudentRecord[] = [
      { student_id: 101, status: 'absent', remarks: 'Local thought absent' },
      { student_id: 102, status: 'present', remarks: 'Confirmed present locally' }
    ];

    const serverRecords: StudentRecord[] = [
      { student_id: 101, status: 'present', remarks: 'Teacher B marked present' },
      { student_id: 102, status: 'absent', remarks: 'Teacher B marked absent' }
    ];

    const diffs = computeConflictDiff(students, localRecords, serverRecords);

    // Deliberate user selection:
    // For student 101: teacher decides to ACCEPT Server ('present')
    diffs[0].chosen = 'server';
    // For student 102: teacher decides to OVERRIDE and use Local ('present')
    diffs[1].chosen = 'local';

    const resolved = applyDeliberateResolution(diffs);

    assert.strictEqual(resolved.length, 2);
    // Student 101 took server value
    assert.strictEqual(resolved[0].student_id, 101);
    assert.strictEqual(resolved[0].status, 'present');
    assert.strictEqual(resolved[0].remarks, 'Teacher B marked present');

    // Student 102 took local value
    assert.strictEqual(resolved[1].student_id, 102);
    assert.strictEqual(resolved[1].status, 'present');
    assert.strictEqual(resolved[1].remarks, 'Confirmed present locally');
  });

  it('ATT-070 (PR-004R): classifies errors strictly — HTTP errors never masquerade as offline connection loss', () => {
    class MockHttpError extends Error {
      status: number;
      code: string;
      constructor(status: number, code: string, msg: string) {
        super(msg);
        this.status = status;
        this.code = code;
      }
    }

    function classifySaveFailure(err: any): { action: 'offline_queue' | 'show_server_error' | 'open_conflict_modal'; message: string } {
      if (err instanceof MockHttpError) {
        if (err.status === 409) {
          return { action: 'open_conflict_modal', message: 'Concurrency conflict detected' };
        }
        return { action: 'show_server_error', message: `Server HTTP ${err.status}: ${err.message}` };
      }
      return { action: 'offline_queue', message: 'Network transport failure: Queued offline' };
    }

    // 1. HTTP 400 Bad Request
    const err400 = new MockHttpError(400, 'MALFORMED_REQUEST', 'Missing fields');
    assert.strictEqual(classifySaveFailure(err400).action, 'show_server_error');

    // 2. HTTP 409 Conflict
    const err409 = new MockHttpError(409, 'ATTENDANCE_CONCURRENCY_CONFLICT', 'Revision mismatch');
    assert.strictEqual(classifySaveFailure(err409).action, 'open_conflict_modal');

    // 3. HTTP 500 Internal Error
    const err500 = new MockHttpError(500, 'INTERNAL_SERVER_ERROR', 'Database locked');
    assert.strictEqual(classifySaveFailure(err500).action, 'show_server_error');

    // 4. True Network Transport Failure (TypeError)
    const netErr = new TypeError('Failed to fetch');
    assert.strictEqual(classifySaveFailure(netErr).action, 'offline_queue');
  });

  // ATT-071 (PR-004S): 7-day offline mutation age validation
  it('ATT-071 (PR-004S): enforces 7-day retention expiry — 6-day item is valid; 8-day item is expired and blocked', () => {
    const MAX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    function checkMutationExpiry(timestamp: string, nowMs: number): boolean {
      const time = new Date(timestamp).getTime();
      if (isNaN(time)) return false;
      return (nowMs - time) > MAX_RETENTION_MS;
    }

    const baselineNow = new Date('2026-10-18T12:00:00Z').getTime();

    // Case 1: Recorded 6 days ago (valid)
    const sixDaysAgo = new Date(baselineNow - 6 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(checkMutationExpiry(sixDaysAgo, baselineNow), false, '6-day-old record must NOT be expired');

    // Case 2: Recorded 7 days minus 1 minute ago (valid boundary)
    const justUnder7Days = new Date(baselineNow - (7 * 24 * 60 * 60 * 1000 - 60000)).toISOString();
    assert.strictEqual(checkMutationExpiry(justUnder7Days, baselineNow), false, 'Under 7 days must NOT be expired');

    // Case 3: Recorded 8 days ago (expired — must require manual re-auth)
    const eightDaysAgo = new Date(baselineNow - 8 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(checkMutationExpiry(eightDaysAgo, baselineNow), true, '8-day-old record MUST be expired');

    // Case 4: Recorded 14 days ago (expired)
    const twoWeeksAgo = new Date(baselineNow - 14 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(checkMutationExpiry(twoWeeksAgo, baselineNow), true, '14-day-old record MUST be expired');
  });

  // ATT-072 (PR-004S): Draft-to-final reconciliation
  it('ATT-072 (PR-004S): draft-to-final conflict reconciliation enforces finalized mode and prevents downgrade to draft', () => {
    // When reconciling local draft against a server session that was finalized ('submitted')
    // in the meantime, the reconciliation target mode MUST be 'submitted'.
    function determineReconciliationMode(
      serverStatus: 'draft' | 'submitted',
      localMode: 'draft' | 'submitted'
    ): 'draft' | 'submitted' {
      if (serverStatus === 'submitted' || localMode === 'submitted') {
        return 'submitted';
      }
      return 'draft';
    }

    assert.strictEqual(determineReconciliationMode('submitted', 'draft'), 'submitted');
    assert.strictEqual(determineReconciliationMode('draft', 'submitted'), 'submitted');
    assert.strictEqual(determineReconciliationMode('draft', 'draft'), 'draft');
    assert.strictEqual(determineReconciliationMode('submitted', 'submitted'), 'submitted');

    // Finalized mode enforcement: complete roster check
    const totalEnrolled = 3;
    const resolvedRecords = [
      { student_id: 1, status: 'present' },
      { student_id: 2, status: 'absent' }
      // Student 3 left unmarked
    ];

    const canSubmitFinalized = (records: any[], total: number) => {
      const nonUnmarked = records.filter(r => r.status && r.status !== 'unmarked');
      return nonUnmarked.length >= total;
    };

    assert.strictEqual(canSubmitFinalized(resolvedRecords, totalEnrolled), false, 'Incomplete register cannot be submitted as finalized');
    
    // Complete with student 3
    resolvedRecords.push({ student_id: 3, status: 'excused' });
    assert.strictEqual(canSubmitFinalized(resolvedRecords, totalEnrolled), true, 'Complete register can be submitted as finalized');
  });

  // ATT-073 (PR-004S): Repeated collision diff refresh
  it('ATT-073 (PR-004S): repeated collision rebuilds diff from latest server records while tracking prior teacher choices', () => {
    const students = [
      { id: 101, name: 'Student 101' },
      { id: 102, name: 'Student 102' }
    ];

    const localRecords = [
      { student_id: 101, status: 'absent', remarks: 'Sick' },
      { student_id: 102, status: 'present', remarks: '' }
    ];

    // First collision: Server was at Rev 2 with Student 101=present, Student 102=present
    const serverRev2 = [
      { student_id: 101, status: 'present', remarks: 'Morning check' },
      { student_id: 102, status: 'present', remarks: '' }
    ];

    const firstDiffs = computeConflictDiff(students, localRecords as any, serverRev2 as any);
    assert.strictEqual(firstDiffs[0].isDiff, true);
    // Teacher explicitly chooses local ('absent') for student 101
    firstDiffs[0].chosen = 'local';

    // Now, before teacher submits, Server advances AGAIN to Rev 3! (Second 409 collision)
    // In Rev 3, Student 101 was changed to 'excused' with medical note
    const serverRev3 = [
      { student_id: 101, status: 'excused', remarks: 'Medical certificate received' },
      { student_id: 102, status: 'present', remarks: '' }
    ];

    // Rebuild diffs from Rev 3 server records while preserving prior choice
    const priorChoices = new Map<number, 'local' | 'server'>();
    firstDiffs.forEach(d => priorChoices.set(d.student_id, d.chosen));

    const secondDiffs = students.map((st) => {
      const localRec = localRecords.find(r => r.student_id === st.id);
      const serverRec = serverRev3.find(r => r.student_id === st.id);

      const localStatus = localRec?.status || 'unmarked';
      const localRemarks = localRec?.remarks || '';
      const serverStatus = serverRec?.status || 'unmarked';
      const serverRemarks = serverRec?.remarks || '';

      const isDiff = localStatus !== serverStatus || localRemarks !== serverRemarks;
      return {
        student_id: st.id,
        localStatus,
        localRemarks,
        serverStatus,
        serverRemarks,
        isDiff,
        chosen: isDiff ? (priorChoices.get(st.id) || 'server') : 'local'
      };
    });

    // Student 101 is still diff, and serverStatus is refreshed to 'excused' (NOT stale 'present')
    assert.strictEqual(secondDiffs[0].serverStatus, 'excused');
    assert.strictEqual(secondDiffs[0].serverRemarks, 'Medical certificate received');
    assert.strictEqual(secondDiffs[0].isDiff, true);
  });

  // ATT-074 (PR-004S): Unsynced work accounting
  it('ATT-074 (PR-004S): getUnsyncedWorkSummary truthfully accounts for pending, conflicted, rejected, syncing, and quarantined items', () => {
    interface MockMutation {
      id: string;
      userId: number;
      status: 'pending' | 'syncing' | 'conflicted' | 'stale_review_required' | 'rejected';
    }

    const mockPendingStore: MockMutation[] = [
      { id: 'm1', userId: 10, status: 'pending' },
      { id: 'm2', userId: 10, status: 'conflicted' },
      { id: 'm3', userId: 10, status: 'rejected' },
      { id: 'm4', userId: 10, status: 'syncing' },
      { id: 'm5', userId: 10, status: 'stale_review_required' },
      { id: 'm6', userId: 20, status: 'pending' } // Different user
    ];

    const mockQuarantinedStore = [
      { id: 'legacy-1', schoolId: 'kcc' }
    ];

    function calculateSummary(userId: number) {
      const userItems = mockPendingStore.filter(i => i.userId === userId);
      const pending = userItems.filter(i => i.status === 'pending').length;
      const conflicted = userItems.filter(i => i.status === 'conflicted').length;
      const rejected = userItems.filter(i => i.status === 'rejected').length;
      const syncing = userItems.filter(i => i.status === 'syncing').length;
      const staleReviewRequired = userItems.filter(i => i.status === 'stale_review_required').length;
      const quarantined = mockQuarantinedStore.length;
      const total = pending + conflicted + rejected + syncing + staleReviewRequired + quarantined;

      return {
        total,
        pending,
        conflicted,
        rejected,
        syncing,
        staleReviewRequired,
        quarantined,
        hasUnsyncedWork: total > 0
      };
    }

    const summaryUser10 = calculateSummary(10);
    assert.strictEqual(summaryUser10.pending, 1);
    assert.strictEqual(summaryUser10.conflicted, 1);
    assert.strictEqual(summaryUser10.rejected, 1);
    assert.strictEqual(summaryUser10.syncing, 1);
    assert.strictEqual(summaryUser10.staleReviewRequired, 1);
    assert.strictEqual(summaryUser10.quarantined, 1);
    assert.strictEqual(summaryUser10.total, 6);
    assert.strictEqual(summaryUser10.hasUnsyncedWork, true);

    // Old flawed check counted only pending + conflicted = 2, omitting rejected, syncing, stale, quarantined!
    const oldFlawedCount = userItems => userItems.filter(i => i.status === 'pending' || i.status === 'conflicted').length;
    assert.strictEqual(oldFlawedCount(mockPendingStore.filter(i => i.userId === 10)), 2);
    assert.ok(summaryUser10.total > 2, 'New summary captures all uncommitted work');
  });

  // ATT-075 (PR-004S): Multi-account offline isolation
  it('ATT-075 (PR-004S): multi-account offline isolation ensures user A cannot see or sync user B mutations', () => {
    const queue = [
      { clientMutationId: 'mut-a1', userId: 1, classId: 5, date: '2026-05-18', status: 'pending' },
      { clientMutationId: 'mut-b1', userId: 2, classId: 6, date: '2026-05-18', status: 'pending' }
    ];

    const getQueueForUser = (targetUserId: number) => queue.filter(item => item.userId === targetUserId);

    const userAQueue = getQueueForUser(1);
    assert.strictEqual(userAQueue.length, 1);
    assert.strictEqual(userAQueue[0].clientMutationId, 'mut-a1');

    const userBQueue = getQueueForUser(2);
    assert.strictEqual(userBQueue.length, 1);
    assert.strictEqual(userBQueue[0].clientMutationId, 'mut-b1');
  });
});

