import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, getUserAssignments, canManageMarks, canViewMarksSheet, canAccessClass } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { isStudentEligibleForSubject } from '../services/studentEnrollmentService.js';
import { hasAcademicStaffRole } from '../services/academicAuthorizationService.js';
import {
  ensureMarksSheet,
  getMarksSheetDetails,
  saveDraftMarks,
  submitMarksSheet,
  reviewMarksSheet,
  approveMarksSheet,
  getMarksSheetHistory,
  getMarksSheetRevisionSnapshot,
  calcGradeLetter,
  MarkEntryInput,
  saveOrSubmitLegacyMarksSheet
} from '../services/marksWorkflowService.js';

const router = Router();

// Marks Sheet for Class, Exam, and Subject
router.get('/sheet', requireAuth, (req, res) => {
  const { examId, classId, subjectId } = req.query;

  if (!examId || !classId || !subjectId) {
    res.status(400).json({ error: 'examId, classId, and subjectId are required.' });
    return;
  }

  const eId = Number(examId);
  const cId = Number(classId);
  const sId = Number(subjectId);

  // Record-level permission check: must be admin or assigned to class/subject
  if (!canViewMarksSheet(req.user!, cId, sId)) {
    res.status(403).json({ error: 'Access denied. You are not assigned to view marks for this class or subject.' });
    return;
  }

  const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(eId) as any;
  const classInfo = db.prepare('SELECT * FROM classes WHERE id = ?').get(cId) as any;
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(sId) as any;

  if (!exam || !classInfo || !subject) {
    res.status(404).json({ error: 'Exam, Class, or Subject not found.' });
    return;
  }

  // Unpublished examination results confidentiality
  if (exam.is_published !== 1 && exam.status !== 'published') {
    if (!canViewMarksSheet(req.user!, cId, sId) && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Access denied. Unpublished examination results are confidential.' });
      return;
    }
  }

  // Fetch sheet container metadata
  const sheet = db.prepare(`
    SELECT * FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?
  `).get(eId, cId, sId) as any;

  const yearId = classInfo.academic_year_id || exam.academic_year_id;

  // Enrolled students with current marks
  const rawRoster = db.prepare(`
    SELECT s.id as student_id, s.admission_no, s.full_name, s.calling_name,
           e.roll_number,
           m.id as mark_id, m.score, m.is_absent, m.is_exempt, m.max_score, m.grade_letter, m.status as mark_status, m.updated_at
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    LEFT JOIN marks m ON m.student_id = s.id AND m.examination_id = ? AND m.subject_id = ? AND m.class_id = ?
    WHERE e.class_id = ? AND e.status = 'enrolled'
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(eId, sId, cId, cId) as any[];

  // Enhance roster with student-specific subject eligibility tags
  const roster = rawRoster.map(r => {
    const elig = isStudentEligibleForSubject(r.student_id, sId, yearId);
    return {
      ...r,
      is_eligible_for_draft: elig.isEligibleForDraft,
      is_officially_confirmed: elig.isOfficiallyConfirmed,
      enrollment_status: elig.status || 'not_enrolled',
      enrollment_category: elig.category || null
    };
  });

  // Statistics
  let validScores: number[] = [];
  let gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, S: 0, F: 0, AB: 0, EX: 0, unmarked: 0 };

  roster.forEach(r => {
    if (r.is_absent) {
      gradeCounts.AB++;
    } else if (r.is_exempt) {
      gradeCounts.EX++;
    } else if (r.score !== null && r.score !== undefined) {
      validScores.push(Number(r.score));
      const g = r.grade_letter || calcGradeLetter(r.score, 'PRESENT', r.max_score || 100);
      if (gradeCounts[g] !== undefined) gradeCounts[g]++;
    } else {
      gradeCounts.unmarked++;
    }
  });

  const totalGraded = validScores.length;
  const avg = totalGraded > 0 ? Math.round((validScores.reduce((a, b) => a + b, 0) / totalGraded) * 10) / 10 : 0;
  const max = totalGraded > 0 ? Math.max(...validScores) : 0;
  const min = totalGraded > 0 ? Math.min(...validScores) : 0;
  const passed = validScores.filter(s => s >= 35).length;
  const passRate = totalGraded > 0 ? Math.round((passed / totalGraded) * 100) : 0;

  res.json({
    exam,
    class: classInfo,
    subject,
    sheet: sheet || null,
    roster,
    stats: {
      totalStudents: roster.length,
      totalGraded,
      average: avg,
      maxScore: max,
      minScore: min,
      passRate,
      gradeCounts
    }
  });
});

// Bulk Save Marks for Subject Sheet
// NOTE: Legacy marks endpoint - strictly delegates to atomic canonical workflow:
// 1. Mandatory baseRevision on existing sheets (no overwrite of stale drafts)
// 2. Strict cross-class student validation (no alien student insertion)
// 3. Strict positive subject eligibility (no marks for non-enrolled, dropped, or transferred students)
// 4. Verified actively assigned subject teacher ONLY (no admin/leadership write bypass, no sheet.teacher_id fallback)
// 5. Fail-closed atomic transaction: invalid first writes never leave an empty sheet behind; failed submit rolls back draft
// 6. Complete full-state revision snapshot and audit logging via canonical workflow
router.post('/sheet', requireAuth, (req, res) => {
  const { examId, classId, subjectId, marks, status, baseRevision } = req.body;
  const user = req.user!;

  if (!examId || !classId || !subjectId || !Array.isArray(marks)) {
    res.status(400).json({ error: 'Missing examId, classId, subjectId, or marks array.' });
    return;
  }

  // Security gate: Client cannot inject privileged workflow statuses via legacy endpoint
  const targetStatus = status || 'draft';
  if (!['draft', 'submitted'].includes(targetStatus)) {
    res.status(400).json({
      error: `Invalid status '${targetStatus}': legacy marks entry may only set 'draft' or 'submitted'. Privileged workflow statuses require formal moderation.`
    });
    return;
  }

  // Pre-validate remarks type upfront before any database interaction (P1-04)
  for (const m of marks) {
    if (m.remarks !== null && m.remarks !== undefined && typeof m.remarks !== 'string') {
      res.status(400).json({
        error: `Invalid remarks for student ID ${m.student_id ?? m.studentId}: remarks must be a string or null.`,
        code: 'INVALID_REMARKS_TYPE'
      });
      return;
    }
  }

  try {
    const formattedMarks: MarkEntryInput[] = marks.map((m: any) => ({
      studentId: Number(m.student_id ?? m.studentId),
      score: (m.score === null || m.score === undefined || m.score === '') ? null : Number(m.score),
      maxScore: m.max_score ? Number(m.max_score) : 100.0,
      assessmentStatus: (m.is_absent ? 'ABSENT' : (m.is_exempt ? 'EXEMPT' : (m.score !== null && m.score !== undefined && m.score !== '' ? 'PRESENT' : 'NOT_ASSESSED'))) as 'PRESENT' | 'ABSENT' | 'EXEMPT' | 'NOT_ASSESSED',
      remarks: m.remarks
    }));

    const result = saveOrSubmitLegacyMarksSheet({
      examId: Number(examId),
      classId: Number(classId),
      subjectId: Number(subjectId),
      marks: formattedMarks,
      targetStatus,
      baseRevision: baseRevision !== undefined && baseRevision !== null ? Number(baseRevision) : undefined,
      user,
      ipAddress: req.ip
    });

    logAudit(user.id, user.username, 'MARKS_SUBMIT', 'marks', `${examId}-${subjectId}-${classId}`, { examId, subjectId, count: marks.length }, req.ip);

    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// Student Terminal Report Card
router.get('/student-report/:studentId/:examId', requireAuth, (req, res) => {
  const studentId = Number(req.params.studentId);
  const examId = Number(req.params.examId);
  const user = req.user!;

  const student = db.prepare(`
    SELECT s.*, c.id as class_id, c.name as class_name, c.grade, e.roll_number,
           u.full_name as class_teacher_name, ay.name as academic_year, ay.id as academic_year_id
    FROM students s
    JOIN enrollments e ON s.id = e.student_id AND e.status = 'enrolled'
    JOIN classes c ON e.class_id = c.id
    LEFT JOIN users u ON c.class_teacher_id = u.id
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    WHERE s.id = ?
  `).get(studentId) as any;

  if (!student) {
    res.status(404).json({ error: 'Student not enrolled or not found.' });
    return;
  }

  const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examId) as any;
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  const isPublished = exam.is_published === 1 || exam.status === 'published';

  // MANDATORY Gate 3R Fix P0-03: Unpublished examination results confidentiality
  // In-scope class teachers and subject teachers MUST be blocked prior to official publication!
  // Only authorized academic leadership (Principal, VP Academic, Section Head, or Exam Coordinator)
  // may preview unreleased report cards with explicit watermarking.
  if (!isPublished) {
    const isLeadership = hasAcademicStaffRole(
      user.id,
      ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'],
      student.academic_year_id || exam.academic_year_id,
      Number(student.grade)
    );

    if (!isLeadership) {
      res.status(403).json({
        error: 'Access denied: Unpublished examination results are confidential. Ordinary class teachers, subject teachers, and unscoped administrators cannot view unreleased report cards. Access requires an active academic leadership appointment in-scope for this student\'s academic year and grade.',
        code: 'UNPUBLISHED_RESULTS_LOCKED'
      });
      return;
    }
  } else {
    // For published exams, require admin or class access
    if (user.role !== 'admin' && !canAccessClass(user, student.class_id)) {
      res.status(403).json({ error: 'Access denied. You are not assigned to this student\'s class.' });
      return;
    }
  }

  // Get marks for all subjects assigned to this class
  const classSubjects = db.prepare(`
    SELECT sub.id as subject_id, sub.code as subject_code, sub.name as subject_name, sub.category,
           m.score, m.is_absent, m.is_exempt, m.max_score, m.grade_letter, m.status as mark_status,
           u.full_name as teacher_name
    FROM class_subjects cs
    JOIN subjects sub ON cs.subject_id = sub.id
    LEFT JOIN marks m ON m.student_id = ? AND m.subject_id = sub.id AND m.examination_id = ?
    LEFT JOIN teacher_assignments ta ON ta.class_id = cs.class_id AND ta.subject_id = sub.id
    LEFT JOIN users u ON ta.teacher_id = u.id
    WHERE cs.class_id = ?
    ORDER BY sub.category ASC, sub.name ASC
  `).all(studentId, examId, student.class_id) as any[];

  // Attendance summary
  const attendance = db.prepare(`
    SELECT 
      COUNT(*) as total_school_days,
      SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present_days,
      SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late_days,
      SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_days
    FROM attendance_records ar
    JOIN attendance_sessions sess ON ar.session_id = sess.id
    WHERE ar.student_id = ? AND sess.class_id = ?
  `).get(studentId, student.class_id) as any;

  // Calculate Student Total & Average
  let totalScore = 0;
  let gradedCount = 0;

  classSubjects.forEach(s => {
    if (s.score !== null && !s.is_absent && !s.is_exempt) {
      totalScore += Number(s.score);
      gradedCount++;
    }
  });

  const average = gradedCount > 0 ? Math.round((totalScore / gradedCount) * 10) / 10 : 0;

  // MANDATORY Gate 3R Fix P0-04:
  // 1. Truthful attendance reporting: No fake 100% attendance. If 0 days, return null and 'Not Recorded'.
  // 2. Official rank calculation deferred to Gate 4: Return rank: null with notice to avoid misleading unapproved values.
  const hasAttendanceRecords = Boolean(attendance && attendance.total_school_days > 0);
  const attendancePercentage = hasAttendanceRecords
    ? Math.round(((attendance.present_days + attendance.late_days) / attendance.total_school_days) * 100)
    : null;

  res.json({
    student,
    exam,
    subjects: classSubjects,
    performance: {
      totalScore,
      gradedSubjectCount: gradedCount,
      average,
      rank: null,
      classRankNotice: 'Official class rank calculation is deferred to Gate 4 publication governance.'
    },
    attendance: {
      totalSchoolDays: attendance?.total_school_days || 0,
      presentDays: attendance?.present_days || 0,
      lateDays: attendance?.late_days || 0,
      absentDays: attendance?.absent_days || 0,
      attendancePercentage,
      status: hasAttendanceRecords ? 'Recorded' : 'Not Recorded'
    },
    is_provisional: !isPublished,
    is_provisional_preview: !isPublished,
    provisional_notice: !isPublished ? 'PROVISIONAL & UNPUBLISHED: This report card contains unverified/unpublished examination results intended solely for internal academic leadership review.' : null,
    confidentiality_watermark: !isPublished ? {
      is_confidential: true,
      watermark_text: 'UNPUBLISHED - CONFIDENTIAL LEADERSHIP PREVIEW ONLY',
      previewed_by_user_id: user.id,
      previewed_by_name: user.full_name || user.username,
      previewed_at: new Date().toISOString()
    } : null
  });
});

// PR-005 Marks Workflow: Retrieve Sheet Details & Roster
router.get('/sheets/:id', requireAuth, (req, res) => {
  try {
    const sheetId = Number(req.params.id);
    if (!sheetId || isNaN(sheetId)) {
      res.status(400).json({ error: 'Valid marks sheet ID is required.' });
      return;
    }
    const data = getMarksSheetDetails(sheetId, req.user!);
    res.json(data);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PR-005 Marks Workflow: Atomic Draft Save with baseRevision CAS Concurrency
router.post('/sheets/:id/save-draft', requireAuth, (req, res) => {
  try {
    const sheetId = Number(req.params.id);
    const { baseRevision, marks } = req.body;
    const result = saveDraftMarks({
      sheetId,
      baseRevision: Number(baseRevision),
      marks,
      user: req.user!,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: err.message,
      code: err.code,
      currentRevision: err.currentRevision,
      baseRevision: err.baseRevision
    });
  }
});

// PR-005 Marks Workflow: Submit Marks Sheet (Enforces Official Confirmation)
router.post('/sheets/:id/submit', requireAuth, (req, res) => {
  try {
    const sheetId = Number(req.params.id);
    const { baseRevision, notes } = req.body;
    const result = submitMarksSheet({
      sheetId,
      baseRevision: Number(baseRevision),
      notes,
      user: req.user!,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PR-005 Marks Workflow: Review / Endorse or Return Sheet (Enforces SoD Anti-Self-Review)
router.post('/sheets/:id/review', requireAuth, (req, res) => {
  try {
    const sheetId = Number(req.params.id);
    const { baseRevision, decision, remarks } = req.body;
    const result = reviewMarksSheet({
      sheetId,
      baseRevision: Number(baseRevision),
      decision,
      remarks,
      user: req.user!,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PR-005 Marks Workflow: Approve Sheet (Enforces Independent Approver SoD)
router.post('/sheets/:id/approve', requireAuth, (req, res) => {
  try {
    const sheetId = Number(req.params.id);
    const { baseRevision, remarks } = req.body;
    const result = approveMarksSheet({
      sheetId,
      baseRevision: Number(baseRevision),
      remarks,
      user: req.user!,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PR-005 Marks Workflow: Audit History & Lifetime Revisions
router.get('/sheets/:id/history', requireAuth, (req, res) => {
  try {
    const sheetId = Number(req.params.id);
    const history = getMarksSheetHistory(sheetId, req.user!);
    res.json(history);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PR-005 Marks Workflow: Retrieve Point-in-time Immutable Revision Snapshot
router.get('/sheets/:id/revisions/:revision', requireAuth, (req, res) => {
  try {
    const sheetId = Number(req.params.id);
    const revision = Number(req.params.revision);
    if (!sheetId || isNaN(sheetId) || !revision || isNaN(revision)) {
      res.status(400).json({ error: 'Valid sheet ID and revision number are required.' });
      return;
    }
    const snapshot = getMarksSheetRevisionSnapshot(sheetId, revision, req.user!);
    res.json(snapshot);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

export default router;

