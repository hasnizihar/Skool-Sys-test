import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { db, switchDatabase } from '../src/db/database.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { grantAcademicAuthorization } from '../src/services/academicAuthorizationService.js';
import { createAssessmentPolicyProfile, approveAssessmentPolicyProfile, PROVISIONAL_DEFAULT_GRADING_SCALE } from '../src/services/assessmentPolicyService.js';
import { ensureMarksSheet, submitMarksSheet, reviewMarksSheet, approveMarksSheet } from '../src/services/marksWorkflowService.js';
import { publishExamination } from '../src/services/examinationPublicationService.js';

describe('PR-005 Gate 5: Examination Functional Stabilization Test Suite (G5F-02, G5F-03, G5F-04)', { concurrency: 1 }, () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  // Years
  let year2025Id: number;
  let year2026Id: number;

  // Users
  let adminUserId: number;
  let principalUserId: number;
  let sectionHead2025JuniorId: number;
  let sectionHead2026JuniorId: number;
  let sectionHead2026OLId: number;
  let teacherMathId: number;
  let teacherScienceId: number;
  let teacherUnrelatedId: number;
  let deactivatedTeacherId: number;

  // Tokens
  let adminToken: string;
  let principalToken: string;
  let sectionHead2025JuniorToken: string;
  let sectionHead2026JuniorToken: string;
  let sectionHead2026OLToken: string;
  let teacherMathToken: string;
  let teacherScienceToken: string;
  let teacherUnrelatedToken: string;
  let deactivatedTeacherToken: string;

  // Classes & Subjects
  let class7AId: number;  // junior (year 2026)
  let class10AId: number; // OL (year 2026)
  let class7A2025Id: number; // junior (year 2025)

  let subjectMathId: number;
  let subjectScienceId: number;

  // Students
  let student1Id: number; // Kasun
  let student2Id: number; // Fazil
  let student3Id: number; // Nuwan

  // Examinations & Sheets
  let exam2026Term1Id: number;
  let exam2025Term1Id: number;
  let policyProfileId: number;

  let sheetMath7AId: number;
  let sheetScience7AId: number;
  let sheetMath10AId: number;
  let sheetMath7A2025Id: number;

  before(async () => {
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `skoolsys_g5_stabilization_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`);
    process.env.DB_PATH = testDbPath;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'gate5_stabilization_secret_2026_at_least_32_chars_long';
    switchDatabase(testDbPath);

    testServer = await startTestServer();

    // 1. Seed Academic Years
    const yr2025 = db.prepare(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ('2025', '2025-01-01', '2025-12-31', 0)
    `).run();
    year2025Id = Number(yr2025.lastInsertRowid);

    const yr2026 = db.prepare(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ('2026', '2026-01-01', '2026-12-31', 1)
    `).run();
    year2026Id = Number(yr2026.lastInsertRowid);

    // 2. Seed Users
    const insertUser = (username: string, role: string, fullName: string, isActive = 1) => {
      const res = db.prepare(`
        INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
        VALUES (?, ?, 'hashed_pw', ?, ?, ?, 1)
      `).run(username, `${username}@kcc.lk`, role, fullName, isActive);
      return Number(res.lastInsertRowid);
    };

    adminUserId = insertUser('g5_plain_admin', 'admin', 'Plain Administrator (No Academic Appt)');
    principalUserId = insertUser('g5_principal', 'subject_teacher', 'Principal Janaka (Synthetic Demo)');
    sectionHead2025JuniorId = insertUser('g5_sec_head_2025', 'subject_teacher', 'Section Head 2025 Junior');
    sectionHead2026JuniorId = insertUser('g5_sec_head_2026', 'subject_teacher', 'Section Head 2026 Junior');
    sectionHead2026OLId = insertUser('g5_sec_head_2026_ol', 'subject_teacher', 'Section Head 2026 OL');
    teacherMathId = insertUser('g5_teacher_math', 'subject_teacher', 'Mr. Samantha Silva (Math)');
    teacherScienceId = insertUser('g5_teacher_science', 'subject_teacher', 'Mr. Rohan Perera (Science)');
    teacherUnrelatedId = insertUser('g5_teacher_unrelated', 'subject_teacher', 'Teacher Unrelated');
    deactivatedTeacherId = insertUser('g5_teacher_deactivated', 'subject_teacher', 'Deactivated Teacher', 0);

    const makeToken = (id: number, username: string, role: string) => {
      return jwt.sign({ id, username, role, token_version: 1 }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    };

    adminToken = makeToken(adminUserId, 'g5_plain_admin', 'admin');
    principalToken = makeToken(principalUserId, 'g5_principal', 'subject_teacher');
    sectionHead2025JuniorToken = makeToken(sectionHead2025JuniorId, 'g5_sec_head_2025', 'subject_teacher');
    sectionHead2026JuniorToken = makeToken(sectionHead2026JuniorId, 'g5_sec_head_2026', 'subject_teacher');
    sectionHead2026OLToken = makeToken(sectionHead2026OLId, 'g5_sec_head_2026_ol', 'subject_teacher');
    teacherMathToken = makeToken(teacherMathId, 'g5_teacher_math', 'subject_teacher');
    teacherScienceToken = makeToken(teacherScienceId, 'g5_teacher_science', 'subject_teacher');
    teacherUnrelatedToken = makeToken(teacherUnrelatedId, 'g5_teacher_unrelated', 'subject_teacher');
    deactivatedTeacherToken = makeToken(deactivatedTeacherId, 'g5_teacher_deactivated', 'subject_teacher');

    // 3. Grant Academic Authorizations
    // Principal: year 2026, grade band 'all'
    grantAcademicAuthorization({
      userId: principalUserId,
      authRole: 'principal',
      academicYearId: year2026Id,
      gradeBand: 'all',
      grantedByUserId: adminUserId
    });

    // Section Head 2025: year 2025 ONLY, grade band 'junior_6_9'
    grantAcademicAuthorization({
      userId: sectionHead2025JuniorId,
      authRole: 'section_head',
      academicYearId: year2025Id,
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });

    // Section Head 2026 Junior: year 2026, grade band 'junior_6_9'
    grantAcademicAuthorization({
      userId: sectionHead2026JuniorId,
      authRole: 'section_head',
      academicYearId: year2026Id,
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });

    // Section Head 2026 OL: year 2026, grade band 'ol_10_11'
    grantAcademicAuthorization({
      userId: sectionHead2026OLId,
      authRole: 'section_head',
      academicYearId: year2026Id,
      gradeBand: 'ol_10_11',
      grantedByUserId: adminUserId
    });

    // 4. Classes
    const c7A = db.prepare(`
      INSERT INTO classes (name, grade, room_number, academic_year_id)
      VALUES ('Grade 7-A', 7, 'Room 101', ?)
    `).run(year2026Id);
    class7AId = Number(c7A.lastInsertRowid);

    const c10A = db.prepare(`
      INSERT INTO classes (name, grade, room_number, academic_year_id)
      VALUES ('Grade 10-A', 10, 'Room 201', ?)
    `).run(year2026Id);
    class10AId = Number(c10A.lastInsertRowid);

    const c7A2025 = db.prepare(`
      INSERT INTO classes (name, grade, room_number, academic_year_id)
      VALUES ('Grade 7-A (2025)', 7, 'Room 101', ?)
    `).run(year2025Id);
    class7A2025Id = Number(c7A2025.lastInsertRowid);

    // 5. Subjects
    const sMath = db.prepare(`
      INSERT INTO subjects (code, name, category, grade_level)
      VALUES ('MATH-J', 'Mathematics Junior', 'Core', 'junior')
    `).run();
    subjectMathId = Number(sMath.lastInsertRowid);

    const sSci = db.prepare(`
      INSERT INTO subjects (code, name, category, grade_level)
      VALUES ('SCI-J', 'Science Junior', 'Core', 'junior')
    `).run();
    subjectScienceId = Number(sSci.lastInsertRowid);

    // Link class subjects
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class7AId, subjectMathId);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class7AId, subjectScienceId);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class10AId, subjectMathId);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class7A2025Id, subjectMathId);

    // 6. Teacher Assignments
    // Math teacher assigned to 7-A Math in 2026
    db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
      VALUES (?, ?, ?, 'subject_teacher', ?)
    `).run(teacherMathId, class7AId, subjectMathId, year2026Id);

    // Science teacher assigned to 7-A Science in 2026
    db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
      VALUES (?, ?, ?, 'subject_teacher', ?)
    `).run(teacherScienceId, class7AId, subjectScienceId, year2026Id);

    // Math teacher also assigned to 7-A Math in 2025
    db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
      VALUES (?, ?, ?, 'subject_teacher', ?)
    `).run(teacherMathId, class7A2025Id, subjectMathId, year2025Id);

    // 7. Students & Enrollments
    const insStudent = (adm: string, name: string) => {
      const s = db.prepare(`
        INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status)
        VALUES (?, ?, ?, '2012-01-01', 'Male', 'Guardian', 'Father', '0770000000', 'Active')
      `).run(adm, name, name.split(' ')[0]);
      return Number(s.lastInsertRowid);
    };

    student1Id = insStudent('G5-001', 'Kasun Malinda Ranasinghe');
    student2Id = insStudent('G5-002', 'Mohamed Fazil');
    student3Id = insStudent('G5-003', 'Nuwan Perera');

    // Enroll students in 7A (2026)
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(student1Id, class7AId, year2026Id, 'enrolled');
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(student2Id, class7AId, year2026Id, 'enrolled');
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(student3Id, class7AId, year2026Id, 'enrolled');

    // Enroll students in subjects (confirmed core_compulsory)
    const insSubjEnroll = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at)
      VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory', ?, datetime('now'))
    `);
    for (const sid of [student1Id, student2Id, student3Id]) {
      insSubjEnroll.run(sid, subjectMathId, class7AId, year2026Id, principalUserId);
      insSubjEnroll.run(sid, subjectScienceId, class7AId, year2026Id, principalUserId);
    }

    // 8. Examinations
    const ex2026 = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, is_published, status)
      VALUES ('Term 1 Assessment 2026', 1, ?, '2026-03-01', '2026-03-15', 0, 'draft')
    `).run(year2026Id);
    exam2026Term1Id = Number(ex2026.lastInsertRowid);

    const ex2026T2 = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, is_published, status)
      VALUES ('Term 2 Assessment 2026', 2, ?, '2026-06-01', '2026-06-15', 0, 'draft')
    `).run(year2026Id);
    const exam2026Term2Id = Number(ex2026T2.lastInsertRowid);

    const ex2025 = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, is_published, status)
      VALUES ('Term 1 Assessment 2025', 1, ?, '2025-03-01', '2025-03-15', 0, 'draft')
    `).run(year2025Id);
    exam2025Term1Id = Number(ex2025.lastInsertRowid);

    // 9. Assessment Policy Profile
    const polRes = createAssessmentPolicyProfile({
      policyCode: 'KCC-SEC-STD-2026-V1',
      title: 'KCC Secondary Standard 2026 Policy',
      gradeBand: 'junior_6_9',
      academicYearId: year2026Id,
      gradingScale: PROVISIONAL_DEFAULT_GRADING_SCALE,
      user: { id: principalUserId, username: 'g5_principal', role: 'subject_teacher' }
    });
    policyProfileId = polRes.policy.id;
    approveAssessmentPolicyProfile(policyProfileId, { id: principalUserId, username: 'g5_principal', role: 'subject_teacher' });

    // 10. Initialize Marks Sheets
    // Sheet 1: 7-A Math (2026) - on Term 1 exam (will be published)
    const s1 = ensureMarksSheet(exam2026Term1Id, class7AId, subjectMathId, teacherMathId);
    sheetMath7AId = s1.id;

    // Sheet 2: 7-A Science (2026) - on Term 2 exam (stays draft/unpublished)
    const s2 = ensureMarksSheet(exam2026Term2Id, class7AId, subjectScienceId, teacherScienceId);
    sheetScience7AId = s2.id;

    // Sheet 3: 10-A Math (2026) - on Term 2 exam (stays draft/unpublished)
    const s3 = ensureMarksSheet(exam2026Term2Id, class10AId, subjectMathId, principalUserId);
    sheetMath10AId = s3.id;

    // Sheet 4: 7-A Math (2025)
    const s4 = ensureMarksSheet(exam2025Term1Id, class7A2025Id, subjectMathId, teacherMathId);
    sheetMath7A2025Id = s4.id;
  });

  after(async () => {
    await testServer?.close();
    switchDatabase();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch {}
  });

  // ==========================================================================
  // G5F-02: TEACHER MARKS DRAFT SAVING & ASSESSMENT STATUS INTEGRITY
  // ==========================================================================

  describe('G5F-02: Teacher Marks Draft Saving & Assessment Status Integrity', () => {
    test('1. Teacher saves draft marks preserving non-present assessment statuses without silent degradation', async () => {
      const payload = {
        baseRevision: 1,
        marks: [
          {
            studentId: student1Id,
            score: 85,
            maxScore: 100,
            assessmentStatus: 'PRESENT',
            remarks: 'Strong performance'
          },
          {
            studentId: student2Id,
            score: null,
            maxScore: 100,
            assessmentStatus: 'MEDICAL',
            remarks: 'Hospital certificate on file'
          },
          {
            studentId: student3Id,
            score: null,
            maxScore: 100,
            assessmentStatus: 'EXEMPT',
            remarks: 'Official school representation'
          }
        ]
      };

      const res = await testServer.request(`/api/marks/sheets/${sheetMath7AId}/save-draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherMathToken}`,
          'Content-Type': 'application/json'
        },
        body: payload
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.newRevision, 2);

      // Verify that database records preserved statuses accurately
      const marksInDb = db.prepare(`
        SELECT student_id, score, assessment_status, remarks, is_absent, is_exempt
        FROM marks
        WHERE sheet_id = ?
        ORDER BY student_id ASC
      `).all(sheetMath7AId) as any[];

      assert.equal(marksInDb.length, 3);

      const m1 = marksInDb.find((m) => m.student_id === student1Id);
      assert.equal(m1.assessment_status, 'PRESENT');
      assert.equal(m1.score, 85);
      assert.equal(m1.is_absent, 0);
      assert.equal(m1.is_exempt, 0);

      const m2 = marksInDb.find((m) => m.student_id === student2Id);
      assert.equal(m2.assessment_status, 'MEDICAL');
      assert.equal(m2.score, null, 'MEDICAL record score must remain null, never defaulted to 0');

      const m3 = marksInDb.find((m) => m.student_id === student3Id);
      assert.equal(m3.assessment_status, 'EXEMPT');
      assert.equal(m3.score, null, 'EXEMPT record score must remain null, never defaulted to 0');
    });

    test('2. Sheet reload returns canonical draft marks and preserved assessment statuses', async () => {
      const res = await testServer.request(`/api/marks/sheets/${sheetMath7AId}`, {
        headers: {
          Authorization: `Bearer ${teacherMathToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.sheet.id, sheetMath7AId);
      assert.equal(data.sheet.revision, 2);

      const roster = data.roster as any[];
      const m1 = roster.find((r) => r.student_id === student1Id)?.mark;
      const m2 = roster.find((r) => r.student_id === student2Id)?.mark;
      const m3 = roster.find((r) => r.student_id === student3Id)?.mark;

      assert.equal(m1.assessment_status, 'PRESENT');
      assert.equal(m1.score, 85);

      assert.equal(m2.assessment_status, 'MEDICAL');
      assert.equal(m2.score, null);

      assert.equal(m3.assessment_status, 'EXEMPT');
      assert.equal(m3.score, null);
    });

    test('3. Stale revision draft save fails with 409 STALE_REVISION and leaves database state unchanged', async () => {
      // Sheet revision is currently 2. Sending baseRevision: 1 must be rejected.
      const stalePayload = {
        baseRevision: 1,
        marks: [
          {
            studentId: student1Id,
            score: 99,
            maxScore: 100,
            assessmentStatus: 'PRESENT'
          }
        ]
      };

      const res = await testServer.request(`/api/marks/sheets/${sheetMath7AId}/save-draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherMathToken}`,
          'Content-Type': 'application/json'
        },
        body: stalePayload
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, 'STALE_REVISION');
      assert.equal(data.currentRevision, 2);

      // Verify that database was NOT modified
      const currentMark = db.prepare('SELECT score FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheetMath7AId, student1Id) as any;
      assert.equal(currentMark.score, 85, 'Mark score must remain 85 despite stale save attempt');
    });

    test('4. Unassigned teacher cannot save draft on sheet (403 UNASSIGNED_TEACHER)', async () => {
      const payload = {
        baseRevision: 2,
        marks: [
          {
            studentId: student1Id,
            score: 70,
            maxScore: 100,
            assessmentStatus: 'PRESENT'
          }
        ]
      };

      // teacherScience is not assigned to 7-A Math
      const res = await testServer.request(`/api/marks/sheets/${sheetMath7AId}/save-draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherScienceToken}`,
          'Content-Type': 'application/json'
        },
        body: payload
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'UNASSIGNED_TEACHER');
    });

    test('5. Non-present status with numeric score is rejected with 400 validation error', async () => {
      const invalidPayload = {
        baseRevision: 2,
        marks: [
          {
            studentId: student1Id,
            score: 55, // Invalid: MEDICAL cannot carry a numeric score
            maxScore: 100,
            assessmentStatus: 'MEDICAL'
          }
        ]
      };

      const res = await testServer.request(`/api/marks/sheets/${sheetMath7AId}/save-draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherMathToken}`,
          'Content-Type': 'application/json'
        },
        body: invalidPayload
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error?.includes('Numeric scores are strictly forbidden when non-present'));
    });

    test('6. Valid subsequent save with correct baseRevision advances revision and persists updates', async () => {
      const updatePayload = {
        baseRevision: 2,
        marks: [
          {
            studentId: student1Id,
            score: 92,
            maxScore: 100,
            assessmentStatus: 'PRESENT',
            remarks: 'Revised after checking section B'
          },
          {
            studentId: student2Id,
            score: null,
            maxScore: 100,
            assessmentStatus: 'MEDICAL',
            remarks: 'Doctor certificate verified'
          },
          {
            studentId: student3Id,
            score: null,
            maxScore: 100,
            assessmentStatus: 'ABSENT',
            remarks: 'Unexcused absence'
          }
        ]
      };

      const res = await testServer.request(`/api/marks/sheets/${sheetMath7AId}/save-draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherMathToken}`,
          'Content-Type': 'application/json'
        },
        body: updatePayload
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.newRevision, 3);

      const m1 = db.prepare('SELECT score, assessment_status FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheetMath7AId, student1Id) as any;
      assert.equal(m1.score, 92);

      const m3 = db.prepare('SELECT score, assessment_status FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheetMath7AId, student3Id) as any;
      assert.equal(m3.assessment_status, 'ABSENT');
      assert.equal(m3.score, null);
    });
  });

  // ==========================================================================
  // G5F-03: POST-PUBLICATION CORRECTIONS AUTHORITATIVE DATA & CAS PROTECTION
  // ==========================================================================

  describe('G5F-03: Post-Publication Correction Form Data & CAS Protection', () => {
    let publishedMark1Id: number;
    let publishedMark2Id: number;

    before(async () => {
      // 1. Submit sheet for review
      submitMarksSheet({
        sheetId: sheetMath7AId,
        baseRevision: 3,
        user: { id: teacherMathId, username: 'g5_teacher_math', role: 'subject_teacher' }
      });

      // 2. Review and approve sheet
      reviewMarksSheet({
        sheetId: sheetMath7AId,
        baseRevision: 4,
        decision: 'endorse',
        remarks: 'Sheet reviewed and verified',
        user: { id: sectionHead2026JuniorId, username: 'g5_sec_head_2026', role: 'subject_teacher' }
      });
      approveMarksSheet({
        sheetId: sheetMath7AId,
        baseRevision: 5,
        decision: 'approve',
        remarks: 'Sheet approved for publication',
        user: { id: principalUserId, username: 'g5_principal', role: 'subject_teacher' }
      });

      // 3. Add and approve examination schedule for 7-A Math
      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at)
        VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))
      `).run(exam2026Term1Id, class7AId, subjectMathId, principalUserId);

      // 4. Publish examination
      const pubRes = publishExamination({
        examinationId: exam2026Term1Id,
        policyProfileId,
        user: { id: principalUserId, username: 'g5_principal', role: 'subject_teacher' }
      });
      assert.equal(pubRes.success, true);

      // Record published mark IDs
      const m1 = db.prepare('SELECT id FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheetMath7AId, student1Id) as any;
      publishedMark1Id = m1.id;

      const m2 = db.prepare('SELECT id FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheetMath7AId, student2Id) as any;
      publishedMark2Id = m2.id;
    });

    test('1. GET /api/marks/published-mark returns authoritative mark and status', async () => {
      const res = await testServer.request(
        `/api/marks/published-mark?examinationId=${exam2026Term1Id}&studentId=${student1Id}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${principalToken}`
          }
        }
      );

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.mark);
      assert.equal(data.mark.id, publishedMark1Id);
      assert.equal(data.mark.studentId, student1Id);
      assert.equal(data.mark.score, 92);
      assert.equal(data.mark.assessmentStatus, 'PRESENT');
      assert.equal(data.mark.studentName, 'Kasun Malinda Ranasinghe');
    });

    test('2. GET /api/marks/published-mark for non-present mark returns null score (never defaults to 0)', async () => {
      const res = await testServer.request(
        `/api/marks/published-mark?examinationId=${exam2026Term1Id}&studentId=${student2Id}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${principalToken}`
          }
        }
      );

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.mark);
      assert.equal(data.mark.id, publishedMark2Id);
      assert.equal(data.mark.score, null, 'Non-present published mark must return null score');
      assert.equal(data.mark.assessmentStatus, 'MEDICAL');
    });

    test('3. GET /api/marks/published-mark returns 404 for un-enrolled or non-existent combination', async () => {
      const res = await testServer.request(
        `/api/marks/published-mark?examinationId=${exam2026Term1Id}&studentId=99999&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${principalToken}`
          }
        }
      );

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.code, 'MARK_NOT_FOUND');
    });

    test('3a. G6-02: GET /api/marks/published-mark permits assigned subject teacher', async () => {
      const res = await testServer.request(
        `/api/marks/published-mark?examinationId=${exam2026Term1Id}&studentId=${student1Id}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${teacherMathToken}`
          }
        }
      );

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.mark.studentId, student1Id);
      assert.equal(data.mark.score, 92);
    });

    test('3b. G6-02: GET /api/marks/published-mark rejects plain administrator without academic appointment (403)', async () => {
      const res = await testServer.request(
        `/api/marks/published-mark?examinationId=${exam2026Term1Id}&studentId=${student1Id}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`
          }
        }
      );

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('3c. G6-02: GET /api/marks/published-mark rejects unrelated teacher (403)', async () => {
      const res = await testServer.request(
        `/api/marks/published-mark?examinationId=${exam2026Term1Id}&studentId=${student1Id}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${teacherUnrelatedToken}`
          }
        }
      );

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('3d. G6-02: GET /api/marks/published-mark rejects out-of-band leadership (OL head accessing Junior class) (403)', async () => {
      const res = await testServer.request(
        `/api/marks/published-mark?examinationId=${exam2026Term1Id}&studentId=${student1Id}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${sectionHead2026OLToken}`
          }
        }
      );

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('3e. G6-02: GET /api/marks/published-mark rejects deactivated user account (401/403)', async () => {
      const res = await testServer.request(
        `/api/marks/published-mark?examinationId=${exam2026Term1Id}&studentId=${student1Id}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${deactivatedTeacherToken}`
          }
        }
      );

      assert.ok([401, 403].includes(res.status), 'Deactivated user must be rejected with 401 or 403');
    });

    test('3f. FIX B: GET /api/marks/sheet rejects plain administrator on published sheet without academic leadership (403)', async () => {
      const res = await testServer.request(
        `/api/marks/sheet?examId=${exam2026Term1Id}&classId=${class7AId}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`
          }
        }
      );

      assert.equal(res.status, 403, 'Plain administrator must receive 403 Forbidden for marks sheet');
      const data = await res.json();
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('3g. FIX B: GET /api/marks/student-report rejects plain administrator on published report without academic leadership (403)', async () => {
      const res = await testServer.request(
        `/api/marks/student-report/${student1Id}/${exam2026Term1Id}`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`
          }
        }
      );

      assert.equal(res.status, 403, 'Plain administrator must receive 403 Forbidden for published student report card');
      const data = await res.json();
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('3h. FIX B: GET /api/marks/sheet and /student-report permit authorized Principal and assigned Teacher (200)', async () => {
      // Principal with academic leadership appointment
      const sheetRes = await testServer.request(
        `/api/marks/sheet?examId=${exam2026Term1Id}&classId=${class7AId}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${principalToken}`
          }
        }
      );
      assert.equal(sheetRes.status, 200, 'Authorized Principal must receive 200 OK for marks sheet');

      const reportRes = await testServer.request(
        `/api/marks/student-report/${student1Id}/${exam2026Term1Id}`,
        {
          headers: {
            Authorization: `Bearer ${principalToken}`
          }
        }
      );
      assert.equal(reportRes.status, 200, 'Authorized Principal must receive 200 OK for student report');

      // Assigned subject teacher
      const teacherSheetRes = await testServer.request(
        `/api/marks/sheet?examId=${exam2026Term1Id}&classId=${class7AId}&subjectId=${subjectMathId}`,
        {
          headers: {
            Authorization: `Bearer ${teacherMathToken}`
          }
        }
      );
      assert.equal(teacherSheetRes.status, 200, 'Assigned teacher must receive 200 OK for marks sheet');
    });

    test('4. Authorized correction request succeeds with matching expectedPreviousScore and status', async () => {
      const corrPayload = {
        markId: publishedMark1Id,
        examinationId: exam2026Term1Id,
        expectedPreviousScore: 92,
        expectedPreviousStatus: 'PRESENT',
        requestedScore: 95,
        requestedStatus: 'PRESENT',
        correctionCategory: 'clerical_addition',
        detailedJustification: 'Recount of section B confirmed additional 3 marks awarded on script'
      };

      const res = await testServer.request('/api/marks/corrections', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${principalToken}`,
          'Content-Type': 'application/json'
        },
        body: corrPayload
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.correctionId);
      assert.equal(data.status, 'pending');
    });

    test('5. Stale correction request with mismatched expectedPreviousScore fails with 409 STALE_MARK_STATE', async () => {
      // Mark 1 has previous_score = 92, but caller provides 80
      const staleCorrPayload = {
        markId: publishedMark1Id,
        examinationId: exam2026Term1Id,
        expectedPreviousScore: 80, // Mismatch!
        expectedPreviousStatus: 'PRESENT',
        requestedScore: 90,
        requestedStatus: 'PRESENT',
        correctionCategory: 're_scrutiny',
        detailedJustification: 'Attempting submission with stale expected previous score'
      };

      const res = await testServer.request('/api/marks/corrections', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${principalToken}`,
          'Content-Type': 'application/json'
        },
        body: staleCorrPayload
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, 'STALE_MARK_STATE');
      assert.ok(data.error?.includes('Stale record detected'));
    });
  });

  // ==========================================================================
  // G5F-04: MARKS-SHEET LISTING AUTHORIZATION (GET /api/marks/sheets)
  // ==========================================================================

  describe('G5F-04: Marks-Sheet Listing Authorization & Least-Privilege Scoping', () => {
    test('1. Cross-Year Appointment Isolation: Section Head 2025 cannot see Year 2026 sheets', async () => {
      const res = await testServer.request('/api/marks/sheets', {
        headers: {
          Authorization: `Bearer ${sectionHead2025JuniorToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const sheets = data.sheets as any[];

      // Section Head 2025 only has appointment in 2025
      // MUST NOT see any 2026 sheets!
      for (const s of sheets) {
        assert.equal(
          s.academic_year_id,
          year2025Id,
          `Section Head 2025 must not receive sheets from academic year ${s.academic_year_id}`
        );
      }

      // Must see the 2025 sheet
      assert.ok(sheets.some((s) => s.id === sheetMath7A2025Id));
    });

    test('2. Grade Band Scoping: Junior Section Head 2026 sees Grades 6-9, NOT Grade 10 OL sheets', async () => {
      const res = await testServer.request('/api/marks/sheets', {
        headers: {
          Authorization: `Bearer ${sectionHead2026JuniorToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const sheets = data.sheets as any[];

      // Should see Grade 7-A sheets in 2026
      assert.ok(sheets.some((s) => s.id === sheetMath7AId));
      assert.ok(sheets.some((s) => s.id === sheetScience7AId));

      // MUST NOT see Grade 10-A sheet (Grade 10 is OL, not Junior)
      assert.ok(
        !sheets.some((s) => s.id === sheetMath10AId),
        'Junior Section Head must NOT see Grade 10 marks sheets'
      );
    });

    test('3. Grade Band Scoping: OL Section Head 2026 sees Grade 10, NOT Grade 7 Junior sheets', async () => {
      const res = await testServer.request('/api/marks/sheets', {
        headers: {
          Authorization: `Bearer ${sectionHead2026OLToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const sheets = data.sheets as any[];

      // Should see Grade 10-A sheet in 2026
      assert.ok(sheets.some((s) => s.id === sheetMath10AId));

      // MUST NOT see Grade 7-A sheets (Grade 7 is Junior, not OL)
      assert.ok(
        !sheets.some((s) => s.id === sheetMath7AId),
        'OL Section Head must NOT see Grade 7 marks sheets'
      );
    });

    test('4. Plain Administrator without academic appointments only sees published sheets (unpublished hidden)', async () => {
      const res = await testServer.request('/api/marks/sheets', {
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const sheets = data.sheets as any[];

      // Sheet 7-A Math was published with exam2026Term1Id
      assert.ok(sheets.some((s) => s.id === sheetMath7AId));

      // Sheet 10-A Math is draft (unpublished) -> MUST NOT be visible to plain admin!
      assert.ok(
        !sheets.some((s) => s.id === sheetMath10AId),
        'Plain administrator must NOT see unpublished marks sheet 10-A Math'
      );

      // Sheet 7-A 2025 is draft (unpublished) -> MUST NOT be visible to plain admin!
      assert.ok(
        !sheets.some((s) => s.id === sheetMath7A2025Id),
        'Plain administrator must NOT see unpublished marks sheet 7-A 2025'
      );
    });

    test('5. Teacher assignment isolation: Math teacher sees only assigned subjects in current year', async () => {
      const res = await testServer.request('/api/marks/sheets', {
        headers: {
          Authorization: `Bearer ${teacherMathToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const sheets = data.sheets as any[];

      // Math teacher is assigned to 7A Math (2026) and 7A Math (2025)
      assert.ok(sheets.some((s) => s.id === sheetMath7AId));
      assert.ok(sheets.some((s) => s.id === sheetMath7A2025Id));

      // Science sheet (sheetScience7AId) is draft/unpublished and taught by teacherScience
      assert.ok(
        !sheets.some((s) => s.id === sheetScience7AId),
        'Math teacher must not see unpublished Science marks sheet'
      );
    });

    test('6. Unrelated teacher receives no unauthorized unpublished sheets', async () => {
      const res = await testServer.request('/api/marks/sheets', {
        headers: {
          Authorization: `Bearer ${teacherUnrelatedToken}`
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const sheets = data.sheets as any[];

      // Unrelated teacher has no assignments, but published sheet (sheetMath7AId) is visible
      assert.ok(sheets.every((s) => s.status === 'published'));
      assert.ok(!sheets.some((s) => s.id === sheetScience7AId));
      assert.ok(!sheets.some((s) => s.id === sheetMath10AId));
      assert.ok(!sheets.some((s) => s.id === sheetMath7A2025Id));
    });

    test('7. Deactivated account receives 401/403 and cannot list sheets', async () => {
      const res = await testServer.request('/api/marks/sheets', {
        headers: {
          Authorization: `Bearer ${deactivatedTeacherToken}`
        }
      });

      assert.ok(res.status === 401 || res.status === 403);
    });
  });
});
