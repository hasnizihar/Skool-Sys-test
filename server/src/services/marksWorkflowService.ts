import { db } from '../db/database.js';
import { AuthUser } from '../middleware/auth.js';
import {
  canReviewMarksSheet,
  canApproveMarksSheet,
  canViewMarksSheet,
  getActiveStaffAuthorizations,
  doesBandCoverGrade
} from './academicAuthorizationService.js';
import { isStudentEligibleForSubject } from './studentEnrollmentService.js';

function ensureRevisionsTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS marks_sheet_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sheet_id INTEGER NOT NULL REFERENCES marks_sheets(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL CHECK(revision >= 1),
        status TEXT NOT NULL,
        saved_by_user_id INTEGER REFERENCES users(id),
        marks_payload_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(sheet_id, revision)
      );
    `);
  } catch {}
}

function recordRevisionSnapshot(
  sheetId: number,
  revision: number,
  status: string,
  userId: number,
  examinationId: number,
  classId: number,
  subjectId: number
) {
  let rosterMarks = db.prepare(`
    SELECT s.id as student_id, s.id as studentId,
           s.admission_no as admission_no, s.admission_no as admissionNo,
           s.full_name as full_name, s.full_name as fullName,
           m.score,
           COALESCE(m.max_score, 100.0) as max_score,
           COALESCE(m.max_score, 100.0) as maxScore,
           COALESCE(m.assessment_status, 'NOT_ASSESSED') as assessment_status,
           COALESCE(m.assessment_status, 'NOT_ASSESSED') as assessmentStatus,
           COALESCE(m.grade_letter, '-') as grade_letter,
           COALESCE(m.grade_letter, '-') as gradeLetter,
           COALESCE(m.is_absent, 0) as is_absent,
           COALESCE(m.is_absent, 0) as isAbsent,
           COALESCE(m.is_exempt, 0) as is_exempt,
           COALESCE(m.is_exempt, 0) as isExempt,
           m.remarks,
           COALESCE(m.status, 'draft') as status,
           COALESCE(m.status, 'draft') as markStatus,
           m.updated_at as updated_at,
           m.updated_at as updatedAt
    FROM student_subject_enrollments sse
    JOIN enrollments e ON sse.student_id = e.student_id AND sse.academic_year_id = e.academic_year_id
    JOIN students s ON sse.student_id = s.id
    LEFT JOIN marks m ON m.student_id = s.id AND m.sheet_id = ?
    WHERE sse.subject_id = ?
      AND e.class_id = ?
      AND e.status = 'enrolled'
      AND sse.enrollment_status NOT IN ('dropped', 'transferred')
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(sheetId, subjectId, classId) as any[];

  // Fallback / complement: if no participating students found (e.g. legacy sheets), query marks directly
  if (!rosterMarks || rosterMarks.length === 0) {
    rosterMarks = db.prepare(`
      SELECT m.student_id, m.student_id as studentId,
             s.admission_no, s.admission_no as admissionNo,
             s.full_name, s.full_name as fullName,
             m.score, m.max_score, m.max_score as maxScore,
             m.assessment_status, m.assessment_status as assessmentStatus,
             m.grade_letter, m.grade_letter as gradeLetter,
             m.is_absent, m.is_absent as isAbsent,
             m.is_exempt, m.is_exempt as isExempt,
             m.remarks, m.status, m.status as markStatus,
             m.updated_at, m.updated_at as updatedAt
      FROM marks m
      JOIN students s ON m.student_id = s.id
      WHERE m.sheet_id = ?
      ORDER BY m.student_id ASC
    `).all(sheetId) as any[];
  }

  db.prepare(`
    INSERT INTO marks_sheet_revisions (sheet_id, revision, status, saved_by_user_id, marks_payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(sheetId, revision, status, userId, JSON.stringify(rosterMarks));
}

export interface MarkEntryInput {
  studentId: number;
  score?: number | null;
  assessmentStatus?: 'PRESENT' | 'ABSENT' | 'MEDICAL' | 'EXEMPT' | 'NOT_ASSESSED';
  maxScore?: number;
  remarks?: string;
}

export function calcGradeLetter(
  score: number | null,
  assessmentStatus: string,
  maxScore: number = 100.0
): string {
  if (assessmentStatus === 'ABSENT') return 'AB';
  if (assessmentStatus === 'EXEMPT') return 'EX';
  if (assessmentStatus === 'MEDICAL') return 'MED';
  if (assessmentStatus === 'NOT_ASSESSED' || score === null || score === undefined) return '-';
  if (!maxScore || maxScore <= 0) return '-';

  const percentage = (score / maxScore) * 100.0;
  if (percentage >= 75.0) return 'A';
  if (percentage >= 65.0) return 'B';
  if (percentage >= 50.0) return 'C';
  if (percentage >= 35.0) return 'S';
  return 'F';
}

export function evaluateProvisionalGrade(
  score: number | null,
  assessmentStatus: string,
  maxScore: number = 100.0
): {
  gradeLetter: string;
  percentage: number | null;
  isProvisional: true;
} {
  const gradeLetter = calcGradeLetter(score, assessmentStatus, maxScore);
  const percentage = (score !== null && score !== undefined && maxScore > 0 && assessmentStatus === 'PRESENT')
    ? Math.round(((score / maxScore) * 100.0) * 10) / 10
    : null;
  return {
    gradeLetter,
    percentage,
    isProvisional: true
  };
}

/**
 * Ensures a marks sheet container exists for the given exam, class, and subject.
 */
export function ensureMarksSheet(examinationId: number, classId: number, subjectId: number, user: AuthUser): any {
  let sheet = db.prepare(`
    SELECT * FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?
  `).get(examinationId, classId, subjectId) as any;

  if (sheet) return sheet;

  const exam = db.prepare('SELECT id, academic_year_id FROM examinations WHERE id = ?').get(examinationId) as any;
  const classRow = db.prepare('SELECT id, academic_year_id FROM classes WHERE id = ?').get(classId) as any;

  if (!exam || !classRow) {
    const err = new Error('Examination or Class not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  if (!classRow.academic_year_id || !exam.academic_year_id) {
    const err = new Error('Missing academic year for class or examination.');
    (err as any).statusCode = 400;
    (err as any).code = 'MISSING_ACADEMIC_YEAR';
    throw err;
  }

  if (classRow.academic_year_id !== exam.academic_year_id) {
    const err = new Error(`Academic year mismatch: examination year (${exam.academic_year_id}) does not match class year (${classRow.academic_year_id}).`);
    (err as any).statusCode = 400;
    (err as any).code = 'ACADEMIC_YEAR_MISMATCH';
    throw err;
  }

  const yearId = classRow.academic_year_id;

  // Validate subject is offered for class in class_subjects
  const classSubject = db.prepare(`
    SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?
  `).get(classId, subjectId);

  if (!classSubject) {
    const err = new Error(`Subject ID ${subjectId} is not offered for class ID ${classId}.`);
    (err as any).statusCode = 400;
    (err as any).code = 'SUBJECT_NOT_OFFERED';
    throw err;
  }

  // Look up appointed subject teacher
  const assignment = db.prepare(`
    SELECT teacher_id FROM teacher_assignments
    WHERE class_id = ? AND subject_id = ? AND assignment_type = 'subject_teacher' AND academic_year_id = ?
    LIMIT 1
  `).get(classId, subjectId, yearId) as { teacher_id: number } | undefined;

  // Truthful teacher attribution: Keep NULL if unassigned; NEVER fabricate user.id
  const teacherId = assignment?.teacher_id || null;

  const res = db.prepare(`
    INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, revision, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 'draft', datetime('now'), datetime('now'))
  `).run(examinationId, classId, subjectId, yearId, teacherId);

  return db.prepare('SELECT * FROM marks_sheets WHERE id = ?').get(Number(res.lastInsertRowid));
}

/**
 * Retrieves detailed sheet information including roster, eligibility, and canonical marks.
 */
export function getMarksSheetDetails(sheetId: number, user: AuthUser): any {
  const sheet = db.prepare(`
    SELECT ms.*,
           c.name as class_name, c.grade,
           sub.name as subject_name, sub.code as subject_code,
           e.name as exam_name, e.term as exam_term, e.is_published, e.status as exam_status,
           u_teacher.full_name as teacher_name,
           u_reviewer.full_name as reviewer_name,
           u_approver.full_name as approver_name
    FROM marks_sheets ms
    JOIN classes c ON ms.class_id = c.id
    JOIN subjects sub ON ms.subject_id = sub.id
    JOIN examinations e ON ms.examination_id = e.id
    LEFT JOIN users u_teacher ON ms.teacher_id = u_teacher.id
    LEFT JOIN users u_reviewer ON ms.reviewed_by_user_id = u_reviewer.id
    LEFT JOIN users u_approver ON ms.approved_by_user_id = u_approver.id
    WHERE ms.id = ?
  `).get(sheetId) as any;

  if (!sheet) {
    const err = new Error('Marks sheet not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  // Permission check: Assigned teacher, class teacher, scoped leadership, or admin
  const viewAuth = canViewMarksSheet(user, sheetId);
  if (!viewAuth.allowed && user.role !== 'admin') {
    const err = new Error(viewAuth.reason || 'Access denied: You do not have permission to view this marks sheet.');
    (err as any).statusCode = 403;
    throw err;
  }

  // Confidentiality gate: Unpublished marks cannot be viewed by unauthorized staff
  if (sheet.is_published !== 1 && sheet.exam_status !== 'published') {
    if (!viewAuth.allowed && user.role !== 'admin') {
      const err = new Error('Access denied: Unpublished examination marks are confidential.');
      (err as any).statusCode = 403;
      throw err;
    }
  }

  // Load roster of students enrolled in the class
  const classStudents = db.prepare(`
    SELECT s.id as student_id, s.admission_no, s.full_name, s.calling_name,
           e.roll_number
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    WHERE e.class_id = ? AND e.status = 'enrolled'
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(sheet.class_id) as any[];

  // Load existing marks
  const existingMarks = db.prepare(`
    SELECT * FROM marks WHERE sheet_id = ?
  `).all(sheetId) as any[];
  const marksMap = new Map<number, any>(existingMarks.map(m => [m.student_id, m]));

  const roster = classStudents.map(student => {
    const mark = marksMap.get(student.student_id);
    const eligibility = isStudentEligibleForSubject(student.student_id, sheet.subject_id, sheet.academic_year_id);

    return {
      student_id: student.student_id,
      admission_no: student.admission_no,
      full_name: student.full_name,
      calling_name: student.calling_name,
      roll_number: student.roll_number,
      eligibility: {
        is_eligible_for_draft: eligibility.isEligibleForDraft,
        is_officially_confirmed: eligibility.isOfficiallyConfirmed,
        status: eligibility.status || 'not_enrolled',
        category: eligibility.category || null
      },
      mark: mark ? {
        id: mark.id,
        score: mark.score,
        max_score: mark.max_score,
        assessment_status: mark.assessment_status,
        grade_letter: mark.grade_letter,
        status: mark.status,
        remarks: mark.remarks,
        entered_by_user_id: mark.entered_by_user_id,
        updated_at: mark.updated_at
      } : null
    };
  });

  return {
    sheet: {
      id: sheet.id,
      examination_id: sheet.examination_id,
      class_id: sheet.class_id,
      subject_id: sheet.subject_id,
      academic_year_id: sheet.academic_year_id,
      teacher_id: sheet.teacher_id,
      teacher_name: sheet.teacher_name,
      revision: sheet.revision,
      status: sheet.status,
      submission_notes: sheet.submission_notes,
      submitted_at: sheet.submitted_at,
      reviewed_by_user_id: sheet.reviewed_by_user_id,
      reviewer_name: sheet.reviewer_name,
      reviewed_at: sheet.reviewed_at,
      review_remarks: sheet.review_remarks,
      approved_by_user_id: sheet.approved_by_user_id,
      approver_name: sheet.approver_name,
      approved_at: sheet.approved_at,
      approval_remarks: sheet.approval_remarks,
      updated_at: sheet.updated_at
    },
    exam: {
      id: sheet.examination_id,
      name: sheet.exam_name,
      term: sheet.exam_term,
      is_published: sheet.is_published,
      status: sheet.exam_status
    },
    class: {
      id: sheet.class_id,
      name: sheet.class_name,
      grade: sheet.grade
    },
    subject: {
      id: sheet.subject_id,
      name: sheet.subject_name,
      code: sheet.subject_code
    },
    roster
  };
}

