import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { db, closeDatabase } from '../src/db/database.js';

describe('School Settings & Daily Timetable Schedule Tests', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;
  let adminToken: string;
  let teacherToken: string;

  before(async () => {
    fixtures = setupIsolatedTestDb();
    process.env.DB_PATH = fixtures.dbPath;
    process.env.NODE_ENV = 'test';
    server = await startTestServer();

    // 1. Login Admin
    const adminRes = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.adminUser.username,
        password: fixtures.adminUser.password
      })
    });
    adminToken = (await adminRes.json()).token;

    // 2. Login Teacher
    const teacherRes = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fixtures.classTeacher.username,
        password: fixtures.classTeacher.password
      })
    });
    teacherToken = (await teacherRes.json()).token;
  });

  after(async () => {
    await server.close();
    closeDatabase();
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  describe('Part 1: School Profile & Institutional Metadata', () => {
    it('1. Principal can retrieve default school profile and metadata', async () => {
      const res = await server.request('/api/admin/settings/school-profile', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.profile);
      assert.equal(data.profile.school_name_en, 'Kattankudy Central College');
      assert.equal(data.profile.census_no, '14145');
      assert.equal(data.profile.district, 'Batticaloa District');
      assert.equal(data.profile.province, 'Eastern Province');
      assert.equal(data.profile.principal_name, 'Mr. A. L. M. Sabry');
    });

    it('2. Teaching faculty can read school profile', async () => {
      const res = await server.request('/api/admin/settings/school-profile', {
        headers: { Authorization: `Bearer ${teacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.profile);
      assert.equal(data.profile.school_name_en, 'Kattankudy Central College');
    });

    it('3. Non-admin cannot modify school profile (403 Forbidden)', async () => {
      const res = await server.request('/api/admin/settings/school-profile', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${teacherToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          school_name_en: 'Hacked College Name'
        })
      });
      assert.equal(res.status, 403);
    });

    it('4. Rejects profile update with invalid email or missing required fields (400 Bad Request)', async () => {
      const res = await server.request('/api/admin/settings/school-profile', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          school_name_en: '',
          email: 'not-an-email',
          census_no: ''
        })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('5. Principal can update institutional metadata with audit log recording', async () => {
      const updatePayload = {
        school_name_en: 'Kattankudy Central College (National School)',
        school_name_ta: 'காத்தான்குடி மத்திய கல்லூரி (தேசிய பாடசாலை)',
        school_name_si: 'කාත්තන්කුඩි මධ්‍ය මහා විද්‍යාලය',
        secondary_title: 'National School — Kattankudy (1AB)',
        census_no: '14145',
        school_type: 'National School (1AB)',
        address_line1: 'No. 322, Beach Road',
        address_line2: 'New Kattankudy 06',
        district: 'Batticaloa District',
        province: 'Eastern Province',
        country: 'Sri Lanka',
        postal_code: '30130',
        zone: 'Batticaloa Central',
        division: 'Kattankudy',
        phone: '+94 65 224 5321',
        email: 'principal@kcc.sch.lk',
        principal_name: 'Mr. A. L. M. Sabry',
        principal_notes: 'Formal MOE Appointed Principal',
        founded_year: 1930,
        student_category: 'Boys',
        medium: 'Tamil / English',
        supported_grades: 'Grades 6–13'
      };

      const res = await server.request('/api/admin/settings/school-profile', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.profile.school_name_en, 'Kattankudy Central College (National School)');
      assert.equal(data.profile.email, 'principal@kcc.sch.lk');

      // Verify audit log
      const audit = db.prepare(`
        SELECT * FROM audit_logs
        WHERE action = 'UPDATE_SCHOOL_PROFILE'
        ORDER BY id DESC LIMIT 1
      `).get() as any;
      assert.ok(audit);
      assert.equal(audit.user_id, fixtures.adminUser.id);
    });
  });

  describe('Part 2: Customizable Daily Timetable & Period Schedules', () => {
    it('6. Principal can view daily timetable schedules for all weekdays', async () => {
      const res = await server.request('/api/admin/settings/timetable-schedules', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.schedules);
      assert.ok(Array.isArray(data.schedules.monday));
      assert.ok(data.schedules.monday.length >= 8);
      assert.ok(Array.isArray(data.schedules.friday));
      assert.ok(data.schedules.friday.length >= 6);
    });

    it('7. Querying specific day schedule returns periods array', async () => {
      const res = await server.request('/api/admin/settings/timetable-schedules?day=friday', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.day, 'friday');
      assert.ok(Array.isArray(data.periods));
      assert.ok(data.periods.some((p: any) => p.period_type === 'teaching'));
    });

    it('8. Non-admin cannot update daily timetable schedule (403 Forbidden)', async () => {
      const res = await server.request('/api/admin/settings/timetable-schedules/monday', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${teacherToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          periods: []
        })
      });
      assert.equal(res.status, 403);
    });

    it('9. Rejects invalid daily timetable schedule with overlapping times (400 Bad Request)', async () => {
      const overlappingPeriods = [
        { period_number: 1, name: 'Period 1', start_time: '07:50', end_time: '08:30', period_type: 'teaching', is_active: 1 },
        { period_number: 2, name: 'Period 2', start_time: '08:20', end_time: '09:00', period_type: 'teaching', is_active: 1 } // Overlaps!
      ];

      const res = await server.request('/api/admin/settings/timetable-schedules/monday', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ periods: overlappingPeriods })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Time conflict') || data.error.includes('overlap'));
    });

    it('10. Rejects schedule with start_time >= end_time (400 Bad Request)', async () => {
      const invalidTimes = [
        { period_number: 1, name: 'Period 1', start_time: '08:30', end_time: '08:00', period_type: 'teaching', is_active: 1 }
      ];

      const res = await server.request('/api/admin/settings/timetable-schedules/monday', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ periods: invalidTimes })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('earlier than end time'));
    });

    it('11. Principal can customize Monday schedule and save atomically', async () => {
      const customMonday = [
        { period_number: 1, name: 'Morning Assembly', start_time: '07:30', end_time: '07:50', period_type: 'assembly', is_active: 1 },
        { period_number: 2, name: 'Mathematics', start_time: '07:50', end_time: '08:30', period_type: 'teaching', is_active: 1 },
        { period_number: 3, name: 'Science', start_time: '08:30', end_time: '09:10', period_type: 'teaching', is_active: 1 },
        { period_number: 4, name: 'Interval / Recess', start_time: '09:10', end_time: '09:30', period_type: 'interval', is_active: 1 },
        { period_number: 5, name: 'English Language', start_time: '09:30', end_time: '10:10', period_type: 'teaching', is_active: 1 },
        { period_number: 6, name: 'Tamil / Sinhala', start_time: '10:10', end_time: '10:50', period_type: 'teaching', is_active: 1 },
        { period_number: 7, name: 'History', start_time: '10:50', end_time: '11:30', period_type: 'teaching', is_active: 1 }
      ];

      const res = await server.request('/api/admin/settings/timetable-schedules/monday', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ periods: customMonday })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.periods.length, 7);

      // Verify persistence
      const getRes = await server.request('/api/admin/settings/timetable-schedules?day=monday', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const checkData = await getRes.json();
      assert.equal(checkData.periods.length, 7);
      assert.equal(checkData.periods[0].name, 'Morning Assembly');
      assert.equal(checkData.periods[0].period_type, 'assembly');
    });

    it('12. Principal can copy Monday schedule to Tuesday and Wednesday', async () => {
      const res = await server.request('/api/admin/settings/timetable-schedules/copy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceDay: 'monday',
          targetDays: ['tuesday', 'wednesday']
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify Tuesday has identical 7 periods
      const tueRes = await server.request('/api/admin/settings/timetable-schedules?day=tuesday', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const tueData = await tueRes.json();
      assert.equal(tueData.periods.length, 7);
      assert.equal(tueData.periods[0].name, 'Morning Assembly');
    });

    it('13. Principal can reset schedule to pilot default', async () => {
      const res = await server.request('/api/admin/settings/timetable-schedules/reset-default', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ day: 'monday' })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify reset back to 9 periods
      const checkRes = await server.request('/api/admin/settings/timetable-schedules?day=monday', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const checkData = await checkRes.json();
      assert.equal(checkData.periods.length, 9);
      assert.equal(checkData.periods[0].name, 'Period 1');
    });
  });
});
