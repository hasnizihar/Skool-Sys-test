import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, getUserAssignments, canManageMarks, canViewMarksSheet, canAccessClass } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { isStudentEligibleForSubject } from '../services/studentEnrollmentService.js';
import {
  ensureMarksSheet,
  getMarksSheetDetails,
  saveDraftMarks,
  submitMarksSheet,
  reviewMarksSheet,
  approveMarksSheet,
  getMarksSheetHistory
} from '../services/marksWorkflowService.js';

const router = Router();

function calcGradeLetter(score: number | null, isAbsent: boolean, isExempt: boolean): string {
  if (isAbsent) return 'AB';
  if (isExempt) return 'EX';
  if (score === null || score === undefined) return '-';
  if (score >= 75) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'S';
  return 'F';
}

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
      const g = r.grade_letter || calcGradeLetter(r.score, false, false);
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
// NOTE: Legacy marks endpoint - known security boundary pending Gate 3 comprehensive refactoring.
// Enforces basic fail-closed gates (no privileged status injection, no locked sheet overwrite, no year fallback).
router.post('/sheet', requireAuth, (req, res) => {
  const { examId, classId, subjectId, marks, status } = req.body;
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

  if (!canManageMarks(user, cId, sId)) {
    res.status(403).json({ error: 'Access denied. You are not authorized to enter marks for this class and subject.' });
    return;
  }

  // Verify class and exam existence and academic year consistency without fabricated fallback
  const classRow = db.prepare('SELECT id, academic_year_id FROM classes WHERE id = ?').get(cId) as any;
  const examRow = db.prepare('SELECT id, academic_year_id FROM examinations WHERE id = ?').get(eId) as any;

  if (!classRow || !examRow) {
    res.status(404).json({ error: 'Class or Examination not found.' });
    return;
  }

  if (!classRow.academic_year_id || !examRow.academic_year_id) {
    res.status(400).json({ error: 'Missing or indeterminate academic year for class or examination.' });
    return;
  }

  if (classRow.academic_year_id !== examRow.academic_year_id) {
    res.status(400).json({
      error: `Academic year mismatch: examination year (${examRow.academic_year_id}) does not match class year (${classRow.academic_year_id}).`
    });
    return;
  }

  const yearId = classRow.academic_year_id;

  // Check if sheet exists and whether it is locked against direct legacy writes
  let sheet = db.prepare('SELECT id, status, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(eId, cId, sId) as { id: number; status: string; revision: number } | undefined;

  if (sheet && sheet.status !== 'draft') {
    res.status(403).json({
      error: `Sheet is locked in status '${sheet.status}' and cannot be overwritten via legacy marks entry.`
    });
    return;
  }

  // CAS Concurrency check if baseRevision is provided
  if (req.body.baseRevision !== undefined && sheet) {
    const baseRev = Number(req.body.baseRevision);
    if (sheet.revision !== baseRev) {
      res.status(409).json({
        error: `Concurrent modification detected. Sheet revision is ${sheet.revision}, but baseRevision was ${baseRev}. Please reload the latest sheet before saving.`,
        code: 'STALE_REVISION',
        currentRevision: sheet.revision,
        baseRevision: baseRev
      });
      return;
    }
  }

  // Pre-validate all marks inputs to prevent partial writes and avoid silent clamping or truncation
  interface ValidatedMark {
    studentId: number;
    score: number | null;
    assessmentStatus: string;
    gradeLetter: string;
  }
  const validatedMarks: ValidatedMark[] = [];

  for (const m of marks) {
    const studentId = Number(m.student_id);
    if (!studentId || isNaN(studentId)) {
      res.status(400).json({ error: 'Each mark must contain a valid student_id.' });
      return;
    }

    const isAbsent = Boolean(m.is_absent);
    const isExempt = Boolean(m.is_exempt);

    if (isAbsent && isExempt) {
      res.status(400).json({ error: `Student ID ${studentId} cannot be marked both absent and exempt.` });
      return;
    }

    let assessmentStatus = 'PRESENT';
    let score: number | null = null;

    if (isAbsent) {
      if (m.score !== null && m.score !== undefined && m.score !== '') {
        res.status(400).json({ error: `Student ID ${studentId} is marked absent but has a score provided.` });
        return;
      }
      assessmentStatus = 'ABSENT';
      score = null;
    } else if (isExempt) {
      if (m.score !== null && m.score !== undefined && m.score !== '') {
        res.status(400).json({ error: `Student ID ${studentId} is marked exempt but has a score provided.` });
        return;
      }
      assessmentStatus = 'EXEMPT';
      score = null;
    } else if (m.score === null || m.score === '' || m.score === undefined) {
      assessmentStatus = 'NOT_ASSESSED';
      score = null;
    } else {
      const numScore = Number(m.score);
      if (isNaN(numScore)) {
        res.status(400).json({ error: `Score '${m.score}' for student ID ${studentId} is not a valid number.` });
        return;
      }
      if (numScore < 0.0 || numScore > 100.0) {
        res.status(400).json({ error: `Score ${numScore} for student ID ${studentId} is out of bounds [0, 100].` });
        return;
      }
      if (Math.round(numScore * 10) / 10 !== numScore) {
        res.status(400).json({ error: `Score ${numScore} for student ID ${studentId} exceeds allowed 1-decimal precision.` });
        return;
      }
      assessmentStatus = 'PRESENT';
      score = numScore;
    }

    const gradeLetter = calcGradeLetter(score, isAbsent, isExempt);
    validatedMarks.push({
      studentId,
      score,
      assessmentStatus,
      gradeLetter
    });
  }

  // Gate 3 guard: If targetStatus === 'submitted', verify official confirmation of all students
  if (targetStatus === 'submitted') {
    for (const m of marks) {
      const studentId = Number(m.student_id);
      const elig = isStudentEligibleForSubject(studentId, sId, yearId);
      if (!elig.isOfficiallyConfirmed) {
        res.status(422).json({
          error: `Cannot submit marks sheet: student ID ${studentId} has unconfirmed subject enrollment ('${elig.status}'). Official submission requires all students to have officially confirmed subject enrollment by academic leadership.`,
          code: 'UNCONFIRMED_ENROLLMENT'
        });
        return;
      }
    }
  }

  // Atomically write sheet and marks
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const nextRevision = sheet ? sheet.revision + 1 : 1;
    if (!sheet) {
      const result = db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, revision, status)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(eId, cId, sId, yearId, user.id, targetStatus);
      sheet = { id: Number(result.lastInsertRowid), status: targetStatus, revision: 1 };
    } else {
      db.prepare("UPDATE marks_sheets SET status = ?, revision = ?, updated_at = datetime('now') WHERE id = ?").run(targetStatus, nextRevision, sheet.id);
      sheet.revision = nextRevision;
    }

    const upsert = db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status, grade_letter, status, entered_by_user_id, updated_at)
      VALUES (?, ?, ?, ?, ?, 100, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(examination_id, subject_id, student_id) DO UPDATE SET
        sheet_id = excluded.sheet_id,
        score = excluded.score,
        assessment_status = excluded.assessment_status,
        grade_letter = excluded.grade_letter,
        status = excluded.status,
        entered_by_user_id = excluded.entered_by_user_id,
        updated_at = datetime('now')
    `);

    const auditStmt = db.prepare(`
      INSERT INTO marks_audit_history (
        mark_id, sheet_id, examination_id, student_id, subject_id,
        action, actor_user_id, previous_score, new_score, previous_status, new_status, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const vm of validatedMarks) {
      const prevMark = db.prepare(`
        SELECT id, score, assessment_status FROM marks
        WHERE examination_id = ? AND subject_id = ? AND student_id = ?
      `).get(eId, sId, vm.studentId) as any;

      upsert.run(
        sheet.id,
        eId, cId, sId, vm.studentId,
        vm.score,
        vm.assessmentStatus,
        vm.gradeLetter,
        targetStatus,
        user.id
      );

      const markRow = db.prepare(`
        SELECT id FROM marks WHERE examination_id = ? AND subject_id = ? AND student_id = ?
      `).get(eId, sId, vm.studentId) as any;

      auditStmt.run(
        markRow?.id || 0,
        sheet.id,
        eId,
        vm.studentId,
        sId,
        targetStatus === 'submitted' ? 'SUBMISSION' : 'DRAFT_SAVE',
        user.id,
        prevMark?.score ?? null,
        vm.score,
        prevMark?.assessment_status ?? null,
        vm.assessmentStatus,
        req.ip || '127.0.0.1'
      );
    }

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {}
    throw err;
  }

  logAudit(user.id, user.username, 'MARKS_SUBMIT', 'marks', `${eId}-${sId}-${cId}`, { examId: eId, subjectId: sId, count: marks.length }, req.ip);

  res.json({
    success: true,
    message: `Marks sheet saved successfully for ${marks.length} students.`,
    sheetId: sheet.id,
    revision: sheet.revision,
    status: targetStatus
  });
});

