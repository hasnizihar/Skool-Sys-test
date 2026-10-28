import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { db, switchDatabase } from '../src/db/database.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';

describe('PR-005: Published Marks Sheet Confidentiality & Scoped Authorization Suite', { concurrency: 1 }, () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  let yearId: number;
  let class7AId: number;
  let subjectMathId: number;
  let student1Id: number;

  let plainAdminId: number;
  let plainAdminToken: string;

  let principalId: number;
  let principalToken: string;

  let sectionHeadId: number;
  let sectionHeadToken: string;

  let assignedTeacherId: number;
  let assignedTeacherToken: string;

  let unrelatedTeacherId: number;
  let unrelatedTeacherToken: string;

  let deactivatedUserId: number;
  let deactivatedUserToken: string;

  let revokedLeaderId: number;
  let revokedLeaderToken: string;

  let publishedExamId: number;
  let publishedSheetId: number;

  let unpublishedExamId: number;
  let unpublishedSheetId: number;

  before(async () => {
    testDbPath = path.join(os.tmpdir(), `skoolsys_g6_pub_conf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    process.env.DB_PATH = testDbPath;
    switchDatabase(testDbPath);

    testServer = await startTestServer({ DB_PATH: testDbPath });

    // 1. Disposable Fixture Marker
    db.exec(`
      CREATE TABLE IF NOT EXISTS _skoolsys_disposable_marker (
        marker_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        environment TEXT NOT NULL,
        disposable_token TEXT NOT NULL,
        disclaimer TEXT NOT NULL
      );
      INSERT OR REPLACE INTO _skoolsys_disposable_marker (marker_id, created_at, environment, disposable_token, disclaimer)
      VALUES ('primary_marker', datetime('now'), 'test', 'DISPOSABLE_PUB_CONF_TEST', 'AUTHORIZED_DISPOSABLE_DEMO_OR_SYNTHETIC_FIXTURE_ONLY');
    `);

    // 2. Academic Year 2026
    const yr = db.prepare(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ('2026', '2026-01-01', '2026-12-31', 1)
    `).run();
    yearId = Number(yr.lastInsertRowid);

    // 3. Class & Subject
    const c = db.prepare(`
      INSERT INTO classes (name, grade, academic_year_id)
      VALUES ('Grade 7-A', 7, ?)
    `).run(yearId);
    class7AId = Number(c.lastInsertRowid);

    const s = db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('MATH-7', 'Mathematics 7', 'Core', '7')").run();
    subjectMathId = Number(s.lastInsertRowid);

    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class7AId, subjectMathId);

    // 4. Student & Enrollment
    const st = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone)
      VALUES ('STU-CONF-01', 'Test Pupil 01', 'Pupil1', '2012-05-10', 'Male', 'Guardian Parent', 'Father', '0771234567')
    `).run();
    student1Id = Number(st.lastInsertRowid);

    db.prepare(`
      INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status)
      VALUES (?, ?, ?, 1, 'enrolled')
    `).run(student1Id, class7AId, yearId);

    db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category)
      VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory')
    `).run(student1Id, subjectMathId, class7AId, yearId);

    // 5. Users Setup
    const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-chars-for-safety-2026';

    // 5.1 Plain IT Admin (No academic staff appointment)
    const adm = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('plain_it_admin', 'itadmin@kcc.lk', 'hash', 'admin', 'Plain IT Admin', 1, 1)
    `).run();
    plainAdminId = Number(adm.lastInsertRowid);
    plainAdminToken = jwt.sign({ id: plainAdminId, username: 'plain_it_admin', role: 'admin', token_version: 1, tokenVersion: 1 }, jwtSecret);

    // 5.2 Principal (Admin with academic appointment)
    const prn = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('principal_conf', 'principal@kcc.lk', 'hash', 'admin', 'Principal Leader', 1, 1)
    `).run();
    principalId = Number(prn.lastInsertRowid);
    principalToken = jwt.sign({ id: principalId, username: 'principal_conf', role: 'admin', token_version: 1, tokenVersion: 1 }, jwtSecret);
    db.prepare(`
      INSERT INTO academic_staff_authorizations (user_id, academic_year_id, auth_role, grade_band, granted_by_user_id, is_active)
      VALUES (?, ?, 'principal', 'all', ?, 1)
    `).run(principalId, yearId, principalId);

    // 5.3 Section Head (Junior 6-9)
    const sh = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('sh_junior', 'sh@kcc.lk', 'hash', 'subject_teacher', 'Section Head Junior', 1, 1)
    `).run();
    sectionHeadId = Number(sh.lastInsertRowid);
    sectionHeadToken = jwt.sign({ id: sectionHeadId, username: 'sh_junior', role: 'subject_teacher', token_version: 1, tokenVersion: 1 }, jwtSecret);
    db.prepare(`
      INSERT INTO academic_staff_authorizations (user_id, academic_year_id, auth_role, grade_band, granted_by_user_id, is_active)
      VALUES (?, ?, 'section_head', 'junior_6_9', ?, 1)
    `).run(sectionHeadId, yearId, principalId);

    // 5.4 Assigned Subject Teacher
    const tch = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('assigned_math_teacher', 'math_teacher@kcc.lk', 'hash', 'subject_teacher', 'Mr. Math Specialist', 1, 1)
    `).run();
    assignedTeacherId = Number(tch.lastInsertRowid);
    assignedTeacherToken = jwt.sign({ id: assignedTeacherId, username: 'assigned_math_teacher', role: 'subject_teacher', token_version: 1, tokenVersion: 1 }, jwtSecret);
    db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
      VALUES (?, ?, ?, 'subject_teacher', ?)
    `).run(assignedTeacherId, class7AId, subjectMathId, yearId);

    // 5.5 Unrelated Teacher (not assigned to this class/subject)
    const unrec = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('unrelated_teacher', 'unrelated@kcc.lk', 'hash', 'subject_teacher', 'Ms. Other Teacher', 1, 1)
    `).run();
    unrelatedTeacherId = Number(unrec.lastInsertRowid);
    unrelatedTeacherToken = jwt.sign({ id: unrelatedTeacherId, username: 'unrelated_teacher', role: 'subject_teacher', token_version: 1, tokenVersion: 1 }, jwtSecret);

    // 5.6 Deactivated User
    const deact = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('deactivated_user', 'deactivated@kcc.lk', 'hash', 'subject_teacher', 'Deactivated Staff', 0, 1)
    `).run();
    deactivatedUserId = Number(deact.lastInsertRowid);
    deactivatedUserToken = jwt.sign({ id: deactivatedUserId, username: 'deactivated_user', role: 'subject_teacher', token_version: 1, tokenVersion: 1 }, jwtSecret);

    // 5.7 Revoked Leadership User (Authorization has revoked_at set)
    const revL = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('revoked_leader', 'revoked_leader@kcc.lk', 'hash', 'subject_teacher', 'Former Section Head', 1, 1)
    `).run();
    revokedLeaderId = Number(revL.lastInsertRowid);
    revokedLeaderToken = jwt.sign({ id: revokedLeaderId, username: 'revoked_leader', role: 'subject_teacher', token_version: 1, tokenVersion: 1 }, jwtSecret);
    db.prepare(`
      INSERT INTO academic_staff_authorizations (user_id, academic_year_id, auth_role, grade_band, granted_by_user_id, is_active, revoked_at, revocation_reason)
      VALUES (?, ?, 'section_head', 'junior_6_9', ?, 0, datetime('now'), 'Term concluded')
    `).run(revokedLeaderId, yearId, principalId);

    // 6. Assessment Policy Profile
    const pol = db.prepare(`
      INSERT INTO assessment_policy_profiles (
        policy_code, title, academic_year_id, grade_band, version, is_approved_by_school, approved_by_user_id, approved_at,
        effective_from, effective_to, grading_scale_json, absence_rules_json, ranking_rules_json
      ) VALUES (
        'POL-CONF-01', 'Standard Junior 6-9 Policy', ?, 'junior_6_9', 1, 1, ?, datetime('now'),
        '2026-01-01', '2026-12-31',
        '[{"grade":"A","minPercentage":75},{"grade":"B","minPercentage":65},{"grade":"C","minPercentage":50},{"grade":"S","minPercentage":35},{"grade":"F","minPercentage":0}]',
        '{"absentHandling":"zero","medicalHandling":"exclude"}',
        '{"rankingMethod":"competition","tieHandling":"equal_rank_skip_next"}'
      )
    `).run(yearId, principalId);
    const policyId = Number(pol.lastInsertRowid);

    // 7. PUBLISHED Examination & Sheet Setup
    const pubEx = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, max_score, grade_band, status, is_published, assessment_policy_id)
      VALUES ('Published Term 1 Exam', 1, ?, '2026-03-01', '2026-03-15', 100, 'junior_6_9', 'scheduled', 0, ?)
    `).run(yearId, policyId);
    publishedExamId = Number(pubEx.lastInsertRowid);

    db.prepare(`
      INSERT INTO examination_schedules (examination_id, class_id, subject_id, max_score, is_required, status)
      VALUES (?, ?, ?, 100, 1, 'approved')
    `).run(publishedExamId, class7AId, subjectMathId);

    const pubSheet = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, max_score, revision, status, approved_by_user_id, approved_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 100, 3, 'approved', ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(publishedExamId, class7AId, subjectMathId, yearId, assignedTeacherId, principalId);
    publishedSheetId = Number(pubSheet.lastInsertRowid);

    db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status, grade_letter, status)
      VALUES (?, ?, ?, ?, ?, 100, 88.0, 'PRESENT', 'A', 'published')
    `).run(publishedSheetId, publishedExamId, class7AId, subjectMathId, student1Id);

    db.prepare(`
      UPDATE examinations SET status = 'published', is_published = 1, published_at = datetime('now') WHERE id = ?
    `).run(publishedExamId);

    // Seed audit history & revisions for published sheet
    db.prepare(`
      INSERT INTO marks_audit_history (mark_id, sheet_id, examination_id, student_id, subject_id, action, actor_user_id, created_at)
      VALUES (1, ?, ?, ?, ?, 'DRAFT_SAVE', ?, datetime('now'))
    `).run(publishedSheetId, publishedExamId, student1Id, subjectMathId, assignedTeacherId);

    db.prepare(`
      INSERT INTO marks_sheet_revisions (sheet_id, revision, status, saved_by_user_id, marks_payload_json, created_at)
      VALUES (?, 1, 'draft', ?, '[{"studentId": ${student1Id}, "score": 85.0}]', datetime('now'))
    `).run(publishedSheetId, assignedTeacherId);

    db.prepare(`
      INSERT INTO marks_sheet_revisions (sheet_id, revision, status, saved_by_user_id, marks_payload_json, created_at)
      VALUES (?, 2, 'submitted', ?, '[{"studentId": ${student1Id}, "score": 88.0}]', datetime('now'))
    `).run(publishedSheetId, assignedTeacherId);

    // 8. UNPUBLISHED Examination & Sheet Setup
    const unpubEx = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, max_score, grade_band, status, is_published, assessment_policy_id)
      VALUES ('Unpublished Term 2 Exam', 2, ?, '2026-06-01', '2026-06-15', 100, 'junior_6_9', 'scheduled', 0, ?)
    `).run(yearId, policyId);
    unpublishedExamId = Number(unpubEx.lastInsertRowid);

    db.prepare(`
      INSERT INTO examination_schedules (examination_id, class_id, subject_id, max_score, is_required, status)
      VALUES (?, ?, ?, 100, 1, 'draft')
    `).run(unpublishedExamId, class7AId, subjectMathId);

    const unpubSheet = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, max_score, revision, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 100, 1, 'draft', datetime('now'), datetime('now'))
    `).run(unpublishedExamId, class7AId, subjectMathId, yearId, assignedTeacherId);
    unpublishedSheetId = Number(unpubSheet.lastInsertRowid);

    db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status, grade_letter, status)
      VALUES (?, ?, ?, ?, ?, 100, 72.0, 'PRESENT', 'B', 'draft')
    `).run(unpublishedSheetId, unpublishedExamId, class7AId, subjectMathId, student1Id);

    db.prepare(`
      INSERT INTO marks_sheet_revisions (sheet_id, revision, status, saved_by_user_id, marks_payload_json, created_at)
      VALUES (?, 1, 'draft', ?, '[{"studentId": ${student1Id}, "score": 72.0}]', datetime('now'))
    `).run(unpublishedSheetId, assignedTeacherId);
  });

  after(async () => {
    if (testServer) await testServer.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch {}
  });

  // ============================================================================
  // 1. PLAIN IT ADMIN CONFIDENTIALITY LOCKOUT (PUBLISHED SHEET)
  // ============================================================================
  describe('1. Plain IT Admin (No Academic Appointment) on Published Marks Sheet', () => {
    test('1a. GET /api/marks/sheets/:id returns 403 Forbidden with INSUFFICIENT_AUTHORIZATION', async () => {
      const res = await testServer.request(`/api/marks/sheets/${publishedSheetId}`, {
        headers: { Authorization: `Bearer ${plainAdminToken}` }
      });
      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('1b. GET /api/marks/sheets/:id/history returns 403 Forbidden with INSUFFICIENT_AUTHORIZATION', async () => {
      const res = await testServer.request(`/api/marks/sheets/${publishedSheetId}/history`, {
        headers: { Authorization: `Bearer ${plainAdminToken}` }
      });
      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('1c. GET /api/marks/sheets/:id/revisions/:rev returns 403 Forbidden with INSUFFICIENT_AUTHORIZATION', async () => {
      const res = await testServer.request(`/api/marks/sheets/${publishedSheetId}/revisions/1`, {
        headers: { Authorization: `Bearer ${plainAdminToken}` }
      });
      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });
  });

  // ============================================================================
  // 2. ASSIGNED SUBJECT TEACHER ACCESS (PUBLISHED SHEET)
  // ============================================================================
  describe('2. Assigned Subject Teacher on Published Marks Sheet', () => {
    test('2a. GET /api/marks/sheets/:id is permitted (200 OK)', async () => {
      const res = await testServer.request(`/api/marks/sheets/${publishedSheetId}`, {
        headers: { Authorization: `Bearer ${assignedTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.sheet.id, publishedSheetId);
      assert.ok(Array.isArray(data.roster));
    });

    test('2b. GET /api/marks/sheets/:id/history is permitted (200 OK)', async () => {
      const res = await testServer.request(`/api/marks/sheets/${publishedSheetId}/history`, {
        headers: { Authorization: `Bearer ${assignedTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.sheetId, publishedSheetId);
      assert.ok(Array.isArray(data.auditHistory));
    });

    test('2c. GET /api/marks/sheets/:id/revisions/:rev is permitted (200 OK)', async () => {
      const res = await testServer.request(`/api/marks/sheets/${publishedSheetId}/revisions/1`, {
        headers: { Authorization: `Bearer ${assignedTeacherToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.sheet_id, publishedSheetId);
      assert.equal(data.revision, 1);
    });
  });

  // ============================================================================
  // 3. AUTHORIZED ACADEMIC LEADERSHIP ACCESS (PUBLISHED SHEET)
  // ============================================================================
  describe('3. Authorized Academic Leadership on Published Marks Sheet', () => {
    test('3a. Principal with active appointment covers all grades -> 200 OK on details, history, snapshot', async () => {
      const detailsRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}`, {
        headers: { Authorization: `Bearer ${principalToken}` }
      });
      assert.equal(detailsRes.status, 200);

      const histRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}/history`, {
        headers: { Authorization: `Bearer ${principalToken}` }
      });
      assert.equal(histRes.status, 200);

      const snapRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}/revisions/1`, {
        headers: { Authorization: `Bearer ${principalToken}` }
      });
      assert.equal(snapRes.status, 200);
    });

    test('3b. Section Head (Junior 6-9) covers Grade 7 -> 200 OK on details, history, snapshot', async () => {
      const detailsRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}`, {
        headers: { Authorization: `Bearer ${sectionHeadToken}` }
      });
      assert.equal(detailsRes.status, 200);

      const histRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}/history`, {
        headers: { Authorization: `Bearer ${sectionHeadToken}` }
      });
      assert.equal(histRes.status, 200);

      const snapRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}/revisions/1`, {
        headers: { Authorization: `Bearer ${sectionHeadToken}` }
      });
      assert.equal(snapRes.status, 200);
    });
  });

  // ============================================================================
  // 4. UNRELATED TEACHER (PUBLISHED SHEET)
  // ============================================================================
  describe('4. Unrelated Teacher (Out of Scope) on Published Marks Sheet', () => {
    test('4a. Denied 403 on details, history, and revisions', async () => {
      const detailsRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}`, {
        headers: { Authorization: `Bearer ${unrelatedTeacherToken}` }
      });
      assert.equal(detailsRes.status, 403);
      assert.equal((await detailsRes.json() as any).code, 'INSUFFICIENT_AUTHORIZATION');

      const histRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}/history`, {
        headers: { Authorization: `Bearer ${unrelatedTeacherToken}` }
      });
      assert.equal(histRes.status, 403);
      assert.equal((await histRes.json() as any).code, 'INSUFFICIENT_AUTHORIZATION');

      const snapRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}/revisions/1`, {
        headers: { Authorization: `Bearer ${unrelatedTeacherToken}` }
      });
      assert.equal(snapRes.status, 403);
      assert.equal((await snapRes.json() as any).code, 'INSUFFICIENT_AUTHORIZATION');
    });
  });

  // ============================================================================
  // 5. DEACTIVATED & REVOKED USERS (PUBLISHED SHEET)
  // ============================================================================
  describe('5. Deactivated and Revoked Users on Published Marks Sheet', () => {
    test('5a. Deactivated user is denied 401 USER_DEACTIVATED at auth middleware', async () => {
      const res = await testServer.request(`/api/marks/sheets/${publishedSheetId}`, {
        headers: { Authorization: `Bearer ${deactivatedUserToken}` }
      });
      assert.equal(res.status, 401);
      assert.equal((await res.json() as any).code, 'USER_DEACTIVATED');
    });

    test('5b. User with revoked academic authorization is denied 403 INSUFFICIENT_AUTHORIZATION', async () => {
      const res = await testServer.request(`/api/marks/sheets/${publishedSheetId}`, {
        headers: { Authorization: `Bearer ${revokedLeaderToken}` }
      });
      assert.equal(res.status, 403);
      assert.equal((await res.json() as any).code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('5c. Teacher whose assignment is removed immediately loses access (403)', async () => {
      // Create temporary teacher and assignment
      const tmpTeacher = db.prepare(`
        INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
        VALUES ('temp_assigned', 'temp@kcc.lk', 'hash', 'subject_teacher', 'Temporary Teacher', 1, 1)
      `).run();
      const tmpId = Number(tmpTeacher.lastInsertRowid);
      const tmpToken = jwt.sign({ id: tmpId, username: 'temp_assigned', role: 'subject_teacher', token_version: 1 }, process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-chars-for-safety-2026');

      const asg = db.prepare(`
        INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
        VALUES (?, ?, ?, 'subject_teacher', ?)
      `).run(tmpId, class7AId, subjectMathId, yearId);
      const asgId = Number(asg.lastInsertRowid);

      // Access permitted while assigned
      const okRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}`, {
        headers: { Authorization: `Bearer ${tmpToken}` }
      });
      assert.equal(okRes.status, 200);

      // Revoke assignment
      db.prepare('DELETE FROM teacher_assignments WHERE id = ?').run(asgId);

      // Access immediately denied with 403
      const revokedRes = await testServer.request(`/api/marks/sheets/${publishedSheetId}`, {
        headers: { Authorization: `Bearer ${tmpToken}` }
      });
      assert.equal(revokedRes.status, 403);
      assert.equal((await revokedRes.json() as any).code, 'INSUFFICIENT_AUTHORIZATION');
    });
  });

  // ============================================================================
  // 6. UNPUBLISHED CONFIDENTIALITY (UNCHANGED)
  // ============================================================================
  describe('6. Unpublished Marks Sheet Confidentiality Preservation', () => {
    test('6a. Plain IT Admin receives 403 UNPUBLISHED_RESULTS_LOCKED on unpublished sheet', async () => {
      const res = await testServer.request(`/api/marks/sheets/${unpublishedSheetId}`, {
        headers: { Authorization: `Bearer ${plainAdminToken}` }
      });
      assert.equal(res.status, 403);
      assert.equal((await res.json() as any).code, 'UNPUBLISHED_RESULTS_LOCKED');

      const histRes = await testServer.request(`/api/marks/sheets/${unpublishedSheetId}/history`, {
        headers: { Authorization: `Bearer ${plainAdminToken}` }
      });
      assert.equal(histRes.status, 403);
      assert.equal((await histRes.json() as any).code, 'UNPUBLISHED_RESULTS_LOCKED');

      const snapRes = await testServer.request(`/api/marks/sheets/${unpublishedSheetId}/revisions/1`, {
        headers: { Authorization: `Bearer ${plainAdminToken}` }
      });
      assert.equal(snapRes.status, 403);
      assert.equal((await snapRes.json() as any).code, 'UNPUBLISHED_RESULTS_LOCKED');
    });

    test('6b. Assigned teacher is permitted (200 OK) on unpublished draft sheet', async () => {
      const res = await testServer.request(`/api/marks/sheets/${unpublishedSheetId}`, {
        headers: { Authorization: `Bearer ${assignedTeacherToken}` }
      });
      assert.equal(res.status, 200);
    });

    test('6c. Scoped leadership is permitted (200 OK) on unpublished draft sheet', async () => {
      const res = await testServer.request(`/api/marks/sheets/${unpublishedSheetId}`, {
        headers: { Authorization: `Bearer ${sectionHeadToken}` }
      });
      assert.equal(res.status, 200);
    });

    test('6d. Unrelated teacher receives 403 UNPUBLISHED_RESULTS_LOCKED on unpublished sheet', async () => {
      const res = await testServer.request(`/api/marks/sheets/${unpublishedSheetId}`, {
        headers: { Authorization: `Bearer ${unrelatedTeacherToken}` }
      });
      assert.equal(res.status, 403);
      assert.equal((await res.json() as any).code, 'UNPUBLISHED_RESULTS_LOCKED');
    });
  });
});
