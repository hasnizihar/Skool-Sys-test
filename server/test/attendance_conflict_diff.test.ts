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
});
