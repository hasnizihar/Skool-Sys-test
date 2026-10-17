import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { runSeed } from '../db/seed.js';

const router = Router();

// Require admin for all admin routes
router.use(requireAuth, requireRole(['admin']));

// List Users
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, full_name, role, is_active, created_at
    FROM users
    ORDER BY role ASC, full_name ASC
  `).all();
  res.json({ users });
});

// Create User
router.post('/users', (req, res) => {
  const { username, email, password, full_name, role } = req.body;

  if (!username || !email || !password || !full_name || !role) {
    res.status(400).json({ error: 'All user fields are required.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    res.status(400).json({ error: 'Username or email already in use.' });
    return;
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(username, email, hash, full_name, role);
  const newUserId = Number(result.lastInsertRowid);

  logAudit(req.user!.id, req.user!.username, 'USER_CREATE', 'users', newUserId, { username, role, full_name }, req.ip);

  res.status(201).json({ success: true, userId: newUserId });
});

// Update User (Role, Active status, Reset password)
router.put('/users/:id', (req, res) => {
  const targetId = Number(req.params.id);
  const { full_name, email, role, is_active, newPassword } = req.body;

  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as any;
  if (!current) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  let passHash = current.password_hash;
  if (newPassword && newPassword.trim().length >= 6) {
    const salt = bcrypt.genSaltSync(10);
    passHash = bcrypt.hashSync(newPassword, salt);
  }

  const update = db.prepare(`
    UPDATE users SET
      full_name = ?, email = ?, role = ?, is_active = ?, password_hash = ?
    WHERE id = ?
  `);

  update.run(
    full_name || current.full_name,
    email || current.email,
    role || current.role,
    is_active !== undefined ? (is_active ? 1 : 0) : current.is_active,
    passHash,
    targetId
  );

  logAudit(req.user!.id, req.user!.username, 'USER_UPDATE', 'users', targetId, { role, is_active, passwordReset: !!newPassword }, req.ip);

  res.json({ success: true, message: 'User updated successfully.' });
});

// Teacher Assignments List
router.get('/assignments', (req, res) => {
  const assignments = db.prepare(`
    SELECT ta.*, u.full_name as teacher_name, u.email as teacher_email,
           c.name as class_name, c.grade,
           s.name as subject_name, s.code as subject_code
    FROM teacher_assignments ta
    JOIN users u ON ta.teacher_id = u.id
    JOIN classes c ON ta.class_id = c.id
    LEFT JOIN subjects s ON ta.subject_id = s.id
    ORDER BY c.grade ASC, c.name ASC, ta.assignment_type ASC
  `).all();

  res.json({ assignments });
});

// Create Teacher Assignment
router.post('/assignments', (req, res) => {
  const { teacher_id, class_id, subject_id, assignment_type } = req.body;

  if (!teacher_id || !class_id || !assignment_type) {
    res.status(400).json({ error: 'teacher_id, class_id, and assignment_type are required.' });
    return;
  }

  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };

  const stmt = db.prepare(`
    INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    Number(teacher_id),
    Number(class_id),
    subject_id ? Number(subject_id) : null,
    assignment_type,
    currentYear?.id || null
  );

  // If this is a class teacher assignment, update class table's class_teacher_id
  if (assignment_type === 'class_teacher') {
    db.prepare('UPDATE classes SET class_teacher_id = ? WHERE id = ?').run(Number(teacher_id), Number(class_id));
  }

  const newAssignmentId = Number(result.lastInsertRowid);
  logAudit(req.user!.id, req.user!.username, 'ASSIGNMENT_CREATE', 'teacher_assignments', newAssignmentId, req.body, req.ip);

  res.status(201).json({ success: true, id: newAssignmentId });
});

// Delete Teacher Assignment
router.delete('/assignments/:id', (req, res) => {
  const id = Number(req.params.id);
  const assignment = db.prepare('SELECT * FROM teacher_assignments WHERE id = ?').get(id) as any;

  if (assignment && assignment.assignment_type === 'class_teacher') {
    db.prepare('UPDATE classes SET class_teacher_id = NULL WHERE id = ?').run(assignment.class_id);
  }

  db.prepare('DELETE FROM teacher_assignments WHERE id = ?').run(id);

  logAudit(req.user!.id, req.user!.username, 'ASSIGNMENT_DELETE', 'teacher_assignments', id, assignment, req.ip);

  res.json({ success: true, message: 'Assignment removed.' });
});

