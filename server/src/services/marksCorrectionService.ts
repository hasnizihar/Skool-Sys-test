import { db } from '../db/database.js';
import { AuthUser } from '../middleware/auth.js';
import {
  getActiveStaffAuthorizations,
  doesBandCoverGrade
} from './academicAuthorizationService.js';
import {
  calculateSubjectGrade,
  getAssessmentPolicyProfile
} from './assessmentPolicyService.js';

export type CorrectionCategory =
  | 'clerical_addition'
  | 'missed_question'
  | 'incorrect_index'
  | 're_scrutiny'
  | 'other';

export interface RequestMarkCorrectionParams {
  markId?: number;
  sheetId?: number;
  studentId?: number;
  subjectId?: number;
  examinationId?: number;
  expectedPreviousScore: number | null;
  expectedPreviousStatus: string;
  requestedScore: number | null;
  requestedStatus: 'PRESENT' | 'ABSENT' | 'MEDICAL' | 'EXEMPT';
  correctionCategory: CorrectionCategory;
  detailedJustification: string;
  evidenceAttachmentRef?: string;
  user: AuthUser;
  ipAddress?: string;
}

export interface ReviewMarkCorrectionParams {
  correctionId: number;
  decision: 'approve' | 'reject';
  reviewComments?: string;
  user: AuthUser;
  ipAddress?: string;
}

/**
 * Gate 4C: Request a Post-Publication Mark Correction
 *
 * Requirements:
 * 1. Target examination and sheet MUST be in status 'published'.
 * 2. Requester must be active user with academic role (assigned teacher or scoped leadership).
 * 3. CAS validation: expectedPreviousScore and expectedPreviousStatus must match current mark record.
 * 4. Mandatory non-empty detailed justification and valid category.
 * 5. Leaves database mark record unchanged (zero score/status mutations on request).
 */
