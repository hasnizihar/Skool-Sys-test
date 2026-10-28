import crypto from 'node:crypto';
import { isValidCivilDate } from '../utils/dateUtils.js';

export const VALID_ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'] as const;
export type AttendanceStatus = typeof VALID_ATTENDANCE_STATUSES[number];

export interface ValidatedAttendanceRecord {
  student_id: number;
  status: AttendanceStatus;
  remarks: string | null;
}

export interface ValidatedAttendancePayload {
  classId: number;
  date: string;
  mode: 'draft' | 'submitted';
  baseRevision: number;
  clientMutationId: string;
  rosterFingerprint: string;
  notes: string | null;
  records: ValidatedAttendanceRecord[];
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance: string;
  invalidParams?: Array<{ name: string; reason: string }>;
}

export function createProblemDetails(
  status: number,
  code: string,
  title: string,
  detail: string,
  instance: string = '/api/attendance/session',
  invalidParams?: Array<{ name: string; reason: string }>
): ProblemDetails {
  return {
    type: `https://skoolsys.kcc.sch.lk/errors/${code.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    code,
    detail,
    instance,
    ...(invalidParams && invalidParams.length > 0 ? { invalidParams } : {})
  };
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CLASS_RECORDS = 120; // Bounded class register size for KCC

export interface ValidationResult {
  valid: boolean;
  payload?: ValidatedAttendancePayload;
  error?: ProblemDetails;
}

/**
 * Validates an incoming attendance mutation payload according to PR-004 contracts.
 * Returns either validated typed payload or structured RFC 7807 ProblemDetails.
 */
export function validateAttendancePayload(
  body: any,
  instance: string = '/api/attendance/session'
): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'MALFORMED_REQUEST_BODY',
        'Malformed Request Body',
        'Request body must be a valid JSON object.',
        instance
      )
    };
  }

  // Detect legacy V1 clients lacking concurrency fields
  if (
    body.baseRevision === undefined ||
    body.clientMutationId === undefined ||
    body.mode === undefined
  ) {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'LEGACY_PAYLOAD_UNSUPPORTED',
        'Legacy Payload Format Unsupported',
        'Attendance submission lacks required V2 concurrency fields (baseRevision, clientMutationId, mode). Please refresh your web application.',
        instance
      )
    };
  }

  // 1. classId
  const classId = Number(body.classId);
  if (!Number.isInteger(classId) || classId <= 0) {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'INVALID_CLASS_ID',
        'Invalid Class ID',
        'classId must be a positive integer.',
        instance,
        [{ name: 'classId', reason: 'Must be a positive integer' }]
      )
    };
  }

  // 2. date (strictly validated civil calendar date in Asia/Colombo context)
  const dateStr = String(body.date || '').trim();
  if (!isValidCivilDate(dateStr)) {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'INVALID_CALENDAR_DATE',
        'Invalid Calendar Date',
        `Date '${dateStr}' is not a valid ISO civil calendar date (YYYY-MM-DD).`,
        instance,
        [{ name: 'date', reason: 'Must be a valid civil date in YYYY-MM-DD format' }]
      )
    };
  }

  // 3. mode
  const mode = body.mode;
  if (mode !== 'draft' && mode !== 'submitted') {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'INVALID_SUBMISSION_MODE',
        'Invalid Submission Mode',
        "Mode must be strictly either 'draft' or 'submitted'.",
        instance,
        [{ name: 'mode', reason: "Allowed values: 'draft', 'submitted'" }]
      )
    };
  }

  // 4. baseRevision
  const baseRevision = Number(body.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'INVALID_BASE_REVISION',
        'Invalid Base Revision',
        'baseRevision must be an integer greater than or equal to 0.',
        instance,
        [{ name: 'baseRevision', reason: 'Must be an integer >= 0' }]
      )
    };
  }

  // 5. clientMutationId (UUID format)
  const clientMutationId = String(body.clientMutationId || '').trim();
  if (!UUID_V4_REGEX.test(clientMutationId)) {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'INVALID_MUTATION_ID',
        'Invalid Mutation ID',
        'clientMutationId must be a valid RFC 4122 UUID.',
        instance,
        [{ name: 'clientMutationId', reason: 'Must be a valid UUID' }]
      )
    };
  }

  // 6. rosterFingerprint
  const rosterFingerprint = String(body.rosterFingerprint || '').trim();
  if (!rosterFingerprint || rosterFingerprint.length < 8) {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'INVALID_ROSTER_FINGERPRINT',
        'Invalid Roster Fingerprint',
        'rosterFingerprint is required and must be at least 8 characters.',
        instance,
        [{ name: 'rosterFingerprint', reason: 'Must be a valid non-empty digest string' }]
      )
    };
  }

  // 7. records array
  if (!Array.isArray(body.records)) {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'INVALID_RECORDS_ARRAY',
        'Invalid Records Array',
        'records must be an array of student attendance items.',
        instance,
        [{ name: 'records', reason: 'Must be an array' }]
      )
    };
  }

  if (body.records.length > MAX_CLASS_RECORDS) {
    return {
      valid: false,
      error: createProblemDetails(
        413,
        'PAYLOAD_TOO_LARGE',
        'Payload Too Large',
        `records array exceeds maximum allowed bound of ${MAX_CLASS_RECORDS} students.`,
        instance,
        [{ name: 'records', reason: `Count cannot exceed ${MAX_CLASS_RECORDS}` }]
      )
    };
  }

  const validatedRecords: ValidatedAttendanceRecord[] = [];
  const seenStudentIds = new Set<number>();

  for (let i = 0; i < body.records.length; i++) {
    const r = body.records[i];
    if (!r || typeof r !== 'object') {
      return {
        valid: false,
        error: createProblemDetails(
          400,
          'MALFORMED_RECORD',
          'Malformed Record',
          `Record at index ${i} is not a valid object.`,
          instance
        )
      };
    }

    const studentId = Number(r.student_id);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return {
        valid: false,
        error: createProblemDetails(
          400,
          'INVALID_STUDENT_ID',
          'Invalid Student ID',
          `student_id at index ${i} must be a positive integer.`,
          instance,
          [{ name: `records[${i}].student_id`, reason: 'Must be a positive integer' }]
        )
      };
    }

    if (seenStudentIds.has(studentId)) {
      return {
        valid: false,
        error: createProblemDetails(
          422,
          'DUPLICATE_STUDENT_RECORD',
          'Duplicate Student Record',
          `Student ID ${studentId} appears multiple times in the records array.`,
          instance,
          [{ name: `records[${i}].student_id`, reason: 'Student ID must be unique in records' }]
        )
      };
    }
    seenStudentIds.add(studentId);

    const rawStatus = r.status;
    if (!VALID_ATTENDANCE_STATUSES.includes(rawStatus)) {
      return {
        valid: false,
        error: createProblemDetails(
          422,
          'INVALID_ATTENDANCE_STATUS',
          'Invalid Attendance Status',
          `Status '${rawStatus}' for student ID ${studentId} is invalid. Allowed statuses: ${VALID_ATTENDANCE_STATUSES.join(', ')}.`,
          instance,
          [{ name: `records[${i}].status`, reason: `Allowed: ${VALID_ATTENDANCE_STATUSES.join(', ')}` }]
        )
      };
    }

    const remarks = r.remarks ? String(r.remarks).trim() : null;
    if (remarks && remarks.length > 250) {
      return {
        valid: false,
        error: createProblemDetails(
          400,
          'REMARKS_TOO_LONG',
          'Remarks Too Long',
          `Remarks for student ID ${studentId} exceed the 250 character limit.`,
          instance,
          [{ name: `records[${i}].remarks`, reason: 'Maximum length is 250 characters' }]
        )
      };
    }

    validatedRecords.push({
      student_id: studentId,
      status: rawStatus,
      remarks: remarks || null
    });
  }

  const notes = body.notes ? String(body.notes).trim() : null;
  if (notes && notes.length > 500) {
    return {
      valid: false,
      error: createProblemDetails(
        400,
        'NOTES_TOO_LONG',
        'Notes Too Long',
        'Notes exceed maximum allowed limit of 500 characters.',
        instance
      )
    };
  }

  return {
    valid: true,
    payload: {
      classId,
      date: dateStr,
      mode,
      baseRevision,
      clientMutationId,
      rosterFingerprint,
      notes: notes || null,
      records: validatedRecords
    }
  };
}

/**
 * Computes a deterministic SHA-256 hash over an attendance payload.
 * Normalizes ordering and keys so that payloads with shuffled keys or records
 * produce identical hash values for idempotency checks.
 */
export function computeCanonicalPayloadHash(payload: ValidatedAttendancePayload): string {
  // Sort records by student_id ascending
  const sortedRecords = [...payload.records]
    .sort((a, b) => a.student_id - b.student_id)
    .map((r) => ({
      remarks: r.remarks ? r.remarks.trim() : null,
      status: r.status,
      student_id: r.student_id
    }));

  const canonicalObj = {
    baseRevision: payload.baseRevision,
    classId: payload.classId,
    clientMutationId: payload.clientMutationId.toLowerCase(),
    date: payload.date,
    mode: payload.mode,
    notes: payload.notes ? payload.notes.trim() : null,
    records: sortedRecords,
    rosterFingerprint: payload.rosterFingerprint.trim()
  };

  return crypto.createHash('sha256').update(JSON.stringify(canonicalObj)).digest('hex');
}
