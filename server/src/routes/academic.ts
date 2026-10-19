import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, requireRole, canAccessClass, canAccessStudent } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import {
  getStudentSubjectEnrollments,
  getClassSubjectEnrollments,
  enrollStudentInSubject,
  verifyStudentEnrollment,
  dropStudentEnrollment,
  EnrollmentCategory
} from '../services/studentEnrollmentService.js';

const router = Router();

// Academic Years
router.get('/years', requireAuth, (req, res) => {
  const years = db.prepare('SELECT * FROM academic_years ORDER BY name DESC').all();
  res.json({ years });
});

// Grades (6 to 13)
router.get('/grades', requireAuth, (req, res) => {
  const grades = [6, 7, 8, 9, 10, 11, 12, 13];
  res.json({ grades });
});

// Classes list
router.get('/classes', requireAuth, (req, res) => {
  const { grade } = req.query;

  let query = `
    SELECT c.*, u.full_name as class_teacher_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'enrolled') as student_count
    FROM classes c
    LEFT JOIN users u ON c.class_teacher_id = u.id
  `;
  const params: any[] = [];

  if (grade) {
    query += ' WHERE c.grade = ?';
    params.push(Number(grade));
  }

  query += ' ORDER BY c.grade ASC, c.name ASC';

  const classes = db.prepare(query).all(...params);
  res.json({ classes });
});