export function requestMarkCorrection(params: RequestMarkCorrectionParams): {
  success: boolean;
  correctionId: number;
  status: 'pending';
} {
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
    evidenceAttachmentRef,
    user
  } = params;

  // G4S-03: Acquire write lock before querying authorization or state
  db.exec('BEGIN IMMEDIATE;');
  try {
    // 1. Live Active User Check
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as { id: number; is_active: number } | undefined;
    if (!activeUser || activeUser.is_active !== 1) {
      const err = new Error('User account is deactivated or invalid.');
      (err as any).statusCode = 403;
      (err as any).code = 'USER_DEACTIVATED';
      throw err;
    }

  // 2. Resolve Mark Record
  let mark: any;
  if (markId) {
    mark = db.prepare('SELECT * FROM marks WHERE id = ?').get(markId);
  } else if (examinationId && studentId && subjectId) {
    mark = db.prepare('SELECT * FROM marks WHERE examination_id = ? AND student_id = ? AND subject_id = ?').get(examinationId, studentId, subjectId);
  }

  if (!mark) {
    const err = new Error('Target mark record not found.');
    (err as any).statusCode = 404;
    (err as any).code = 'MARK_NOT_FOUND';
    throw err;
  }

  // 3. Resolve Sheet & Examination Publication State
  const sheet = db.prepare('SELECT * FROM marks_sheets WHERE id = ?').get(mark.sheet_id) as any;
  const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(mark.examination_id) as any;

  if (!sheet || !exam) {
    const err = new Error('Marks sheet or examination container not found.');
    (err as any).statusCode = 404;
    (err as any).code = 'CONTAINER_NOT_FOUND';
    throw err;
  }

  // Invariant: Post-publication corrections only apply to PUBLISHED examinations
  if (exam.is_published !== 1 || exam.status !== 'published' || sheet.status !== 'published') {
    const err = new Error(
      'Post-publication correction requests are restricted to officially published examinations. Unpublished marks must be modified through standard draft moderation workflows.'
    );
    (err as any).statusCode = 400;
    (err as any).code = 'EXAMINATION_NOT_PUBLISHED';
    throw err;
  }

  // 4. Role & Scope Authorization Check (G4R-02)
  // Allowed: Active assigned subject teacher for this class, subject, and academic year
  // OR active scoped academic leadership (Principal, VP Academic, Section Head) covering this grade band
  const classRow = db.prepare('SELECT grade, academic_year_id FROM classes WHERE id = ?').get(sheet.class_id) as any;
  const isAssignedTeacher = db.prepare(`
    SELECT id FROM teacher_assignments
    WHERE teacher_id = ? AND class_id = ? AND subject_id = ? AND academic_year_id = ? AND assignment_type = 'subject_teacher'
  `).get(user.id, sheet.class_id, sheet.subject_id, sheet.academic_year_id);

  const activeAuths = getActiveStaffAuthorizations(user.id, sheet.academic_year_id);
  const isAuthorizedLeadership = activeAuths.some(a =>
    ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role) &&
    (a.grade_band === 'all' || doesBandCoverGrade(a.grade_band, classRow?.grade))
  );

  if (!isAssignedTeacher && !isAuthorizedLeadership) {
    const err = new Error(
      'Access denied: Requesting a mark correction requires an active teaching assignment for this class and subject, or an authorized academic leadership appointment.'
    );
    (err as any).statusCode = 403;
    (err as any).code = 'INSUFFICIENT_AUTHORIZATION';
    throw err;
  }

  // 5. Post-Publication Correction Window Enforcement (G4R-06)
  const publication = db.prepare(`
    SELECT published_at FROM examination_publications
    WHERE examination_id = ?
    ORDER BY publication_version DESC
    LIMIT 1
  `).get(exam.id) as { published_at: string } | undefined;

  let windowDays = 21;
  if (exam.assessment_policy_id) {
    try {
      const pol = getAssessmentPolicyProfile(exam.assessment_policy_id);
      if (pol?.correction_window_days) {
        windowDays = pol.correction_window_days;
      }
    } catch {}
  }

  const publishedAtStr = publication?.published_at || exam.published_at;
  if (publishedAtStr) {
    const publishedTime = new Date(publishedAtStr).getTime();
    const deadlineTime = publishedTime + (windowDays * 24 * 60 * 60 * 1000);
    const nowTime = Date.now();

    if (nowTime > deadlineTime) {
      const err = new Error(
        `Correction request declined: The correction window for this examination closed on ${new Date(deadlineTime).toISOString()} (${windowDays} days post-publication). Expired requests are locked against modification.`
      );
      (err as any).statusCode = 400;
      (err as any).code = 'CORRECTION_WINDOW_EXPIRED';
      throw err;
    }
  }

  // 6. Validate Correction Category & Justification
  const allowedCategories: CorrectionCategory[] = [
    'clerical_addition',
    'missed_question',
    'incorrect_index',
    're_scrutiny',
    'other'
  ];
  if (!allowedCategories.includes(correctionCategory)) {
    const err = new Error(`Invalid correction category '${correctionCategory}'.`);
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_CATEGORY';
    throw err;
  }

  if (!detailedJustification || !detailedJustification.trim()) {
    const err = new Error('A detailed institutional justification is mandatory for post-publication corrections.');
    (err as any).statusCode = 400;
    (err as any).code = 'MANDATORY_JUSTIFICATION_MISSING';
    throw err;
  }

  // 7. Validate Requested Score & Status
  if (!['PRESENT', 'ABSENT', 'MEDICAL', 'EXEMPT'].includes(requestedStatus)) {
    const err = new Error(`Invalid assessment status '${requestedStatus}'.`);
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_STATUS';
    throw err;
  }

  if (requestedStatus === 'PRESENT') {
    if (requestedScore === null || requestedScore === undefined || isNaN(requestedScore)) {
      const err = new Error("Score must be provided when assessment status is 'PRESENT'.");
      (err as any).statusCode = 400;
      (err as any).code = 'SCORE_REQUIRED';
      throw err;
    }
    const maxScore = mark.max_score || 100.0;
    if (requestedScore < 0 || requestedScore > maxScore) {
      const err = new Error(`Score ${requestedScore} is out of bounds [0.0, ${maxScore}].`);
      (err as any).statusCode = 400;
      (err as any).code = 'SCORE_OUT_OF_BOUNDS';
      throw err;
    }
  } else {
    if (requestedScore !== null && requestedScore !== undefined) {
      const err = new Error(`Score must be null when assessment status is '${requestedStatus}'.`);
      (err as any).statusCode = 400;
      (err as any).code = 'SCORE_MUST_BE_NULL';
      throw err;
    }
  }

  // 8. CAS Validation & Insertion under write lock
  const lockedMark = db.prepare('SELECT * FROM marks WHERE id = ?').get(mark.id) as any;
    const currentScore = lockedMark.score !== null ? Number(lockedMark.score) : null;
    const currentStatus = lockedMark.assessment_status;

    const scoreMatches = (expectedPreviousScore === null && currentScore === null) ||
      (expectedPreviousScore !== null && currentScore !== null && Math.abs(expectedPreviousScore - currentScore) < 0.001);

    if (!scoreMatches || expectedPreviousStatus !== currentStatus) {
      const err = new Error(
        `Stale record detected: Expected previous state [score: ${expectedPreviousScore}, status: '${expectedPreviousStatus}'] does not match current database state [score: ${currentScore}, status: '${currentStatus}'].`
      );
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_MARK_STATE';
      throw err;
    }

    // Check for Pending Duplicate Correction under write lock
    const pendingExisting = db.prepare(`
      SELECT id FROM marks_corrections
      WHERE mark_id = ? AND status = 'pending'
    `).get(mark.id);

    if (pendingExisting) {
      const err = new Error('A correction request is already pending review for this mark record.');
      (err as any).statusCode = 409;
      (err as any).code = 'DUPLICATE_PENDING_CORRECTION';
      throw err;
    }

    const stmt = db.prepare(`
      INSERT INTO marks_corrections (
        mark_id, sheet_id, examination_id, student_id, subject_id,
        requested_by_user_id, expected_previous_score, expected_previous_status,
        requested_score, requested_status, correction_category,
        detailed_justification, evidence_attachment_ref, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `);

    const result = stmt.run(
      mark.id,
      mark.sheet_id,
      mark.examination_id,
      mark.student_id,
      mark.subject_id,
      user.id,
      expectedPreviousScore ?? null,
      expectedPreviousStatus,
      requestedScore ?? null,
      requestedStatus,
      correctionCategory,
      detailedJustification.trim(),
      evidenceAttachmentRef?.trim() || null
    );

    db.exec('COMMIT;');

    return {
      success: true,
      correctionId: Number(result.lastInsertRowid),
      status: 'pending'
    };
  } catch (err: any) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw err;
  }
}

