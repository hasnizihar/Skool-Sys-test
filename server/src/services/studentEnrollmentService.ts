import { db } from '../db/database.js';
import {
  getActiveStaffAuthorizations,
  doesBandCoverGrade
} from './academicAuthorizationService.js';

export type EnrollmentStatus = 'confirmed' | 'provisional_unverified' | 'dropped' | 'transferred';
export type EnrollmentCategory =
  | 'core_compulsory'
  | 'religion_specific'
  | 'language_specific'
  | 'ol_basket_1'
  | 'ol_basket_2'
  | 'ol_basket_3'
  | 'al_stream_main'
  | 'al_common_compulsory';

export interface StudentSubjectEnrollment {
  id: number;
  student_id: number;
  student_name?: string;
  admission_no?: string;
  subject_id: number;
  subject_code?: string;
  subject_name?: string;
  class_id: number;
  class_name?: string;
  academic_year_id: number;
  academic_year_name?: string;
  enrollment_status: EnrollmentStatus;
  enrollment_category: EnrollmentCategory;
  created_at: string;
  verified_by_user_id: number | null;
  verifier_name?: string;
  verified_at: string | null;
}

export interface SubjectEligibilityResult {
  eligible: boolean; // backwards compatible: true for provisional & confirmed
  isEligibleForDraft: boolean; // provisional_unverified or confirmed (eligible for marks entry / draft roster)
  isOfficiallyConfirmed: boolean; // strictly confirmed (eligible for official approval & publication)
  status?: EnrollmentStatus;
  category?: EnrollmentCategory;
}

const VALID_CATEGORIES: EnrollmentCategory[] = [
  'core_compulsory',
  'religion_specific',
  'language_specific',
  'ol_basket_1',
  'ol_basket_2',
  'ol_basket_3',
  'al_stream_main',
  'al_common_compulsory'
];

/**
 * Returns all subject enrollments for a given student in an academic year.
 */
export function getStudentSubjectEnrollments(
  studentId: number,
  academicYearId?: number
): StudentSubjectEnrollment[] {
  let query = `
    SELECT sse.*, s.full_name as student_name, s.admission_no,
           sub.code as subject_code, sub.name as subject_name,
           c.name as class_name, ay.name as academic_year_name,
           u.full_name as verifier_name
    FROM student_subject_enrollments sse
    JOIN students s ON sse.student_id = s.id
    JOIN subjects sub ON sse.subject_id = sub.id
    JOIN classes c ON sse.class_id = c.id
    JOIN academic_years ay ON sse.academic_year_id = ay.id
    LEFT JOIN users u ON sse.verified_by_user_id = u.id
    WHERE sse.student_id = ?
  `;
  const params: any[] = [studentId];

  if (academicYearId) {
    query += ' AND sse.academic_year_id = ?';
    params.push(academicYearId);
  }

  query += ' ORDER BY sub.name ASC';
  return (db.prepare(query).all(...params) as unknown) as StudentSubjectEnrollment[];
}

/**
 * Returns all students enrolled in a specific class and subject for an academic year.
 */
export function getClassSubjectEnrollments(
  classId: number,
  subjectId: number,
  academicYearId?: number
): StudentSubjectEnrollment[] {
  let query = `
    SELECT sse.*, s.full_name as student_name, s.admission_no,
           sub.code as subject_code, sub.name as subject_name,
           c.name as class_name, ay.name as academic_year_name,
           u.full_name as verifier_name
    FROM student_subject_enrollments sse
    JOIN students s ON sse.student_id = s.id
    JOIN subjects sub ON sse.subject_id = sub.id
    JOIN classes c ON sse.class_id = c.id
    JOIN academic_years ay ON sse.academic_year_id = ay.id
    LEFT JOIN users u ON sse.verified_by_user_id = u.id
    WHERE sse.class_id = ? AND sse.subject_id = ?
  `;
  const params: any[] = [classId, subjectId];

  if (academicYearId) {
    query += ' AND sse.academic_year_id = ?';
    params.push(academicYearId);
  }

  query += ' ORDER BY s.admission_no ASC';
  return (db.prepare(query).all(...params) as unknown) as StudentSubjectEnrollment[];
}

/**
 * Checks whether a student is eligible to take an assessment for a subject.
 * Decouples draft roster eligibility (isEligibleForDraft) from official assessment
 * and publication eligibility (isOfficiallyConfirmed).
 */
