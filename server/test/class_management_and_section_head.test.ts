import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { db, closeDatabase } from '../src/db/database.js';

describe('Phase 2: Section Head Access Correction & Class Management Tests', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;

  // Tokens & user credentials
  let adminToken: string;
  let shSingleUser: { id: number; username: string; token: string };
  let shMultiUser: { id: number; username: string; token: string };
  let dualRoleUser: { id: number; username: string; token: string };
  let teacherOnlyUser: { id: number; username: string; token: string };

  let section1Id: number;
  let section2Id: number;
  let classInSec1Id: number;
  let classInSec2Id: number;
  let classDualAssignedId: number;

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
    const adminData = await adminLogin.json();
    adminToken = adminData.token;

    // 2. Create Sections
    const sec1Res = db.prepare(`
      INSERT INTO sections (name, description, grade_range)
      VALUES ('Junior Secondary Test', 'Grades 6-9', '6-9')
    `).run();
    section1Id = Number(sec1Res.lastInsertRowid);

    const sec2Res = db.prepare(`
      INSERT INTO sections (name, description, grade_range)
      VALUES ('Senior Secondary Test', 'Grades 10-11', '10-11')
    `).run();
    section2Id = Number(sec2Res.lastInsertRowid);

    // 3. Create Classes
    const insClass = db.prepare(`
      INSERT INTO classes (grade, name, academic_year_id, section_id)
      VALUES (?, ?, 1, ?)
    `);
    classInSec1Id = Number(insClass.run(8, 'Grade 8-X Test', section1Id).lastInsertRowid);
    classInSec2Id = Number(insClass.run(10, 'Grade 10-X Test', section2Id).lastInsertRowid);
    classDualAssignedId = Number(insClass.run(7, 'Grade 7-X Test', section1Id).lastInsertRowid);

    // 4. Create Users
    const salt = bcrypt.genSaltSync(8);
    const pass = 'SchoolPassword123!';
    const passHash = bcrypt.hashSync(pass, salt);

    const insertUser = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    const sh1Id = Number(insertUser.run('sh_single_p2', 'sh1@test.local', passHash, 'Single Section Head', 'class_teacher').lastInsertRowid);
    const shMultiId = Number(insertUser.run('sh_multi_p2', 'shmulti@test.local', passHash, 'Multi Section Head', 'class_teacher').lastInsertRowid);
    const dualId = Number(insertUser.run('dual_role_p2', 'dual@test.local', passHash, 'Dual Role Teacher', 'class_teacher').lastInsertRowid);
    const tOnlyId = Number(insertUser.run('teacher_only_p2', 'tonly@test.local', passHash, 'Teacher Only', 'class_teacher').lastInsertRowid);

    // 5. Assign Section Heads
    const insSectionHead = db.prepare(`
      INSERT INTO section_head_assignments (section_id, user_id)
      VALUES (?, ?)
    `);
    insSectionHead.run(section1Id, sh1Id);
    insSectionHead.run(section1Id, shMultiId);
    insSectionHead.run(section2Id, shMultiId);
    insSectionHead.run(section1Id, dualId);

    // 6. Assign Dual Role user as Class Teacher for classDualAssignedId
    db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, assignment_type, academic_year_id)
      VALUES (?, ?, 'class_teacher', 1)
    `).run(dualId, classDualAssignedId);
    db.prepare('UPDATE classes SET class_teacher_id = ? WHERE id = ?').run(dualId, classDualAssignedId);

    // 7. Login helper
    const loginUser = async (username: string) => {
      const res = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass })
      });
      const data = await res.json();
      return { id: data.user.id, username, token: data.token, sectionHeadSectionIds: data.user.sectionHeadSectionIds, role: data.user.role };
    };

    shSingleUser = await loginUser('sh_single_p2');
    shMultiUser = await loginUser('sh_multi_p2');
    dualRoleUser = await loginUser('dual_role_p2');
    teacherOnlyUser = await loginUser('teacher_only_p2');
  });

  after(async () => {
    await server.close();
    closeDatabase();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  describe('Part A: Section Head Access Determination & Multi-Role Scoping', () => {
    it('1. Login returns sectionHeadSectionIds array reflecting database assignments', () => {
      // Single section head
      assert.deepEqual(
        shSingleUser.sectionHeadSectionIds,
        [section1Id],
        'Single section head should have exactly section1Id in sectionHeadSectionIds'
      );
      assert.equal(shSingleUser.role, 'class_teacher', 'User role must remain class_teacher and not be overwritten');

      // Multi section head
      assert.ok(
        shMultiUser.sectionHeadSectionIds.includes(section1Id) && shMultiUser.sectionHeadSectionIds.includes(section2Id),
        'Multi section head should contain both assigned section IDs'
      );

      // Teacher only
      assert.deepEqual(
        teacherOnlyUser.sectionHeadSectionIds,
        [],
        'Regular teacher with no section head assignment should have empty sectionHeadSectionIds'
      );
    });

    it('2. Section Head with single section sees only assigned section in classroom overview', async () => {
      const res = await server.request('/api/classroom-status/overview', {
        headers: { Authorization: `Bearer ${shSingleUser.token}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(Array.isArray(data.sections), 'Overview returns sections array');
      assert.equal(data.sections.length, 1, 'Should only see 1 section');
      assert.equal(data.sections[0].id, section1Id, 'Should only see section1');
    });

    it('3. Section Head with multiple sections sees all assigned sections in classroom overview', async () => {
      const res = await server.request('/api/classroom-status/overview', {
        headers: { Authorization: `Bearer ${shMultiUser.token}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();

      const returnedSectionIds = data.sections.map((s: any) => s.id);
      assert.ok(returnedSectionIds.includes(section1Id), 'Overview must include section 1');
      assert.ok(returnedSectionIds.includes(section2Id), 'Overview must include section 2');
    });

    it('4. Teacher without section head assignment sees zero sections in classroom overview', async () => {
      const res = await server.request('/api/classroom-status/overview', {
        headers: { Authorization: `Bearer ${teacherOnlyUser.token}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepEqual(data.sections, [], 'Non-section head teacher sees empty sections list');
    });

    it('5. Section Head can record classroom status for a class in assigned section', async () => {
      const res = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${shSingleUser.token}`
        },
        body: JSON.stringify({
          classId: classInSec1Id,
          status: 'teaching',
          periodNumber: 1,
          schoolDate: '2026-03-15',
          activityNote: 'Regular mathematics session'
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.record.status, 'teaching');
    });

    it('6. Section Head cannot record classroom status for a class in an unassigned section (403 FORBIDDEN_SECTION_CLASS)', async () => {
      const res = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${shSingleUser.token}`
        },
        body: JSON.stringify({
          classId: classInSec2Id, // in Section 2, which shSingleUser is NOT assigned to
          status: 'teaching',
          periodNumber: 1,
          schoolDate: '2026-03-15'
        })
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'FORBIDDEN_SECTION_CLASS');
    });

    it('7. Dual-role user retains teacher capability and section head capability simultaneously', async () => {
      // a) As Section Head: can record status for Section 1
      const statusRes = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${dualRoleUser.token}`
        },
        body: JSON.stringify({
          classId: classDualAssignedId,
          status: 'other_activity',
          periodNumber: 2,
          schoolDate: '2026-03-15',
          activityNote: 'Assembly'
        })
      });
      assert.equal(statusRes.status, 201);

      // b) As Class Teacher: can access class roster for their assigned class
      const rosterRes = await server.request(`/api/academic/classes/${classDualAssignedId}/roster`, {
        headers: { Authorization: `Bearer ${dualRoleUser.token}` }
      });
      assert.equal(rosterRes.status, 200);
      const rosterData = await rosterRes.json();
      assert.equal(rosterData.class.id, classDualAssignedId);
    });

    it('8. Principal (admin) retains school-wide access across all sections', async () => {
      const res = await server.request('/api/classroom-status/overview', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();

      const sectionIds = data.sections.map((s: any) => s.id);
      assert.ok(sectionIds.includes(section1Id));
      assert.ok(sectionIds.includes(section2Id));

      // Principal can record status for class in any section
      const recordRes = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          classId: classInSec2Id,
          status: 'teaching',
          periodNumber: 2,
          schoolDate: '2026-03-15'
        })
      });
      assert.equal(recordRes.status, 201);
    });

    it('9. Unauthenticated requests are rejected with 401', async () => {
      const res = await server.request('/api/classroom-status/overview');
      assert.equal(res.status, 401);
    });
  });

  describe('Part B: Class Management - Creation, Validation & Updating', () => {
    let createdClassId: number;

    it('1. Principal can create a new class with valid grade, name, room, and section', async () => {
      const res = await server.request('/api/academic/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          grade: 8,
          name: 'Grade 8-B New',
          section_id: section1Id
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.id, 'Must return new class ID');
      createdClassId = data.id;

      // Verify created class in database
      const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(createdClassId) as any;
      assert.equal(row.grade, 8);
      assert.equal(row.name, 'Grade 8-B New');
      assert.equal(row.section_id, section1Id);
    });

    it('2. Validation: Rejects invalid grade (< 6 or > 13) with 400 INVALID_GRADE', async () => {
      const resLow = await server.request('/api/academic/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          grade: 5,
          name: 'Grade 5-A',
          section_id: section1Id
        })
      });
      assert.equal(resLow.status, 400);
      assert.equal((await resLow.json()).code, 'INVALID_GRADE');

      const resHigh = await server.request('/api/academic/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          grade: 14,
          name: 'Grade 14-A',
          section_id: section1Id
        })
      });
      assert.equal(resHigh.status, 400);
      assert.equal((await resHigh.json()).code, 'INVALID_GRADE');
    });

    it('3. Validation: Rejects duplicate class name within the same grade and academic year with 400 DUPLICATE_CLASS_NAME', async () => {
      const res = await server.request('/api/academic/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          grade: 8,
          name: 'Grade 8-B New', // duplicate
          section_id: section1Id
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code, 'DUPLICATE_CLASS_NAME');
    });

    it('4. Validation: Rejects non-existent section_id with 400 SECTION_NOT_FOUND', async () => {
      const res = await server.request('/api/academic/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          grade: 9,
          name: 'Grade 9-Z Invalid',
          section_id: 99999
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code, 'SECTION_NOT_FOUND');
    });

    it('5. Principal can update class details and section assignment via PUT /classes/:id', async () => {
      const res = await server.request(`/api/academic/classes/${createdClassId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          grade: 8,
          name: 'Grade 8-B Updated',
          section_id: section2Id
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.class.name, 'Grade 8-B Updated');
      assert.equal(data.class.section_id, section2Id);
    });

    it('6. Non-admin users are forbidden from creating or updating classes (403)', async () => {
      const createRes = await server.request('/api/academic/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherOnlyUser.token}`
        },
        body: JSON.stringify({
          grade: 8,
          name: 'Grade 8-Unauthorized'
        })
      });
      assert.equal(createRes.status, 403);

      const updateRes = await server.request(`/api/academic/classes/${createdClassId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherOnlyUser.token}`
        },
        body: JSON.stringify({
          name: 'Unauthorized update'
        })
      });
      assert.equal(updateRes.status, 403);
    });
  });

  describe('Part C: Safe Class Deletion & Referential Integrity Safeguards', () => {
    let emptyClassId: number;
    let classWithStudentsId: number;
    let classWithAttendanceId: number;
    let classWithPeriodStatusesId: number;

    before(() => {
      // Setup classes for deletion testing
      const insClass = db.prepare(`
        INSERT INTO classes (grade, name, academic_year_id, section_id)
        VALUES (?, ?, 1, ?)
      `);

      emptyClassId = Number(insClass.run(9, 'Grade 9-Empty', section1Id).lastInsertRowid);
      classWithStudentsId = Number(insClass.run(9, 'Grade 9-WithStudents', section1Id).lastInsertRowid);
      classWithAttendanceId = Number(insClass.run(9, 'Grade 9-WithAttendance', section1Id).lastInsertRowid);
      classWithPeriodStatusesId = Number(insClass.run(9, 'Grade 9-WithStatuses', section1Id).lastInsertRowid);

      // Add student to classWithStudentsId
      const insStudent = db.prepare(`
        INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
        VALUES ('ADM-TEST-P2', 'Test Student P2', 'Test', '2010-01-01', 'Male', 'Guardian P2', 'Father', '0771234567')
      `).run();
      const studentId = Number(insStudent.lastInsertRowid);

      db.prepare(`
        INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status)
        VALUES (?, ?, 1, 1, 'enrolled')
      `).run(studentId, classWithStudentsId);

      // Add historical attendance session to classWithAttendanceId
      db.prepare(`
        INSERT INTO attendance_sessions (uuid, class_id, date, academic_year_id, status)
        VALUES ('uuid-test-att-p2', ?, '2026-03-10', 1, 'submitted')
      `).run(classWithAttendanceId);

      // Add period status record to classWithPeriodStatusesId
      db.prepare(`
        INSERT INTO classroom_period_statuses (class_id, school_date, period_number, status, recorded_by_user_id)
        VALUES (?, '2026-03-10', 1, 'teaching', ?)
      `).run(classWithPeriodStatusesId, fixtures.adminUser.id);
    });

    it('1. Safe deletion: Successfully deletes an empty class with zero dependents', async () => {
      const res = await server.request(`/api/academic/classes/${emptyClassId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify row is gone
      const check = db.prepare('SELECT id FROM classes WHERE id = ?').get(emptyClassId);
      assert.equal(check, undefined, 'Empty class must be deleted from database');
    });

    it('2. Deletion blocked: Rejects deleting class with enrolled students with 409 CLASS_HAS_STUDENTS', async () => {
      const res = await server.request(`/api/academic/classes/${classWithStudentsId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, 'CLASS_HAS_STUDENTS');
      assert.ok(data.count >= 1);

      // Verify class is NOT deleted
      const check = db.prepare('SELECT id FROM classes WHERE id = ?').get(classWithStudentsId);
      assert.ok(check, 'Class with students must be preserved');
    });

    it('3. Deletion blocked: Rejects deleting class with historical attendance records with 409 CLASS_HAS_ATTENDANCE', async () => {
      const res = await server.request(`/api/academic/classes/${classWithAttendanceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, 'CLASS_HAS_ATTENDANCE');
      assert.ok(data.count >= 1);

      // Verify class is NOT deleted
      const check = db.prepare('SELECT id FROM classes WHERE id = ?').get(classWithAttendanceId);
      assert.ok(check, 'Class with attendance must be preserved');
    });

    it('4. Deletion blocked: Rejects deleting class with recorded period statuses with 409 CLASS_HAS_PERIOD_STATUSES', async () => {
      const res = await server.request(`/api/academic/classes/${classWithPeriodStatusesId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, 'CLASS_HAS_PERIOD_STATUSES');
      assert.ok(data.count >= 1);

      // Verify class is NOT deleted
      const check = db.prepare('SELECT id FROM classes WHERE id = ?').get(classWithPeriodStatusesId);
      assert.ok(check, 'Class with period statuses must be preserved');
    });

    it('5. Non-admin users cannot delete classes (403)', async () => {
      const res = await server.request(`/api/academic/classes/${classWithStudentsId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${teacherOnlyUser.token}` }
      });

      assert.equal(res.status, 403);
    });

    it('6. Deleting non-existent class returns 404 CLASS_NOT_FOUND', async () => {
      const res = await server.request('/api/academic/classes/99999', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.code, 'CLASS_NOT_FOUND');
    });
  });
});
