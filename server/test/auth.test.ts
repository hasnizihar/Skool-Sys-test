import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { closeDatabase } from '../src/db/database.js';

describe('2. Authentication and Authorization Baseline Tests', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;

  before(async () => {
    fixtures = setupIsolatedTestDb();
    process.env.DB_PATH = fixtures.dbPath;
    process.env.NODE_ENV = 'test';
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
    closeDatabase();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  it('POST /api/auth/login successfully authenticates valid synthetic credentials', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.adminUser.username,
        password: fixtures.adminUser.password
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.token, 'Response must include JWT token');
    assert.equal(body.user.username, fixtures.adminUser.username);
    assert.equal(body.user.role, 'admin');
  });

  it('POST /api/auth/login rejects invalid credentials with 401', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.adminUser.username,
        password: 'IncorrectPassword!'
      })
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('Invalid username or password') || body.error.includes('Invalid credentials'));
  });

  it('POST /api/auth/login rejects non-existent users with 401', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'nonexistent_user_9999',
        password: 'SomePassword!'
      })
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error);
  });

  it('POST /api/auth/login rejects empty request body with 400', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('required'));
  });

  it('POST /api/auth/login rejects deactivated user account with 401', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.deactivatedUser.username,
        password: fixtures.deactivatedUser.password
      })
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.toLowerCase().includes('disabled') || body.error.toLowerCase().includes('invalid'));
  });

  it('GET /api/auth/me rejects unauthenticated request without token with 401', async () => {
    const res = await server.request('/api/auth/me');
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('Token missing') || body.error.includes('Authentication required'));
  });

  it('GET /api/auth/me rejects request with forged or invalid JWT token with 401', async () => {
    const res = await server.request('/api/auth/me', {
      headers: {
        Authorization: 'Bearer invalid.forged.token.here'
      }
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('Invalid or expired'));
  });

  it('GET /api/auth/me accepts valid Bearer token and returns authenticated user profile', async () => {
    // 1. Login to get token
    const loginRes = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.classTeacher.username,
        password: fixtures.classTeacher.password
      })
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    const token = loginBody.token;

    // 2. Access /api/auth/me
    const meRes = await server.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.username, fixtures.classTeacher.username);
    assert.equal(meBody.user.role, 'class_teacher');
    assert.ok(Array.isArray(meBody.user.assignedClassIds));
    assert.ok(meBody.user.assignedClassIds.includes(fixtures.classTeacher.classId));
  });
});
