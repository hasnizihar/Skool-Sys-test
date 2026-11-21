import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { db } from '../src/db/database.js';

describe('Phase 3: Mobile Sequential Student Attendance Test Suite', () => {
  let fixtures: TestFixtureData;
  let server: TestServerInstance;
  let adminToken: string;
  let teacherToken: string;
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
    assert.ok(adminToken, 'Admin token must be defined');

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
    assert.ok(teacherToken, 'Teacher token must be defined');

    // 3. Seed additional students in Class A for sequential testing
    const insertStu = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, status)
      VALUES (?, ?, ?, '2012-03-01', 'Female', '456 Test Ave', 'Guardian Test', 'Mother', '0771234567', 'Active')
    `);
    const insertEnroll = db.prepare(`
      INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status)
      VALUES (?, ?, 1, ?, 'enrolled')
    `);

    const stu2 = insertStu.run('SYNTH-003', 'Fathima Nuha', 'Nuha');
    insertEnroll.run(Number(stu2.lastInsertRowid), classAId, 2);

    const stu3 = insertStu.run('SYNTH-004', 'Mohamed Rishad', 'Rishad');
    insertEnroll.run(Number(stu3.lastInsertRowid), classAId, 3);

    const stu4 = insertStu.run('SYNTH-005', 'Amina Zahra', 'Zahra');
    insertEnroll.run(Number(stu4.lastInsertRowid), classAId, 4);
  });

  after(async () => {
    if (server) {
      await server.close();
    }
    teardownIsolatedTestDb(fixtures.dbPath);
  });

  // ATT-M01: Class Roster & Roll Number Ordering
  it('ATT-M01: GET /api/attendance/session returns enrolled students strictly ordered by roll_number ASC, admission_no ASC', async () => {
    const res = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.students));
    assert.ok(body.students.length >= 4, 'Should have at least 4 enrolled students');

    const students = body.students;
    for (let i = 0; i < students.length - 1; i++) {
      const currRoll = students[i].roll_number ?? 9999;
      const nextRoll = students[i + 1].roll_number ?? 9999;
      assert.ok(currRoll <= nextRoll, `Student roll_number order inverted: ${currRoll} > ${nextRoll}`);
    }

    // Verify presence of fields required by mobile sequential card
    const first = students[0];
    assert.ok(first.student_id, 'student_id must be present');
    assert.ok(first.admission_no, 'admission_no must be present');
    assert.ok(first.full_name, 'full_name must be present');
    assert.ok(body.rosterFingerprint, 'rosterFingerprint must be present');
    assert.equal(body.serverRevision, 0, 'Initial revision must be 0');
  });

  // ATT-M02: Draft Saving with Partial Roster & Presence
  it('ATT-M02: POST /api/attendance/session saves partial draft with present status and advances revision to 1', async () => {
    const sessionRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sessionData = await sessionRes.json();
    const students = sessionData.students;
    const rosterFingerprint = sessionData.rosterFingerprint;

    // Mark only the first 2 students present as a draft
    const draftPayload = {
      classId: classAId,
      date: '2026-03-02',
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint,
      records: [
        { student_id: students[0].student_id, status: 'present', remarks: null },
        { student_id: students[1].student_id, status: 'present', remarks: '' }
      ]
    };

    const saveRes = await server.request('/api/attendance/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(draftPayload)
    });

    assert.equal(saveRes.status, 200);
    const saveData = await saveRes.json();
    assert.equal(saveData.success, true);
    assert.equal(saveData.revision, 1);
    assert.equal(saveData.status, 'applied');

    // Verify session state via GET
    const verifyRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.serverRevision, 1);
    assert.equal(verifyData.session.status, 'draft');
    assert.equal(verifyData.summary.present, 2);
    assert.equal(verifyData.summary.unmarked, students.length - 2);
  });

  // ATT-M03: Absence Reason Persistence & Custom Note
  it('ATT-M03: POST /api/attendance/session persists predefined and custom absence reasons in remarks', async () => {
    const sessionRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sessionData = await sessionRes.json();
    const students = sessionData.students;
    const rosterFingerprint = sessionData.rosterFingerprint;
    const currentRev = sessionData.serverRevision;

    const absentPayload = {
      classId: classAId,
      date: '2026-03-02',
      mode: 'draft',
      baseRevision: currentRev,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint,
      records: [
        { student_id: students[0].student_id, status: 'present', remarks: null },
        { student_id: students[1].student_id, status: 'absent', remarks: 'Sick / Medical, Hospital checkup' },
        { student_id: students[2].student_id, status: 'absent', remarks: 'Family Event' },
        { student_id: students[3].student_id, status: 'absent', remarks: 'Approved Leave' }
      ]
    };

    const saveRes = await server.request('/api/attendance/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(absentPayload)
    });

    assert.equal(saveRes.status, 200);
    const saveData = await saveRes.json();
    assert.equal(saveData.revision, currentRev + 1);

    // Verify absence reasons persisted exactly in remarks column
    const verifyRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const verifyData = await verifyRes.json();

    const st1 = verifyData.students.find((s: any) => s.student_id === students[1].student_id);
    assert.equal(st1.attendance_status, 'absent');
    assert.equal(st1.attendance_remarks, 'Sick / Medical, Hospital checkup');

    const st2 = verifyData.students.find((s: any) => s.student_id === students[2].student_id);
    assert.equal(st2.attendance_status, 'absent');
    assert.equal(st2.attendance_remarks, 'Family Event');

    const st3 = verifyData.students.find((s: any) => s.student_id === students[3].student_id);
    assert.equal(st3.attendance_status, 'absent');
    assert.equal(st3.attendance_remarks, 'Approved Leave');
  });

  // ATT-M04: Final Submission Enforces Complete Roster
  it('ATT-M04: POST /api/attendance/session rejects mode=submitted when roster is incomplete (422)', async () => {
    const sessionRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sessionData = await sessionRes.json();
    const students = sessionData.students;
    const rosterFingerprint = sessionData.rosterFingerprint;
    const currentRev = sessionData.serverRevision;

    // Omit students in submitted mode
    const incompletePayload = {
      classId: classAId,
      date: '2026-03-02',
      mode: 'submitted',
      baseRevision: currentRev,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint,
      records: [
        { student_id: students[0].student_id, status: 'present', remarks: null }
      ]
    };

    const failRes = await server.request('/api/attendance/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(incompletePayload)
    });

    assert.equal(failRes.status, 422);
    const failData = await failRes.json();
    assert.equal(failData.code, 'INCOMPLETE_SUBMITTED_ROSTER');
  });

  // ATT-M05: Successful Final Submission
  it('ATT-M05: POST /api/attendance/session finalizes complete register with mode=submitted', async () => {
    const sessionRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sessionData = await sessionRes.json();
    const students = sessionData.students;
    const rosterFingerprint = sessionData.rosterFingerprint;
    const currentRev = sessionData.serverRevision;

    // Build complete record array
    const completeRecords = students.map((s: any, idx: number) => ({
      student_id: s.student_id,
      status: idx === 1 ? 'absent' : 'present',
      remarks: idx === 1 ? 'Sick / Medical' : null
    }));

    const completePayload = {
      classId: classAId,
      date: '2026-03-02',
      mode: 'submitted',
      baseRevision: currentRev,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint,
      records: completeRecords
    };

    const submitRes = await server.request('/api/attendance/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(completePayload)
    });

    assert.equal(submitRes.status, 200);
    const submitData = await submitRes.json();
    assert.equal(submitData.success, true);
    assert.equal(submitData.mode, 'submitted');

    // Verify session is now finalized
    const verifyRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.session.status, 'submitted');
    assert.equal(verifyData.summary.unmarked, 0);
    assert.equal(verifyData.summary.absent, 1);
    assert.equal(verifyData.summary.present, students.length - 1);
  });

  // ATT-M06: Concurrency Revision Collision (HTTP 409)
  it('ATT-M06: Stale baseRevision is rejected with HTTP 409 ATTENDANCE_CONCURRENCY_CONFLICT', async () => {
    const sessionRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sessionData = await sessionRes.json();
    const students = sessionData.students;
    const rosterFingerprint = sessionData.rosterFingerprint;

    // Send stale baseRevision (0 instead of current revision)
    const stalePayload = {
      classId: classAId,
      date: '2026-03-02',
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint,
      records: students.map((s: any) => ({ student_id: s.student_id, status: 'present', remarks: null }))
    };

    const conflictRes = await server.request('/api/attendance/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(stalePayload)
    });

    assert.equal(conflictRes.status, 409);
    const conflictData = await conflictRes.json();
    assert.equal(conflictData.code, 'ATTENDANCE_CONCURRENCY_CONFLICT');
  });

  // ATT-M07: Authorization Boundary Checks
  it('ATT-M07: Class Teacher cannot submit attendance for an unassigned class (403)', async () => {
    const sessionRes = await server.request(`/api/attendance/session?classId=${classBId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sessionData = await sessionRes.json();
    const students = sessionData.students;
    const rosterFingerprint = sessionData.rosterFingerprint;

    const unassignedPayload = {
      classId: classBId,
      date: '2026-03-02',
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint,
      records: students.map((s: any) => ({ student_id: s.student_id, status: 'present', remarks: null }))
    };

    const res = await server.request('/api/attendance/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify(unassignedPayload)
    });

    assert.equal(res.status, 403);
    const resData = await res.json();
    assert.equal(resData.code, 'UNASSIGNED_CLASS_TEACHER');
  });

  // ATT-M08: Cannot downgrade submitted register to draft
  it('ATT-M08: Finalized submitted register cannot be reverted to draft (422)', async () => {
    const sessionRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-02`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sessionData = await sessionRes.json();
    const currentRev = sessionData.serverRevision;
    const rosterFingerprint = sessionData.rosterFingerprint;
    const students = sessionData.students;

    const downgradePayload = {
      classId: classAId,
      date: '2026-03-02',
      mode: 'draft',
      baseRevision: currentRev,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint,
      records: [
        { student_id: students[0].student_id, status: 'present', remarks: null }
      ]
    };

    const res = await server.request('/api/attendance/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(downgradePayload)
    });

    assert.equal(res.status, 422);
    const resData = await res.json();
    assert.equal(resData.code, 'CANNOT_REVERT_SUBMITTED_TO_DRAFT');
  });

  // ATT-M09: Preserves Late and Excused statuses on reload
  it('ATT-M09: Preserves Late and Excused records when loaded and resubmitted without alteration', async () => {
    const sessionRes = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-03`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sessionData = await sessionRes.json();
    const students = sessionData.students;
    const rosterFingerprint = sessionData.rosterFingerprint;

    const records = students.map((s: any, idx: number) => {
      if (idx === 0) return { student_id: s.student_id, status: 'late', remarks: 'Bus delayed' };
      if (idx === 1) return { student_id: s.student_id, status: 'excused', remarks: 'Sports meet participation' };
      return { student_id: s.student_id, status: 'present', remarks: null };
    });

    const submitRes = await server.request('/api/attendance/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        classId: classAId,
        date: '2026-03-03',
        mode: 'submitted',
        baseRevision: 0,
        clientMutationId: crypto.randomUUID(),
        rosterFingerprint,
        records
      })
    });

    assert.equal(submitRes.status, 200);

    const reloaded = await server.request(`/api/attendance/session?classId=${classAId}&date=2026-03-03`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const reloadedData = await reloaded.json();

    assert.equal(reloadedData.summary.late, 1);
    assert.equal(reloadedData.summary.excused, 1);
    const st0 = reloadedData.students.find((s: any) => s.student_id === records[0].student_id);
    assert.equal(st0.attendance_status, 'late');
    assert.equal(st0.attendance_remarks, 'Bus delayed');
    const st1 = reloadedData.students.find((s: any) => s.student_id === records[1].student_id);
    assert.equal(st1.attendance_status, 'excused');
    assert.equal(st1.attendance_remarks, 'Sports meet participation');
  });

  // ATT-M10: Audit Logging Verification
  it('ATT-M10: Audit trail records submission action with complete metadata', async () => {
    const logs = db.prepare(`
      SELECT action, entity_type, entity_id, details
      FROM audit_logs
      WHERE entity_type = 'attendance_sessions'
      ORDER BY id DESC
      LIMIT 1
    `).get() as any;

    assert.ok(logs, 'Audit log entry must exist for attendance_sessions');
    assert.ok(['ATTENDANCE_SUBMIT', 'ATTENDANCE_UPDATE'].includes(logs.action), `Action was ${logs.action}`);
    const details = JSON.parse(logs.details);
    assert.equal(details.classId, classAId);
    assert.equal(details.mode, 'submitted');
  });
});
