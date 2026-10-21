import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';

/**
 * Retrieves the cryptographic signing secret from the environment.
 * STRICT ENFORCEMENT: Never permits hardcoded fallbacks. Requires minimum 32 characters.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      'FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable is missing or shorter than 32 characters. ' +
      'A cryptographically strong secret of at least 32 characters is required to operate SkoolSys safely.'
    );
  }
  return secret;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'class_teacher' | 'subject_teacher';
  token_version?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function getUserAssignments(userId: number) {
  const classAssignments = db.prepare(`
    SELECT ta.class_id, c.name as class_name, c.grade, ta.assignment_type, ta.subject_id, s.name as subject_name, s.code as subject_code
    FROM teacher_assignments ta
    JOIN classes c ON ta.class_id = c.id
    LEFT JOIN subjects s ON ta.subject_id = s.id
    WHERE ta.teacher_id = ?
  `).all(userId) as any[];

  // Also check if user is direct class_teacher_id in classes table
  const directClasses = db.prepare(`
    SELECT id as class_id, name as class_name, grade
    FROM classes
    WHERE class_teacher_id = ?
  `).all(userId) as any[];

  const assignedClassIds = new Set<number>();
  const classTeacherClassIds = new Set<number>();

  directClasses.forEach(c => {
    assignedClassIds.add(Number(c.class_id));
    classTeacherClassIds.add(Number(c.class_id));
  });

  classAssignments.forEach(a => {
    assignedClassIds.add(Number(a.class_id));
    if (a.assignment_type === 'class_teacher') {
      classTeacherClassIds.add(Number(a.class_id));
    }
  });

  return {
    assignments: classAssignments,
    assignedClassIds: Array.from(assignedClassIds),
    classTeacherClassIds: Array.from(classTeacherClassIds),
    isClassTeacherFor: Array.from(classTeacherClassIds)
  };
}

/**
 * Record-Level Authorization Policy Checks (PR-003)
 */
export function canAccessClass(user: AuthUser, classId: number): boolean {
  if (user.role === 'admin') return true;
  const assignments = getUserAssignments(user.id);
  if (assignments.assignedClassIds.includes(Number(classId))) return true;

  // Also check academic staff leadership appointments
  const classRow = db.prepare('SELECT academic_year_id, grade FROM classes WHERE id = ?').get(classId) as { academic_year_id: number; grade: number } | undefined;
  if (classRow && classRow.academic_year_id) {
    const auths = getActiveStaffAuthorizations(user.id, classRow.academic_year_id);
    return auths.some(a =>
      ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role) &&
      doesBandCoverGrade(a.grade_band, classRow.grade)
    );
  }

  return false;
}

export function canManageClassAttendance(user: AuthUser, classId: number): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'class_teacher') {
    const assignments = getUserAssignments(user.id);
    return assignments.classTeacherClassIds.includes(Number(classId));
  }
  return false;
}

export function canViewClassAttendance(user: AuthUser, classId: number): boolean {
  if (user.role === 'admin') return true;
  const assignments = getUserAssignments(user.id);
  return assignments.assignedClassIds.includes(Number(classId));
}

export function canManageMarks(user: AuthUser, classId: number, subjectId: number): boolean {
  if (user.role === 'admin') return true;

  const assignments = getUserAssignments(user.id);
  const cId = Number(classId);
  const sId = Number(subjectId);

  // 1. Direct assignment as subject teacher for this class & subject
  const isAssignedSubjectTeacher = assignments.assignments.some(
    (a: any) => a.assignment_type === 'subject_teacher' && a.class_id === cId && Number(a.subject_id) === sId
  );
  if (isAssignedSubjectTeacher) return true;

  // 2. Class teacher check: only permitted if NO specialist teacher is assigned
  if (assignments.classTeacherClassIds.includes(cId)) {
    const specialistAssignment = db.prepare(`
      SELECT teacher_id FROM teacher_assignments
      WHERE class_id = ? AND subject_id = ? AND teacher_id != ?
    `).get(cId, sId, user.id) as any;

    if (specialistAssignment) {
      return false; // Specialist subject teacher is assigned; class teacher cannot overwrite
    }
    return true;
  }

  return false;
}

export function canViewMarksSheet(user: AuthUser, classId: number, subjectId: number): boolean {
  const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as { id: number; is_active: number } | undefined;
  if (!activeUser || activeUser.is_active !== 1) return false;

  if (user.role === 'admin') return true;
  const assignments = getUserAssignments(user.id);
  const cId = Number(classId);
  const sId = Number(subjectId);

  // Assigned to teach subject in this class
  if (assignments.assignments.some((a: any) => a.assignment_type === 'subject_teacher' && a.class_id === cId && Number(a.subject_id) === sId)) {
    return true;
  }
  // Assigned as class teacher for this class
  if (assignments.classTeacherClassIds.includes(cId)) {
    return true;
  }
  return false;
}

