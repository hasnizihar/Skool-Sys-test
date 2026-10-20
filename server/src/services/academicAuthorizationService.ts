import { db } from '../db/database.js';
import { AuthUser } from '../middleware/auth.js';

export type AcademicAuthRole = 'principal' | 'vice_principal_academic' | 'section_head' | 'exam_coordinator';
export type GradeBand = 'junior_6_9' | 'ol_10_11' | 'al_12_13' | 'all';

export interface AcademicStaffAuthorization {
  id: number;
  user_id: number;
  user_full_name?: string;
  user_email?: string;
  academic_year_id: number;
  academic_year_name?: string;
  auth_role: AcademicAuthRole;
  grade_band: GradeBand;
  is_active: number;
  granted_by_user_id: number;
  granted_at: string;
  revoked_by_user_id: number | null;
  revoked_at: string | null;
  revocation_reason: string | null;
}

export function getGradeBandForGrade(grade: number): GradeBand | null {
  if (grade >= 6 && grade <= 9) return 'junior_6_9';
  if (grade >= 10 && grade <= 11) return 'ol_10_11';
  if (grade >= 12 && grade <= 13) return 'al_12_13';
  return null;
}

export function doesBandCoverGrade(band: GradeBand, grade: number): boolean {
  if (band === 'all') return grade >= 6 && grade <= 13;
  if (band === 'junior_6_9') return grade >= 6 && grade <= 9;
  if (band === 'ol_10_11') return grade >= 10 && grade <= 11;
  if (band === 'al_12_13') return grade >= 12 && grade <= 13;
  return false;
}

/**
 * Retrieves all active academic staff authorizations for a user.
 * Transactionally asserts that the underlying user account is active in users table.
 */
export function getActiveStaffAuthorizations(userId: number, academicYearId?: number): AcademicStaffAuthorization[] {
  // 1. Live active account check on EVERY invocation
  const user = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(userId) as { id: number; is_active: number } | undefined;
  if (!user || user.is_active !== 1) {
    return [];
  }

  let query = `
    SELECT asa.*, u.full_name as user_full_name, u.email as user_email, ay.name as academic_year_name
    FROM academic_staff_authorizations asa
    JOIN users u ON asa.user_id = u.id
    JOIN academic_years ay ON asa.academic_year_id = ay.id
    WHERE asa.user_id = ? AND asa.is_active = 1 AND u.is_active = 1
  `;
  const params: any[] = [userId];

  if (academicYearId) {
    query += ' AND asa.academic_year_id = ?';
    params.push(academicYearId);
  }

  query += ' ORDER BY asa.id DESC';
  return (db.prepare(query).all(...params) as unknown) as AcademicStaffAuthorization[];
}

/**
 * Checks if a user holds an active academic staff role covering an academic year and optional grade.
 */
export function hasAcademicStaffRole(
  userId: number,
  roles: AcademicAuthRole | AcademicAuthRole[],
  academicYearId: number,
  grade?: number
): boolean {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  const activeAuths = getActiveStaffAuthorizations(userId, academicYearId);

  return activeAuths.some(auth => {
    if (!allowedRoles.includes(auth.auth_role)) return false;
    if (grade === undefined) return true;
    return doesBandCoverGrade(auth.grade_band, grade);
  });
}

/**
 * Grants an academic staff appointment.
 */
