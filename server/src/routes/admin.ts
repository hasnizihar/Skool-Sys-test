import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { runSeed } from '../db/seed.js';
import {
  grantAcademicAuthorization,
  revokeAcademicAuthorization,
  AcademicAuthRole,
  GradeBand
} from '../services/academicAuthorizationService.js';

const router = Router();

// Require admin for all admin routes
router.use(requireAuth, requireRole(['admin']));

/**
 * Institutional Formula Injection Defense
 * Prepends single quote if field starts with formula trigger characters (=, +, -, @, \t, \r)
 */
export function sanitizeFormulaInjection(value: string | undefined | null): string {
  if (!value) return '';
  const str = String(value).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0) return [];
  
  const headerLine = lines[0].trim();
  if (!headerLine) return [];
  
  const headers = splitCsvLine(headerLine).map(h => h.toLowerCase().trim().replace(/^['"]|['"]$/g, ''));
  const rows: Array<Record<string, string>> = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim().replace(/^['"]|['"]$/g, '');
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

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

// ==========================================
// MODULE 1 & 2: TEACHER DATA MANAGEMENT & BULK IMPORT
// ==========================================

// List Teachers / Staff with Assignments
router.get(['/teachers', '/staff'], (req, res) => {
  const { search, role, status } = req.query;

  let query = `
    SELECT id, username, email, full_name, role, is_active, token_version, created_at
    FROM users
    WHERE role IN ('class_teacher', 'admin')
  `;
  const params: any[] = [];

  if (role && typeof role === 'string' && role !== 'all') {
    query += ' AND role = ?';
    params.push(role);
  }

  if (status === 'active') {
    query += ' AND is_active = 1';
  } else if (status === 'inactive') {
    query += ' AND is_active = 0';
  }

  if (search && typeof search === 'string' && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    query += ' AND (LOWER(full_name) LIKE ? OR LOWER(username) LIKE ? OR LOWER(email) LIKE ?)';
    params.push(term, term, term);
  }

  query += ' ORDER BY full_name ASC';

  const teachers = db.prepare(query).all(...params) as any[];

  // Attach assignments to each teacher
  for (const teacher of teachers) {
    // 1. Class teacher assignments
    const classAssignments = db.prepare(`
      SELECT c.id, c.name, c.grade, sec.name as section_name
      FROM classes c
      LEFT JOIN sections sec ON c.section_id = sec.id
      WHERE c.class_teacher_id = ?
      UNION
      SELECT c.id, c.name, c.grade, sec.name as section_name
      FROM teacher_assignments ta
      JOIN classes c ON ta.class_id = c.id
      LEFT JOIN sections sec ON c.section_id = sec.id
      WHERE ta.teacher_id = ? AND ta.assignment_type = 'class_teacher'
    `).all(teacher.id, teacher.id) as any[];
    teacher.assigned_classes = classAssignments;

    // 2. Section Head assignments
    const sectionAssignments = db.prepare(`
      SELECT s.id, s.name, s.grade_range
      FROM section_head_assignments sha
      JOIN sections s ON sha.section_id = s.id
      WHERE sha.user_id = ?
    `).all(teacher.id) as any[];
    teacher.assigned_sections = sectionAssignments;

    // 3. Subject assignments
    const subjectAssignments = db.prepare(`
      SELECT ta.id as assignment_id, c.id as class_id, c.name as class_name, s.id as subject_id, s.name as subject_name
      FROM teacher_assignments ta
      JOIN classes c ON ta.class_id = c.id
      JOIN subjects s ON ta.subject_id = s.id
      WHERE ta.teacher_id = ? AND ta.assignment_type = 'subject_teacher'
    `).all(teacher.id) as any[];
    teacher.assigned_subjects = subjectAssignments;
  }

  res.json({ teachers });
});

// Teacher / Staff CSV Template Download
router.get(['/teachers/template', '/staff/template'], (req, res) => {
  const csvContent = [
    'full_name,staff_id,email,role',
    '"M. I. Mohamed Rifas","T001","rifas@kcc.lk","class_teacher"',
    '"A. L. Fathima Rizna","T002","rizna@kcc.lk","class_teacher"',
    '"S. H. Ahmad Farhan","T003","farhan@kcc.lk","class_teacher"'
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kcc_teachers_template.csv"');
  res.status(200).send(csvContent);
});

// Bulk Import Teachers / Staff CSV (Preview & Commit)
router.post(['/teachers/import', '/staff/import'], (req, res) => {
  const { csvData, mode = 'preview' } = req.body;

  if (!csvData || typeof csvData !== 'string') {
    res.status(400).json({ error: 'Valid csvData text is required.' });
    return;
  }

  const rows = parseCsvRows(csvData);
  if (rows.length === 0) {
    res.status(400).json({ error: 'CSV file contains no data rows.' });
    return;
  }

  const previewRows: any[] = [];
  const seenEmails = new Set<string>();
  const seenUsernames = new Set<string>();

  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    const fullNameRaw = row.full_name || row.name || '';
    const emailRaw = row.email || '';
    const staffIdRaw = row.staff_id || row.username || row.id || '';
    const roleRaw = row.role || 'class_teacher';

    const fullName = sanitizeFormulaInjection(fullNameRaw);
    const email = sanitizeFormulaInjection(emailRaw).toLowerCase().trim();
    let username = sanitizeFormulaInjection(staffIdRaw).toLowerCase().trim();

    // If username is empty, derive from email prefix
    if (!username && email) {
      username = email.split('@')[0];
    }

    // Validation
    if (!fullName) {
      invalidCount++;
      previewRows.push({
        rowNumber: rowNum,
        full_name: fullNameRaw,
        username,
        email,
        role: roleRaw,
        status: 'invalid',
        error: 'Full name is required'
      });
      continue;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalidCount++;
      previewRows.push({
        rowNumber: rowNum,
        full_name: fullName,
        username,
        email: emailRaw,
        role: roleRaw,
        status: 'invalid',
        error: 'Valid email address is required'
      });
      continue;
    }

    const validRoles = ['class_teacher', 'admin'];
    const normalizedRole = roleRaw === 'subject_teacher' ? 'class_teacher' : roleRaw;
    const role = validRoles.includes(normalizedRole) ? normalizedRole : 'class_teacher';

    // Duplicate detection in file
    if (seenEmails.has(email) || seenUsernames.has(username)) {
      duplicateCount++;
      previewRows.push({
        rowNumber: rowNum,
        full_name: fullName,
        username,
        email,
        role,
        status: 'duplicate',
        error: 'Duplicate record in CSV file'
      });
      continue;
    }

    // Duplicate detection in DB
    const existingDb = db.prepare('SELECT id, full_name, username, email FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?').get(email, username) as any;
    if (existingDb) {
      duplicateCount++;
      previewRows.push({
        rowNumber: rowNum,
        full_name: fullName,
        username,
        email,
        role,
        status: 'duplicate',
        error: `Already exists in database (${existingDb.full_name})`
      });
      continue;
    }

    // Mark as seen
    seenEmails.add(email);
    seenUsernames.add(username);
    validCount++;

    previewRows.push({
      rowNumber: rowNum,
      full_name: fullName,
      username,
      email,
      role,
      status: 'valid'
    });
  }

  if (mode === 'preview') {
    res.json({
      totalRows: rows.length,
      validCount,
      duplicateCount,
      invalidCount,
      preview: previewRows
    });
    return;
  }

  // Commit Mode
  const eligibleRows = previewRows.filter(r => r.status === 'valid');
  if (eligibleRows.length === 0) {
    res.status(400).json({ error: 'No valid, non-duplicate rows found to import.' });
    return;
  }

  try {
    db.exec('BEGIN IMMEDIATE;');

    const insertStmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role, is_active, token_version)
      VALUES (?, ?, ?, ?, ?, 0, 1)
    `);

    let importedCount = 0;
    for (const r of eligibleRows) {
      const placeholderHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
      insertStmt.run(r.username, r.email, placeholderHash, r.full_name, r.role);
      importedCount++;
    }

    db.exec('COMMIT;');

    logAudit(req.user!.id, req.user!.username, 'TEACHER_BULK_IMPORT', 'users', null, {
      importedCount,
      skippedDuplicates: duplicateCount,
      invalidRows: invalidCount,
      totalRows: rows.length
    }, req.ip);

    res.json({
      success: true,
      importedCount,
      duplicateCount,
      invalidCount,
      message: `Successfully imported ${importedCount} teacher(s) as inactive accounts pending activation.`
    });
  } catch (err: any) {
    try { db.exec('ROLLBACK;'); } catch {}
    res.status(500).json({ error: err.message || 'Failed to complete teacher import transaction.' });
  }
});

// Get Single Teacher / Staff by ID
router.get(['/teachers/:id', '/staff/:id'], (req, res) => {
  const teacherId = Number(req.params.id);
  const teacher = db.prepare(`
    SELECT id, username, email, full_name, role, is_active, token_version, created_at
    FROM users
    WHERE id = ? AND role IN ('class_teacher', 'admin')
  `).get(teacherId) as any;

  if (!teacher) {
    res.status(404).json({ error: 'Teacher not found.' });
    return;
  }

  // Attached assignments
  teacher.assigned_classes = db.prepare(`
    SELECT c.id, c.name, c.grade, sec.name as section_name
    FROM classes c
    LEFT JOIN sections sec ON c.section_id = sec.id
    WHERE c.class_teacher_id = ?
    UNION
    SELECT c.id, c.name, c.grade, sec.name as section_name
    FROM teacher_assignments ta
    JOIN classes c ON ta.class_id = c.id
    LEFT JOIN sections sec ON c.section_id = sec.id
    WHERE ta.teacher_id = ? AND ta.assignment_type = 'class_teacher'
  `).all(teacher.id, teacher.id);

  teacher.assigned_sections = db.prepare(`
    SELECT s.id, s.name, s.grade_range
    FROM section_head_assignments sha
    JOIN sections s ON sha.section_id = s.id
    WHERE sha.user_id = ?
  `).all(teacher.id);

  res.json({ teacher });
});

// Create Teacher / Staff Member
router.post(['/teachers', '/staff'], (req, res) => {
  const { full_name, username, email, role, password, is_active } = req.body;

  if (!full_name || !username || !email) {
    res.status(400).json({ error: 'full_name, username, and email are required.' });
    return;
  }

  const normalizedRole = role === 'subject_teacher' ? 'class_teacher' : (role || 'class_teacher');
  const validRoles = ['class_teacher', 'admin'];
  if (!validRoles.includes(normalizedRole)) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    return;
  }

  const cleanFullName = sanitizeFormulaInjection(full_name);
  const cleanUsername = sanitizeFormulaInjection(username).toLowerCase().trim();
  const cleanEmail = sanitizeFormulaInjection(email).toLowerCase().trim();

  // Check unique username and email
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?').get(cleanUsername, cleanEmail);
  if (existing) {
    res.status(400).json({ error: 'Teacher with this username or email already exists.' });
    return;
  }

  let passHash: string;
  let activeStatus = is_active !== undefined ? (is_active ? 1 : 0) : 1;

  if (password) {
    const passCheck = validatePasswordStrength(password);
    if (!passCheck.valid) {
      res.status(400).json({ error: passCheck.error });
      return;
    }
    passHash = bcrypt.hashSync(password, 10);
  } else {
    // If no password provided, user is pending activation
    activeStatus = 0;
    passHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
  }

  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role, is_active, token_version)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const result = stmt.run(cleanUsername, cleanEmail, passHash, cleanFullName, role, activeStatus);
  const newTeacherId = Number(result.lastInsertRowid);

  logAudit(req.user!.id, req.user!.username, 'TEACHER_CREATE', 'users', newTeacherId, {
    username: cleanUsername,
    full_name: cleanFullName,
    role,
    is_active: activeStatus
  }, req.ip);

  res.status(201).json({
    success: true,
    teacher: {
      id: newTeacherId,
      username: cleanUsername,
      email: cleanEmail,
      full_name: cleanFullName,
      role,
      is_active: activeStatus
    }
  });
});

// Update Teacher / Staff
router.put(['/teachers/:id', '/staff/:id'], (req, res) => {
  const teacherId = Number(req.params.id);
  const { full_name, email, role, is_active, newPassword } = req.body;

  const current = db.prepare(`
    SELECT * FROM users
    WHERE id = ? AND role IN ('class_teacher', 'admin')
  `).get(teacherId) as any;

  if (!current) {
    res.status(404).json({ error: 'Teacher not found.' });
    return;
  }

  const rawRole = role || current.role;
  const updatedRole = rawRole === 'subject_teacher' ? 'class_teacher' : rawRole;
  const validRoles = ['class_teacher', 'admin'];
  if (!validRoles.includes(updatedRole)) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    return;
  }

  let passHash = current.password_hash;
  if (newPassword) {
    const passCheck = validatePasswordStrength(newPassword);
    if (!passCheck.valid) {
      res.status(400).json({ error: passCheck.error });
      return;
    }
    passHash = bcrypt.hashSync(newPassword, 10);
  }

  const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : current.is_active;
  const updatedFullName = full_name ? sanitizeFormulaInjection(full_name) : current.full_name;
  const updatedEmail = email ? sanitizeFormulaInjection(email).toLowerCase().trim() : current.email;

  // Check unique email if changed
  if (updatedEmail !== current.email) {
    const emailConflict = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(updatedEmail, teacherId);
    if (emailConflict) {
      res.status(400).json({ error: 'Email already in use by another user.' });
      return;
    }
  }

  // Invalidate tokens if role or status changed
  const updateStmt = db.prepare(`
    UPDATE users SET
      full_name = ?, email = ?, role = ?, is_active = ?, password_hash = ?,
      token_version = COALESCE(token_version, 1) + 1
    WHERE id = ?
  `);

  updateStmt.run(updatedFullName, updatedEmail, updatedRole, updatedActive, passHash, teacherId);

  logAudit(req.user!.id, req.user!.username, 'TEACHER_UPDATE', 'users', teacherId, {
    role: updatedRole,
    is_active: updatedActive,
    passwordReset: !!newPassword
  }, req.ip);

  res.json({
    success: true,
    message: 'Teacher record updated successfully.',
    teacher: {
      id: teacherId,
      full_name: updatedFullName,
      email: updatedEmail,
      role: updatedRole,
      is_active: updatedActive
    }
  });
});

// Deactivate Teacher / Staff (Soft Delete)
router.delete(['/teachers/:id', '/staff/:id'], (req, res) => {
  const teacherId = Number(req.params.id);
  const teacher = db.prepare('SELECT id, full_name, username, role FROM users WHERE id = ?').get(teacherId) as any;
  if (!teacher) {
    res.status(404).json({ error: 'Teacher not found.' });
    return;
  }

  // Deactivate teacher and invalidate active sessions
  db.prepare(`
    UPDATE users SET is_active = 0, token_version = COALESCE(token_version, 1) + 1
    WHERE id = ?
  `).run(teacherId);

  logAudit(req.user!.id, req.user!.username, 'TEACHER_DEACTIVATE', 'users', teacherId, {
    teacherName: teacher.full_name,
    username: teacher.username
  }, req.ip);

  res.json({ success: true, message: `Teacher "${teacher.full_name}" deactivated.` });
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

// List Academic Staff Authorizations
router.get('/academic-authorizations', (req, res) => {
  const { user_id, academic_year_id, is_active } = req.query;

  let query = `
    SELECT asa.*, u.full_name as user_full_name, u.email as user_email, u.role as system_role,
           ay.name as academic_year_name,
           granter.full_name as granter_name,
           revoker.full_name as revoker_name
    FROM academic_staff_authorizations asa
    JOIN users u ON asa.user_id = u.id
    JOIN academic_years ay ON asa.academic_year_id = ay.id
    JOIN users granter ON asa.granted_by_user_id = granter.id
    LEFT JOIN users revoker ON asa.revoked_by_user_id = revoker.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (user_id) {
    query += ' AND asa.user_id = ?';
    params.push(Number(user_id));
  }
  if (academic_year_id) {
    query += ' AND asa.academic_year_id = ?';
    params.push(Number(academic_year_id));
  }
  if (is_active !== undefined) {
    query += ' AND asa.is_active = ?';
    params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
  }

  query += ' ORDER BY asa.id DESC';
  const authorizations = db.prepare(query).all(...params);
  res.json({ authorizations });
});

// Grant Academic Staff Authorization
router.post('/academic-authorizations', (req, res) => {
  const { user_id, academic_year_id, auth_role, grade_band } = req.body;

  if (!user_id || !academic_year_id || !auth_role || !grade_band) {
    res.status(400).json({ error: 'user_id, academic_year_id, auth_role, and grade_band are required.' });
    return;
  }

  const validRoles: AcademicAuthRole[] = ['principal', 'vice_principal_academic', 'section_head'];
  if (!validRoles.includes(auth_role)) {
    res.status(400).json({ error: `Invalid auth_role '${auth_role}'. Must be one of: ${validRoles.join(', ')}.` });
    return;
  }

  const validBands: GradeBand[] = ['junior_6_9', 'ol_10_11', 'al_12_13', 'all'];
  if (!validBands.includes(grade_band)) {
    res.status(400).json({ error: `Invalid grade_band '${grade_band}'. Must be one of: ${validBands.join(', ')}.` });
    return;
  }

  try {
    const result = grantAcademicAuthorization({
      userId: Number(user_id),
      academicYearId: Number(academic_year_id),
      authRole: auth_role as AcademicAuthRole,
      gradeBand: grade_band as GradeBand,
      grantedByUserId: req.user!.id
    });

    logAudit(
      req.user!.id,
      req.user!.username,
      'ACADEMIC_AUTHORIZATION_GRANT',
      'academic_staff_authorizations',
      result.id,
      { user_id, academic_year_id, auth_role, grade_band },
      req.ip
    );

    res.status(201).json({ success: true, id: result.id });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to grant academic authorization.' });
  }
});

// Revoke Academic Staff Authorization
router.post('/academic-authorizations/:id/revoke', (req, res) => {
  const authorizationId = Number(req.params.id);
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    res.status(400).json({ error: 'A mandatory revocation reason must be provided.' });
    return;
  }

  try {
    revokeAcademicAuthorization({
      authorizationId,
      revokedByUserId: req.user!.id,
      reason: reason.trim()
    });

    logAudit(
      req.user!.id,
      req.user!.username,
      'ACADEMIC_AUTHORIZATION_REVOKE',
      'academic_staff_authorizations',
      authorizationId,
      { reason: reason.trim() },
      req.ip
    );

    res.json({ success: true, message: 'Academic authorization revoked successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to revoke academic authorization.' });
  }
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
    'attendance_records', 'audit_logs', 'sections', 'section_heads',
    'school_periods', 'classroom_period_statuses', 'classroom_status_settings'
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
