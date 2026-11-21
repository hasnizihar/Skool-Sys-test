import { Router } from 'express';
import { db } from '../db/database.js';
import {
  requireAuth,
  requireRole,
  canAccessClass,
  canAccessStudent,
  canAccessSection,
  getUserAssignments
} from '../middleware/auth.js';
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

// Academic Terms
router.get('/terms', requireAuth, (req, res) => {
  const { academic_year_id } = req.query;
  try {
    let query = 'SELECT * FROM academic_terms';
    const params: any[] = [];
    if (academic_year_id) {
      query += ' WHERE academic_year_id = ?';
      params.push(Number(academic_year_id));
    }
    query += ' ORDER BY term_number ASC';
    const terms = db.prepare(query).all(...params);
    res.json({ terms });
  } catch {
    res.json({ terms: [] });
  }
});

// Grades (6 to 13)
router.get('/grades', requireAuth, (req, res) => {
  const grades = [6, 7, 8, 9, 10, 11, 12, 13];
  res.json({ grades });
});

// Classes list
router.get('/classes', requireAuth, (req, res) => {
  const { grade, section_id } = req.query;

  let query = `
    SELECT c.*, sec.name as section_name, sec.code as section_code,
      u.full_name as class_teacher_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'enrolled') as student_count
    FROM classes c
    LEFT JOIN sections sec ON c.section_id = sec.id
    LEFT JOIN users u ON c.class_teacher_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (grade) {
    query += ' AND c.grade = ?';
    params.push(Number(grade));
  }

  if (section_id) {
    query += ' AND c.section_id = ?';
    params.push(Number(section_id));
  }

  query += ' ORDER BY c.grade ASC, c.name ASC';

  const classes = db.prepare(query).all(...params) as any[];

  // Also attach all assigned class teachers per class
  for (const cls of classes) {
    const teachers = db.prepare(`
      SELECT DISTINCT u.id, u.full_name, u.email
      FROM teacher_assignments ta
      JOIN users u ON ta.teacher_id = u.id
      WHERE ta.class_id = ? AND ta.assignment_type = 'class_teacher'
    `).all(cls.id) as any[];

    // Include primary class_teacher_id if not in list
    if (cls.class_teacher_id && !teachers.some((t: any) => t.id === cls.class_teacher_id)) {
      const primaryTeacher = db.prepare('SELECT id, full_name, email FROM users WHERE id = ?').get(cls.class_teacher_id) as any;
      if (primaryTeacher) teachers.unshift(primaryTeacher);
    }
    cls.class_teachers = teachers;
  }

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

// ============================================================================
// School Sections & Organizational Management (Phase 1)
// ============================================================================

// List Sections (Principal sees all; Section Head sees assigned sections)
router.get('/sections', requireAuth, (req, res) => {
  const user = req.user!;
  try {
    const sectionsSql = `
      SELECT s.*
      FROM sections s
      ORDER BY s.name ASC
    `;
    const allSections = db.prepare(sectionsSql).all() as any[];

    // Scoping: non-admin can only see sections they are assigned to
    const visibleSections = user.role === 'admin'
      ? allSections
      : allSections.filter((s: any) => canAccessSection(user, s.id));

    // Enrich each section with assigned classes and section heads
    for (const sec of visibleSections) {
      // Assigned classes
      const secClasses = db.prepare(`
        SELECT c.*, u.full_name as class_teacher_name,
          (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'enrolled') as student_count
        FROM classes c
        LEFT JOIN users u ON c.class_teacher_id = u.id
        WHERE c.section_id = ?
        ORDER BY c.grade ASC, c.name ASC
      `).all(sec.id) as any[];

      for (const cls of secClasses) {
        const teachers = db.prepare(`
          SELECT DISTINCT u.id, u.full_name, u.email
          FROM teacher_assignments ta
          JOIN users u ON ta.teacher_id = u.id
          WHERE ta.class_id = ? AND ta.assignment_type = 'class_teacher'
        `).all(cls.id) as any[];
        if (cls.class_teacher_id && !teachers.some((t: any) => t.id === cls.class_teacher_id)) {
          const pt = db.prepare('SELECT id, full_name, email FROM users WHERE id = ?').get(cls.class_teacher_id) as any;
          if (pt) teachers.unshift(pt);
        }
        cls.class_teachers = teachers;
      }
      sec.classes = secClasses;

      // Assigned section heads
      sec.section_heads = db.prepare(`
        SELECT sha.id as assignment_id, u.id, u.full_name, u.email, u.username, sha.assigned_at
        FROM section_head_assignments sha
        JOIN users u ON sha.user_id = u.id
        WHERE sha.section_id = ?
        ORDER BY u.full_name ASC
      `).all(sec.id);
    }

    res.json({ sections: visibleSections });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list sections.' });
  }
});

// Get Single Section Details
router.get('/sections/:id', requireAuth, (req, res) => {
  const sectionId = Number(req.params.id);
  if (!sectionId || isNaN(sectionId)) {
    res.status(400).json({ error: 'Valid section ID is required.' });
    return;
  }

  if (!canAccessSection(req.user!, sectionId)) {
    res.status(403).json({ error: 'Access denied. You are not assigned to this section.', code: 'FORBIDDEN_SECTION' });
    return;
  }

  const section = db.prepare(`
    SELECT s.*
    FROM sections s
    WHERE s.id = ?
  `).get(sectionId) as any;

  if (!section) {
    res.status(404).json({ error: 'Section not found.' });
    return;
  }

  const secClasses = db.prepare(`
    SELECT c.*, u.full_name as class_teacher_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'enrolled') as student_count
    FROM classes c
    LEFT JOIN users u ON c.class_teacher_id = u.id
    WHERE c.section_id = ?
    ORDER BY c.grade ASC, c.name ASC
  `).all(sectionId) as any[];

  for (const cls of secClasses) {
    const teachers = db.prepare(`
      SELECT DISTINCT u.id, u.full_name, u.email
      FROM teacher_assignments ta
      JOIN users u ON ta.teacher_id = u.id
      WHERE ta.class_id = ? AND ta.assignment_type = 'class_teacher'
    `).all(cls.id) as any[];
    if (cls.class_teacher_id && !teachers.some((t: any) => t.id === cls.class_teacher_id)) {
      const pt = db.prepare('SELECT id, full_name, email FROM users WHERE id = ?').get(cls.class_teacher_id) as any;
      if (pt) teachers.unshift(pt);
    }
    cls.class_teachers = teachers;
  }
  section.classes = secClasses;

  section.section_heads = db.prepare(`
    SELECT sha.id as assignment_id, u.id, u.full_name, u.email, u.username, sha.assigned_at
    FROM section_head_assignments sha
    JOIN users u ON sha.user_id = u.id
    WHERE sha.section_id = ?
    ORDER BY u.full_name ASC
  `).all(sectionId);

  res.json({ section });
});

// Create Section (Admin only)
router.post('/sections', requireAuth, requireRole(['admin']), (req, res) => {
  const { name, code, description, grade_range } = req.body;

  if (!name || !String(name).trim() || !code || !String(code).trim()) {
    res.status(400).json({ error: 'Section name and code are required.', code: 'VALIDATION_ERROR' });
    return;
  }

  const existing = db.prepare('SELECT id FROM sections WHERE code = ?').get(String(code).trim());
  if (existing) {
    res.status(409).json({ error: `A section with code "${String(code).trim()}" already exists.`, code: 'SECTION_CODE_EXISTS' });
    return;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO sections (name, code, description, grade_range)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      String(name).trim(),
      String(code).trim(),
      description ? String(description).trim() : null,
      grade_range ? String(grade_range).trim() : null
    );
    const sectionId = Number(result.lastInsertRowid);
    const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId);

    logAudit(req.user!.id, req.user!.username, 'SECTION_CREATE', 'sections', String(sectionId), { name, code, grade_range }, req.ip);

    res.status(201).json({ success: true, section, sectionId, message: 'Section created successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create section.' });
  }
});

// Update Section (Admin only)
router.put('/sections/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const sectionId = Number(req.params.id);
  const { name, code, description, grade_range } = req.body;

  const current = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId) as any;
  if (!current) {
    res.status(404).json({ error: 'Section not found.' });
    return;
  }

  try {
    const newName = name !== undefined ? String(name).trim() : current.name;
    const newCode = code !== undefined ? String(code).trim() : current.code;
    const newDesc = description !== undefined ? (description ? String(description).trim() : null) : current.description;
    const newRange = grade_range !== undefined ? (grade_range ? String(grade_range).trim() : null) : current.grade_range;

    if (newCode !== current.code) {
      const existing = db.prepare('SELECT id FROM sections WHERE code = ? AND id != ?').get(newCode, sectionId);
      if (existing) {
        res.status(409).json({ error: `A section with code "${newCode}" already exists.`, code: 'SECTION_CODE_EXISTS' });
        return;
      }
    }

    db.prepare(`
      UPDATE sections SET
        name = ?, code = ?, description = ?, grade_range = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newName, newCode, newDesc, newRange, sectionId);

    const updated = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId);

    logAudit(req.user!.id, req.user!.username, 'SECTION_UPDATE', 'sections', String(sectionId), { previous: current, updated: { name: newName, code: newCode, grade_range: newRange } }, req.ip);

    res.json({ success: true, section: updated, message: 'Section updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update section.' });
  }
});

