import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidatedAttendancePayload,
  computeCanonicalPayloadHash,
  createProblemDetails,
  ProblemDetails
} from '../validation/attendanceValidation.js';
import { logAuditTx } from '../utils/audit.js';

export interface AttendanceSubmissionSuccess {
  success: true;
  status: 'applied' | 'replayed';
  sessionId: number;
  revision: number;
  classId: number;
  date: string;
  mode: 'draft' | 'submitted';
  recordsCount: number;
  clientMutationId: string;
  message: string;
}

export class AttendanceServiceError extends Error {
  problemDetails: ProblemDetails;

  constructor(problemDetails: ProblemDetails) {
    super(problemDetails.detail);
    this.name = 'AttendanceServiceError';
    this.problemDetails = problemDetails;
  }
}

/**
 * Computes a server-owned canonical SHA-256 digest of the eligible roster for this class,
 * academic year, and date. Any changes in enrolled pupils (additions, deactivations, transfers)
 * will produce a different digest, detecting offline roster drift.
 */
export function computeServerRosterFingerprint(
  classId: number,
  academicYearId: number,
  dateStr: string,
  enrolledStudents: Array<{ id: number; admission_no: string; student_status: string }>
): string {
  const sorted = [...enrolledStudents]
    .sort((a, b) => a.id - b.id)
    .map((s) => `${s.id}:${s.admission_no}:${s.student_status}`)
    .join(',');

  const raw = `kcc:roster:${classId}:${academicYearId}:${dateStr}:${sorted}`;
  return 'sha256:' + crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Shared, transactional attendance mutation engine.
 * Guarantees all-or-nothing atomicity, in-transaction auth revalidation,
 * strict roster boundaries, optimistic revision checks, and idempotent replay receipts.
 */
export function processAttendanceSubmission(
  db: DatabaseSync,
  user: { id: number; username: string; role: string },
  payload: ValidatedAttendancePayload,
  ipAddress: string = '127.0.0.1'
): AttendanceSubmissionSuccess {
  const payloadHash = computeCanonicalPayloadHash(payload);

  // Acquire immediate reserved write lock
  db.exec('BEGIN IMMEDIATE;');

  try {
    // 1. Inside-transaction authentication & active account revalidation
    const liveUser = db.prepare(
      'SELECT id, username, role, is_active FROM users WHERE id = ?'
    ).get(user.id) as { id: number; username: string; role: string; is_active: number } | undefined;

    if (!liveUser || liveUser.is_active !== 1) {
      throw new AttendanceServiceError(
        createProblemDetails(
          401,
          'ACCOUNT_DEACTIVATED',
          'Account Deactivated',
          'Your account has been deactivated or revoked. Attendance submission rejected.',
          '/api/attendance/session'
        )
      );
    }

    // 2. Class existence and academic-year resolution
    const classRow = db.prepare(
      'SELECT id, name, grade, academic_year_id FROM classes WHERE id = ?'
    ).get(payload.classId) as { id: number; name: string; grade: number; academic_year_id: number | null } | undefined;

    if (!classRow) {
      throw new AttendanceServiceError(
        createProblemDetails(
          404,
          'CLASS_NOT_FOUND',
          'Class Not Found',
          `Class ID ${payload.classId} does not exist.`,
          '/api/attendance/session'
        )
      );
    }

    if (!classRow.academic_year_id) {
      throw new AttendanceServiceError(
        createProblemDetails(
          422,
          'INVALID_CLASS_YEAR_MAPPING',
          'Invalid Class Year Mapping',
          `Class ${classRow.name} is missing a designated academic year association.`,
          '/api/attendance/session'
        )
      );
    }
    const academicYearId = classRow.academic_year_id;

    // 3. Inside-transaction class teacher authorization
    if (liveUser.role !== 'admin') {
      const assignment = db.prepare(`
        SELECT id FROM teacher_assignments
        WHERE teacher_id = ? AND class_id = ? AND assignment_type = 'class_teacher'
          AND (academic_year_id = ? OR academic_year_id IS NULL)
      `).get(liveUser.id, payload.classId, academicYearId);

      if (!assignment) {
        throw new AttendanceServiceError(
          createProblemDetails(
            403,
            'UNASSIGNED_CLASS_TEACHER',
            'Unassigned Class Teacher',
            `Access denied. You are not assigned as the class teacher for ${classRow.name}.`,
            '/api/attendance/session'
          )
        );
      }
    }

    // 4. Academic-year date bounds verification
    const yearRow = db.prepare(
      'SELECT id, name, start_date, end_date FROM academic_years WHERE id = ?'
    ).get(academicYearId) as { id: number; name: string; start_date: string; end_date: string } | undefined;

    if (!yearRow) {
      throw new AttendanceServiceError(
        createProblemDetails(
          422,
          'ACADEMIC_YEAR_NOT_FOUND',
          'Academic Year Not Found',
          `Academic year ID ${academicYearId} does not exist.`,
          '/api/attendance/session'
        )
      );
    }

    if (payload.date < yearRow.start_date || payload.date > yearRow.end_date) {
      throw new AttendanceServiceError(
        createProblemDetails(
          422,
          'DATE_OUTSIDE_ACADEMIC_YEAR',
          'Date Outside Academic Year',
          `Date ${payload.date} falls outside the academic year '${yearRow.name}' date range (${yearRow.start_date} to ${yearRow.end_date}).`,
          '/api/attendance/session'
        )
      );
    }

    // 5. Atomic Idempotency & Replay Check
    // Evaluated BEFORE current-roster fingerprint checks:
    // If this mutation was already successfully committed, a client retry (e.g. after network drop)
    // must return 'replayed' without failing on subsequent roster membership or fingerprint changes.
    const existingReceipt = db.prepare(
      'SELECT client_mutation_id, user_id, payload_hash, resulting_revision FROM attendance_sync_receipts WHERE client_mutation_id = ?'
    ).get(payload.clientMutationId) as {
      client_mutation_id: string;
      user_id: number;
      payload_hash: string;
      resulting_revision: number;
    } | undefined;

    if (existingReceipt) {
      // Replay attempt under a different user
      if (existingReceipt.user_id !== liveUser.id) {
        throw new AttendanceServiceError(
          createProblemDetails(
            403,
            'ACTOR_IDEMPOTENCY_MISMATCH',
            'Actor Idempotency Mismatch',
            'This mutation operation ID was submitted by another user account.',
            '/api/attendance/session'
          )
        );
      }

      // Replay with altered payload
      if (existingReceipt.payload_hash !== payloadHash) {
        throw new AttendanceServiceError(
          createProblemDetails(
            409,
            'IDEMPOTENCY_KEY_REUSE',
            'Idempotency Key Reuse',
            'A mutation with this operation ID has already been executed with different payload content.',
            '/api/attendance/session'
          )
        );
      }

      // Identical payload replayed by same user: return prior success without re-executing
      const currentSession = db.prepare(
        'SELECT id, status FROM attendance_sessions WHERE class_id = ? AND date = ?'
      ).get(payload.classId, payload.date) as { id: number; status: string } | undefined;

      db.exec('COMMIT;');

      return {
        success: true,
        status: 'replayed',
        sessionId: currentSession?.id || 0,
        revision: existingReceipt.resulting_revision,
        classId: payload.classId,
        date: payload.date,
        mode: (currentSession?.status as any) || payload.mode,
        recordsCount: payload.records.length,
        clientMutationId: payload.clientMutationId,
        message: 'Mutation already successfully processed (Idempotent Replay).'
      };
    }

    // 6. Query canonical eligible roster (Active, enrolled students in this class and year)
    const enrolledStudents = db.prepare(`
      SELECT s.id, s.admission_no, s.full_name, s.status as student_status, e.roll_number
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      WHERE e.class_id = ? AND e.academic_year_id = ? AND e.status = 'enrolled' AND s.status = 'Active'
      ORDER BY s.id ASC
    `).all(payload.classId, academicYearId) as Array<{
      id: number;
      admission_no: string;
      full_name: string;
      student_status: string;
      roll_number: number | null;
    }>;

    // 7. Server-owned canonical roster fingerprint check
    const serverFingerprint = computeServerRosterFingerprint(
      payload.classId,
      academicYearId,
      payload.date,
      enrolledStudents
    );

    if (payload.rosterFingerprint !== serverFingerprint) {
      throw new AttendanceServiceError(
        createProblemDetails(
          409,
          'ROSTER_FINGERPRINT_MISMATCH',
          'Roster Fingerprint Mismatch',
          'The class roster was modified (students added, deactivated, or transferred) since your offline snapshot was captured. Please refresh the roster.',
          '/api/attendance/session'
        )
      );
    }

    // 8. Roster Boundary & Enrolment Verification
    const eligibleStudentMap = new Map<number, string>();
    for (const st of enrolledStudents) {
      eligibleStudentMap.set(st.id, st.admission_no);
    }

    for (const rec of payload.records) {
      if (!eligibleStudentMap.has(rec.student_id)) {
        throw new AttendanceServiceError(
          createProblemDetails(
            422,
            'FOREIGN_STUDENT_ENROLMENT',
            'Foreign Student Enrolment',
            `Student ID ${rec.student_id} is not enrolled in ${classRow.name} for academic year ${yearRow.name}. Cross-class student injection blocked.`,
            '/api/attendance/session'
          )
        );
      }
    }

    // If mode is 'submitted', all eligible students must have an attendance record
    if (payload.mode === 'submitted') {
      if (payload.records.length !== enrolledStudents.length) {
        throw new AttendanceServiceError(
          createProblemDetails(
            422,
            'INCOMPLETE_SUBMITTED_ROSTER',
            'Incomplete Submitted Roster',
            `Final register submission requires records for all ${enrolledStudents.length} enrolled students, but received ${payload.records.length}.`,
            '/api/attendance/session'
          )
        );
      }
    }

    // 9. Existing Session & Concurrency Revision Check
    const existingSession = db.prepare(
      'SELECT id, revision, status FROM attendance_sessions WHERE class_id = ? AND date = ?'
    ).get(payload.classId, payload.date) as { id: number; revision: number; status: string } | undefined;

    let sessionId: number;
    let nextRevision: number;

    if (existingSession) {
      // Concurrency Revision Check
      if (payload.baseRevision !== existingSession.revision) {
        throw new AttendanceServiceError(
          createProblemDetails(
            409,
            'ATTENDANCE_CONCURRENCY_CONFLICT',
            'Attendance Concurrency Conflict',
            `The attendance register has been updated by another user. Server revision is ${existingSession.revision}, but your update was based on revision ${payload.baseRevision}.`,
            '/api/attendance/session'
          )
        );
      }

      // Mode Transition: Once submitted, cannot revert to draft
      if (existingSession.status === 'submitted' && payload.mode === 'draft') {
        throw new AttendanceServiceError(
          createProblemDetails(
            422,
            'CANNOT_REVERT_SUBMITTED_TO_DRAFT',
            'Cannot Revert Submitted To Draft',
            'A finalized attendance register cannot be downgraded to an incomplete draft.',
            '/api/attendance/session'
          )
        );
      }

      nextRevision = existingSession.revision + 1;
      sessionId = existingSession.id;

      db.prepare(`
        UPDATE attendance_sessions SET
          status = ?,
          notes = ?,
          taken_by_user_id = ?,
          revision = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(payload.mode, payload.notes || null, liveUser.id, nextRevision, sessionId);
    } else {
      // First write must specify baseRevision = 0
      if (payload.baseRevision !== 0) {
        throw new AttendanceServiceError(
          createProblemDetails(
            409,
            'ATTENDANCE_CONCURRENCY_CONFLICT',
            'Attendance Concurrency Conflict',
            `No prior attendance session exists for this date. baseRevision must be 0, but received ${payload.baseRevision}.`,
            '/api/attendance/session'
          )
        );
      }

      nextRevision = 1;
      const insertSessionStmt = db.prepare(`
        INSERT INTO attendance_sessions (uuid, class_id, date, academic_year_id, taken_by_user_id, status, notes, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const sRes = insertSessionStmt.run(
        payload.clientMutationId,
        payload.classId,
        payload.date,
        academicYearId,
        liveUser.id,
        payload.mode,
        payload.notes || null
      );
      sessionId = Number(sRes.lastInsertRowid);
    }

    // 10. Snapshot Reconciliation Guard:
    // Only delete omitted records for students who are currently enrolled.
    // Preserves historical records of students who have transferred out since date D!
    if (payload.records.length > 0) {
      const incomingIds = payload.records.map((r) => r.student_id);
      const placeholders = incomingIds.map(() => '?').join(',');

      db.prepare(`
        DELETE FROM attendance_records
        WHERE session_id = ?
          AND student_id NOT IN (${placeholders})
          AND student_id IN (
            SELECT student_id FROM enrollments
            WHERE class_id = ? AND academic_year_id = ? AND status = 'enrolled'
          )
      `).run(sessionId, ...incomingIds, payload.classId, academicYearId);
    } else {
      // Empty draft payload: only remove enrolled students
      db.prepare(`
        DELETE FROM attendance_records
        WHERE session_id = ?
          AND student_id IN (
            SELECT student_id FROM enrollments
            WHERE class_id = ? AND academic_year_id = ? AND status = 'enrolled'
          )
      `).run(sessionId, payload.classId, academicYearId);
    }

    // 11. Upsert incoming records
    const upsertStmt = db.prepare(`
      INSERT INTO attendance_records (session_id, student_id, status, remarks, synced_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(session_id, student_id) DO UPDATE SET
        status = excluded.status,
        remarks = excluded.remarks,
        synced_at = datetime('now')
    `);

    for (const rec of payload.records) {
      upsertStmt.run(sessionId, rec.student_id, rec.status, rec.remarks || null);
    }

    // 12. Insert Idempotency Receipt
    db.prepare(`
      INSERT INTO attendance_sync_receipts (
        client_mutation_id, user_id, class_id, date, payload_hash, resulting_revision, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'applied', datetime('now'))
    `).run(payload.clientMutationId, liveUser.id, payload.classId, payload.date, payloadHash, nextRevision);

    // 13. In-Transaction Fail-Closed Audit Log
    logAuditTx(
      db,
      liveUser.id,
      liveUser.username,
      existingSession ? 'ATTENDANCE_UPDATE' : 'ATTENDANCE_SUBMIT',
      'attendance_sessions',
      sessionId,
      {
        classId: payload.classId,
        date: payload.date,
        mode: payload.mode,
        revision: nextRevision,
        recordsCount: payload.records.length,
        mutationId: payload.clientMutationId
      },
      ipAddress
    );

    // Commit transaction atomically
    db.exec('COMMIT;');

    return {
      success: true,
      status: 'applied',
      sessionId,
      revision: nextRevision,
      classId: payload.classId,
      date: payload.date,
      mode: payload.mode,
      recordsCount: payload.records.length,
      clientMutationId: payload.clientMutationId,
      message: `Attendance register for ${payload.date} saved successfully (Revision ${nextRevision}).`
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback errors if already aborted
    }
    throw err;
  }
}

/**
 * Processes an offline sync batch.
 * Guarantees per-item independent atomicity: valid items commit; invalid items reject
 * without aborting other valid items in the batch.
 */
export function processSyncBatch(
  db: DatabaseSync,
  user: { id: number; username: string; role: string },
  batch: any[],
  ipAddress: string = '127.0.0.1'
) {
  const results: Array<{
    clientMutationId: string;
    classId: number;
    date: string;
    status: 'applied' | 'replayed' | 'conflicted' | 'rejected';
    revision?: number;
    code?: string;
    error?: string;
    serverRevision?: number;
    syncedAt?: string;
  }> = [];

  for (const item of batch) {
    const mutationId = String(item?.clientMutationId || item?.id || 'unknown');
    const classId = Number(item?.classId || 0);
    const dateStr = String(item?.date || '');

    try {
      const valResult = (await_sync_validate(item)) as any;
      if (!valResult.valid) {
        results.push({
          clientMutationId: mutationId,
          classId,
          date: dateStr,
          status: 'rejected',
          code: valResult.error.code,
          error: valResult.error.detail
        });
        continue;
      }

      const res = processAttendanceSubmission(db, user, valResult.payload, ipAddress);
      results.push({
        clientMutationId: res.clientMutationId,
        classId: res.classId,
        date: res.date,
        status: res.status,
        revision: res.revision,
        syncedAt: new Date().toISOString()
      });
    } catch (err: any) {
      if (err instanceof AttendanceServiceError) {
        const pd = err.problemDetails;
        if (pd.status === 409) {
          results.push({
            clientMutationId: mutationId,
            classId,
            date: dateStr,
            status: 'conflicted',
            code: pd.code,
            error: pd.detail
          });
        } else {
          results.push({
            clientMutationId: mutationId,
            classId,
            date: dateStr,
            status: 'rejected',
            code: pd.code,
            error: pd.detail
          });
        }
      } else {
        results.push({
          clientMutationId: mutationId,
          classId,
          date: dateStr,
          status: 'rejected',
          code: 'INTERNAL_ERROR',
          error: err.message || 'Failed to process item'
        });
      }
    }
  }

  return {
    batchId: `batch-${Date.now()}`,
    processedCount: batch.length,
    results
  };
}

// Internal helper for synchronous validation in batch
import { validateAttendancePayload } from '../validation/attendanceValidation.js';
function await_sync_validate(item: any) {
  return validateAttendancePayload(item, '/api/attendance/sync');
}

/**
 * Retrieves attendance session details and class roster for a class and date.
 * Reconstructs roster preserving historical records of pupils who have transferred out.
 */
export function getAttendanceSessionWithRoster(
  db: DatabaseSync,
  user: { id: number; role: string },
  classId: number,
  dateStr: string
) {
  const classRow = db.prepare(
    'SELECT id, name, grade, academic_year_id FROM classes WHERE id = ?'
  ).get(classId) as { id: number; name: string; grade: number; academic_year_id: number | null } | undefined;

  if (!classRow) {
    throw new AttendanceServiceError(
      createProblemDetails(404, 'CLASS_NOT_FOUND', 'Class Not Found', `Class ID ${classId} not found.`, '/api/attendance/session')
    );
  }

  const session = db.prepare(`
    SELECT s.*, u.full_name as taken_by_name, c.name as class_name, c.grade
    FROM attendance_sessions s
    JOIN classes c ON s.class_id = c.id
    LEFT JOIN users u ON s.taken_by_user_id = u.id
    WHERE s.class_id = ? AND s.date = ?
  `).get(classId, dateStr) as any;

  // Retrieve current active enrolled roster PLUS any historical student with an existing record for this session
  const students = db.prepare(`
    SELECT DISTINCT
      s.id as student_id,
      s.admission_no,
      s.full_name,
      s.calling_name,
      s.gender,
      s.guardian_phone,
      e.roll_number,
      ar.status as attendance_status,
      ar.remarks as attendance_remarks,
      ar.id as record_id,
      CASE 
        WHEN e.class_id = ? AND e.status = 'enrolled' THEN 1 
        ELSE 0 
      END as is_currently_enrolled
    FROM students s
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.status = 'enrolled'
    LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.session_id = ?
    WHERE (e.class_id = ? AND e.status = 'enrolled' AND s.status = 'Active')
       OR (ar.session_id = ?)
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(classId, classRow.academic_year_id, session?.id || null, classId, session?.id || null) as any[];

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let unmarkedCount = 0;

  students.forEach((st) => {
    if (st.attendance_status === 'present') presentCount++;
    else if (st.attendance_status === 'absent') absentCount++;
    else if (st.attendance_status === 'late') lateCount++;
    else if (st.attendance_status === 'excused') excusedCount++;
    else unmarkedCount++;
  });

  // Server-calculated roster fingerprint
  const enrolledSubset = students
    .filter((s) => s.is_currently_enrolled === 1)
    .map((s) => ({ id: s.student_id, admission_no: s.admission_no, student_status: 'Active' }));

  const serverFingerprint = computeServerRosterFingerprint(
    classId,
    classRow.academic_year_id || 1,
    dateStr,
    enrolledSubset
  );

  return {
    session: session || null,
    serverRevision: session?.revision || 0,
    rosterFingerprint: serverFingerprint,
    students,
    summary: {
      total: students.length,
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      excused: excusedCount,
      unmarked: unmarkedCount,
      attendanceRate: students.length > 0 ? Math.round(((presentCount + lateCount) / students.length) * 100) : 0
    }
  };
}