export function grantAcademicAuthorization(params: {
  userId: number;
  academicYearId: number;
  authRole: AcademicAuthRole;
  gradeBand: GradeBand;
  grantedByUserId: number;
}): { success: boolean; id: number } {
  const { userId, academicYearId, authRole, gradeBand, grantedByUserId } = params;

  // Validate target user exists and is active
  const targetUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(userId) as { id: number; is_active: number } | undefined;
  if (!targetUser) {
    throw new Error('Target user does not exist.');
  }
  if (targetUser.is_active !== 1) {
    throw new Error('Cannot grant academic authorization to a deactivated user account.');
  }

  // Validate academic year exists
  const year = db.prepare('SELECT id FROM academic_years WHERE id = ?').get(academicYearId);
  if (!year) {
    throw new Error('Academic year does not exist.');
  }

  // Validate granter user exists and is active
  const granter = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(grantedByUserId) as { id: number; role: string; is_active: number } | undefined;
  if (!granter || granter.is_active !== 1) {
    throw new Error('Granter user is not authorized or account is inactive.');
  }

  // Check if active authorization already exists
  const existing = db.prepare(`
    SELECT id, is_active FROM academic_staff_authorizations
    WHERE user_id = ? AND academic_year_id = ? AND auth_role = ? AND grade_band = ?
  `).get(userId, academicYearId, authRole, gradeBand) as { id: number; is_active: number } | undefined;

  if (existing) {
    if (existing.is_active === 1) {
      throw new Error(`User already holds an active '${authRole}' appointment for this academic year and grade band.`);
    }
    // Re-activate previously revoked authorization
    db.prepare(`
      UPDATE academic_staff_authorizations SET
        is_active = 1,
        granted_by_user_id = ?,
        granted_at = datetime('now'),
        revoked_by_user_id = NULL,
        revoked_at = NULL,
        revocation_reason = NULL
      WHERE id = ?
    `).run(grantedByUserId, existing.id);

    return { success: true, id: existing.id };
  }

  // Insert new authorization
  const result = db.prepare(`
    INSERT INTO academic_staff_authorizations (
      user_id, academic_year_id, auth_role, grade_band, is_active, granted_by_user_id, granted_at
    ) VALUES (?, ?, ?, ?, 1, ?, datetime('now'))
  `).run(userId, academicYearId, authRole, gradeBand, grantedByUserId);

  return { success: true, id: Number(result.lastInsertRowid) };
}

/**
 * Revokes an academic staff appointment.
 */
export function revokeAcademicAuthorization(params: {
  authorizationId: number;
  revokedByUserId: number;
  reason: string;
}): { success: boolean } {
  const { authorizationId, revokedByUserId, reason } = params;

  if (!reason || !reason.trim()) {
    throw new Error('A mandatory revocation reason must be provided for institutional auditing.');
  }

  const auth = db.prepare('SELECT id, is_active FROM academic_staff_authorizations WHERE id = ?').get(authorizationId) as { id: number; is_active: number } | undefined;
  if (!auth) {
    throw new Error('Academic authorization not found.');
  }
  if (auth.is_active !== 1) {
    throw new Error('Academic authorization is already inactive or revoked.');
  }

  db.prepare(`
    UPDATE academic_staff_authorizations SET
      is_active = 0,
      revoked_by_user_id = ?,
      revoked_at = datetime('now'),
      revocation_reason = ?
    WHERE id = ?
  `).run(revokedByUserId, reason.trim(), authorizationId);

  return { success: true };
}

/**
 * Institutional Segregation of Duties (SoD): Review / Endorsement Permission Check
 * 
 * STRICT INVARIANTS:
 * 1. Anti-Self-Review: Assigned teacher cannot review or endorse their own marks sheet (SELF_REVIEW_TEACHER).
 * 2. Anti-Self-Review: User who entered or modified marks cannot review or endorse the sheet (SELF_REVIEW_ENTRANT).
 * 3. Permitted roles:
 *    - Principal, Vice Principal Academic, Section Head, Exam Coordinator
 *    covering the academic year and class grade.
 *    Note: Base admin alone without academic staff authorization cannot review.
 */