// Delete Section (Admin only)
router.delete('/sections/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const sectionId = Number(req.params.id);

  const current = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId) as any;
  if (!current) {
    res.status(404).json({ error: 'Section not found.' });
    return;
  }

  try {
    db.exec('BEGIN IMMEDIATE;');
    // 1. Unassign classes
    db.prepare('UPDATE classes SET section_id = NULL WHERE section_id = ?').run(sectionId);
    // 2. Remove section head assignments
    db.prepare('DELETE FROM section_head_assignments WHERE section_id = ?').run(sectionId);
    // 3. Delete section
    db.prepare('DELETE FROM sections WHERE id = ?').run(sectionId);
    db.exec('COMMIT;');

    logAudit(req.user!.id, req.user!.username, 'SECTION_DELETE', 'sections', String(sectionId), { name: current.name, code: current.code }, req.ip);

    res.json({ success: true, message: 'Section deleted successfully.' });
  } catch (err: any) {
    try { db.exec('ROLLBACK;'); } catch { }
    res.status(500).json({ error: err.message || 'Failed to delete section.' });
  }
});

// Assign Classes to Section (Admin only)
router.post('/sections/:id/classes', requireAuth, requireRole(['admin']), (req, res) => {
  const sectionId = Number(req.params.id);
  const rawIds = req.body.classIds || req.body.class_ids;

  const section = db.prepare('SELECT id, name FROM sections WHERE id = ?').get(sectionId) as any;
  if (!section) {
    res.status(404).json({ error: 'Section not found.' });
    return;
  }

  if (!Array.isArray(rawIds)) {
    res.status(400).json({ error: 'classIds array is required.' });
    return;
  }

  try {
    db.exec('BEGIN IMMEDIATE;');
    const updateStmt = db.prepare('UPDATE classes SET section_id = ? WHERE id = ?');
    for (const cId of rawIds) {
      updateStmt.run(sectionId, Number(cId));
    }
    db.exec('COMMIT;');

    logAudit(req.user!.id, req.user!.username, 'CLASS_SECTION_ASSIGN', 'sections', String(sectionId), { classIds: rawIds }, req.ip);

    res.json({ success: true, message: `${rawIds.length} class(es) assigned to section "${section.name}".` });
  } catch (err: any) {
    try { db.exec('ROLLBACK;'); } catch { }
    res.status(500).json({ error: err.message || 'Failed to assign classes to section.' });
  }
});

