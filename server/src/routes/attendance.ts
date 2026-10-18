import { Router } from 'express';
import { db } from '../db/database.js';
import {
  requireAuth,
  getUserAssignments,
  canManageClassAttendance,
  canViewClassAttendance
} from '../middleware/auth.js';
import { getColomboCivilDate, isValidCivilDate } from '../utils/dateUtils.js';
import {
  validateAttendancePayload,
  createProblemDetails
} from '../validation/attendanceValidation.js';
import {
  processAttendanceSubmission,
  processSyncBatch,
  getAttendanceSessionWithRoster,
  AttendanceServiceError
} from '../services/attendanceService.js';

const router = Router();

// ============================================================================
// GET /api/attendance/session
// Retrieve attendance session details, current roster, and historical records
// ============================================================================
router.get('/session', requireAuth, (req, res) => {
  const { classId, date } = req.query;

  if (!classId || !date) {
    res.status(400).json(
      createProblemDetails(
        400,
        'MISSING_REQUIRED_PARAMETERS',
        'Missing Parameters',
        'Both classId and date (YYYY-MM-DD) are required.',
        '/api/attendance/session'
      )
    );
    return;
  }

  const cId = Number(classId);
  const dt = String(date);

  if (isNaN(cId) || cId <= 0) {
    res.status(400).json(
      createProblemDetails(
        400,
        'INVALID_CLASS_ID',
        'Invalid Class ID',
        'classId must be a positive integer.',
        '/api/attendance/session'
      )
    );
    return;
  }

  if (!isValidCivilDate(dt)) {
    res.status(400).json(
      createProblemDetails(
        400,
        'INVALID_CIVIL_DATE',
        'Invalid Civil Date',
        `The date '${dt}' is not a valid Gregorian calendar date in Asia/Colombo.`,
        '/api/attendance/session'
      )
    );
    return;
  }

  // Record-level permission check: must be admin or assigned to this class
  if (!canViewClassAttendance(req.user!, cId)) {
    res.status(403).json(
      createProblemDetails(
        403,
        'FORBIDDEN_CLASS_VIEW',
        'Forbidden',
        'Access denied. You are not assigned to view attendance for this class.',
        '/api/attendance/session'
      )
    );
    return;
  }

  try {
    const result = getAttendanceSessionWithRoster(db, req.user!, cId, dt);
    res.json(result);
  } catch (err: any) {
    if (err instanceof AttendanceServiceError) {
      res.status(err.problemDetails.status).json(err.problemDetails);
    } else {
      res.status(500).json(
        createProblemDetails(
          500,
          'INTERNAL_ERROR',
          'Internal Server Error',
          err.message || 'Failed to retrieve attendance session.',
          '/api/attendance/session'
        )
      );
    }
  }
});

// ============================================================================
// POST /api/attendance/session
// Save draft or submit finalized daily attendance register
// ============================================================================
router.post('/session', requireAuth, (req, res) => {
  const classId = Number(req.body?.classId);

  // Authorization check: must be assigned class teacher or admin
  if (isNaN(classId) || !canManageClassAttendance(req.user!, classId)) {
    res.status(403).json({
      error: 'Access denied. You are not assigned as the class teacher for this class.',
      ...createProblemDetails(
        403,
        'UNASSIGNED_CLASS_TEACHER',
        'Unassigned Class Teacher',
        'Access denied. You are not assigned as the class teacher for this class.',
        '/api/attendance/session'
      )
    });
    return;
  }

  const validation = validateAttendancePayload(req.body, '/api/attendance/session');
  if (!validation.valid) {
    res.status(validation.error!.status).json(validation.error);
    return;
  }

  const payload = validation.payload!;

  try {
    const result = processAttendanceSubmission(
      db,
      req.user!,
      payload,
      req.ip || '127.0.0.1'
    );
    res.json(result);
  } catch (err: any) {
    if (err instanceof AttendanceServiceError) {
      res.status(err.problemDetails.status).json(err.problemDetails);
    } else {
      res.status(500).json(
        createProblemDetails(
          500,
          'INTERNAL_ERROR',
          'Internal Server Error',
          err.message || 'Failed to submit attendance.',
          '/api/attendance/session'
        )
      );
    }
  }
});