/**
 * Gate 4C: Independent Review & Atomic Application of Post-Publication Correction
 *
 * Invariants:
 * 1. Final approval restricted to active Principal or Vice Principal Academic.
 * 2. Institutional Segregation of Duties (Anti-Self-Approval):
 *    - Requester cannot approve (SELF_APPROVAL_REQUESTER).
 *    - Historical mark author / modifier cannot approve (SELF_APPROVAL_ENTRANT).
 *    - Assigned subject teacher cannot approve (SELF_APPROVAL_TEACHER).
 * 3. Atomic application: updates mark, recalculates grade, increments sheet revision,
 *    records post-write revision snapshot, and logs comprehensive marks_audit_history.
 * 4. Stale request / concurrency protection.
 */
export function reviewMarkCorrection(params: ReviewMarkCorrectionParams): {
  success: boolean;
  correctionId: number;
  status: 'approved' | 'rejected';
  newScore?: number | null;
  newGrade?: string;
  newRevision?: number;
} {
  const { correctionId, decision, reviewComments = '', user, ipAddress = '127.0.0.1' } = params;

  // G4S-02 & G4S-03: ATOMIC IMMEDIATE TRANSACTION BEGIN
  // Acquire write lock BEFORE all authorization, state, and concurrency checks
  db.exec('BEGIN IMMEDIATE;');
  try {
    // 1. Live Active User Check inside write transaction
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as { id: number; is_active: number } | undefined;
    if (!activeUser || activeUser.is_active !== 1) {
      const err = new Error('User account is deactivated or invalid.');
      (err as any).statusCode = 403;
      (err as any).code = 'USER_DEACTIVATED';
      throw err;
    }

    // 2. Fetch Correction Record under write lock
    const correction = db.prepare('SELECT * FROM marks_corrections WHERE id = ?').get(correctionId) as any;
    if (!correction) {
      const err = new Error('Correction request not found.');
      (err as any).statusCode = 404;
      (err as any).code = 'CORRECTION_NOT_FOUND';
      throw err;
    }

    if (correction.status !== 'pending') {
      const err = new Error(`Correction request has already been reviewed (current status: '${correction.status}').`);
      (err as any).statusCode = 409;
      (err as any).code = 'CORRECTION_ALREADY_REVIEWED';
      throw err;
    }

    // 3. Fetch Associated Entities under write lock
    const sheet = db.prepare(`
      SELECT ms.*, c.grade as class_grade
      FROM marks_sheets ms
      JOIN classes c ON ms.class_id = c.id
      WHERE ms.id = ?
    `).get(correction.sheet_id) as any;

    const mark = db.prepare('SELECT * FROM marks WHERE id = ?').get(correction.mark_id) as any;
    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(correction.examination_id) as any;

    if (!sheet || !mark || !exam) {
      const err = new Error('Associated examination or marks sheet records not found.');
      (err as any).statusCode = 404;
      (err as any).code = 'CONTAINER_NOT_FOUND';
      throw err;
    }

    // 4. In-Transaction Role & Leadership Scope Check (G4S-03)
    // Restricted to Principal or Vice Principal Academic with active appointment covering the class grade
    const activeAuths = getActiveStaffAuthorizations(user.id, sheet.academic_year_id);
    const isAuthorizedApprover = activeAuths.some(a =>
      ['principal', 'vice_principal_academic'].includes(a.auth_role) &&
      doesBandCoverGrade(a.grade_band, sheet.class_grade)
    );

    if (!isAuthorizedApprover) {
      const err = new Error(
        'Access denied: Approving or rejecting a post-publication mark correction requires an active Principal or Vice Principal Academic appointment covering this grade band and academic year.'
      );
      (err as any).statusCode = 403;
      (err as any).code = 'INSUFFICIENT_AUTHORIZATION';
      throw err;
    }

    // 5. In-Transaction Institutional Segregation of Duties (SoD) Anti-Self-Approval
    // 5.1 Requester cannot approve
    if (correction.requested_by_user_id === user.id) {
      const err = new Error('Institutional Segregation Violation: The user who requested the correction cannot approve it.');
      (err as any).statusCode = 403;
      (err as any).code = 'SELF_APPROVAL_REQUESTER';
      throw err;
    }

    // 5.2 Historical Mark Entrant / Modifier Check (Lifetime Author History)
    const historicalAuthorCheck = db.prepare(`
      SELECT COUNT(*) as cnt FROM (
        SELECT entered_by_user_id as user_id FROM marks WHERE id = ? AND entered_by_user_id = ?
        UNION
        SELECT actor_user_id as user_id FROM marks_audit_history WHERE mark_id = ? AND actor_user_id = ?
        UNION
        SELECT requested_by_user_id as user_id FROM marks_corrections WHERE mark_id = ? AND requested_by_user_id = ?
      )
    `).get(mark.id, user.id, mark.id, user.id, mark.id, user.id) as { cnt: number };

    if (historicalAuthorCheck.cnt > 0) {
      const err = new Error(
        'Institutional Segregation Violation: The user who previously entered, drafted, requested, or modified this mark cannot approve its correction.'
      );
      (err as any).statusCode = 403;
      (err as any).code = 'SELF_APPROVAL_ENTRANT';
      throw err;
    }

    // 5.3 Assigned subject teacher cannot approve
    const isAssignedTeacher = db.prepare(`
      SELECT id FROM teacher_assignments
      WHERE teacher_id = ? AND class_id = ? AND subject_id = ? AND academic_year_id = ? AND assignment_type = 'subject_teacher'
    `).get(user.id, sheet.class_id, sheet.subject_id, sheet.academic_year_id);

    if (sheet.teacher_id === user.id || isAssignedTeacher) {
      const err = new Error('Institutional Segregation Violation: The assigned subject teacher cannot approve corrections for their own class.');
      (err as any).statusCode = 403;
      (err as any).code = 'SELF_APPROVAL_TEACHER';
      throw err;
    }

    // 6. Handle Rejection (G4S-02) — Wrapped atomically with audit insertion under write lock
    if (decision === 'reject') {
      const updateRes = db.prepare(`
        UPDATE marks_corrections SET
          status = 'rejected',
          reviewed_by_user_id = ?,
          reviewed_at = datetime('now'),
          review_comments = ?
        WHERE id = ? AND status = 'pending'
      `).run(user.id, reviewComments.trim() || 'Rejected by authorized leadership', correctionId);

      if (Number(updateRes.changes) !== 1) {
        const err = new Error('Correction request has already been reviewed or modified concurrently.');
        (err as any).statusCode = 409;
        (err as any).code = 'CORRECTION_ALREADY_REVIEWED';
        throw err;
      }

      // Audit log insertion inside the same transaction
      db.prepare(`
        INSERT INTO marks_audit_history (
          mark_id, sheet_id, examination_id, student_id, subject_id,
          action, actor_user_id, previous_score, new_score, previous_status, new_status,
          correction_id, reason, ip_address, created_at
        ) VALUES (?, ?, ?, ?, ?, 'POST_PUBLICATION_CORRECTION', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        mark.id, sheet.id, exam.id, mark.student_id, mark.subject_id,
        user.id, mark.score, mark.score, mark.assessment_status, mark.assessment_status,
        correctionId, `Correction rejected: ${reviewComments.trim() || 'No comments provided'}`, ipAddress
      );

      // Rejection NEVER modifies marks scores or published result data
      db.exec('COMMIT;');

      return {
        success: true,
        correctionId,
        status: 'rejected'
      };
    }

    // 7. Handle Approval — ATOMIC WRITE TRANSACTION
    // 7.1 CAS verification on locked mark record
    const lockedMark = db.prepare('SELECT * FROM marks WHERE id = ?').get(mark.id) as any;
    const curScore = lockedMark.score !== null ? Number(lockedMark.score) : null;
    const curStatus = lockedMark.assessment_status;
    const expScore = correction.expected_previous_score !== null ? Number(correction.expected_previous_score) : null;

    const scoreMatch = (expScore === null && curScore === null) ||
      (expScore !== null && curScore !== null && Math.abs(expScore - curScore) < 0.001);

    if (!scoreMatch || curStatus !== correction.expected_previous_status) {
      const err = new Error(
        `Concurrent mark modification detected: Mark score or status changed since the correction was requested. Expected [${expScore}, '${correction.expected_previous_status}'], found [${curScore}, '${curStatus}'].`
      );
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_MARK_STATE';
      throw err;
    }

    // 7.2 Resolve Examination Policy & Re-calculate Grade Letter
    let policy: any = null;
    if (exam.assessment_policy_id) {
      try { policy = getAssessmentPolicyProfile(exam.assessment_policy_id); } catch {}
    }
    const gradeRes = calculateSubjectGrade(
      correction.requested_score,
      lockedMark.max_score || 100.0,
      correction.requested_status,
      policy
    );

    // 7.3 Apply Mark Update
    const newScore = correction.requested_score !== null ? Number(correction.requested_score) : null;
    db.prepare(`
      UPDATE marks SET
        score = ?,
        assessment_status = ?,
        grade_letter = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(newScore, correction.requested_status, gradeRes.gradeLetter, lockedMark.id);

    // 7.4 Increment Sheet Revision
    const newRevision = sheet.revision + 1;
    db.prepare(`
      UPDATE marks_sheets SET
        revision = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(newRevision, sheet.id);

    // 7.5 Record Post-Write Snapshot in marks_sheet_revisions
    const rosterMarks = db.prepare(`
      SELECT m.student_id, m.score, m.max_score, m.assessment_status, m.grade_letter, m.status, m.updated_at
      FROM marks m
      WHERE m.sheet_id = ?
    `).all(sheet.id);

    db.prepare(`
      INSERT INTO marks_sheet_revisions (
        sheet_id, revision, status, saved_by_user_id, marks_payload_json, created_at
      ) VALUES (?, ?, 'published', ?, ?, datetime('now'))
    `).run(sheet.id, newRevision, user.id, JSON.stringify(rosterMarks));

    // 7.6 Record Detailed Audit Trail
    db.prepare(`
      INSERT INTO marks_audit_history (
        mark_id, sheet_id, examination_id, student_id, subject_id,
        action, actor_user_id, previous_score, new_score, previous_status, new_status,
        correction_id, reason, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, 'POST_PUBLICATION_CORRECTION', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      lockedMark.id, sheet.id, exam.id, lockedMark.student_id, lockedMark.subject_id,
      user.id, lockedMark.score, newScore, lockedMark.assessment_status, correction.requested_status,
      correctionId,
      `[${correction.correction_category}] ${correction.detailed_justification}${reviewComments ? ` | Approval remarks: ${reviewComments.trim()}` : ''}`,
      ipAddress
    );

    // 7.7 Update Correction Record Status
    const updateApproveRes = db.prepare(`
      UPDATE marks_corrections SET
        status = 'approved',
        reviewed_by_user_id = ?,
        reviewed_at = datetime('now'),
        review_comments = ?
      WHERE id = ? AND status = 'pending'
    `).run(user.id, reviewComments.trim() || 'Approved by authorized leadership', correctionId);

    if (Number(updateApproveRes.changes) !== 1) {
      const err = new Error('Correction request was modified concurrently.');
      (err as any).statusCode = 409;
      (err as any).code = 'CORRECTION_ALREADY_REVIEWED';
      throw err;
    }

    db.exec('COMMIT;');

    return {
      success: true,
      correctionId,
      status: 'approved',
      newScore,
      newGrade: gradeRes.gradeLetter,
      newRevision
    };
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw err;
  }
}
