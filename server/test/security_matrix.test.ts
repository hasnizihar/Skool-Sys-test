import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { closeDatabase } from '../src/db/database.js';

describe('4. Security Baseline & Negative Authorization Matrix Tests', () => {
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

    // Authenticate synthetic accounts
    const adminLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.adminUser.username,
        password: fixtures.adminUser.password
      })
    });
    adminToken = (await adminLogin.json()).token;

    const ctLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.classTeacher.username,
        password: fixtures.classTeacher.password
      })
    });
    classTeacherToken = (await ctLogin.json()).token;

    const stLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.subjectTeacher.username,
        password: fixtures.subjectTeacher.password
      })
    });
    subjectTeacherToken = (await stLogin.json()).token;
  });

  after(async () => {
    await server.close();
    closeDatabase();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  describe('Unauthenticated Request Rejections (401)', () => {
    it('rejects GET /api/admin/users without token with 401', async () => {
      const res = await server.request('/api/admin/users');
      assert.equal(res.status, 401);
    });

    it('rejects GET /api/students without token with 401', async () => {
      const res = await server.request('/api/students');
      assert.equal(res.status, 401);
    });

    it('rejects GET /api/marks/sheet without token with 401', async () => {
      const res = await server.request('/api/marks/sheet?examId=1&classId=1&subjectId=1');
      assert.equal(res.status, 401);
    });

    it('rejects GET /api/attendance/session without token with 401', async () => {
      const res = await server.request('/api/attendance/session?classId=1&date=2026-10-18');
      assert.equal(res.status, 401);
    });
  });

  describe('Role-Based Boundary Controls (403 Forbidden)', () => {
    it('class teacher is forbidden from accessing GET /api/admin/users (403)', async () => {
      const res = await server.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${classTeacherToken}` }
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.ok(body.error.includes('Access denied') || body.error.includes('Requires'));
    });

    it('subject teacher is forbidden from accessing GET /api/admin/users (403)', async () => {
      const res = await server.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${subjectTeacherToken}` }
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.ok(body.error.includes('Access denied'));
    });

    it('subject teacher is forbidden from creating users via POST /api/admin/users (403)', async () => {
      const res = await server.request('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${subjectTeacherToken}`
        },
        body: JSON.stringify({
          username: 'unauthorized_creation',
          email: 'unauth@test.local',
          password: 'Password123!',
          full_name: 'Unauthorized',
          role: 'admin'
        })
      });
      assert.equal(res.status, 403);
    });

    it('administrator is permitted to access GET /api/admin/users (200)', async () => {
      const res = await server.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.users));
    });

    it('teacher is forbidden from submitting attendance for unassigned class (403)', async () => {
      // Class Teacher is assigned to Class A, not Class B
      const unassignedClassId = fixtures.testClassB.id;

      const res = await server.request('/api/attendance/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${classTeacherToken}`
        },
        body: JSON.stringify({
          classId: unassignedClassId,
          date: '2026-10-18',
          records: [{ student_id: fixtures.studentB.id, status: 'present' }]
        })
      });

      assert.equal(res.status, 403);
      const body = await res.json();
      assert.ok(body.error.includes('not assigned') || body.error.includes('denied'));
    });
  });
});
