import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { db, switchDatabase } from '../src/db/database.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import {
  grantAcademicAuthorization,
  revokeAcademicAuthorization
} from '../src/services/academicAuthorizationService.js';
import {
  createAssessmentPolicyProfile,
  approveAssessmentPolicyProfile,
  getAssessmentPolicyProfile
} from '../src/services/assessmentPolicyService.js';
import { publishExamination } from '../src/services/examinationPublicationService.js';

describe('PR-005 Gate 4 Final Security Closeout: FIX 01, FIX 02, FIX 03', { concurrency: 1 }, () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  // Test Entities & Tokens
  let year2026Id: number;
  let year2025Id: number;
  let adminUserId: number;
  let principalUserId: number;
  let vpAcademicUserId: number;
  let teacherKamalId: number;
  let teacherSunethraId: number;
  let teacherUnrelatedId: number;
  let deactivatedUserId: number;

  let adminToken: string;
  let principalToken: string;
  let vpAcademicToken: string;
  let teacherKamalToken: string;
  let teacherSunethraToken: string;
  let teacherUnrelatedToken: string;
  let deactivatedUserToken: string;

  let class8AId: number;
  let class8BId: number;
  let subjectMathId: number;
  let subjectSciId: number;
  let subjectArtId: number;
  let studentAId: number;
  let studentBId: number;
  let studentCId: number;

  let policyApprovedId: number;

  before(async () => {
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `skoolsys_gate4_final_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`);
    process.env.DB_PATH = testDbPath;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'gate4_final_security_secret_2026';
    switchDatabase(testDbPath);

    testServer = await startTestServer(0);

    const secret = process.env.JWT_SECRET;

    // 1. Users
    const uStmt = db.prepare('INSERT INTO users (username, email, password_hash, full_name, role, is_active, token_version) VALUES (?, ?, ?, ?, ?, ?, 1)');
    adminUserId = Number(uStmt.run('g4f_admin', 'admin@kcc.test', 'hash', 'System Admin', 'admin', 1).lastInsertRowid);
    principalUserId = Number(uStmt.run('g4f_principal', 'principal@kcc.test', 'hash', 'Principal Perera', 'admin', 1).lastInsertRowid);
    vpAcademicUserId = Number(uStmt.run('g4f_vp', 'vp@kcc.test', 'hash', 'VP Academic Razik', 'admin', 1).lastInsertRowid);
    teacherKamalId = Number(uStmt.run('g4f_kamal', 'kamal@kcc.test', 'hash', 'Teacher Kamal', 'class_teacher', 1).lastInsertRowid);
    teacherSunethraId = Number(uStmt.run('g4f_sunethra', 'sunethra@kcc.test', 'hash', 'Teacher Sunethra', 'class_teacher', 1).lastInsertRowid);
    teacherUnrelatedId = Number(uStmt.run('g4f_unrelated', 'unrelated@kcc.test', 'hash', 'Unrelated Teacher', 'subject_teacher', 1).lastInsertRowid);
    deactivatedUserId = Number(uStmt.run('g4f_deactivated', 'deactivated@kcc.test', 'hash', 'Deactivated Teacher', 'class_teacher', 0).lastInsertRowid);

    adminToken = jwt.sign({ id: adminUserId, username: 'g4f_admin', role: 'admin', tokenVersion: 1 }, secret);
    principalToken = jwt.sign({ id: principalUserId, username: 'g4f_principal', role: 'admin', tokenVersion: 1 }, secret);
    vpAcademicToken = jwt.sign({ id: vpAcademicUserId, username: 'g4f_vp', role: 'admin', tokenVersion: 1 }, secret);
    teacherKamalToken = jwt.sign({ id: teacherKamalId, username: 'g4f_kamal', role: 'class_teacher', tokenVersion: 1 }, secret);
    teacherSunethraToken = jwt.sign({ id: teacherSunethraId, username: 'g4f_sunethra', role: 'class_teacher', tokenVersion: 1 }, secret);
    teacherUnrelatedToken = jwt.sign({ id: teacherUnrelatedId, username: 'g4f_unrelated', role: 'subject_teacher', tokenVersion: 1 }, secret);
    deactivatedUserToken = jwt.sign({ id: deactivatedUserId, username: 'g4f_deactivated', role: 'class_teacher', tokenVersion: 1 }, secret);

    // 2. Academic Years
    year2025Id = Number(db.prepare("INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ('2025-HIST', '2025-01-01', '2025-12-31', 0)").run().lastInsertRowid);
    year2026Id = Number(db.prepare("INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ('2026-CURR', '2026-01-01', '2026-12-31', 1)").run().lastInsertRowid);

    // 3. Academic Authorizations
    grantAcademicAuthorization({ userId: principalUserId, academicYearId: year2026Id, authRole: 'principal', gradeBand: 'all', grantedByUserId: adminUserId });
    grantAcademicAuthorization({ userId: vpAcademicUserId, academicYearId: year2026Id, authRole: 'vice_principal_academic', gradeBand: 'all', grantedByUserId: adminUserId });

    // 4. Subjects
    subjectMathId = Number(db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('MTH-G4F', 'Mathematics', 'core', 'junior_6_9')").run().lastInsertRowid);
    subjectSciId = Number(db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('SCI-G4F', 'Science', 'core', 'junior_6_9')").run().lastInsertRowid);
    subjectArtId = Number(db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('ART-G4F', 'Art', 'elective', 'junior_6_9')").run().lastInsertRowid);

    // 5. Classes
    class8AId = Number(db.prepare("INSERT INTO classes (name, grade, academic_year_id, class_teacher_id) VALUES ('Grade 8-A', 8, ?, ?)").run(year2026Id, teacherKamalId).lastInsertRowid);
    class8BId = Number(db.prepare("INSERT INTO classes (name, grade, academic_year_id, class_teacher_id) VALUES ('Grade 8-B', 8, ?, ?)").run(year2026Id, teacherSunethraId).lastInsertRowid);

    // Link subjects to classes
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class8AId, subjectMathId);
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class8AId, subjectSciId);
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class8BId, subjectMathId);
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class8BId, subjectSciId);

    // Teacher Assignments in 2026:
    // Kamal assigned to 8-A (Class Teacher + Subject Teacher for Math)
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type) VALUES (?, ?, ?, ?, 'class_teacher')").run(teacherKamalId, class8AId, subjectMathId, year2026Id);
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type) VALUES (?, ?, ?, ?, 'subject_teacher')").run(teacherKamalId, class8AId, subjectMathId, year2026Id);

    // Sunethra assigned to 8-B (Class Teacher + Subject Teacher for Science)
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type) VALUES (?, ?, ?, ?, 'class_teacher')").run(teacherSunethraId, class8BId, subjectSciId, year2026Id);

    // 6. Students
    const sStmt = db.prepare("INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status) VALUES (?, ?, ?, '2012-05-10', 'Male', 'Guardian', 'Parent', '0771234567', 'Active')");
    studentAId = Number(sStmt.run('ADM-G4F-01', 'Student Alpha', 'Alpha').lastInsertRowid);
    studentBId = Number(sStmt.run('ADM-G4F-02', 'Student Beta', 'Beta').lastInsertRowid);
    studentCId = Number(sStmt.run('ADM-G4F-03', 'Student Gamma', 'Gamma').lastInsertRowid);

    // Enrollments
    db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 1, 'enrolled')").run(studentAId, class8AId, year2026Id);
    db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 2, 'enrolled')").run(studentBId, class8AId, year2026Id);
    db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 1, 'enrolled')").run(studentCId, class8BId, year2026Id);

    // Confirmed subject enrollments
    const sseStmt = db.prepare("INSERT INTO student_subject_enrollments (student_id, class_id, subject_id, academic_year_id, enrollment_status, enrollment_category) VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory')");
    sseStmt.run(studentAId, class8AId, subjectMathId, year2026Id);
    sseStmt.run(studentAId, class8AId, subjectSciId, year2026Id);
    sseStmt.run(studentBId, class8AId, subjectMathId, year2026Id);
    sseStmt.run(studentBId, class8AId, subjectSciId, year2026Id);
    sseStmt.run(studentCId, class8BId, subjectMathId, year2026Id);
    sseStmt.run(studentCId, class8BId, subjectSciId, year2026Id);

    // Policy Profile
    const polRes = createAssessmentPolicyProfile({
      academicYearId: year2026Id,
      gradeBand: 'junior_6_9',
      policyCode: 'POL-G4F-CORE',
      title: 'Gate 4 Final Junior Policy 2026',
      gradingScale: [
        { grade: 'A', minPercentage: 75.0 },
        { grade: 'B', minPercentage: 65.0 },
        { grade: 'C', minPercentage: 50.0 },
        { grade: 'S', minPercentage: 35.0 },
        { grade: 'F', minPercentage: 0.0 }
      ],
      rankingRules: { rankingMethod: 'competition', tieHandling: 'equal_rank_skip_next', minimumSubjectsRequired: 2 },
      subjectWeights: { [String(subjectMathId)]: 2.0, [String(subjectSciId)]: 1.0 },
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      user: { id: principalUserId, role: 'admin' }
    });
    policyApprovedId = polRes.policy.id;
    approveAssessmentPolicyProfile(policyApprovedId, { id: principalUserId, role: 'admin' });
  });

  after(async () => {
    if (testServer) await testServer.close();
    try {
      switchDatabase(':memory:');
      if (testDbPath && fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (testDbPath && fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (testDbPath && fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {}
  });

  // =========================================================================
  // FIX 01 — Mandatory Authoritative Examination Scope
  // =========================================================================
  describe('FIX 01 — Mandatory Authoritative Examination Scope', () => {
    test('Negative: Synthetic exam with 2 class subjects, 1 approved sheet, and ZERO schedule rows FAILS publication with 400', () => {
      // 1. Create synthetic exam
      const examSyntheticId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('Synthetic Unscheduled Exam', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      // 2. Insert only 1 approved sheet (Math) without any examination_schedules records
      const sheet = Number(db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id)
        VALUES (?, ?, ?, ?, ?, 'approved', ?)
      `).run(examSyntheticId, class8AId, subjectMathId, teacherKamalId, year2026Id, principalUserId).lastInsertRowid);

      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 80, 100, 'A', 'PRESENT', 'submitted')").run(sheet, studentAId, examSyntheticId, class8AId, subjectMathId);

      // 3. Publication MUST fail closed with 400 MISSING_EXAMINATION_SCHEDULE
      assert.throws(
        () => publishExamination({
          examinationId: examSyntheticId,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'MISSING_EXAMINATION_SCHEDULE');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );

      // 4. Assert zero database writes: exam remains unpublished
      const examCheck = db.prepare('SELECT is_published, status FROM examinations WHERE id = ?').get(examSyntheticId) as any;
      assert.equal(examCheck.is_published, 0);
      assert.notEqual(examCheck.status, 'published');
    });

    test('Negative: Examination schedule item without leadership approval provenance fails publication with 400', () => {
      const examUnapprovedSchedId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('Unapproved Schedule Exam', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      // Schedule row inserted with NULL approved_by_user_id or status = 'draft'
      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id)
        VALUES (?, ?, ?, 1, 'draft', null)
      `).run(examUnapprovedSchedId, class8AId, subjectMathId);

      assert.throws(
        () => publishExamination({
          examinationId: examUnapprovedSchedId,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'UNAPPROVED_EXAMINATION_SCHEDULE');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    test('Negative: Examination schedule item approved by unauthorized teacher fails publication with 403', () => {
      const examUnauthorizedApproverId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('Unauthorized Approver Schedule Exam', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      // Schedule row approved by teacherKamalId (an ordinary teacher, not principal/VP)
      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id)
        VALUES (?, ?, ?, 1, 'approved', ?)
      `).run(examUnauthorizedApproverId, class8AId, subjectMathId, teacherKamalId);

      assert.throws(
        () => publishExamination({
          examinationId: examUnauthorizedApproverId,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'UNAUTHORIZED_SCHEDULE_APPROVER');
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });

    test('Negative: Examination schedule item for subject not offered by class fails publication with 400', () => {
      const examOfferingMismatchId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('Subject Offering Mismatch Exam', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      // class8A offers Math and Science, but NOT Art
      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at)
        VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))
      `).run(examOfferingMismatchId, class8AId, subjectArtId, principalUserId);

      assert.throws(
        () => publishExamination({
          examinationId: examOfferingMismatchId,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'INVALID_SCHEDULE_SUBJECT_OFFERING');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    test('Positive: Fully scheduled, school-authorized examination with approved sheets publishes successfully', () => {
      const examValidId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('Valid Authoritative Scope Exam', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      // Authoritative schedule for 8A: Math and Science
      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at)
        VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))
      `).run(examValidId, class8AId, subjectMathId, principalUserId);
      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at)
        VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))
      `).run(examValidId, class8AId, subjectSciId, principalUserId);

      // Approved sheets
      const sMath = Number(db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id)
        VALUES (?, ?, ?, ?, ?, 'approved', ?)
      `).run(examValidId, class8AId, subjectMathId, teacherKamalId, year2026Id, principalUserId).lastInsertRowid);

      const sSci = Number(db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id)
        VALUES (?, ?, ?, ?, ?, 'approved', ?)
      `).run(examValidId, class8AId, subjectSciId, teacherKamalId, year2026Id, principalUserId).lastInsertRowid);

      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 80, 100, 'A', 'PRESENT', 'submitted')").run(sMath, studentAId, examValidId, class8AId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 70, 100, 'B', 'PRESENT', 'submitted')").run(sMath, studentBId, examValidId, class8AId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 85, 100, 'A', 'PRESENT', 'submitted')").run(sSci, studentAId, examValidId, class8AId, subjectSciId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 75, 100, 'A', 'PRESENT', 'submitted')").run(sSci, studentBId, examValidId, class8AId, subjectSciId);

      const pubRes = publishExamination({
        examinationId: examValidId,
        user: { id: principalUserId, role: 'admin' },
        ipAddress: '127.0.0.1'
      });

      assert.equal(pubRes.success, true);
      assert.equal(pubRes.sheetsPublishedCount, 2);

      const examAfter = db.prepare('SELECT is_published, status FROM examinations WHERE id = ?').get(examValidId) as any;
      assert.equal(examAfter.is_published, 1);
      assert.equal(examAfter.status, 'published');

      // Database trigger verification: Attempting to insert, update, or delete schedule after publication MUST abort
      assert.throws(
        () => {
          db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required) VALUES (?, ?, ?, 1)").run(examValidId, class8AId, subjectArtId);
        },
        /Cannot modify examination schedule after examination has been published/
      );
      assert.throws(
        () => {
          db.prepare("UPDATE examination_schedules SET is_required = 0 WHERE examination_id = ? AND class_id = ? AND subject_id = ?").run(examValidId, class8AId, subjectMathId);
        },
        /Cannot modify examination schedule after examination has been published/
      );
      assert.throws(
        () => {
          db.prepare("DELETE FROM examination_schedules WHERE examination_id = ? AND class_id = ? AND subject_id = ?").run(examValidId, class8AId, subjectMathId);
        },
        /Cannot modify examination schedule after examination has been published/
      );
    });
  });

  // =========================================================================
  // FIX 02 — Publication Snapshot Confidentiality
  // =========================================================================
  describe('FIX 02 — Publication Snapshot Confidentiality', () => {
    let examPubConfId: number;

    before(() => {
      // Create and publish an exam with two classes: 8-A and 8-B
      examPubConfId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('Multi-Class Published Exam', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      // Schedules for 8A and 8B
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examPubConfId, class8AId, subjectMathId, principalUserId);
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examPubConfId, class8BId, subjectMathId, principalUserId);

      // Approved sheets
      const s8A = Number(db.prepare("INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id) VALUES (?, ?, ?, ?, ?, 'approved', ?)").run(examPubConfId, class8AId, subjectMathId, teacherKamalId, year2026Id, principalUserId).lastInsertRowid);
      const s8B = Number(db.prepare("INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id) VALUES (?, ?, ?, ?, ?, 'approved', ?)").run(examPubConfId, class8BId, subjectMathId, teacherSunethraId, year2026Id, principalUserId).lastInsertRowid);

      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 90, 100, 'A', 'PRESENT', 'submitted')").run(s8A, studentAId, examPubConfId, class8AId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 80, 100, 'A', 'PRESENT', 'submitted')").run(s8A, studentBId, examPubConfId, class8AId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 75, 100, 'A', 'PRESENT', 'submitted')").run(s8B, studentCId, examPubConfId, class8BId, subjectMathId);

      // Publish examination
      publishExamination({
        examinationId: examPubConfId,
        user: { id: principalUserId, role: 'admin' },
        ipAddress: '127.0.0.1'
      });
    });

    test('Positive: Principal receives full examination publication summary with all classes', async () => {
      const res = await testServer.request(`/api/marks/examinations/${examPubConfId}/publication-summary`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${principalToken}` }
      });

      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.is_published, true);
      assert.ok(data.publication);
      const snapshot = JSON.parse(data.publication.publication_snapshot_json);
      assert.equal(snapshot.classes.length, 2); // Both 8A and 8B included
    });

    test('Positive: Assigned Teacher Kamal (assigned to 8A only) receives publication summary filtered strictly to 8A', async () => {
      const res = await testServer.request(`/api/marks/examinations/${examPubConfId}/publication-summary`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${teacherKamalToken}` }
      });

      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.ok(data.publication);
      const snapshot = JSON.parse(data.publication.publication_snapshot_json);
      assert.equal(snapshot.classes.length, 1);
      assert.equal(snapshot.classes[0].classId, class8AId); // ONLY 8A, zero access to 8B data!
    });

    test('Negative: Unrelated Teacher receives 403 Forbidden with INSUFFICIENT_AUTHORIZATION', async () => {
      const res = await testServer.request(`/api/marks/examinations/${examPubConfId}/publication-summary`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${teacherUnrelatedToken}` }
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('Negative: Deactivated user receives 401 Unauthorized with USER_DEACTIVATED', async () => {
      const res = await testServer.request(`/api/marks/examinations/${examPubConfId}/publication-summary`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${deactivatedUserToken}` }
      });

      assert.equal(res.status, 401);
      const data = await res.json() as any;
      assert.equal(data.code, 'USER_DEACTIVATED');
    });

    test('Negative: Unpublished examination publication details remain confidential (403 UNPUBLISHED_RESULTS_LOCKED)', async () => {
      const examUnpublishedId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('Unpublished Confidential Exam', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      const res = await testServer.request(`/api/marks/examinations/${examUnpublishedId}/publication-summary`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${teacherKamalToken}` }
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, 'UNPUBLISHED_RESULTS_LOCKED');
    });

    test('Negative: Plain unscoped administrator without academic leadership appointment receives 403 Forbidden with INSUFFICIENT_AUTHORIZATION', async () => {
      // adminToken belongs to adminUserId who has role 'admin' but ZERO academic_staff_authorizations
      const res = await testServer.request(`/api/marks/examinations/${examPubConfId}/publication-summary`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('Negative: Teacher with revoked teaching assignments receives 403 Forbidden with INSUFFICIENT_AUTHORIZATION', async () => {
      // Create a temporary teacher with assignment, then revoke assignment
      const revUserId = Number(db.prepare("INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES ('g4f_revoked', 'rev@kcc.test', 'hash', 'Revoked Teacher', 'subject_teacher', 1)").run().lastInsertRowid);
      const revToken = jwt.sign({ id: revUserId, username: 'g4f_revoked', role: 'subject_teacher', tokenVersion: 1 }, process.env.JWT_SECRET!);

      // Temporarily assign
      const asgId = Number(db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type) VALUES (?, ?, ?, ?, 'subject_teacher')").run(revUserId, class8AId, subjectMathId, year2026Id).lastInsertRowid);

      // Now revoke assignment by deleting it
      db.prepare("DELETE FROM teacher_assignments WHERE id = ?").run(asgId);

      const res = await testServer.request(`/api/marks/examinations/${examPubConfId}/publication-summary`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${revToken}` }
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('Negative: Malformed publication snapshot content fails closed with 500 MALFORMED_PUBLICATION_SNAPSHOT', async () => {
      // Create an exam and publication with corrupted/malformed snapshot JSON
      const examMalformedId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status, is_published)
        VALUES ('Malformed Snapshot Exam', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'published', 1)
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      db.prepare(`
        INSERT INTO examination_publications (
          examination_id, publication_version, policy_profile_id, policy_version,
          published_by_user_id, publication_snapshot_json, audit_hash
        ) VALUES (?, 1, ?, 1, ?, '{"classes": NOT_VALID_JSON', 'dummy_hash')
      `).run(examMalformedId, policyApprovedId, principalUserId);

      // Assigned teacher Kamal requests publication summary: filtering MUST fail closed!
      const res = await testServer.request(`/api/marks/examinations/${examMalformedId}/publication-summary`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${teacherKamalToken}` }
      });

      assert.equal(res.status, 500);
      const data = await res.json() as any;
      assert.equal(data.code, 'MALFORMED_PUBLICATION_SNAPSHOT');
    });
  });

  // =========================================================================
  // FIX 03 — Published Report-Card Calculation Integrity
  // =========================================================================
  describe('FIX 03 — Published Report-Card Calculation Integrity', () => {
    let examReportId: number;

    before(() => {
      examReportId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('Report Card Policy Exam', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      // Schedule Math and Science for 8A
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examReportId, class8AId, subjectMathId, principalUserId);
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examReportId, class8AId, subjectSciId, principalUserId);

      // Sheets
      const sM = Number(db.prepare("INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id) VALUES (?, ?, ?, ?, ?, 'approved', ?)").run(examReportId, class8AId, subjectMathId, teacherKamalId, year2026Id, principalUserId).lastInsertRowid);
      const sS = Number(db.prepare("INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id) VALUES (?, ?, ?, ?, ?, 'approved', ?)").run(examReportId, class8AId, subjectSciId, teacherKamalId, year2026Id, principalUserId).lastInsertRowid);

      // Student A: Math 80 (weight 2.0 -> 160), Sci 90 (weight 1.0 -> 90) -> Total weight 3, weighted avg = 250/3 = 83.3%
      // Student B: Math 70 (weight 2.0 -> 140), Sci 70 (weight 1.0 -> 70) -> Total weight 3, weighted avg = 210/3 = 70.0%
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 80, 100, 'A', 'PRESENT', 'submitted')").run(sM, studentAId, examReportId, class8AId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 90, 100, 'A', 'PRESENT', 'submitted')").run(sS, studentAId, examReportId, class8AId, subjectSciId);

      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 70, 100, 'B', 'PRESENT', 'submitted')").run(sM, studentBId, examReportId, class8AId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 70, 100, 'B', 'PRESENT', 'submitted')").run(sS, studentBId, examReportId, class8AId, subjectSciId);

      publishExamination({
        examinationId: examReportId,
        user: { id: principalUserId, role: 'admin' },
        ipAddress: '127.0.0.1'
      });
    });

    test('Positive: Published report card applies official policy weights, competition rank, and metadata', async () => {
      const res = await testServer.request(`/api/marks/student-report/${studentAId}/${examReportId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${principalToken}` }
      });

      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.exam.is_published, 1);
      assert.equal(data.performance.average, 83.33); // Weighted policy average: (80*2 + 90*1)/3 = 83.33%
      assert.equal(data.performance.rank, 1); // Rank 1
      assert.equal(data.performance.classRankNotice, 'Official Class Rank');
    });

    test('Negative: Published report card with missing policy profile returns 500 without silent raw fallback', async () => {
      const examNoPolicyId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status, is_published)
        VALUES ('Published Exam Without Policy', ?, 1, '2026-03-01', '2026-03-15', NULL, 'junior_6_9', 'published', 1)
      `).run(year2026Id).lastInsertRowid);

      const res = await testServer.request(`/api/marks/student-report/${studentAId}/${examNoPolicyId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${principalToken}` }
      });

      // Must fail with 500 MISSING_OFFICIAL_POLICY, NEVER returning unweighted raw averages silently!
      assert.equal(res.status, 500);
      const data = await res.json() as any;
      assert.equal(data.code, 'MISSING_OFFICIAL_POLICY');
    });

    test('Negative: Corrupted or unsupported policy configuration on published exam returns 500 CALCULATION_FAILED', async () => {
      // Temporarily corrupt policy ranking rules with unsupported method
      db.prepare("UPDATE assessment_policy_profiles SET ranking_rules_json = ? WHERE id = ?").run(JSON.stringify({ rankingMethod: 'unsupported_elo' }), policyApprovedId);

      try {
        const res = await testServer.request(`/api/marks/student-report/${studentAId}/${examReportId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${principalToken}` }
        });

        assert.equal(res.status, 500);
        const data = await res.json() as any;
        assert.ok(data.code === 'CALCULATION_FAILED' || data.code === 'UNSUPPORTED_POLICY_CONFIGURATION');
      } finally {
        // Restore valid ranking rules
        db.prepare("UPDATE assessment_policy_profiles SET ranking_rules_json = ? WHERE id = ?").run(JSON.stringify({ rankingMethod: 'competition', tieHandling: 'equal_rank_skip_next', minimumSubjectsRequired: 2 }), policyApprovedId);
      }
    });
  });
});
