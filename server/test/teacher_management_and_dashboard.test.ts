import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { db } from '../src/db/database.js';
import { sanitizeFormulaInjection } from '../src/routes/admin.js';

describe('Phase 4: Teacher Management, Bulk Import, Role Management & Dashboard Integration', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;
  let adminToken: string;
  let teacherToken: string;
  let sectionHeadToken: string;
  let sectionHeadUserId: number;
  let sectionId: number;
  let classAId: number;
  let classBId: number;

  before(async () => {
    fixtures = setupIsolatedTestDb();
    process.env.DB_PATH = fixtures.dbPath;
    process.env.NODE_ENV = 'test';
    server = await startTestServer();

    classAId = fixtures.testClassA.id;
    classBId = fixtures.testClassB.id;

    // 1. Authenticate Admin
    const adminLoginRes = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.adminUser.username,
        password: fixtures.adminUser.password
      })
    });
    assert.equal(adminLoginRes.status, 200, 'Admin login must succeed');
    const adminData = await adminLoginRes.json();
    adminToken = adminData.token;

    // 2. Authenticate Class Teacher
    const teacherLoginRes = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.classTeacher.username,
        password: fixtures.classTeacher.password
      })
    });
    assert.equal(teacherLoginRes.status, 200, 'Teacher login must succeed');
    const teacherData = await teacherLoginRes.json();
    teacherToken = teacherData.token;

    // 3. Create a Section Head user for testing
    const salt = bcrypt.genSaltSync(10);
    const passHash = bcrypt.hashSync('SectionHead123', salt);
    const shRes = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role, is_active, token_version)
      VALUES ('section_head_user', 'head@kcc.lk', ?, 'Section Head Senior', 'class_teacher', 1, 1)
    `).run(passHash);
    sectionHeadUserId = Number(shRes.lastInsertRowid);

    // Create a Section
    const secRes = db.prepare(`
      INSERT INTO sections (name, description, grade_range)
      VALUES ('Senior Secondary', 'Grades 10 and 11', 'Grades 10–11')
    `).run();
    sectionId = Number(secRes.lastInsertRowid);

    // Assign Section to Class A
    db.prepare('UPDATE classes SET section_id = ? WHERE id = ?').run(sectionId, classAId);

    // Assign sectionHeadUserId as Section Head for sectionId
    db.prepare(`
      INSERT INTO section_head_assignments (section_id, user_id)
      VALUES (?, ?)
    `).run(sectionId, sectionHeadUserId);

    // Assign sectionHeadUserId also as Class Teacher for Class A (Dual-Role!)
    db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, assignment_type, academic_year_id)
      VALUES (?, ?, 'class_teacher', 1)
    `).run(sectionHeadUserId, classAId);

    // Authenticate Section Head
    const shLoginRes = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'section_head_user',
        password: 'SectionHead123'
      })
    });
    assert.equal(shLoginRes.status, 200, 'Section Head login must succeed');
    const shData = await shLoginRes.json();
    sectionHeadToken = shData.token;
  });

  after(async () => {
    if (server) await server.close();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  // ==========================================
  // MODULE 1: TEACHER DATA MANAGEMENT
  // ==========================================

  it('1. Principal can list teachers with assigned classes and sections', async () => {
    const res = await server.request('/api/admin/teachers', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.teachers), 'Should return teachers array');
    assert.ok(data.teachers.length >= 2, 'Should have multiple teachers');

    const shTeacher = data.teachers.find((t: any) => t.id === sectionHeadUserId);
    assert.ok(shTeacher, 'Section Head teacher should be listed');
    assert.ok(shTeacher.assigned_sections.some((s: any) => s.id === sectionId), 'Should list assigned section');
    assert.ok(shTeacher.assigned_classes.some((c: any) => c.id === classAId), 'Should list assigned class');
  });

  it('2. Principal can view single teacher details by ID', async () => {
    const res = await server.request(`/api/admin/teachers/${sectionHeadUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.teacher.id, sectionHeadUserId);
    assert.equal(data.teacher.full_name, 'Section Head Senior');
    assert.ok(Array.isArray(data.teacher.assigned_sections));
    assert.ok(Array.isArray(data.teacher.assigned_classes));
  });

  it('3. Principal can create a new teacher with validation', async () => {
    const newTeacherPayload = {
      full_name: 'M. S. Mohamed Fahim',
      username: 'fahim_teacher',
      email: 'fahim@kcc.lk',
      role: 'class_teacher',
      password: 'TeacherPassword123',
      is_active: 1
    };

    const res = await server.request('/api/admin/teachers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newTeacherPayload)
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.success);
    assert.equal(data.teacher.username, 'fahim_teacher');
    assert.equal(data.teacher.email, 'fahim@kcc.lk');
    assert.equal(data.teacher.role, 'class_teacher');

    // Verify audit log
    const auditRow = db.prepare(`
      SELECT * FROM audit_logs WHERE action = 'TEACHER_CREATE' AND entity_id = ?
    `).get(String(data.teacher.id)) as any;
    assert.ok(auditRow, 'Should create TEACHER_CREATE audit event');
  });

  it('4. Rejects duplicate username or email on teacher creation', async () => {
    const duplicatePayload = {
      full_name: 'Duplicate Teacher',
      username: 'fahim_teacher', // already created above
      email: 'fahim_unique@kcc.lk',
      role: 'class_teacher',
      password: 'TeacherPassword123'
    };

    const res = await server.request('/api/admin/teachers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(duplicatePayload)
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /already exists/i);
  });

  it('5. Principal can update teacher record and invalidate sessions via token_version', async () => {
    const teacher = db.prepare("SELECT * FROM users WHERE username = 'fahim_teacher'").get() as any;
    const initialVersion = teacher.token_version || 1;

    const res = await server.request(`/api/admin/teachers/${teacher.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        full_name: 'M. S. Mohamed Fahim (Senior)',
        email: 'fahim_updated@kcc.lk',
        role: 'subject_teacher',
        is_active: 1
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.success);
    assert.equal(data.teacher.full_name, 'M. S. Mohamed Fahim (Senior)');

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(teacher.id) as any;
    assert.equal(updatedUser.token_version, initialVersion + 1, 'token_version should increment');
  });

  it('6. Principal can soft-delete / deactivate teacher', async () => {
    const teacher = db.prepare("SELECT * FROM users WHERE username = 'fahim_teacher'").get() as any;

    const res = await server.request(`/api/admin/teachers/${teacher.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    const updated = db.prepare('SELECT is_active FROM users WHERE id = ?').get(teacher.id) as any;
    assert.equal(updated.is_active, 0, 'Teacher should be deactivated');
  });

  it('7. Non-admin users cannot access teacher administration routes (403 Forbidden)', async () => {
    const res = await server.request('/api/admin/teachers', {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert.equal(res.status, 403, 'Class teacher must be denied access to admin teacher routes');
  });

  // ==========================================
  // MODULE 2: TEACHER CSV BULK IMPORT
  // ==========================================

  it('8. Template download returns formula-safe CSV with proper headers', async () => {
    const res = await server.request('/api/admin/teachers/template', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType?.includes('text/csv'), 'Content-Type must be text/csv');
    const text = await res.text();
    assert.ok(text.includes('full_name,staff_id,email,role'), 'Must contain required header row');
  });

  it('9. Formula injection defense sanitizes trigger characters', () => {
    assert.equal(sanitizeFormulaInjection('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.equal(sanitizeFormulaInjection('+cmd|'), "'+cmd|");
    assert.equal(sanitizeFormulaInjection('-123'), "'-123");
    assert.equal(sanitizeFormulaInjection('@malicious'), "'@malicious");
    assert.equal(sanitizeFormulaInjection('Safe Name'), 'Safe Name');
  });

  it('10. CSV import in preview mode detects valid rows, duplicates, and invalid records', async () => {
    const csvContent = [
      'full_name,staff_id,email,role',
      '"K. L. Fathima Nasreen","T101","nasreen@kcc.lk","class_teacher"',
      '"A. M. Abdul Rauf","T102","rauf@kcc.lk","subject_teacher"',
      '"Duplicate in file","T101","nasreen@kcc.lk","class_teacher"', // Duplicate in file
      '"Existing DB user","synth_admin","synth_admin@test.local","admin"', // Duplicate against DB
      '"","T103","missingname@kcc.lk","class_teacher"', // Invalid (empty name)
      '"Invalid Email User","T104","not-an-email","class_teacher"' // Invalid email
    ].join('\r\n');

    const res = await server.request('/api/admin/teachers/import', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        csvData: csvContent,
        mode: 'preview'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalRows, 6);
    assert.equal(data.validCount, 2, 'Should identify 2 valid rows');
    assert.equal(data.duplicateCount, 2, 'Should identify 2 duplicate rows');
    assert.equal(data.invalidCount, 2, 'Should identify 2 invalid rows');
  });

  it('11. CSV import in commit mode saves eligible records as inactive (is_active = 0) with secure placeholder hash', async () => {
    const csvContent = [
      'full_name,staff_id,email,role',
      '"K. L. Fathima Nasreen","T101","nasreen@kcc.lk","class_teacher"',
      '"A. M. Abdul Rauf","T102","rauf@kcc.lk","subject_teacher"'
    ].join('\r\n');

    const res = await server.request('/api/admin/teachers/import', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        csvData: csvContent,
        mode: 'commit'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.success);
    assert.equal(data.importedCount, 2);

    // Verify in database: is_active must be 0
    const nasreen = db.prepare("SELECT * FROM users WHERE email = 'nasreen@kcc.lk'").get() as any;
    assert.ok(nasreen, 'Imported teacher must exist in DB');
    assert.equal(nasreen.is_active, 0, 'Imported teacher must be inactive by default');
    assert.ok(nasreen.password_hash.startsWith('$2'), 'Must have secure bcrypt placeholder hash');

    // Verify audit log
    const audit = db.prepare("SELECT * FROM audit_logs WHERE action = 'TEACHER_BULK_IMPORT'").get() as any;
    assert.ok(audit, 'Must create TEACHER_BULK_IMPORT audit log');
  });

  it('12. Inactive imported teacher cannot log in (returns 401)', async () => {
    const loginRes = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 't101',
        password: 'AnyPassword'
      })
    });

    assert.equal(loginRes.status, 401, 'Inactive imported teacher must be rejected');
  });

  // ==========================================
  // MODULE 3: ROLES & MULTI-ASSIGNMENT MANAGEMENT
  // ==========================================

  it('13. Principal can assign multiple Section Heads to a single section', async () => {
    // Create second teacher
    const teacher2 = db.prepare("SELECT id FROM users WHERE email = 'nasreen@kcc.lk'").get() as any;

    const res = await server.request(`/api/academic/sections/${sectionId}/heads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId: teacher2.id })
    });

    assert.equal(res.status, 200);
    const heads = db.prepare('SELECT user_id FROM section_head_assignments WHERE section_id = ?').all(sectionId);
    assert.equal(heads.length, 2, 'Section should have 2 assigned section heads');
  });

  it('14. Principal can assign multiple class teachers to a single class', async () => {
    const teacher2 = db.prepare("SELECT id FROM users WHERE email = 'nasreen@kcc.lk'").get() as any;

    const res = await server.request(`/api/academic/classes/${classAId}/teachers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ teacherId: teacher2.id })
    });

    assert.equal(res.status, 200);
    const classTeachers = db.prepare(`
      SELECT teacher_id FROM teacher_assignments
      WHERE class_id = ? AND assignment_type = 'class_teacher'
    `).all(classAId);
    assert.ok(classTeachers.length >= 2, 'Class should have multiple class teachers');
  });

  it('15. Reassigning or removing teacher assignments does NOT delete historical attendance', async () => {
    const today = '2026-11-21';

    // 1. Create historical attendance session marked by sectionHeadUserId
    const sessionRes = db.prepare(`
      INSERT INTO attendance_sessions (class_id, date, academic_year_id, taken_by_user_id, status)
      VALUES (?, ?, 1, ?, 'submitted')
    `).run(classAId, today, sectionHeadUserId);
    const sessionId = Number(sessionRes.lastInsertRowid);

    // 2. Add attendance records
    db.prepare(`
      INSERT INTO attendance_records (session_id, student_id, status)
      VALUES (?, ?, 'present')
    `).run(sessionId, fixtures.studentA.id);

    // 3. Remove sectionHeadUserId as Class Teacher from Class A
    const removeRes = await server.request(`/api/academic/classes/${classAId}/teachers/${sectionHeadUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(removeRes.status, 200);

    // 4. Verify historical attendance session and records remain completely intact
    const sessionAfter = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(sessionId) as any;
    assert.ok(sessionAfter, 'Historical attendance session must survive assignment removal');
    assert.equal(sessionAfter.taken_by_user_id, sectionHeadUserId, 'Historical marked_by reference preserved');

    const recordsAfter = db.prepare('SELECT * FROM attendance_records WHERE session_id = ?').all(sessionId);
    assert.equal(recordsAfter.length, 1, 'Historical attendance records must remain intact');
  });

  // ==========================================
  // MODULE 4: DASHBOARD INTEGRATION
  // ==========================================

  it('16. Principal sees accurate school-wide attendance statistics and section breakdown', async () => {
    const today = '2026-11-21';

    const res = await server.request(`/api/academic/dashboard-summary?date=${today}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.role, 'admin');
    assert.equal(data.is_section_head, false);
    assert.ok(data.stats, 'Should contain stats object');
    assert.ok(typeof data.stats.totalStudents === 'number');
    assert.ok(data.stats.presentCount >= 1, 'Present count should reflect historical record');
    assert.ok(data.stats.submittedClassesCount >= 1, 'Submitted classes count must reflect session');
    assert.ok(Array.isArray(data.sections), 'Should return sections list');
    assert.ok(Array.isArray(data.recentLogs), 'Should return recent audit logs');

    // Verify section breakdown contains our section
    const sec = data.sections.find((s: any) => s.id === sectionId);
    assert.ok(sec, 'Section should be present in section breakdown');
    assert.equal(sec.submitted_classes, 1, 'Section submitted classes should be 1');
  });

  it('17. Section Head dashboard is scoped strictly to assigned sections (backend enforced)', async () => {
    const today = '2026-11-21';

    const res = await server.request(`/api/academic/dashboard-summary?date=${today}`, {
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.is_section_head, true, 'User should be recognized as Section Head');
    assert.ok(Array.isArray(data.sections), 'Should return sections');
    assert.equal(data.sections.length, 1, 'Section head should only see their 1 assigned section');
    assert.equal(data.sections[0].id, sectionId);

    // Scoped statistics must match only their assigned section's classes
    assert.equal(data.stats.totalClasses, data.sections[0].classes_count);
  });

  it('18. Dual-role Section Head receives homeroom class with roll-call submission status', async () => {
    // Re-assign Section Head as Class Teacher for Class B (which has no attendance yet)
    db.prepare(`
      INSERT OR IGNORE INTO teacher_assignments (teacher_id, class_id, assignment_type, academic_year_id)
      VALUES (?, ?, 'class_teacher', 1)
    `).run(sectionHeadUserId, classBId);

    const today = '2026-11-21';
    const res = await server.request(`/api/academic/dashboard-summary?date=${today}`, {
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.homeroom_classes), 'Should return homeroom_classes');
    const hr = data.homeroom_classes.find((c: any) => c.id === classBId);
    assert.ok(hr, 'Class B should appear in homeroom_classes for dual-role teacher');
    assert.equal(hr.is_submitted, false, 'Class B attendance should be unsubmitted');
  });
});
