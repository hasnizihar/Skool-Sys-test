import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'skoolsys-super-secret-key-2026';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'class_teacher' | 'subject_teacher';
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
  directClasses.forEach(c => assignedClassIds.add(c.class_id));
  classAssignments.forEach(a => assignedClassIds.add(a.class_id));

  return {
    assignments: classAssignments,
    assignedClassIds: Array.from(assignedClassIds),
    isClassTeacherFor: directClasses.map(c => c.class_id)
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Token missing.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (err) {
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
