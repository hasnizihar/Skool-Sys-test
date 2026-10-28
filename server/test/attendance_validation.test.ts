import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateAttendancePayload,
  computeCanonicalPayloadHash,
  createProblemDetails
} from '../src/validation/attendanceValidation.js';
import { isValidCivilDate, getColomboCivilDate } from '../src/utils/dateUtils.js';

describe('PR-004 Stage 1: Validation, Contracts & Date Utilities', () => {
  describe('1. Sri Lankan Civil Calendar Date Validation', () => {
    it('accepts valid civil dates', () => {
      assert.strictEqual(isValidCivilDate('2026-05-18'), true);
      assert.strictEqual(isValidCivilDate('2026-01-01'), true);
      assert.strictEqual(isValidCivilDate('2026-12-31'), true);
      assert.strictEqual(isValidCivilDate('2024-02-29'), true); // 2024 is leap year
    });

    it('rejects calendar-impossible dates', () => {
      assert.strictEqual(isValidCivilDate('2026-02-30'), false); // February 30 does not exist
      assert.strictEqual(isValidCivilDate('2026-02-29'), false); // 2026 is not a leap year
      assert.strictEqual(isValidCivilDate('2026-04-31'), false); // April has 30 days
      assert.strictEqual(isValidCivilDate('2026-13-01'), false); // Month 13 invalid
      assert.strictEqual(isValidCivilDate('2026-00-10'), false); // Month 0 invalid
      assert.strictEqual(isValidCivilDate('invalid-date'), false);
    });

    it('getColomboCivilDate returns YYYY-MM-DD string', () => {
      const today = getColomboCivilDate();
      assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
      assert.strictEqual(isValidCivilDate(today), true);
    });
  });

  describe('2. Legacy V1 Payload Rejection', () => {
    it('rejects payload missing baseRevision, mode, or clientMutationId with LEGACY_PAYLOAD_UNSUPPORTED', () => {
      const legacyPayload = {
        classId: 5,
        date: '2026-05-18',
        records: [{ student_id: 1, status: 'present' }]
      };

      const result = validateAttendancePayload(legacyPayload);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error?.status, 400);
      assert.strictEqual(result.error?.code, 'LEGACY_PAYLOAD_UNSUPPORTED');
      assert.ok(result.error?.detail.includes('V2 concurrency fields'));
    });
  });

  describe('3. Attendance Status Constraints & Anti-Coercion', () => {
    const validBase = {
      classId: 5,
      date: '2026-05-18',
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      rosterFingerprint: 'sha256:d8e8fca2dc644673854c12',
      records: [
        { student_id: 101, status: 'present' }
      ]
    };

    it('accepts valid statuses present, absent, late, excused', () => {
      for (const st of ['present', 'absent', 'late', 'excused']) {
        const payload = {
          ...validBase,
          clientMutationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          records: [{ student_id: 101, status: st }]
        };
        const result = validateAttendancePayload(payload);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.payload?.records[0].status, st);
      }
    });

    it('rejects invalid status "maybe" with 422 INVALID_ATTENDANCE_STATUS without converting to present', () => {
      const payload = {
        ...validBase,
        records: [{ student_id: 101, status: 'maybe' }]
      };
      const result = validateAttendancePayload(payload);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error?.status, 422);
      assert.strictEqual(result.error?.code, 'INVALID_ATTENDANCE_STATUS');
    });

    it('rejects null or missing status with 422 INVALID_ATTENDANCE_STATUS', () => {
      const payload = {
        ...validBase,
        records: [{ student_id: 101, status: null }]
      };
      const result = validateAttendancePayload(payload);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error?.status, 422);
      assert.strictEqual(result.error?.code, 'INVALID_ATTENDANCE_STATUS');
    });
  });

  describe('4. Student ID Integrity & Uniqueness', () => {
    const validBase = {
      classId: 5,
      date: '2026-05-18',
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      rosterFingerprint: 'sha256:d8e8fca2dc644673854c12',
      records: []
    };

    it('rejects duplicate student_id in records with 422 DUPLICATE_STUDENT_RECORD', () => {
      const payload = {
        ...validBase,
        records: [
          { student_id: 101, status: 'present' },
          { student_id: 101, status: 'absent' }
        ]
      };
      const result = validateAttendancePayload(payload);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error?.status, 422);
      assert.strictEqual(result.error?.code, 'DUPLICATE_STUDENT_RECORD');
    });

    it('rejects non-integer or negative student_id with 400 INVALID_STUDENT_ID', () => {
      const payload = {
        ...validBase,
        records: [{ student_id: -5, status: 'present' }]
      };
      const result = validateAttendancePayload(payload);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error?.status, 400);
      assert.strictEqual(result.error?.code, 'INVALID_STUDENT_ID');
    });
  });

  describe('5. Deterministic Payload Hashing', () => {
    it('produces identical hash for identical payloads regardless of record order or key ordering', () => {
      const payloadA = {
        classId: 12,
        date: '2026-05-18',
        mode: 'draft' as const,
        baseRevision: 1,
        clientMutationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        rosterFingerprint: 'sha256:1122334455667788',
        notes: 'Morning register',
        records: [
          { student_id: 205, status: 'absent' as const, remarks: 'Sick' },
          { student_id: 102, status: 'present' as const, remarks: null }
        ]
      };

      const payloadB = {
        date: '2026-05-18',
        mode: 'draft' as const,
        classId: 12,
        baseRevision: 1,
        notes: 'Morning register',
        rosterFingerprint: 'sha256:1122334455667788',
        clientMutationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        records: [
          { student_id: 102, status: 'present' as const, remarks: null },
          { student_id: 205, status: 'absent' as const, remarks: 'Sick' }
        ]
      };

      const hashA = computeCanonicalPayloadHash(payloadA);
      const hashB = computeCanonicalPayloadHash(payloadB);

      assert.strictEqual(typeof hashA, 'string');
      assert.strictEqual(hashA.length, 64);
      assert.strictEqual(hashA, hashB, 'Deterministic hash must match even if keys or records are shuffled');
    });

    it('produces different hash when payload records or status differ', () => {
      const payloadA = {
        classId: 12,
        date: '2026-05-18',
        mode: 'draft' as const,
        baseRevision: 1,
        clientMutationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        rosterFingerprint: 'sha256:1122334455667788',
        notes: null,
        records: [{ student_id: 102, status: 'present' as const, remarks: null }]
      };

      const payloadB = {
        ...payloadA,
        records: [{ student_id: 102, status: 'absent' as const, remarks: null }]
      };

      const hashA = computeCanonicalPayloadHash(payloadA);
      const hashB = computeCanonicalPayloadHash(payloadB);

      assert.notStrictEqual(hashA, hashB, 'Different attendance statuses must yield different hashes');
    });
  });

  describe('6. RFC 7807 Problem Details Structure', () => {
    it('creates compliant ProblemDetails object', () => {
      const pd = createProblemDetails(
        409,
        'ATTENDANCE_CONCURRENCY_CONFLICT',
        'Attendance Concurrency Conflict',
        'Session modified by another user.',
        '/api/attendance/session'
      );

      assert.strictEqual(pd.status, 409);
      assert.strictEqual(pd.code, 'ATTENDANCE_CONCURRENCY_CONFLICT');
      assert.strictEqual(pd.title, 'Attendance Concurrency Conflict');
      assert.strictEqual(pd.type, 'https://skoolsys.kcc.sch.lk/errors/attendance-concurrency-conflict');
      assert.strictEqual(pd.instance, '/api/attendance/session');
    });
  });
});