// Audit Logs
router.get('/audit-logs', (req, res) => {
  const { action, limit = 100 } = req.query;

  let query = 'SELECT * FROM audit_logs';
  const params: any[] = [];

  if (action) {
    query += ' WHERE action = ?';
    params.push(action);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(Number(limit));

  const logs = db.prepare(query).all(...params);
  res.json({ logs });
});

// Full System Backup Export (JSON dump)
router.get('/backup', (req, res) => {
  const tables = [
    'users', 'academic_years', 'classes', 'subjects', 'class_subjects',
    'teacher_assignments', 'students', 'enrollments', 'attendance_sessions',
    'attendance_records', 'examinations', 'marks', 'audit_logs'
  ];

  const backupData: Record<string, any[]> = {};
  for (const table of tables) {
    backupData[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }

  const exportPayload = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    institution: 'SkoolSys Management System',
    data: backupData
  };

  logAudit(req.user!.id, req.user!.username, 'BACKUP_EXPORT', 'System', null, { tablesCount: tables.length }, req.ip);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=skoolsys-backup-${Date.now()}.json`);
  res.json(exportPayload);
});

// Restore System Backup
router.post('/restore', (req, res) => {
  const { backupData } = req.body;

  if (!backupData || !backupData.data) {
    res.status(400).json({ error: 'Invalid backup file structure.' });
    return;
  }

  const { data } = backupData;

  try {
    // Clear in reverse order
    db.exec('DELETE FROM attendance_records;');
    db.exec('DELETE FROM attendance_sessions;');
    db.exec('DELETE FROM marks;');
    db.exec('DELETE FROM examinations;');
    db.exec('DELETE FROM enrollments;');
    db.exec('DELETE FROM teacher_assignments;');
    db.exec('DELETE FROM class_subjects;');
    db.exec('DELETE FROM classes;');
    db.exec('DELETE FROM subjects;');
    db.exec('DELETE FROM students;');
    db.exec('DELETE FROM users;');
    db.exec('DELETE FROM academic_years;');

    // Helper to insert rows dynamically
    function restoreTable(tableName: string, rows: any[]) {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);
      for (const row of rows) {
        stmt.run(...columns.map(c => row[c]));
      }
    }

    if (data.academic_years) restoreTable('academic_years', data.academic_years);
    if (data.users) restoreTable('users', data.users);
    if (data.classes) restoreTable('classes', data.classes);
    if (data.subjects) restoreTable('subjects', data.subjects);
    if (data.class_subjects) restoreTable('class_subjects', data.class_subjects);
    if (data.teacher_assignments) restoreTable('teacher_assignments', data.teacher_assignments);
    if (data.students) restoreTable('students', data.students);
    if (data.enrollments) restoreTable('enrollments', data.enrollments);
    if (data.examinations) restoreTable('examinations', data.examinations);
    if (data.marks) restoreTable('marks', data.marks);
    if (data.attendance_sessions) restoreTable('attendance_sessions', data.attendance_sessions);
    if (data.attendance_records) restoreTable('attendance_records', data.attendance_records);

    logAudit(req.user!.id, req.user!.username, 'BACKUP_RESTORE', 'System', null, { restoredAt: new Date().toISOString() }, req.ip);

    res.json({ success: true, message: 'Database successfully restored from backup.' });
  } catch (err: any) {
    res.status(500).json({ error: `Restore failed: ${err.message}` });
  }
});

// Re-seed Database Demo Data
router.post('/reset-seed', (req, res) => {
  try {
    runSeed();
    logAudit(req.user!.id, req.user!.username, 'DATABASE_SEED_RESET', 'System', null, {}, req.ip);
    res.json({ success: true, message: 'Database reset to default pilot state.' });
  } catch (err: any) {
    res.status(500).json({ error: `Seed reset failed: ${err.message}` });
  }
});

export default router;
