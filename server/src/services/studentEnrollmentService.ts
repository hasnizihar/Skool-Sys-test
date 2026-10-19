import { db } from '../db/database.js';

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
 * Checks whether a student is currently eligible to take an assessment for a subject.
 * Returns true if enrollment exists and status is 'confirmed' or 'provisional_unverified'.
 */
export function isStudentEligibleForSubject(
  studentId: number,
  subjectId: number,
  academicYearId: number
): { eligible: boolean; status?: EnrollmentStatus; category?: EnrollmentCategory } {
  const enrollment = db.prepare(`
    SELECT enrollment_status, enrollment_category
    FROM student_subject_enrollments
    WHERE student_id = ? AND subject_id = ? AND academic_year_id = ?
  `).get(studentId, subjectId, academicYearId) as { enrollment_status: EnrollmentStatus; enrollment_category: EnrollmentCategory } | undefined;

  if (!enrollment) {
    return { eligible: false };
  }

  const eligible = enrollment.enrollment_status === 'confirmed' || enrollment.enrollment_status === 'provisional_unverified';
  return {
    eligible,
    status: enrollment.enrollment_status,
    category: enrollment.enrollment_category
  };
}

/**
 * Enrolls a student in a subject without guessing religion, language, or electives.
 */
export function enrollStudentInSubject(params: {
  studentId: number;
  subjectId: number;
  classId: number;
  academicYearId: number;
  enrollmentCategory: EnrollmentCategory;
  verifiedByUserId?: number;
}): { success: boolean; id: number; status: EnrollmentStatus } {
  const { studentId, subjectId, classId, academicYearId, enrollmentCategory, verifiedByUserId } = params;

  if (!VALID_CATEGORIES.includes(enrollmentCategory)) {
    throw new Error(`Invalid enrollment category: ${enrollmentCategory}`);
  }

  // Verify student, subject, class, and year exist
  const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
  if (!student) throw new Error('Student not found.');

  const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) throw new Error('Subject not found.');

  const classInfo = db.prepare('SELECT id, academic_year_id FROM classes WHERE id = ?').get(classId) as any;
  if (!classInfo) throw new Error('Class not found.');

  const year = db.prepare('SELECT id FROM academic_years WHERE id = ?').get(academicYearId);
  if (!year) throw new Error('Academic year not found.');

  if (classInfo.academic_year_id && classInfo.academic_year_id !== academicYearId) {
    throw new Error(`Academic year mismatch: class year (${classInfo.academic_year_id}) does not match enrollment year (${academicYearId}).`);
  }

  const status: EnrollmentStatus = verifiedByUserId ? 'confirmed' : 'provisional_unverified';
  const verifiedAt = verifiedByUserId ? new Date().toISOString() : null;

  const stmt = db.prepare(`
    INSERT INTO student_subject_enrollments (
      student_id, subject_id, class_id, academic_year_id,
      enrollment_status, enrollment_category, verified_by_user_id, verified_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(student_id, subject_id, academic_year_id) DO UPDATE SET
      class_id = excluded.class_id,
      enrollment_status = excluded.enrollment_status,
      enrollment_category = excluded.enrollment_category,
      verified_by_user_id = excluded.verified_by_user_id,
      verified_at = excluded.verified_at
  `);

  const result = stmt.run(
    studentId, subjectId, classId, academicYearId,
    status, enrollmentCategory, verifiedByUserId || null, verifiedAt
  );

  const finalId = Number(result.lastInsertRowid);
  return { success: true, id: finalId, status };
}

/**
 * Confirms a student's provisional enrollment.
 */
export function verifyStudentEnrollment(
  enrollmentId: number,
  verifierUserId: number
): { success: boolean } {
  const verifier = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(verifierUserId) as { id: number; is_active: number } | undefined;
  if (!verifier || verifier.is_active !== 1) {
    throw new Error('Verifier user account is inactive or not found.');
  }

  const enrollment = db.prepare('SELECT id FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
  if (!enrollment) {
    throw new Error('Subject enrollment record not found.');
  }

  db.prepare(`
    UPDATE student_subject_enrollments SET
      enrollment_status = 'confirmed',
      verified_by_user_id = ?,
      verified_at = datetime('now')
    WHERE id = ?
  `).run(verifierUserId, enrollmentId);

  return { success: true };
}

/**
 * Marks an enrollment as dropped.
 */
export function dropStudentEnrollment(
  enrollmentId: number,
  verifierUserId: number
): { success: boolean } {
  const verifier = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(verifierUserId) as { id: number; is_active: number } | undefined;
  if (!verifier || verifier.is_active !== 1) {
    throw new Error('Verifier user account is inactive or not found.');
  }

  const enrollment = db.prepare('SELECT id FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
  if (!enrollment) {
    throw new Error('Subject enrollment record not found.');
  }

  db.prepare(`
    UPDATE student_subject_enrollments SET
      enrollment_status = 'dropped',
      verified_by_user_id = ?,
      verified_at = datetime('now')
    WHERE id = ?
  `).run(verifierUserId, enrollmentId);

  return { success: true };
}