export function isStudentEligibleForSubject(
  studentId: number,
  subjectId: number,
  academicYearId: number
): SubjectEligibilityResult {
  const enrollment = db.prepare(`
    SELECT enrollment_status, enrollment_category
    FROM student_subject_enrollments
    WHERE student_id = ? AND subject_id = ? AND academic_year_id = ?
  `).get(studentId, subjectId, academicYearId) as { enrollment_status: EnrollmentStatus; enrollment_category: EnrollmentCategory } | undefined;

  if (!enrollment) {
    return {
      eligible: false,
      isEligibleForDraft: false,
      isOfficiallyConfirmed: false
    };
  }

  const isOfficiallyConfirmed = enrollment.enrollment_status === 'confirmed';
  const isEligibleForDraft = enrollment.enrollment_status === 'confirmed' || enrollment.enrollment_status === 'provisional_unverified';
  const eligible = isEligibleForDraft;

  return {
    eligible,
    isEligibleForDraft,
    isOfficiallyConfirmed,
    status: enrollment.enrollment_status,
    category: enrollment.enrollment_category
  };
}

/**
 * Enrolls a student in a subject without guessing religion, language, or electives.
 *
 * STRICT INVARIANTS:
 * 1. Student must be actively enrolled in the class for that academic year in enrollments table.
 * 2. Subject must be offered for the class in class_subjects table.
 * 3. Never accepts client verification stamps; all new enrollments default to provisional_unverified.
 * 4. Cannot overwrite previously confirmed, dropped, or transferred enrollments (409 Conflict).
 * 5. Returns correct row ID on conflict/update cases.
 */