export function canReviewMarksSheet(user: AuthUser, sheetId: number): { allowed: boolean; reason?: string; code?: string } {
  const sheet = db.prepare(`
    SELECT ms.id, ms.examination_id, ms.class_id, ms.academic_year_id, ms.teacher_id, c.grade
    FROM marks_sheets ms
    JOIN classes c ON ms.class_id = c.id
    WHERE ms.id = ?
  `).get(sheetId) as { id: number; examination_id: number; class_id: number; academic_year_id: number; teacher_id: number | null; grade: number } | undefined;

  if (!sheet) {
    return { allowed: false, reason: 'Marks sheet not found.', code: 'SHEET_NOT_FOUND' };
  }

  // 1. Anti-Self-Review: Assigned Teacher Check
  if (sheet.teacher_id !== null && Number(sheet.teacher_id) === user.id) {
    return {
      allowed: false,
      reason: 'Institutional Segregation Violation: The assigned teacher cannot review or endorse their own marks sheet.',
      code: 'SELF_REVIEW_TEACHER'
    };
  }

  // 2. Anti-Self-Review: Entrant / Modifier Check
  const entrantCheck = db.prepare(`
    SELECT COUNT(*) as cnt FROM marks
    WHERE sheet_id = ? AND entered_by_user_id = ?
  `).get(sheetId, user.id) as { cnt: number };

  if (entrantCheck.cnt > 0) {
    return {
      allowed: false,
      reason: 'Institutional Segregation Violation: The user who entered or modified marks cannot review or endorse the sheet.',
      code: 'SELF_REVIEW_ENTRANT'
    };
  }

  // 3. Scoped Leadership Appointment Check
  const activeAuths = getActiveStaffAuthorizations(user.id, sheet.academic_year_id);
  const eligible = activeAuths.some(a =>
    ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'].includes(a.auth_role) &&
    doesBandCoverGrade(a.grade_band, sheet.grade)
  );

  if (eligible) return { allowed: true };

  return {
    allowed: false,
    reason: 'UNAUTHORIZED: User does not hold an active academic leadership appointment covering this class and academic year.',
    code: 'INSUFFICIENT_AUTHORIZATION'
  };
}

/**
 * Institutional Permission Check: Read-Only Inspection / Viewing of Marks Sheet
 * 
 * Permitted if:
 * 1. Assigned teacher for this sheet, OR
 * 2. Active academic leadership appointment (Principal, Vice Principal Academic, Section Head, Exam Coordinator)
 *    covering the academic year and class grade.
 */
export function canViewMarksSheet(user: AuthUser, sheetId: number): { allowed: boolean; reason?: string } {
  const sheet = db.prepare(`
    SELECT ms.id, ms.class_id, ms.academic_year_id, ms.teacher_id, c.grade
    FROM marks_sheets ms
    JOIN classes c ON ms.class_id = c.id
    WHERE ms.id = ?
  `).get(sheetId) as { id: number; class_id: number; academic_year_id: number; teacher_id: number | null; grade: number } | undefined;

  if (!sheet) {
    return { allowed: false, reason: 'Marks sheet not found.' };
  }

  // Assigned teacher can always view their own sheet
  if (sheet.teacher_id !== null && Number(sheet.teacher_id) === user.id) {
    return { allowed: true };
  }

  // Authorized leadership can view sheets in their scope
  const activeAuths = getActiveStaffAuthorizations(user.id, sheet.academic_year_id);
  const eligible = activeAuths.some(a =>
    ['principal', 'vice_principal_academic', 'section_head', 'exam_coordinator'].includes(a.auth_role) &&
    doesBandCoverGrade(a.grade_band, sheet.grade)
  );

  if (eligible) return { allowed: true };

  return {
    allowed: false,
    reason: 'UNAUTHORIZED: User does not have permission to view this marks sheet.'
  };
}

/**
 * Institutional Segregation of Duties (SoD): Final Approval Permission Check
 * 
 * STRICT INVARIANTS:
 * 1. Anti-Self-Approval: Assigned teacher cannot approve own marks sheet (SELF_APPROVAL_TEACHER).
 * 2. Anti-Self-Approval: User who entered or modified marks cannot approve sheet (SELF_APPROVAL_ENTRANT).
 *    (NOTE: Current check inspects marks.entered_by_user_id. Full immutable lifetime revision author history
 *    will be durably enforced in Gate 3/4 via marks_revisions and audit trails.)
 * 3. Anti-Self-Approval: Reviewer who endorsed the sheet cannot self-approve as final approver (SELF_APPROVAL_REVIEWER).
 * 4. Role Authority: Restricted to designated, independent Principal or Vice Principal Academic appointment
 *    covering this academic year and grade band. Section Heads endorse/review but cannot perform final approval.
 * 5. Base admin alone without an active academic staff appointment cannot approve.
 */
