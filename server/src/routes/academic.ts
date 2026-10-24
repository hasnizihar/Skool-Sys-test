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
import { getActiveStaffAuthorizations } from '../services/academicAuthorizationService.js';

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
  const { academic_year_id, term, status } = req.query;
  let query = `
    SELECT e.*, ay.name as academic_year_name,
           (SELECT COUNT(*) FROM examination_schedules es WHERE es.examination_id = e.id) as scheduled_count,
           (SELECT COUNT(*) FROM examination_schedules es WHERE es.examination_id = e.id AND es.status = 'approved') as approved_schedules_count,
           (SELECT COUNT(*) FROM marks_sheets ms WHERE ms.examination_id = e.id) as sheets_count,
           (SELECT COUNT(*) FROM marks_sheets ms WHERE ms.examination_id = e.id AND ms.status = 'approved') as approved_sheets_count
    FROM examinations e
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (academic_year_id) {
    query += ' AND e.academic_year_id = ?';
    params.push(Number(academic_year_id));
  }
  if (term) {
    query += ' AND e.term = ?';
    params.push(Number(term));
  }
  if (status) {
    query += ' AND e.status = ?';
    params.push(String(status));
  }

  query += ' ORDER BY e.term ASC, e.id DESC';

  const exams = db.prepare(query).all(...params);
  res.json({ examinations: exams });
});

// Create Examination (Admin or authorized leadership)
router.post('/examinations', requireAuth, (req, res) => {
  try {
    const { name, term, academic_year_id, start_date, end_date, grade_band = 'all', exam_type = 'term', max_score, maxScore } = req.body;
    if (!name || !term || !academic_year_id) {
      res.status(400).json({ error: 'Examination name, term (1, 2, 3), and academic_year_id are required.' });
      return;
    }

    const targetMax = max_score !== undefined
      ? Number(max_score)
      : (maxScore !== undefined ? Number(maxScore) : 100.0);
    if (isNaN(targetMax) || targetMax <= 0 || targetMax > 1000) {
      res.status(400).json({ error: 'Invalid max_score: must be a positive number in range (0, 1000].' });
      return;
    }

    const user = req.user!;
    const activeAuths = getActiveStaffAuthorizations(user.id, Number(academic_year_id));
    const isAuthorized = user.role === 'admin' || activeAuths.some(a =>
      ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role)
    );

    if (!isAuthorized) {
      res.status(403).json({ error: 'Access denied: Creating examinations requires admin role or academic leadership appointment.' });
      return;
    }

    const stmt = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, grade_band, exam_type, max_score, status, is_published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0)
    `);

    const result = stmt.run(name, Number(term), Number(academic_year_id), start_date || null, end_date || null, grade_band, exam_type, targetMax);
    const examId = Number(result.lastInsertRowid);

    logAudit(user.id, user.username, 'EXAMINATION_CREATE', 'examinations', examId, { name, term, academic_year_id, grade_band, exam_type, maxScore: targetMax }, req.ip);

    res.status(201).json({ success: true, id: examId, examinationId: examId, maxScore: targetMax });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update Examination (if not published)
