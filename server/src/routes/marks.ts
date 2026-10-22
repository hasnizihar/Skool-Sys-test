import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, getUserAssignments, canManageMarks, canViewMarksSheet, canAccessClass } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { isStudentEligibleForSubject } from '../services/studentEnrollmentService.js';
import { hasAcademicStaffRole, getActiveStaffAuthorizations, doesBandCoverGrade } from '../services/academicAuthorizationService.js';
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
import { publishExamination } from '../services/examinationPublicationService.js';
import { requestMarkCorrection, reviewMarkCorrection } from '../services/marksCorrectionService.js';
import {
  createAssessmentPolicyProfile,
  approveAssessmentPolicyProfile,
  getAssessmentPolicyProfile,
  calculateClassResults
} from '../services/assessmentPolicyService.js';

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

  const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(eId) as any;
  const classInfo = db.prepare('SELECT * FROM classes WHERE id = ?').get(cId) as any;
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(sId) as any;

  if (!exam || !classInfo || !subject) {
    res.status(404).json({ error: 'Exam, Class, or Subject not found.' });
    return;
  }

  const isPublished = exam.is_published === 1 || exam.status === 'published';
  const yearId = classInfo.academic_year_id || exam.academic_year_id;

  // Active teacher assignment check (G3S-AUD-03)
  const activeAssignment = db.prepare(`
    SELECT id FROM teacher_assignments
    WHERE class_id = ? AND subject_id = ? AND academic_year_id = ? AND teacher_id = ? AND assignment_type = 'subject_teacher'
  `).get(cId, sId, yearId, req.user!.id);

  // Active leadership check (G3S-AUD-02)
  const isLeadership = hasAcademicStaffRole(
    req.user!.id,
    ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'],
    yearId,
    Number(classInfo.grade)
  );

  if (!isPublished) {
    // UNPUBLISHED: Confidentiality gate (G3S-AUD-02 & G3S-AUD-03)
    // Only actively assigned subject teacher OR scoped academic leadership can view.
    // Unscoped admin and unauthorized/revoked users MUST be rejected with 403!
    if (!activeAssignment && !isLeadership) {
      res.status(403).json({
        error: 'Access denied: Unpublished examination marks are confidential. Unscoped administrators and unauthorized staff cannot view unreleased marks sheets.',
        code: 'UNPUBLISHED_RESULTS_LOCKED'
      });
      return;
    }
  } else {
    // PUBLISHED: Standard published access (admin, assigned teacher, or scoped leadership)
    if (req.user!.role !== 'admin' && !canViewMarksSheet(req.user!, cId, sId) && !isLeadership) {
      res.status(403).json({ error: 'Access denied. You are not assigned to view marks for this class or subject.' });
      return;
    }
  }

  // Fetch sheet container metadata
  const sheet = db.prepare(`
    SELECT * FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?
  `).get(eId, cId, sId) as any;

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

  // 1. G4S-05: Resolve Examination and its academic year first
  const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examId) as any;
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  // 2. Resolve Student Enrolment strictly bound to the examination's academic year
  // Prevents subsequent-year promotions from corrupting historical examination results.
  const student = db.prepare(`
    SELECT s.*, c.id as class_id, c.name as class_name, c.grade, e.roll_number,
           u.full_name as class_teacher_name, ay.name as academic_year, ay.id as academic_year_id,
           e.status as enrollment_status
    FROM students s
    JOIN enrollments e ON s.id = e.student_id AND e.academic_year_id = ?
    JOIN classes c ON e.class_id = c.id
    LEFT JOIN users u ON c.class_teacher_id = u.id
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    WHERE s.id = ?
  `).get(exam.academic_year_id, studentId) as any;

  if (!student) {
    res.status(404).json({
      error: 'Student not enrolled in examination academic year or not found.',
      code: 'STUDENT_ENROLLMENT_NOT_FOUND'
    });
    return;
  }

  // 3. Verify student grade is covered by examination grade band scope
  if (exam.grade_band && exam.grade_band !== 'all') {
    if (!doesBandCoverGrade(exam.grade_band, Number(student.grade))) {
      res.status(403).json({
        error: `Access denied: Student grade (${student.grade}) is outside the examination grade band scope (${exam.grade_band}).`,
        code: 'EXAM_SCOPE_MISMATCH'
      });
      return;
    }
  }

  const isPublished = exam.is_published === 1 || exam.status === 'published';

  // 4. Confidentiality and Scoped Authorization Gate
  if (!isPublished) {
    const isLeadership = hasAcademicStaffRole(
      user.id,
      ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'],
      exam.academic_year_id,
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
    // For published exams, require admin, in-scope academic leadership,
    // or assigned class/subject teacher for this class in this academic year
    const isLeadership = hasAcademicStaffRole(
      user.id,
      ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'],
      exam.academic_year_id,
      Number(student.grade)
    );

    const isAssignedTeacher = db.prepare(`
      SELECT 1 FROM teacher_assignments
      WHERE teacher_id = ? AND class_id = ? AND academic_year_id = ?
    `).get(user.id, student.class_id, exam.academic_year_id);

    if (user.role !== 'admin' && !isLeadership && !isAssignedTeacher) {
      res.status(403).json({
        error: 'Access denied. You are not assigned to this student\'s class for this academic year.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
      return;
    }
  }

  // Get marks for all subjects assigned to this class in this academic year
  const classSubjects = db.prepare(`
    SELECT sub.id as subject_id, sub.code as subject_code, sub.name as subject_name, sub.category,
           m.score, m.is_absent, m.is_exempt, m.max_score, m.grade_letter, m.status as mark_status,
           u.full_name as teacher_name
    FROM class_subjects cs
    JOIN subjects sub ON cs.subject_id = sub.id
    LEFT JOIN marks m ON m.student_id = ? AND m.subject_id = sub.id AND m.examination_id = ?
    LEFT JOIN teacher_assignments ta ON ta.class_id = cs.class_id AND ta.subject_id = sub.id AND ta.academic_year_id = ?
    LEFT JOIN users u ON ta.teacher_id = u.id
    WHERE cs.class_id = ?
    ORDER BY sub.category ASC, sub.name ASC
  `).all(studentId, examId, exam.academic_year_id, student.class_id) as any[];

  // Attendance summary strictly bound to the examination's academic year
  const attendance = db.prepare(`
    SELECT 
      COUNT(*) as total_school_days,
      SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present_days,
      SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late_days,
      SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_days
    FROM attendance_records ar
    JOIN attendance_sessions sess ON ar.session_id = sess.id
    WHERE ar.student_id = ? AND sess.class_id = ? AND sess.academic_year_id = ?
  `).get(studentId, student.class_id, exam.academic_year_id) as any;

  // Calculate Student Total & Average
  let totalScore = 0;
  let gradedCount = 0;

  classSubjects.forEach(s => {
    if (s.score !== null && !s.is_absent && !s.is_exempt) {
      totalScore += Number(s.score);
      gradedCount++;
    }
  });

  let average: number | null = gradedCount > 0 ? Math.round((totalScore / gradedCount) * 10) / 10 : 0;

  // MANDATORY Gate 3R Fix P0-04:
  // 1. Truthful attendance reporting: No fake 100% attendance. If 0 days, return null and 'Not Recorded'.
  // 2. Official rank calculation deferred to Gate 4: Return rank: null with notice to avoid misleading unapproved values.
  const hasAttendanceRecords = Boolean(attendance && attendance.total_school_days > 0);
  const attendancePercentage = hasAttendanceRecords
    ? Math.round(((attendance.present_days + attendance.late_days) / attendance.total_school_days) * 100)
    : null;

  // Gate 4: Official Rank & Post-Publication Corrections Provenance
  let officialRank: number | null = null;
  let policyMetadata: any = null;
  let approvedCorrections: any[] = [];
  let isReissued = false;

  if (isPublished) {
    let resolvedPol: any = undefined;
    if (exam.assessment_policy_id) {
      try {
        const pol = getAssessmentPolicyProfile(exam.assessment_policy_id);
        resolvedPol = pol;
        policyMetadata = {
          id: pol.id,
          policy_code: pol.policy_code,
          title: pol.title,
          version: pol.version,
          is_approved_by_school: pol.is_approved_by_school,
          subject_weights: pol.subject_weights,
          ranking_rules: pol.ranking_rules
        };
      } catch {}
    }

    try {
      const classCalc = calculateClassResults(examId, student.class_id, resolvedPol);
      const stuResult = classCalc.students.find(s => s.studentId === studentId);
      if (stuResult) {
        totalScore = stuResult.totalScore;
        gradedCount = stuResult.gradedSubjectsCount;
        average = stuResult.averagePercentage;
        if (stuResult.rank !== null && stuResult.rank !== undefined) {
          officialRank = stuResult.rank;
        }
      }
    } catch {}

    approvedCorrections = db.prepare(`
      SELECT mc.id, mc.subject_id, s.name as subject_name, s.code as subject_code,
             mc.expected_previous_score, mc.requested_score as corrected_score,
             mc.expected_previous_status, mc.requested_status as corrected_status,
             mc.correction_category, mc.detailed_justification, mc.reviewed_at,
             u.full_name as approved_by_name
      FROM marks_corrections mc
      JOIN subjects s ON mc.subject_id = s.id
      LEFT JOIN users u ON mc.reviewed_by_user_id = u.id
      WHERE mc.examination_id = ? AND mc.student_id = ? AND mc.status = 'approved'
      ORDER BY mc.id ASC
    `).all(examId, studentId) as any[];

    isReissued = approvedCorrections.length > 0;
  }

  res.json({
    student,
    exam,
    subjects: classSubjects,
    performance: {
      totalScore,
      gradedSubjectCount: gradedCount,
      average,
      rank: isPublished ? officialRank : null,
      classRankNotice: isPublished ? (officialRank ? 'Official Class Rank' : null) : 'Official class rank calculation is deferred to Gate 4 publication governance.'
    },
    attendance: {
      totalSchoolDays: attendance?.total_school_days || 0,
      presentDays: attendance?.present_days || 0,
      lateDays: attendance?.late_days || 0,
      absentDays: attendance?.absent_days || 0,
      attendancePercentage,
      status: hasAttendanceRecords ? 'Recorded' : 'Not Recorded'
    },
    is_published: isPublished,
    is_provisional: !isPublished,
    is_provisional_preview: !isPublished,
    provisional_notice: !isPublished ? 'PROVISIONAL & UNPUBLISHED: This report card contains unverified/unpublished examination results intended solely for internal academic leadership review.' : null,
    confidentiality_watermark: !isPublished ? {
      is_confidential: true,
      watermark_text: 'UNPUBLISHED - CONFIDENTIAL LEADERSHIP PREVIEW ONLY',
      previewed_by_user_id: user.id,
      previewed_by_name: user.full_name || user.username,
      previewed_at: new Date().toISOString()
    } : null,
    is_reissued: isReissued,
    corrections_history: approvedCorrections,
    policy: policyMetadata
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

// PR-005 Gate 4B: Official Examination-Wide Publication
router.post('/examinations/:id/publish', requireAuth, (req, res) => {
  try {
    const examinationId = Number(req.params.id);
    const { policyProfileId, expectedStatus } = req.body || {};
    const result = publishExamination({
      examinationId,
      policyProfileId: policyProfileId ? Number(policyProfileId) : undefined,
      expectedStatus,
      user: req.user!,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PR-005 Gate 4B: Retrieve Publication Summary & Audit Snapshot
router.get('/examinations/:id/publication-summary', requireAuth, (req, res) => {
  try {
    const examinationId = Number(req.params.id);
    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examinationId) as any;
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const isPublished = exam.is_published === 1 || exam.status === 'published';

    // Confidentiality gate for unpublished examinations (G3S-AUD-02)
    if (!isPublished) {
      const isLeadership = hasAcademicStaffRole(
        req.user!.id,
        ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'],
        exam.academic_year_id,
        undefined
      );
      if (!isLeadership) {
        res.status(403).json({
          error: 'Access denied: Unpublished examination publication details are confidential.',
          code: 'UNPUBLISHED_RESULTS_LOCKED'
        });
        return;
      }
    }

    const publication = db.prepare(`
      SELECT ep.*, u.username as published_by_username, u.full_name as published_by_name,
             app.policy_code, app.title as policy_title
      FROM examination_publications ep
      JOIN users u ON ep.published_by_user_id = u.id
      JOIN assessment_policy_profiles app ON ep.policy_profile_id = app.id
      WHERE ep.examination_id = ?
      ORDER BY ep.publication_version DESC
      LIMIT 1
    `).get(examinationId) as any;

    res.json({
      examination: exam,
      is_published: isPublished,
      publication: publication || null
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PR-005 Gate 4A: Assessment Policies Management
router.get('/policies', requireAuth, (req, res) => {
  try {
    const { academic_year_id, grade_band } = req.query;
    let query = 'SELECT * FROM assessment_policy_profiles WHERE 1=1';
    const params: any[] = [];
    if (academic_year_id) { query += ' AND academic_year_id = ?'; params.push(Number(academic_year_id)); }
    if (grade_band) { query += ' AND grade_band = ?'; params.push(String(grade_band)); }
    query += ' ORDER BY version DESC, id DESC';
    const policies = db.prepare(query).all(...params).map((p: any) => ({
      ...p,
      isProvisional: p.is_approved_by_school !== 1,
      approvalStatus: p.is_approved_by_school === 1 ? 'approved' : 'provisional'
    }));
    res.json({ policies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/policies/:id', requireAuth, (req, res) => {
  try {
    const policy = getAssessmentPolicyProfile(Number(req.params.id));
    res.json({ policy });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

router.post('/policies', requireAuth, (req, res) => {
  try {
    const {
      academicYearId,
      gradeBand,
      policyCode,
      title,
      gradingScale,
      absenceRules,
      rankingRules,
      subjectWeights,
      correctionWindowDays,
      effectiveFrom,
      effectiveTo
    } = req.body;

    const result = createAssessmentPolicyProfile({
      academicYearId: Number(academicYearId),
      gradeBand,
      policyCode,
      title,
      gradingScale,
      absenceRules,
      rankingRules,
      subjectWeights,
      correctionWindowDays: correctionWindowDays ? Number(correctionWindowDays) : 21,
      effectiveFrom,
      effectiveTo,
      user: req.user!
    });
    res.status(201).json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

router.post('/policies/:id/approve', requireAuth, (req, res) => {
  try {
    const result = approveAssessmentPolicyProfile(Number(req.params.id), req.user!);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PR-005 Gate 4C: Audited Post-Publication Mark Corrections
router.post('/corrections', requireAuth, (req, res) => {
  try {
    const {
      markId,
      sheetId,
      studentId,
      subjectId,
      examinationId,
      expectedPreviousScore,
      expectedPreviousStatus,
      requestedScore,
      requestedStatus,
      correctionCategory,
      detailedJustification,
      evidenceAttachmentRef
    } = req.body;

    const result = requestMarkCorrection({
      markId: markId ? Number(markId) : undefined,
      sheetId: sheetId ? Number(sheetId) : undefined,
      studentId: studentId ? Number(studentId) : undefined,
      subjectId: subjectId ? Number(subjectId) : undefined,
      examinationId: examinationId ? Number(examinationId) : undefined,
      expectedPreviousScore: (expectedPreviousScore === null || expectedPreviousScore === undefined) ? null : Number(expectedPreviousScore),
      expectedPreviousStatus,
      requestedScore: (requestedScore === null || requestedScore === undefined) ? null : Number(requestedScore),
      requestedStatus,
      correctionCategory,
      detailedJustification,
      evidenceAttachmentRef,
      user: req.user!,
      ipAddress: req.ip
    });

    res.status(201).json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

router.get('/corrections', requireAuth, (req, res) => {
  try {
    // G4R-03: Live active account check
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(req.user!.id) as { id: number; is_active: number } | undefined;
    if (!activeUser || activeUser.is_active !== 1) {
      res.status(403).json({ error: 'User account is deactivated or invalid.', code: 'USER_DEACTIVATED' });
      return;
    }

    // Scoped permissions: leadership authorizations and teacher assignments
    const activeAuths = getActiveStaffAuthorizations(req.user!.id);
    const leadershipAuths = activeAuths.filter(a =>
      ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'].includes(a.auth_role)
    );

    const hasTeacherAssignments = db.prepare(`
      SELECT 1 FROM teacher_assignments WHERE teacher_id = ? AND assignment_type = 'subject_teacher' LIMIT 1
    `).get(req.user!.id);

    // Reject out-of-scope teachers and unscoped administrators
    if (leadershipAuths.length === 0 && !hasTeacherAssignments) {
      res.status(403).json({
        error: 'Access denied: Viewing correction records requires an active subject teaching assignment or scoped academic leadership authorization.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
      return;
    }

    const { examinationId, sheetId, status } = req.query;
    let query = `
      SELECT mc.*, s.admission_no, s.full_name as student_name, sub.name as subject_name, sub.code as subject_code,
             u_req.username as requested_by_username, u_req.full_name as requested_by_name,
             u_rev.username as reviewed_by_username, u_rev.full_name as reviewed_by_name
      FROM marks_corrections mc
      JOIN marks_sheets ms ON mc.sheet_id = ms.id
      JOIN classes c ON ms.class_id = c.id
      JOIN students s ON mc.student_id = s.id
      JOIN subjects sub ON mc.subject_id = sub.id
      JOIN users u_req ON mc.requested_by_user_id = u_req.id
      LEFT JOIN users u_rev ON mc.reviewed_by_user_id = u_rev.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // SQL-level scoping conditions
    const scopeClauses: string[] = [];
    for (const auth of leadershipAuths) {
      if (auth.grade_band === 'all') {
        scopeClauses.push('(ms.academic_year_id = ?)');
        params.push(auth.academic_year_id);
      } else if (auth.grade_band === 'junior_6_9') {
        scopeClauses.push('(ms.academic_year_id = ? AND c.grade BETWEEN 6 AND 9)');
        params.push(auth.academic_year_id);
      } else if (auth.grade_band === 'ol_10_11') {
        scopeClauses.push('(ms.academic_year_id = ? AND c.grade BETWEEN 10 AND 11)');
        params.push(auth.academic_year_id);
      } else if (auth.grade_band === 'al_12_13') {
        scopeClauses.push('(ms.academic_year_id = ? AND c.grade BETWEEN 12 AND 13)');
        params.push(auth.academic_year_id);
      }
    }

    if (hasTeacherAssignments) {
      scopeClauses.push(`EXISTS (
        SELECT 1 FROM teacher_assignments ta
        WHERE ta.teacher_id = ? AND ta.class_id = ms.class_id AND ta.subject_id = mc.subject_id
          AND ta.academic_year_id = ms.academic_year_id AND ta.assignment_type = 'subject_teacher'
      )`);
      params.push(req.user!.id);
    }

    if (scopeClauses.length > 0) {
      query += ` AND (${scopeClauses.join(' OR ')})`;
    }

    if (examinationId) { query += ' AND mc.examination_id = ?'; params.push(Number(examinationId)); }
    if (sheetId) { query += ' AND mc.sheet_id = ?'; params.push(Number(sheetId)); }
    if (status) { query += ' AND mc.status = ?'; params.push(String(status)); }
    query += ' ORDER BY mc.id DESC';

    const corrections = db.prepare(query).all(...params);
    res.json({ corrections });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/corrections/:id', requireAuth, (req, res) => {
  try {
    // G4R-03: Live active account check
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(req.user!.id) as { id: number; is_active: number } | undefined;
    if (!activeUser || activeUser.is_active !== 1) {
      res.status(403).json({ error: 'User account is deactivated or invalid.', code: 'USER_DEACTIVATED' });
      return;
    }

    const correctionId = Number(req.params.id);
    const correction = db.prepare(`
      SELECT mc.*, ms.class_id, ms.academic_year_id, c.grade,
             s.admission_no, s.full_name as student_name, sub.name as subject_name, sub.code as subject_code,
             u_req.username as requested_by_username, u_req.full_name as requested_by_name,
             u_rev.username as reviewed_by_username, u_rev.full_name as reviewed_by_name
      FROM marks_corrections mc
      JOIN marks_sheets ms ON mc.sheet_id = ms.id
      JOIN classes c ON ms.class_id = c.id
      JOIN students s ON mc.student_id = s.id
      JOIN subjects sub ON mc.subject_id = sub.id
      JOIN users u_req ON mc.requested_by_user_id = u_req.id
      LEFT JOIN users u_rev ON mc.reviewed_by_user_id = u_rev.id
      WHERE mc.id = ?
    `).get(correctionId) as any;

    if (!correction) {
      res.status(404).json({ error: 'Correction record not found.' });
      return;
    }

    // Scoped authorization check
    const activeAuths = getActiveStaffAuthorizations(req.user!.id, correction.academic_year_id);
    const isAuthorizedLeadership = activeAuths.some(a =>
      ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'].includes(a.auth_role) &&
      (a.grade_band === 'all' || doesBandCoverGrade(a.grade_band, correction.grade))
    );

    const isAssignedTeacher = db.prepare(`
      SELECT 1 FROM teacher_assignments
      WHERE teacher_id = ? AND class_id = ? AND subject_id = ? AND academic_year_id = ? AND assignment_type = 'subject_teacher'
    `).get(req.user!.id, correction.class_id, correction.subject_id, correction.academic_year_id);

    if (!isAuthorizedLeadership && !isAssignedTeacher) {
      res.status(403).json({
        error: 'Access denied: You are not authorized to view this correction record.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
      return;
    }

    res.json({ correction });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/corrections/:id/review', requireAuth, (req, res) => {
  try {
    const correctionId = Number(req.params.id);
    const { decision, reviewComments } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      res.status(400).json({ error: "Decision must be 'approve' or 'reject'." });
      return;
    }
    const result = reviewMarkCorrection({
      correctionId,
      decision,
      reviewComments,
      user: req.user!,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

export default router;


