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
  getAssessmentPolicyProfile,
  calculateClassResults
} from '../src/services/assessmentPolicyService.js';
import { publishExamination } from '../src/services/examinationPublicationService.js';
import { requestMarkCorrection, reviewMarkCorrection } from '../src/services/marksCorrectionService.js';

describe('PR-005 Gate 4S Final Closeout: Comprehensive Regression Suite', { concurrency: 1 }, () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  // Global Auth Tokens
  let adminToken: string;
  let principalToken: string;
  let vpAcademicToken: string;
  let teacherToken2025: string;
  let teacherToken2026: string;
  let teacherTokenOther: string;

  // Global User IDs
  let adminUserId: number;
  let principalUserId: number;
  let vpAcademicUserId: number;
  let teacherUserId2025: number;
  let teacherUserId2026: number;
  let teacherUserIdOther: number;

  // Academic Entities
  let year2025Id: number;
  let year2026Id: number;

  let class7AId: number; // Year 2025 Grade 7
  let class8AId: number; // Year 2026 Grade 8
  let class10AId: number; // Year 2026 Grade 10 (ol_10_11)

  let subjectMathId: number;
  let subjectSciId: number;
  let subjectArtId: number;
  let subjectMusicId: number;

  let studentAId: number;
  let studentBId: number;
  let studentCId: number;

  before(async () => {
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `skoolsys_gate4s_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`);
    process.env.DB_PATH = testDbPath;
    process.env.JWT_SECRET = 'gate4s-super-secret-jwt-key-with-over-32-characters-2026';

    switchDatabase(testDbPath);
    testServer = await startTestServer();

    // 1. Seed Synthetic Users
    const uStmt = db.prepare('INSERT INTO users (username, email, password_hash, full_name, role, is_active, token_version) VALUES (?, ?, ?, ?, ?, 1, 1)');
    adminUserId = Number(uStmt.run('g4s_admin', 'admin@kcc.test', 'hash', 'Super Admin', 'admin').lastInsertRowid);
    principalUserId = Number(uStmt.run('g4s_principal', 'principal@kcc.test', 'hash', 'Principal Razik', 'admin').lastInsertRowid);
    vpAcademicUserId = Number(uStmt.run('g4s_vp', 'vp@kcc.test', 'hash', 'VP Academic Nazeer', 'admin').lastInsertRowid);
    teacherUserId2025 = Number(uStmt.run('g4s_t2025', 't2025@kcc.test', 'hash', 'Teacher 2025', 'class_teacher').lastInsertRowid);
    teacherUserId2026 = Number(uStmt.run('g4s_t2026', 't2026@kcc.test', 'hash', 'Teacher 2026', 'class_teacher').lastInsertRowid);
    teacherUserIdOther = Number(uStmt.run('g4s_tother', 'tother@kcc.test', 'hash', 'Teacher Other', 'subject_teacher').lastInsertRowid);

    const secret = process.env.JWT_SECRET;
    adminToken = jwt.sign({ id: adminUserId, username: 'g4s_admin', role: 'admin', tokenVersion: 1 }, secret);
    principalToken = jwt.sign({ id: principalUserId, username: 'g4s_principal', role: 'admin', tokenVersion: 1 }, secret);
    vpAcademicToken = jwt.sign({ id: vpAcademicUserId, username: 'g4s_vp', role: 'admin', tokenVersion: 1 }, secret);
    teacherToken2025 = jwt.sign({ id: teacherUserId2025, username: 'g4s_t2025', role: 'class_teacher', tokenVersion: 1 }, secret);
    teacherToken2026 = jwt.sign({ id: teacherUserId2026, username: 'g4s_t2026', role: 'class_teacher', tokenVersion: 1 }, secret);
    teacherTokenOther = jwt.sign({ id: teacherUserIdOther, username: 'g4s_tother', role: 'subject_teacher', tokenVersion: 1 }, secret);

    // 2. Academic Years
    year2025Id = Number(db.prepare("INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ('2025-HIST', '2025-01-01', '2025-12-31', 0)").run().lastInsertRowid);
    year2026Id = Number(db.prepare("INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ('2026-CURR', '2026-01-01', '2026-12-31', 1)").run().lastInsertRowid);

    // 3. Academic Authorizations
    grantAcademicAuthorization({ userId: principalUserId, academicYearId: year2025Id, authRole: 'principal', gradeBand: 'all', grantedByUserId: adminUserId });
    grantAcademicAuthorization({ userId: principalUserId, academicYearId: year2026Id, authRole: 'principal', gradeBand: 'all', grantedByUserId: adminUserId });
    grantAcademicAuthorization({ userId: vpAcademicUserId, academicYearId: year2025Id, authRole: 'vice_principal_academic', gradeBand: 'all', grantedByUserId: adminUserId });
    grantAcademicAuthorization({ userId: vpAcademicUserId, academicYearId: year2026Id, authRole: 'vice_principal_academic', gradeBand: 'all', grantedByUserId: adminUserId });

    // 4. Subjects
    subjectMathId = Number(db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('MTH-G4S', 'Mathematics', 'core', 'junior_6_9')").run().lastInsertRowid);
    subjectSciId = Number(db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('SCI-G4S', 'Science', 'core', 'junior_6_9')").run().lastInsertRowid);
    subjectArtId = Number(db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('ART-G4S', 'Visual Art', 'elective', 'junior_6_9')").run().lastInsertRowid);
    subjectMusicId = Number(db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('MUS-G4S', 'Music', 'elective', 'junior_6_9')").run().lastInsertRowid);

    // 5. Classes
    class7AId = Number(db.prepare("INSERT INTO classes (name, grade, academic_year_id, class_teacher_id) VALUES ('Grade 7-A (2025)', 7, ?, ?)").run(year2025Id, teacherUserId2025).lastInsertRowid);
    class8AId = Number(db.prepare("INSERT INTO classes (name, grade, academic_year_id, class_teacher_id) VALUES ('Grade 8-A (2026)', 8, ?, ?)").run(year2026Id, teacherUserId2026).lastInsertRowid);
    class10AId = Number(db.prepare("INSERT INTO classes (name, grade, academic_year_id, class_teacher_id) VALUES ('Grade 10-A (2026)', 10, ?, ?)").run(year2026Id, adminUserId).lastInsertRowid);

    // Link subjects to classes
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class7AId, subjectMathId);
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class7AId, subjectSciId);
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class7AId, subjectArtId);

    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class8AId, subjectMathId);
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class8AId, subjectSciId);
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class8AId, subjectArtId);
    db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(class8AId, subjectMusicId);

    // Teacher assignments
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type) VALUES (?, ?, ?, ?, 'class_teacher')").run(teacherUserId2025, class7AId, subjectMathId, year2025Id);
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type) VALUES (?, ?, ?, ?, 'class_teacher')").run(teacherUserId2026, class8AId, subjectMathId, year2026Id);
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type) VALUES (?, ?, ?, ?, 'subject_teacher')").run(teacherUserId2026, class8AId, subjectMathId, year2026Id);

    // 6. Students
    const sStmt = db.prepare("INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status) VALUES (?, ?, ?, '2012-05-10', 'Male', 'Parent', 'Father', '0771234567', 'Active')");
    studentAId = Number(sStmt.run('KCC-G4S-001', 'Student A', 'StuA').lastInsertRowid);
    studentBId = Number(sStmt.run('KCC-G4S-002', 'Student B', 'StuB').lastInsertRowid);
    studentCId = Number(sStmt.run('KCC-G4S-003', 'Student C', 'StuC').lastInsertRowid);
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
  // G4S-01: Accurate Examination Coverage & Enrolment Scope
  // =========================================================================
  describe('G4S-01: Accurate Examination Coverage & Enrolment Scope', () => {
    let examG4S01Id: number;
    let policyApprovedId: number;

    before(() => {
      // Create approved policy for 2026 junior_6_9
      const polRes = createAssessmentPolicyProfile({
        academicYearId: year2026Id,
        gradeBand: 'junior_6_9',
        policyCode: 'POL-G4S-01',
        title: 'G4S-01 Approved Junior Policy',
        gradingScale: [
          { grade: 'A', minPercentage: 75 },
          { grade: 'B', minPercentage: 65 },
          { grade: 'C', minPercentage: 50 },
          { grade: 'S', minPercentage: 35 },
          { grade: 'F', minPercentage: 0 }
        ],
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        user: { id: principalUserId, role: 'admin' }
      });
      policyApprovedId = polRes.policy.id;
      approveAssessmentPolicyProfile(policyApprovedId, { id: principalUserId, role: 'admin' });

      // Create Exam
      examG4S01Id = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('2026 Term 1 Exam G4S01', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      // Enrol student A and student B in Class 8A for 2026
      db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 1, 'enrolled')").run(studentAId, class8AId, year2026Id);
      db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 2, 'enrolled')").run(studentBId, class8AId, year2026Id);

      // Define Examination Schedule: Required subjects for 8A in this exam are Math and Science ONLY (Music and Art are NOT scheduled)
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examG4S01Id, class8AId, subjectMathId, principalUserId);
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examG4S01Id, class8AId, subjectSciId, principalUserId);
    });

    test('Finding B Negative: Publication rejects when a required scheduled sheet is missing with zero state changes', async () => {
      // Only submit Math sheet; Science sheet is missing!
      const sheetMath = Number(db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id)
        VALUES (?, ?, ?, ?, ?, 'approved', ?)
      `).run(examG4S01Id, class8AId, subjectMathId, teacherUserId2026, year2026Id, principalUserId).lastInsertRowid);

      // Add marks for Math
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 80, 100, 'A', 'PRESENT', 'published')").run(sheetMath, studentAId, examG4S01Id, class8AId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 70, 100, 'B', 'PRESENT', 'published')").run(sheetMath, studentBId, examG4S01Id, class8AId, subjectMathId);

      // Attempt to publish -> must fail with MISSING_REQUIRED_SHEETS
      assert.throws(
        () => publishExamination({
          examinationId: examG4S01Id,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'MISSING_REQUIRED_SHEETS');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );

      // Assert ZERO state changes: examination remains unpublished, zero publication snapshots
      const examCheck = db.prepare('SELECT is_published, status FROM examinations WHERE id = ?').get(examG4S01Id) as any;
      assert.equal(examCheck.is_published, 0);
      assert.notEqual(examCheck.status, 'published');
      const snapCount = (db.prepare('SELECT COUNT(*) as cnt FROM examination_publications WHERE examination_id = ?').get(examG4S01Id) as any).cnt;
      assert.equal(snapCount, 0);
    });

    test('Finding A Positive: Provisional enrolment in an UNRELATED, unexamined elective does not block publication', async () => {
      // Student B has a provisional enrolment in Music (subjectMusicId), which is offered in class_subjects, but NOT scheduled or examined
      db.prepare(`
        INSERT INTO student_subject_enrollments (student_id, class_id, subject_id, academic_year_id, enrollment_status, enrollment_category)
        VALUES (?, ?, ?, ?, 'provisional_unverified', 'ol_basket_1')
      `).run(studentBId, class8AId, subjectMusicId, year2026Id);

      // Confirmed enrolments for examined subjects (Math and Science)
      db.prepare(`
        INSERT INTO student_subject_enrollments (student_id, class_id, subject_id, academic_year_id, enrollment_status, enrollment_category)
        VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory')
      `).run(studentAId, class8AId, subjectMathId, year2026Id);
      db.prepare(`
        INSERT INTO student_subject_enrollments (student_id, class_id, subject_id, academic_year_id, enrollment_status, enrollment_category)
        VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory')
      `).run(studentAId, class8AId, subjectSciId, year2026Id);

      db.prepare(`
        INSERT INTO student_subject_enrollments (student_id, class_id, subject_id, academic_year_id, enrollment_status, enrollment_category)
        VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory')
      `).run(studentBId, class8AId, subjectMathId, year2026Id);
      db.prepare(`
        INSERT INTO student_subject_enrollments (student_id, class_id, subject_id, academic_year_id, enrollment_status, enrollment_category)
        VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory')
      `).run(studentBId, class8AId, subjectSciId, year2026Id);

      // Submit Science marks sheet now so all scheduled sheets are present
      const sheetSci = Number(db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id)
        VALUES (?, ?, ?, ?, ?, 'approved', ?)
      `).run(examG4S01Id, class8AId, subjectSciId, teacherUserId2026, year2026Id, principalUserId).lastInsertRowid);

      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 85, 100, 'A', 'PRESENT', 'published')").run(sheetSci, studentAId, examG4S01Id, class8AId, subjectSciId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 75, 100, 'A', 'PRESENT', 'published')").run(sheetSci, studentBId, examG4S01Id, class8AId, subjectSciId);

      // Now publication MUST SUCCEED because Music is not examined!
      const pubRes = publishExamination({
        examinationId: examG4S01Id,
        user: { id: principalUserId, role: 'admin' },
        ipAddress: '127.0.0.1'
      });

      assert.equal(pubRes.success, true);
      assert.equal(pubRes.sheetsPublishedCount, 2);

      const examAfter = db.prepare('SELECT is_published, status FROM examinations WHERE id = ?').get(examG4S01Id) as any;
      assert.equal(examAfter.is_published, 1);
      assert.equal(examAfter.status, 'published');
    });

    test('Negative: Missing confirmed enrolment for an assessed student in an examined subject blocks publication', () => {
      // Create another exam
      const examBlockId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('2026 Exam Blocked', ?, 2, '2026-06-01', '2026-06-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, policyApprovedId).lastInsertRowid);

      // Schedule for Math
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examBlockId, class8AId, subjectMathId, principalUserId);

      // Sheet for Math
      const sheet = Number(db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status, approved_by_user_id)
        VALUES (?, ?, ?, ?, ?, 'approved', ?)
      `).run(examBlockId, class8AId, subjectMathId, teacherUserId2026, year2026Id, principalUserId).lastInsertRowid);

      // Assessed student C has NO confirmed enrolment in Math (or provisional enrolment)
      db.prepare(`
        INSERT INTO student_subject_enrollments (student_id, class_id, subject_id, academic_year_id, enrollment_status, enrollment_category)
        VALUES (?, ?, ?, ?, 'provisional_unverified', 'core_compulsory')
      `).run(studentCId, class8AId, subjectMathId, year2026Id);

      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 60, 100, 'C', 'PRESENT', 'published')").run(sheet, studentCId, examBlockId, class8AId, subjectMathId);

      // Attempt to publish -> must throw UNCONFIRMED_STUDENT_ENROLMENT
      assert.throws(
        () => publishExamination({
          examinationId: examBlockId,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'UNVERIFIED_ENROLLMENTS');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );

      // Zero writes
      const examCheck = db.prepare('SELECT is_published FROM examinations WHERE id = ?').get(examBlockId) as any;
      assert.equal(examCheck.is_published, 0);
    });
  });

  // =========================================================================
  // G4S-02: Atomic Correction Rejection & Complete Audit
  // =========================================================================
  describe('G4S-02: Atomic Correction Rejection & Complete Audit', () => {
    let publishedExamId: number;
    let publishedSheetId: number;
    let publishedMarkId: number;
    let correctionId: number;

    before(() => {
      // 1. Create independent approved policy
      const polRes = createAssessmentPolicyProfile({
        academicYearId: year2026Id,
        gradeBand: 'junior_6_9',
        policyCode: 'POL-G4S-02',
        title: 'G4S-02 Rejection Audit Policy',
        gradingScale: [{ grade: 'A', minPercentage: 75 }, { grade: 'F', minPercentage: 0 }],
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        user: { id: principalUserId, role: 'admin' }
      });
      const polId = polRes.policy.id;
      approveAssessmentPolicyProfile(polId, { id: principalUserId, role: 'admin' });

      // 2. Create Published Exam
      publishedExamId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status, is_published)
        VALUES ('2026 Exam G4S02', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'published', 1)
      `).run(year2026Id, polId).lastInsertRowid);

      publishedSheetId = Number(db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status)
        VALUES (?, ?, ?, ?, ?, 'published')
      `).run(publishedExamId, class8AId, subjectMathId, teacherUserId2026, year2026Id).lastInsertRowid);

      publishedMarkId = Number(db.prepare(`
        INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status, entered_by_user_id)
        VALUES (?, ?, ?, ?, ?, 80, 100, 'A', 'PRESENT', 'published', ?)
      `).run(publishedSheetId, studentAId, publishedExamId, class8AId, subjectMathId, teacherUserId2026).lastInsertRowid);

      // Request a correction as teacher
      const reqRes = requestMarkCorrection({
        markId: publishedMarkId,
        expectedPreviousScore: 80,
        expectedPreviousStatus: 'PRESENT',
        requestedScore: 92,
        requestedStatus: 'PRESENT',
        correctionCategory: 'clerical_addition',
        detailedJustification: 'Recounted paper totals, found uncredited 12 marks on question 4.',
        user: { id: teacherUserId2026, role: 'class_teacher' },
        ipAddress: '127.0.0.1'
      });
      correctionId = reqRes.correctionId;
    });

    test('Failure-injection test: Injected audit failure cleanly rolls back rejection, leaves correction pending and audit unchanged', () => {
      // Inject synthetic failure via temporary trigger on marks_audit_history
      db.exec(`
        CREATE TRIGGER synth_audit_failure_trigger
        BEFORE INSERT ON marks_audit_history
        WHEN NEW.reason LIKE '%synthetic_failure_injection%'
        BEGIN
          SELECT RAISE(ABORT, 'Synthetic database error during marks_audit_history write');
        END;
      `);

      try {
        // Attempt rejection with the triggered keyword
        assert.throws(
          () => reviewMarkCorrection({
            correctionId,
            decision: 'reject',
            reviewComments: 'synthetic_failure_injection trigger test',
            user: { id: vpAcademicUserId, role: 'admin' },
            ipAddress: '127.0.0.1'
          }),
          /Synthetic database error during marks_audit_history write/
        );

        // Verify that correction remains 'pending'
        const corrRow = db.prepare('SELECT status, reviewed_by_user_id, reviewed_at FROM marks_corrections WHERE id = ?').get(correctionId) as any;
        assert.equal(corrRow.status, 'pending', 'Correction status must remain pending after rollback');
        assert.equal(corrRow.reviewed_by_user_id, null);
        assert.equal(corrRow.reviewed_at, null);

        // Verify that NO audit history row was created
        const auditRows = db.prepare('SELECT * FROM marks_audit_history WHERE correction_id = ?').all(correctionId);
        assert.equal(auditRows.length, 0, 'No audit records must persist after rollback');

        // Verify mark scores remain untouched
        const markRow = db.prepare('SELECT score, assessment_status FROM marks WHERE id = ?').get(publishedMarkId) as any;
        assert.equal(markRow.score, 80);
      } finally {
        db.exec('DROP TRIGGER IF EXISTS synth_audit_failure_trigger;');
      }
    });

    test('Positive: Atomic rejection updates correction row and writes audit history with zero mark modifications', () => {
      const revRes = reviewMarkCorrection({
        correctionId,
        decision: 'reject',
        reviewComments: 'Rejection confirmed: Question 4 was already properly credited.',
        user: { id: vpAcademicUserId, role: 'admin' },
        ipAddress: '127.0.0.1'
      });

      assert.equal(revRes.success, true);
      assert.equal(revRes.status, 'rejected');

      // Verify correction table state
      const corrRow = db.prepare('SELECT status, reviewed_by_user_id, review_comments FROM marks_corrections WHERE id = ?').get(correctionId) as any;
      assert.equal(corrRow.status, 'rejected');
      assert.equal(corrRow.reviewed_by_user_id, vpAcademicUserId);

      // Verify audit history record
      const audit = db.prepare('SELECT * FROM marks_audit_history WHERE correction_id = ?').get(correctionId) as any;
      assert.ok(audit, 'Audit row must exist');
      assert.equal(audit.action, 'POST_PUBLICATION_CORRECTION');
      assert.equal(audit.actor_user_id, vpAcademicUserId);
      assert.match(audit.reason, /Correction rejected:/);

      // Verify mark score and status are UNTOUCHED
      const markRow = db.prepare('SELECT score, assessment_status FROM marks WHERE id = ?').get(publishedMarkId) as any;
      assert.equal(markRow.score, 80);
      assert.equal(markRow.assessment_status, 'PRESENT');
    });

    test('Negative: Duplicate review on already rejected correction safely fails with 409', () => {
      assert.throws(
        () => reviewMarkCorrection({
          correctionId,
          decision: 'reject',
          reviewComments: 'Second review attempt',
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'CORRECTION_ALREADY_REVIEWED');
          assert.equal(err.statusCode, 409);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // G4S-03: In-Transaction Correction Authorization
  // =========================================================================
  describe('G4S-03: In-Transaction Correction Authorization', () => {
    let testMarkId: number;
    let pendingCorrectionId: number;

    before(() => {
      // 1. Create independent published exam and mark
      const polRes = createAssessmentPolicyProfile({
        academicYearId: year2026Id,
        gradeBand: 'junior_6_9',
        policyCode: 'POL-G4S-03',
        title: 'G4S-03 Auth Policy',
        gradingScale: [{ grade: 'A', minPercentage: 75 }, { grade: 'F', minPercentage: 0 }],
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        user: { id: principalUserId, role: 'admin' }
      });
      const polId = polRes.policy.id;
      approveAssessmentPolicyProfile(polId, { id: principalUserId, role: 'admin' });

      const examId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status, is_published)
        VALUES ('2026 Exam G4S03', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'published', 1)
      `).run(year2026Id, polId).lastInsertRowid);

      const sheetId = Number(db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status)
        VALUES (?, ?, ?, ?, ?, 'published')
      `).run(examId, class8AId, subjectMathId, teacherUserId2026, year2026Id).lastInsertRowid);

      testMarkId = Number(db.prepare(`
        INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status, entered_by_user_id)
        VALUES (?, ?, ?, ?, ?, 70, 100, 'B', 'PRESENT', 'published', ?)
      `).run(sheetId, studentBId, examId, class8AId, subjectMathId, teacherUserId2026).lastInsertRowid);

      const reqRes = requestMarkCorrection({
        markId: testMarkId,
        expectedPreviousScore: 70,
        expectedPreviousStatus: 'PRESENT',
        requestedScore: 78,
        requestedStatus: 'PRESENT',
        correctionCategory: 'missed_question',
        detailedJustification: 'Section B question 2 was marked as unattempted but student wrote answer on page 6.',
        user: { id: teacherUserId2026, role: 'class_teacher' },
        ipAddress: '127.0.0.1'
      });
      pendingCorrectionId = reqRes.correctionId;
    });

    test('Negative: Revoking leadership appointment blocks approval under write lock with 403', () => {
      // Temporarily revoke VP Academic authorization for 2026
      const auth = db.prepare("SELECT id FROM academic_staff_authorizations WHERE user_id = ? AND academic_year_id = ? AND auth_role = 'vice_principal_academic' AND is_active = 1").get(vpAcademicUserId, year2026Id) as any;
      revokeAcademicAuthorization({ authorizationId: auth.id, revokedByUserId: adminUserId, reason: 'Testing in-transaction revocation' });

      try {
        assert.throws(
          () => reviewMarkCorrection({
            correctionId: pendingCorrectionId,
            decision: 'approve',
            reviewComments: 'VP approving while revoked',
            user: { id: vpAcademicUserId, role: 'admin' },
            ipAddress: '127.0.0.1'
          }),
          (err: any) => {
            assert.equal(err.code, 'INSUFFICIENT_AUTHORIZATION');
            assert.equal(err.statusCode, 403);
            return true;
          }
        );

        // Verify zero writes: correction remains pending
        const corrRow = db.prepare('SELECT status FROM marks_corrections WHERE id = ?').get(pendingCorrectionId) as any;
        assert.equal(corrRow.status, 'pending');
      } finally {
        // Restore appointment
        grantAcademicAuthorization({ userId: vpAcademicUserId, academicYearId: year2026Id, authRole: 'vice_principal_academic', gradeBand: 'all', grantedByUserId: adminUserId });
      }
    });

    test('Negative: Stale mark modification detected under write lock throws 409', () => {
      // Concurrently tamper or update mark score in database
      db.prepare("UPDATE marks SET score = 99 WHERE id = ?").run(testMarkId);

      try {
        assert.throws(
          () => reviewMarkCorrection({
            correctionId: pendingCorrectionId,
            decision: 'approve',
            reviewComments: 'Approving stale mark',
            user: { id: principalUserId, role: 'admin' },
            ipAddress: '127.0.0.1'
          }),
          (err: any) => {
            assert.equal(err.code, 'STALE_MARK_STATE');
            assert.equal(err.statusCode, 409);
            return true;
          }
        );
      } finally {
        // Restore mark score
        db.prepare("UPDATE marks SET score = 70 WHERE id = ?").run(testMarkId);
      }
    });

    test('Negative: Segregation of Duties: Requester, entrant, or assigned teacher cannot approve under write lock', () => {
      // 1. Requester cannot approve
      assert.throws(
        () => reviewMarkCorrection({
          correctionId: pendingCorrectionId,
          decision: 'approve',
          reviewComments: 'Teacher self approval',
          user: { id: teacherUserId2026, role: 'class_teacher' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );

      // 2. Assigned teacher granted temporary principal role still cannot self-approve
      grantAcademicAuthorization({ userId: teacherUserId2026, academicYearId: year2026Id, authRole: 'principal', gradeBand: 'all', grantedByUserId: adminUserId });
      try {
        assert.throws(
          () => reviewMarkCorrection({
            correctionId: pendingCorrectionId,
            decision: 'approve',
            reviewComments: 'Self-approval bypass attempt',
            user: { id: teacherUserId2026, role: 'admin' },
            ipAddress: '127.0.0.1'
          }),
          (err: any) => {
            assert.equal(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        const tAuth = db.prepare("SELECT id FROM academic_staff_authorizations WHERE user_id = ? AND academic_year_id = ? AND auth_role = 'principal' AND is_active = 1").get(teacherUserId2026, year2026Id) as any;
        if (tAuth) revokeAcademicAuthorization({ authorizationId: tAuth.id, revokedByUserId: adminUserId, reason: 'Cleanup test appointment' });
      }
    });
  });

  // =========================================================================
  // G4S-04: Complete Policy-Aware Result Calculations
  // =========================================================================
  describe('G4S-04: Complete Policy-Aware Result Calculations', () => {
    let examArithId: number;
    let polWeightedId: number;
    let classArithId: number;
    let sheetArithMath: number;
    let sheetArithSci: number;
    let sheetArithArt: number;
    let stuArith1Id: number;
    let stuArith2Id: number;
    let stuArith3Id: number;

    before(() => {
      // 1. Create a class with 3 students for arithmetic verification
      classArithId = Number(db.prepare("INSERT INTO classes (name, grade, academic_year_id, class_teacher_id) VALUES ('Arithmetic 8-B', 8, ?, ?)").run(year2026Id, teacherUserId2026).lastInsertRowid);
      db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(classArithId, subjectMathId);
      db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(classArithId, subjectSciId);
      db.prepare("INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)").run(classArithId, subjectArtId);

      // Create 3 dedicated students for arithmetic verification
      const sArithStmt = db.prepare("INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status) VALUES (?, ?, ?, '2012-05-10', 'Male', 'Parent', 'Father', '0771234567', 'Active')");
      stuArith1Id = Number(sArithStmt.run('KCC-ARITH-01', 'Arith Student 1', 'Arith1').lastInsertRowid);
      stuArith2Id = Number(sArithStmt.run('KCC-ARITH-02', 'Arith Student 2', 'Arith2').lastInsertRowid);
      stuArith3Id = Number(sArithStmt.run('KCC-ARITH-03', 'Arith Student 3', 'Arith3').lastInsertRowid);

      // Enrol 3 students
      db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 10, 'enrolled')").run(stuArith1Id, classArithId, year2026Id);
      db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 11, 'enrolled')").run(stuArith2Id, classArithId, year2026Id);
      db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 12, 'enrolled')").run(stuArith3Id, classArithId, year2026Id);

      // Confirmed subject enrolments for the 3 subjects
      for (const stuId of [stuArith1Id, stuArith2Id, stuArith3Id]) {
        for (const subId of [subjectMathId, subjectSciId, subjectArtId]) {
          db.prepare(`
            INSERT INTO student_subject_enrollments (student_id, class_id, subject_id, academic_year_id, enrollment_status, enrollment_category)
            VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory')
          `).run(stuId, classArithId, subId, year2026Id);
        }
      }

      // Create policy with weights and ranking rules
      const polRes = createAssessmentPolicyProfile({
        academicYearId: year2026Id,
        gradeBand: 'junior_6_9',
        policyCode: 'POL-ARITH-01',
        title: 'Arithmetic Test Policy',
        gradingScale: [
          { grade: 'A', minPercentage: 75 },
          { grade: 'B', minPercentage: 65 },
          { grade: 'C', minPercentage: 50 },
          { grade: 'S', minPercentage: 35 },
          { grade: 'F', minPercentage: 0 }
        ],
        subjectWeights: {
          'MTH-G4S': 2.0, // Weight 2.0
          'SCI-G4S': 1.0, // Weight 1.0
          'ART-G4S': 1.0  // Weight 1.0
        },
        absenceRules: {
          absentHandling: 'zero',
          medicalHandling: 'exclude',
          exemptHandling: 'exclude'
        },
        rankingRules: {
          rankingMethod: 'competition',
          tieHandling: 'equal_rank_skip_next',
          minimumSubjectsRequired: 3
        },
        user: { id: principalUserId, role: 'admin' }
      });
      polWeightedId = polRes.policy.id;
      approveAssessmentPolicyProfile(polWeightedId, { id: principalUserId, role: 'admin' });

      // Create Exam
      examArithId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('2026 Arithmetic Exam', ?, 1, '2026-04-01', '2026-04-10', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, polWeightedId).lastInsertRowid);

      // Define schedule for 3 subjects
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examArithId, classArithId, subjectMathId, principalUserId);
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examArithId, classArithId, subjectSciId, principalUserId);
      db.prepare("INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at) VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))").run(examArithId, classArithId, subjectArtId, principalUserId);

      // Create marks sheets for the 3 subjects
      sheetArithMath = Number(db.prepare("INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status) VALUES (?, ?, ?, ?, ?, 'approved')").run(examArithId, classArithId, subjectMathId, teacherUserId2026, year2026Id).lastInsertRowid);
      sheetArithSci = Number(db.prepare("INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status) VALUES (?, ?, ?, ?, ?, 'approved')").run(examArithId, classArithId, subjectSciId, teacherUserId2026, year2026Id).lastInsertRowid);
      sheetArithArt = Number(db.prepare("INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status) VALUES (?, ?, ?, ?, ?, 'approved')").run(examArithId, classArithId, subjectArtId, teacherUserId2026, year2026Id).lastInsertRowid);
    });

    test('Subject weights & Competition Tie Ranking arithmetic verification', () => {
      // Clean previous marks for this exam
      db.prepare('DELETE FROM marks WHERE examination_id = ?').run(examArithId);

      // Student A:
      // Math (weight 2): 80%
      // Science (weight 1): 60%
      // Art (weight 1): 60%
      // Weighted sum = (80*2) + (60*1) + (60*1) = 160 + 60 + 60 = 280
      // Total weight = 2 + 1 + 1 = 4
      // Weighted average = 280 / 4 = 70.0%
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 80, 100, 'A', 'PRESENT', 'published')").run(sheetArithMath, stuArith1Id, examArithId, classArithId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 60, 100, 'B', 'PRESENT', 'published')").run(sheetArithSci, stuArith1Id, examArithId, classArithId, subjectSciId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 60, 100, 'B', 'PRESENT', 'published')").run(sheetArithArt, stuArith1Id, examArithId, classArithId, subjectArtId);

      // Student B: (Different scores but identical weighted average)
      // Math (weight 2): 70%
      // Science (weight 1): 70%
      // Art (weight 1): 70%
      // Weighted sum = (70*2) + (70*1) + (70*1) = 140 + 70 + 70 = 280
      // Weighted average = 280 / 4 = 70.0%
      // Total score = 70 + 70 + 70 = 210, whereas Student A raw total is 80+60+60 = 200.
      // Under pure competition ranking on average, BOTH must tie at Rank 1! No raw total tie breaker!
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 70, 100, 'B', 'PRESENT', 'published')").run(sheetArithMath, stuArith2Id, examArithId, classArithId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 70, 100, 'B', 'PRESENT', 'published')").run(sheetArithSci, stuArith2Id, examArithId, classArithId, subjectSciId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 70, 100, 'B', 'PRESENT', 'published')").run(sheetArithArt, stuArith2Id, examArithId, classArithId, subjectArtId);

      // Student C:
      // Math: 50%, Sci: 50%, Art: 50% -> Average: 50.0% -> Must be Rank 3 (skipping Rank 2 due to 1st place tie)
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 50, 100, 'C', 'PRESENT', 'published')").run(sheetArithMath, stuArith3Id, examArithId, classArithId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 50, 100, 'C', 'PRESENT', 'published')").run(sheetArithSci, stuArith3Id, examArithId, classArithId, subjectSciId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 50, 100, 'C', 'PRESENT', 'published')").run(sheetArithArt, stuArith3Id, examArithId, classArithId, subjectArtId);

      const policyProfile = getAssessmentPolicyProfile(polWeightedId);
      const res = calculateClassResults(examArithId, classArithId, policyProfile);

      const stuA = res.students.find(s => s.studentId === stuArith1Id)!;
      const stuB = res.students.find(s => s.studentId === stuArith2Id)!;
      const stuC = res.students.find(s => s.studentId === stuArith3Id)!;

      assert.equal(stuA.averagePercentage, 70.0, 'Student A average must be 70.0');
      assert.equal(stuB.averagePercentage, 70.0, 'Student B average must be 70.0');
      assert.equal(stuC.averagePercentage, 50.0, 'Student C average must be 50.0');

      // Assert equal rank skip next: Both tied at Rank 1, Student C at Rank 3
      assert.equal(stuA.rank, 1, 'Student A must be Rank 1');
      assert.equal(stuB.rank, 1, 'Student B must be Rank 1 (tied)');
      assert.equal(stuC.rank, 3, 'Student C must be Rank 3 (skip next)');
    });

    test('Minimum subject eligibility: Student with fewer subjects than minimum receives rank null', () => {
      // Modify Student C to only take 2 subjects (delete Art mark)
      db.prepare('DELETE FROM marks WHERE examination_id = ? AND student_id = ? AND subject_id = ?').run(examArithId, stuArith3Id, subjectArtId);

      const policyProfile = getAssessmentPolicyProfile(polWeightedId);
      const res = calculateClassResults(examArithId, classArithId, policyProfile);

      const stuC = res.students.find(s => s.studentId === stuArith3Id)!;
      assert.equal(stuC.gradedSubjectsCount, 2);
      assert.equal(stuC.rank, null, 'Student with fewer than minimumSubjectsRequired (3) must receive rank: null');
    });

    test('Absence handling: zero vs exclude policy behaviors', () => {
      // Create Student C with 1 present mark (Math 100) and 1 absent mark (Science ABSENT)
      db.prepare('DELETE FROM marks WHERE examination_id = ? AND student_id = ?').run(examArithId, stuArith3Id);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 100, 100, 'A', 'PRESENT', 'published')").run(sheetArithMath, stuArith3Id, examArithId, classArithId, subjectMathId);
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, null, 100, 'F', 'ABSENT', 'published')").run(sheetArithSci, stuArith3Id, examArithId, classArithId, subjectSciId);

      // Policy with absence zero
      const polZero = getAssessmentPolicyProfile(polWeightedId);
      const resZero = calculateClassResults(examArithId, classArithId, polZero);
      const stuCZero = resZero.students.find(s => s.studentId === stuArith3Id)!;
      // Math weight 2 (100% * 2 = 200), Science weight 1 (0% * 1 = 0) -> sum = 200 / 3 = 66.67
      assert.equal(stuCZero.averagePercentage, 66.67);

      // Create policy with absence exclude
      const polExcludeRes = createAssessmentPolicyProfile({
        academicYearId: year2026Id,
        gradeBand: 'junior_6_9',
        policyCode: 'POL-ARITH-EXCLUDE',
        title: 'Exclude Absence Policy',
        gradingScale: [{ grade: 'A', minPercentage: 75 }, { grade: 'F', minPercentage: 0 }],
        absenceRules: { absentHandling: 'exclude', medicalHandling: 'exclude', exemptHandling: 'exclude' },
        user: { id: principalUserId, role: 'admin' }
      });
      const resExclude = calculateClassResults(examArithId, classArithId, polExcludeRes.policy);
      const stuCExclude = resExclude.students.find(s => s.studentId === stuArith3Id)!;
      // Science is excluded from calculation -> 100% on Math alone
      assert.equal(stuCExclude.averagePercentage, 100.0);
    });

    test('Negative: Reject unsupported policy configurations', () => {
      // rankingMethod 'dense'
      assert.throws(
        () => createAssessmentPolicyProfile({
          academicYearId: year2026Id,
          gradeBand: 'junior_6_9',
          policyCode: 'POL-UNSUP-1',
          title: 'Unsupported Ranking',
          gradingScale: [{ grade: 'A', minPercentage: 75 }, { grade: 'F', minPercentage: 0 }],
          rankingRules: { rankingMethod: 'dense' as any, tieHandling: 'equal_rank_skip_next', minimumSubjectsRequired: 1 },
          user: { id: principalUserId, role: 'admin' }
        }),
        (err: any) => err.code === 'INVALID_POLICY_CONFIGURATION'
      );
    });
  });

  // =========================================================================
  // G4S-05: Academic-Year-Correct Student Reports
  // =========================================================================
  describe('G4S-05: Academic-Year-Correct Student Reports', () => {
    let histExamId: number;

    before(() => {
      // 1. Setup Student A historical enrolment in Class 7A for Academic Year 2025
      db.prepare("INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 5, 'enrolled')").run(studentAId, class7AId, year2025Id);

      // Historical Attendance for 2025
      const sess = Number(db.prepare("INSERT INTO attendance_sessions (uuid, class_id, date, academic_year_id, taken_by_user_id, status) VALUES ('att-g4s-01', ?, '2025-05-15', ?, ?, 'submitted')").run(class7AId, year2025Id, teacherUserId2025).lastInsertRowid);
      db.prepare("INSERT INTO attendance_records (session_id, student_id, status) VALUES (?, ?, 'present')").run(sess, studentAId);

      // Historical Exam in 2025
      const histPolicyId = Number(db.prepare(`
        INSERT INTO assessment_policy_profiles (
          academic_year_id, grade_band, policy_code, title, version,
          is_approved_by_school, approved_by_user_id, approved_at,
          grading_scale_json, subject_weights_json, ranking_rules_json, absence_rules_json
        ) VALUES (
          ?, 'junior_6_9', 'POL-2025-HIST', '2025 Historical Policy', 1,
          1, ?, datetime('now'),
          '[{"grade":"A","minPercentage":75},{"grade":"F","minPercentage":0}]',
          '{}',
          '{"rankingMethod":"competition","tieHandling":"equal_rank_skip_next"}',
          '{"absentHandling":"zero","medicalHandling":"exclude"}'
        )
      `).run(year2025Id, principalUserId).lastInsertRowid);

      histExamId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status, is_published)
        VALUES ('2025 Historical Term 1', ?, 1, '2025-05-01', '2025-05-10', ?, 'junior_6_9', 'draft', 0)
      `).run(year2025Id, histPolicyId).lastInsertRowid);

      db.prepare(`
        INSERT INTO examination_schedules (examination_id, class_id, subject_id, is_required, status, approved_by_user_id, approved_at)
        VALUES (?, ?, ?, 1, 'approved', ?, datetime('now'))
      `).run(histExamId, class7AId, subjectMathId, principalUserId);

      db.prepare("UPDATE examinations SET is_published = 1, status = 'published' WHERE id = ?").run(histExamId);

      db.prepare(`
        INSERT OR REPLACE INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at)
        VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory', ?, datetime('now'))
      `).run(studentAId, subjectMathId, class7AId, year2025Id, principalUserId);

      const histSheetId = Number(db.prepare(`
        INSERT INTO marks_sheets (examination_id, class_id, subject_id, teacher_id, academic_year_id, status)
        VALUES (?, ?, ?, ?, ?, 'published')
      `).run(histExamId, class7AId, subjectMathId, teacherUserId2025, year2025Id).lastInsertRowid);

      // Historical Marks
      db.prepare("INSERT INTO marks (sheet_id, student_id, examination_id, class_id, subject_id, score, max_score, grade_letter, assessment_status, status) VALUES (?, ?, ?, ?, ?, 88, 100, 'A', 'PRESENT', 'published')").run(histSheetId, studentAId, histExamId, class7AId, subjectMathId);
    });

    test('Promoted student historical report card strictly binds to 2025 academic year, grade 7, and historical class', async () => {
      // Student A is now promoted to Class 8A in 2026 (from previous test setup)
      // Call GET /api/marks/student-report/:studentId/:examId with admin token
      const res = await testServer.request(`/api/marks/student-report/${studentAId}/${histExamId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      // Report must show 2025 historical context, NOT 2026 promoted class
      assert.equal(data.student.class_id, class7AId, 'Class ID must be 7A');
      assert.equal(Number(data.student.grade), 7, 'Grade must be 7');
      assert.equal(data.student.academic_year_id, year2025Id, 'Academic Year ID must be 2025');
      assert.equal(data.exam.academic_year_id, year2025Id, 'Exam Academic Year ID must be 2025');
      assert.equal(data.attendance.totalSchoolDays, 1, 'Attendance must strictly reflect 2025');
      assert.equal(data.attendance.presentDays, 1);
    });

    test('Negative: Out-of-scope staff (assigned only to 2026 promoted class) is forbidden from 2025 historical report card', async () => {
      // Teacher 2026 is assigned to Class 8A in 2026, but NOT Class 7A in 2025
      const res = await testServer.request(`/api/marks/student-report/${studentAId}/${histExamId}`, {
        headers: { Authorization: `Bearer ${teacherToken2026}` }
      });

      assert.equal(res.status, 403, 'Out-of-scope teacher must receive 403 Forbidden');
      const err = await res.json();
      assert.equal(err.code, 'INSUFFICIENT_AUTHORIZATION');
    });

    test('Positive: In-scope staff (assigned to 2025 historical class) is authorized to view report card', async () => {
      // Teacher 2025 was assigned to Class 7A in 2025
      const res = await testServer.request(`/api/marks/student-report/${studentAId}/${histExamId}`, {
        headers: { Authorization: `Bearer ${teacherToken2025}` }
      });

      assert.equal(res.status, 200, 'Historical class teacher must receive 200 OK');
    });
  });

  // =========================================================================
  // G4S-06: Validate Policy Effective Scope
  // =========================================================================
  describe('G4S-06: Validate Policy Effective Scope', () => {
    let expiredPolId: number;
    let futurePolId: number;
    let olPolId: number;

    before(() => {
      // 1. Expired Policy (effective until 2025-12-31)
      const expPolRes = createAssessmentPolicyProfile({
        academicYearId: year2026Id,
        gradeBand: 'junior_6_9',
        policyCode: 'POL-SCOPE-EXPIRED',
        title: 'Expired Policy',
        gradingScale: [{ grade: 'A', minPercentage: 75 }, { grade: 'F', minPercentage: 0 }],
        effectiveFrom: '2025-01-01',
        effectiveTo: '2025-12-31',
        user: { id: principalUserId, role: 'admin' }
      });
      expiredPolId = expPolRes.policy.id;
      approveAssessmentPolicyProfile(expiredPolId, { id: principalUserId, role: 'admin' });

      // 2. Future-Effective Policy (effective from 2026-09-01)
      const futPolRes = createAssessmentPolicyProfile({
        academicYearId: year2026Id,
        gradeBand: 'junior_6_9',
        policyCode: 'POL-SCOPE-FUTURE',
        title: 'Future Policy',
        gradingScale: [{ grade: 'A', minPercentage: 75 }, { grade: 'F', minPercentage: 0 }],
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-12-31',
        user: { id: principalUserId, role: 'admin' }
      });
      futurePolId = futPolRes.policy.id;
      approveAssessmentPolicyProfile(futurePolId, { id: principalUserId, role: 'admin' });

      // 3. O/L Policy (ol_10_11)
      const olPolRes = createAssessmentPolicyProfile({
        academicYearId: year2026Id,
        gradeBand: 'ol_10_11',
        policyCode: 'POL-SCOPE-OL',
        title: 'OL Policy',
        gradingScale: [{ grade: 'A', minPercentage: 75 }, { grade: 'F', minPercentage: 0 }],
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        user: { id: principalUserId, role: 'admin' }
      });
      olPolId = olPolRes.policy.id;
      approveAssessmentPolicyProfile(olPolId, { id: principalUserId, role: 'admin' });
    });

    test('Negative: Expired policy is rejected during publication with POLICY_EXPIRED', () => {
      // Create exam in 2026 (March 2026) bound to expired policy
      const examExpId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('2026 Exam with Expired Policy', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, expiredPolId).lastInsertRowid);

      assert.throws(
        () => publishExamination({
          examinationId: examExpId,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'POLICY_EXPIRED');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    test('Negative: Future-effective policy is rejected during publication with POLICY_NOT_YET_EFFECTIVE', () => {
      const examFutId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('2026 Exam with Future Policy', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, futurePolId).lastInsertRowid);

      assert.throws(
        () => publishExamination({
          examinationId: examFutId,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'POLICY_NOT_YET_EFFECTIVE');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    test('Negative: Policy grade band mismatch is rejected with POLICY_GRADE_BAND_MISMATCH', () => {
      // Junior exam (junior_6_9) attempting to use O/L policy (ol_10_11)
      const examMismatchId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('2026 Exam Mismatch', ?, 1, '2026-03-01', '2026-03-15', ?, 'junior_6_9', 'approved')
      `).run(year2026Id, olPolId).lastInsertRowid);

      assert.throws(
        () => publishExamination({
          examinationId: examMismatchId,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'POLICY_GRADE_BAND_MISMATCH');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    test('Negative: Unverified exam dates reject publication when policy has effective dates', () => {
      // Exam with null dates
      const examUnverifiedId = Number(db.prepare(`
        INSERT INTO examinations (name, academic_year_id, term, start_date, end_date, assessment_policy_id, grade_band, status)
        VALUES ('2026 Exam Unverified Dates', ?, 1, null, null, ?, 'junior_6_9', 'approved')
      `).run(year2026Id, futurePolId).lastInsertRowid);

      assert.throws(
        () => publishExamination({
          examinationId: examUnverifiedId,
          user: { id: principalUserId, role: 'admin' },
          ipAddress: '127.0.0.1'
        }),
        (err: any) => {
          assert.equal(err.code, 'UNVERIFIED_EXAM_PERIOD');
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });
  });
});
