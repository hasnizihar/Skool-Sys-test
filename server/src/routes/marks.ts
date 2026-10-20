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
  MarkEntryInput
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
// NOTE: Legacy marks endpoint - strictly delegates to canonical workflow and enforces all Gate 3R invariants:
// 1. Mandatory baseRevision on existing sheets (no overwrite of stale drafts)
// 2. Strict cross-class student validation (no alien student insertion)
// 3. Strict subject eligibility (no marks for dropped/transferred students)
// 4. Verified assigned subject teacher ONLY (no admin/leadership write bypass)
// 5. Atomic validation before write (fail-closed, zero partial writes on error)
// 6. Complete revision snapshot and audit logging via canonical workflow
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

  const eId = Number(examId);
  const cId = Number(classId);
  const sId = Number(subjectId);

  // 1. Verify class and exam existence and academic year consistency
  const classRow = db.prepare('SELECT id, academic_year_id FROM classes WHERE id = ?').get(cId) as any;
  const examRow = db.prepare('SELECT id, academic_year_id FROM examinations WHERE id = ?').get(eId) as any;

  if (!classRow || !examRow) {
    res.status(404).json({ error: 'Class or Examination not found.' });
    return;
  }

  if (!classRow.academic_year_id || !examRow.academic_year_id) {
    res.status(400).json({ error: 'Missing academic year for class or examination.', code: 'MISSING_ACADEMIC_YEAR' });
    return;
  }

  if (classRow.academic_year_id !== examRow.academic_year_id) {
    res.status(400).json({
      error: `Academic year mismatch: examination year (${examRow.academic_year_id}) does not match class year (${classRow.academic_year_id}).`,
      code: 'ACADEMIC_YEAR_MISMATCH'
    });
    return;
  }

  const yearId = classRow.academic_year_id;

  // 2. Validate subject is offered for class in class_subjects
  const classSubject = db.prepare('SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?').get(cId, sId);
  if (!classSubject) {
    res.status(400).json({
      error: `Subject ID ${sId} is not offered for class ID ${cId}.`,
      code: 'SUBJECT_NOT_OFFERED'
    });
    return;
  }

  // 3. Permission check: Verified assigned subject teacher ONLY (P0-02 least privilege)
  const assignment = db.prepare(`
    SELECT teacher_id FROM teacher_assignments
    WHERE class_id = ? AND subject_id = ? AND assignment_type = 'subject_teacher' AND academic_year_id = ? AND teacher_id = ?
  `).get(cId, sId, yearId, user.id);

  let sheet = db.prepare('SELECT * FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(eId, cId, sId) as any;

  const isAssignedTeacher = Boolean(assignment) || (sheet && sheet.teacher_id !== null && Number(sheet.teacher_id) === user.id && user.role === 'subject_teacher');

  if (!isAssignedTeacher) {
    res.status(403).json({
      error: 'Access denied: Only the verified assigned subject teacher is authorized to enter or submit marks.',
      code: 'UNASSIGNED_TEACHER'
    });
    return;
  }

  // 4. Lock & Concurrency check (P0-01)
  if (sheet) {
    if (!['draft', 'returned'].includes(sheet.status)) {
      res.status(403).json({
        error: `Sheet is locked in status '${sheet.status}' and cannot be overwritten via legacy marks entry.`,
        code: 'SHEET_LOCKED'
      });
      return;
    }

    // MANDATORY Gate 3R: baseRevision is REQUIRED when updating an existing sheet
    if (baseRevision === undefined || baseRevision === null) {
      res.status(400).json({
        error: 'baseRevision is required when updating an existing marks sheet.',
        code: 'MISSING_BASE_REVISION'
      });
      return;
    }

    const baseRevNum = Number(baseRevision);
    if (sheet.revision !== baseRevNum) {
      res.status(409).json({
        error: `Concurrent modification detected. Sheet revision is ${sheet.revision}, but your request supplied baseRevision ${baseRevNum}. Please reload the latest sheet before saving.`,
        code: 'STALE_REVISION',
        currentRevision: sheet.revision,
        baseRevision: baseRevNum
      });
      return;
    }
  }

  // 5. Pre-validate student membership, subject eligibility, and score validity
  for (const m of marks) {
    const studentId = Number(m.student_id ?? m.studentId);
    if (!studentId || isNaN(studentId)) {
      res.status(400).json({ error: 'Each mark must contain a valid student_id.', code: 'INVALID_STUDENT_ID' });
      return;
    }

    // Cross-class check: Must be actively enrolled in class cId
    const enrollment = db.prepare(`
      SELECT id FROM enrollments
      WHERE student_id = ? AND class_id = ? AND academic_year_id = ? AND status = 'enrolled'
    `).get(studentId, cId, yearId);

    if (!enrollment) {
      res.status(400).json({
        error: `Student ID ${studentId} is not actively enrolled in class ${cId}.`,
        code: 'CROSS_CLASS_STUDENT'
      });
      return;
    }

    // Subject eligibility check: Must not be dropped or transferred
    const elig = isStudentEligibleForSubject(studentId, sId, yearId);
    if (elig.status === 'dropped' || elig.status === 'transferred') {
      res.status(400).json({
        error: `Student ID ${studentId} is not eligible for subject (status: '${elig.status}'). Dropped or transferred students cannot receive marks.`,
        code: 'INELIGIBLE_SUBJECT_ENROLLMENT'
      });
      return;
    }

    // Score precision, bounds, and absent/exempt validation
    const isAbsent = Boolean(m.is_absent || m.isAbsent);
    const isExempt = Boolean(m.is_exempt || m.isExempt);
    const hasScore = m.score !== null && m.score !== undefined && m.score !== '';

    if (isAbsent && isExempt) {
      res.status(400).json({
        error: `Student ID ${studentId} cannot be marked both absent and exempt.`,
        code: 'INVALID_ASSESSMENT_STATUS'
      });
      return;
    }

    if (hasScore) {
      const numScore = Number(m.score);
      if (isNaN(numScore)) {
        res.status(400).json({
          error: `Score '${m.score}' for student ID ${studentId} is not a valid number.`,
          code: 'INVALID_SCORE'
        });
        return;
      }
      if (numScore < 0.0 || numScore > 100.0) {
        res.status(400).json({
          error: `Score ${numScore} for student ID ${studentId} is out of bounds [0, 100].`,
          code: 'SCORE_OUT_OF_BOUNDS'
        });
        return;
      }
      if (Math.round(numScore * 10) / 10 !== numScore) {
        res.status(400).json({
          error: `Score ${numScore} for student ID ${studentId} exceeds allowed 1-decimal precision. Silent rounding or truncation is strictly prohibited. Single-decimal precision required.`,
          code: 'INVALID_SCORE_PRECISION'
        });
        return;
      }
    }
  }

  // 6. Pre-validate submission prerequisites if targetStatus === 'submitted'
  if (targetStatus === 'submitted') {
    const participatingStudents = db.prepare(`
      SELECT s.id, s.admission_no, s.full_name, sse.enrollment_status
      FROM student_subject_enrollments sse
      JOIN enrollments e ON sse.student_id = e.student_id AND sse.academic_year_id = e.academic_year_id
      JOIN students s ON sse.student_id = s.id
      WHERE sse.subject_id = ?
        AND e.class_id = ?
        AND e.status = 'enrolled'
        AND sse.enrollment_status NOT IN ('dropped', 'transferred')
      ORDER BY e.roll_number ASC, s.admission_no ASC
    `).all(sId, cId) as any[];

    if (participatingStudents.length === 0) {
      res.status(400).json({
        error: 'Cannot submit marks sheet: No active participating students enrolled for this subject in the class.',
        code: 'EMPTY_ROSTER'
      });
      return;
    }

    const marksByStudent = new Map<number, any>();
    for (const m of marks) {
      const studentId = Number(m.student_id ?? m.studentId);
      marksByStudent.set(studentId, m);
    }

    for (const stu of participatingStudents) {
      if (stu.enrollment_status !== 'confirmed') {
        res.status(422).json({
          error: `Cannot submit marks sheet: Participating student ${stu.full_name} (${stu.admission_no}) has unconfirmed subject enrollment ('${stu.enrollment_status}'). Official submission requires all participating students to have officially confirmed subject enrollment by academic leadership.`,
          code: 'UNCONFIRMED_ENROLLMENT'
        });
        return;
      }

      const incomingMark = marksByStudent.get(stu.id);
      let isAssessed = false;
      if (incomingMark) {
        const isAbsent = Boolean(incomingMark.is_absent);
        const isExempt = Boolean(incomingMark.is_exempt);
        const hasScore = incomingMark.score !== null && incomingMark.score !== undefined && incomingMark.score !== '';
        if (isAbsent || isExempt || hasScore) {
          isAssessed = true;
        }
      } else if (sheet) {
        const existingMark = db.prepare(`
          SELECT assessment_status FROM marks WHERE examination_id = ? AND subject_id = ? AND student_id = ?
        `).get(eId, sId, stu.id) as any;
        if (existingMark && existingMark.assessment_status !== 'NOT_ASSESSED') {
          isAssessed = true;
        }
      }

      if (!isAssessed) {
        res.status(400).json({
          error: `Cannot submit marks sheet: All participating students must be assessed. Student ${stu.full_name} (${stu.admission_no}) is currently unassessed.`,
          code: 'UNASSESSED_STUDENT'
        });
        return;
      }
    }
  }

  // All preconditions met! Now execute canonical draft save and optional submission.
  try {
    let sheetId: number;
    let effectiveBaseRev: number;

    if (!sheet) {
      const created = ensureMarksSheet(eId, cId, sId, user);
      sheetId = created.id;
      effectiveBaseRev = 1;
    } else {
      sheetId = sheet.id;
      effectiveBaseRev = Number(baseRevision);
    }

    const formattedMarks: MarkEntryInput[] = marks.map((m: any) => ({
      studentId: Number(m.student_id ?? m.studentId),
      score: (m.score === null || m.score === undefined || m.score === '') ? null : Number(m.score),
      assessmentStatus: (m.is_absent ? 'ABSENT' : (m.is_exempt ? 'EXEMPT' : (m.score !== null && m.score !== undefined && m.score !== '' ? 'PRESENT' : 'NOT_ASSESSED'))) as 'PRESENT' | 'ABSENT' | 'EXEMPT' | 'NOT_ASSESSED',
      remarks: m.remarks
    }));

    const draftRes = saveDraftMarks({
      sheetId,
      baseRevision: effectiveBaseRev,
      marks: formattedMarks,
      user,
      ipAddress: req.ip
    });

    let finalRevision = draftRes.newRevision;

    if (targetStatus === 'submitted') {
      const submitRes = submitMarksSheet({
        sheetId,
        baseRevision: draftRes.newRevision,
        user,
        ipAddress: req.ip
      });
      finalRevision = submitRes.newRevision;
    }

    logAudit(user.id, user.username, 'MARKS_SUBMIT', 'marks', `${eId}-${sId}-${cId}`, { examId: eId, subjectId: sId, count: marks.length }, req.ip);

    res.json({
      success: true,
      message: `Marks sheet ${targetStatus === 'submitted' ? 'submitted' : 'saved'} successfully for ${marks.length} students.`,
      sheetId,
      revision: finalRevision,
      status: targetStatus
    });
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
    const isLeadership = user.role === 'admin' || hasAcademicStaffRole(
      user.id,
      ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'],
      student.academic_year_id || exam.academic_year_id,
      Number(student.grade)
    );

    if (!isLeadership) {
      res.status(403).json({
        error: 'Access denied: Unpublished examination results are confidential. Ordinary class and subject teachers cannot view unreleased report cards.',
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
    is_provisional_preview: !isPublished,
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

