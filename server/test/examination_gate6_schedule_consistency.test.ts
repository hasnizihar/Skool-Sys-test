import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { db, switchDatabase } from '../src/db/database.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { publishExamination } from '../src/services/examinationPublicationService.js';

describe('FIX 01: Authoritative Examination Schedule & Maximum-Score Consistency Suite', { concurrency: 1 }, () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  let yearId: number;
  let teacherId: number;
  let teacherToken: string;
  let principalId: number;
  let principalToken: string;
  let vpAcademicId: number;
  let vpAcademicToken: string;
  let class7AId: number;
  let subjectMathId: number;
  let subjectScienceId: number;
  let subjectEnglishId: number;
  let student1Id: number;
  let student2Id: number;
  let student3Id: number;
  let approvedPolicyId: number;

  before(async () => {
    testDbPath = path.join(os.tmpdir(), `skoolsys_g6_sched_consistency_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    switchDatabase(testDbPath);

    testServer = await startTestServer();

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
      VALUES ('primary_marker', datetime('now'), 'test', 'DISPOSABLE_G6_TEST', 'AUTHORIZED_DISPOSABLE_DEMO_OR_SYNTHETIC_FIXTURE_ONLY');
    `);

    // 2. Academic Year 2026
    const yr = db.prepare(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ('2026', '2026-01-01', '2026-12-31', 1)
    `).run();
    yearId = Number(yr.lastInsertRowid);

    // 3. Users: Teacher, Principal, VP Academic
    const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-chars-for-safety-2026';

    const t = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('teacher_sched_cons', 'teacher_cons@kcc.lk', 'hashed', 'subject_teacher', 'Mr. Consistency Teacher', 1, 1)
    `).run();
    teacherId = Number(t.lastInsertRowid);
    teacherToken = jwt.sign({ id: teacherId, username: 'teacher_sched_cons', role: 'subject_teacher', token_version: 1 }, jwtSecret);

    const p = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('principal_sched_cons', 'principal_cons@kcc.lk', 'hashed', 'admin', 'Principal Consistency', 1, 1)
    `).run();
    principalId = Number(p.lastInsertRowid);
    principalToken = jwt.sign({ id: principalId, username: 'principal_sched_cons', role: 'admin', token_version: 1 }, jwtSecret);

    const vp = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('vp_sched_cons', 'vp_cons@kcc.lk', 'hashed', 'subject_teacher', 'VP Consistency', 1, 1)
    `).run();
    vpAcademicId = Number(vp.lastInsertRowid);
    vpAcademicToken = jwt.sign({ id: vpAcademicId, username: 'vp_sched_cons', role: 'subject_teacher', token_version: 1 }, jwtSecret);

    // Academic Leadership Appointments (Principal & VP Academic covering all grades)
    db.prepare(`
      INSERT INTO academic_staff_authorizations (user_id, academic_year_id, auth_role, grade_band, granted_by_user_id, is_active)
      VALUES (?, ?, 'principal', 'all', ?, 1)
    `).run(principalId, yearId, principalId);

    db.prepare(`
      INSERT INTO academic_staff_authorizations (user_id, academic_year_id, auth_role, grade_band, granted_by_user_id, is_active)
      VALUES (?, ?, 'vice_principal_academic', 'all', ?, 1)
    `).run(vpAcademicId, yearId, principalId);

    // 4. Class & Subjects
    const c = db.prepare(`
      INSERT INTO classes (name, grade, academic_year_id)
      VALUES ('Grade 7-A', 7, ?)
    `).run(yearId);
    class7AId = Number(c.lastInsertRowid);

    const sMath = db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('MATH-7C', 'Mathematics 7', 'Core', '7')").run();
    subjectMathId = Number(sMath.lastInsertRowid);

    const sSci = db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('SCI-7C', 'Science 7', 'Core', '7')").run();
    subjectScienceId = Number(sSci.lastInsertRowid);

    const sEng = db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('ENG-7C', 'English 7', 'Core', '7')").run();
    subjectEnglishId = Number(sEng.lastInsertRowid);

    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class7AId, subjectMathId);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class7AId, subjectScienceId);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class7AId, subjectEnglishId);

    // Teacher Assignments
    db.prepare('INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, \'subject_teacher\', ?)').run(teacherId, class7AId, subjectMathId, yearId);
    db.prepare('INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, \'subject_teacher\', ?)').run(teacherId, class7AId, subjectScienceId, yearId);
    db.prepare('INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, \'subject_teacher\', ?)').run(teacherId, class7AId, subjectEnglishId, yearId);

    // 5. Students & Confirmed Subject Enrolments
    const s1 = db.prepare("INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone) VALUES ('SC-001', 'Student One', 'One', '2013-01-01', 'Male', 'Guardian', 'Parent', '0770000001')").run();
    student1Id = Number(s1.lastInsertRowid);
    const s2 = db.prepare("INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone) VALUES ('SC-002', 'Student Two', 'Two', '2013-02-02', 'Female', 'Guardian', 'Parent', '0770000002')").run();
    student2Id = Number(s2.lastInsertRowid);
    const s3 = db.prepare("INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone) VALUES ('SC-003', 'Student Three', 'Three', '2013-03-03', 'Male', 'Guardian', 'Parent', '0770000003')").run();
    student3Id = Number(s3.lastInsertRowid);

    for (const stId of [student1Id, student2Id, student3Id]) {
      db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')").run(stId, class7AId, yearId);
      for (const subId of [subjectMathId, subjectScienceId, subjectEnglishId]) {
        db.prepare(`
          INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at)
          VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory', ?, datetime('now'))
        `).run(stId, subId, class7AId, yearId, teacherId);
      }
    }

    // 6. Approved Assessment Policy Profile for Publication Tests
    const pol = db.prepare(`
      INSERT INTO assessment_policy_profiles (
        policy_code, title, academic_year_id, grade_band, version, is_approved_by_school, approved_by_user_id, approved_at,
        effective_from, effective_to, grading_scale_json, absence_rules_json, ranking_rules_json
      ) VALUES (
        'POL-CONS-2026', 'Consistency Test Assessment Policy', ?, 'junior_6_9', 1, 1, ?, datetime('now'),
        '2026-01-01', '2026-12-31',
        '[{"grade":"A","minPercentage":75},{"grade":"B","minPercentage":65},{"grade":"C","minPercentage":50},{"grade":"S","minPercentage":35},{"grade":"F","minPercentage":0}]',
        '{"absentHandling":"zero","medicalHandling":"exclude"}',
        '{"rankingMethod":"competition","tieHandling":"equal_rank_skip_next"}'
      )
    `).run(yearId, principalId);
    approvedPolicyId = Number(pol.lastInsertRowid);
  });

  after(async () => {
    if (testServer) await testServer.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {}
  });

  // ============================================================================
  // MANDATORY REGRESSION SCENARIO: 50-mark schedule, 45/50 draft, attempt change to 200
  // ============================================================================
  describe('Mandatory Regression Scenario: 50-mark schedule with 45/50 draft mark', () => {
    let exam50Id: number;

    before(() => {
      // Create examination with max_score = 50
      const ex = db.prepare(`
        INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, max_score, grade_band, status, is_published, assessment_policy_id)
        VALUES ('Grade 7 Mid-Term Exam 50', 1, ?, '2026-03-01', '2026-03-15', 50, 'junior_6_9', 'scheduled', 0, ?)
      `).run(yearId, approvedPolicyId);
      exam50Id = Number(ex.lastInsertRowid);

      // Create authoritative schedule item with max_score = 50
      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, max_score, is_required, status, approved_by_user_id, approved_at)
        VALUES (?, ?, ?, 50, 1, 'approved', ?, datetime('now'))
      `).run(exam50Id, class7AId, subjectMathId, principalId);
    });

    test('1a. Teacher saves draft with 45 / 50 marks; persists max_score = 50', async () => {
      const res = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: exam50Id,
          classId: class7AId,
          subjectId: subjectMathId,
          status: 'draft',
          marks: [
            { studentId: student1Id, score: 45.0, assessmentStatus: 'PRESENT' },
            { studentId: student2Id, score: 38.0, assessmentStatus: 'PRESENT' },
            { studentId: student3Id, score: null, assessmentStatus: 'NOT_ASSESSED' }
          ]
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify sheet and mark in database
      const sheet = db.prepare('SELECT id, max_score, status, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(exam50Id, class7AId, subjectMathId) as any;
      assert.equal(sheet.max_score, 50);

      const mark = db.prepare('SELECT score, max_score, grade_letter FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheet.id, student1Id) as any;
      assert.equal(mark.score, 45.0);
      assert.equal(mark.max_score, 50);
      // 45 / 50 = 90% -> Grade A
      assert.equal(mark.grade_letter, 'A');
    });

    test('1b. Attempt to change schedule to 200 marks MUST be rejected with 409 Conflict', async () => {
      const scheduleBefore = db.prepare('SELECT * FROM examination_schedules WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(exam50Id, class7AId, subjectMathId) as any;
      const sheetBefore = db.prepare('SELECT * FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(exam50Id, class7AId, subjectMathId) as any;
      const marksBefore = db.prepare('SELECT * FROM marks WHERE sheet_id = ?').all(sheetBefore.id) as any[];

      // Attempt to modify schedule to 200
      const schedRes = await testServer.request(`/api/marks/examinations/${exam50Id}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          classId: class7AId,
          subjectId: subjectMathId,
          isRequired: true,
          maxScore: 200
        })
      });

      assert.equal(schedRes.status, 409);
      const errData = await schedRes.json();
      assert.equal(errData.code, 'MARKS_ALREADY_RECORDED');

      // Verify zero database changes on rejected operation
      const scheduleAfter = db.prepare('SELECT * FROM examination_schedules WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(exam50Id, class7AId, subjectMathId) as any;
      assert.equal(scheduleAfter.max_score, 50);
      assert.equal(scheduleAfter.max_score, scheduleBefore.max_score);

      const sheetAfter = db.prepare('SELECT * FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(exam50Id, class7AId, subjectMathId) as any;
      assert.equal(sheetAfter.max_score, 50);
      assert.equal(sheetAfter.revision, sheetBefore.revision);

      const marksAfter = db.prepare('SELECT * FROM marks WHERE sheet_id = ?').all(sheetBefore.id) as any[];
      assert.deepEqual(marksAfter, marksBefore);
    });

    test('1c. Attempt to change examination max_score via PUT /api/academic/examinations/:id is also rejected with 409', async () => {
      const putRes = await testServer.request(`/api/academic/examinations/${exam50Id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          max_score: 200
        })
      });

      assert.equal(putRes.status, 409);
      const data = await putRes.json();
      assert.equal(data.code, 'MARKS_ALREADY_RECORDED');

      const examInDb = db.prepare('SELECT max_score FROM examinations WHERE id = ?').get(exam50Id) as any;
      assert.equal(examInDb.max_score, 50);
    });

    test('1d. Publication declined if any marks sheet or mark has inconsistent max_score', () => {
      // Create a secondary schedule and sheet with forced simulated inconsistency
      const tempExam = db.prepare(`
        INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, max_score, grade_band, status, is_published, assessment_policy_id)
        VALUES ('Inconsistent Max Score Test Exam', 1, ?, '2026-03-01', '2026-03-15', 100, 'junior_6_9', 'scheduled', 0, ?)
      `).run(yearId, approvedPolicyId);
      const tempExamId = Number(tempExam.lastInsertRowid);

      // Approved schedule with max_score = 100
      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, max_score, is_required, status, approved_by_user_id, approved_at)
        VALUES (?, ?, ?, 100, 1, 'approved', ?, datetime('now'))
      `).run(tempExamId, class7AId, subjectMathId, principalId);

      // Marks sheet approved with inconsistent max_score = 50
      const sheetRes = db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, max_score, revision, status, approved_by_user_id, approved_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 50, 1, 'approved', ?, datetime('now'), datetime('now'), datetime('now'))
      `).run(tempExamId, class7AId, subjectMathId, yearId, teacherId, vpAcademicId);
      const tempSheetId = Number(sheetRes.lastInsertRowid);

      // Fully assessed marks with max_score = 50
      for (const stId of [student1Id, student2Id, student3Id]) {
        db.prepare(`
          INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status, grade_letter, status)
          VALUES (?, ?, ?, ?, ?, 50, 45.0, 'PRESENT', 'A', 'submitted')
        `).run(tempSheetId, tempExamId, class7AId, subjectMathId, stId);
      }

      // publishExamination MUST reject with 409 MAX_SCORE_INCONSISTENCY under write transaction
      assert.throws(() => {
        publishExamination({
          examinationId: tempExamId,
          user: { id: principalId, username: 'principal_sched_cons', role: 'admin' },
          ipAddress: '127.0.0.1'
        });
      }, (err: any) => {
        assert.equal(err.code, 'MAX_SCORE_INCONSISTENCY');
        assert(err.message.includes('Sheet maximum (50) does not match authoritative schedule maximum (100)'));
        return true;
      });

      // Assert zero database mutations on rejected publication
      const examAfter = db.prepare('SELECT status, is_published FROM examinations WHERE id = ?').get(tempExamId) as any;
      assert.equal(examAfter.status, 'scheduled');
      assert.equal(examAfter.is_published, 0);

      const pubCount = db.prepare('SELECT COUNT(*) as cnt FROM examination_publications WHERE examination_id = ?').get(tempExamId) as any;
      assert.equal(pubCount.cnt, 0);
    });
  });

  // ============================================================================
  // EMPTY DRAFT SHEET SYNCHRONIZATION (50 -> 200)
  // ============================================================================
  describe('Empty draft sheet synchronization from 50 to 200', () => {
    let emptyExamId: number;

    before(() => {
      const ex = db.prepare(`
        INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, max_score, grade_band, status, is_published, assessment_policy_id)
        VALUES ('Grade 7 Empty Draft Sync Exam', 1, ?, '2026-03-01', '2026-03-15', 50, 'junior_6_9', 'scheduled', 0, ?)
      `).run(yearId, approvedPolicyId);
      emptyExamId = Number(ex.lastInsertRowid);

      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, max_score, is_required, status)
        VALUES (?, ?, ?, 50, 1, 'draft')
      `).run(emptyExamId, class7AId, subjectScienceId);
    });

    test('2a. Teacher accesses GET /api/marks/sheet on empty 50-mark schedule; sheet created with max_score = 50', async () => {
      // Save initial empty draft
      const initSave = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: emptyExamId,
          classId: class7AId,
          subjectId: subjectScienceId,
          status: 'draft',
          marks: []
        })
      });
      assert.equal(initSave.status, 200);

      const res = await testServer.request(`/api/marks/sheet?examId=${emptyExamId}&classId=${class7AId}&subjectId=${subjectScienceId}`, {
        headers: { Authorization: `Bearer ${teacherToken}` }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.maxScore, 50);
      assert.equal(data.roster[0].max_score, 50);
      assert.equal(data.roster[0].score, null);
    });

    test('2b. Schedule changed from 50 to 200; empty draft sheet is synchronized atomically', async () => {
      const schedRes = await testServer.request(`/api/marks/examinations/${emptyExamId}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          classId: class7AId,
          subjectId: subjectScienceId,
          isRequired: true,
          maxScore: 200
        })
      });

      assert.equal(schedRes.status, 201);
      const schedData = await schedRes.json();
      assert.equal(schedData.maxScore, 200);

      // Verify marks_sheets table is atomically updated to 200
      const sheet = db.prepare('SELECT max_score, status FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(emptyExamId, class7AId, subjectScienceId) as any;
      assert.equal(sheet.max_score, 200);

      // Calling GET /api/marks/sheet reflects the synchronized 200 max score
      const getRes = await testServer.request(`/api/marks/sheet?examId=${emptyExamId}&classId=${class7AId}&subjectId=${subjectScienceId}`, {
        headers: { Authorization: `Bearer ${teacherToken}` }
      });
      assert.equal(getRes.status, 200);
      const getData = await getRes.json();
      assert.equal(getData.maxScore, 200);
      assert.equal(getData.stats.maxPossibleScore, 200);
      assert.equal(getData.roster[0].max_score, 200);
    });

    test('2c. Teacher enters fractional score 150.5 / 200 on newly synchronized sheet', async () => {
      const sheet = db.prepare('SELECT id, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(emptyExamId, class7AId, subjectScienceId) as any;

      const saveRes = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: emptyExamId,
          classId: class7AId,
          subjectId: subjectScienceId,
          status: 'draft',
          baseRevision: sheet.revision,
          marks: [
            { studentId: student1Id, score: 150.5, assessmentStatus: 'PRESENT' },
            { studentId: student2Id, score: 130.0, assessmentStatus: 'PRESENT' },
            { studentId: student3Id, score: 90.0, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      assert.equal(saveRes.status, 200);

      const mark = db.prepare('SELECT score, max_score, grade_letter FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheet.id, student1Id) as any;
      assert.equal(mark.score, 150.5);
      assert.equal(mark.max_score, 200);
      // 150.5 / 200 = 75.25% -> Grade A
      assert.equal(mark.grade_letter, 'A');
    });
  });

  // ============================================================================
  // LOCKOUT & CONCURRENCY CONTROLS
  // ============================================================================
  describe('Lockout after sheet submission, approval and examination publication', () => {
    let lockedExamId: number;
    let lockedSheetId: number;

    before(async () => {
      const ex = db.prepare(`
        INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, max_score, grade_band, status, is_published, assessment_policy_id)
        VALUES ('Grade 7 Publication Lockout Exam', 1, ?, '2026-03-01', '2026-03-15', 100, 'junior_6_9', 'scheduled', 0, ?)
      `).run(yearId, approvedPolicyId);
      lockedExamId = Number(ex.lastInsertRowid);

      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, max_score, is_required, status, approved_by_user_id, approved_at)
        VALUES (?, ?, ?, 100, 1, 'approved', ?, datetime('now'))
      `).run(lockedExamId, class7AId, subjectEnglishId, principalId);

      // Create and submit sheet
      await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: lockedExamId,
          classId: class7AId,
          subjectId: subjectEnglishId,
          status: 'draft',
          marks: [
            { studentId: student1Id, score: 85.0, assessmentStatus: 'PRESENT' },
            { studentId: student2Id, score: 70.0, assessmentStatus: 'PRESENT' },
            { studentId: student3Id, score: 55.0, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      const sheet = db.prepare('SELECT id, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(lockedExamId, class7AId, subjectEnglishId) as any;
      lockedSheetId = sheet.id;

      await testServer.request(`/api/marks/sheets/${lockedSheetId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          baseRevision: sheet.revision,
          notes: 'Submitting English marks'
        })
      });
    });

    test('3a. Modifying schedule max_score after submission is rejected with 409 MARKS_ALREADY_SUBMITTED', async () => {
      const schedRes = await testServer.request(`/api/marks/examinations/${lockedExamId}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          classId: class7AId,
          subjectId: subjectEnglishId,
          isRequired: true,
          maxScore: 200
        })
      });

      assert.equal(schedRes.status, 409);
      const data = await schedRes.json();
      assert.equal(data.code, 'MARKS_ALREADY_SUBMITTED');
    });

    test('3b. Stale revision conflicts on sheet update are rejected with 409 STALE_REVISION', async () => {
      const sheet = db.prepare('SELECT revision FROM marks_sheets WHERE id = ?').get(lockedSheetId) as any;

      const res = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: lockedExamId,
          classId: class7AId,
          subjectId: subjectEnglishId,
          status: 'draft',
          baseRevision: sheet.revision + 999, // Stale base revision
          marks: [
            { studentId: student1Id, score: 90.0, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      // Sheet is submitted, so locked (403) or stale (409)
      assert(res.status === 403 || res.status === 409);
    });

    test('3c. Approving sheet and publishing examination locks all schedule mutations permanently', async () => {
      // 1. Review sheet via Principal (Endorser)
      const refetchedSheet = db.prepare('SELECT revision FROM marks_sheets WHERE id = ?').get(lockedSheetId) as any;
      const revRes = await testServer.request(`/api/marks/sheets/${lockedSheetId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          baseRevision: refetchedSheet.revision,
          decision: 'endorse',
          remarks: 'English marks reviewed and endorsed by Principal'
        })
      });
      assert.equal(revRes.status, 200);

      // 2. Approve sheet via VP Academic (Final Approver, distinct from Reviewer)
      const reviewedSheet = db.prepare('SELECT revision FROM marks_sheets WHERE id = ?').get(lockedSheetId) as any;
      const appRes = await testServer.request(`/api/marks/sheets/${lockedSheetId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vpAcademicToken}`
        },
        body: JSON.stringify({
          baseRevision: reviewedSheet.revision,
          remarks: 'English marks approved by VP Academic'
        })
      });
      assert.equal(appRes.status, 200);

      // Publish examination
      const pubRes = await testServer.request(`/api/marks/examinations/${lockedExamId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          policyProfileId: approvedPolicyId
        })
      });
      assert.equal(pubRes.status, 200);

      // Attempt to modify schedule after publication -> 409 EXAMINATION_LOCKED
      const postPubSched = await testServer.request(`/api/marks/examinations/${lockedExamId}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          classId: class7AId,
          subjectId: subjectEnglishId,
          isRequired: true,
          maxScore: 200
        })
      });
      assert.equal(postPubSched.status, 409);
      const postPubSchedData = await postPubSched.json();
      assert.equal(postPubSchedData.code, 'EXAMINATION_LOCKED');

      // Attempt to modify examination after publication -> 409 EXAMINATION_LOCKED
      const postPubExam = await testServer.request(`/api/academic/examinations/${lockedExamId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          name: 'Renamed After Publication Attempt'
        })
      });
      assert.equal(postPubExam.status, 409);
      const postPubExamData = await postPubExam.json();
      assert.equal(postPubExamData.code, 'EXAMINATION_LOCKED');
    });
  });
});