// ============================================================================
// POST /api/attendance/sync
// Batched offline synchronization endpoint with per-item atomicity
// ============================================================================
router.post('/sync', requireAuth, (req, res) => {
  const queue = Array.isArray(req.body?.queue)
    ? req.body.queue
    : Array.isArray(req.body)
    ? req.body
    : [];

  if (queue.length === 0) {
    res.json({
      success: true,
      processedCount: 0,
      results: [],
      message: 'Empty sync queue received.'
    });
    return;
  }

  try {
    const result = processSyncBatch(
      db,
      req.user!,
      queue,
      req.ip || '127.0.0.1'
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json(
      createProblemDetails(
        500,
        'INTERNAL_ERROR',
        'Sync Batch Processing Error',
        err.message || 'Failed to process offline sync batch.',
        '/api/attendance/sync'
      )
    );
  }
});

// ============================================================================
// GET /api/attendance/reports/daily
// Summary of all classes for a specific date
// ============================================================================
router.get('/reports/daily', requireAuth, (req, res) => {
  const { date } = req.query;
  const dt = (date as string) || getColomboCivilDate();

  if (!isValidCivilDate(dt)) {
    res.status(400).json(
      createProblemDetails(
        400,
        'INVALID_CIVIL_DATE',
        'Invalid Civil Date',
        `The date '${dt}' is not a valid Gregorian calendar date in Asia/Colombo.`,
        '/api/attendance/reports/daily'
      )
    );
    return;
  }

  const classSummaries = db.prepare(`
    SELECT 
      c.id as class_id, c.name as class_name, c.grade,
      u.full_name as class_teacher_name,
      sess.id as session_id, sess.status as session_status, sess.updated_at as submitted_at,
      COUNT(DISTINCT CASE WHEN e.status = 'enrolled' AND s.status = 'Active' THEN e.student_id END) as enrolled_count,
      COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.student_id END) as present_count,
      COUNT(DISTINCT CASE WHEN ar.status = 'absent' THEN ar.student_id END) as absent_count,
      COUNT(DISTINCT CASE WHEN ar.status = 'late' THEN ar.student_id END) as late_count,
      COUNT(DISTINCT CASE WHEN ar.status = 'excused' THEN ar.student_id END) as excused_count
    FROM classes c
    LEFT JOIN users u ON c.class_teacher_id = u.id
    LEFT JOIN enrollments e ON e.class_id = c.id AND e.academic_year_id = c.academic_year_id AND e.status = 'enrolled'
    LEFT JOIN students s ON e.student_id = s.id AND s.status = 'Active'
    LEFT JOIN attendance_sessions sess ON sess.class_id = c.id AND sess.date = ?
    LEFT JOIN attendance_records ar ON ar.session_id = sess.id AND ar.student_id = e.student_id
    GROUP BY c.id
    ORDER BY c.grade ASC, c.name ASC
  `).all(dt);

  // List of all absent students on that date with contact info
  const absentStudents = db.prepare(`
    SELECT 
      s.id, s.admission_no, s.full_name, s.guardian_name, s.guardian_phone,
      c.name as class_name, ar.remarks
    FROM attendance_records ar
    JOIN attendance_sessions sess ON ar.session_id = sess.id
    JOIN students s ON ar.student_id = s.id
    JOIN classes c ON sess.class_id = c.id
    WHERE sess.date = ? AND ar.status = 'absent'
    ORDER BY c.grade ASC, c.name ASC, s.admission_no ASC
  `).all(dt);

  let classes = classSummaries;
  let absents = absentStudents;

  // Record-level permission check: non-admin teachers only see reports for their assigned classes
  if (req.user!.role !== 'admin') {
    const assignments = getUserAssignments(req.user!.id);
    const allowed = new Set(assignments.assignedClassIds);
    classes = classSummaries.filter((c: any) => allowed.has(Number(c.class_id)));
    const classMap = new Map<string, number>();
    classSummaries.forEach((c: any) => classMap.set(c.class_name, Number(c.class_id)));
    absents = absentStudents.filter((st: any) => {
      const cid = classMap.get(st.class_name);
      return cid ? allowed.has(cid) : false;
    });
  }

  res.json({
    date: dt,
    classes,
    absentStudents: absents
  });
});

// ============================================================================
// GET /api/attendance/reports/monthly
// Monthly Attendance Grid Report for a Class
// ============================================================================
router.get('/reports/monthly', requireAuth, (req, res) => {
  const { classId, year, month } = req.query;

  if (!classId || !year || !month) {
    res.status(400).json(
      createProblemDetails(
        400,
        'MISSING_REQUIRED_PARAMETERS',
        'Missing Parameters',
        'classId, year, and month are required.',
        '/api/attendance/reports/monthly'
      )
    );
    return;
  }

  const cId = Number(classId);
  const y = Number(year);
  const m = Number(month);

  if (isNaN(cId) || isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    res.status(400).json(
      createProblemDetails(
        400,
        'INVALID_PARAMETERS',
        'Invalid Parameters',
        'Invalid classId, year, or month parameters.',
        '/api/attendance/reports/monthly'
      )
    );
    return;
  }

  // Record-level permission check: must be admin or assigned to this class
  if (!canViewClassAttendance(req.user!, cId)) {
    res.status(403).json(
      createProblemDetails(
        403,
        'FORBIDDEN_CLASS_VIEW',
        'Forbidden',
        'Access denied. You are not assigned to view attendance for this class.',
        '/api/attendance/reports/monthly'
      )
    );
    return;
  }

  const classRow = db.prepare('SELECT academic_year_id FROM classes WHERE id = ?').get(cId) as
    | { academic_year_id: number | null }
    | undefined;

  const monthStr = m < 10 ? `0${m}` : `${m}`;
  const datePrefix = `${y}-${monthStr}%`;

  // Get active enrolled students
  const students = db.prepare(`
    SELECT s.id, s.admission_no, s.full_name, e.roll_number
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    WHERE e.class_id = ? AND e.academic_year_id = ? AND e.status = 'enrolled' AND s.status = 'Active'
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(cId, classRow?.academic_year_id || 1) as any[];

  // Get all attendance sessions in this month
  const sessions = db.prepare(`
    SELECT id, date, status, revision
    FROM attendance_sessions
    WHERE class_id = ? AND date LIKE ?
    ORDER BY date ASC
  `).all(cId, datePrefix) as any[];

  // Get all records in this month
  const records = db.prepare(`
    SELECT ar.student_id, ar.status, sess.date
    FROM attendance_records ar
    JOIN attendance_sessions sess ON ar.session_id = sess.id
    WHERE sess.class_id = ? AND sess.date LIKE ?
  `).all(cId, datePrefix) as any[];

  const studentMap: Record<number, Record<string, string>> = {};
  students.forEach((st) => {
    studentMap[st.id] = {};
  });

  records.forEach((r: any) => {
    if (studentMap[r.student_id]) {
      studentMap[r.student_id][r.date] = r.status;
    }
  });

  res.json({
    classId: cId,
    year: y,
    month: m,
    sessions,
    students,
    attendanceGrid: studentMap
  });
});

export default router;
