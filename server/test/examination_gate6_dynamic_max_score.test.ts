import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { db, switchDatabase } from '../src/db/database.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { calcGradeLetter, evaluateProvisionalGrade } from '../src/services/marksWorkflowService.js';
import { calculateSubjectGrade } from '../src/services/assessmentPolicyService.js';

describe('G6-03: Dynamic Maximum Marks & Grade Display Test Suite (50, 100, 200)', { concurrency: 1 }, () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  let yearId: number;
  let teacherId: number;
  let teacherToken: string;
  let principalId: number;
  let principalToken: string;
  let class7AId: number;
  let subjectMathId: number;
  let student1Id: number;
  let student2Id: number;
  let student3Id: number;
  let examId: number;

  before(async () => {
    testDbPath = path.join(os.tmpdir(), `skoolsys_g6_max_score_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    switchDatabase(testDbPath);

    testServer = await startTestServer({
      DB_PATH: testDbPath,
      JWT_SECRET: 'gate6_dynamic_max_score_secret_xyz'
    });

    // 1. Stamp disposable marker
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

    // 2. Academic Year
    const yr = db.prepare(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ('2026', '2026-01-01', '2026-12-31', 1)
    `).run();
    yearId = Number(yr.lastInsertRowid);

    // 3. Teacher User & Principal User
    const t = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('teacher_g6', 'teacher_g6@kcc.lk', 'hashed', 'subject_teacher', 'Mr. G6 Test Teacher', 1, 1)
    `).run();
    teacherId = Number(t.lastInsertRowid);
    teacherToken = jwt.sign({ id: teacherId, username: 'teacher_g6', role: 'subject_teacher', token_version: 1 }, process.env.JWT_SECRET || 'gate6_dynamic_max_score_secret_xyz');

    const p = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
      VALUES ('principal_g6', 'principal_g6@kcc.lk', 'hashed', 'admin', 'Principal G6', 1, 1)
    `).run();
    principalId = Number(p.lastInsertRowid);
    principalToken = jwt.sign({ id: principalId, username: 'principal_g6', role: 'admin', token_version: 1 }, process.env.JWT_SECRET || 'gate6_dynamic_max_score_secret_xyz');
    db.prepare(`
      INSERT INTO academic_staff_authorizations (user_id, academic_year_id, auth_role, grade_band, granted_by_user_id)
      VALUES (?, ?, 'principal', 'all', ?)
    `).run(principalId, yearId, principalId);

    // 4. Class & Subject
    const c = db.prepare(`
      INSERT INTO classes (name, grade, room_number, academic_year_id)
      VALUES ('Grade 7-A', 7, 'Room 7A', ?)
    `).run(yearId);
    class7AId = Number(c.lastInsertRowid);

    const s = db.prepare(`
      INSERT INTO subjects (code, name, category, grade_level)
      VALUES ('MATH-7', 'Mathematics', 'Core', '7')
    `).run();
    subjectMathId = Number(s.lastInsertRowid);

    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class7AId, subjectMathId);

    // 5. Teacher Assignment
    db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
      VALUES (?, ?, ?, 'subject_teacher', ?)
    `).run(teacherId, class7AId, subjectMathId, yearId);

    // 6. Students & Enrolments
    const s1 = db.prepare("INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone) VALUES ('G6-001', 'Student Alpha', 'Alpha', '2013-01-01', 'Male', 'Guardian', 'Parent', '0770000001')").run();
    student1Id = Number(s1.lastInsertRowid);
    const s2 = db.prepare("INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone) VALUES ('G6-002', 'Student Beta', 'Beta', '2013-02-02', 'Female', 'Guardian', 'Parent', '0770000002')").run();
    student2Id = Number(s2.lastInsertRowid);
    const s3 = db.prepare("INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone) VALUES ('G6-003', 'Student Gamma', 'Gamma', '2013-03-03', 'Male', 'Guardian', 'Parent', '0770000003')").run();
    student3Id = Number(s3.lastInsertRowid);

    for (const stId of [student1Id, student2Id, student3Id]) {
      db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')").run(stId, class7AId, yearId);
      db.prepare("INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at) VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory', ?, datetime('now'))").run(stId, subjectMathId, class7AId, yearId, teacherId);
    }

    // 7. Examination configured with authoritative max_score = 50
    const ex = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, max_score, status, is_published)
      VALUES ('Term 1 Dynamic Max Exam', 1, ?, '2026-03-01', '2026-03-15', 50, 'scheduled', 0)
    `).run(yearId);
    examId = Number(ex.lastInsertRowid);
    db.prepare(`
      INSERT INTO examination_schedules (examination_id, class_id, subject_id, max_score, is_required)
      VALUES (?, ?, ?, 50, 1)
    `).run(examId, class7AId, subjectMathId);
  });

  after(async () => {
    if (testServer) await testServer.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {}
  });

  describe('1. Assessment with Maximum Score = 50', () => {
    test('1a. Unit: calcGradeLetter normalizes against maxScore = 50 correctly', () => {
      // 40 / 50 = 80% -> 'A'
      assert.equal(calcGradeLetter(40, 'PRESENT', 50), 'A');
      // 37.5 / 50 = 75% -> 'A'
      assert.equal(calcGradeLetter(37.5, 'PRESENT', 50), 'A');
      // 32.5 / 50 = 65% -> 'B'
      assert.equal(calcGradeLetter(32.5, 'PRESENT', 50), 'B');
      // 25 / 50 = 50% -> 'C'
      assert.equal(calcGradeLetter(25, 'PRESENT', 50), 'C');
      // 17.5 / 50 = 35% -> 'S' (Pass)
      assert.equal(calcGradeLetter(17.5, 'PRESENT', 50), 'S');
      // 15 / 50 = 30% -> 'F' (Fail)
      assert.equal(calcGradeLetter(15, 'PRESENT', 50), 'F');
    });

    test('1b. HTTP POST /api/marks/sheet saves draft marks out of 50 and preserves maxScore = 50', async () => {
      const res = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId,
          classId: class7AId,
          subjectId: subjectMathId,
          status: 'draft',
          marks: [
            { studentId: student1Id, score: 40, maxScore: 50, assessmentStatus: 'PRESENT' },
            { studentId: student2Id, score: 37.5, maxScore: 50, assessmentStatus: 'PRESENT' },
            { studentId: student3Id, score: 17.5, maxScore: 50, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify records in database have max_score = 50 and normalized grade letters
      const marksInDb = db.prepare('SELECT student_id, score, max_score, grade_letter FROM marks WHERE sheet_id = ? ORDER BY student_id ASC').all(data.sheetId) as any[];
      assert.equal(marksInDb.length, 3);
      assert.equal(marksInDb[0].max_score, 50);
      assert.equal(marksInDb[0].score, 40);
      assert.equal(marksInDb[0].grade_letter, 'A');

      assert.equal(marksInDb[1].max_score, 50);
      assert.equal(marksInDb[1].score, 37.5);
      assert.equal(marksInDb[1].grade_letter, 'A');

      assert.equal(marksInDb[2].max_score, 50);
      assert.equal(marksInDb[2].score, 17.5);
      assert.equal(marksInDb[2].grade_letter, 'S');
    });

    test('1c. HTTP GET /api/marks/sheet returns dynamic maxScore = 50 and correct pass rate', async () => {
      const res = await testServer.request(`/api/marks/sheet?examId=${examId}&classId=${class7AId}&subjectId=${subjectMathId}`, {
        headers: {
          Authorization: `Bearer ${teacherToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.maxScore, 50);
      assert.equal(data.stats.maxPossibleScore, 50);
      // All 3 students (40, 37.5, 17.5) scored >= 17.5 (35% of 50) -> 100% pass rate
      assert.equal(data.stats.passRate, 100);
      assert.equal(data.stats.gradeCounts.A, 2);
      assert.equal(data.stats.gradeCounts.S, 1);
    });

    test('1d. Rejects scores exceeding maxScore = 50 (e.g. 55 on maxScore 50)', async () => {
      const sheet = db.prepare('SELECT id, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(examId, class7AId, subjectMathId) as any;

      const res = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId,
          classId: class7AId,
          subjectId: subjectMathId,
          status: 'draft',
          baseRevision: sheet.revision,
          marks: [
            { studentId: student1Id, score: 55, maxScore: 50, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code, 'SCORE_OUT_OF_BOUNDS');
    });
  });

  describe('2. Assessment with Maximum Score = 200', () => {
    before(() => {
      db.prepare('UPDATE examination_schedules SET max_score = 200 WHERE examination_id = ? AND class_id = ? AND subject_id = ?').run(examId, class7AId, subjectMathId);
      db.prepare('UPDATE marks_sheets SET max_score = 200 WHERE examination_id = ? AND class_id = ? AND subject_id = ?').run(examId, class7AId, subjectMathId);
    });

    test('2a. Unit: calcGradeLetter normalizes against maxScore = 200 correctly', () => {
      // 150 / 200 = 75% -> 'A'
      assert.equal(calcGradeLetter(150, 'PRESENT', 200), 'A');
      // 130 / 200 = 65% -> 'B'
      assert.equal(calcGradeLetter(130, 'PRESENT', 200), 'B');
      // 100 / 200 = 50% -> 'C'
      assert.equal(calcGradeLetter(100, 'PRESENT', 200), 'C');
      // 90 / 200 = 45% -> 'S' (Pass)
      assert.equal(calcGradeLetter(90, 'PRESENT', 200), 'S');
      // 60 / 200 = 30% -> 'F' (Fail)
      assert.equal(calcGradeLetter(60, 'PRESENT', 200), 'F');
    });

    test('2b. HTTP POST /api/marks/sheet saves draft marks out of 200 and preserves maxScore = 200', async () => {
      const sheet = db.prepare('SELECT id, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(examId, class7AId, subjectMathId) as any;

      const res = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId,
          classId: class7AId,
          subjectId: subjectMathId,
          status: 'draft',
          baseRevision: sheet.revision,
          marks: [
            { studentId: student1Id, score: 150, maxScore: 200, assessmentStatus: 'PRESENT' },
            { studentId: student2Id, score: 130.5, maxScore: 200, assessmentStatus: 'PRESENT' },
            { studentId: student3Id, score: 60, maxScore: 200, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      assert.equal(res.status, 200);

      // Verify records in database have max_score = 200 and normalized grade letters
      const marksInDb = db.prepare('SELECT student_id, score, max_score, grade_letter FROM marks WHERE sheet_id = ? ORDER BY student_id ASC').all(sheet.id) as any[];
      assert.equal(marksInDb[0].max_score, 200);
      assert.equal(marksInDb[0].score, 150);
      assert.equal(marksInDb[0].grade_letter, 'A');

      assert.equal(marksInDb[1].max_score, 200);
      assert.equal(marksInDb[1].score, 130.5);
      assert.equal(marksInDb[1].grade_letter, 'B');

      assert.equal(marksInDb[2].max_score, 200);
      assert.equal(marksInDb[2].score, 60);
      assert.equal(marksInDb[2].grade_letter, 'F');
    });

    test('2c. HTTP GET /api/marks/sheet returns dynamic maxScore = 200 and pass rate based on 200', async () => {
      const res = await testServer.request(`/api/marks/sheet?examId=${examId}&classId=${class7AId}&subjectId=${subjectMathId}`, {
        headers: {
          Authorization: `Bearer ${teacherToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.maxScore, 200);
      assert.equal(data.stats.maxPossibleScore, 200);
      // 2 students passed (150 and 130.5 >= 70 [35% of 200]), 1 failed (60 < 70) -> 67%
      assert.equal(data.stats.passRate, 67);
      assert.equal(data.stats.gradeCounts.A, 1);
      assert.equal(data.stats.gradeCounts.B, 1);
      assert.equal(data.stats.gradeCounts.F, 1);
    });

    test('2d. Rejects scores exceeding maxScore = 200 (e.g. 210 on maxScore 200)', async () => {
      const sheet = db.prepare('SELECT id, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(examId, class7AId, subjectMathId) as any;

      const res = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId,
          classId: class7AId,
          subjectId: subjectMathId,
          status: 'draft',
          baseRevision: sheet.revision,
          marks: [
            { studentId: student1Id, score: 210, maxScore: 200, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code, 'SCORE_OUT_OF_BOUNDS');
    });
  });

  describe('3. Fractional Score Precision & Policy Rules', () => {
    test('3a. Preserves single-decimal precision (e.g. 84.5 on maxScore 100) and calculates percentage', () => {
      const res = evaluateProvisionalGrade(84.5, 'PRESENT', 100);
      assert.equal(res.percentage, 84.5);
      assert.equal(res.gradeLetter, 'A');
      assert.equal(res.isProvisional, true);
    });

    test('3b. Rejects scores with more than 1 decimal place (e.g. 84.55)', async () => {
      const sheet = db.prepare('SELECT id, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(examId, class7AId, subjectMathId) as any;

      const res = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId,
          classId: class7AId,
          subjectId: subjectMathId,
          status: 'draft',
          baseRevision: sheet.revision,
          marks: [
            { studentId: student1Id, score: 84.55, maxScore: 100, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code, 'INVALID_SCORE_PRECISION');
    });

    test('3c. calculateSubjectGrade normalizes percentage and applies custom grading scales correctly', () => {
      const customPolicy: any = {
        grading_scale_json: JSON.stringify([
          { grade: 'A*', minPercentage: 90 },
          { grade: 'A', minPercentage: 75 },
          { grade: 'B', minPercentage: 60 },
          { grade: 'C', minPercentage: 45 },
          { grade: 'S', minPercentage: 35 },
          { grade: 'F', minPercentage: 0 }
        ])
      };

      // Score 46 on maxScore 50 = 92% -> 'A*'
      const res50 = calculateSubjectGrade(46, 50, 'PRESENT', customPolicy);
      assert.equal(res50.normalizedPercentage, 92);
      assert.equal(res50.gradeLetter, 'A*');

      // Score 152 on maxScore 200 = 76% -> 'A'
      const res200 = calculateSubjectGrade(152, 200, 'PRESENT', customPolicy);
      assert.equal(res200.normalizedPercentage, 76);
      assert.equal(res200.gradeLetter, 'A');
    });
  });

  describe('4. Authoritative Examination & Schedule Max Score Specification (FIX C Acceptance)', () => {
    let newExam200Id: number;
    let subjectScienceId: number;

    before(() => {
      const s = db.prepare(`
        INSERT INTO subjects (code, name, category, grade_level)
        VALUES ('SCI-7', 'Science', 'Core', '7')
      `).run();
      subjectScienceId = Number(s.lastInsertRowid);
      db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class7AId, subjectScienceId);
      db.prepare(`
        INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
        VALUES (?, ?, ?, 'subject_teacher', ?)
      `).run(teacherId, class7AId, subjectScienceId, yearId);

      for (const stId of [student1Id, student2Id, student3Id]) {
        db.prepare("INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at) VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory', ?, datetime('now'))").run(stId, subjectScienceId, class7AId, yearId, teacherId);
      }
    });

    test('4a. Authoritative creation: Create a brand new examination with maxScore: 200 via POST /api/academic/examinations', async () => {
      const res = await testServer.request('/api/academic/examinations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          name: 'Grade 7 Annual 200-Mark Examination',
          academic_year_id: yearId,
          term: 3,
          grade_band: 'all',
          maxScore: 200
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.maxScore, 200);
      newExam200Id = Number(data.id || data.examinationId);

      const examInDb = db.prepare('SELECT max_score FROM examinations WHERE id = ?').get(newExam200Id) as any;
      assert.equal(examInDb.max_score, 200);
    });

    test('4b. Authoritative pre-load: Calling GET /api/marks/sheet before any marks exist returns maxScore: 200', async () => {
      const res = await testServer.request(`/api/marks/sheet?examId=${newExam200Id}&classId=${class7AId}&subjectId=${subjectMathId}`, {
        headers: {
          Authorization: `Bearer ${teacherToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.maxScore, 200);
      assert.equal(data.stats.maxPossibleScore, 200);
      assert(Array.isArray(data.roster));
      assert.equal(data.roster.length, 3);
      // Roster reflects authoritative 200 max score before the first mark is entered
      assert.equal(data.roster[0].max_score, 200);
      assert.equal(data.roster[0].score, null);
    });

    test('4c. Teacher enters 150.5/200: Saves draft and persists correctly', async () => {
      const res = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: newExam200Id,
          classId: class7AId,
          subjectId: subjectMathId,
          status: 'draft',
          marks: [
            { studentId: student1Id, score: 150.5, assessmentStatus: 'PRESENT' },
            { studentId: student2Id, score: 180.0, assessmentStatus: 'PRESENT' },
            { studentId: student3Id, score: null, assessmentStatus: 'NOT_ASSESSED' }
          ]
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });

    test('4d. Reload sheet: 150.5/200 persists and normalizes correctly to grade A', async () => {
      const res = await testServer.request(`/api/marks/sheet?examId=${newExam200Id}&classId=${class7AId}&subjectId=${subjectMathId}`, {
        headers: {
          Authorization: `Bearer ${teacherToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.maxScore, 200);
      const student1Mark = data.roster.find((r: any) => r.student_id === student1Id);
      assert(student1Mark);
      assert.equal(student1Mark.score, 150.5);
      assert.equal(student1Mark.max_score, 200);
      // 150.5 / 200 = 75.25% -> A
      assert.equal(student1Mark.grade_letter, 'A');
    });

    test('4e. Teacher cannot override authoritative max score via payload', async () => {
      const sheet = db.prepare('SELECT id, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(newExam200Id, class7AId, subjectMathId) as any;

      // Teacher attempts to supply maxScore: 50 in payload to alter official max score
      const res = await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: newExam200Id,
          classId: class7AId,
          subjectId: subjectMathId,
          status: 'draft',
          baseRevision: sheet.revision,
          marks: [
            { studentId: student1Id, score: 150.5, maxScore: 50, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      // Server uses authoritativeMaxScore (200), so 150.5 is still accepted (within [0, 200]), and sheet maxScore remains 200
      assert.equal(res.status, 200);
      const updatedSheet = db.prepare('SELECT max_score FROM marks_sheets WHERE id = ?').get(sheet.id) as any;
      assert.equal(updatedSheet.max_score, 200);
    });

    test('4f. Schedule-level max score override: Science assessment scheduled at maxScore: 50', async () => {
      const schedRes = await testServer.request(`/api/marks/examinations/${newExam200Id}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          classId: class7AId,
          subjectId: subjectScienceId,
          isRequired: true,
          maxScore: 50
        })
      });

      assert.equal(schedRes.status, 201);

      // GET sheet for Science before marks entry: returns schedule-configured maxScore: 50
      const getRes = await testServer.request(`/api/marks/sheet?examId=${newExam200Id}&classId=${class7AId}&subjectId=${subjectScienceId}`, {
        headers: {
          Authorization: `Bearer ${teacherToken}`
        }
      });

      assert.equal(getRes.status, 200);
      const sheetData = await getRes.json();
      assert.equal(sheetData.maxScore, 50);
      assert.equal(sheetData.stats.maxPossibleScore, 50);
      assert.equal(sheetData.roster[0].max_score, 50);
    });

    test('4g. Conflict protection: Incompatible max_score modifications blocked after marks submission', async () => {
      // 1. Submit the Math sheet
      const sheet = db.prepare('SELECT id, revision FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(newExam200Id, class7AId, subjectMathId) as any;
      
      // Ensure all 3 students are assessed before submission
      await testServer.request('/api/marks/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          examId: newExam200Id,
          classId: class7AId,
          subjectId: subjectMathId,
          status: 'draft',
          baseRevision: sheet.revision,
          marks: [
            { studentId: student1Id, score: 150.5, assessmentStatus: 'PRESENT' },
            { studentId: student2Id, score: 180.0, assessmentStatus: 'PRESENT' },
            { studentId: student3Id, score: 70.0, assessmentStatus: 'PRESENT' }
          ]
        })
      });

      const refetched = db.prepare('SELECT id, revision FROM marks_sheets WHERE id = ?').get(sheet.id) as any;
      const submitRes = await testServer.request(`/api/marks/sheets/${sheet.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          baseRevision: refetched.revision,
          notes: 'Submitting all marks'
        })
      });

      assert.equal(submitRes.status, 200);

      // 2. Attempt to modify examination max_score after marks have been submitted -> 409
      const putRes = await testServer.request(`/api/academic/examinations/${newExam200Id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalToken}`
        },
        body: JSON.stringify({
          max_score: 100
        })
      });

      assert.equal(putRes.status, 409);
      const putData = await putRes.json();
      assert.equal(putData.code, 'MARKS_ALREADY_SUBMITTED');
    });
  });
});
