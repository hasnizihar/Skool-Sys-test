import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import {
  grantAcademicAuthorization,
  revokeAcademicAuthorization,
  getActiveStaffAuthorizations,
  hasAcademicStaffRole,
  canReviewMarksSheet,
  canViewMarksSheet,
  canApproveMarksSheet,
  canPublishExamination,
  getGradeBandForGrade,
  doesBandCoverGrade
} from '../src/services/academicAuthorizationService.js';
import {
  enrollStudentInSubject,
  verifyStudentEnrollment,
  dropStudentEnrollment,
  getStudentSubjectEnrollments,
  getClassSubjectEnrollments,
  isStudentEligibleForSubject
} from '../src/services/studentEnrollmentService.js';
import { requireAcademicStaffRole } from '../src/middleware/auth.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { db } from '../src/db/database.js';

describe('PR-005 Gate 2R: Academic Staff Authorization, Segregation of Duties & Subject Enrolment Security Tests', () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  // JWT Tokens
  let adminToken: string;
  let teacherToken: string;
  let teacher2Token: string;
  let sectionHeadToken: string;
  let principalToken: string;

  // Entity IDs
  let adminUserId: number;
  let teacherUserId: number;
  let teacher2UserId: number;
  let sectionHeadUserId: number;
  let principalUserId: number;
  let deactUserId: number;

  let year2025Id: number;
  let year2026Id: number;

  let classJuniorId: number; // Grade 8
  let classOLId: number;     // Grade 10
  let classALId: number;     // Grade 12

  let subjectMathId: number;
  let subjectSciId: number;
  let subjectReligionId: number;
  let subjectUnofferedId: number;

  let studentAId: number;
  let studentBId: number;
  let studentOLId: number;
  let studentUnrelatedId: number;

  let exam2026JuniorId: number;
  let exam2025JuniorId: number;

  let sheetJuniorId: number;
  let sheetOLId: number;

  before(async () => {
    // 1. Create isolated synthetic SQLite DB
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `skoolsys_auth_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`);
    process.env.DB_PATH = testDbPath;
    process.env.JWT_SECRET = 'super-secret-jwt-key-with-over-32-characters-for-testing-2026';

    // Start isolated test server first - this runs initDatabase and applies all migrations cleanly
    testServer = await startTestServer();

    // 2. Seed synthetic users
    const userStmt = db.prepare('INSERT INTO users (username, email, password_hash, full_name, role, is_active, token_version) VALUES (?, ?, ?, ?, ?, ?, 1)');
    const adminRes = userStmt.run('auth_admin', 'admin@kcc.test', 'hash', 'Base Administrator', 'admin', 1);
    adminUserId = Number(adminRes.lastInsertRowid);

    const teacherRes = userStmt.run('auth_teacher', 'teacher@kcc.test', 'hash', 'Mr. Teacher Kamal (Junior)', 'subject_teacher', 1);
    teacherUserId = Number(teacherRes.lastInsertRowid);

    const teacher2Res = userStmt.run('auth_teacher_2', 'teacher2@kcc.test', 'hash', 'Ms. Teacher Sunethra (OL)', 'subject_teacher', 1);
    teacher2UserId = Number(teacher2Res.lastInsertRowid);

    const shRes = userStmt.run('auth_sh', 'sectionhead@kcc.test', 'hash', 'Mrs. Section Head Nimali', 'subject_teacher', 1);
    sectionHeadUserId = Number(shRes.lastInsertRowid);

    const principalRes = userStmt.run('auth_principal', 'principal@kcc.test', 'hash', 'Principal Perera', 'admin', 1);
    principalUserId = Number(principalRes.lastInsertRowid);

    const deactRes = userStmt.run('auth_deact', 'deact@kcc.test', 'hash', 'Deactivated Staff', 'subject_teacher', 0);
    deactUserId = Number(deactRes.lastInsertRowid);

    // 3. Seed academic years
    const yearStmt = db.prepare('INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES (?, ?, ?, ?)');
    year2025Id = Number(yearStmt.run('2025', '2025-01-05', '2025-12-15', 0).lastInsertRowid);
    year2026Id = Number(yearStmt.run('2026', '2026-01-05', '2026-12-15', 1).lastInsertRowid);

    // 4. Seed classes across grade bands
    const classStmt = db.prepare('INSERT INTO classes (grade, name, academic_year_id) VALUES (?, ?, ?)');
    classJuniorId = Number(classStmt.run(8, 'Grade 8-A Test', year2026Id).lastInsertRowid);
    classOLId = Number(classStmt.run(10, 'Grade 10-A Test', year2026Id).lastInsertRowid);
    classALId = Number(classStmt.run(12, 'Grade 12-Science Test', year2026Id).lastInsertRowid);

    // 5. Seed subjects
    const subStmt = db.prepare('INSERT INTO subjects (code, name, category, grade_level) VALUES (?, ?, ?, ?)');
    subjectMathId = Number(subStmt.run('AUTH_MATH', 'Mathematics', 'Core', '6-11').lastInsertRowid);
    subjectSciId = Number(subStmt.run('AUTH_SCI', 'Science', 'Core', '6-11').lastInsertRowid);
    subjectReligionId = Number(subStmt.run('AUTH_ISLAM', 'Islam', 'Religion', '6-11').lastInsertRowid);
    subjectUnofferedId = Number(subStmt.run('AUTH_FRENCH', 'French Language', 'Elective', '12-13').lastInsertRowid);

    // 6. Seed class_subjects mapping
    const csStmt = db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)');
    csStmt.run(classJuniorId, subjectMathId);
    csStmt.run(classJuniorId, subjectSciId);
    csStmt.run(classJuniorId, subjectReligionId);
    csStmt.run(classOLId, subjectMathId);
    csStmt.run(classOLId, subjectSciId);

    // 7. Seed teacher assignments
    const taStmt = db.prepare('INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, ?, ?)');
    taStmt.run(teacherUserId, classJuniorId, subjectMathId, 'subject_teacher', year2026Id);
    taStmt.run(teacherUserId, classJuniorId, null, 'class_teacher', year2026Id);
    taStmt.run(teacher2UserId, classOLId, subjectMathId, 'subject_teacher', year2026Id);

    // 8. Seed students
    const stuStmt = db.prepare(`
      INSERT INTO students (
        admission_no, full_name, calling_name, dob, gender, address,
        guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status
      ) VALUES (?, ?, ?, ?, ?, 'Colombo', 'Guardian Test', 'Parent', '0771234567', 'g@test.lk', '0771234567', 'Active')
    `);
    studentAId = Number(stuStmt.run('AUTH-STU-001', 'Student Alpha', 'Alpha', '2012-05-10', 'Male').lastInsertRowid);
    studentBId = Number(stuStmt.run('AUTH-STU-002', 'Student Beta', 'Beta', '2012-08-15', 'Female').lastInsertRowid);
    studentOLId = Number(stuStmt.run('AUTH-STU-003', 'Student Gamma (OL)', 'Gamma', '2010-02-14', 'Male').lastInsertRowid);
    studentUnrelatedId = Number(stuStmt.run('AUTH-STU-004', 'Student Delta (Unrelated)', 'Delta', '2012-09-09', 'Male').lastInsertRowid);

    // 9. Seed class enrollments in enrollments table
    const enrollStmt = db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)');
    enrollStmt.run(studentAId, classJuniorId, year2026Id, 'enrolled');
    enrollStmt.run(studentBId, classJuniorId, year2026Id, 'enrolled');
    enrollStmt.run(studentOLId, classOLId, year2026Id, 'enrolled');
    // Note: studentUnrelatedId has NO active enrollment in classJuniorId or classOLId for 2026

    // 10. Seed examinations
    const examStmt = db.prepare('INSERT INTO examinations (name, term, academic_year_id, start_date, end_date) VALUES (?, ?, ?, ?, ?)');
    exam2026JuniorId = Number(examStmt.run('Term 1 Exam 2026', 1, year2026Id, '2026-03-10', '2026-03-25').lastInsertRowid);
    exam2025JuniorId = Number(examStmt.run('Term 1 Exam 2025', 1, year2025Id, '2025-03-10', '2025-03-25').lastInsertRowid);

    // 11. Seed marks sheets
    const sheetStmt = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, status, revision)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    sheetJuniorId = Number(sheetStmt.run(exam2026JuniorId, classJuniorId, subjectMathId, year2026Id, teacherUserId, 'submitted').lastInsertRowid);
    sheetOLId = Number(sheetStmt.run(exam2026JuniorId, classOLId, subjectMathId, year2026Id, teacherUserId, 'submitted').lastInsertRowid);

    // 12. Seed marks for sheetJuniorId (entered by teacherUserId)
    const markStmt = db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, score, max_score, assessment_status, grade_letter, status, entered_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, 100, 'PRESENT', 'A', 'submitted', ?)
    `);
    markStmt.run(sheetJuniorId, exam2026JuniorId, classJuniorId, subjectMathId, studentAId, 85.0, teacherUserId);

    // 13. Grant Academic Appointments
    // sectionHeadUserId: Section Head for junior_6_9 in 2026
    grantAcademicAuthorization({
      userId: sectionHeadUserId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });

    // principalUserId: Principal for all bands in 2026
    grantAcademicAuthorization({
      userId: principalUserId,
      academicYearId: year2026Id,
      authRole: 'principal',
      gradeBand: 'all',
      grantedByUserId: adminUserId
    });

    // 14. Generate JWT tokens
    adminToken = jwt.sign({ id: adminUserId, username: 'auth_admin', role: 'admin', token_version: 1 }, process.env.JWT_SECRET!);
    teacherToken = jwt.sign({ id: teacherUserId, username: 'auth_teacher', role: 'subject_teacher', token_version: 1 }, process.env.JWT_SECRET!);
    teacher2Token = jwt.sign({ id: teacher2UserId, username: 'auth_teacher_2', role: 'subject_teacher', token_version: 1 }, process.env.JWT_SECRET!);
    sectionHeadToken = jwt.sign({ id: sectionHeadUserId, username: 'auth_sh', role: 'subject_teacher', token_version: 1 }, process.env.JWT_SECRET!);
    principalToken = jwt.sign({ id: principalUserId, username: 'auth_principal', role: 'admin', token_version: 1 }, process.env.JWT_SECRET!);
  });

  after(async () => {
    if (testServer) await testServer.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {}
  });

  // 1. Grade Band Helper Tests
  test('EXAM-AUTH-01: grade band mapping and coverage helpers evaluate accurately', () => {
    assert.equal(getGradeBandForGrade(6), 'junior_6_9');
    assert.equal(getGradeBandForGrade(9), 'junior_6_9');
    assert.equal(getGradeBandForGrade(10), 'ol_10_11');
    assert.equal(getGradeBandForGrade(11), 'ol_10_11');
    assert.equal(getGradeBandForGrade(12), 'al_12_13');
    assert.equal(getGradeBandForGrade(13), 'al_12_13');
    assert.equal(getGradeBandForGrade(5), null);

    assert.equal(doesBandCoverGrade('all', 8), true);
    assert.equal(doesBandCoverGrade('all', 12), true);
    assert.equal(doesBandCoverGrade('junior_6_9', 8), true);
    assert.equal(doesBandCoverGrade('junior_6_9', 10), false);
    assert.equal(doesBandCoverGrade('ol_10_11', 10), true);
    assert.equal(doesBandCoverGrade('ol_10_11', 12), false);
    assert.equal(doesBandCoverGrade('al_12_13', 12), true);
    assert.equal(doesBandCoverGrade('al_12_13', 8), false);
  });

  // 2. Granting Academic Staff Authorizations
  test('EXAM-AUTH-02: granting academic staff authorization succeeds for active user and records audit data', () => {
    const activeAuths = getActiveStaffAuthorizations(sectionHeadUserId, year2026Id);
    assert.equal(activeAuths.length, 1);
    assert.equal(activeAuths[0].auth_role, 'section_head');
    assert.equal(activeAuths[0].grade_band, 'junior_6_9');
    assert.equal(activeAuths[0].is_active, 1);
    assert.equal(activeAuths[0].granted_by_user_id, adminUserId);
  });

  test('EXAM-AUTH-03: duplicate active authorization is rejected with clear error', () => {
    assert.throws(
      () => {
        grantAcademicAuthorization({
          userId: sectionHeadUserId,
          academicYearId: year2026Id,
          authRole: 'section_head',
          gradeBand: 'junior_6_9',
          grantedByUserId: adminUserId
        });
      },
      /already holds an active 'section_head' appointment/
    );
  });

  test('EXAM-AUTH-04: granting appointment to a deactivated user account is rejected', () => {
    assert.throws(
      () => {
        grantAcademicAuthorization({
          userId: deactUserId,
          academicYearId: year2026Id,
          authRole: 'section_head',
          gradeBand: 'junior_6_9',
          grantedByUserId: adminUserId
        });
      },
      /Cannot grant academic authorization to a deactivated user account/
    );
  });

  // 3. Revocation and Instant Invalidation
  test('EXAM-AUTH-05: revocation requires mandatory reason and immediately removes privileges', () => {
    const activeAuths = getActiveStaffAuthorizations(sectionHeadUserId, year2026Id);
    const authId = activeAuths[0].id;

    // Revoking without reason throws error
    assert.throws(
      () => {
        revokeAcademicAuthorization({
          authorizationId: authId,
          revokedByUserId: adminUserId,
          reason: '   '
        });
      },
      /mandatory revocation reason must be provided/
    );

    // Successful revocation
    const revokeRes = revokeAcademicAuthorization({
      authorizationId: authId,
      revokedByUserId: adminUserId,
      reason: 'Term rotation and leadership reassignment'
    });
    assert.equal(revokeRes.success, true);

    // Assert that getActiveStaffAuthorizations returns 0 records immediately
    const postRevoke = getActiveStaffAuthorizations(sectionHeadUserId, year2026Id);
    assert.equal(postRevoke.length, 0);

    // Double revocation is blocked
    assert.throws(
      () => {
        revokeAcademicAuthorization({
          authorizationId: authId,
          revokedByUserId: adminUserId,
          reason: 'Repeated revocation'
        });
      },
      /already inactive or revoked/
    );

    // Re-granting re-activates the existing record cleanly
    const regrant = grantAcademicAuthorization({
      userId: sectionHeadUserId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });
    assert.equal(regrant.id, authId);
    assert.equal(getActiveStaffAuthorizations(sectionHeadUserId, year2026Id).length, 1);
  });

  // 4. Inactive User Boundary Verification
  test('EXAM-AUTH-06: deactivating user account in users table immediately terminates all academic appointments', () => {
    const tmpRes = db.prepare("INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES ('tmp_vp', 'vp@test.lk', 'hash', 'VP Test', 'subject_teacher', 1)").run();
    const tmpUserId = Number(tmpRes.lastInsertRowid);

    grantAcademicAuthorization({
      userId: tmpUserId,
      academicYearId: year2026Id,
      authRole: 'vice_principal_academic',
      gradeBand: 'all',
      grantedByUserId: adminUserId
    });

    assert.equal(getActiveStaffAuthorizations(tmpUserId, year2026Id).length, 1);

    // Deactivate user in users table
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(tmpUserId);

    // Check that authorization queries immediately return empty
    assert.equal(getActiveStaffAuthorizations(tmpUserId, year2026Id).length, 0);
    assert.equal(hasAcademicStaffRole(tmpUserId, 'vice_principal_academic', year2026Id), false);
  });

  // 5. Grade Band & Cross-Year Scope Boundaries
  test('EXAM-AUTH-07: Section Head authorization enforces grade band boundaries', () => {
    const juniorReview = canReviewMarksSheet(
      { id: sectionHeadUserId, username: 'auth_sh', email: 'sh@kcc.test', full_name: 'SH', role: 'subject_teacher' },
      sheetJuniorId // Grade 8
    );
    assert.equal(juniorReview.allowed, true);

    const olReview = canReviewMarksSheet(
      { id: sectionHeadUserId, username: 'auth_sh', email: 'sh@kcc.test', full_name: 'SH', role: 'subject_teacher' },
      sheetOLId // Grade 10
    );
    assert.equal(olReview.allowed, false);
    assert.match(olReview.reason || '', /UNAUTHORIZED/);
  });

  test('EXAM-AUTH-08: Cross-year access restriction prevents 2025 appointments from acting in 2026', () => {
    const sheet2025Res = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, status)
      VALUES (?, ?, ?, ?, ?, 'submitted')
    `).run(exam2025JuniorId, classJuniorId, subjectMathId, year2025Id, teacherUserId);
    const sheet2025Id = Number(sheet2025Res.lastInsertRowid);

    const crossYearReview = canReviewMarksSheet(
      { id: sectionHeadUserId, username: 'auth_sh', email: 'sh@kcc.test', full_name: 'SH', role: 'subject_teacher' },
      sheet2025Id
    );
    assert.equal(crossYearReview.allowed, false);
  });

  // 6. Institutional Segregation of Duties (Anti-Self-Approval)
  test('EXAM-AUTH-09: assigned teacher cannot approve own marks sheet even if appointed as Principal', () => {
    // Temporarily grant teacher Principal appointment
    grantAcademicAuthorization({
      userId: teacherUserId,
      academicYearId: year2026Id,
      authRole: 'principal',
      gradeBand: 'all',
      grantedByUserId: adminUserId
    });

    const teacherUser = { id: teacherUserId, username: 'auth_teacher', email: 't@kcc.test', full_name: 'Teacher Kamal', role: 'subject_teacher' as const };
    const approvalCheck = canApproveMarksSheet(teacherUser, sheetJuniorId);

    assert.equal(approvalCheck.allowed, false);
    assert.equal(approvalCheck.code, 'SELF_APPROVAL_TEACHER');
    assert.match(approvalCheck.reason || '', /assigned teacher cannot approve/i);

    // Revoke the temporary appointment
    const teacherAuth = getActiveStaffAuthorizations(teacherUserId, year2026Id)[0];
    revokeAcademicAuthorization({ authorizationId: teacherAuth.id, revokedByUserId: adminUserId, reason: 'Cleanup' });
  });

  test('EXAM-AUTH-10: marks entrant cannot approve sheet even if holding Principal appointment', () => {
    // Create new sheet where teacher_id is NULL
    const newSheetRes = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, status)
      VALUES (?, ?, ?, ?, NULL, 'submitted')
    `).run(exam2026JuniorId, classJuniorId, subjectSciId, year2026Id);
    const newSheetId = Number(newSheetRes.lastInsertRowid);

    // Insert mark entered by principalUserId
    db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, score, max_score, assessment_status, grade_letter, status, entered_by_user_id)
      VALUES (?, ?, ?, ?, ?, 90, 100, 'PRESENT', 'A', 'submitted', ?)
    `).run(newSheetId, exam2026JuniorId, classJuniorId, subjectSciId, studentAId, principalUserId);

    const principalUser = { id: principalUserId, username: 'auth_principal', email: 'p@kcc.test', full_name: 'Principal', role: 'admin' as const };
    const approvalCheck = canApproveMarksSheet(principalUser, newSheetId);

    assert.equal(approvalCheck.allowed, false);
    assert.equal(approvalCheck.code, 'SELF_APPROVAL_ENTRANT');
    assert.match(approvalCheck.reason || '', /user who entered or modified/i);
  });

  test('EXAM-AUTH-11: Section Head reviews/endorses but CANNOT approve; independent appointed Principal CAN approve; plain admin without appointment CANNOT approve', () => {
    const shUser = { id: sectionHeadUserId, username: 'auth_sh', email: 'sh@kcc.test', full_name: 'Section Head', role: 'subject_teacher' as const };
    const principalUser = { id: principalUserId, username: 'auth_principal', email: 'p@kcc.test', full_name: 'Principal', role: 'admin' as const };
    const plainAdminUser = { id: adminUserId, username: 'auth_admin', email: 'admin@kcc.test', full_name: 'Plain Admin', role: 'admin' as const };

    // 1. Section Head can review/endorse for junior grade band
    const shReview = canReviewMarksSheet(shUser, sheetJuniorId);
    assert.equal(shReview.allowed, true);

    // 2. Section Head CANNOT approve (approval restricted to Principal / VP)
    const shApproval = canApproveMarksSheet(shUser, sheetJuniorId);
    assert.equal(shApproval.allowed, false);
    assert.equal(shApproval.code, 'INSUFFICIENT_AUTHORIZATION');

    // 3. Plain admin without active academic staff appointment CANNOT approve
    const plainAdminApproval = canApproveMarksSheet(plainAdminUser, sheetJuniorId);
    assert.equal(plainAdminApproval.allowed, false);
    assert.equal(plainAdminApproval.code, 'INSUFFICIENT_AUTHORIZATION');

    // 4. Independent appointed Principal CAN approve
    const principalApproval = canApproveMarksSheet(principalUser, sheetJuniorId);
    assert.equal(principalApproval.allowed, true);

    // 5. Reviewer cannot self-approve as final approver (Separation between reviewer and approver)
    db.prepare('UPDATE marks_sheets SET reviewed_by_user_id = ? WHERE id = ?').run(principalUserId, sheetJuniorId);
    const reviewerSelfApprove = canApproveMarksSheet(principalUser, sheetJuniorId);
    assert.equal(reviewerSelfApprove.allowed, false);
    assert.equal(reviewerSelfApprove.code, 'SELF_APPROVAL_REVIEWER');

    // Reset reviewed_by_user_id back to null for test isolation
    db.prepare('UPDATE marks_sheets SET reviewed_by_user_id = NULL WHERE id = ?').run(sheetJuniorId);
  });

  // 7. Student Subject Enrolment Foundations & Decoupled Readiness
  test('EXAM-AUTH-12: student subject enrollment without guessing religion, with decoupled draft vs publication readiness', () => {
    // 1. Enroll in core compulsory subject: starts strictly provisional_unverified
    const coreEnroll = enrollStudentInSubject({
      studentId: studentAId,
      subjectId: subjectMathId,
      classId: classJuniorId,
      academicYearId: year2026Id,
      enrollmentCategory: 'core_compulsory'
    });
    assert.equal(coreEnroll.success, true);
    assert.equal(coreEnroll.status, 'provisional_unverified');

    // Decoupled check: eligible for draft marks entry, NOT officially confirmed
    const eligCore = isStudentEligibleForSubject(studentAId, subjectMathId, year2026Id);
    assert.equal(eligCore.eligible, true);
    assert.equal(eligCore.isEligibleForDraft, true);
    assert.equal(eligCore.isOfficiallyConfirmed, false);
    assert.equal(eligCore.status, 'provisional_unverified');

    // 2. Enroll student in chosen religion: starts strictly provisional_unverified
    const relEnroll = enrollStudentInSubject({
      studentId: studentAId,
      subjectId: subjectReligionId,
      classId: classJuniorId,
      academicYearId: year2026Id,
      enrollmentCategory: 'religion_specific'
    });
    assert.equal(relEnroll.success, true);
    assert.equal(relEnroll.status, 'provisional_unverified');

    // 3. Verify student enrollments list
    const studentEnrollments = getStudentSubjectEnrollments(studentAId, year2026Id);
    assert.equal(studentEnrollments.length, 2);

    // 4. Authorized Section Head confirms the provisional core enrollment
    verifyStudentEnrollment(coreEnroll.id, sectionHeadUserId);
    const postVerify = isStudentEligibleForSubject(studentAId, subjectMathId, year2026Id);
    assert.equal(postVerify.isEligibleForDraft, true);
    assert.equal(postVerify.isOfficiallyConfirmed, true);
    assert.equal(postVerify.status, 'confirmed');

    // 5. Authorized Section Head drops the enrollment
    dropStudentEnrollment(coreEnroll.id, sectionHeadUserId);
    const postDrop = isStudentEligibleForSubject(studentAId, subjectMathId, year2026Id);
    assert.equal(postDrop.eligible, false);
    assert.equal(postDrop.isEligibleForDraft, false);
    assert.equal(postDrop.isOfficiallyConfirmed, false);
    assert.equal(postDrop.status, 'dropped');
  });

  // 8. Administrative Authorization Management HTTP Endpoints
  test('EXAM-AUTH-13: administrative authorization management HTTP API enforces admin role', async () => {
    // 1. Unauthenticated request to /api/admin/academic-authorizations -> 401
    const unauthRes = await testServer.request('/api/admin/academic-authorizations');
    assert.equal(unauthRes.status, 401);

    // 2. Subject teacher attempting to list authorizations -> 403
    const teacherListRes = await testServer.request('/api/admin/academic-authorizations', {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert.equal(teacherListRes.status, 403);

    // 3. Subject teacher attempting to grant authorization -> 403
    const teacherGrantRes = await testServer.request('/api/admin/academic-authorizations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: teacherUserId,
        academic_year_id: year2026Id,
        auth_role: 'principal',
        grade_band: 'all'
      })
    });
    assert.equal(teacherGrantRes.status, 403);

    // 4. Administrator listing authorizations -> 200
    const adminListRes = await testServer.request('/api/admin/academic-authorizations', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(adminListRes.status, 200);
    const adminData = await adminListRes.json() as any;
    assert.ok(Array.isArray(adminData.authorizations));
    assert.ok(adminData.authorizations.length >= 1);

    // 5. Admin granting Vice Principal Academic role -> 201
    const grantVPRes = await testServer.request('/api/admin/academic-authorizations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: sectionHeadUserId,
        academic_year_id: year2026Id,
        auth_role: 'vice_principal_academic',
        grade_band: 'all'
      })
    });
    assert.equal(grantVPRes.status, 201);
    const grantVPData = await grantVPRes.json() as any;
    assert.equal(grantVPData.success, true);
    assert.ok(grantVPData.id > 0);

    // 6. Admin revoking Vice Principal Academic role -> 200
    const revokeVPRes = await testServer.request(`/api/admin/academic-authorizations/${grantVPData.id}/revoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reason: 'Restructuring leadership duties'
      })
    });
    assert.equal(revokeVPRes.status, 200);
  });

  // 9. Negative HTTP Tests: Unauthorized Confirm / Drop & Zero DB Changes
  test('EXAM-AUTH-14: Teacher from class A cannot PATCH verify or drop student record; returns 403 and leaves DB unchanged', async () => {
    // Create provisional enrollment for Student B
    const createRes = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'provisional_unverified', 'core_compulsory', datetime('now'))
    `).run(studentBId, subjectMathId, classJuniorId, year2026Id);
    const targetEnrollmentId = Number(createRes.lastInsertRowid);

    const snapshotBefore = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(targetEnrollmentId) as any;
    assert.equal(snapshotBefore.enrollment_status, 'provisional_unverified');
    assert.equal(snapshotBefore.verified_by_user_id, null);

    // 1. Teacher from another class (teacher2) attempts to verify -> 403
    const unauthVerify = await testServer.request(`/api/academic/enrollments/${targetEnrollmentId}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${teacher2Token}` }
    });
    assert.equal(unauthVerify.status, 403);
    const unauthVerifyBody = await unauthVerify.json() as any;
    assert.match(unauthVerifyBody.error, /Access denied/i);

    // Assert zero DB changes
    const snapshotAfterVerify = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(targetEnrollmentId) as any;
    assert.deepEqual(snapshotAfterVerify, snapshotBefore);

    // 2. Teacher from another class attempts to drop -> 403
    const unauthDrop = await testServer.request(`/api/academic/enrollments/${targetEnrollmentId}/drop`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${teacher2Token}` }
    });
    assert.equal(unauthDrop.status, 403);
    const unauthDropBody = await unauthDrop.json() as any;
    assert.match(unauthDropBody.error, /Access denied/i);

    // Assert zero DB changes
    const snapshotAfterDrop = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(targetEnrollmentId) as any;
    assert.deepEqual(snapshotAfterDrop, snapshotBefore);

    // 3. Even the assigned class teacher (teacherUserId) cannot confirm or drop directly without leadership appointment -> 403
    const teacherOwnVerify = await testServer.request(`/api/academic/enrollments/${targetEnrollmentId}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert.equal(teacherOwnVerify.status, 403);

    const snapshotAfterOwnVerify = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(targetEnrollmentId) as any;
    assert.deepEqual(snapshotAfterOwnVerify, snapshotBefore);
  });

  // 10. Negative HTTP Tests: Client-driven confirmation elevation stripped/rejected
  test('EXAM-AUTH-15: Client cannot confirm on POST /enrollments via is_verified or injected status; always created provisional', async () => {
    // Teacher attempts to submit is_verified: true, verified_by_user_id, and enrollment_status: 'confirmed'
    const forgeRes = await testServer.request('/api/academic/enrollments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        student_id: studentBId,
        subject_id: subjectSciId,
        class_id: classJuniorId,
        academic_year_id: year2026Id,
        enrollment_category: 'core_compulsory',
        is_verified: true,
        verified_by_user_id: teacherUserId,
        enrollment_status: 'confirmed',
        status: 'confirmed'
      })
    });

    assert.equal(forgeRes.status, 201);
    const forgeData = await forgeRes.json() as any;
    assert.equal(forgeData.success, true);
    assert.equal(forgeData.status, 'provisional_unverified');

    // Inspect database row directly: must be provisional_unverified with null verifier stamps
    const dbRow = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(forgeData.id) as any;
    assert.equal(dbRow.enrollment_status, 'provisional_unverified');
    assert.equal(dbRow.verified_by_user_id, null);
    assert.equal(dbRow.verified_at, null);
  });

  // 11. Scope Boundaries: Grade Band Enforcement
  test('EXAM-AUTH-16: Grade 6–9 Section Head cannot confirm a Grade 10 record; returns 403 and leaves DB unchanged', async () => {
    // Create provisional enrollment for Grade 10 student (studentOLId in classOLId)
    const olEnrollRes = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'provisional_unverified', 'core_compulsory', datetime('now'))
    `).run(studentOLId, subjectMathId, classOLId, year2026Id);
    const olEnrollId = Number(olEnrollRes.lastInsertRowid);

    const snapshotBefore = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(olEnrollId) as any;

    // sectionHeadUserId is Section Head for junior_6_9 only; attempting to verify Grade 10 (ol_10_11) -> 403
    const crossGradeVerify = await testServer.request(`/api/academic/enrollments/${olEnrollId}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });
    assert.equal(crossGradeVerify.status, 403);
    const crossGradeBody = await crossGradeVerify.json() as any;
    assert.match(crossGradeBody.error, /Access denied/i);

    // Verify DB remains completely unchanged
    const snapshotAfter = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(olEnrollId) as any;
    assert.deepEqual(snapshotAfter, snapshotBefore);
  });

  // 12. Scope Boundaries: Cross-Year Access Restriction
  test('EXAM-AUTH-17: 2025 appointment cannot confirm or drop a 2026 record; returns 403 and leaves DB unchanged', async () => {
    // Grant a leader appointment valid ONLY for 2025
    const leader2025Res = db.prepare("INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES ('leader_2025', 'l25@test.lk', 'hash', 'Leader 2025', 'subject_teacher', 1)").run();
    const leader2025UserId = Number(leader2025Res.lastInsertRowid);
    const leader2025Token = jwt.sign({ id: leader2025UserId, username: 'leader_2025', role: 'subject_teacher', token_version: 1 }, process.env.JWT_SECRET!);

    grantAcademicAuthorization({
      userId: leader2025UserId,
      academicYearId: year2025Id, // 2025 only!
      authRole: 'section_head',
      gradeBand: 'all',
      grantedByUserId: adminUserId
    });

    // Create provisional 2026 record with subjectReligionId (unique for studentB)
    const record2026Res = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'provisional_unverified', 'religion_specific', datetime('now'))
    `).run(studentBId, subjectReligionId, classJuniorId, year2026Id);
    const record2026Id = Number(record2026Res.lastInsertRowid);

    const snapshotBefore = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(record2026Id) as any;

    // Leader with only 2025 appointment attempts to verify 2026 record -> 403
    const crossYearRes = await testServer.request(`/api/academic/enrollments/${record2026Id}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${leader2025Token}` }
    });
    assert.equal(crossYearRes.status, 403);

    // Verify DB remains completely unchanged
    const snapshotAfter = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(record2026Id) as any;
    assert.deepEqual(snapshotAfter, snapshotBefore);
  });

  // 13. Revocation & Deactivation Instant Revocation Check
  test('EXAM-AUTH-18: Revoked or deactivated leader immediately loses verify/drop permission on next request', async () => {
    // Create temporary Section Head
    const tmpSHRes = db.prepare("INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES ('tmp_sh_rev', 'sh_rev@test.lk', 'hash', 'SH Rev', 'subject_teacher', 1)").run();
    const tmpSHId = Number(tmpSHRes.lastInsertRowid);
    const tmpSHToken = jwt.sign({ id: tmpSHId, username: 'tmp_sh_rev', role: 'subject_teacher', token_version: 1 }, process.env.JWT_SECRET!);

    const grantRes = grantAcademicAuthorization({
      userId: tmpSHId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });

    // Create a dedicated student for this test
    const tmpStuRes = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, emergency_contact, status)
      VALUES ('AUTH-STU-REV-01', 'Student Rev', 'Rev', '2012-01-01', 'Male', 'Colombo', 'G', 'P', '077', '077', 'Active')
    `).run();
    const tmpStuId = Number(tmpStuRes.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(tmpStuId, classJuniorId, year2026Id, 'enrolled');

    const targetRes = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'provisional_unverified', 'core_compulsory', datetime('now'))
    `).run(tmpStuId, subjectSciId, classJuniorId, year2026Id);
    const targetId = Number(targetRes.lastInsertRowid);

    // Revoke the appointment
    revokeAcademicAuthorization({
      authorizationId: grantRes.id,
      revokedByUserId: adminUserId,
      reason: 'Immediate revocation for testing'
    });

    // Request immediately following revocation must return 403
    const postRevokeRes = await testServer.request(`/api/academic/enrollments/${targetId}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tmpSHToken}` }
    });
    assert.equal(postRevokeRes.status, 403);
    assert.match((await postRevokeRes.json() as any).error, /Access denied/i);

    // Re-grant and then deactivate the user account in users table
    grantAcademicAuthorization({
      userId: tmpSHId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(tmpSHId);

    // Request following account deactivation must return 401 or 403
    const deactRes = await testServer.request(`/api/academic/enrollments/${targetId}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tmpSHToken}` }
    });
    assert.equal(deactRes.status, 401);
  });

  // 14. Validation: Unrelated Student Cannot Be Enrolled in Class
  test('EXAM-AUTH-19: Cannot associate unrelated student to class where they are not enrolled in enrollments table; returns 400 and zero writes', async () => {
    const totalEnrollmentsBefore = (db.prepare('SELECT COUNT(*) as cnt FROM student_subject_enrollments').get() as any).cnt;

    // studentUnrelatedId is NOT enrolled in classJuniorId for year2026Id
    const res = await testServer.request('/api/academic/enrollments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        student_id: studentUnrelatedId,
        subject_id: subjectMathId,
        class_id: classJuniorId,
        academic_year_id: year2026Id,
        enrollment_category: 'core_compulsory'
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.match(body.error, /not enrolled in class/i);

    const totalEnrollmentsAfter = (db.prepare('SELECT COUNT(*) as cnt FROM student_subject_enrollments').get() as any).cnt;
    assert.equal(totalEnrollmentsAfter, totalEnrollmentsBefore);
  });

  // 15. Validation: Subject Must Be Offered For Class (class_subjects check)
  test('EXAM-AUTH-20: Cannot associate student with a subject not offered for that class; returns 400 and zero writes', async () => {
    const totalEnrollmentsBefore = (db.prepare('SELECT COUNT(*) as cnt FROM student_subject_enrollments').get() as any).cnt;

    // subjectUnofferedId (French Language) is not in class_subjects for classJuniorId
    const res = await testServer.request('/api/academic/enrollments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        student_id: studentAId,
        subject_id: subjectUnofferedId,
        class_id: classJuniorId,
        academic_year_id: year2026Id,
        enrollment_category: 'language_specific'
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.match(body.error, /not offered for class/i);

    const totalEnrollmentsAfter = (db.prepare('SELECT COUNT(*) as cnt FROM student_subject_enrollments').get() as any).cnt;
    assert.equal(totalEnrollmentsAfter, totalEnrollmentsBefore);
  });

  // 16. Protection Against Unsafe Overwrite of Confirmed or Dropped State
  test('EXAM-AUTH-21: Cannot overwrite previously confirmed or dropped enrollment via POST /enrollments; returns 409 Conflict', async () => {
    // 1. Create a confirmed enrollment for a dedicated student
    const stuConfRes = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES ('AUTH-STU-CONF-01', 'Student Confirmed', 'Conf', '2012-01-01', 'Male', 'Colombo', 'G', 'P', '0771112233', 'conf@test.lk', '0771112233', 'Active')
    `).run();
    const confStudentId = Number(stuConfRes.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(confStudentId, classJuniorId, year2026Id, 'enrolled');

    const confRes = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at, created_at)
      VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory', ?, datetime('now'), datetime('now'))
    `).run(confStudentId, subjectSciId, classJuniorId, year2026Id, principalUserId);
    const confId = Number(confRes.lastInsertRowid);

    const confSnapshotBefore = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(confId) as any;

    // Attempt generic POST overwrite on confirmed enrollment -> 409 Conflict
    const overwriteConfRes = await testServer.request('/api/academic/enrollments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        student_id: confStudentId,
        subject_id: subjectSciId,
        class_id: classJuniorId,
        academic_year_id: year2026Id,
        enrollment_category: 'core_compulsory'
      })
    });
    assert.equal(overwriteConfRes.status, 409);
    const confErr = await overwriteConfRes.json() as any;
    assert.match(confErr.error, /confirmed status.*Generic overwrite forbidden/i);

    // Verify DB unchanged
    const confSnapshotAfter = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(confId) as any;
    assert.deepEqual(confSnapshotAfter, confSnapshotBefore);

    // 2. Mark an enrollment as dropped
    db.prepare("UPDATE student_subject_enrollments SET enrollment_status = 'dropped' WHERE id = ?").run(confId);
    const dropSnapshotBefore = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(confId) as any;

    // Attempt generic POST overwrite on dropped enrollment -> 409 Conflict
    const overwriteDropRes = await testServer.request('/api/academic/enrollments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        student_id: confStudentId,
        subject_id: subjectSciId,
        class_id: classJuniorId,
        academic_year_id: year2026Id,
        enrollment_category: 'core_compulsory'
      })
    });
    assert.equal(overwriteDropRes.status, 409);
    const dropErr = await overwriteDropRes.json() as any;
    assert.match(dropErr.error, /dropped status.*Generic overwrite forbidden/i);

    // Verify DB unchanged
    const dropSnapshotAfter = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(confId) as any;
    assert.deepEqual(dropSnapshotAfter, dropSnapshotBefore);
  });

  // 17. Authorized Scoped Verification Succeeds and Records Audit Data
  test('EXAM-AUTH-22: Authorized scoped verification succeeds, updates status to confirmed, and records actor and timestamp', async () => {
    // Create provisional enrollment for studentB in subjectMathId
    const target = db.prepare(`
      SELECT id FROM student_subject_enrollments
      WHERE student_id = ? AND subject_id = ? AND academic_year_id = ?
    `).get(studentBId, subjectMathId, year2026Id) as any;

    assert.ok(target?.id > 0);

    // Section Head verifies Grade 8 enrollment -> 200 OK
    const verifyRes = await testServer.request(`/api/academic/enrollments/${target.id}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json() as any;
    assert.equal(verifyData.success, true);

    // Verify database state: status = confirmed, verified_by_user_id = sectionHeadUserId
    const dbRow = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(target.id) as any;
    assert.equal(dbRow.enrollment_status, 'confirmed');
    assert.equal(dbRow.verified_by_user_id, sectionHeadUserId);
    assert.ok(dbRow.verified_at !== null);

    // Verify audit log entry exists
    const auditRow = db.prepare(`
      SELECT * FROM audit_logs
      WHERE action = 'STUDENT_SUBJECT_VERIFY' AND (entity_id = ? OR entity_id = ?)
      ORDER BY id DESC LIMIT 1
    `).get(String(target.id), target.id) as any;
    assert.ok(auditRow);
    assert.equal(auditRow.user_id, sectionHeadUserId);
  });

  // 18. Readiness States: Distinct Draft vs Official Confirmation
  test('EXAM-AUTH-23: confirmed, provisional_unverified, dropped, and transferred remain distinct in draft vs publication readiness', () => {
    const testYear = year2026Id;
    const testSub = subjectMathId;

    // Seed synthetic students in students table
    const insStudent = db.prepare(`
      INSERT OR IGNORE INTO students (id, admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES (?, ?, ?, ?, '2012-01-01', 'Male', 'Colombo', 'Guardian', 'Parent', '0770000000', 'g@test.lk', '0770000000', 'Active')
    `);
    insStudent.run(99901, 'STU-99901', 'Student 99901', 'S1');
    insStudent.run(99902, 'STU-99902', 'Student 99902', 'S2');
    insStudent.run(99903, 'STU-99903', 'Student 99903', 'S3');
    insStudent.run(99904, 'STU-99904', 'Student 99904', 'S4');

    // State 1: provisional_unverified
    db.prepare(`
      INSERT OR REPLACE INTO student_subject_enrollments (id, student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (88881, 99901, ?, ?, ?, 'provisional_unverified', 'core_compulsory', datetime('now'))
    `).run(testSub, classJuniorId, testYear);
    const provCheck = isStudentEligibleForSubject(99901, testSub, testYear);
    assert.equal(provCheck.isEligibleForDraft, true);
    assert.equal(provCheck.isOfficiallyConfirmed, false);
    assert.equal(provCheck.status, 'provisional_unverified');

    // State 2: confirmed
    db.prepare(`
      INSERT OR REPLACE INTO student_subject_enrollments (id, student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at, created_at)
      VALUES (88882, 99902, ?, ?, ?, 'confirmed', 'core_compulsory', ?, datetime('now'), datetime('now'))
    `).run(testSub, classJuniorId, testYear, principalUserId);
    const confCheck = isStudentEligibleForSubject(99902, testSub, testYear);
    assert.equal(confCheck.isEligibleForDraft, true);
    assert.equal(confCheck.isOfficiallyConfirmed, true);
    assert.equal(confCheck.status, 'confirmed');

    // State 3: dropped
    db.prepare(`
      INSERT OR REPLACE INTO student_subject_enrollments (id, student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at, created_at)
      VALUES (88883, 99903, ?, ?, ?, 'dropped', 'core_compulsory', ?, datetime('now'), datetime('now'))
    `).run(testSub, classJuniorId, testYear, principalUserId);
    const dropCheck = isStudentEligibleForSubject(99903, testSub, testYear);
    assert.equal(dropCheck.eligible, false);
    assert.equal(dropCheck.isEligibleForDraft, false);
    assert.equal(dropCheck.isOfficiallyConfirmed, false);
    assert.equal(dropCheck.status, 'dropped');

    // State 4: transferred
    db.prepare(`
      INSERT OR REPLACE INTO student_subject_enrollments (id, student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (88884, 99904, ?, ?, ?, 'transferred', 'core_compulsory', datetime('now'))
    `).run(testSub, classJuniorId, testYear);
    const transCheck = isStudentEligibleForSubject(99904, testSub, testYear);
    assert.equal(transCheck.eligible, false);
    assert.equal(transCheck.isEligibleForDraft, false);
    assert.equal(transCheck.isOfficiallyConfirmed, false);
    assert.equal(transCheck.status, 'transferred');
  });

  // 19. Examination Publication Authorization
  test('EXAM-AUTH-24: independent whole-exam publication requires Principal or VP Academic appointment with all-band scope', () => {
    const principalUser = { id: principalUserId, username: 'auth_principal', email: 'p@kcc.test', full_name: 'Principal', role: 'admin' as const };
    const shUser = { id: sectionHeadUserId, username: 'auth_sh', email: 'sh@kcc.test', full_name: 'Section Head', role: 'subject_teacher' as const };
    const teacherUser = { id: teacherUserId, username: 'auth_teacher', email: 't@kcc.test', full_name: 'Teacher', role: 'subject_teacher' as const };
    const plainAdminUser = { id: adminUserId, username: 'auth_admin', email: 'admin@kcc.test', full_name: 'Admin', role: 'admin' as const };

    // Appointed Principal (all-band scope) can publish
    const pubPrincipal = canPublishExamination(principalUser, exam2026JuniorId);
    assert.equal(pubPrincipal.allowed, true);

    // Section Head (junior_6_9 scope only) CANNOT publish whole exam
    const pubSH = canPublishExamination(shUser, exam2026JuniorId);
    assert.equal(pubSH.allowed, false);
    assert.match(pubSH.reason || '', /all-band scope/i);

    // Teacher CANNOT publish whole exam
    const pubTeacher = canPublishExamination(teacherUser, exam2026JuniorId);
    assert.equal(pubTeacher.allowed, false);

    // Plain admin without academic appointment CANNOT publish whole exam
    const pubPlainAdmin = canPublishExamination(plainAdminUser, exam2026JuniorId);
    assert.equal(pubPlainAdmin.allowed, false);
  });

  // 20. requireAcademicStaffRole Middleware Scoping
  test('EXAM-AUTH-25: requireAcademicStaffRole middleware requires explicit academic year scope and enforces grade bounds', async () => {
    // 1. Missing scope returns 400
    const missingScopeMiddleware = requireAcademicStaffRole(['section_head'], () => undefined);
    let capturedStatus = 0;
    let capturedBody: any = null;
    const mockReqMissing: any = { user: { id: sectionHeadUserId, role: 'subject_teacher' } };
    const mockResMissing: any = {
      status(s: number) { capturedStatus = s; return this; },
      json(b: any) { capturedBody = b; }
    };
    missingScopeMiddleware(mockReqMissing, mockResMissing, () => {});
    assert.equal(capturedStatus, 400);
    assert.match(capturedBody.error, /Explicit academic year scope is required/i);

    // 2. Matching scope passes to next()
    let calledNext = false;
    const validScopeMiddleware = requireAcademicStaffRole(
      ['section_head'],
      () => ({ academicYearId: year2026Id, grade: 8 })
    );
    const mockReqValid: any = { user: { id: sectionHeadUserId, role: 'subject_teacher' } };
    validScopeMiddleware(mockReqValid, {} as any, () => { calledNext = true; });
    assert.equal(calledNext, true);

    // 3. Out-of-band grade returns 403
    let gradeRejectStatus = 0;
    let gradeRejectBody: any = null;
    const mockResGrade: any = {
      status(s: number) { gradeRejectStatus = s; return this; },
      json(b: any) { gradeRejectBody = b; }
    };
    const outOfBandMiddleware = requireAcademicStaffRole(
      ['section_head'],
      () => ({ academicYearId: year2026Id, grade: 10 }) // Grade 10 is outside junior_6_9
    );
    outOfBandMiddleware(mockReqValid, mockResGrade, () => {});
    assert.equal(gradeRejectStatus, 403);
    assert.match(gradeRejectBody.error, /Access denied/i);
  });

  // 21. Gate 3A: Anti-Self-Review Enforcement for Assigned Teacher and Entrant
  test('EXAM-AUTH-26: Assigned sheet teacher CANNOT review or endorse own marks sheet even if appointed Section Head', () => {
    // Grant teacherUserId a Section Head appointment covering Junior 6-9
    grantAcademicAuthorization({
      userId: teacherUserId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });

    const teacherAsSHUser = {
      id: teacherUserId,
      username: 'auth_teacher',
      email: 'teacher@kcc.test',
      full_name: 'Teacher Kamal',
      role: 'subject_teacher' as const
    };

    // teacherUserId is the assigned teacher on sheetJuniorId
    const reviewCheck = canReviewMarksSheet(teacherAsSHUser, sheetJuniorId);
    assert.equal(reviewCheck.allowed, false);
    assert.equal(reviewCheck.code, 'SELF_REVIEW_TEACHER');
    assert.match(reviewCheck.reason || '', /assigned teacher cannot review or endorse/i);

    // Clean up temporary appointment
    const authRow = getActiveStaffAuthorizations(teacherUserId, year2026Id).find(a => a.auth_role === 'section_head');
    if (authRow) {
      revokeAcademicAuthorization({ authorizationId: authRow.id, revokedByUserId: adminUserId, reason: 'Test cleanup' });
    }
  });

  test('EXAM-AUTH-27: User who entered or modified marks CANNOT review or endorse marks sheet even if holding Section Head appointment', () => {
    // Create new sheet where teacher is someone else (teacher2UserId)
    const entrantSheetRes = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, status)
      VALUES (?, ?, ?, ?, ?, 'submitted')
    `).run(exam2026JuniorId, classJuniorId, subjectReligionId, year2026Id, teacher2UserId);
    const entrantSheetId = Number(entrantSheetRes.lastInsertRowid);

    // sectionHeadUserId enters a mark for this sheet
    db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, score, max_score, assessment_status, grade_letter, status, entered_by_user_id)
      VALUES (?, ?, ?, ?, ?, 92, 100, 'PRESENT', 'A', 'submitted', ?)
    `).run(entrantSheetId, exam2026JuniorId, classJuniorId, subjectReligionId, studentBId, sectionHeadUserId);

    const shUser = {
      id: sectionHeadUserId,
      username: 'auth_sh',
      email: 'sectionhead@kcc.test',
      full_name: 'Section Head',
      role: 'subject_teacher' as const
    };

    // Attempting to review sheet where sectionHeadUserId entered marks -> blocked
    const reviewCheck = canReviewMarksSheet(shUser, entrantSheetId);
    assert.equal(reviewCheck.allowed, false);
    assert.equal(reviewCheck.code, 'SELF_REVIEW_ENTRANT');
    assert.match(reviewCheck.reason || '', /user who entered or modified marks cannot review/i);
  });

  test('EXAM-AUTH-28: canViewMarksSheet permits assigned teacher and scoped leadership read-only inspection, but denies out-of-scope viewer', () => {
    const teacherUser = { id: teacherUserId, username: 'auth_teacher', email: 'teacher@kcc.test', full_name: 'Teacher Kamal', role: 'subject_teacher' as const };
    const shUser = { id: sectionHeadUserId, username: 'auth_sh', email: 'sectionhead@kcc.test', full_name: 'Section Head', role: 'subject_teacher' as const };
    const teacher2User = { id: teacher2UserId, username: 'auth_teacher_2', email: 'teacher2@kcc.test', full_name: 'Teacher Sunethra', role: 'subject_teacher' as const };

    // 1. Assigned teacher can view own sheet (even if self-review is prohibited)
    const teacherView = canViewMarksSheet(teacherUser, sheetJuniorId);
    assert.equal(teacherView.allowed, true);

    // 2. Scoped Section Head can view junior sheet
    const shView = canViewMarksSheet(shUser, sheetJuniorId);
    assert.equal(shView.allowed, true);

    // 3. Unrelated teacher with no appointment cannot view sheet
    const unauthView = canViewMarksSheet(teacher2User, sheetJuniorId);
    assert.equal(unauthView.allowed, false);
    assert.match(unauthView.reason || '', /UNAUTHORIZED/i);

    // 4. Revoked Teacher (G3S-AUD-03): sheet.teacher_id is still teacherUserId, but assignment is removed from teacher_assignments
    db.prepare('DELETE FROM teacher_assignments WHERE teacher_id = ? AND class_id = ? AND subject_id = ?').run(teacherUserId, classJuniorId, subjectMathId);
    const revokedView = canViewMarksSheet(teacherUser, sheetJuniorId);
    assert.equal(revokedView.allowed, false);
    assert.match(revokedView.reason || '', /UNAUTHORIZED/i);

    // Restore teacher assignment for subsequent tests
    db.prepare('INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, ?, ?)').run(
      teacherUserId, classJuniorId, subjectMathId, 'subject_teacher', year2026Id
    );

    // 5. Deactivated teacher account
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(teacherUserId);
    const deactView = canViewMarksSheet(teacherUser, sheetJuniorId);
    assert.equal(deactView.allowed, false);
    assert.equal(deactView.code, 'USER_DEACTIVATED');
    db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(teacherUserId);
  });

  // 22. Gate 3A: Enrolment State Machine & Transition Invariants via HTTP API
  test('EXAM-AUTH-29: Reconfirming an already confirmed enrollment fails with 409 Conflict; zero DB writes and zero audit entries', async () => {
    // Create student and confirmed enrollment
    const stuRes = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES ('AUTH-STU-RECONF', 'Student Reconf', 'Reconf', '2012-01-01', 'Male', 'Colombo', 'G', 'P', '0771112233', 'reconf@test.lk', '0771112233', 'Active')
    `).run();
    const stuId = Number(stuRes.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(stuId, classJuniorId, year2026Id, 'enrolled');

    const enrollRes = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at, created_at)
      VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory', ?, '2026-01-01 00:00:00', '2026-01-01 00:00:00')
    `).run(stuId, subjectSciId, classJuniorId, year2026Id, principalUserId);
    const enrollmentId = Number(enrollRes.lastInsertRowid);

    const snapshotBefore = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
    const auditCountBefore = (db.prepare('SELECT COUNT(*) as cnt FROM audit_logs WHERE entity_id = ?').get(String(enrollmentId)) as any).cnt;

    // Attempt PATCH /verify on already confirmed enrollment -> 409 Conflict
    const res = await testServer.request(`/api/academic/enrollments/${enrollmentId}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });

    assert.equal(res.status, 409);
    const body = await res.json() as any;
    assert.match(body.error, /already confirmed.*reconfirmation.*prohibited/i);

    // Verify DB unchanged: status, verified_at, verified_by_user_id exactly identical
    const snapshotAfter = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
    assert.deepEqual(snapshotAfter, snapshotBefore);

    // Verify zero audit rows created
    const auditCountAfter = (db.prepare('SELECT COUNT(*) as cnt FROM audit_logs WHERE entity_id = ?').get(String(enrollmentId)) as any).cnt;
    assert.equal(auditCountAfter, auditCountBefore);
  });

  test('EXAM-AUTH-30: Cannot confirm a dropped enrollment; returns 409 Conflict, zero DB writes, and zero audit entries', async () => {
    // Create student and dropped enrollment
    const stuRes = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES ('AUTH-STU-DROPCONF', 'Student DropConf', 'DC', '2012-01-01', 'Male', 'Colombo', 'G', 'P', '0771112233', 'dc@test.lk', '0771112233', 'Active')
    `).run();
    const stuId = Number(stuRes.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(stuId, classJuniorId, year2026Id, 'enrolled');

    const enrollRes = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at, created_at)
      VALUES (?, ?, ?, ?, 'dropped', 'core_compulsory', ?, '2026-01-01 00:00:00', '2026-01-01 00:00:00')
    `).run(stuId, subjectSciId, classJuniorId, year2026Id, sectionHeadUserId);
    const enrollmentId = Number(enrollRes.lastInsertRowid);

    const snapshotBefore = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
    const auditCountBefore = (db.prepare('SELECT COUNT(*) as cnt FROM audit_logs WHERE entity_id = ?').get(String(enrollmentId)) as any).cnt;

    // Attempt PATCH /verify on dropped enrollment -> 409 Conflict
    const res = await testServer.request(`/api/academic/enrollments/${enrollmentId}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });

    assert.equal(res.status, 409);
    const body = await res.json() as any;
    assert.match(body.error, /dropped.*cannot be revived via ordinary verification/i);

    // Verify DB unchanged
    const snapshotAfter = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
    assert.deepEqual(snapshotAfter, snapshotBefore);

    // Verify zero audit rows created
    const auditCountAfter = (db.prepare('SELECT COUNT(*) as cnt FROM audit_logs WHERE entity_id = ?').get(String(enrollmentId)) as any).cnt;
    assert.equal(auditCountAfter, auditCountBefore);
  });

  test('EXAM-AUTH-31: Cannot confirm a transferred enrollment; returns 409 Conflict, zero DB writes, and zero audit entries', async () => {
    // Create student and transferred enrollment
    const stuRes = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES ('AUTH-STU-TRANSCONF', 'Student TransConf', 'TC', '2012-01-01', 'Male', 'Colombo', 'G', 'P', '0771112233', 'tc@test.lk', '0771112233', 'Active')
    `).run();
    const stuId = Number(stuRes.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(stuId, classJuniorId, year2026Id, 'enrolled');

    const enrollRes = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'transferred', 'core_compulsory', '2026-01-01 00:00:00')
    `).run(stuId, subjectSciId, classJuniorId, year2026Id);
    const enrollmentId = Number(enrollRes.lastInsertRowid);

    const snapshotBefore = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
    const auditCountBefore = (db.prepare('SELECT COUNT(*) as cnt FROM audit_logs WHERE entity_id = ?').get(String(enrollmentId)) as any).cnt;

    // Attempt PATCH /verify on transferred enrollment -> 409 Conflict
    const res = await testServer.request(`/api/academic/enrollments/${enrollmentId}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });

    assert.equal(res.status, 409);
    const body = await res.json() as any;
    assert.match(body.error, /transferred.*cannot be revived via ordinary verification/i);

    // Verify DB unchanged
    const snapshotAfter = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(enrollmentId);
    assert.deepEqual(snapshotAfter, snapshotBefore);

    // Verify zero audit rows created
    const auditCountAfter = (db.prepare('SELECT COUNT(*) as cnt FROM audit_logs WHERE entity_id = ?').get(String(enrollmentId)) as any).cnt;
    assert.equal(auditCountAfter, auditCountBefore);
  });

  test('EXAM-AUTH-32: Cannot drop an already dropped or transferred enrollment; returns 409 Conflict and zero DB writes', async () => {
    // 1. dropped -> dropped
    const stuRes = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES ('AUTH-STU-DROPDROP', 'Student DropDrop', 'DD', '2012-01-01', 'Male', 'Colombo', 'G', 'P', '0771112233', 'dd@test.lk', '0771112233', 'Active')
    `).run();
    const stuId = Number(stuRes.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(stuId, classJuniorId, year2026Id, 'enrolled');

    const enrollRes1 = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'dropped', 'core_compulsory', '2026-01-01 00:00:00')
    `).run(stuId, subjectSciId, classJuniorId, year2026Id);
    const dropId = Number(enrollRes1.lastInsertRowid);

    const snapshotBeforeDrop = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(dropId);

    const dropRes = await testServer.request(`/api/academic/enrollments/${dropId}/drop`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });
    assert.equal(dropRes.status, 409);
    assert.deepEqual(db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(dropId), snapshotBeforeDrop);

    // 2. transferred -> dropped
    const enrollRes2 = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'transferred', 'core_compulsory', '2026-01-01 00:00:00')
    `).run(stuId, subjectMathId, classJuniorId, year2026Id);
    const transId = Number(enrollRes2.lastInsertRowid);

    const snapshotBeforeTrans = db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(transId);

    const transDropRes = await testServer.request(`/api/academic/enrollments/${transId}/drop`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });
    assert.equal(transDropRes.status, 409);
    assert.deepEqual(db.prepare('SELECT * FROM student_subject_enrollments WHERE id = ?').get(transId), snapshotBeforeTrans);
  });

  test('EXAM-AUTH-33: Audit history accurately records previous_status (not post-state) and mutation + audit are atomic', async () => {
    // 1. Create a provisional enrollment
    const stuRes = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES ('AUTH-STU-AUDIT', 'Student Audit', 'Audit', '2012-01-01', 'Male', 'Colombo', 'G', 'P', '0771112233', 'audit@test.lk', '0771112233', 'Active')
    `).run();
    const stuId = Number(stuRes.lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)').run(stuId, classJuniorId, year2026Id, 'enrolled');

    const enrollRes = db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'provisional_unverified', 'core_compulsory', '2026-01-01 00:00:00')
    `).run(stuId, subjectSciId, classJuniorId, year2026Id);
    const enrollId = Number(enrollRes.lastInsertRowid);

    // 2. Perform verification via API
    const verifyRes = await testServer.request(`/api/academic/enrollments/${enrollId}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sectionHeadToken}` }
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json() as any;
    assert.equal(verifyBody.previous_status, 'provisional_unverified');
    assert.equal(verifyBody.status, 'confirmed');

    // 3. Inspect audit_logs table for true previous_status and new_status
    const verifyAudit = db.prepare(`
      SELECT * FROM audit_logs
      WHERE action = 'STUDENT_SUBJECT_VERIFY' AND entity_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(String(enrollId)) as any;

    assert.ok(verifyAudit);
    assert.equal(verifyAudit.user_id, sectionHeadUserId);
    const verifyDetails = JSON.parse(verifyAudit.details);
    assert.equal(verifyDetails.previous_status, 'provisional_unverified');
    assert.equal(verifyDetails.new_status, 'confirmed');

    // 4. Now drop the confirmed enrollment
    const dropRes = await testServer.request(`/api/academic/enrollments/${enrollId}/drop`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${sectionHeadToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason: 'Student dropped elective by institutional request' })
    });
    assert.equal(dropRes.status, 200);
    const dropBody = await dropRes.json() as any;
    assert.equal(dropBody.previous_status, 'confirmed');
    assert.equal(dropBody.status, 'dropped');

    // 5. Inspect drop audit log for true previous_status = confirmed and new_status = dropped
    const dropAudit = db.prepare(`
      SELECT * FROM audit_logs
      WHERE action = 'STUDENT_SUBJECT_DROP' AND entity_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(String(enrollId)) as any;

    assert.ok(dropAudit);
    assert.equal(dropAudit.user_id, sectionHeadUserId);
    const dropDetails = JSON.parse(dropAudit.details);
    assert.equal(dropDetails.previous_status, 'confirmed');
    assert.equal(dropDetails.new_status, 'dropped');
    assert.equal(dropDetails.reason, 'Student dropped elective by institutional request');
  });
});
