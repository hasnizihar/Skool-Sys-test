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

/**
 * Institutional Password Policy Validator
 * Enforces minimum 8 characters with both letters and numbers.
 */
export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain both letters and numbers for institutional security.' };
  }
  return { valid: true };
}

// Create User
router.post('/users', (req, res) => {
  const { username, email, password, full_name, role } = req.body;

  if (!username || !email || !password || !full_name || !role) {
    res.status(400).json({ error: 'All user fields are required.' });
    return;
  }

  // Enforce institutional password policy
  const passCheck = validatePasswordStrength(password);
  if (!passCheck.valid) {
    res.status(400).json({ error: passCheck.error });
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
    INSERT INTO users (username, email, password_hash, full_name, role, token_version)
    VALUES (?, ?, ?, ?, ?, 1)
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
  if (newPassword) {
    const passCheck = validatePasswordStrength(newPassword);
    if (!passCheck.valid) {
      res.status(400).json({ error: passCheck.error });
      return;
    }
    const salt = bcrypt.genSaltSync(10);
    passHash = bcrypt.hashSync(newPassword, salt);
  }

  // Increment token_version whenever account is modified or deactivated to invalidate existing tokens
  const update = db.prepare(`
    UPDATE users SET
      full_name = ?, email = ?, role = ?, is_active = ?, password_hash = ?,
      token_version = COALESCE(token_version, 1) + 1
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

  res.json({ success: true, message: 'User updated successfully. Existing sessions invalidated.' });
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

// Restore System Backup (CONTAINMENT GUARD: Disabled for data safety; live transactional restore scheduled for PR-006)
router.post('/restore', (req, res) => {
  logAudit(
    req.user!.id,
    req.user!.username,
    'SECURITY_CONTAINMENT_BLOCK',
    'System',
    null,
    { reason: 'Attempted invocation of disabled non-transactional restore endpoint' },
    req.ip
  );

  res.status(503).json({
    error: 'Database restore is disabled for safety during live operations. Live atomic transactional recovery is scheduled for PR-006. Restore must be performed strictly during offline maintenance with server process and all database connections shut down.',
    status: 'disabled',
    safety_notice: 'Destructive live restore is blocked to prevent database corruption. Use verified offline backup utilities under controlled maintenance.'
  });
});

// Re-seed Database Demo Data (CONTAINMENT GUARD: Disabled in standard API routes to protect school data)
router.post('/reset-seed', (req, res) => {
  logAudit(
    req.user!.id,
    req.user!.username,
    'SECURITY_CONTAINMENT_BLOCK',
    'System',
    null,
    { reason: 'Attempted invocation of disabled reset-seed endpoint' },
    req.ip
  );

  res.status(503).json({
    error: 'Database reset-seed endpoint is disabled for safety. Run migrations or seeds strictly via controlled offline CLI scripts.',
    status: 'disabled',
    safety_notice: 'Destructive database wipe is blocked to protect school data.'
  });
});

export default router;