/**
 * Saves draft marks atomically with optimistic concurrency control (baseRevision CAS).
 */
export function saveDraftMarks(params: {
  sheetId: number;
  baseRevision: number;
  marks: MarkEntryInput[];
  user: AuthUser;
  ipAddress?: string;
}): { success: boolean; sheetId: number; newRevision: number; marksCount: number } {
  const { sheetId, baseRevision, marks, user, ipAddress = '127.0.0.1' } = params;

  if (!sheetId || typeof baseRevision !== 'number' || !Array.isArray(marks)) {
    const err = new Error('sheetId, baseRevision, and marks array are required.');
    (err as any).statusCode = 400;
    throw err;
  }

  ensureRevisionsTable();
  db.exec('BEGIN IMMEDIATE;');
  try {
    // 1. Fetch current sheet state
    const sheet = db.prepare('SELECT * FROM marks_sheets WHERE id = ?').get(sheetId) as any;
    if (!sheet) {
      const err = new Error('Marks sheet not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    // 2. Status Guard: Must be in draft or returned
    if (!['draft', 'returned'].includes(sheet.status)) {
      const err = new Error(`Sheet is locked in status '${sheet.status}' and cannot accept draft modifications. Approved, submitted, or published sheets require formal review or correction.`);
      (err as any).statusCode = 409;
      (err as any).code = 'LOCKED_SHEET';
      throw err;
    }

    // 3. Permission check: Verified assigned subject teacher ONLY (P0-01, P0-02 least privilege)
    // Plain admins and review-only leadership CANNOT enter raw marks unless they are the assigned teacher.
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as any;
    if (!activeUser || activeUser.is_active !== 1) {
      const err = new Error('User account is deactivated or invalid.');
      (err as any).statusCode = 403;
      (err as any).code = 'USER_DEACTIVATED';
      throw err;
    }

    const assignment = db.prepare(`
      SELECT teacher_id FROM teacher_assignments
      WHERE class_id = ? AND subject_id = ? AND assignment_type = 'subject_teacher' AND academic_year_id = ? AND teacher_id = ?
    `).get(sheet.class_id, sheet.subject_id, sheet.academic_year_id, user.id);

    if (!assignment) {
      const err = new Error('Access denied: Only the verified assigned subject teacher is authorized to enter or edit draft marks for this sheet.');
      (err as any).statusCode = 403;
      (err as any).code = 'UNASSIGNED_TEACHER';
      throw err;
    }

    // 4. Optimistic Concurrency Control (CAS): compare baseRevision with sheet.revision
    if (sheet.revision !== baseRevision) {
      const err = new Error(`Concurrent modification detected. Sheet revision is ${sheet.revision}, but your request supplied baseRevision ${baseRevision}. Please reload the latest sheet before saving.`);
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_REVISION';
      (err as any).currentRevision = sheet.revision;
      (err as any).baseRevision = baseRevision;
      throw err;
    }

    // 5. Pre-validate all marks inputs
    const validatedMarks: Array<{
      studentId: number;
      score: number | null;
      maxScore: number;
      assessmentStatus: string;
      gradeLetter: string;
      remarks?: string;
    }> = [];

    for (const m of marks) {
      const studentId = Number(m.studentId);
      if (!studentId || isNaN(studentId)) {
        const err = new Error('Each mark item must specify a valid studentId.');
        (err as any).statusCode = 400;
        throw err;
      }

      // Check student enrolled in class
      const enrollment = db.prepare(`
        SELECT id FROM enrollments WHERE student_id = ? AND class_id = ? AND status = 'enrolled'
      `).get(studentId, sheet.class_id);

      if (!enrollment) {
        const err = new Error(`Student ID ${studentId} is not actively enrolled in class ${sheet.class_id}.`);
        (err as any).statusCode = 400;
        (err as any).code = 'CROSS_CLASS_STUDENT';
        throw err;
      }

      // Check subject eligibility: Student must have active positive subject enrollment (P0-02)
      const elig = isStudentEligibleForSubject(studentId, sheet.subject_id, sheet.academic_year_id);
      if (!elig.isEligibleForDraft) {
        const err = new Error(`Student ID ${studentId} is not eligible for subject ID ${sheet.subject_id} (status: '${elig.status || 'not_enrolled'}'). Dropped, transferred, or non-enrolled students cannot receive marks.`);
        (err as any).statusCode = 400;
        (err as any).code = 'INELIGIBLE_SUBJECT_ENROLLMENT';
        throw err;
      }

      // Validate remarks type (P1-04)
      if (m.remarks !== null && m.remarks !== undefined && typeof m.remarks !== 'string') {
        const err = new Error(`Invalid remarks for student ID ${studentId}: remarks must be a string or null.`);
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_REMARKS_TYPE';
        throw err;
      }

      // Canonical score and assessment_status validation
      const maxScore = m.maxScore !== undefined && m.maxScore !== null ? Number(m.maxScore) : 100.0;
      if (isNaN(maxScore) || maxScore <= 0.0 || maxScore > 1000.0) {
        const err = new Error(`Invalid maxScore ${m.maxScore} for student ${studentId}: must be in range (0, 1000].`);
        (err as any).statusCode = 400;
        throw err;
      }

      let assessmentStatus = m.assessmentStatus || 'PRESENT';
      let score: number | null = null;

      if (['ABSENT', 'MEDICAL', 'EXEMPT', 'NOT_ASSESSED'].includes(assessmentStatus)) {
        if (m.score !== null && m.score !== undefined && m.score !== ('' as any)) {
          const err = new Error(`Student ID ${studentId} is marked '${assessmentStatus}' but has a numeric score provided (${m.score}). Numeric scores are strictly forbidden when non-present.`);
          (err as any).statusCode = 400;
          throw err;
        }
        score = null;
      } else if (m.score === null || m.score === undefined || m.score === ('' as any)) {
        assessmentStatus = 'NOT_ASSESSED';
        score = null;
      } else {
        const numScore = Number(m.score);
        if (isNaN(numScore)) {
          const err = new Error(`Score '${m.score}' for student ID ${studentId} is not a valid number.`);
          (err as any).statusCode = 400;
          throw err;
        }
        if (numScore < 0.0 || numScore > maxScore) {
          const err = new Error(`Score ${numScore} for student ID ${studentId} is out of bounds [0, ${maxScore}].`);
          (err as any).statusCode = 400;
          throw err;
        }
        if (Math.round(numScore * 10) / 10 !== numScore) {
          const err = new Error(`Score ${numScore} for student ID ${studentId} exceeds allowed 1-decimal precision; exceeds single-decimal precision. Silent rounding or truncation is strictly prohibited.`);
          (err as any).statusCode = 400;
          throw err;
        }
        assessmentStatus = 'PRESENT';
        score = numScore;
      }

      const gradeLetter = calcGradeLetter(score, assessmentStatus, maxScore);
      validatedMarks.push({
        studentId,
        score,
        maxScore,
        assessmentStatus,
        gradeLetter,
        remarks: m.remarks
      });
    }

    // 6. Conditional CAS UPDATE on marks_sheets to increment revision
    const newRevision = sheet.revision + 1;
    const sheetUpdateRes = db.prepare(`
      UPDATE marks_sheets SET
        revision = ?,
        updated_at = datetime('now')
      WHERE id = ? AND revision = ?
    `).run(newRevision, sheetId, baseRevision);

    if (sheetUpdateRes.changes !== 1) {
      const err = new Error('Concurrent modification detected during sheet revision update.');
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_REVISION';
      throw err;
    }

    // 7. Upsert validated marks and record individual audit trail
    const upsertStmt = db.prepare(`
      INSERT INTO marks (
        sheet_id, examination_id, class_id, subject_id, student_id,
        max_score, score, assessment_status, grade_letter, status, remarks, entered_by_user_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(examination_id, subject_id, student_id) DO UPDATE SET
        sheet_id = excluded.sheet_id,
        max_score = excluded.max_score,
        score = excluded.score,
        assessment_status = excluded.assessment_status,
        grade_letter = excluded.grade_letter,
        status = excluded.status,
        remarks = excluded.remarks,
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
      `).get(sheet.examination_id, sheet.subject_id, vm.studentId) as any;

      upsertStmt.run(
        sheetId, sheet.examination_id, sheet.class_id, sheet.subject_id, vm.studentId,
        vm.maxScore, vm.score, vm.assessmentStatus, vm.gradeLetter, 'draft', vm.remarks || null, user.id
      );

      const markRow = db.prepare(`
        SELECT id FROM marks WHERE examination_id = ? AND subject_id = ? AND student_id = ?
      `).get(sheet.examination_id, sheet.subject_id, vm.studentId) as any;

      auditStmt.run(
        markRow.id, sheetId, sheet.examination_id, vm.studentId, sheet.subject_id,
        prevMark ? 'DRAFT_SAVE' : 'INITIAL_ENTRY',
        user.id,
        prevMark?.score ?? null, vm.score,
        prevMark?.assessment_status ?? null, vm.assessmentStatus,
        ipAddress
      );
    }

    // 8. Capture full immutable post-write sheet snapshot in marks_sheet_revisions (P1-03)
    recordRevisionSnapshot(sheetId, newRevision, sheet.status, user.id, sheet.examination_id, sheet.class_id, sheet.subject_id);

    db.exec('COMMIT;');
    return {
      success: true,
      sheetId,
      newRevision,
      marksCount: validatedMarks.length
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Submits a marks sheet. Enforces that all students have officially confirmed subject enrollment.
 */
export function submitMarksSheet(params: {
  sheetId: number;
  baseRevision: number;
  notes?: string;
  user: AuthUser;
  ipAddress?: string;
}): { success: boolean; sheetId: number; status: string; newRevision: number } {
  const { sheetId, baseRevision, notes = '', user, ipAddress = '127.0.0.1' } = params;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const sheet = db.prepare('SELECT * FROM marks_sheets WHERE id = ?').get(sheetId) as any;
    if (!sheet) {
      const err = new Error('Marks sheet not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (!['draft', 'returned'].includes(sheet.status)) {
      const err = new Error(`Sheet is currently '${sheet.status}' and cannot be submitted. Only draft or returned sheets can be submitted.`);
      (err as any).statusCode = 409;
      (err as any).code = 'INVALID_STATUS';
      throw err;
    }

    // Permission check: Verified assigned subject teacher ONLY (P0-01, P0-02 least privilege)
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as any;
    if (!activeUser || activeUser.is_active !== 1) {
      const err = new Error('User account is deactivated or invalid.');
      (err as any).statusCode = 403;
      (err as any).code = 'USER_DEACTIVATED';
      throw err;
    }

    const assignment = db.prepare(`
      SELECT teacher_id FROM teacher_assignments
      WHERE class_id = ? AND subject_id = ? AND assignment_type = 'subject_teacher' AND academic_year_id = ? AND teacher_id = ?
    `).get(sheet.class_id, sheet.subject_id, sheet.academic_year_id, user.id);

    if (!assignment) {
      const err = new Error('Access denied: Only the verified assigned subject teacher can submit marks sheets for review.');
      (err as any).statusCode = 403;
      (err as any).code = 'UNASSIGNED_TEACHER';
      throw err;
    }

    // Optimistic Concurrency Control (CAS)
    if (sheet.revision !== baseRevision) {
      const err = new Error(`Concurrent modification detected. Sheet revision is ${sheet.revision}, but baseRevision was ${baseRevision}. Please reload latest sheet.`);
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_REVISION';
      throw err;
    }

    // MANDATORY Gate 3R Fix P1-06: Participating Subject Roster Validation
    // Query only students enrolled in this class who are participating in THIS subject (excluding dropped/transferred)
    const participatingStudents = db.prepare(`
      SELECT s.id, s.admission_no, s.full_name, sse.enrollment_status, sse.enrollment_category
      FROM student_subject_enrollments sse
      JOIN enrollments e ON sse.student_id = e.student_id AND sse.academic_year_id = e.academic_year_id
      JOIN students s ON sse.student_id = s.id
      WHERE sse.subject_id = ?
        AND e.class_id = ?
        AND e.status = 'enrolled'
        AND sse.enrollment_status NOT IN ('dropped', 'transferred')
      ORDER BY e.roll_number ASC, s.admission_no ASC
    `).all(sheet.subject_id, sheet.class_id) as any[];

    if (participatingStudents.length === 0) {
      const err = new Error('Cannot submit marks sheet: No active participating students enrolled for this subject in the class.');
      (err as any).statusCode = 400;
      (err as any).code = 'EMPTY_ROSTER';
      throw err;
    }

    for (const stu of participatingStudents) {
      if (stu.enrollment_status !== 'confirmed') {
        const err = new Error(
          `Cannot submit marks sheet: Participating student ${stu.full_name} (${stu.admission_no}) has unconfirmed subject enrollment ('${stu.enrollment_status}'). Official submission requires all participating students to have officially confirmed subject enrollment by academic leadership.`
        );
        (err as any).statusCode = 422;
        (err as any).code = 'UNCONFIRMED_ENROLLMENT';
        throw err;
      }

      // Check mark presence
      const m = db.prepare(`
        SELECT id, assessment_status, score FROM marks
        WHERE examination_id = ? AND subject_id = ? AND student_id = ?
      `).get(sheet.examination_id, sheet.subject_id, stu.id) as any;

      if (!m || m.assessment_status === 'NOT_ASSESSED') {
        const err = new Error(`Cannot submit marks sheet: All participating students must be assessed. Student ${stu.full_name} (${stu.admission_no}) is currently unassessed.`);
        (err as any).statusCode = 400;
        (err as any).code = 'UNASSESSED_STUDENT';
        throw err;
      }
    }

    // Update sheet status to submitted
    const newRevision = sheet.revision + 1;
    const sheetUpdate = db.prepare(`
      UPDATE marks_sheets SET
        status = 'submitted',
        submission_notes = ?,
        submitted_at = datetime('now'),
        revision = ?,
        updated_at = datetime('now')
      WHERE id = ? AND revision = ?
    `).run(notes || null, newRevision, sheetId, baseRevision);

    if (sheetUpdate.changes !== 1) {
      const err = new Error('Concurrent modification detected during submission.');
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_REVISION';
      throw err;
    }

    // Update marks status to submitted
    db.prepare("UPDATE marks SET status = 'submitted', updated_at = datetime('now') WHERE sheet_id = ?").run(sheetId);

    // Audit log
    db.prepare(`
      INSERT INTO marks_audit_history (
        mark_id, sheet_id, examination_id, student_id, subject_id,
        action, actor_user_id, reason, ip_address, created_at
      ) VALUES (0, ?, ?, 0, ?, 'SUBMISSION', ?, ?, ?, datetime('now'))
    `).run(sheetId, sheet.examination_id, sheet.subject_id, user.id, notes || 'Sheet submitted for moderation', ipAddress);

    // Capture full immutable post-write sheet snapshot in marks_sheet_revisions (P1-03)
    recordRevisionSnapshot(sheetId, newRevision, 'submitted', user.id, sheet.examination_id, sheet.class_id, sheet.subject_id);

    db.exec('COMMIT;');
    return {
      success: true,
      sheetId,
      status: 'submitted',
      newRevision
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Reviews or returns a submitted marks sheet.
 * Enforces Institutional Segregation of Duties: anti-self-review for assigned teacher and marks entrants.
 */
export function reviewMarksSheet(params: {
  sheetId: number;
  baseRevision: number;
  decision: 'endorse' | 'return';
  remarks: string;
  user: AuthUser;
  ipAddress?: string;
}): { success: boolean; sheetId: number; status: string; newRevision: number } {
  const { sheetId, baseRevision, decision, remarks, user, ipAddress = '127.0.0.1' } = params;

  if (!['endorse', 'return'].includes(decision)) {
    const err = new Error("Invalid review decision: must be 'endorse' or 'return'.");
    (err as any).statusCode = 400;
    throw err;
  }

  if (decision === 'return' && (!remarks || !remarks.trim())) {
    const err = new Error('Mandatory review remarks are required when returning a marks sheet.');
    (err as any).statusCode = 400;
    throw err;
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const sheet = db.prepare('SELECT * FROM marks_sheets WHERE id = ?').get(sheetId) as any;
    if (!sheet) {
      const err = new Error('Marks sheet not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (sheet.status !== 'submitted') {
      const err = new Error(`Sheet status is '${sheet.status}'. Only sheets with status 'submitted' can be reviewed or returned.`);
      (err as any).statusCode = 409;
      (err as any).code = 'INVALID_STATUS';
      throw err;
    }

    // Segregation of Duties Check
    const reviewAuth = canReviewMarksSheet(user, sheetId);
    if (!reviewAuth.allowed) {
      const err = new Error(reviewAuth.reason || 'Access denied: You do not have authorization to review this marks sheet.');
      (err as any).statusCode = 403;
      (err as any).code = reviewAuth.code || 'UNAUTHORIZED_REVIEW';
      throw err;
    }

    // Optimistic Concurrency Control (CAS)
    if (sheet.revision !== baseRevision) {
      const err = new Error(`Concurrent modification detected. Sheet revision is ${sheet.revision}, but baseRevision was ${baseRevision}. Please reload latest sheet.`);
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_REVISION';
      throw err;
    }

    const targetStatus = decision === 'endorse' ? 'reviewed' : 'returned';
    const newRevision = sheet.revision + 1;

    const sheetUpdate = db.prepare(`
      UPDATE marks_sheets SET
        status = ?,
        reviewed_by_user_id = ?,
        reviewed_at = datetime('now'),
        review_remarks = ?,
        revision = ?,
        updated_at = datetime('now')
      WHERE id = ? AND revision = ?
    `).run(targetStatus, user.id, remarks?.trim() || null, newRevision, sheetId, baseRevision);

    if (sheetUpdate.changes !== 1) {
      const err = new Error('Concurrent modification detected during review update.');
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_REVISION';
      throw err;
    }

    // Audit log
    db.prepare(`
      INSERT INTO marks_audit_history (
        mark_id, sheet_id, examination_id, student_id, subject_id,
        action, actor_user_id, previous_status, new_status, reason, ip_address, created_at
      ) VALUES (0, ?, ?, 0, ?, ?, ?, 'submitted', ?, ?, ?, datetime('now'))
    `).run(
      sheetId, sheet.examination_id, sheet.subject_id,
      decision === 'endorse' ? 'ENDORSEMENT' : 'RETURN',
      user.id, targetStatus, remarks?.trim() || null, ipAddress
    );

    // Capture full immutable post-write sheet snapshot in marks_sheet_revisions (P1-03)
    recordRevisionSnapshot(sheetId, newRevision, targetStatus, user.id, sheet.examination_id, sheet.class_id, sheet.subject_id);

    db.exec('COMMIT;');
    return {
      success: true,
      sheetId,
      status: targetStatus,
      newRevision
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Approves a reviewed marks sheet.
 * Enforces Institutional Segregation of Duties: anti-self-approval for assigned teacher,
 * marks entrant, and endorsing reviewer.
 */
export function approveMarksSheet(params: {
  sheetId: number;
  baseRevision: number;
  remarks?: string;
  user: AuthUser;
  ipAddress?: string;
}): { success: boolean; sheetId: number; status: string; newRevision: number } {
  const { sheetId, baseRevision, remarks = '', user, ipAddress = '127.0.0.1' } = params;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const sheet = db.prepare('SELECT * FROM marks_sheets WHERE id = ?').get(sheetId) as any;
    if (!sheet) {
      const err = new Error('Marks sheet not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (sheet.status !== 'reviewed') {
      const err = new Error(`Sheet status is '${sheet.status}'. Only sheets with status 'reviewed' can be approved. Section Head review/endorsement must precede final approval.`);
      (err as any).statusCode = 409;
      (err as any).code = 'INVALID_STATUS';
      throw err;
    }

    // Segregation of Duties Check
    const approvalAuth = canApproveMarksSheet(user, sheetId);
    if (!approvalAuth.allowed) {
      const err = new Error(approvalAuth.reason || 'Access denied: You do not have authorization to approve this marks sheet.');
      (err as any).statusCode = 403;
      (err as any).code = approvalAuth.code || 'UNAUTHORIZED_APPROVAL';
      throw err;
    }

    // Optimistic Concurrency Control (CAS)
    if (sheet.revision !== baseRevision) {
      const err = new Error(`Concurrent modification detected. Sheet revision is ${sheet.revision}, but baseRevision was ${baseRevision}. Please reload latest sheet.`);
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_REVISION';
      throw err;
    }

    const newRevision = sheet.revision + 1;
    const sheetUpdate = db.prepare(`
      UPDATE marks_sheets SET
        status = 'approved',
        approved_by_user_id = ?,
        approved_at = datetime('now'),
        approval_remarks = ?,
        revision = ?,
        updated_at = datetime('now')
      WHERE id = ? AND revision = ?
    `).run(user.id, remarks?.trim() || null, newRevision, sheetId, baseRevision);

    if (sheetUpdate.changes !== 1) {
      const err = new Error('Concurrent modification detected during approval update.');
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_REVISION';
      throw err;
    }

    // Audit log
    db.prepare(`
      INSERT INTO marks_audit_history (
        mark_id, sheet_id, examination_id, student_id, subject_id,
        action, actor_user_id, previous_status, new_status, reason, ip_address, created_at
      ) VALUES (0, ?, ?, 0, ?, 'APPROVAL', ?, 'reviewed', 'approved', ?, ?, datetime('now'))
    `).run(sheetId, sheet.examination_id, sheet.subject_id, user.id, remarks?.trim() || 'Final approval granted', ipAddress);

    // Capture full immutable post-write sheet snapshot in marks_sheet_revisions (P1-03)
    recordRevisionSnapshot(sheetId, newRevision, 'approved', user.id, sheet.examination_id, sheet.class_id, sheet.subject_id);

    db.exec('COMMIT;');
    return {
      success: true,
      sheetId,
      status: 'approved',
      newRevision
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Retrieves the complete audit history and revision snapshots for a marks sheet.
 */
export function getMarksSheetHistory(sheetId: number, user: AuthUser): any {
  const sheet = db.prepare('SELECT id, academic_year_id FROM marks_sheets WHERE id = ?').get(sheetId);
  if (!sheet) {
    const err = new Error('Marks sheet not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  const viewAuth = canViewMarksSheet(user, sheetId);
  if (!viewAuth.allowed && user.role !== 'admin') {
    const err = new Error('Access denied: You do not have permission to view history for this sheet.');
    (err as any).statusCode = 403;
    throw err;
  }

  ensureRevisionsTable();

  const auditHistory = db.prepare(`
    SELECT mah.*, u.username as actor_username, u.full_name as actor_name, u.role as actor_role
    FROM marks_audit_history mah
    JOIN users u ON mah.actor_user_id = u.id
    WHERE mah.sheet_id = ?
    ORDER BY mah.id ASC
  `).all(sheetId);

  const revisions = (db.prepare(`
    SELECT msr.id, msr.sheet_id, msr.revision, msr.status, msr.saved_by_user_id, msr.marks_payload_json, msr.created_at,
           u.username as saved_by_username, u.full_name as saved_by_name
    FROM marks_sheet_revisions msr
    JOIN users u ON msr.saved_by_user_id = u.id
    WHERE msr.sheet_id = ?
    ORDER BY msr.revision ASC
  `).all(sheetId) as any[]).map(r => {
    let payload = null;
    try {
      payload = JSON.parse(r.marks_payload_json);
    } catch {}
    return {
      ...r,
      marks_payload: payload
    };
  });

  return {
    sheetId,
    auditHistory,
    revisions
  };
}

/**
 * Retrieves a single immutable point-in-time snapshot with full marks payload.
 */
export function getMarksSheetRevisionSnapshot(sheetId: number, revision: number, user: AuthUser): any {
  const sheet = db.prepare('SELECT id FROM marks_sheets WHERE id = ?').get(sheetId);
  if (!sheet) {
    const err = new Error('Marks sheet not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  const viewAuth = canViewMarksSheet(user, sheetId);
  if (!viewAuth.allowed && user.role !== 'admin') {
    const err = new Error('Access denied: You do not have permission to view revision snapshots for this marks sheet.');
    (err as any).statusCode = 403;
    throw err;
  }

  ensureRevisionsTable();

  const rev = db.prepare(`
    SELECT msr.id, msr.sheet_id, msr.revision, msr.status, msr.saved_by_user_id, msr.marks_payload_json, msr.created_at,
           u.username as saved_by_username, u.full_name as saved_by_name
    FROM marks_sheet_revisions msr
    JOIN users u ON msr.saved_by_user_id = u.id
    WHERE msr.sheet_id = ? AND msr.revision = ?
  `).get(sheetId, revision) as any;

  if (!rev) {
    const err = new Error(`Revision ${revision} not found for marks sheet ${sheetId}.`);
    (err as any).statusCode = 404;
    throw err;
  }

  let payload = null;
  try {
    payload = JSON.parse(rev.marks_payload_json);
  } catch {}

  return {
    ...rev,
    marks_payload: payload
  };
}

/**
 * Atomically saves or submits a marks sheet via the legacy API endpoint.
 * Enforces atomic creation + mark save (rollback cleans up new sheets on error),
 * active teacher assignment validation, positive student eligibility, and full revision snapshots.
 */
export function saveOrSubmitLegacyMarksSheet(params: {
  examId: number;
  classId: number;
  subjectId: number;
  marks: MarkEntryInput[];
  targetStatus: 'draft' | 'submitted';
  baseRevision?: number;
  user: AuthUser;
  ipAddress?: string;
}): {
  success: boolean;
  sheetId: number;
  revision: number;
  status: string;
  message: string;
} {
  const { examId, classId, subjectId, marks, targetStatus, baseRevision, user, ipAddress = '127.0.0.1' } = params;

  ensureRevisionsTable();
  db.exec('BEGIN IMMEDIATE;');
  try {
    // 1. User verification
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as any;
    if (!activeUser || activeUser.is_active !== 1) {
      const err = new Error('User account is deactivated or invalid.');
      (err as any).statusCode = 403;
      (err as any).code = 'USER_DEACTIVATED';
      throw err;
    }

    // 2. Class and Exam verification
    const classRow = db.prepare('SELECT id, academic_year_id FROM classes WHERE id = ?').get(classId) as any;
    const examRow = db.prepare('SELECT id, academic_year_id FROM examinations WHERE id = ?').get(examId) as any;

    if (!classRow || !examRow) {
      const err = new Error('Class or Examination not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (!classRow.academic_year_id || !examRow.academic_year_id) {
      const err = new Error('Missing academic year for class or examination.');
      (err as any).statusCode = 400;
      (err as any).code = 'MISSING_ACADEMIC_YEAR';
      throw err;
    }

    if (classRow.academic_year_id !== examRow.academic_year_id) {
      const err = new Error(`Academic year mismatch: examination year (${examRow.academic_year_id}) does not match class year (${classRow.academic_year_id}).`);
      (err as any).statusCode = 400;
      (err as any).code = 'ACADEMIC_YEAR_MISMATCH';
      throw err;
    }

    const yearId = classRow.academic_year_id;

    // 3. Subject offering verification
    const classSubject = db.prepare('SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?').get(classId, subjectId);
    if (!classSubject) {
      const err = new Error(`Subject ID ${subjectId} is not offered for class ID ${classId}.`);
      (err as any).statusCode = 400;
      (err as any).code = 'SUBJECT_NOT_OFFERED';
      throw err;
    }

    // 4. Strict active teacher assignment check (P0-01) - NO fallback to sheet.teacher_id
    const assignment = db.prepare(`
      SELECT teacher_id FROM teacher_assignments
      WHERE class_id = ? AND subject_id = ? AND assignment_type = 'subject_teacher' AND academic_year_id = ? AND teacher_id = ?
    `).get(classId, subjectId, yearId, user.id);

    if (!assignment) {
      const err = new Error('Access denied: Only the verified assigned subject teacher is authorized to enter or submit marks.');
      (err as any).statusCode = 403;
      (err as any).code = 'UNASSIGNED_TEACHER';
      throw err;
    }

    // 5. Existing sheet or transactional creation
    let sheet = db.prepare('SELECT * FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(examId, classId, subjectId) as any;

    let sheetId: number;
    let effectiveBaseRev: number;
    let newRevision: number;

    if (!sheet) {
      // Create new sheet container INSIDE this transaction
      const insertRes = db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, revision, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 'draft', datetime('now'), datetime('now'))
      `).run(examId, classId, subjectId, yearId, user.id);

      sheetId = Number(insertRes.lastInsertRowid);
      effectiveBaseRev = 1;
      newRevision = 2;
    } else {
      sheetId = sheet.id;

      if (!['draft', 'returned'].includes(sheet.status)) {
        const err = new Error(`Sheet is locked in status '${sheet.status}' and cannot be overwritten via legacy marks entry.`);
        (err as any).statusCode = 403;
        (err as any).code = 'SHEET_LOCKED';
        throw err;
      }

      if (baseRevision === undefined || baseRevision === null) {
        const err = new Error('baseRevision is required when updating an existing marks sheet.');
        (err as any).statusCode = 400;
        (err as any).code = 'MISSING_BASE_REVISION';
        throw err;
      }

      effectiveBaseRev = Number(baseRevision);
      if (sheet.revision !== effectiveBaseRev) {
        const err = new Error(`Concurrent modification detected. Sheet revision is ${sheet.revision}, but your request supplied baseRevision ${effectiveBaseRev}. Please reload the latest sheet before saving.`);
        (err as any).statusCode = 409;
        (err as any).code = 'STALE_REVISION';
        (err as any).currentRevision = sheet.revision;
        (err as any).baseRevision = effectiveBaseRev;
        throw err;
      }

      newRevision = sheet.revision + 1;
    }

    // 6. Pre-validate student membership, positive subject eligibility, remarks type, and scores
    const validatedMarks: Array<{
      studentId: number;
      score: number | null;
      maxScore: number;
      assessmentStatus: string;
      gradeLetter: string;
      remarks?: string;
    }> = [];

    for (const m of marks) {
      const studentId = Number(m.studentId);
      if (!studentId || isNaN(studentId)) {
        const err = new Error('Each mark must contain a valid student_id.');
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_STUDENT_ID';
        throw err;
      }

      // Check student enrolled in class
      const enrollment = db.prepare(`
        SELECT id FROM enrollments WHERE student_id = ? AND class_id = ? AND academic_year_id = ? AND status = 'enrolled'
      `).get(studentId, classId, yearId);

      if (!enrollment) {
        const err = new Error(`Student ID ${studentId} is not actively enrolled in class ${classId}.`);
        (err as any).statusCode = 400;
        (err as any).code = 'CROSS_CLASS_STUDENT';
        throw err;
      }

      // Check positive subject eligibility (P0-02)
      const elig = isStudentEligibleForSubject(studentId, subjectId, yearId);
      if (!elig.isEligibleForDraft) {
        const err = new Error(`Student ID ${studentId} is not eligible for subject ID ${subjectId} (status: '${elig.status || 'not_enrolled'}'). Dropped, transferred, or non-enrolled students cannot receive marks.`);
        (err as any).statusCode = 400;
        (err as any).code = 'INELIGIBLE_SUBJECT_ENROLLMENT';
        throw err;
      }

      // Validate remarks type (P1-04)
      if (m.remarks !== null && m.remarks !== undefined && typeof m.remarks !== 'string') {
        const err = new Error(`Invalid remarks for student ID ${studentId}: remarks must be a string or null.`);
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_REMARKS_TYPE';
        throw err;
      }

      // Score precision, bounds, and absent/exempt validation
      let assessmentStatus = m.assessmentStatus || 'PRESENT';
      let score: number | null = null;
      const maxScore = m.maxScore !== undefined && m.maxScore !== null ? Number(m.maxScore) : 100.0;

      if (['ABSENT', 'MEDICAL', 'EXEMPT', 'NOT_ASSESSED'].includes(assessmentStatus)) {
        if (m.score !== null && m.score !== undefined && m.score !== ('' as any)) {
          const err = new Error(`Student ID ${studentId} is marked '${assessmentStatus}' but has a numeric score provided (${m.score}). Numeric scores are strictly forbidden when non-present.`);
          (err as any).statusCode = 400;
          throw err;
        }
        score = null;
      } else if (m.score === null || m.score === undefined || m.score === ('' as any)) {
        assessmentStatus = 'NOT_ASSESSED';
        score = null;
      } else {
        const numScore = Number(m.score);
        if (isNaN(numScore)) {
          const err = new Error(`Score '${m.score}' for student ID ${studentId} is not a valid number.`);
          (err as any).statusCode = 400;
          (err as any).code = 'INVALID_SCORE';
          throw err;
        }
        if (numScore < 0.0 || numScore > maxScore) {
          const err = new Error(`Score ${numScore} for student ID ${studentId} is out of bounds [0, ${maxScore}].`);
          (err as any).statusCode = 400;
          (err as any).code = 'SCORE_OUT_OF_BOUNDS';
          throw err;
        }
        if (Math.round(numScore * 10) / 10 !== numScore) {
          const err = new Error(`Score ${numScore} for student ID ${studentId} exceeds allowed 1-decimal precision; exceeds single-decimal precision. Silent rounding or truncation is strictly prohibited.`);
          (err as any).statusCode = 400;
          (err as any).code = 'INVALID_SCORE_PRECISION';
          throw err;
        }
        assessmentStatus = 'PRESENT';
        score = numScore;
      }

      const gradeLetter = calcGradeLetter(score, assessmentStatus, maxScore);
      validatedMarks.push({
        studentId,
        score,
        maxScore,
        assessmentStatus,
        gradeLetter,
        remarks: m.remarks
      });
    }

    // 7. Pre-validate submission prerequisites if targetStatus === 'submitted'
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
      `).all(subjectId, classId) as any[];

      if (participatingStudents.length === 0) {
        const err = new Error('Cannot submit marks sheet: No active participating students enrolled for this subject in the class.');
        (err as any).statusCode = 400;
        (err as any).code = 'EMPTY_ROSTER';
        throw err;
      }

      const marksByStudent = new Map<number, any>();
      for (const vm of validatedMarks) {
        marksByStudent.set(vm.studentId, vm);
      }

      for (const stu of participatingStudents) {
        if (stu.enrollment_status !== 'confirmed') {
          const err = new Error(`Cannot submit marks sheet: Participating student ${stu.full_name} (${stu.admission_no}) has unconfirmed subject enrollment ('${stu.enrollment_status}'). Official submission requires all participating students to have officially confirmed subject enrollment by academic leadership.`);
          (err as any).statusCode = 422;
          (err as any).code = 'UNCONFIRMED_ENROLLMENT';
          throw err;
        }

        const incomingMark = marksByStudent.get(stu.id);
        let isAssessed = false;
        if (incomingMark && incomingMark.assessmentStatus !== 'NOT_ASSESSED') {
          isAssessed = true;
        } else if (sheet) {
          const existingMark = db.prepare(`
            SELECT assessment_status FROM marks WHERE examination_id = ? AND subject_id = ? AND student_id = ?
          `).get(examId, subjectId, stu.id) as any;
          if (existingMark && existingMark.assessment_status !== 'NOT_ASSESSED') {
            isAssessed = true;
          }
        }

        if (!isAssessed) {
          const err = new Error(`Cannot submit marks sheet: All participating students must be assessed. Student ${stu.full_name} (${stu.admission_no}) is currently unassessed.`);
          (err as any).statusCode = 400;
          (err as any).code = 'UNASSESSED_STUDENT';
          throw err;
        }
      }
    }

    // 8. Conditional CAS UPDATE on marks_sheets
    const sheetUpdateRes = db.prepare(`
      UPDATE marks_sheets SET
        revision = ?,
        status = ?,
        submitted_at = ${targetStatus === 'submitted' ? "datetime('now')" : 'submitted_at'},
        updated_at = datetime('now')
      WHERE id = ? AND revision = ?
    `).run(newRevision, targetStatus, sheetId, effectiveBaseRev);

    if (sheetUpdateRes.changes !== 1) {
      const err = new Error('Concurrent modification detected during sheet revision update.');
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_REVISION';
      throw err;
    }

    // 9. Upsert marks and record audit
    const upsertStmt = db.prepare(`
      INSERT INTO marks (
        sheet_id, examination_id, class_id, subject_id, student_id,
        max_score, score, assessment_status, grade_letter, status, remarks, entered_by_user_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(examination_id, subject_id, student_id) DO UPDATE SET
        sheet_id = excluded.sheet_id,
        max_score = excluded.max_score,
        score = excluded.score,
        assessment_status = excluded.assessment_status,
        grade_letter = excluded.grade_letter,
        status = excluded.status,
        remarks = excluded.remarks,
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
      `).get(examId, subjectId, vm.studentId) as any;

      upsertStmt.run(
        sheetId, examId, classId, subjectId, vm.studentId,
        vm.maxScore, vm.score, vm.assessmentStatus, vm.gradeLetter, targetStatus, vm.remarks || null, user.id
      );

      const markRow = db.prepare(`
        SELECT id FROM marks WHERE examination_id = ? AND subject_id = ? AND student_id = ?
      `).get(examId, subjectId, vm.studentId) as any;

      auditStmt.run(
        markRow.id, sheetId, examId, vm.studentId, subjectId,
        prevMark ? 'DRAFT_SAVE' : 'INITIAL_ENTRY',
        user.id,
        prevMark?.score ?? null, vm.score,
        prevMark?.assessment_status ?? null, vm.assessmentStatus,
        ipAddress
      );
    }

    if (targetStatus === 'submitted') {
      db.prepare("UPDATE marks SET status = 'submitted', updated_at = datetime('now') WHERE sheet_id = ?").run(sheetId);
      db.prepare(`
        INSERT INTO marks_audit_history (
          mark_id, sheet_id, examination_id, student_id, subject_id,
          action, actor_user_id, reason, ip_address, created_at
        ) VALUES (0, ?, ?, 0, ?, 'SUBMISSION', ?, 'Sheet submitted for moderation', ?, datetime('now'))
      `).run(sheetId, examId, subjectId, user.id, ipAddress);
    }

    // 10. Record full snapshot of all marks on the sheet in marks_sheet_revisions (P1-03)
    recordRevisionSnapshot(sheetId, newRevision, targetStatus, user.id, examId, classId, subjectId);

    db.exec('COMMIT;');
    return {
      success: true,
      message: `Marks sheet ${targetStatus === 'submitted' ? 'submitted' : 'saved'} successfully for ${marks.length} students.`,
      sheetId,
      revision: newRevision,
      status: targetStatus
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