// Student Terminal Report Card
router.get('/student-report/:studentId/:examId', requireAuth, (req, res) => {
  const studentId = Number(req.params.studentId);
  const examId = Number(req.params.examId);

  const student = db.prepare(`
    SELECT s.*, c.id as class_id, c.name as class_name, c.grade, e.roll_number,
           u.full_name as class_teacher_name, ay.name as academic_year
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

  // Record-level permission check: non-admin teachers can only view reports for students in their assigned classes
  if (req.user!.role !== 'admin' && !canAccessClass(req.user!, student.class_id)) {
    res.status(403).json({ error: 'Access denied. You are not assigned to this student\'s class.' });
    return;
  }

  const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examId) as any;
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  // Unpublished examination results confidentiality
  if (exam.is_published !== 1 && exam.status !== 'published') {
    if (req.user!.role !== 'admin' && !canAccessClass(req.user!, student.class_id)) {
      res.status(403).json({ error: 'Access denied. Unpublished examination results are confidential.' });
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

  // Calculate Student Total, Average & Rank in Class
  let totalScore = 0;
  let gradedCount = 0;

  classSubjects.forEach(s => {
    if (s.score !== null && !s.is_absent && !s.is_exempt) {
      totalScore += Number(s.score);
      gradedCount++;
    }
  });

  const average = gradedCount > 0 ? Math.round((totalScore / gradedCount) * 10) / 10 : 0;

  // Calculate Rank in Class for this Exam
  const classRanks = db.prepare(`
    SELECT m.student_id, AVG(m.score) as student_avg
    FROM marks m
    WHERE m.examination_id = ? AND m.class_id = ? AND m.score IS NOT NULL AND m.is_absent = 0
    GROUP BY m.student_id
    ORDER BY student_avg DESC
  `).all(examId, student.class_id) as any[];

  let rank = '-';
  const foundRankIndex = classRanks.findIndex(r => r.student_id === studentId);
  if (foundRankIndex !== -1) {
    rank = `${foundRankIndex + 1} of ${classRanks.length}`;
  }

  res.json({
    student,
    exam,
    subjects: classSubjects,
    performance: {
      totalScore,
      gradedSubjectCount: gradedCount,
      average,
      rank,
      totalClassStudents: classRanks.length
    },
    attendance: {
      totalSchoolDays: attendance?.total_school_days || 0,
      presentDays: attendance?.present_days || 0,
      lateDays: attendance?.late_days || 0,
      absentDays: attendance?.absent_days || 0,
      attendancePercentage: attendance?.total_school_days > 0 
        ? Math.round(((attendance.present_days + attendance.late_days) / attendance.total_school_days) * 100) 
        : 100
    }
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

export default router;