export function canApproveMarksSheet(user: AuthUser, sheetId: number): { allowed: boolean; reason?: string; code?: string } {
  const sheet = db.prepare(`
    SELECT ms.id, ms.examination_id, ms.class_id, ms.subject_id, ms.academic_year_id,
           ms.teacher_id, ms.reviewed_by_user_id, c.grade
    FROM marks_sheets ms
    JOIN classes c ON ms.class_id = c.id
    WHERE ms.id = ?
  `).get(sheetId) as {
    id: number;
    examination_id: number;
    class_id: number;
    subject_id: number;
    academic_year_id: number;
    teacher_id: number | null;
    reviewed_by_user_id: number | null;
    grade: number;
  } | undefined;

  if (!sheet) {
    return { allowed: false, reason: 'Marks sheet not found.', code: 'SHEET_NOT_FOUND' };
  }

  // 1. Anti-Self-Approval: Assigned Teacher Check
  if (sheet.teacher_id !== null && Number(sheet.teacher_id) === user.id) {
    return {
      allowed: false,
      reason: 'Institutional Segregation Violation: The assigned teacher cannot approve their own marks sheet.',
      code: 'SELF_APPROVAL_TEACHER'
    };
  }

  // 2. Anti-Self-Approval: Entrant / Modifier Check
  const entrantCheck = db.prepare(`
    SELECT COUNT(*) as cnt FROM marks
    WHERE sheet_id = ? AND entered_by_user_id = ?
  `).get(sheetId, user.id) as { cnt: number };

  if (entrantCheck.cnt > 0) {
    return {
      allowed: false,
      reason: 'Institutional Segregation Violation: The user who entered or modified marks cannot approve the sheet.',
      code: 'SELF_APPROVAL_ENTRANT'
    };
  }

  // 3. Anti-Self-Approval: Reviewer / Endorser Check
  if (sheet.reviewed_by_user_id !== null && Number(sheet.reviewed_by_user_id) === user.id) {
    return {
      allowed: false,
      reason: 'Institutional Segregation Violation: The reviewer who endorsed the sheet cannot self-approve as final approver. Reviewer and final approver roles must be strictly separated.',
      code: 'SELF_APPROVAL_REVIEWER'
    };
  }

  // 4. Role Authority Check via academic_staff_authorizations
  // Strictly restricted to Principal or Vice Principal Academic.
  // Section Heads only review/endorse. Plain admin without active appointment cannot approve.
  const activeAuths = getActiveStaffAuthorizations(user.id, sheet.academic_year_id);
  const approverAuth = activeAuths.find(a =>
    ['principal', 'vice_principal_academic'].includes(a.auth_role) &&
    doesBandCoverGrade(a.grade_band, sheet.grade)
  );

  if (approverAuth) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Access denied: Final approval requires active Principal or Vice Principal Academic appointment covering this grade band and academic year. Section Heads endorse/review but cannot finalize approval, and plain admin accounts without appointment cannot approve.',
    code: 'INSUFFICIENT_AUTHORIZATION'
  };
}

/**
 * Examination Publication Authorization Check
 * Independent whole-exam publication requires Principal or Vice Principal Academic appointment
 * covering the examination academic year with all-band scope.
 */
export function canPublishExamination(user: AuthUser, examinationId: number): { allowed: boolean; reason?: string } {
  const exam = db.prepare('SELECT id, academic_year_id FROM examinations WHERE id = ?').get(examinationId) as { id: number; academic_year_id: number } | undefined;
  if (!exam) {
    return { allowed: false, reason: 'Examination not found.' };
  }

  const activeAuths = getActiveStaffAuthorizations(user.id, exam.academic_year_id);
  const canPublish = activeAuths.some(a =>
    ['principal', 'vice_principal_academic'].includes(a.auth_role) &&
    a.grade_band === 'all'
  );

  if (canPublish) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Access denied: Independent examination publication requires Principal or Vice Principal Academic appointment with all-band scope.'
  };
}

