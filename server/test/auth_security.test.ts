import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { db, closeDatabase } from '../src/db/database.js';
import { getJwtSecret } from '../src/middleware/auth.js';
import { validatePasswordStrength } from '../src/routes/admin.js';
import { resetLoginAttempts } from '../src/routes/auth.js';

describe('PR-002: Authentication & Session Security Tests', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;
  let adminToken: string;

  before(async () => {
    fixtures = setupIsolatedTestDb();
    process.env.DB_PATH = fixtures.dbPath;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'super-secret-test-key-with-at-least-32-characters-for-safety';
    server = await startTestServer();

    // Authenticate admin for admin route tests
    const adminLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.adminUser.username,
        password: fixtures.adminUser.password
      })
    });
    adminToken = (await adminLogin.json()).token;
  });

  after(async () => {
    await server.close();
    closeDatabase();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  describe('1. JWT Secret Hardening & Startup Verification', () => {
    it('getJwtSecret() returns secret when length is at least 32 characters', () => {
      const original = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'a'.repeat(32);
      assert.equal(getJwtSecret(), 'a'.repeat(32));
      process.env.JWT_SECRET = original;
    });

    it('getJwtSecret() throws fatal error when JWT_SECRET is unset or under 32 characters', () => {
      const original = process.env.JWT_SECRET;

      delete process.env.JWT_SECRET;
      assert.throws(() => getJwtSecret(), /FATAL SECURITY CONFIGURATION.*missing/);

      process.env.JWT_SECRET = 'too-short-secret';
      assert.throws(() => getJwtSecret(), /FATAL SECURITY CONFIGURATION.*shorter than 32 characters/);

      process.env.JWT_SECRET = original;
    });
  });

  describe('2. Anti-Enumeration & Standardized Generic Login Errors', () => {
    it('returns generic "Invalid username or password" for invalid password', async () => {
      const res = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: fixtures.adminUser.username,
          password: 'WrongPassword999!'
        })
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'Invalid username or password');
    });

    it('returns identical generic "Invalid username or password" for non-existent username', async () => {
      const res = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'unknown_school_user_xyz',
          password: 'AnyPassword123!'
        })
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'Invalid username or password');
    });
  });

  describe('3. Login Rate Limiting (5 Attempts / 15-Minute Lockout)', () => {
    it('blocks subsequent login attempts with HTTP 429 after 5 failed attempts', async () => {
      const targetUser = 'ratelimit_target_user';

      // Perform 5 consecutive failed attempts
      for (let i = 1; i <= 5; i++) {
        const res = await server.request('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: targetUser,
            password: `BadAttempt${i}!`
          })
        });
        assert.equal(res.status, 401, `Attempt ${i} should be 401`);
      }

      // 6th attempt should be blocked by rate limiter with 429
      const blockedRes = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: targetUser,
          password: 'AnotherAttempt!'
        })
      });

      assert.equal(blockedRes.status, 429);
      const body = await blockedRes.json();
      assert.ok(body.error.includes('Too many failed login attempts'));
    });
  });

  describe('4. Real-time Account Verification & Token Invalidation on Deactivation', () => {
    it('immediately rejects token on protected endpoints once account is deactivated in SQLite', async () => {
      // 1. Class teacher logs in with active account
      const loginRes = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: fixtures.classTeacher.username,
          password: fixtures.classTeacher.password
        })
      });
      assert.equal(loginRes.status, 200);
      const { token } = await loginRes.json();
      assert.ok(token);

      // 2. Token successfully accesses protected endpoint
      const meBefore = await server.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(meBefore.status, 200);

      // 3. Admin deactivates teacher account in database
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(fixtures.classTeacher.id);

      // 4. Immediately, the previously issued token is rejected on /api/auth/me with 401
      const meAfter = await server.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(meAfter.status, 401);
      const bodyMe = await meAfter.json();
      assert.ok(bodyMe.error.includes('deactivated'));

      // 5. The same token is also rejected on data endpoints like /api/students
      const studentsAfter = await server.request('/api/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(studentsAfter.status, 401);

      // Re-activate teacher for remaining tests
      db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(fixtures.classTeacher.id);
    });
  });

  describe('5. Session Invalidation via POST /api/auth/logout', () => {
    it('increments token_version on logout and renders old token unusable', async () => {
      // 1. Subject teacher logs in
      const loginRes = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: fixtures.subjectTeacher.username,
          password: fixtures.subjectTeacher.password
        })
      });
      assert.equal(loginRes.status, 200);
      const { token } = await loginRes.json();

      // 2. Token works initially
      const meBefore = await server.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(meBefore.status, 200);

      // 3. User calls POST /api/auth/logout
      const logoutRes = await server.request('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(logoutRes.status, 200);
      const logoutData = await logoutRes.json();
      assert.equal(logoutData.success, true);

      // 4. Old token is now invalidated on subsequent requests
      const meAfter = await server.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(meAfter.status, 401);
      const dataAfter = await meAfter.json();
      assert.ok(dataAfter.error.includes('invalidated'));
    });
  });

  describe('6. Real-time Live Role Rehydration', () => {
    it('rehydrates live role from SQLite without requiring re-login', async () => {
      // 1. Subject teacher logs in with role 'subject_teacher'
      const loginRes = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: fixtures.subjectTeacher.username,
          password: fixtures.subjectTeacher.password
        })
      });
      const { token } = await loginRes.json();

      // Verify token cannot access admin users
      const adminForbidden = await server.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(adminForbidden.status, 403);

      // 2. Change role in database to admin without modifying token_version
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(fixtures.subjectTeacher.id);

      // 3. User makes request with same token; live role rehydration permits admin access
      const adminAllowed = await server.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(adminAllowed.status, 200);

      // Revert role back to subject_teacher
      db.prepare("UPDATE users SET role = 'subject_teacher' WHERE id = ?").run(fixtures.subjectTeacher.id);
    });
  });

  describe('7. Institutional Password Complexity Enforcement', () => {
    it('validatePasswordStrength() validates minimum 8 characters with letters and numbers', () => {
      assert.equal(validatePasswordStrength('short').valid, false);
      assert.equal(validatePasswordStrength('onlylettershere').valid, false);
      assert.equal(validatePasswordStrength('1234567890').valid, false);
      assert.equal(validatePasswordStrength('ValidPass123').valid, true);
      assert.equal(validatePasswordStrength('SkoolSys2026!').valid, true);
    });

    it('rejects user creation with weak password via POST /api/admin/users', async () => {
      const res = await server.request('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          username: 'weak_pass_user',
          email: 'weak@skoolsys.edu',
          password: 'weak',
          full_name: 'Weak Password User',
          role: 'class_teacher'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('at least 8 characters'));
    });
  });

  describe('8. Immediate Disaster Recovery Safeguards: Blocked Endpoints (HTTP 503)', () => {
    it('POST /api/admin/restore fails closed with HTTP 503 and deletes zero records', async () => {
      // Get student count before
      const countBefore = (db.prepare('SELECT count(*) as count FROM students').get() as any).count;
      assert.ok(countBefore > 0, 'Database must have students');

      const res = await server.request('/api/admin/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ backupData: { students: [] } })
      });

      assert.equal(res.status, 503);
      const data = await res.json();
      assert.ok(data.error.includes('disabled') && data.error.includes('safety'));

      // Verify row count is completely unchanged
      const countAfter = (db.prepare('SELECT count(*) as count FROM students').get() as any).count;
      assert.equal(countAfter, countBefore, 'Zero records should be deleted when restore is blocked');
    });

    it('POST /api/admin/reset-seed fails closed with HTTP 503 and preserves all tables', async () => {
      const markCountBefore = (db.prepare('SELECT count(*) as count FROM marks').get() as any).count;

      const res = await server.request('/api/admin/reset-seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        }
      });

      assert.equal(res.status, 503);
      const data = await res.json();
      assert.ok(data.error.includes('disabled') && data.error.includes('safety'));

      const markCountAfter = (db.prepare('SELECT count(*) as count FROM marks').get() as any).count;
      assert.equal(markCountAfter, markCountBefore, 'Mark records must remain completely intact');
    });
  });
});
