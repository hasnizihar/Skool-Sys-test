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
    // PUBLISHED: Plain administrator role bypass REMOVED (FIX B).
    // Access strictly requires active teaching assignment (subject or class teacher) OR in-scope academic leadership.
    const isClassTeacher = db.prepare(`
      SELECT id FROM teacher_assignments
      WHERE class_id = ? AND academic_year_id = ? AND teacher_id = ? AND assignment_type = 'class_teacher'
    `).get(cId, yearId, req.user!.id);

    if (!activeAssignment && !isClassTeacher && !isLeadership) {
      res.status(403).json({
        error: 'Access denied: You are not authorized to view marks for this class or subject.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
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
           m.id as mark_id, m.score,
           CASE WHEN m.assessment_status = 'ABSENT' THEN 1 ELSE 0 END as is_absent,
           CASE WHEN m.assessment_status = 'EXEMPT' THEN 1 ELSE 0 END as is_exempt,
           m.max_score, m.grade_letter, m.assessment_status as mark_status, m.updated_at
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    LEFT JOIN marks m ON m.student_id = s.id AND m.examination_id = ? AND m.subject_id = ? AND m.class_id = ?
    WHERE e.class_id = ? AND e.status = 'enrolled'
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(eId, sId, cId, cId) as any[];

  // G6-03: Resolve authoritative assessment policy and maximum score
  let policy: any = null;
  if (exam.assessment_policy_id) {
    policy = db.prepare('SELECT * FROM assessment_policy_profiles WHERE id = ?').get(exam.assessment_policy_id);
  }
  if (!policy) {
    const gradeBand = Number(classInfo.grade) <= 9 ? 'junior_6_9' : (Number(classInfo.grade) <= 11 ? 'ol_10_11' : 'al_12_13');
    policy = db.prepare(`
      SELECT * FROM assessment_policy_profiles
      WHERE academic_year_id = ? AND grade_band = ?
      ORDER BY is_approved_by_school DESC, id DESC
      LIMIT 1
    `).get(yearId, gradeBand);
  }

  // Authoritative max score:
  // 1. Existing marks_sheets container or existing marks on this sheet
  let authoritativeMaxScore: number | null = null;
  if (sheet?.max_score && Number(sheet.max_score) !== 100.0) {
    authoritativeMaxScore = Number(sheet.max_score);
  }
  const existingMax = rawRoster.find(r => r.max_score !== null && r.max_score !== undefined)?.max_score;
  if (!authoritativeMaxScore && existingMax !== undefined && existingMax !== null) {
    authoritativeMaxScore = Number(existingMax);
  }

  // 2. Schedule-defined max score for this class and subject
  if (!authoritativeMaxScore) {
    const sched = db.prepare(`
      SELECT max_score FROM examination_schedules
      WHERE examination_id = ? AND class_id = ? AND subject_id = ?
    `).get(eId, cId, sId) as any;
    if (sched?.max_score) {
      authoritativeMaxScore = Number(sched.max_score);
    }
  }

  // 3. Policy-defined max score (from subject_weights_json or grading_scale_json)
  if (!authoritativeMaxScore && policy) {
    try {
      if (policy.subject_weights_json) {
        const weights = typeof policy.subject_weights_json === 'string' ? JSON.parse(policy.subject_weights_json) : policy.subject_weights_json;
        if (weights[subject.code]?.maxScore) authoritativeMaxScore = Number(weights[subject.code].maxScore);
        else if (weights[subject.id]?.maxScore) authoritativeMaxScore = Number(weights[subject.id].maxScore);
        else if (weights.maxScore) authoritativeMaxScore = Number(weights.maxScore);
      }
      if (!authoritativeMaxScore && policy.grading_scale_json) {
        const scale = typeof policy.grading_scale_json === 'string' ? JSON.parse(policy.grading_scale_json) : policy.grading_scale_json;
        if (Array.isArray(scale)) {
          const maxInScale = Math.max(...scale.map((s: any) => s.maxScore || 0));
          if (maxInScale > 0 && maxInScale !== 100) authoritativeMaxScore = maxInScale;
        }
      }
    } catch {}
  }

  // 4. Examination-level configured max_score, otherwise sheet max_score, otherwise 100.0
  if (!authoritativeMaxScore) {
    authoritativeMaxScore = exam.max_score ? Number(exam.max_score) : (sheet?.max_score ? Number(sheet.max_score) : 100.0);
  }

  // Enhance roster with student-specific subject eligibility tags and authoritative max_score
  const roster = rawRoster.map(r => {
    const elig = isStudentEligibleForSubject(r.student_id, sId, yearId);
    return {
      ...r,
      max_score: r.max_score !== null && r.max_score !== undefined ? Number(r.max_score) : authoritativeMaxScore,
      is_eligible_for_draft: elig.isEligibleForDraft,
      is_officially_confirmed: elig.isOfficiallyConfirmed,
      enrollment_status: elig.status || 'not_enrolled',
      enrollment_category: elig.category || null
    };
  });

  // Statistics (normalized against authoritativeMaxScore)
  let validScores: number[] = [];
  let gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, S: 0, F: 0, AB: 0, EX: 0, unmarked: 0 };

  roster.forEach(r => {
    if (r.is_absent) {
      gradeCounts.AB++;
    } else if (r.is_exempt) {
      gradeCounts.EX++;
    } else if (r.score !== null && r.score !== undefined) {
      validScores.push(Number(r.score));
      const g = r.grade_letter || calcGradeLetter(r.score, 'PRESENT', r.max_score || authoritativeMaxScore);
      if (gradeCounts[g] !== undefined) gradeCounts[g]++;
    } else {
      gradeCounts.unmarked++;
    }
  });

  const totalGraded = validScores.length;
  const avg = totalGraded > 0 ? Math.round((validScores.reduce((a, b) => a + b, 0) / totalGraded) * 10) / 10 : 0;
  const max = totalGraded > 0 ? Math.max(...validScores) : 0;
  const min = totalGraded > 0 ? Math.min(...validScores) : 0;
  const passThreshold = (35.0 / 100.0) * authoritativeMaxScore;
  const passed = validScores.filter(s => s >= passThreshold).length;
  const passRate = totalGraded > 0 ? Math.round((passed / totalGraded) * 100) : 0;

  res.json({
    exam,
    class: classInfo,
    subject,
    sheet: sheet || null,
    roster,
    maxScore: authoritativeMaxScore,
    policy: policy ? {
      id: policy.id,
      policy_code: policy.policy_code,
      title: policy.title,
      is_approved_by_school: Boolean(policy.is_approved_by_school),
      grading_scale_json: policy.grading_scale_json
    } : null,
    stats: {
      totalStudents: roster.length,
      totalGraded,
      average: avg,
      maxScore: max,
      maxPossibleScore: authoritativeMaxScore,
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
    const formattedMarks: MarkEntryInput[] = marks.map((m: any) => {
      const assessmentStatus = m.assessmentStatus ||
        (m.is_absent ? 'ABSENT' : (m.is_exempt ? 'EXEMPT' : (m.score !== null && m.score !== undefined && m.score !== '' ? 'PRESENT' : 'NOT_ASSESSED')));
      const score = (['ABSENT', 'MEDICAL', 'EXEMPT', 'NOT_ASSESSED'].includes(assessmentStatus) || m.score === null || m.score === undefined || m.score === '')
        ? null
        : Number(m.score);
      return {
        studentId: Number(m.student_id ?? m.studentId),
        score,
        maxScore: m.maxScore !== undefined && m.maxScore !== null ? Number(m.maxScore) : 100.0,
        assessmentStatus: assessmentStatus as 'PRESENT' | 'ABSENT' | 'MEDICAL' | 'EXEMPT' | 'NOT_ASSESSED',
        remarks: m.remarks
      };
    });

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
    // For published exams: Plain administrator role bypass REMOVED (FIX B).
    // Access strictly requires active in-scope academic leadership,
    // OR assigned class/subject teacher for this class in this academic year.
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

    if (!isLeadership && !isAssignedTeacher) {
      res.status(403).json({
        error: 'Access denied: You are not authorized to view this student report card. Access requires in-scope academic leadership or an assigned teaching role for this class.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
      return;
    }
  }

  // Get marks for all subjects assigned to this class in this academic year
  const classSubjects = db.prepare(`
    SELECT sub.id as subject_id, sub.code as subject_code, sub.name as subject_name, sub.category,
           m.score,
           CASE WHEN m.assessment_status = 'ABSENT' THEN 1 ELSE 0 END as is_absent,
           CASE WHEN m.assessment_status = 'EXEMPT' THEN 1 ELSE 0 END as is_exempt,
           m.max_score, m.grade_letter, m.assessment_status as mark_status,
           u.full_name as teacher_name
    FROM class_subjects cs
    JOIN subjects sub ON cs.subject_id = sub.id
    LEFT JOIN marks m ON m.student_id = ? AND m.subject_id = sub.id AND m.examination_id = ?
    LEFT JOIN teacher_assignments ta ON ta.class_id = cs.class_id AND ta.subject_id = sub.id AND ta.academic_year_id = ?
    LEFT JOIN users u ON ta.teacher_id = u.id
    WHERE cs.class_id = ?
      AND (
        NOT EXISTS (
          SELECT 1 FROM student_subject_enrollments sse_check
          WHERE sse_check.student_id = ? AND sse_check.academic_year_id = ? AND sse_check.enrollment_status = 'confirmed'
        )
        OR EXISTS (
          SELECT 1 FROM student_subject_enrollments sse
          WHERE sse.student_id = ? AND sse.academic_year_id = ? AND sse.subject_id = sub.id AND sse.enrollment_status = 'confirmed'
        )
      )
    ORDER BY sub.category ASC, sub.name ASC
  `).all(studentId, examId, exam.academic_year_id, student.class_id, studentId, exam.academic_year_id, studentId, exam.academic_year_id) as any[];

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
    // 1. Resolve effective approved assessment policy (FIX 03 Requirements 1 & 2)
    let resolvedPol: any = undefined;
    let targetPolicyId = exam.assessment_policy_id;

    if (!targetPolicyId) {
      const pubRecord = db.prepare('SELECT policy_profile_id FROM examination_publications WHERE examination_id = ? ORDER BY publication_version DESC LIMIT 1').get(examId) as any;
      if (pubRecord?.policy_profile_id) {
        targetPolicyId = pubRecord.policy_profile_id;
      }
    }

    if (!targetPolicyId) {
      res.status(500).json({
        error: 'Official report-card generation failed: No approved assessment policy profile associated with this published examination.',
        code: 'MISSING_OFFICIAL_POLICY'
      });
      return;
    }

    try {
      const pol = getAssessmentPolicyProfile(targetPolicyId);
      if (!pol || pol.is_approved_by_school !== 1) {
        res.status(500).json({
          error: `Official report-card generation failed: Associated assessment policy '${pol?.policy_code || targetPolicyId}' is unapproved or provisional.`,
          code: 'UNAPPROVED_POLICY'
        });
        return;
      }
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
    } catch (polErr: any) {
      res.status(500).json({
        error: `Official report-card generation failed: Unable to load assessment policy: ${polErr.message}`,
        code: polErr.code || 'MISSING_OFFICIAL_POLICY'
      });
      return;
    }

    // 2. Compute official policy results (DO NOT silently swallow errors, DO NOT fallback to raw calculations)
    try {
      const classCalc = calculateClassResults(examId, student.class_id, resolvedPol);
      const stuResult = classCalc.students.find(s => s.studentId === studentId);
      if (!stuResult) {
        res.status(500).json({
          error: 'Official report-card generation failed: Student results could not be reconciled in official class calculations.',
          code: 'CALCULATION_RECONCILIATION_FAILED'
        });
        return;
      }
      totalScore = stuResult.totalScore;
      gradedCount = stuResult.gradedSubjectsCount;
      average = stuResult.averagePercentage;
      officialRank = stuResult.rank ?? null;

      for (const sub of classSubjects) {
        const polSub = stuResult.subjectGrades[sub.subject_id];
        if (polSub) {
          sub.grade_letter = polSub.gradeLetter;
          sub.normalized_percentage = polSub.percentage;
          sub.assessment_status = polSub.assessmentStatus;
        }
      }
    } catch (calcErr: any) {
      res.status(500).json({
        error: `Official report-card calculation failed: ${calcErr.message}`,
        code: calcErr.code || 'CALCULATION_FAILED'
      });
      return;
    }

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

// PR-005 Examination Workspace: List scoped marks sheets with filters
router.get('/sheets', requireAuth, (req, res) => {
  try {
    const user = req.user!;
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as { id: number; is_active: number } | undefined;
    if (!activeUser || activeUser.is_active !== 1) {
      res.status(401).json({ error: 'User account is deactivated or inactive.', code: 'USER_DEACTIVATED' });
      return;
    }

    const { examinationId, classId, subjectId, status } = req.query;

    const baseQuery = `
      SELECT ms.*,
             c.name as class_name, c.grade as class_grade,
             sub.name as subject_name, sub.code as subject_code, sub.category as subject_category,
             e.name as exam_name, e.term as exam_term, e.is_published as exam_is_published, e.status as exam_status,
             ay.name as academic_year_name,
             u_teacher.full_name as teacher_name, u_teacher.username as teacher_username,
             u_reviewer.full_name as reviewer_name,
             u_approver.full_name as approver_name,
             (SELECT COUNT(*) FROM marks m WHERE m.sheet_id = ms.id) as marks_count,
             (SELECT COUNT(*) FROM marks m WHERE m.sheet_id = ms.id AND m.assessment_status = 'NOT_ASSESSED') as unassessed_count
      FROM marks_sheets ms
      JOIN classes c ON ms.class_id = c.id
      JOIN subjects sub ON ms.subject_id = sub.id
      JOIN examinations e ON ms.examination_id = e.id
      JOIN academic_years ay ON ms.academic_year_id = ay.id
      LEFT JOIN users u_teacher ON ms.teacher_id = u_teacher.id
      LEFT JOIN users u_reviewer ON ms.reviewed_by_user_id = u_reviewer.id
      LEFT JOIN users u_approver ON ms.approved_by_user_id = u_approver.id
    `;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (examinationId) {
      whereClauses.push('ms.examination_id = ?');
      params.push(Number(examinationId));
    }
    if (classId) {
      whereClauses.push('ms.class_id = ?');
      params.push(Number(classId));
    }
    if (subjectId) {
      whereClauses.push('ms.subject_id = ?');
      params.push(Number(subjectId));
    }
    if (status) {
      whereClauses.push('ms.status = ?');
      params.push(String(status));
    }

    // Least-privilege scoping rules (G5F-04):
    // ALL leadership appointments MUST match the marks sheet's academic year and covered grade band.
    // Cross-year appointments from one year NEVER authorize sheets in another year!
    const activeAuths = getActiveStaffAuthorizations(user.id);
    const scopeOrs: string[] = [];

    for (const auth of activeAuths) {
      if (['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'].includes(auth.auth_role)) {
        if (auth.grade_band === 'all') {
          scopeOrs.push('(ms.academic_year_id = ?)');
          params.push(auth.academic_year_id);
        } else if (auth.grade_band === 'junior_6_9') {
          scopeOrs.push('(ms.academic_year_id = ? AND c.grade BETWEEN 6 AND 9)');
          params.push(auth.academic_year_id);
        } else if (auth.grade_band === 'ol_10_11') {
          scopeOrs.push('(ms.academic_year_id = ? AND c.grade BETWEEN 10 AND 11)');
          params.push(auth.academic_year_id);
        } else if (auth.grade_band === 'al_12_13') {
          scopeOrs.push('(ms.academic_year_id = ? AND c.grade BETWEEN 12 AND 13)');
          params.push(auth.academic_year_id);
        }
      }
    }

    // Active teaching assignment in the marks sheet's academic year
    scopeOrs.push(`EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = ? AND ta.class_id = ms.class_id
        AND (ta.subject_id = ms.subject_id OR ta.assignment_type = 'class_teacher')
        AND ta.academic_year_id = ms.academic_year_id
    )`);
    params.push(user.id);

    // Active class teacher assignment on class in the marks sheet's academic year
    scopeOrs.push(`EXISTS (
      SELECT 1 FROM classes cls
      WHERE cls.id = ms.class_id AND cls.class_teacher_id = ? AND cls.academic_year_id = ms.academic_year_id
    )`);
    params.push(user.id);

    // Plain administrators (without in-scope academic leadership appointments) can ONLY see officially published sheets;
    // unpublished sheet metadata is confidential and protected against unscoped access.
    if (user.role === 'admin') {
      scopeOrs.push("(e.is_published = 1 AND ms.status = 'published')");
    }

    if (scopeOrs.length > 0) {
      whereClauses.push(`(${scopeOrs.join(' OR ')})`);
    } else {
      res.json({ sheets: [] });
      return;
    }

    const fullQuery = `${baseQuery} WHERE ${whereClauses.join(' AND ')} ORDER BY e.id DESC, c.grade ASC, c.name ASC, sub.name ASC`;
    const sheets = db.prepare(fullQuery).all(...params);
    res.json({ sheets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PR-005 Gate 5: Examination Schedules Management
router.get('/examinations/:id/schedules', requireAuth, (req, res) => {
  try {
    const examinationId = Number(req.params.id);
    const user = req.user!;

    const exam = db.prepare(`
      SELECT e.*, ay.name as academic_year_name
      FROM examinations e
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      WHERE e.id = ?
    `).get(examinationId) as any;

    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const isPublished = exam.is_published === 1 || exam.status === 'published';

    if (!isPublished) {
      const activeAuths = getActiveStaffAuthorizations(user.id, exam.academic_year_id);
      const isLeadership = activeAuths.some(a =>
        ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'].includes(a.auth_role)
      );
      const hasTeachingAssignment = db.prepare(`
        SELECT 1 FROM teacher_assignments WHERE teacher_id = ? AND academic_year_id = ? LIMIT 1
      `).get(user.id, exam.academic_year_id);
      const isClassTeacher = db.prepare(`
        SELECT 1 FROM classes WHERE class_teacher_id = ? AND academic_year_id = ? LIMIT 1
      `).get(user.id, exam.academic_year_id);

      if (!isLeadership && !hasTeachingAssignment && !isClassTeacher) {
        res.status(403).json({
          error: 'Access denied: Examination schedule details are confidential prior to publication.',
          code: 'UNPUBLISHED_RESULTS_LOCKED'
        });
        return;
      }
    }

    const schedules = db.prepare(`
      SELECT es.*,
             c.name as class_name, c.grade as class_grade,
             sub.name as subject_name, sub.code as subject_code, sub.category as subject_category,
             u_app.full_name as approved_by_name, u_app.username as approved_by_username,
             ms.id as sheet_id, ms.status as sheet_status, ms.revision as sheet_revision
      FROM examination_schedules es
      JOIN classes c ON es.class_id = c.id
      JOIN subjects sub ON es.subject_id = sub.id
      LEFT JOIN users u_app ON es.approved_by_user_id = u_app.id
      LEFT JOIN marks_sheets ms ON ms.examination_id = es.examination_id AND ms.class_id = es.class_id AND ms.subject_id = es.subject_id
      WHERE es.examination_id = ?
      ORDER BY c.grade ASC, c.name ASC, sub.name ASC
    `).all(examinationId) as any[];

    const total = schedules.length;
    const approved = schedules.filter(s => s.status === 'approved').length;
    const draft = schedules.filter(s => s.status === 'draft').length;
    const required = schedules.filter(s => s.is_required === 1).length;
    const optional = schedules.filter(s => s.is_required === 0).length;
    const sheetsCreated = schedules.filter(s => s.sheet_id != null).length;
    const sheetsApproved = schedules.filter(s => s.sheet_status === 'approved').length;
    const completenessPercentage = total > 0 ? Math.round((approved / total) * 100) : 0;

    res.json({
      examination: exam,
      schedules,
      summary: {
        total,
        approved,
        draft,
        required,
        optional,
        sheetsCreated,
        sheetsApproved,
        isFullyApproved: total > 0 && approved === total,
        completenessPercentage
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/examinations/:id/schedules', requireAuth, (req, res) => {
  try {
    const examinationId = Number(req.params.id);
    const { classId, subjectId, isRequired = true, max_score, maxScore } = req.body || {};
    const user = req.user!;

    if (!classId || !subjectId) {
      res.status(400).json({ error: 'classId and subjectId are required.' });
      return;
    }

    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examinationId) as any;
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    if (exam.is_published === 1 || exam.status === 'published') {
      res.status(409).json({
        error: 'Cannot modify examination schedule after examination has been published.',
        code: 'EXAMINATION_LOCKED'
      });
      return;
    }

    const targetMax = max_score !== undefined
      ? Number(max_score)
      : (maxScore !== undefined
        ? Number(maxScore)
        : (exam.max_score ? Number(exam.max_score) : 100.0));
    if (isNaN(targetMax) || targetMax <= 0 || targetMax > 1000) {
      res.status(400).json({ error: 'Invalid max_score: must be a positive number in range (0, 1000].', code: 'INVALID_MAX_SCORE' });
      return;
    }

    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(Number(classId)) as any;
    if (!cls) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }

    if (cls.academic_year_id !== exam.academic_year_id) {
      res.status(400).json({
        error: 'Class academic year does not match examination academic year.',
        code: 'ACADEMIC_YEAR_MISMATCH'
      });
      return;
    }

    const activeAuths = getActiveStaffAuthorizations(user.id, exam.academic_year_id);
    const isAuthorizedLeadership = activeAuths.some(a =>
      ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role) &&
      (a.grade_band === 'all' || doesBandCoverGrade(a.grade_band, cls.grade))
    );

    if (!isAuthorizedLeadership) {
      res.status(403).json({
        error: 'Access denied: Scheduling examinations requires an active Principal, VP Academic, or Section Head appointment.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
      return;
    }

    const classSubject = db.prepare('SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?').get(Number(classId), Number(subjectId));
    if (!classSubject) {
      res.status(400).json({
        error: 'Subject is not registered as an active curriculum offering for this class in class_subjects.',
        code: 'INVALID_CLASS_SUBJECT_OFFERING'
      });
      return;
    }

    const existingSubmitted = db.prepare(`
      SELECT COUNT(*) as count FROM marks_sheets
      WHERE examination_id = ? AND class_id = ? AND subject_id = ? AND status IN ('submitted', 'reviewed', 'approved', 'published')
    `).get(examinationId, Number(classId), Number(subjectId)) as { count: number };
    if (existingSubmitted && existingSubmitted.count > 0) {
      res.status(409).json({
        error: 'Cannot modify maximum score for a schedule item after marks sheets have been submitted or published.',
        code: 'MARKS_ALREADY_SUBMITTED'
      });
      return;
    }

    const stmt = db.prepare(`
      INSERT INTO examination_schedules (examination_id, class_id, subject_id, max_score, is_required, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'draft', datetime('now'))
      ON CONFLICT(examination_id, class_id, subject_id) DO UPDATE SET
        max_score = excluded.max_score,
        is_required = excluded.is_required,
        status = 'draft',
        approved_by_user_id = NULL,
        approved_at = NULL
    `);

    const result = stmt.run(examinationId, Number(classId), Number(subjectId), targetMax, isRequired ? 1 : 0);
    const scheduleId = result.lastInsertRowid ? Number(result.lastInsertRowid) : (db.prepare('SELECT id FROM examination_schedules WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(examinationId, Number(classId), Number(subjectId)) as any)?.id;

    logAudit(user.id, user.username, 'EXAMINATION_SCHEDULE_CREATE', 'examination_schedules', scheduleId, { examinationId, classId, subjectId, isRequired, maxScore: targetMax }, req.ip);

    res.status(201).json({ success: true, scheduleId, status: 'draft', maxScore: targetMax });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

router.post('/examinations/:id/schedules/approve', requireAuth, (req, res) => {
  try {
    const examinationId = Number(req.params.id);
    const { scheduleIds } = req.body || {};
    const user = req.user!;

    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examinationId) as any;
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    if (exam.is_published === 1 || exam.status === 'published') {
      res.status(409).json({
        error: 'Cannot modify examination schedule after examination has been published.',
        code: 'EXAMINATION_LOCKED'
      });
      return;
    }

    const activeAuths = getActiveStaffAuthorizations(user.id, exam.academic_year_id);
    const leadershipRoles = activeAuths.filter(a => ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role));
    if (leadershipRoles.length === 0) {
      res.status(403).json({
        error: 'Access denied: Approving examination schedules requires an active Principal, VP Academic, or Section Head appointment.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
      return;
    }

    let targetSchedulesQuery = `
      SELECT es.*, c.grade
      FROM examination_schedules es
      JOIN classes c ON es.class_id = c.id
      WHERE es.examination_id = ? AND es.status = 'draft'
    `;
    const params: any[] = [examinationId];

    if (Array.isArray(scheduleIds) && scheduleIds.length > 0) {
      const placeholders = scheduleIds.map(() => '?').join(',');
      targetSchedulesQuery += ` AND es.id IN (${placeholders})`;
      params.push(...scheduleIds.map(Number));
    }

    const draftItems = db.prepare(targetSchedulesQuery).all(...params) as any[];
    if (draftItems.length === 0) {
      res.json({ success: true, approvedCount: 0, message: 'No draft schedule items found for approval.' });
      return;
    }

    for (const item of draftItems) {
      const canApproveItem = leadershipRoles.some(a =>
        a.grade_band === 'all' || doesBandCoverGrade(a.grade_band, item.grade)
      );
      if (!canApproveItem) {
        res.status(403).json({
          error: `Access denied: You do not possess leadership authority over grade ${item.grade} schedule items.`,
          code: 'INSUFFICIENT_AUTHORIZATION'
        });
        return;
      }
    }

    const approveStmt = db.prepare(`
      UPDATE examination_schedules
      SET status = 'approved',
          approved_by_user_id = ?,
          approved_at = datetime('now')
      WHERE id = ?
    `);

    db.exec('BEGIN IMMEDIATE;');
    try {
      for (const item of draftItems) {
        approveStmt.run(user.id, item.id);
      }
      db.exec('COMMIT;');
    } catch (dbErr) {
      db.exec('ROLLBACK;');
      throw dbErr;
    }

    logAudit(user.id, user.username, 'EXAMINATION_SCHEDULE_APPROVE', 'examinations', examinationId, {
      approvedCount: draftItems.length,
      scheduleIds: draftItems.map(d => d.id)
    }, req.ip);

    res.json({ success: true, approvedCount: draftItems.length });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

router.delete('/examinations/:id/schedules/:scheduleId', requireAuth, (req, res) => {
  try {
    const examinationId = Number(req.params.id);
    const scheduleId = Number(req.params.scheduleId);
    const user = req.user!;

    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examinationId) as any;
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    if (exam.is_published === 1 || exam.status === 'published') {
      res.status(409).json({
        error: 'Cannot modify examination schedule after examination has been published.',
        code: 'EXAMINATION_LOCKED'
      });
      return;
    }

    const schedule = db.prepare(`
      SELECT es.*, c.grade
      FROM examination_schedules es
      JOIN classes c ON es.class_id = c.id
      WHERE es.id = ? AND es.examination_id = ?
    `).get(scheduleId, examinationId) as any;

    if (!schedule) {
      res.status(404).json({ error: 'Schedule item not found.' });
      return;
    }

    const activeAuths = getActiveStaffAuthorizations(user.id, exam.academic_year_id);
    const isAuthorized = activeAuths.some(a =>
      ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role) &&
      (a.grade_band === 'all' || doesBandCoverGrade(a.grade_band, schedule.grade))
    );

    if (!isAuthorized) {
      res.status(403).json({
        error: 'Access denied: You are not authorized to delete this schedule item.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
      return;
    }

    const sheet = db.prepare(`
      SELECT id, status FROM marks_sheets
      WHERE examination_id = ? AND class_id = ? AND subject_id = ?
    `).get(examinationId, schedule.class_id, schedule.subject_id) as any;

    if (sheet && ['submitted', 'reviewed', 'approved'].includes(sheet.status)) {
      res.status(409).json({
        error: `Cannot delete schedule item: An active marks sheet exists in status '${sheet.status}'. Revert or return the marks sheet before removing the schedule offering.`,
        code: 'ACTIVE_MARKS_SHEET_EXISTS'
      });
      return;
    }

    db.prepare('DELETE FROM examination_schedules WHERE id = ?').run(scheduleId);
    logAudit(user.id, user.username, 'EXAMINATION_SCHEDULE_DELETE', 'examination_schedules', scheduleId, { examinationId, scheduleId }, req.ip);

    res.json({ success: true, message: 'Schedule item removed.' });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PR-005 Gate 5: Pre-publication Readiness Inspection Checklist
router.get('/examinations/:id/publication-readiness', requireAuth, (req, res) => {
  try {
    const examinationId = Number(req.params.id);
    const user = req.user!;

    const exam = db.prepare(`
      SELECT e.*, ay.name as academic_year_name
      FROM examinations e
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      WHERE e.id = ?
    `).get(examinationId) as any;

    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const blockers: string[] = [];

    // 1. Examination Schedules Check
    const schedules = db.prepare(`
      SELECT es.*, c.name as class_name, c.grade as class_grade, s.name as subject_name
      FROM examination_schedules es
      JOIN classes c ON es.class_id = c.id
      JOIN subjects s ON es.subject_id = s.id
      WHERE es.examination_id = ?
    `).all(examinationId) as any[];

    const hasSchedule = schedules.length > 0;
    if (!hasSchedule) {
      blockers.push('No examination schedules defined. All participating class-subject offerings must be scheduled.');
    }

    const unapprovedSchedules = schedules.filter(s => s.status !== 'approved' || !s.approved_by_user_id);
    const scheduleApproved = hasSchedule && unapprovedSchedules.length === 0;
    if (hasSchedule && !scheduleApproved) {
      blockers.push(`${unapprovedSchedules.length} schedule item(s) are in draft or lack authorized leadership approval provenance.`);
    }

    // 2. Marks Sheets Approval Check
    let allSheetsApproved = false;
    let approvedSheetsCount = 0;
    if (hasSchedule) {
      const sheets = db.prepare(`
        SELECT ms.*
        FROM marks_sheets ms
        WHERE ms.examination_id = ?
      `).all(examinationId) as any[];

      const approvedSheetMap = new Set<string>(
        sheets.filter(s => s.status === 'approved' && s.approved_by_user_id).map(s => `${s.class_id}:${s.subject_id}`)
      );

      const missingOrUnapproved: string[] = [];
      for (const s of schedules) {
        if (!approvedSheetMap.has(`${s.class_id}:${s.subject_id}`)) {
          missingOrUnapproved.push(`${s.class_name} - ${s.subject_name}`);
        }
      }

      approvedSheetsCount = approvedSheetMap.size;
      allSheetsApproved = missingOrUnapproved.length === 0;
      if (!allSheetsApproved) {
        blockers.push(`${missingOrUnapproved.length} required marks sheet(s) are missing or not yet in approved status: ${missingOrUnapproved.slice(0, 3).join(', ')}${missingOrUnapproved.length > 3 ? '...' : ''}.`);
      }
    }

    // 3. Student Subject Enrolment Confirmation Check
    const unconfirmedEnrolmentsRow = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM marks m
      WHERE m.examination_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM student_subject_enrollments sse
          WHERE sse.student_id = m.student_id
            AND sse.subject_id = m.subject_id
            AND sse.academic_year_id = ?
            AND sse.enrollment_status = 'confirmed'
        )
    `).get(examinationId, exam.academic_year_id) as { cnt: number };

    const unconfirmedCount = Number(unconfirmedEnrolmentsRow?.cnt || 0);
    const enrolmentsConfirmed = unconfirmedCount === 0;
    if (!enrolmentsConfirmed) {
      blockers.push(`${unconfirmedCount} mark record(s) belong to students without confirmed student-subject enrolment.`);
    }

    // 4. Approved Applicable Assessment Policy Profile
    const examGradeBand = exam.grade_band || 'all';
    let policy: any = null;
    if (exam.assessment_policy_id) {
      policy = db.prepare('SELECT * FROM assessment_policy_profiles WHERE id = ?').get(exam.assessment_policy_id);
    } else {
      policy = db.prepare(`
        SELECT * FROM assessment_policy_profiles
        WHERE academic_year_id = ?
          AND is_approved_by_school = 1
          AND (grade_band = ? OR ? = 'all' OR grade_band = 'all')
        ORDER BY version DESC, id DESC
        LIMIT 1
      `).get(exam.academic_year_id, examGradeBand, examGradeBand);
    }

    const policyApproved = policy != null && policy.is_approved_by_school === 1;
    if (!policyApproved) {
      blockers.push('No approved assessment policy profile found for this examination and academic year.');
    }

    // 5. Legacy Quarantine Check
    const quarantineCountRow = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM marks_sheets
      WHERE examination_id = ? AND status IN ('legacy_unmoderated', 'quarantined')
    `).get(examinationId) as { cnt: number };
    const quarantineMarksRow = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM quarantined_legacy_marks
      WHERE examination_id = ?
    `).get(examinationId) as { cnt: number };

    const legacyQuarantineClean = (quarantineCountRow?.cnt || 0) === 0 && (quarantineMarksRow?.cnt || 0) === 0;
    if (!legacyQuarantineClean) {
      blockers.push('Unresolved quarantined or unmoderated marks sheets exist for this examination.');
    }

    // 6. User Publisher Authorization Check
    const activeAuths = getActiveStaffAuthorizations(user.id, exam.academic_year_id);
    const publisherAuthorized = activeAuths.some(a =>
      ['principal', 'vice_principal_academic'].includes(a.auth_role) &&
      (a.grade_band === 'all' || a.grade_band === examGradeBand)
    );
    if (!publisherAuthorized) {
      blockers.push('Current user does not have Principal or VP Academic publishing authorization.');
    }

    const isReady = blockers.length === 0;

    res.json({
      examination: exam,
      isReady,
      isPublished: exam.is_published === 1 || exam.status === 'published',
      blockers,
      checks: {
        hasSchedule,
        scheduleApproved,
        allSheetsApproved,
        enrolmentsConfirmed,
        policyApproved,
        legacyQuarantineClean,
        publisherAuthorized
      },
      details: {
        totalSchedules: schedules.length,
        approvedSchedules: schedules.length - unapprovedSchedules.length,
        approvedSheets: approvedSheetsCount,
        unconfirmedEnrolments: unconfirmedCount,
        policy: policy ? { id: policy.id, title: policy.title, policyCode: policy.policy_code, isApproved: policy.is_approved_by_school === 1 } : null
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

// PR-005 Gate 4B / FIX 02: Retrieve Publication Summary & Audit Snapshot
router.get('/examinations/:id/publication-summary', requireAuth, (req, res) => {
  try {
    const examinationId = Number(req.params.id);
    const user = req.user!;

    // 1. Live active user account check on EVERY request (Requirement 1 & 4)
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as { id: number; is_active: number } | undefined;
    if (!activeUser || activeUser.is_active !== 1) {
      res.status(401).json({
        error: 'Authentication failed: User account is deactivated or inactive.',
        code: 'USER_DEACTIVATED'
      });
      return;
    }

    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examinationId) as any;
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const isPublished = exam.is_published === 1 || exam.status === 'published';

    // 2. Unpublished Confidentiality Gate (Requirement 6)
    if (!isPublished) {
      const isLeadership = hasAcademicStaffRole(
        user.id,
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

    // 3. Scoped Authorization for Published Examination (Gate 5 Phase 0)
    const activeAuths = getActiveStaffAuthorizations(user.id, exam.academic_year_id);
    const examGradeBand = exam.grade_band || 'all';

    // Whole-exam leadership: Requires documented, active leadership appointment (Principal / VP Academic)
    // A plain admin role without an active academic leadership appointment does not receive whole-exam confidential results.
    const isWholeExamLeadership = activeAuths.some(a =>
      ['principal', 'vice_principal_academic'].includes(a.auth_role) &&
      (a.grade_band === 'all' || a.grade_band === examGradeBand)
    );

    // Section Head / Exam Coordinator with limited band
    const leadershipBands = activeAuths
      .filter(a => ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'].includes(a.auth_role))
      .map(a => a.grade_band);

    // Teacher class assignments in this academic year (both subject teachers and direct class teachers)
    const teacherAssignments = db.prepare(`
      SELECT DISTINCT class_id, subject_id, assignment_type
      FROM teacher_assignments
      WHERE teacher_id = ? AND academic_year_id = ?
    `).all(user.id, exam.academic_year_id) as any[];

    const directClasses = db.prepare(`
      SELECT id as class_id
      FROM classes
      WHERE class_teacher_id = ? AND academic_year_id = ?
    `).all(user.id, exam.academic_year_id) as any[];

    const assignedClassIds = new Set<number>([
      ...teacherAssignments.map(ta => ta.class_id),
      ...directClasses.map(dc => dc.class_id)
    ]);

    // If neither whole-exam leadership, nor leadership band, nor assigned teacher -> 403 Forbidden
    if (!isWholeExamLeadership && leadershipBands.length === 0 && assignedClassIds.size === 0) {
      res.status(403).json({
        error: 'Access denied: You do not possess record-scoped authorization for this examination in this academic year.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
      return;
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

    if (!publication) {
      res.json({
        examination: exam,
        is_published: isPublished,
        publication: null
      });
      return;
    }

    // 4. Data Scoping & Filtering (Gate 5 Phase 0: Fail Closed on Malformed Snapshot)
    let filteredPublication = { ...publication };
    if (!isWholeExamLeadership && publication.publication_snapshot_json) {
      try {
        const snapshot = JSON.parse(publication.publication_snapshot_json);
        if (!snapshot || typeof snapshot !== 'object') {
          res.status(500).json({
            error: 'Security failure: Malformed publication snapshot payload.',
            code: 'MALFORMED_PUBLICATION_SNAPSHOT'
          });
          return;
        }
        const originalClasses = Array.isArray(snapshot.classes) ? snapshot.classes : [];
        const originalSheets = Array.isArray(snapshot.sheetSnapshots) ? snapshot.sheetSnapshots : [];

        const allowedClassIdSet = new Set<number>();
        for (const cls of originalClasses) {
          const classGrade = cls.classGrade || (db.prepare('SELECT grade FROM classes WHERE id = ?').get(cls.classId) as any)?.grade;
          const coveredByBand = leadershipBands.some(band =>
            band === 'all' || doesBandCoverGrade(band, classGrade)
          );
          if (coveredByBand || assignedClassIds.has(cls.classId)) {
            allowedClassIdSet.add(cls.classId);
          }
        }

        if (allowedClassIdSet.size === 0) {
          res.status(403).json({
            error: 'Access denied: No classes in this examination match your authorized teaching or leadership scope.',
            code: 'INSUFFICIENT_AUTHORIZATION'
          });
          return;
        }

        const filteredClasses = originalClasses.filter((c: any) => allowedClassIdSet.has(c.classId));
        const filteredSheets = originalSheets.filter((s: any) => allowedClassIdSet.has(s.classId));

        snapshot.classes = filteredClasses;
        snapshot.sheetSnapshots = filteredSheets;
        filteredPublication.publication_snapshot_json = JSON.stringify(snapshot);
      } catch (err: any) {
        res.status(500).json({
          error: 'Security failure: Unable to safely filter publication snapshot for authorized scope. Access denied.',
          code: 'MALFORMED_PUBLICATION_SNAPSHOT'
        });
        return;
      }
    }

    res.json({
      examination: exam,
      is_published: isPublished,
      publication: filteredPublication
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

// PR-005 G5F-03: Retrieve Authoritative Published Mark Record for Corrections
router.get('/published-mark', requireAuth, (req, res) => {
  try {
    const user = req.user!;
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as { id: number; is_active: number } | undefined;
    if (!activeUser || activeUser.is_active !== 1) {
      res.status(403).json({ error: 'User account is deactivated or invalid.', code: 'USER_DEACTIVATED' });
      return;
    }

    const { examinationId, studentId, subjectId } = req.query;
    if (!examinationId || !studentId || !subjectId) {
      res.status(400).json({ error: 'examinationId, studentId, and subjectId are required.' });
      return;
    }

    const eId = Number(examinationId);
    const stId = Number(studentId);
    const subId = Number(subjectId);

    const mark = db.prepare(`
      SELECT m.*,
             ms.id as sheet_id, ms.status as sheet_status, ms.academic_year_id,
             e.id as exam_id, e.is_published, e.status as exam_status,
             c.id as class_id, c.grade as class_grade, c.name as class_name,
             sub.id as subject_id, sub.name as subject_name, sub.code as subject_code,
             s.id as student_id, s.full_name as student_name, s.admission_no
      FROM marks m
      JOIN marks_sheets ms ON m.sheet_id = ms.id
      JOIN examinations e ON m.examination_id = e.id
      JOIN classes c ON m.class_id = c.id
      JOIN subjects sub ON m.subject_id = sub.id
      JOIN students s ON m.student_id = s.id
      WHERE m.examination_id = ? AND m.student_id = ? AND m.subject_id = ?
    `).get(eId, stId, subId) as any;

    if (!mark) {
      res.status(404).json({
        error: 'Target published mark record not found for this examination, student, and subject.',
        code: 'MARK_NOT_FOUND'
      });
      return;
    }

    if (mark.is_published !== 1 || mark.exam_status !== 'published' || mark.sheet_status !== 'published') {
      res.status(400).json({
        error: 'Target mark belongs to an examination or marks sheet that is not officially published.',
        code: 'EXAMINATION_NOT_PUBLISHED'
      });
      return;
    }

    // G6-02 Role & Scope Authorization Check: Plain administrator bypass REMOVED.
    // Strictly requires active academic leadership authorization matching grade band & year,
    // OR active teaching assignment for this exact class, subject, and academic year.
    const isAssigned = db.prepare(`
      SELECT id FROM teacher_assignments
      WHERE teacher_id = ? AND class_id = ? AND subject_id = ? AND academic_year_id = ? AND assignment_type = 'subject_teacher'
    `).get(user.id, mark.class_id, mark.subject_id, mark.academic_year_id);

    const activeAuths = getActiveStaffAuthorizations(user.id, mark.academic_year_id);
    const isLeadership = activeAuths.some(a =>
      ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role) &&
      (a.grade_band === 'all' || doesBandCoverGrade(a.grade_band, mark.class_grade))
    );

    if (!isAssigned && !isLeadership) {
      res.status(403).json({
        error: 'Access denied: You are not authorized to view or correct this student mark.',
        code: 'INSUFFICIENT_AUTHORIZATION'
      });
      return;
    }

    const markObj = {
      id: mark.id,
      markId: mark.id,
      sheetId: mark.sheet_id,
      examinationId: mark.examination_id,
      studentId: mark.student_id,
      studentName: mark.student_name,
      admissionNo: mark.admission_no,
      subjectId: mark.subject_id,
      subjectName: mark.subject_name,
      subjectCode: mark.subject_code,
      score: mark.score !== null ? Number(mark.score) : null,
      maxScore: mark.max_score ? Number(mark.max_score) : 100.0,
      assessmentStatus: mark.assessment_status,
      gradeLetter: mark.grade_letter,
      updatedAt: mark.updated_at
    };

    res.json({
      ...markObj,
      mark: markObj
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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