export function canAccessStudent(user: AuthUser, studentId: number): boolean {
  if (user.role === 'admin') return true;

  const enrollment = db.prepare(`
    SELECT e.class_id, e.academic_year_id, c.grade
    FROM enrollments e
    JOIN classes c ON e.class_id = c.id
    WHERE e.student_id = ? AND e.status = 'enrolled'
  `).get(Number(studentId)) as any;

  if (!enrollment || !enrollment.class_id) {
    return false;
  }

  const assignments = getUserAssignments(user.id);
  if (assignments.assignedClassIds.includes(Number(enrollment.class_id))) return true;

  // Also check academic staff leadership appointments
  if (enrollment.academic_year_id) {
    const auths = getActiveStaffAuthorizations(user.id, enrollment.academic_year_id);
    return auths.some(a =>
      ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role) &&
      doesBandCoverGrade(a.grade_band, enrollment.grade)
    );
  }

  return false;
}

/**
 * Authentication Middleware
 * 1. Cryptographically verifies JWT using strictly validated secret.
 * 2. Queries database on EVERY request to verify account is active (is_active = 1).
 * 3. Enforces token versioning to reject revoked or invalidated sessions immediately.
 * 4. Rehydrates live user role directly from database to eliminate stale JWT role elevation.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Token missing.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;

    if (!decoded || !decoded.id) {
      res.status(401).json({ error: 'Invalid session token payload.' });
      return;
    }

    // Server-side active verification & role rehydration on EVERY request
    const user = db.prepare(`
      SELECT id, username, email, full_name, role, is_active, token_version
      FROM users
      WHERE id = ?
    `).get(decoded.id) as any;

    if (!user) {
      res.status(401).json({ error: 'Authentication failed. Account no longer exists.' });
      return;
    }

    if (!user.is_active || user.is_active === 0) {
      res.status(401).json({ error: 'Authentication failed. Account has been deactivated.' });
      return;
    }

    // Token version check (revocation check)
    if (decoded.token_version !== undefined && user.token_version !== undefined) {
      if (decoded.token_version !== user.token_version) {
        res.status(401).json({ error: 'Session has been revoked or invalidated. Please log in again.' });
        return;
      }
    }

    // Always rehydrate req.user from live server records to prevent stale JWT claims
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      token_version: user.token_version
    };

    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Requires one of: ${allowedRoles.join(', ')}.`
      });
      return;
    }
    next();
  };
}

import {
  canReviewMarksSheet,
  canApproveMarksSheet,
  canPublishExamination,
  getActiveStaffAuthorizations,
  hasAcademicStaffRole,
  doesBandCoverGrade,
  AcademicAuthRole,
  GradeBand,
  AcademicStaffAuthorization
} from '../services/academicAuthorizationService.js';

export {
  canReviewMarksSheet,
  canApproveMarksSheet,
  canPublishExamination,
  getActiveStaffAuthorizations,
  hasAcademicStaffRole,
  doesBandCoverGrade
};
export type { AcademicAuthRole, GradeBand, AcademicStaffAuthorization };

/**
 * Middleware requiring active academic staff appointment.
 * STRICT ENFORCEMENT:
 * - Requires explicit academic year scope; never falls back to an unscoped or cross-year check.
 * - If grade scope is provided, verifies that the user's appointment covers the grade band.
 * - Base admin alone does not bypass without an active academic appointment for that scope.
 */
export function requireAcademicStaffRole(
  allowedRoles: AcademicAuthRole[],
  getScope: (req: Request) => { academicYearId: number; grade?: number } | number | undefined
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const scope = getScope ? getScope(req) : undefined;
    const yearId = typeof scope === 'number' ? scope : scope?.academicYearId;
    const grade = typeof scope === 'object' ? scope?.grade : undefined;

    if (!yearId || isNaN(yearId)) {
      res.status(400).json({
        error: 'Academic authorization check failed: Explicit academic year scope is required.'
      });
      return;
    }

    const activeAuths = getActiveStaffAuthorizations(req.user.id, yearId);
    const hasRole = activeAuths.some((a: AcademicStaffAuthorization) => {
      if (!allowedRoles.includes(a.auth_role)) return false;
      if (grade !== undefined) {
        return doesBandCoverGrade(a.grade_band, grade);
      }
      return true;
    });

    if (!hasRole) {
      res.status(403).json({
        error: `Access denied. Requires active academic appointment in: ${allowedRoles.join(', ')} covering this academic year${grade !== undefined ? ` and grade ${grade}` : ''}.`
      });
      return;
    }
    next();
  };
}