export function enrollStudentInSubject(params: {
  studentId: number;
  subjectId: number;
  classId: number;
  academicYearId: number;
  enrollmentCategory: EnrollmentCategory;
}): { success: boolean; id: number; status: EnrollmentStatus } {
  const { studentId, subjectId, classId, academicYearId, enrollmentCategory } = params;

  if (!VALID_CATEGORIES.includes(enrollmentCategory)) {
    const err = new Error(`Invalid enrollment category: ${enrollmentCategory}`);
    (err as any).statusCode = 400;
    throw err;
  }

  // 1. Verify student exists
  const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
  if (!student) {
    const err = new Error('Student not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  // 2. Verify subject exists
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) {
    const err = new Error('Subject not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  // 3. Verify class exists and matches academic year
  const classInfo = db.prepare('SELECT id, academic_year_id, grade FROM classes WHERE id = ?').get(classId) as any;
  if (!classInfo) {
    const err = new Error('Class not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  // 4. Verify academic year exists
  const year = db.prepare('SELECT id FROM academic_years WHERE id = ?').get(academicYearId);
  if (!year) {
    const err = new Error('Academic year not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  if (classInfo.academic_year_id && classInfo.academic_year_id !== academicYearId) {
    const err = new Error(`Academic year mismatch: class year (${classInfo.academic_year_id}) does not match enrollment year (${academicYearId}).`);
    (err as any).statusCode = 400;
    throw err;
  }

  // 5. Verify student truly belongs to requested class in this academic year
  const studentClassEnrollment = db.prepare(`
    SELECT id, status FROM enrollments
    WHERE student_id = ? AND class_id = ? AND academic_year_id = ?
  `).get(studentId, classId, academicYearId) as { id: number; status: string } | undefined;

  if (!studentClassEnrollment || studentClassEnrollment.status !== 'enrolled') {
    const err = new Error(`Student ${studentId} is not enrolled in class ${classId} for academic year ${academicYearId}.`);
    (err as any).statusCode = 400;
    throw err;
  }

  // 6. Verify subject is offered/eligible for this class in class_subjects
  const classSubject = db.prepare(`
    SELECT id FROM class_subjects
    WHERE class_id = ? AND subject_id = ?
  `).get(classId, subjectId);

  if (!classSubject) {
    const err = new Error(`Subject ${subjectId} is not offered for class ${classId}.`);
    (err as any).statusCode = 400;
    throw err;
  }

  // 7. Check existing enrollment for this student/subject/year to protect confirmed/dropped states
  const existing = db.prepare(`
    SELECT id, enrollment_status, enrollment_category, class_id
    FROM student_subject_enrollments
    WHERE student_id = ? AND subject_id = ? AND academic_year_id = ?
  `).get(studentId, subjectId, academicYearId) as {
    id: number;
    enrollment_status: EnrollmentStatus;
    enrollment_category: EnrollmentCategory;
    class_id: number;
  } | undefined;

  if (existing) {
    if (existing.enrollment_status === 'confirmed') {
      const err = new Error('Subject enrollment already exists with confirmed status. Generic overwrite forbidden; changes require formal administrative transition.');
      (err as any).statusCode = 409;
      throw err;
    }
    if (existing.enrollment_status === 'dropped') {
      const err = new Error('Subject enrollment already exists with dropped status. Generic overwrite forbidden; changes require formal administrative transition.');
      (err as any).statusCode = 409;
      throw err;
    }
    if (existing.enrollment_status === 'transferred') {
      const err = new Error('Subject enrollment already exists with transferred status. Generic overwrite forbidden; changes require formal administrative transition.');
      (err as any).statusCode = 409;
      throw err;
    }

    // Existing is provisional_unverified: update category and class_id safely, retaining exact row ID
    db.prepare(`
      UPDATE student_subject_enrollments SET
        class_id = ?,
        enrollment_category = ?
      WHERE id = ?
    `).run(classId, enrollmentCategory, existing.id);

    return { success: true, id: existing.id, status: 'provisional_unverified' };
  }

  // 8. Insert new provisional enrollment (strictly provisional_unverified)
  const result = db.prepare(`
    INSERT INTO student_subject_enrollments (
      student_id, subject_id, class_id, academic_year_id,
      enrollment_status, enrollment_category, verified_by_user_id, verified_at, created_at
    ) VALUES (?, ?, ?, ?, 'provisional_unverified', ?, NULL, NULL, datetime('now'))
  `).run(studentId, subjectId, classId, academicYearId, enrollmentCategory);

  return {
    success: true,
    id: Number(result.lastInsertRowid),
    status: 'provisional_unverified'
  };
}

/**
 * Evaluates whether an actor has authority to confirm or drop a student's subject enrollment.
 * Requires:
 * 1. Live active user account.
 * 2. Active academic leadership appointment (Principal, Vice Principal Academic, or Section Head)
 *    covering the class's academic year and grade band.
 */
export function canManageEnrollmentAction(
  userId: number,
  enrollmentId: number
): { allowed: boolean; reason?: string; statusCode?: number; enrollment?: any } {
  const user = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(userId) as { id: number; is_active: number } | undefined;
  if (!user || user.is_active !== 1) {
    return {
      allowed: false,
      reason: 'User account is inactive or not found.',
      statusCode: 403
    };
  }

  const enrollment = db.prepare(`
    SELECT sse.id, sse.student_id, sse.subject_id, sse.class_id, sse.academic_year_id,
           sse.enrollment_status, sse.enrollment_category,
           c.grade
    FROM student_subject_enrollments sse
    JOIN classes c ON sse.class_id = c.id
    WHERE sse.id = ?
  `).get(enrollmentId) as any;

  if (!enrollment) {
    return {
      allowed: false,
      reason: 'Subject enrollment record not found.',
      statusCode: 404
    };
  }

  const activeAuths = getActiveStaffAuthorizations(userId, enrollment.academic_year_id);
  const authorized = activeAuths.some(a =>
    ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role) &&
    doesBandCoverGrade(a.grade_band, enrollment.grade)
  );

  if (!authorized) {
    return {
      allowed: false,
      reason: 'Access denied: Requires active Section Head, Vice Principal Academic, or Principal appointment covering this grade band and academic year.',
      statusCode: 403,
      enrollment
    };
  }

  return { allowed: true, enrollment };
}

/**
 * Confirms a student's provisional enrollment.
 * Atomically checks actor authority and mutates status.
 */
export function verifyStudentEnrollment(
  enrollmentId: number,
  verifier: number | { id: number }
): { success: boolean; enrollment: any } {
  const verifierUserId = typeof verifier === 'number' ? verifier : verifier.id;

  const authCheck = canManageEnrollmentAction(verifierUserId, enrollmentId);
  if (!authCheck.allowed) {
    const err = new Error(authCheck.reason);
    (err as any).statusCode = authCheck.statusCode || 403;
    throw err;
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      UPDATE student_subject_enrollments SET
        enrollment_status = 'confirmed',
        verified_by_user_id = ?,
        verified_at = datetime('now')
      WHERE id = ?
    `).run(verifierUserId, enrollmentId);

    const updated = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
    db.exec('COMMIT;');
    return { success: true, enrollment: updated };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Marks an enrollment as dropped.
 * Atomically checks actor authority and mutates status.
 */
export function dropStudentEnrollment(
  enrollmentId: number,
  actor: number | { id: number }
): { success: boolean; enrollment: any } {
  const actorUserId = typeof actor === 'number' ? actor : actor.id;

  const authCheck = canManageEnrollmentAction(actorUserId, enrollmentId);
  if (!authCheck.allowed) {
    const err = new Error(authCheck.reason);
    (err as any).statusCode = authCheck.statusCode || 403;
    throw err;
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      UPDATE student_subject_enrollments SET
        enrollment_status = 'dropped',
        verified_by_user_id = ?,
        verified_at = datetime('now')
      WHERE id = ?
    `).run(actorUserId, enrollmentId);

    const updated = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
    db.exec('COMMIT;');
    return { success: true, enrollment: updated };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