// Unassign Class from Section (Admin only)
router.delete('/sections/:id/classes/:classId', requireAuth, requireRole(['admin']), (req, res) => {
  const sectionId = Number(req.params.id);
  const classId = Number(req.params.classId);

  const cls = db.prepare('SELECT id, name, section_id FROM classes WHERE id = ?').get(classId) as any;
  if (!cls) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  try {
    db.prepare('UPDATE classes SET section_id = NULL WHERE id = ? AND section_id = ?').run(classId, sectionId);

    logAudit(req.user!.id, req.user!.username, 'CLASS_SECTION_UNASSIGN', 'sections', String(sectionId), { classId, className: cls.name }, req.ip);

    res.json({ success: true, message: `Class "${cls.name}" unassigned from section.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to unassign class from section.' });
  }
});

// Assign Section Head (Admin only)
router.post('/sections/:id/heads', requireAuth, requireRole(['admin']), (req, res) => {
  const sectionId = Number(req.params.id);
  const targetUserId = req.body.userId || req.body.user_id;

  if (!targetUserId || isNaN(Number(targetUserId))) {
    res.status(400).json({ error: 'Valid userId is required.' });
    return;
  }

  const section = db.prepare('SELECT id, name FROM sections WHERE id = ?').get(sectionId) as any;
  if (!section) {
    res.status(404).json({ error: 'Section not found.' });
    return;
  }

  const targetUser = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(Number(targetUserId)) as any;
  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  try {
    // Idempotent assignment using INSERT OR IGNORE
    db.prepare(`
      INSERT OR IGNORE INTO section_head_assignments (section_id, user_id)
      VALUES (?, ?)
    `).run(sectionId, Number(targetUserId));

    logAudit(req.user!.id, req.user!.username, 'SECTION_HEAD_ASSIGN', 'section_head_assignments', String(sectionId), { userId: targetUserId, userName: targetUser.full_name, sectionName: section.name }, req.ip);

    res.status(200).json({ success: true, message: `"${targetUser.full_name}" assigned as Section Head for "${section.name}".` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to assign section head.' });
  }
});

// Remove Section Head (Admin only)
router.delete('/sections/:id/heads/:userId', requireAuth, requireRole(['admin']), (req, res) => {
  const sectionId = Number(req.params.id);
  const userId = Number(req.params.userId);

  try {
    const result = db.prepare(`
      DELETE FROM section_head_assignments
      WHERE section_id = ? AND user_id = ?
    `).run(sectionId, userId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Section head assignment not found.' });
      return;
    }

    logAudit(req.user!.id, req.user!.username, 'SECTION_HEAD_REMOVE', 'section_head_assignments', String(sectionId), { userId }, req.ip);

    res.json({ success: true, message: 'Section head assignment removed.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to remove section head.' });
  }
});

// List Class Teachers for a Class
router.get('/classes/:id/teachers', requireAuth, (req, res) => {
  const classId = Number(req.params.id);
  if (!classId || isNaN(classId)) {
    res.status(400).json({ error: 'Valid class ID is required.' });
    return;
  }

  if (!canAccessClass(req.user!, classId)) {
    res.status(403).json({ error: 'Access denied. You are not assigned to this class.' });
    return;
  }

  const cls = db.prepare('SELECT id, name, class_teacher_id FROM classes WHERE id = ?').get(classId) as any;
  if (!cls) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  const teachers = db.prepare(`
    SELECT DISTINCT u.id, u.full_name, u.email, u.username, ta.id as assignment_id
    FROM teacher_assignments ta
    JOIN users u ON ta.teacher_id = u.id
    WHERE ta.class_id = ? AND ta.assignment_type = 'class_teacher'
    ORDER BY u.full_name ASC
  `).all(classId) as any[];

  // Also include primary class_teacher_id if set and not in list
  if (cls.class_teacher_id && !teachers.some((t: any) => t.id === cls.class_teacher_id)) {
    const pt = db.prepare('SELECT id, full_name, email, username FROM users WHERE id = ?').get(cls.class_teacher_id) as any;
    if (pt) {
      pt.assignment_id = null;
      teachers.unshift(pt);
    }
  }

  res.json({ teachers });
});

// Assign Class Teacher to Class (Admin only)
router.post('/classes/:id/teachers', requireAuth, requireRole(['admin']), (req, res) => {
  const classId = Number(req.params.id);
  const targetTeacherId = req.body.teacherId || req.body.teacher_id;

  if (!targetTeacherId || isNaN(Number(targetTeacherId))) {
    res.status(400).json({ error: 'Valid teacherId is required.' });
    return;
  }

  const cls = db.prepare('SELECT id, name, academic_year_id, class_teacher_id FROM classes WHERE id = ?').get(classId) as any;
  if (!cls) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  const teacher = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(Number(targetTeacherId)) as any;
  if (!teacher) {
    res.status(404).json({ error: 'Teacher not found.' });
    return;
  }

  try {
    db.exec('BEGIN IMMEDIATE;');

    // 1. Check if already assigned in teacher_assignments
    const existing = db.prepare(`
      SELECT id FROM teacher_assignments
      WHERE teacher_id = ? AND class_id = ? AND assignment_type = 'class_teacher'
    `).get(Number(targetTeacherId), classId);

    if (!existing) {
      db.prepare(`
        INSERT INTO teacher_assignments (teacher_id, class_id, assignment_type, academic_year_id)
        VALUES (?, ?, 'class_teacher', ?)
      `).run(Number(targetTeacherId), classId, cls.academic_year_id);
    }

    // 2. If classes.class_teacher_id is null, set for legacy compatibility
    if (!cls.class_teacher_id) {
      db.prepare('UPDATE classes SET class_teacher_id = ? WHERE id = ?').run(Number(targetTeacherId), classId);
    }

    db.exec('COMMIT;');

    logAudit(req.user!.id, req.user!.username, 'CLASS_TEACHER_ASSIGN', 'classes', String(classId), { teacherId: targetTeacherId, teacherName: teacher.full_name, className: cls.name }, req.ip);

    res.status(200).json({ success: true, message: `"${teacher.full_name}" assigned as Class Teacher for "${cls.name}".` });
  } catch (err: any) {
    try { db.exec('ROLLBACK;'); } catch { }
    res.status(500).json({ error: err.message || 'Failed to assign class teacher.' });
  }
});

// Remove Class Teacher from Class (Admin only)
router.delete('/classes/:id/teachers/:teacherId', requireAuth, requireRole(['admin']), (req, res) => {
  const classId = Number(req.params.id);
  const teacherId = Number(req.params.teacherId);

  const cls = db.prepare('SELECT id, name, class_teacher_id FROM classes WHERE id = ?').get(classId) as any;
  if (!cls) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  try {
    db.exec('BEGIN IMMEDIATE;');

    // 1. Remove from teacher_assignments
    db.prepare(`
      DELETE FROM teacher_assignments
      WHERE class_id = ? AND teacher_id = ? AND assignment_type = 'class_teacher'
    `).run(classId, teacherId);

    // 2. If this was classes.class_teacher_id, update to another assigned teacher or null
    if (cls.class_teacher_id === teacherId) {
      const remaining = db.prepare(`
        SELECT teacher_id FROM teacher_assignments
        WHERE class_id = ? AND assignment_type = 'class_teacher'
        LIMIT 1
      `).get(classId) as any;

      const fallbackId = remaining ? remaining.teacher_id : null;
      db.prepare('UPDATE classes SET class_teacher_id = ? WHERE id = ?').run(fallbackId, classId);
    }

    db.exec('COMMIT;');

    logAudit(req.user!.id, req.user!.username, 'CLASS_TEACHER_REMOVE', 'classes', String(classId), { teacherId, className: cls.name }, req.ip);

    res.json({ success: true, message: 'Class teacher unassigned successfully.' });
  } catch (err: any) {
    try { db.exec('ROLLBACK;'); } catch { }
    res.status(500).json({ error: err.message || 'Failed to remove class teacher.' });
  }
});

// ==========================================
// MODULE 4: DASHBOARD INTEGRATION
// Strict role-scoped summary for Principal & Section Heads
// ==========================================

router.get('/dashboard-summary', requireAuth, (req, res) => {
  const user = req.user!;
  const today = (typeof req.query.date === 'string' && req.query.date.trim()) || new Date().toISOString().slice(0, 10);

  if (user.role === 'admin') {
    // Principal (School-Wide View)
    // 1. Total enrolled students
    const totalStudentsRow = db.prepare(`
      SELECT COUNT(*) as count FROM enrollments WHERE status = 'enrolled'
    `).get() as { count: number };
    const totalStudents = Number(totalStudentsRow?.count || 0);

    // 2. Attendance stats today
    const attStats = db.prepare(`
      SELECT
        COUNT(DISTINCT asess.id) as sessions_count,
        SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late_count,
        SUM(CASE WHEN ar.status = 'excused' THEN 1 ELSE 0 END) as excused_count
      FROM attendance_sessions asess
      JOIN attendance_records ar ON asess.id = ar.session_id
      WHERE asess.date = ? AND asess.status = 'submitted'
    `).get(today) as any;

    const presentCount = Number(attStats?.present_count || 0);
    const absentCount = Number(attStats?.absent_count || 0);
    const lateCount = Number(attStats?.late_count || 0);
    const excusedCount = Number(attStats?.excused_count || 0);
    const totalMarked = presentCount + absentCount;
    const attendanceRate = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : null;

    // 3. Classes submission stats
    const totalClassesRow = db.prepare('SELECT COUNT(*) as count FROM classes').get() as { count: number };
    const totalClasses = Number(totalClassesRow?.count || 0);

    const submittedClassesRow = db.prepare(`
      SELECT COUNT(DISTINCT class_id) as count
      FROM attendance_sessions
      WHERE date = ? AND status = 'submitted'
    `).get(today) as { count: number };
    const submittedClassesCount = Number(submittedClassesRow?.count || 0);
    const unsubmittedClassesCount = Math.max(0, totalClasses - submittedClassesCount);

    // 4. Section-wise breakdown
    const sections = db.prepare(`
      SELECT s.id, s.name, s.code, s.grade_range, s.description
      FROM sections s
      ORDER BY s.name ASC
    `).all() as any[];

    for (const sec of sections) {
      const secClasses = db.prepare(`
        SELECT c.id, c.name, c.grade,
          (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'enrolled') as student_count,
          (SELECT COUNT(*) FROM attendance_sessions asess WHERE asess.class_id = c.id AND asess.date = ? AND asess.status = 'submitted') as is_submitted
        FROM classes c
        WHERE c.section_id = ?
        ORDER BY c.grade ASC, c.name ASC
      `).all(today, sec.id) as any[];

      sec.classes_count = secClasses.length;
      sec.student_count = secClasses.reduce((sum, c) => sum + Number(c.student_count || 0), 0);
      sec.submitted_classes = secClasses.filter(c => c.is_submitted > 0).length;
      sec.unsubmitted_classes = sec.classes_count - sec.submitted_classes;

      const secAtt = db.prepare(`
        SELECT
          SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present,
          SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent
        FROM attendance_sessions asess
        JOIN attendance_records ar ON asess.id = ar.session_id
        JOIN classes c ON asess.class_id = c.id
        WHERE asess.date = ? AND asess.status = 'submitted' AND c.section_id = ?
      `).get(today, sec.id) as any;

      sec.present = Number(secAtt?.present || 0);
      sec.absent = Number(secAtt?.absent || 0);
      const secTotal = sec.present + sec.absent;
      sec.attendance_rate = secTotal > 0 ? Math.round((sec.present / secTotal) * 100) : null;

      const heads = db.prepare(`
        SELECT u.id, u.full_name, u.email
        FROM section_head_assignments sha
        JOIN users u ON sha.user_id = u.id
        WHERE sha.section_id = ?
      `).all(sec.id);
      sec.section_heads = heads;
      sec.classes = secClasses;
    }

    // 5. Recent audit logs
    const recentLogs = db.prepare(`
      SELECT id, username, action, entity_type, entity_id, timestamp, details
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT 10
    `).all();

    res.json({
      role: 'admin',
      is_section_head: false,
      date: today,
      stats: {
        totalStudents,
        totalClasses,
        submittedClassesCount,
        unsubmittedClassesCount,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        attendanceRate
      },
      sections,
      recentLogs
    });
    return;
  }

  // Non-Admin: Strictly Scoped View
  const assignments = getUserAssignments(user.id);
  const sectionIds = assignments.sectionHeadSectionIds;
  const isSectionHead = sectionIds.length > 0;

  // Check homeroom classes (dual-role support)
  const homeroomClassIds = assignments.classTeacherClassIds;
  const homeroomClasses: any[] = [];
  for (const cId of homeroomClassIds) {
    const cls = db.prepare(`
      SELECT c.id, c.name, c.grade, sec.name as section_name,
        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'enrolled') as student_count,
        (SELECT COUNT(*) FROM attendance_sessions asess WHERE asess.class_id = c.id AND asess.date = ? AND asess.status = 'submitted') as is_submitted
      FROM classes c
      LEFT JOIN sections sec ON c.section_id = sec.id
      WHERE c.id = ?
    `).get(today, cId) as any;
    if (cls) {
      homeroomClasses.push({
        ...cls,
        is_submitted: cls.is_submitted > 0
      });
    }
  }

  if (isSectionHead) {
    // Scoped section head metrics
    const placeholders = sectionIds.map(() => '?').join(',');
    const sections = db.prepare(`
      SELECT s.id, s.name, s.code, s.grade_range, s.description
      FROM sections s
      WHERE s.id IN (${placeholders})
      ORDER BY s.name ASC
    `).all(...sectionIds) as any[];

    let scopedTotalStudents = 0;
    let scopedTotalClasses = 0;
    let scopedSubmittedClasses = 0;
    let scopedPresent = 0;
    let scopedAbsent = 0;
    let scopedLate = 0;
    let scopedExcused = 0;

    for (const sec of sections) {
      const secClasses = db.prepare(`
        SELECT c.id, c.name, c.grade,
          (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'enrolled') as student_count,
          (SELECT COUNT(*) FROM attendance_sessions asess WHERE asess.class_id = c.id AND asess.date = ? AND asess.status = 'submitted') as is_submitted
        FROM classes c
        WHERE c.section_id = ?
        ORDER BY c.grade ASC, c.name ASC
      `).all(today, sec.id) as any[];

      sec.classes_count = secClasses.length;
      sec.student_count = secClasses.reduce((sum, c) => sum + Number(c.student_count || 0), 0);
      sec.submitted_classes = secClasses.filter(c => c.is_submitted > 0).length;
      sec.unsubmitted_classes = sec.classes_count - sec.submitted_classes;

      const secAtt = db.prepare(`
        SELECT
          SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present,
          SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent,
          SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late,
          SUM(CASE WHEN ar.status = 'excused' THEN 1 ELSE 0 END) as excused
        FROM attendance_sessions asess
        JOIN attendance_records ar ON asess.id = ar.session_id
        JOIN classes c ON asess.class_id = c.id
        WHERE asess.date = ? AND asess.status = 'submitted' AND c.section_id = ?
      `).get(today, sec.id) as any;

      sec.present = Number(secAtt?.present || 0);
      sec.absent = Number(secAtt?.absent || 0);
      sec.late = Number(secAtt?.late || 0);
      sec.excused = Number(secAtt?.excused || 0);
      const secTotal = sec.present + sec.absent;
      sec.attendance_rate = secTotal > 0 ? Math.round((sec.present / secTotal) * 100) : null;
      sec.classes = secClasses;

      scopedTotalStudents += sec.student_count;
      scopedTotalClasses += sec.classes_count;
      scopedSubmittedClasses += sec.submitted_classes;
      scopedPresent += sec.present;
      scopedAbsent += sec.absent;
      scopedLate += sec.late;
      scopedExcused += sec.excused;
    }

    const scopedTotalMarked = scopedPresent + scopedAbsent;
    const scopedRate = scopedTotalMarked > 0 ? Math.round((scopedPresent / scopedTotalMarked) * 100) : null;

    res.json({
      role: user.role,
      is_section_head: true,
      date: today,
      stats: {
        totalStudents: scopedTotalStudents,
        totalClasses: scopedTotalClasses,
        submittedClassesCount: scopedSubmittedClasses,
        unsubmittedClassesCount: Math.max(0, scopedTotalClasses - scopedSubmittedClasses),
        presentCount: scopedPresent,
        absentCount: scopedAbsent,
        lateCount: scopedLate,
        excusedCount: scopedExcused,
        attendanceRate: scopedRate
      },
      sections,
      homeroom_classes: homeroomClasses
    });
    return;
  }

  // Ordinary Teacher
  res.json({
    role: user.role,
    is_section_head: false,
    date: today,
    stats: {
      totalStudents: 0,
      totalClasses: homeroomClasses.length,
      submittedClassesCount: homeroomClasses.filter(c => c.is_submitted).length,
      unsubmittedClassesCount: homeroomClasses.filter(c => !c.is_submitted).length,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      excusedCount: 0,
      attendanceRate: null
    },
    sections: [],
    homeroom_classes: homeroomClasses
  });
});

export default router;