// Class Roster
router.get('/classes/:id/roster', requireAuth, (req, res) => {
  const classId = Number(req.params.id);

  const classInfo = db.prepare(`
    SELECT c.*, u.full_name as class_teacher_name
    FROM classes c
    LEFT JOIN users u ON c.class_teacher_id = u.id
    WHERE c.id = ?
  `).get(classId) as any;

  if (!classInfo) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  // Record-level permission check: teachers can only view rosters for their assigned classes
  if (!canAccessClass(req.user!, classId)) {
    res.status(403).json({ error: 'Access denied. You are not assigned to this class.' });
    return;
  }

  const students = db.prepare(`
    SELECT s.*, e.roll_number, e.status as enrollment_status
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    WHERE e.class_id = ? AND e.status = 'enrolled'
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(classId);

  res.json({
    class: classInfo,
    students
  });
});

// Subjects list
router.get('/subjects', requireAuth, (req, res) => {
  const { gradeLevel } = req.query;
  let query = 'SELECT * FROM subjects';
  const params: any[] = [];

  if (gradeLevel) {
    query += ' WHERE grade_level = ? OR grade_level = "All"';
    params.push(gradeLevel);
  }

  query += ' ORDER BY name ASC';
  const subjects = db.prepare(query).all(...params);
  res.json({ subjects });
});

// Class Subjects
router.get('/classes/:id/subjects', requireAuth, (req, res) => {
  const classId = Number(req.params.id);

  const subjects = db.prepare(`
    SELECT s.*, cs.id as class_subject_id
    FROM class_subjects cs
    JOIN subjects s ON cs.subject_id = s.id
    WHERE cs.class_id = ?
    ORDER BY s.category ASC, s.name ASC
  `).all(classId);

  res.json({ subjects });
});

// Examinations
router.get('/examinations', requireAuth, (req, res) => {
  const exams = db.prepare(`
    SELECT e.*, ay.name as academic_year_name
    FROM examinations e
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    ORDER BY e.term ASC, e.id DESC
  `).all();

  res.json({ examinations: exams });
});

// Create Class (Admin)
router.post('/classes', requireAuth, requireRole(['admin']), (req, res) => {
  const { grade, name, room_number, class_teacher_id } = req.body;
  if (!grade || !name) {
    res.status(400).json({ error: 'Grade and Name are required.' });
    return;
  }

  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };

  const stmt = db.prepare(`
    INSERT INTO classes (grade, name, room_number, academic_year_id, class_teacher_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(Number(grade), name, room_number || null, currentYear?.id || null, class_teacher_id || null);

  const classId = Number(result.lastInsertRowid);
  logAudit(req.user!.id, req.user!.username, 'CLASS_CREATE', 'classes', classId, { grade, name }, req.ip);

  res.status(201).json({ success: true, id: classId });
});

// Create Subject (Admin)
router.post('/subjects', requireAuth, requireRole(['admin']), (req, res) => {
  const { code, name, category, grade_level } = req.body;
  if (!code || !name) {
    res.status(400).json({ error: 'Subject code and name are required.' });
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO subjects (code, name, category, grade_level)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(code.toUpperCase(), name, category || 'Core', grade_level || '6-11');
  const subjectId = Number(result.lastInsertRowid);

  logAudit(req.user!.id, req.user!.username, 'SUBJECT_CREATE', 'subjects', subjectId, { code, name }, req.ip);

  res.status(201).json({ success: true, id: subjectId });
});

// Student Subject Enrollments
router.get('/enrollments/student/:studentId', requireAuth, (req, res) => {
  const studentId = Number(req.params.studentId);
  const { academic_year_id } = req.query;

  if (!canAccessStudent(req.user!, studentId)) {
    res.status(403).json({ error: 'Access denied. You do not have permission to view this student.' });
    return;
  }

  const yearId = academic_year_id ? Number(academic_year_id) : undefined;
  const enrollments = getStudentSubjectEnrollments(studentId, yearId);
  res.json({ enrollments });
});

// Class Subject Enrollments Roster
router.get('/enrollments/class/:classId/subject/:subjectId', requireAuth, (req, res) => {
  const classId = Number(req.params.classId);
  const subjectId = Number(req.params.subjectId);
  const { academic_year_id } = req.query;

  if (!canAccessClass(req.user!, classId)) {
    res.status(403).json({ error: 'Access denied. You are not assigned to this class.' });
    return;
  }

  const yearId = academic_year_id ? Number(academic_year_id) : undefined;
  const enrollments = getClassSubjectEnrollments(classId, subjectId, yearId);
  res.json({ enrollments });
});

// Enroll Student in Subject (Admin, Principal, Section Head, or assigned Class Teacher)
router.post('/enrollments', requireAuth, (req, res) => {
  const { student_id, subject_id, class_id, academic_year_id, enrollment_category, is_verified } = req.body;

  if (!student_id || !subject_id || !class_id || !academic_year_id || !enrollment_category) {
    res.status(400).json({ error: 'student_id, subject_id, class_id, academic_year_id, and enrollment_category are required.' });
    return;
  }

  // Permission check: admin, or assigned class teacher, or leadership role
  if (!canAccessClass(req.user!, Number(class_id))) {
    res.status(403).json({ error: 'Access denied. You do not have authority over this class.' });
    return;
  }

  try {
    const verifiedBy = is_verified ? req.user!.id : undefined;
    const result = enrollStudentInSubject({
      studentId: Number(student_id),
      subjectId: Number(subject_id),
      classId: Number(class_id),
      academicYearId: Number(academic_year_id),
      enrollmentCategory: enrollment_category as EnrollmentCategory,
      verifiedByUserId: verifiedBy
    });

    logAudit(
      req.user!.id,
      req.user!.username,
      'STUDENT_SUBJECT_ENROLL',
      'student_subject_enrollments',
      result.id,
      { student_id, subject_id, class_id, academic_year_id, enrollment_category, status: result.status },
      req.ip
    );

    res.status(201).json({ success: true, id: result.id, status: result.status });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to enroll student in subject.' });
  }
});

// Verify Student Subject Enrollment (Leadership role / Admin)
router.patch('/enrollments/:id/verify', requireAuth, (req, res) => {
  const enrollmentId = Number(req.params.id);

  try {
    verifyStudentEnrollment(enrollmentId, req.user!.id);
    logAudit(
      req.user!.id,
      req.user!.username,
      'STUDENT_SUBJECT_VERIFY',
      'student_subject_enrollments',
      enrollmentId,
      {},
      req.ip
    );
    res.json({ success: true, message: 'Student subject enrollment confirmed.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to verify enrollment.' });
  }
});

// Drop Student Subject Enrollment
router.patch('/enrollments/:id/drop', requireAuth, (req, res) => {
  const enrollmentId = Number(req.params.id);

  try {
    dropStudentEnrollment(enrollmentId, req.user!.id);
    logAudit(
      req.user!.id,
      req.user!.username,
      'STUDENT_SUBJECT_DROP',
      'student_subject_enrollments',
      enrollmentId,
      {},
      req.ip
    );
    res.json({ success: true, message: 'Student subject enrollment marked as dropped.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to drop enrollment.' });
  }
});

export default router;
