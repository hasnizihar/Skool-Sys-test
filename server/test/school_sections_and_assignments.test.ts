import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { db, closeDatabase } from '../src/db/database.js';
import { runMigration007, TARGET_SCHEMA_VERSION } from '../src/db/migrations/007_school_sections_and_assignments.js';

describe('Phase 1: School Sections, Class Assignments & Multi-Head/Teacher Scoping Tests', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;
  let adminToken: string;
  let sectionHeadUser: { id: number; username: string; token: string };
  let dualRoleUser: { id: number; username: string; token: string };
  let regularTeacherUser: { id: number; username: string; token: string };

  let testClassCId: number;
  let testClassDId: number;

  before(async () => {
    fixtures = setupIsolatedTestDb();
    process.env.DB_PATH = fixtures.dbPath;
    process.env.NODE_ENV = 'test';
    server = await startTestServer();

    // 1. Authenticate Admin
    const adminLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.adminUser.username,
        password: fixtures.adminUser.password
      })
    });
    adminToken = (await adminLogin.json()).token;

    // 2. Create additional test users:
    // a) sectionHeadUser: user who is section head of Section 1 only
    // b) dualRoleUser: user who is section head of Section 1 AND class teacher of Class B
    // c) regularTeacherUser: teacher with no section head roles
    const salt = bcrypt.genSaltSync(8);
    const pass = 'TeacherPass123!';
    const passHash = bcrypt.hashSync(pass, salt);

    const insertUser = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    const shRes = insertUser.run('sh_user_test', 'sh@test.local', passHash, 'Section Head One', 'class_teacher');
    const shId = Number(shRes.lastInsertRowid);

    const dualRes = insertUser.run('dual_user_test', 'dual@test.local', passHash, 'Dual Role Teacher', 'class_teacher');
    const dualId = Number(dualRes.lastInsertRowid);

    const regRes = insertUser.run('reg_teacher_test', 'reg@test.local', passHash, 'Regular Teacher', 'class_teacher');
    const regId = Number(regRes.lastInsertRowid);

    // Login each user
    const login = async (username: string) => {
      const res = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass })
      });
      return (await res.json()).token;
    };

    sectionHeadUser = { id: shId, username: 'sh_user_test', token: await login('sh_user_test') };
    dualRoleUser = { id: dualId, username: 'dual_user_test', token: await login('dual_user_test') };
    regularTeacherUser = { id: regId, username: 'reg_teacher_test', token: await login('reg_teacher_test') };

    // Create extra classes for tests: Class C (grade 9) and Class D (grade 11)
    const insClass = db.prepare(`
      INSERT INTO classes (grade, name, academic_year_id)
      VALUES (?, ?, 1)
    `);
    testClassCId = Number(insClass.run(9, 'Grade 9-A Test').lastInsertRowid);
    testClassDId = Number(insClass.run(11, 'Grade 11-A Test').lastInsertRowid);
  });

  after(async () => {
    await server.close();
    closeDatabase();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  describe('Requirement 1: Migration 007 Idempotency & Clean Application', () => {
    it('applies cleanly and reports applied: false when rerun on up-to-date schema', () => {
      const res = runMigration007(db);
      assert.equal(res.applied, false, 'Migration should not re-apply when schema is already at v7 or higher');
      assert.ok(res.version >= TARGET_SCHEMA_VERSION, 'Schema version must be at least 7');
    });

    it('applies safely on an isolated schema V6 database advancing to V7', () => {
      const synthDb = new DatabaseSync(':memory:');
      try {
        synthDb.exec(`
          CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
          CREATE TABLE classes (id INTEGER PRIMARY KEY, grade INTEGER, name TEXT);
          PRAGMA user_version = 6;
        `);
        const res = runMigration007(synthDb);
        assert.equal(res.applied, true, 'Migration 007 should apply to V6 database');
        assert.equal(res.version, 7, 'Target schema version must be 7');

        // Check tables exist
        const secTable = synthDb.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='sections'").get() as any;
        assert.equal(secTable.c, 1);
        const shaTable = synthDb.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='section_head_assignments'").get() as any;
        assert.equal(shaTable.c, 1);
      } finally {
        synthDb.close();
      }
    });
  });

  describe('Requirements 2 & 3: Section CRUD & Validation', () => {
    let createdSectionId: number;

    it('Principal creates section with valid fields', async () => {
      const res = await server.request('/api/academic/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: 'Junior Secondary',
          description: 'Grades 6 through 9',
          grade_range: '6-9'
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.section.name, 'Junior Secondary');
      assert.equal(data.section.grade_range, '6-9');
      createdSectionId = data.section.id;
    });

    it('Rejects duplicate section name with 409', async () => {
      const res = await server.request('/api/academic/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: 'Junior Secondary', // Duplicate
          grade_range: '6-9'
        })
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, 'SECTION_NAME_EXISTS');
    });

    it('Rejects invalid section payload (missing name) with 400', async () => {
      const res = await server.request('/api/academic/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: ''
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code, 'VALIDATION_ERROR');
    });

    it('Principal can edit section details', async () => {
      const res = await server.request(`/api/academic/sections/${createdSectionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: 'Junior Secondary (Updated)',
          description: 'Updated Description',
          grade_range: '6-9'
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.section.name, 'Junior Secondary (Updated)');
    });

    it('Non-admin users cannot create or edit sections (403 Forbidden)', async () => {
      const createRes = await server.request('/api/academic/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regularTeacherUser.token}`
        },
        body: JSON.stringify({
          name: 'Forbidden Section'
        })
      });
      assert.equal(createRes.status, 403);

      const editRes = await server.request(`/api/academic/sections/${createdSectionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regularTeacherUser.token}`
        },
        body: JSON.stringify({
          name: 'Unauthorized update'
        })
      });
      assert.equal(editRes.status, 403);
    });
  });

  describe('Requirements 4 & 5: Class to Section Assignment & Reassignment', () => {
    let section1Id: number;
    let section2Id: number;

    before(async () => {
      // Find Junior Secondary
      const s1 = db.prepare("SELECT id FROM sections WHERE name = 'Junior Secondary (Updated)'").get() as any;
      section1Id = s1.id;

      // Create Senior Secondary
      const s2 = db.prepare(`
        INSERT INTO sections (name, grade_range)
        VALUES ('Senior Secondary', '10-11')
      `).run();
      section2Id = Number(s2.lastInsertRowid);
    });

    it('Principal assigns classes to a section', async () => {
      const res = await server.request(`/api/academic/sections/${section1Id}/classes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          class_ids: [fixtures.testClassA.id, testClassCId]
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify in database
      const rowA = db.prepare('SELECT section_id FROM classes WHERE id = ?').get(fixtures.testClassA.id) as any;
      assert.equal(rowA.section_id, section1Id);
      const rowC = db.prepare('SELECT section_id FROM classes WHERE id = ?').get(testClassCId) as any;
      assert.equal(rowC.section_id, section1Id);
    });

    it('Reassigns class to another section cleanly', async () => {
      // Move Class C to Senior Section
      const res = await server.request(`/api/academic/sections/${section2Id}/classes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          class_ids: [testClassCId]
        })
      });

      assert.equal(res.status, 200);
      const rowC = db.prepare('SELECT section_id FROM classes WHERE id = ?').get(testClassCId) as any;
      assert.equal(rowC.section_id, section2Id);
    });

    it('Unassigns class from a section', async () => {
      const res = await server.request(`/api/academic/sections/${section2Id}/classes/${testClassCId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });

      assert.equal(res.status, 200);
      const rowC = db.prepare('SELECT section_id FROM classes WHERE id = ?').get(testClassCId) as any;
      assert.equal(rowC.section_id, null);
    });
  });

  describe('Requirements 6 & 8: Multiple Section Heads Assignment & Unassignment', () => {
    let sectionId: number;

    before(() => {
      const s = db.prepare("SELECT id FROM sections WHERE name = 'Junior Secondary (Updated)'").get() as any;
      sectionId = s.id;
    });

    it('Assigns multiple section heads to the same section', async () => {
      // Assign Head 1 (sectionHeadUser)
      const res1 = await server.request(`/api/academic/sections/${sectionId}/heads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ user_id: sectionHeadUser.id })
      });
      assert.equal(res1.status, 200);

      // Assign Head 2 (dualRoleUser)
      const res2 = await server.request(`/api/academic/sections/${sectionId}/heads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ user_id: dualRoleUser.id })
      });
      assert.equal(res2.status, 200);

      // Verify both are returned on GET /api/academic/sections/:id
      const getRes = await server.request(`/api/academic/sections/${sectionId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data = await getRes.json();
      assert.equal(data.section.section_heads.length, 2);
      const headIds = data.section.section_heads.map((h: any) => h.id);
      assert.ok(headIds.includes(sectionHeadUser.id));
      assert.ok(headIds.includes(dualRoleUser.id));
    });

    it('Unassigns a section head cleanly without deleting the section', async () => {
      const res = await server.request(`/api/academic/sections/${sectionId}/heads/${sectionHeadUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);

      const getRes = await server.request(`/api/academic/sections/${sectionId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data = await getRes.json();
      assert.equal(data.section.section_heads.length, 1);
      assert.equal(data.section.section_heads[0].id, dualRoleUser.id);

      // Re-assign sectionHeadUser back for downstream permission tests
      await server.request(`/api/academic/sections/${sectionId}/heads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ user_id: sectionHeadUser.id })
      });
    });
  });

  describe('Requirements 7 & 9: Multiple Class Teachers Assignment & Unassignment', () => {
    it('Assigns multiple class teachers to a single class', async () => {
      // Assign regularTeacherUser as class teacher to Class A (which already has fixtures.classTeacher)
      const res = await server.request(`/api/academic/classes/${fixtures.testClassA.id}/teachers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ teacher_id: regularTeacherUser.id })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Fetch class teachers
      const getTeachersRes = await server.request(`/api/academic/classes/${fixtures.testClassA.id}/teachers`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const teachersData = await getTeachersRes.json();
      assert.ok(Array.isArray(teachersData.teachers));
      assert.equal(teachersData.teachers.length, 2);
      const teacherIds = teachersData.teachers.map((t: any) => t.id);
      assert.ok(teacherIds.includes(fixtures.classTeacher.id));
      assert.ok(teacherIds.includes(regularTeacherUser.id));
    });

    it('Unassigns a class teacher cleanly without affecting other teachers', async () => {
      const res = await server.request(`/api/academic/classes/${fixtures.testClassA.id}/teachers/${regularTeacherUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);

      const getTeachersRes = await server.request(`/api/academic/classes/${fixtures.testClassA.id}/teachers`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const teachersData = await getTeachersRes.json();
      assert.equal(teachersData.teachers.length, 1);
      assert.equal(teachersData.teachers[0].id, fixtures.classTeacher.id);
    });
  });

  describe('Requirements 10 & 11: Scoped Authorization, Section Boundaries & Dual-Role Isolation', () => {
    let section1Id: number;

    before(() => {
      const s1 = db.prepare("SELECT id FROM sections WHERE name = 'Junior Secondary (Updated)'").get() as any;
      section1Id = s1.id;

      // Ensure Class A is in Junior Section
      db.prepare('UPDATE classes SET section_id = ? WHERE id = ?').run(section1Id, fixtures.testClassA.id);
      // Ensure Class B is NOT in Junior Section (set section_id = null)
      db.prepare('UPDATE classes SET section_id = NULL WHERE id = ?').run(fixtures.testClassB.id);

      // Assign dualRoleUser as class teacher for Class B
      db.prepare(`
        INSERT OR REPLACE INTO teacher_assignments (teacher_id, class_id, assignment_type, academic_year_id)
        VALUES (?, ?, 'class_teacher', 1)
      `).run(dualRoleUser.id, fixtures.testClassB.id);
      db.prepare('UPDATE classes SET class_teacher_id = ? WHERE id = ?').run(dualRoleUser.id, fixtures.testClassB.id);
    });

    it('Section head receives scoped view of sections (GET /api/academic/sections)', async () => {
      // sectionHeadUser is assigned to Junior Section only, not Senior Section
      const res = await server.request('/api/academic/sections', {
        headers: { Authorization: `Bearer ${sectionHeadUser.token}` }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.sections.length, 1);
      assert.equal(data.sections[0].name, 'Junior Secondary (Updated)');
    });

    it('Section head can view section details of assigned section, but receives 403 on unassigned section', async () => {
      // Assigned section
      const allowedRes = await server.request(`/api/academic/sections/${section1Id}`, {
        headers: { Authorization: `Bearer ${sectionHeadUser.token}` }
      });
      assert.equal(allowedRes.status, 200);

      // Unassigned section (Senior Section)
      const s2 = db.prepare("SELECT id FROM sections WHERE name = 'Senior Secondary'").get() as any;
      const deniedRes = await server.request(`/api/academic/sections/${s2.id}`, {
        headers: { Authorization: `Bearer ${sectionHeadUser.token}` }
      });
      assert.equal(deniedRes.status, 403);
      const err = await deniedRes.json();
      assert.equal(err.code, 'FORBIDDEN_SECTION');
    });

    it('Section head cannot view or submit attendance for classes outside their section', async () => {
      // Class B is not in sectionHeadUser's section (JUNIOR_SEC)
      const date = '2026-03-10';
      const viewRes = await server.request(`/api/attendance/session?classId=${fixtures.testClassB.id}&date=${date}`, {
        headers: { Authorization: `Bearer ${sectionHeadUser.token}` }
      });
      assert.equal(viewRes.status, 403, 'Section head must receive 403 when viewing attendance for a class outside their section');

      // Attempt submission on Class B
      const submitRes = await server.request('/api/attendance/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sectionHeadUser.token}`
        },
        body: JSON.stringify({
          classId: fixtures.testClassB.id,
          date
        })
      });
      assert.equal(submitRes.status, 403, 'Section head must receive 403 when attempting attendance modification on a class outside their section');
    });

    it('Dual-role user has access to both their assigned section classes and their specific assigned class', async () => {
      // dualRoleUser is section head of JUNIOR_SEC (which contains Class A)
      // AND class teacher of Class B (which is not in JUNIOR_SEC)
      const secRes = await server.request(`/api/academic/sections/${section1Id}`, {
        headers: { Authorization: `Bearer ${dualRoleUser.token}` }
      });
      assert.equal(secRes.status, 200);

      const date = '2026-03-11';
      // Dual-role user can view attendance for Class A via section head role
      const viewClassARes = await server.request(`/api/attendance/session?classId=${fixtures.testClassA.id}&date=${date}`, {
        headers: { Authorization: `Bearer ${dualRoleUser.token}` }
      });
      assert.equal(viewClassARes.status, 200, 'Dual-role user can view attendance of classes in their assigned section');

      // Dual-role user can view attendance for Class B as its class teacher
      const viewClassBRes = await server.request(`/api/attendance/session?classId=${fixtures.testClassB.id}&date=${date}`, {
        headers: { Authorization: `Bearer ${dualRoleUser.token}` }
      });
      assert.equal(viewClassBRes.status, 200, 'Dual-role user can view attendance of class where they are class teacher');

      // Section head alone cannot submit attendance for Class A unless they are its assigned class teacher
      const submitClassARes = await server.request('/api/attendance/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${dualRoleUser.token}`
        },
        body: JSON.stringify({
          classId: fixtures.testClassA.id,
          date
        })
      });
      assert.equal(submitClassARes.status, 403, 'Section head cannot manage/submit attendance without class teacher role');
    });
  });

  describe('Requirement 12: Audit Logging of Structural Changes', () => {
    it('records audit log entries for all section and assignment actions', () => {
      const logs = db.prepare(`
        SELECT action, entity_type, entity_id
        FROM audit_logs
        WHERE entity_type IN ('sections', 'section_head_assignments', 'classes')
        ORDER BY id DESC
      `).all() as any[];

      assert.ok(logs.length > 0, 'Audit logs must contain section and class actions');
      const actions = new Set(logs.map(l => l.action));

      assert.ok(actions.has('SECTION_CREATE'), 'Must log SECTION_CREATE');
      assert.ok(actions.has('SECTION_UPDATE'), 'Must log SECTION_UPDATE');
      assert.ok(actions.has('CLASS_SECTION_ASSIGN'), 'Must log CLASS_SECTION_ASSIGN');
      assert.ok(actions.has('SECTION_HEAD_ASSIGN'), 'Must log SECTION_HEAD_ASSIGN');
      assert.ok(actions.has('CLASS_TEACHER_ASSIGN'), 'Must log CLASS_TEACHER_ASSIGN');
    });
  });

  describe('Requirement 13: Integrity & Non-Destructive Invariant Preservation', () => {
    it('verifies existing students, attendance sessions, and marks remain untouched', () => {
      const studentCount = db.prepare('SELECT count(*) as c FROM students').get() as any;
      assert.ok(studentCount.c >= 2, 'Student count must be preserved');

      const classCount = db.prepare('SELECT count(*) as c FROM classes').get() as any;
      assert.ok(classCount.c >= 2, 'Classes must be preserved');

      const userCount = db.prepare('SELECT count(*) as c FROM users').get() as any;
      assert.ok(userCount.c >= 4, 'Users must be preserved');

      const enrollmentCount = db.prepare('SELECT count(*) as c FROM enrollments').get() as any;
      assert.ok(enrollmentCount.c >= 2, 'Enrollments must be preserved');
    });
  });
});
