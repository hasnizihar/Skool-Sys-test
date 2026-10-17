"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_js_1 = require("../db/database.js");
const auth_js_1 = require("../middleware/auth.js");
const audit_js_1 = require("../utils/audit.js");
const router = (0, express_1.Router)();
// Academic Years
router.get('/years', auth_js_1.requireAuth, (req, res) => {
    const years = database_js_1.db.prepare('SELECT * FROM academic_years ORDER BY name DESC').all();
    res.json({ years });
});
// Grades (6 to 13)
router.get('/grades', auth_js_1.requireAuth, (req, res) => {
    const grades = [6, 7, 8, 9, 10, 11, 12, 13];
    res.json({ grades });
});
// Classes list
router.get('/classes', auth_js_1.requireAuth, (req, res) => {
    const { grade } = req.query;
    let query = `
    SELECT c.*, u.full_name as class_teacher_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'enrolled') as student_count
    FROM classes c
    LEFT JOIN users u ON c.class_teacher_id = u.id
  `;
    const params = [];
    if (grade) {
        query += ' WHERE c.grade = ?';
        params.push(Number(grade));
    }
    query += ' ORDER BY c.grade ASC, c.name ASC';
    const classes = database_js_1.db.prepare(query).all(...params);
    res.json({ classes });
});
// Class Roster
router.get('/classes/:id/roster', auth_js_1.requireAuth, (req, res) => {
    const classId = Number(req.params.id);
    const classInfo = database_js_1.db.prepare(`
    SELECT c.*, u.full_name as class_teacher_name
    FROM classes c
    LEFT JOIN users u ON c.class_teacher_id = u.id
    WHERE c.id = ?
  `).get(classId);
    if (!classInfo) {
        res.status(404).json({ error: 'Class not found.' });
        return;
    }
    const students = database_js_1.db.prepare(`
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
router.get('/subjects', auth_js_1.requireAuth, (req, res) => {
    const { gradeLevel } = req.query;
    let query = 'SELECT * FROM subjects';
    const params = [];
    if (gradeLevel) {
        query += ' WHERE grade_level = ? OR grade_level = "All"';
        params.push(gradeLevel);
    }
    query += ' ORDER BY name ASC';
    const subjects = database_js_1.db.prepare(query).all(...params);
    res.json({ subjects });
});
// Class Subjects
router.get('/classes/:id/subjects', auth_js_1.requireAuth, (req, res) => {
    const classId = Number(req.params.id);
    const subjects = database_js_1.db.prepare(`
    SELECT s.*, cs.id as class_subject_id
    FROM class_subjects cs
    JOIN subjects s ON cs.subject_id = s.id
    WHERE cs.class_id = ?
    ORDER BY s.category ASC, s.name ASC
  `).all(classId);
    res.json({ subjects });
});
// Examinations
router.get('/examinations', auth_js_1.requireAuth, (req, res) => {
    const exams = database_js_1.db.prepare(`
    SELECT e.*, ay.name as academic_year_name
    FROM examinations e
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    ORDER BY e.term ASC, e.id DESC
  `).all();
    res.json({ examinations: exams });
});
// Create Class (Admin)
router.post('/classes', auth_js_1.requireAuth, (0, auth_js_1.requireRole)(['admin']), (req, res) => {
    const { grade, name, room_number, class_teacher_id } = req.body;
    if (!grade || !name) {
        res.status(400).json({ error: 'Grade and Name are required.' });
        return;
    }
    const currentYear = database_js_1.db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get();
    const stmt = database_js_1.db.prepare(`
    INSERT INTO classes (grade, name, room_number, academic_year_id, class_teacher_id)
    VALUES (?, ?, ?, ?, ?)
  `);
    const result = stmt.run(Number(grade), name, room_number || null, currentYear?.id || null, class_teacher_id || null);
    const classId = Number(result.lastInsertRowid);
    (0, audit_js_1.logAudit)(req.user.id, req.user.username, 'CLASS_CREATE', 'classes', classId, { grade, name }, req.ip);
    res.status(201).json({ success: true, id: classId });
});
// Create Subject (Admin)
router.post('/subjects', auth_js_1.requireAuth, (0, auth_js_1.requireRole)(['admin']), (req, res) => {
    const { code, name, category, grade_level } = req.body;
    if (!code || !name) {
        res.status(400).json({ error: 'Subject code and name are required.' });
        return;
    }
    const stmt = database_js_1.db.prepare(`
    INSERT INTO subjects (code, name, category, grade_level)
    VALUES (?, ?, ?, ?)
  `);
    const result = stmt.run(code.toUpperCase(), name, category || 'Core', grade_level || '6-11');
    const subjectId = Number(result.lastInsertRowid);
    (0, audit_js_1.logAudit)(req.user.id, req.user.username, 'SUBJECT_CREATE', 'subjects', subjectId, { code, name }, req.ip);
    res.status(201).json({ success: true, id: subjectId });
});
exports.default = router;
