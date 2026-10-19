import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { runMigration005 } from '../src/db/migrations/005_examination_integrity.js';
import {
  grantAcademicAuthorization,
  revokeAcademicAuthorization,
  getActiveStaffAuthorizations,
  hasAcademicStaffRole,
  canReviewMarksSheet,
  canApproveMarksSheet,
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
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { switchDatabase, db } from '../src/db/database.js';

describe('PR-005 Gate 2: Academic Staff Authorization, Segregation of Duties & Subject Enrolment Tests', () => {
  let testDbPath: string;
  let testServer: TestServerInstance;
  let adminToken: string;
  let teacherToken: string;
  let sectionHeadToken: string;

  // Entity IDs
  let adminUserId: number;
  let teacherUserId: number;
  let sectionHeadUserId: number;
  let deactUserId: number;

  let year2025Id: number;
  let year2026Id: number;

  let classJuniorId: number; // Grade 8
  let classOLId: number;     // Grade 10
  let classALId: number;     // Grade 12

  let subjectMathId: number;
  let subjectSciId: number;
  let subjectReligionId: number;

  let studentAId: number;
  let studentBId: number;

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
    const adminRes = userStmt.run('auth_admin', 'admin@kcc.test', 'hash', 'Principal Administrator', 'admin', 1);
    adminUserId = Number(adminRes.lastInsertRowid);

    const teacherRes = userStmt.run('auth_teacher', 'teacher@kcc.test', 'hash', 'Mr. Teacher Kamal', 'subject_teacher', 1);
    teacherUserId = Number(teacherRes.lastInsertRowid);

    const shRes = userStmt.run('auth_sh', 'sectionhead@kcc.test', 'hash', 'Mrs. Section Head Nimali', 'subject_teacher', 1);
    sectionHeadUserId = Number(shRes.lastInsertRowid);

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

    // 6. Seed students
    const stuStmt = db.prepare(`
      INSERT INTO students (
        admission_no, full_name, calling_name, dob, gender, address,
        guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status
      ) VALUES (?, ?, ?, ?, ?, 'Colombo', 'Guardian Test', 'Parent', '0771234567', 'g@test.lk', '0771234567', 'Active')
    `);
    studentAId = Number(stuStmt.run('AUTH-STU-001', 'Student Alpha', 'Alpha', '2012-05-10', 'Male').lastInsertRowid);
    studentBId = Number(stuStmt.run('AUTH-STU-002', 'Student Beta', 'Beta', '2012-08-15', 'Female').lastInsertRowid);

    // 7. Seed enrollments in class 8-A
    const enrollStmt = db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, ?)');
    enrollStmt.run(studentAId, classJuniorId, year2026Id, 'enrolled');
    enrollStmt.run(studentBId, classJuniorId, year2026Id, 'enrolled');

    // 8. Seed examinations
    const examStmt = db.prepare('INSERT INTO examinations (name, term, academic_year_id, start_date, end_date) VALUES (?, ?, ?, ?, ?)');
    exam2026JuniorId = Number(examStmt.run('Term 1 Exam 2026', 1, year2026Id, '2026-03-10', '2026-03-25').lastInsertRowid);
    exam2025JuniorId = Number(examStmt.run('Term 1 Exam 2025', 1, year2025Id, '2025-03-10', '2025-03-25').lastInsertRowid);

    // 9. Seed marks sheets
    const sheetStmt = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, status, revision)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    sheetJuniorId = Number(sheetStmt.run(exam2026JuniorId, classJuniorId, subjectMathId, year2026Id, teacherUserId, 'submitted').lastInsertRowid);
    sheetOLId = Number(sheetStmt.run(exam2026JuniorId, classOLId, subjectMathId, year2026Id, teacherUserId, 'submitted').lastInsertRowid);

    // 10. Seed marks for sheetJuniorId (entered by teacherUserId)
    const markStmt = db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, score, max_score, assessment_status, grade_letter, status, entered_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, 100, 'PRESENT', 'A', 'submitted', ?)
    `);
    markStmt.run(sheetJuniorId, exam2026JuniorId, classJuniorId, subjectMathId, studentAId, 85.0, teacherUserId);

    // 11. Generate JWT tokens
    adminToken = jwt.sign({ id: adminUserId, username: 'auth_admin', role: 'admin', token_version: 1 }, process.env.JWT_SECRET!);
    teacherToken = jwt.sign({ id: teacherUserId, username: 'auth_teacher', role: 'subject_teacher', token_version: 1 }, process.env.JWT_SECRET!);
    sectionHeadToken = jwt.sign({ id: sectionHeadUserId, username: 'auth_sh', role: 'subject_teacher', token_version: 1 }, process.env.JWT_SECRET!);
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
    const res = grantAcademicAuthorization({
      userId: sectionHeadUserId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });

    assert.equal(res.success, true);
    assert.ok(res.id > 0);

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
    // Create a temporary user with active VP appointment
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
    // sectionHeadUserId is Section Head for junior_6_9 in 2026
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
    // Create sheet for 2025 exam
    const sheet2025Res = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, status)
      VALUES (?, ?, ?, ?, ?, 'submitted')
    `).run(exam2025JuniorId, classJuniorId, subjectMathId, year2025Id, teacherUserId);
    const sheet2025Id = Number(sheet2025Res.lastInsertRowid);

    // sectionHeadUserId only has 2026 appointment; checking 2025 sheet must fail
    const crossYearReview = canReviewMarksSheet(
      { id: sectionHeadUserId, username: 'auth_sh', email: 'sh@kcc.test', full_name: 'SH', role: 'subject_teacher' },
      sheet2025Id
    );
    assert.equal(crossYearReview.allowed, false);
  });

  // 6. Institutional Segregation of Duties (Anti-Self-Approval)
  test('EXAM-AUTH-09: assigned teacher cannot approve own marks sheet even if appointed as Section Head', () => {
    // Grant teacherUserId Section Head appointment for junior_6_9
    grantAcademicAuthorization({
      userId: teacherUserId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });

    // teacherUserId is marks_sheets.teacher_id on sheetJuniorId
    const teacherUser = { id: teacherUserId, username: 'auth_teacher', email: 't@kcc.test', full_name: 'Teacher Kamal', role: 'subject_teacher' as const };
    const approvalCheck = canApproveMarksSheet(teacherUser, sheetJuniorId);

    assert.equal(approvalCheck.allowed, false);
    assert.equal(approvalCheck.code, 'SELF_APPROVAL_TEACHER');
    assert.match(approvalCheck.reason || '', /assigned teacher cannot approve/i);
  });

  test('EXAM-AUTH-10: marks entrant cannot approve sheet even if appointed as Section Head', () => {
    // Create new sheet where teacher_id is NULL (unassigned or unverified)
    const newSheetRes = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, status)
      VALUES (?, ?, ?, ?, NULL, 'submitted')
    `).run(exam2026JuniorId, classJuniorId, subjectSciId, year2026Id);
    const newSheetId = Number(newSheetRes.lastInsertRowid);

    // Insert mark where entered_by_user_id is sectionHeadUserId
    db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, score, max_score, assessment_status, grade_letter, status, entered_by_user_id)
      VALUES (?, ?, ?, ?, ?, 90, 100, 'PRESENT', 'A', 'submitted', ?)
    `).run(newSheetId, exam2026JuniorId, classJuniorId, subjectSciId, studentAId, sectionHeadUserId);

    // sectionHeadUserId is Section Head for junior_6_9 and teacher_id is NULL, BUT sectionHead entered the marks!
    const shUser = { id: sectionHeadUserId, username: 'auth_sh', email: 'sh@kcc.test', full_name: 'Section Head', role: 'subject_teacher' as const };
    const approvalCheck = canApproveMarksSheet(shUser, newSheetId);

    assert.equal(approvalCheck.allowed, false);
    assert.equal(approvalCheck.code, 'SELF_APPROVAL_ENTRANT');
    assert.match(approvalCheck.reason || '', /user who entered or modified/i);
  });

  test('EXAM-AUTH-11: independent leadership user who did not teach or enter marks CAN approve the sheet', () => {
    // sectionHeadUserId did not teach sheetJuniorId and did not enter marks on sheetJuniorId
    const shUser = { id: sectionHeadUserId, username: 'auth_sh', email: 'sh@kcc.test', full_name: 'Section Head', role: 'subject_teacher' as const };
    const approvalCheck = canApproveMarksSheet(shUser, sheetJuniorId);

    assert.equal(approvalCheck.allowed, true);
  });

  // 7. Student Subject Enrolment Foundations
  test('EXAM-AUTH-12: student subject enrollment without guessing religion or electives', () => {
    // 1. Enroll in core compulsory subject without verification
    const coreEnroll = enrollStudentInSubject({
      studentId: studentAId,
      subjectId: subjectMathId,
      classId: classJuniorId,
      academicYearId: year2026Id,
      enrollmentCategory: 'core_compulsory'
    });
    assert.equal(coreEnroll.success, true);
    assert.equal(coreEnroll.status, 'provisional_unverified');

    // Check eligibility: eligible while provisional
    const eligCore = isStudentEligibleForSubject(studentAId, subjectMathId, year2026Id);
    assert.equal(eligCore.eligible, true);
    assert.equal(eligCore.status, 'provisional_unverified');

    // 2. Enroll student in chosen religion with explicit verification
    const relEnroll = enrollStudentInSubject({
      studentId: studentAId,
      subjectId: subjectReligionId,
      classId: classJuniorId,
      academicYearId: year2026Id,
      enrollmentCategory: 'religion_specific',
      verifiedByUserId: adminUserId
    });
    assert.equal(relEnroll.success, true);
    assert.equal(relEnroll.status, 'confirmed');

    // 3. Verify student enrollments list
    const studentEnrollments = getStudentSubjectEnrollments(studentAId, year2026Id);
    assert.equal(studentEnrollments.length, 2);

    // 4. Verify the provisional core enrollment
    verifyStudentEnrollment(coreEnroll.id, adminUserId);
    const postVerify = isStudentEligibleForSubject(studentAId, subjectMathId, year2026Id);
    assert.equal(postVerify.status, 'confirmed');

    // 5. Drop an enrollment
    dropStudentEnrollment(coreEnroll.id, adminUserId);
    const postDrop = isStudentEligibleForSubject(studentAId, subjectMathId, year2026Id);
    assert.equal(postDrop.eligible, false);
    assert.equal(postDrop.status, 'dropped');
  });

  // 8. Negative API Authorization Matrix
  test('EXAM-AUTH-13: negative authorization checks via live HTTP API endpoints', async () => {
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
});