router.put('/examinations/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(id) as any;
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    if (exam.is_published === 1 || exam.status === 'published') {
      res.status(409).json({ error: 'Cannot modify examination after it has been published.', code: 'EXAMINATION_LOCKED' });
      return;
    }

    const user = req.user!;
    const activeAuths = getActiveStaffAuthorizations(user.id, exam.academic_year_id);
    const isAuthorized = user.role === 'admin' || activeAuths.some(a =>
      ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role)
    );

    if (!isAuthorized) {
      res.status(403).json({ error: 'Access denied: Modifying examinations requires admin role or academic leadership appointment.' });
      return;
    }

    const { name, start_date, end_date, grade_band, exam_type, status, max_score, maxScore } = req.body;
    let targetMax = exam.max_score || 100.0;
    if (max_score !== undefined || maxScore !== undefined) {
      const candidateMax = max_score !== undefined ? Number(max_score) : Number(maxScore);
      if (isNaN(candidateMax) || candidateMax <= 0 || candidateMax > 1000) {
        res.status(400).json({ error: 'Invalid max_score: must be a positive number in range (0, 1000].' });
        return;
      }
      const submittedSheets = db.prepare(`
        SELECT COUNT(*) as count FROM marks_sheets
        WHERE examination_id = ? AND status IN ('submitted', 'reviewed', 'approved', 'published')
      `).get(id) as { count: number };
      if (submittedSheets && submittedSheets.count > 0 && candidateMax !== Number(exam.max_score)) {
        res.status(409).json({
          error: 'Cannot modify maximum score after marks sheets have been submitted, approved, or published.',
          code: 'MARKS_ALREADY_SUBMITTED'
        });
        return;
      }

      const recordedMarks = db.prepare(`
        SELECT COUNT(*) as count FROM marks m
        JOIN marks_sheets ms ON m.sheet_id = ms.id
        WHERE ms.examination_id = ? AND (m.score IS NOT NULL OR m.assessment_status != 'NOT_ASSESSED')
      `).get(id) as { count: number };
      if (recordedMarks && recordedMarks.count > 0 && candidateMax !== Number(exam.max_score)) {
        res.status(409).json({
          error: 'Cannot modify maximum score after student marks have been recorded.',
          code: 'MARKS_ALREADY_RECORDED'
        });
        return;
      }

      // Synchronize empty draft sheets and schedules matching the old examination default max_score
      if (candidateMax !== Number(exam.max_score)) {
        const oldMax = Number(exam.max_score);
        db.prepare("UPDATE marks_sheets SET max_score = ?, updated_at = datetime('now') WHERE examination_id = ? AND max_score = ?").run(candidateMax, id, oldMax);
        db.prepare("UPDATE marks SET max_score = ?, updated_at = datetime('now') WHERE examination_id = ? AND max_score = ?").run(candidateMax, id, oldMax);
        db.prepare("UPDATE examination_schedules SET max_score = ? WHERE examination_id = ? AND max_score = ?").run(candidateMax, id, oldMax);
      }
      targetMax = candidateMax;
    }

    db.prepare(`
      UPDATE examinations
      SET name = COALESCE(?, name),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          grade_band = COALESCE(?, grade_band),
          exam_type = COALESCE(?, exam_type),
          status = COALESCE(?, status),
          max_score = ?
      WHERE id = ?
    `).run(name || null, start_date || null, end_date || null, grade_band || null, exam_type || null, status || null, targetMax, id);

    logAudit(user.id, user.username, 'EXAMINATION_UPDATE', 'examinations', id, req.body, req.ip);

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
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
  const {
    student_id,
    subject_id,
    class_id,
    academic_year_id,
    enrollment_category
    // Note: is_verified, verified_by_user_id, status, enrollment_status are intentionally ignored/stripped
  } = req.body;

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
    const result = enrollStudentInSubject({
      studentId: Number(student_id),
      subjectId: Number(subject_id),
      classId: Number(class_id),
      academicYearId: Number(academic_year_id),
      enrollmentCategory: enrollment_category as EnrollmentCategory
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
    const statusCode = err.statusCode || (err.message?.includes('already exists') ? 409 : 400);
    res.status(statusCode).json({ error: err.message || 'Failed to enroll student in subject.' });
  }
});

// Verify Student Subject Enrollment (Requires active Section Head, Vice Principal Academic, or Principal appointment)
router.patch('/enrollments/:id/verify', requireAuth, (req, res) => {
  const enrollmentId = Number(req.params.id);
  if (!enrollmentId || isNaN(enrollmentId)) {
    res.status(400).json({ error: 'Valid enrollment ID is required.' });
    return;
  }

  try {
    const result = verifyStudentEnrollment(enrollmentId, req.user!, { ipAddress: req.ip });
    res.json({
      success: true,
      message: 'Student subject enrollment confirmed.',
      previous_status: result.previousStatus,
      status: 'confirmed'
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message?.includes('Access denied') ? 403 : 400);
    res.status(status).json({ error: err.message || 'Failed to verify enrollment.' });
  }
});

// Drop Student Subject Enrollment (Requires active Section Head, Vice Principal Academic, or Principal appointment)
router.patch('/enrollments/:id/drop', requireAuth, (req, res) => {
  const enrollmentId = Number(req.params.id);
  if (!enrollmentId || isNaN(enrollmentId)) {
    res.status(400).json({ error: 'Valid enrollment ID is required.' });
    return;
  }

  try {
    const result = dropStudentEnrollment(enrollmentId, req.user!, {
      ipAddress: req.ip,
      reason: req.body?.reason
    });
    res.json({
      success: true,
      message: 'Student subject enrollment marked as dropped.',
      previous_status: result.previousStatus,
      status: 'dropped'
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message?.includes('Access denied') ? 403 : 400);
    res.status(status).json({ error: err.message || 'Failed to drop enrollment.' });
  }
});

export default router;
