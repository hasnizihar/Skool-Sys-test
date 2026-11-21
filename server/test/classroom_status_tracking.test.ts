import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { db, closeDatabase } from '../src/db/database.js';
import { runMigration008, TARGET_SCHEMA_VERSION } from '../src/db/migrations/008_classroom_status_tracking.js';
import { updateTimetableConfig, resolveActivePeriodContext } from '../src/services/timetableService.js';

describe('Phase 2: Live Classroom Status Tracking & 9-Period Timetable Tests', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;
  let adminToken: string;
  let sectionHead1User: { id: number; username: string; token: string };
  let sectionHead2User: { id: number; username: string; token: string };
  let regularClassTeacher: { id: number; username: string; token: string };

  let sectionJuniorId: number;
  let sectionSeniorId: number;
  let classJuniorAId: number;
  let classJuniorBId: number;
  let classSeniorAId: number;

  before(async () => {
    fixtures = setupIsolatedTestDb();
    process.env.DB_PATH = fixtures.dbPath;
    process.env.NODE_ENV = 'test';
    server = await startTestServer();

    // 1. Authenticate Admin (Principal)
    const adminLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.adminUser.username,
        password: fixtures.adminUser.password
      })
    });
    adminToken = (await adminLogin.json()).token;

    // 2. Create Section Head 1, Section Head 2, and Class Teacher
    const salt = bcrypt.genSaltSync(8);
    const pass = 'TestPass123!';
    const passHash = bcrypt.hashSync(pass, salt);

    const insertUser = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role, is_active)
      VALUES (?, ?, ?, ?, 'class_teacher', 1)
    `);

    const sh1Id = Number(insertUser.run('sh1_phase2', 'sh1@kcc.local', passHash, 'Section Head Junior').lastInsertRowid);
    const sh2Id = Number(insertUser.run('sh2_phase2', 'sh2@kcc.local', passHash, 'Section Head Senior').lastInsertRowid);
    const ctId = Number(insertUser.run('ct_phase2', 'ct@kcc.local', passHash, 'Regular Class Teacher Only').lastInsertRowid);

    const login = async (username: string) => {
      const res = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass })
      });
      return (await res.json()).token;
    };

    sectionHead1User = { id: sh1Id, username: 'sh1_phase2', token: await login('sh1_phase2') };
    sectionHead2User = { id: sh2Id, username: 'sh2_phase2', token: await login('sh2_phase2') };
    regularClassTeacher = { id: ctId, username: 'ct_phase2', token: await login('ct_phase2') };

    // 3. Create Sections (Junior Grades 6-9, Senior Grades 10-11)
    const insSec = db.prepare('INSERT INTO sections (name, code, grade_range) VALUES (?, ?, ?)');
    sectionJuniorId = Number(insSec.run('Junior Secondary', 'SEC_JUNIOR', '6-9').lastInsertRowid);
    sectionSeniorId = Number(insSec.run('Senior Secondary', 'SEC_SENIOR', '10-11').lastInsertRowid);

    // 4. Assign classes:
    // Class A -> Junior Section
    // Class B -> Junior Section
    // Class C (Senior) -> Senior Section
    classJuniorAId = fixtures.testClassA.id;
    classJuniorBId = fixtures.testClassB.id;

    db.prepare('UPDATE classes SET section_id = ? WHERE id = ?').run(sectionJuniorId, classJuniorAId);
    db.prepare('UPDATE classes SET section_id = ? WHERE id = ?').run(sectionJuniorId, classJuniorBId);

    const insCls = db.prepare('INSERT INTO classes (grade, name, room_number, academic_year_id, section_id) VALUES (?, ?, ?, 1, ?)');
    classSeniorAId = Number(insCls.run(10, 'Grade 10-A', 'Room 301', sectionSeniorId).lastInsertRowid);

    // 5. Assign Section Heads:
    // sh1 -> Junior Section
    // sh2 -> Senior Section
    const insHead = db.prepare('INSERT INTO section_head_assignments (section_id, user_id) VALUES (?, ?)');
    insHead.run(sectionJuniorId, sectionHead1User.id);
    insHead.run(sectionSeniorId, sectionHead2User.id);

    // 6. Assign regularClassTeacher to Class Junior A as class teacher (NOT section head)
    db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, assignment_type, academic_year_id)
      VALUES (?, ?, 'class_teacher', 1)
    `).run(regularClassTeacher.id, classJuniorAId);
  });

  after(async () => {
    await server.close();
    closeDatabase();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  describe('1. Migration 008 Idempotency & Invariant Verification', () => {
    it('applies cleanly and is idempotent on up-to-date schema', () => {
      const res = runMigration008(db);
      assert.equal(res.applied, false, 'Migration should not re-apply when already at V8');
      assert.equal(res.version, TARGET_SCHEMA_VERSION, 'Schema version must be 8');
    });

    it('upgrades a Schema V7 database to Schema V8', () => {
      const synthDb = new DatabaseSync(':memory:');
      try {
        synthDb.exec(`
          CREATE TABLE classes (id INTEGER PRIMARY KEY);
          CREATE TABLE users (id INTEGER PRIMARY KEY);
          PRAGMA user_version = 7;
        `);
        const res = runMigration008(synthDb);
        assert.equal(res.applied, true);
        assert.equal(res.version, 8);

        const checkPeriods = synthDb.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='school_periods'").get() as any;
        assert.equal(checkPeriods.c, 1);
        const checkStatus = synthDb.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='classroom_period_statuses'").get() as any;
        assert.equal(checkStatus.c, 1);
      } finally {
        synthDb.close();
      }
    });
  });

  describe('2. Nine-Period Timetable & Active Context Calculation', () => {
    it('reports unconfigured state when timetable has not been configured', async () => {
      const res = await server.request('/api/classroom-status/context', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.context.configured, false);
      assert.equal(data.context.state, 'unconfigured');
      assert.ok(data.context.message.includes('pending'));
    });

    it('Principal configures official 9 periods with break after Period 4', async () => {
      const timetablePayload = {
        periods: [
          { periodNumber: 1, name: 'Period 1', startTime: '07:50', endTime: '08:30' },
          { periodNumber: 2, name: 'Period 2', startTime: '08:30', endTime: '09:10' },
          { periodNumber: 3, name: 'Period 3', startTime: '09:10', endTime: '09:50' },
          { periodNumber: 4, name: 'Period 4', startTime: '09:50', endTime: '10:30' },
          { periodNumber: 5, name: 'Period 5', startTime: '10:50', endTime: '11:30' },
          { periodNumber: 6, name: 'Period 6', startTime: '11:30', endTime: '12:10' },
          { periodNumber: 7, name: 'Period 7', startTime: '12:10', endTime: '12:50' },
          { periodNumber: 8, name: 'Period 8', startTime: '12:50', endTime: '13:30' },
          { periodNumber: 9, name: 'Period 9', startTime: '13:30', endTime: '14:10' }
        ],
        breakAfterPeriod: 4,
        breakStartTime: '10:30',
        breakEndTime: '10:50',
        breakName: 'Interval / Recess',
        schoolDays: [1, 2, 3, 4, 5]
      };

      const res = await server.request('/api/classroom-status/timetable', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(timetablePayload)
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });

    it('rejects timetable configuration if periods count is not exactly 9', async () => {
      const invalidPayload = {
        periods: [
          { periodNumber: 1, name: 'Period 1', startTime: '07:50', endTime: '08:30' }
        ]
      };

      const res = await server.request('/api/classroom-status/timetable', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(invalidPayload)
      });

      assert.equal(res.status, 400);
    });

    it('correctly resolves active period, break, and before/after school states', () => {
      // Period 1 (08:00 is between 07:50 and 08:30)
      const p1Ctx = resolveActivePeriodContext('2026-11-23', undefined, '08:00');
      assert.equal(p1Ctx.configured, true);
      assert.equal(p1Ctx.state, 'active');
      assert.equal(p1Ctx.periodNumber, 1);

      // Period 4 (10:00 is between 09:50 and 10:30)
      const p4Ctx = resolveActivePeriodContext('2026-11-23', undefined, '10:00');
      assert.equal(p4Ctx.periodNumber, 4);

      // Break after Period 4 (10:40 is between 10:30 and 10:50)
      const breakCtx = resolveActivePeriodContext('2026-11-23', undefined, '10:40');
      assert.equal(breakCtx.state, 'break');
      assert.equal(breakCtx.isBreak, true);
      assert.equal(breakCtx.periodNumber, null);

      // Period 5 (11:00 is between 10:50 and 11:30)
      const p5Ctx = resolveActivePeriodContext('2026-11-23', undefined, '11:00');
      assert.equal(p5Ctx.periodNumber, 5);

      // Period 9 (13:45 is between 13:30 and 14:10)
      const p9Ctx = resolveActivePeriodContext('2026-11-23', undefined, '13:45');
      assert.equal(p9Ctx.periodNumber, 9);

      // Before school (07:15 < 07:50)
      const beforeCtx = resolveActivePeriodContext('2026-11-23', undefined, '07:15');
      assert.equal(beforeCtx.state, 'before_school');

      // After school (14:30 > 14:10)
      const afterCtx = resolveActivePeriodContext('2026-11-23', undefined, '14:30');
      assert.equal(afterCtx.state, 'after_school');

      // Specific period override for historical inspection
      const overrideCtx = resolveActivePeriodContext('2026-11-23', 3, '14:30');
      assert.equal(overrideCtx.periodNumber, 3);
      assert.equal(overrideCtx.state, 'active');
    });
  });

  describe('3. Status Recording, History, and White (Pending) Default', () => {
    const testDate = '2026-11-23';

    it('unrecorded classrooms initially default to White (pending)', async () => {
      const res = await server.request(`/api/classroom-status/overview?date=${testDate}&period=2`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();

      const juniorSec = data.sections.find((s: any) => s.id === sectionJuniorId);
      assert.ok(juniorSec);
      for (const cls of juniorSec.classes) {
        assert.equal(cls.status, 'pending', 'Unrecorded class must default to White/pending');
        assert.equal(cls.revision, 0);
      }
      assert.equal(data.summary.pending, data.summary.total);
      assert.equal(data.summary.teaching, 0);
    });

    it('Section Head records Green (teaching) for an authorized classroom', async () => {
      const res = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sectionHead1User.token}`
        },
        body: JSON.stringify({
          classId: classJuniorAId,
          status: 'teaching',
          periodNumber: 2,
          schoolDate: testDate
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.record.status, 'teaching');
      assert.equal(data.record.revision, 1);
    });

    it('Section Head records Red (not_teaching) and Yellow (other_activity)', async () => {
      // Record Class Junior B as Red (not_teaching)
      const resRed = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sectionHead1User.token}`
        },
        body: JSON.stringify({
          classId: classJuniorBId,
          status: 'not_teaching',
          periodNumber: 2,
          schoolDate: testDate
        })
      });
      assert.equal(resRed.status, 201);

      // Section Head 2 records Class Senior A as Yellow (other_activity)
      const resYellow = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sectionHead2User.token}`
        },
        body: JSON.stringify({
          classId: classSeniorAId,
          status: 'other_activity',
          activityNote: 'Substitute teacher Mr. Perera in charge',
          periodNumber: 2,
          schoolDate: testDate
        })
      });
      assert.equal(resYellow.status, 201);
      const dataYellow = await resYellow.json();
      assert.equal(dataYellow.record.status, 'other_activity');
      assert.equal(dataYellow.record.activityNote, 'Substitute teacher Mr. Perera in charge');
    });

    it('Principal overview reflects exact recorded counts for Period 2', async () => {
      const res = await server.request(`/api/classroom-status/overview?date=${testDate}&period=2`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data = await res.json();

      assert.equal(data.summary.teaching, 1, '1 class teaching (Green)');
      assert.equal(data.summary.notTeaching, 1, '1 class not teaching (Red)');
      assert.equal(data.summary.otherActivity, 1, '1 class other activity (Yellow)');
    });

    it('Section Head updates/corrects status within the same period (Red -> Green)', async () => {
      // Class Junior B was Red. Section Head 1 revisits and marks as Green.
      const res = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sectionHead1User.token}`
        },
        body: JSON.stringify({
          classId: classJuniorBId,
          status: 'teaching',
          periodNumber: 2,
          schoolDate: testDate,
          expectedRevision: 1
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.record.status, 'teaching');
      assert.equal(data.record.revision, 2);

      // Overview now reflects 2 Green, 0 Red, 1 Yellow
      const overviewRes = await server.request(`/api/classroom-status/overview?date=${testDate}&period=2`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const overview = await overviewRes.json();
      assert.equal(overview.summary.teaching, 2);
      assert.equal(overview.summary.notTeaching, 0);
      assert.equal(overview.summary.otherActivity, 1);
    });

    it('Period transition to Period 3 cleanly defaults to White without overwriting Period 2', async () => {
      const resP3 = await server.request(`/api/classroom-status/overview?date=${testDate}&period=3`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const dataP3 = await resP3.json();
      assert.equal(dataP3.summary.pending, dataP3.summary.total, 'All classrooms must default to White in Period 3');

      // Check that Period 2 records remain completely intact
      const resP2 = await server.request(`/api/classroom-status/overview?date=${testDate}&period=2`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const dataP2 = await resP2.json();
      assert.equal(dataP2.summary.teaching, 2);
    });
  });

  describe('4. Scoped Authorization & Boundary Enforcement', () => {
    const testDate = '2026-11-23';

    it('Section Head receives scoped overview containing only assigned sections', async () => {
      const res = await server.request(`/api/classroom-status/overview?date=${testDate}&period=2`, {
        headers: { Authorization: `Bearer ${sectionHead1User.token}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.sections.length, 1);
      assert.equal(data.sections[0].id, sectionJuniorId);
    });

    it('Section Head cannot record status for a classroom in an unauthorized section (403)', async () => {
      // Section Head 1 tries to write to Senior Class A
      const res = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sectionHead1User.token}`
        },
        body: JSON.stringify({
          classId: classSeniorAId,
          status: 'teaching',
          periodNumber: 2,
          schoolDate: testDate
        })
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'FORBIDDEN_SECTION_CLASS');
    });

    it('Class Teacher without Section Head appointment cannot record classroom statuses (403)', async () => {
      // regularClassTeacher tries to record status on their own class
      const res = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regularClassTeacher.token}`
        },
        body: JSON.stringify({
          classId: classJuniorAId,
          status: 'teaching',
          periodNumber: 2,
          schoolDate: testDate
        })
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'FORBIDDEN_SECTION_CLASS');
    });

    it('Rejects non-existent classroom with 404', async () => {
      const res = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          classId: 999999,
          status: 'teaching',
          periodNumber: 2,
          schoolDate: testDate
        })
      });
      assert.equal(res.status, 404);
    });

    it('Rejects invalid status classification with 400', async () => {
      const res = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          classId: classJuniorAId,
          status: 'vacation', // Invalid
          periodNumber: 2,
          schoolDate: testDate
        })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code, 'INVALID_STATUS');
    });
  });

  describe('5. Concurrency & Optimistic Lock Conflict Detection', () => {
    const testDate = '2026-11-23';

    it('detects revision conflict (409) when submission passes stale expectedRevision', async () => {
      // Current revision of Class Junior B for Period 2 is 2
      const res = await server.request('/api/classroom-status/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sectionHead1User.token}`
        },
        body: JSON.stringify({
          classId: classJuniorBId,
          status: 'not_teaching',
          periodNumber: 2,
          schoolDate: testDate,
          expectedRevision: 1 // Stale revision! (Current is 2)
        })
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, 'STATUS_REVISION_CONFLICT');
      assert.equal(data.currentStatus.revision, 2);
      assert.equal(data.currentStatus.status, 'teaching');
    });
  });

  describe('6. Audit Logging and Data Invariants', () => {
    it('verifies audit logs recorded all status events with provenance', () => {
      const logs = db.prepare(`
        SELECT action, entity_type, entity_id, details
        FROM audit_logs
        WHERE entity_type = 'classroom_period_statuses'
        ORDER BY id DESC
      `).all() as any[];

      assert.ok(logs.length >= 3, 'Must record audit log entries');
      const actions = new Set(logs.map((l) => l.action));
      assert.ok(actions.has('CLASSROOM_STATUS_RECORD'));
      assert.ok(actions.has('CLASSROOM_STATUS_UPDATE'));

      // Check details format
      const updateLog = logs.find((l) => l.action === 'CLASSROOM_STATUS_UPDATE');
      assert.ok(updateLog);
      const parsed = JSON.parse(updateLog.details);
      assert.ok(parsed.classId);
      assert.ok(parsed.periodNumber);
      assert.ok(parsed.previousStatus);
      assert.ok(parsed.newStatus);
    });

    it('preserves existing student, class, and attendance data', () => {
      const studentCount = db.prepare('SELECT count(*) as c FROM students').get() as any;
      assert.ok(studentCount.c >= 2, 'Students must be preserved');

      const classCount = db.prepare('SELECT count(*) as c FROM classes').get() as any;
      assert.ok(classCount.c >= 3, 'Classes must be preserved');

      const userCount = db.prepare('SELECT count(*) as c FROM users').get() as any;
      assert.ok(userCount.c >= 4, 'Users must be preserved');
    });
  });
});
