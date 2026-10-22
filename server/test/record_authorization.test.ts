import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { db, closeDatabase } from '../src/db/database.js';

describe('PR-003: Record-Level Permissions & Scoped Authorization Tests', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;
  let adminToken: string;
  let classTeacherToken: string;
  let subjectTeacherToken: string;

  before(async () => {
    fixtures = setupIsolatedTestDb();
    process.env.DB_PATH = fixtures.dbPath;
    process.env.NODE_ENV = 'test';
    server = await startTestServer();

    // Authenticate Admin
    const adminLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.adminUser.username,
        password: fixtures.adminUser.password
      })
    });
    adminToken = (await adminLogin.json()).token;

    // Authenticate Class Teacher (assigned to Class A only)
    const ctLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.classTeacher.username,
        password: fixtures.classTeacher.password
      })
    });
    classTeacherToken = (await ctLogin.json()).token;

    // Authenticate Subject Teacher (assigned to Class A Math only)
    const stLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.subjectTeacher.username,
        password: fixtures.subjectTeacher.password
      })
    });
    subjectTeacherToken = (await stLogin.json()).token;

    // Seed approved policy and schedule for Exam 1 so report cards calculate correctly
    const polId = Number(db.prepare(`
      INSERT INTO assessment_policy_profiles (
        academic_year_id, grade_band, policy_code, title, version,
        is_approved_by_school, approved_by_user_id, approved_at,
        grading_scale_json, subject_weights_json, ranking_rules_json, absence_rules_json
      ) VALUES (
        1, 'junior_6_9', 'POL-TEST-001', 'Test Assessment Policy', 1,
        1, ?, datetime('now'),
        '[{"grade":"A","minPercentage":75},{"grade":"F","minPercentage":0}]',
        '{}',
        '{"rankingMethod":"competition","tieHandling":"equal_rank_skip_next"}',
        '{"absentHandling":"zero","medicalHandling":"exclude"}'
      )
    `).run(fixtures.adminUser.id).lastInsertRowid);

    db.prepare('UPDATE examinations SET is_published = 0 WHERE id = 1').run();

    db.prepare(`
      INSERT OR REPLACE INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at)
      VALUES (1, ?, ?, 1, 'approved', ?, datetime('now'))
    `).run(fixtures.testClassA.id, fixtures.testSubjectMath.id, fixtures.adminUser.id);
    db.prepare(`
      INSERT OR REPLACE INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at)
      VALUES (1, ?, ?, 1, 'approved', ?, datetime('now'))
    `).run(fixtures.testClassB.id, fixtures.testSubjectMath.id, fixtures.adminUser.id);

    db.prepare('UPDATE examinations SET is_published = 1, status = \'published\', assessment_policy_id = ? WHERE id = 1').run(polId);

    db.prepare(`
      INSERT OR REPLACE INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at)
      VALUES (?, ?, ?, 1, 'confirmed', 'core_compulsory', ?, datetime('now'))
    `).run(fixtures.studentB.id, fixtures.testSubjectMath.id, fixtures.testClassB.id, fixtures.adminUser.id);
  });

  after(async () => {
    await server.close();
    closeDatabase();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  describe('1. Student List Scoping (GET /api/students)', () => {
    it('class teacher only receives students enrolled in assigned Class A', async () => {
      const res = await server.request('/api/students', {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.count, 1);
      assert.equal(data.students[0].id, fixtures.studentA.id);
      assert.equal(data.students[0].admission_no, fixtures.studentA.admissionNo);
    });

    it('subject teacher only receives students enrolled in assigned classes', async () => {
      const res = await server.request('/api/students', {
        headers: { Authorization: `Bearer ${subjectTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.count, 1);
      assert.equal(data.students[0].id, fixtures.studentA.id);
    });

    it('teacher requesting unassigned classId via query param receives 403 Forbidden', async () => {
      const res = await server.request(`/api/students?classId=${fixtures.testClassB.id}`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Access denied'));
    });

    it('administrator receives all students across all classes', async () => {
      const res = await server.request('/api/students', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.count, 2);
    });
  });

  describe('2. Student Detail Protection (GET /api/students/:id)', () => {
    it('class teacher can view assigned student A profile', async () => {
      const res = await server.request(`/api/students/${fixtures.studentA.id}`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.student.id, fixtures.studentA.id);
    });

    it('class teacher is forbidden from accessing unassigned student B profile (403)', async () => {
      const res = await server.request(`/api/students/${fixtures.studentB.id}`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Access denied'));
    });

    it('subject teacher is forbidden from accessing unassigned student B profile (403)', async () => {
      const res = await server.request(`/api/students/${fixtures.studentB.id}`, {
        headers: { Authorization: `Bearer ${subjectTeacherToken}` }
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Access denied'));
    });

    it('administrator can view any student profile', async () => {
      const res = await server.request(`/api/students/${fixtures.studentB.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.student.id, fixtures.studentB.id);
    });
  });

  describe('3. Class Roster Authorization (GET /api/academic/classes/:id/roster)', () => {
    it('class teacher can access Class A roster (200)', async () => {
      const res = await server.request(`/api/academic/classes/${fixtures.testClassA.id}/roster`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.students.length, 1);
      assert.equal(data.students[0].admission_no, fixtures.studentA.admissionNo);
    });

    it('class teacher is forbidden from accessing Class B roster (403)', async () => {
      const res = await server.request(`/api/academic/classes/${fixtures.testClassB.id}/roster`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Access denied'));
    });

    it('subject teacher is forbidden from accessing Class B roster (403)', async () => {
      const res = await server.request(`/api/academic/classes/${fixtures.testClassB.id}/roster`, {
        headers: { Authorization: `Bearer ${subjectTeacherToken}` }
      });
      assert.equal(res.status, 403);
    });
  });

  describe('4. Attendance Session & Register Permissions (GET & POST /api/attendance/session)', () => {
    it('class teacher can view Class A attendance session (200)', async () => {
      const res = await server.request(`/api/attendance/session?classId=${fixtures.testClassA.id}&date=2026-10-18`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 200);
    });

    it('class teacher is forbidden from viewing Class B attendance session (403)', async () => {
      const res = await server.request(`/api/attendance/session?classId=${fixtures.testClassB.id}&date=2026-10-18`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 403);
    });

    it('subject teacher cannot take daily class register via POST /api/attendance/session (403)', async () => {
      const res = await server.request('/api/attendance/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${subjectTeacherToken}`
        },
        body: JSON.stringify({
          classId: fixtures.testClassA.id,
          date: '2026-10-18',
          records: [{ student_id: fixtures.studentA.id, status: 'present' }]
        })
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Access denied'));
    });

    it('class teacher can submit daily attendance for assigned Class A (200)', async () => {
      const sessRes = await server.request(`/api/attendance/session?classId=${fixtures.testClassA.id}&date=2026-10-18`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      const sessData = await sessRes.json();

      const res = await server.request('/api/attendance/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${classTeacherToken}`
        },
        body: JSON.stringify({
          classId: fixtures.testClassA.id,
          date: '2026-10-18',
          mode: 'submitted',
          baseRevision: sessData.serverRevision || 0,
          clientMutationId: '00000000-0000-4000-8000-000000000099',
          rosterFingerprint: sessData.rosterFingerprint,
          notes: null,
          records: [{ student_id: fixtures.studentA.id, status: 'present', remarks: null }]
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });

    it('class teacher cannot submit daily attendance for unassigned Class B (403)', async () => {
      const res = await server.request('/api/attendance/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${classTeacherToken}`
        },
        body: JSON.stringify({
          classId: fixtures.testClassB.id,
          date: '2026-10-18',
          records: [{ student_id: fixtures.studentB.id, status: 'present' }]
        })
      });

      assert.equal(res.status, 403);
    });
  });

  describe('5. Attendance Reports Record Scoping (GET /api/attendance/reports/daily & monthly)', () => {
    it('class teacher daily report only shows summaries and absent contacts for assigned classes', async () => {
      const res = await server.request('/api/attendance/reports/daily?date=2026-10-18', {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.classes.length, 1);
      assert.equal(data.classes[0].class_id, fixtures.testClassA.id);
    });

    it('class teacher requesting monthly report for unassigned Class B receives 403', async () => {
      const res = await server.request(`/api/attendance/reports/monthly?classId=${fixtures.testClassB.id}&year=2026&month=10`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 403);
    });

    it('administrator receives daily reports for all classes', async () => {
      const res = await server.request('/api/attendance/reports/daily?date=2026-10-18', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.classes.length, 2);
    });
  });

  describe('6. Marks Sheet & Marks Entry Authority (GET & POST /api/marks/sheet)', () => {
    it('subject teacher can view marks sheet for assigned Class A Math (200)', async () => {
      const res = await server.request(`/api/marks/sheet?examId=1&classId=${fixtures.testClassA.id}&subjectId=${fixtures.testSubjectMath.id}`, {
        headers: { Authorization: `Bearer ${subjectTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.class.id, fixtures.testClassA.id);
    });

    it('subject teacher is forbidden from viewing marks sheet for unassigned Class B (403)', async () => {
      const res = await server.request(`/api/marks/sheet?examId=1&classId=${fixtures.testClassB.id}&subjectId=${fixtures.testSubjectMath.id}`, {
        headers: { Authorization: `Bearer ${subjectTeacherToken}` }
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Access denied'));
    });

    it('class teacher can view marks sheet for their class (200)', async () => {
      const res = await server.request(`/api/marks/sheet?examId=1&classId=${fixtures.testClassA.id}&subjectId=${fixtures.testSubjectMath.id}`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 200);
    });

    it('class teacher cannot overwrite marks for subject assigned to specialist teacher (403)', async () => {
      const res = await server.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${classTeacherToken}`
        },
        body: JSON.stringify({
          examId: 1,
          classId: fixtures.testClassA.id,
          subjectId: fixtures.testSubjectMath.id,
          marks: [{ student_id: fixtures.studentA.id, score: 95 }]
        })
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Access denied'));
    });

    it('assigned subject teacher can successfully submit marks for their subject (200)', async () => {
      const res = await server.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${subjectTeacherToken}`
        },
        body: JSON.stringify({
          examId: 1,
          classId: fixtures.testClassA.id,
          subjectId: fixtures.testSubjectMath.id,
          marks: [{ student_id: fixtures.studentA.id, score: 88 }]
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });
  });

  describe('7. Student Report Card Permissions (GET /api/marks/student-report/:studentId/:examId)', () => {
    it('class teacher can view report card for assigned student A (200)', async () => {
      const res = await server.request(`/api/marks/student-report/${fixtures.studentA.id}/1`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.student.id, fixtures.studentA.id);
    });

    it('class teacher is forbidden from viewing report card for unassigned student B (403)', async () => {
      const res = await server.request(`/api/marks/student-report/${fixtures.studentB.id}/1`, {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Access denied'));
    });

    it('subject teacher is forbidden from viewing report card for unassigned student B (403)', async () => {
      const res = await server.request(`/api/marks/student-report/${fixtures.studentB.id}/1`, {
        headers: { Authorization: `Bearer ${subjectTeacherToken}` }
      });
      assert.equal(res.status, 403);
    });

    it('administrator can view report card for any student (200)', async () => {
      const res = await server.request(`/api/marks/student-report/${fixtures.studentB.id}/1`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.student.id, fixtures.studentB.id);
    });
  });
});
