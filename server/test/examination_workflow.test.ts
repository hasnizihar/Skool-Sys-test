import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { db } from '../src/db/database.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import {
  grantAcademicAuthorization,
  revokeAcademicAuthorization,
  getActiveStaffAuthorizations
} from '../src/services/academicAuthorizationService.js';
import {
  enrollStudentInSubject,
  verifyStudentEnrollment,
  dropStudentEnrollment
} from '../src/services/studentEnrollmentService.js';
import {
  ensureMarksSheet,
  getMarksSheetDetails,
  saveDraftMarks,
  submitMarksSheet,
  reviewMarksSheet,
  approveMarksSheet,
  getMarksSheetHistory,
  getMarksSheetRevisionSnapshot,
  calcGradeLetter,
  evaluateProvisionalGrade
} from '../src/services/marksWorkflowService.js';

describe('PR-005 Gate 3B: Marks Workflow, Revision Control, CAS Concurrency & Legacy Containment', () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  // JWT Tokens
  let adminToken: string;
  let teacherKamalToken: string;
  let teacherSunethraToken: string;
  let sectionHeadNimaliToken: string;
  let principalPereraToken: string;
  let vpAcademicToken: string;
  let unauthorizedTeacherToken: string;

  // User IDs
  let adminUserId: number;
  let teacherKamalUserId: number;
  let teacherSunethraUserId: number;
  let sectionHeadNimaliUserId: number;
  let principalPereraUserId: number;
  let vpAcademicUserId: number;
  let unauthorizedTeacherUserId: number;

  // Academic Entities
  let year2026Id: number;
  let class8AId: number;   // Grade 8
  let class10AId: number;  // Grade 10

  let subjectMathId: number;
  let subjectSciId: number;

  let student1Id: number;
  let student2Id: number;
  let student3Id: number;

  let exam2026Term1Id: number;
  let examUnpublishedId: number;

  let sheetMath8AId: number;

  before(async () => {
    // 1. Create isolated synthetic SQLite DB
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `skoolsys_work_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`);
    process.env.DB_PATH = testDbPath;
    process.env.JWT_SECRET = 'workflow-super-secret-jwt-key-with-over-32-characters-2026';

    testServer = await startTestServer();

    // 2. Seed synthetic users
    const userStmt = db.prepare('INSERT INTO users (username, email, password_hash, full_name, role, is_active, token_version) VALUES (?, ?, ?, ?, ?, 1, 1)');
    adminUserId = Number(userStmt.run('wf_admin', 'admin@kcc.test', 'hash', 'Base Admin', 'admin').lastInsertRowid);
    teacherKamalUserId = Number(userStmt.run('wf_kamal', 'kamal@kcc.test', 'hash', 'Mr. Kamal (Math Teacher)', 'subject_teacher').lastInsertRowid);
    teacherSunethraUserId = Number(userStmt.run('wf_sunethra', 'sunethra@kcc.test', 'hash', 'Ms. Sunethra (Science Teacher)', 'subject_teacher').lastInsertRowid);
    sectionHeadNimaliUserId = Number(userStmt.run('wf_nimali', 'nimali@kcc.test', 'hash', 'Mrs. Nimali (Section Head Junior)', 'subject_teacher').lastInsertRowid);
    principalPereraUserId = Number(userStmt.run('wf_perera', 'principal@kcc.test', 'hash', 'Mr. Perera (Principal)', 'admin').lastInsertRowid);
    vpAcademicUserId = Number(userStmt.run('wf_vp', 'vp@kcc.test', 'hash', 'Dr. Silva (VP Academic)', 'admin').lastInsertRowid);
    unauthorizedTeacherUserId = Number(userStmt.run('wf_unauth', 'unauth@kcc.test', 'hash', 'Mr. Unassigned (Out of Scope)', 'subject_teacher').lastInsertRowid);

    // Generate JWT tokens
    const secret = process.env.JWT_SECRET;
    adminToken = jwt.sign({ id: adminUserId, username: 'wf_admin', role: 'admin', tokenVersion: 1 }, secret);
    teacherKamalToken = jwt.sign({ id: teacherKamalUserId, username: 'wf_kamal', role: 'subject_teacher', tokenVersion: 1 }, secret);
    teacherSunethraToken = jwt.sign({ id: teacherSunethraUserId, username: 'wf_sunethra', role: 'subject_teacher', tokenVersion: 1 }, secret);
    sectionHeadNimaliToken = jwt.sign({ id: sectionHeadNimaliUserId, username: 'wf_nimali', role: 'subject_teacher', tokenVersion: 1 }, secret);
    principalPereraToken = jwt.sign({ id: principalPereraUserId, username: 'wf_perera', role: 'admin', tokenVersion: 1 }, secret);
    vpAcademicToken = jwt.sign({ id: vpAcademicUserId, username: 'wf_vp', role: 'admin', tokenVersion: 1 }, secret);
    unauthorizedTeacherToken = jwt.sign({ id: unauthorizedTeacherUserId, username: 'wf_unauth', role: 'subject_teacher', tokenVersion: 1 }, secret);

    // 3. Seed academic year
    year2026Id = Number(db.prepare('INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES (?, ?, ?, 1)').run('2026', '2026-01-05', '2026-12-15').lastInsertRowid);

    // 4. Seed classes
    class8AId = Number(db.prepare(`INSERT INTO classes (grade, name, academic_year_id) VALUES (8, 'Grade 8-A', ?)`).run(year2026Id).lastInsertRowid);
    class10AId = Number(db.prepare(`INSERT INTO classes (grade, name, academic_year_id) VALUES (10, 'Grade 10-A', ?)`).run(year2026Id).lastInsertRowid);

    // 5. Seed subjects
    subjectMathId = Number(db.prepare(`INSERT INTO subjects (code, name, category, grade_level) VALUES ('MATH_8', 'Mathematics', 'Core', '6-9')`).run().lastInsertRowid);
    subjectSciId = Number(db.prepare(`INSERT INTO subjects (code, name, category, grade_level) VALUES ('SCI_8', 'Science', 'Core', '6-9')`).run().lastInsertRowid);

    // 6. Seed class_subjects
    const csStmt = db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)');
    csStmt.run(class8AId, subjectMathId);
    csStmt.run(class8AId, subjectSciId);
    csStmt.run(class10AId, subjectMathId);

    // 7. Seed teacher assignments
    const taStmt = db.prepare('INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, ?, ?)');
    taStmt.run(teacherKamalUserId, class8AId, subjectMathId, 'subject_teacher', year2026Id);
    taStmt.run(teacherSunethraUserId, class8AId, subjectSciId, 'subject_teacher', year2026Id);

    // 8. Seed students
    const stuStmt = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES (?, ?, ?, '2012-04-10', 'Male', 'Kandy', 'Guardian', 'Parent', '0770000001', 'g1@test.lk', '0770000001', 'Active')
    `);
    student1Id = Number(stuStmt.run('STU-801', 'Kasun Bandara', 'Kasun').lastInsertRowid);
    student2Id = Number(stuStmt.run('STU-802', 'Nuwan Perera', 'Nuwan').lastInsertRowid);
    student3Id = Number(stuStmt.run('STU-803', 'Amila Gamage', 'Amila').lastInsertRowid);

    // Enroll students in class 8A
    const enrollStmt = db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')`);
    enrollStmt.run(student1Id, class8AId, year2026Id);
    enrollStmt.run(student2Id, class8AId, year2026Id);
    enrollStmt.run(student3Id, class8AId, year2026Id);

    // 9. Grant Academic Appointments
    // Section Head: Nimali -> junior_6_9 in 2026
    grantAcademicAuthorization({
      userId: sectionHeadNimaliUserId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });

    // Principal: Perera -> all band in 2026
    grantAcademicAuthorization({
      userId: principalPereraUserId,
      academicYearId: year2026Id,
      authRole: 'principal',
      gradeBand: 'all',
      grantedByUserId: adminUserId
    });

    // VP Academic: Silva -> all band in 2026
    grantAcademicAuthorization({
      userId: vpAcademicUserId,
      academicYearId: year2026Id,
      authRole: 'vice_principal_academic',
      gradeBand: 'all',
      grantedByUserId: adminUserId
    });

    // 10. Seed Examinations
    const examStmt = db.prepare('INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, is_published, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
    exam2026Term1Id = Number(examStmt.run('Term 1 Exam 2026', 1, year2026Id, '2026-03-10', '2026-03-25', 1, 'published').lastInsertRowid);
    examUnpublishedId = Number(examStmt.run('Term 2 Exam 2026 (Unpublished)', 2, year2026Id, '2026-07-10', '2026-07-25', 0, 'scheduled').lastInsertRowid);

    // 11. Create marks sheet container for Math in 8A
    const sheetRes = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, revision, status)
      VALUES (?, ?, ?, ?, ?, 1, 'draft')
    `).run(exam2026Term1Id, class8AId, subjectMathId, year2026Id, teacherKamalUserId);
    sheetMath8AId = Number(sheetRes.lastInsertRowid);
  });

  after(async () => {
    if (testServer) await testServer.close();
    try {
      if (testDbPath && fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch {}
  });

  // Test 1: Draft mark entry enforces academic year scope, class enrollment, and tags provisional vs confirmed
  test('EXAM-WORK-01: Draft mark entry validates student enrollment and tags provisional vs confirmed records', async () => {
    // Student 1 has confirmed subject enrollment
    db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at, created_at)
      VALUES (?, ?, ?, ?, 'confirmed', 'core_compulsory', ?, datetime('now'), datetime('now'))
    `).run(student1Id, subjectMathId, class8AId, year2026Id, sectionHeadNimaliUserId);

    // Student 2 has provisional_unverified enrollment
    db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'provisional_unverified', 'core_compulsory', datetime('now'))
    `).run(student2Id, subjectMathId, class8AId, year2026Id);

    // Student 3 has dropped enrollment
    db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, created_at)
      VALUES (?, ?, ?, ?, 'dropped', 'core_compulsory', datetime('now'))
    `).run(student3Id, subjectMathId, class8AId, year2026Id);

    // Attempting mark entry for dropped student -> rejected with 400
    const dropEntryRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1,
        marks: [{ studentId: student3Id, score: 75.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(dropEntryRes.status, 400);
    const dropBody = await dropEntryRes.json() as any;
    assert.match(dropBody.error, /not eligible for subject.*dropped/i);

    // Valid draft save with student 1 and student 2 (provisional allowed in draft!)
    const saveRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1,
        marks: [
          { studentId: student1Id, score: 88.5, assessmentStatus: 'PRESENT' },
          { studentId: student2Id, score: 72.0, assessmentStatus: 'PRESENT' }
        ]
      })
    });
    assert.equal(saveRes.status, 200);
    const saveBody = await saveRes.json() as any;
    assert.equal(saveBody.newRevision, 2);

    // Inspect GET sheet: verifies provisional vs confirmed tags on roster
    const sheetDetails = await testServer.request(`/api/marks/sheets/${sheetMath8AId}`, {
      headers: { Authorization: `Bearer ${teacherKamalToken}` }
    });
    assert.equal(sheetDetails.status, 200);
    const sheetData = await sheetDetails.json() as any;
    assert.equal(sheetData.sheet.revision, 2);

    const s1Item = sheetData.roster.find((r: any) => r.student_id === student1Id);
    assert.equal(s1Item.eligibility.is_officially_confirmed, true);
    assert.equal(s1Item.mark.score, 88.5);

    const s2Item = sheetData.roster.find((r: any) => r.student_id === student2Id);
    assert.equal(s2Item.eligibility.is_officially_confirmed, false);
    assert.equal(s2Item.eligibility.is_eligible_for_draft, true);
    assert.equal(s2Item.eligibility.status, 'provisional_unverified');
  });

  // Test 2: Canonical score, max_score, and assessment_status integrity with zero silent rounding/clamping
  test('EXAM-WORK-02: Canonical score constraints prevent invalid precision, out-of-bounds, and non-present numeric scores', async () => {
    // 1. Numeric score when status is ABSENT -> 400
    const absentWithScore = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 2,
        marks: [{ studentId: student1Id, score: 50.0, assessmentStatus: 'ABSENT' }]
      })
    });
    assert.equal(absentWithScore.status, 400);
    const absBody = await absentWithScore.json() as any;
    assert.match(absBody.error, /marked 'ABSENT' but has a numeric score provided/i);

    // 2. Score exceeding max_score (105 on 100) -> 400
    const outOfBounds = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 2,
        marks: [{ studentId: student1Id, score: 105.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(outOfBounds.status, 400);
    assert.match((await outOfBounds.json() as any).error, /out of bounds/i);

    // 3. Score exceeding single decimal precision (85.25) -> 400 with zero silent rounding
    const invalidPrecision = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 2,
        marks: [{ studentId: student1Id, score: 85.25, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(invalidPrecision.status, 400);
    assert.match((await invalidPrecision.json() as any).error, /exceeds single-decimal precision/i);

    // Verify DB mark was unchanged
    const markRow = db.prepare('SELECT score FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheetMath8AId, student1Id) as any;
    assert.equal(markRow.score, 88.5);
  });

  // Test 3: Optimistic Concurrency Control (CAS) — 409 Conflict on stale baseRevision with zero writes
  test('EXAM-WORK-03: Optimistic concurrency control detects stale baseRevision and returns 409 Conflict with zero writes', async () => {
    // Current sheet revision is 2.
    // User A passes baseRevision: 2 -> advances revision to 3.
    const userASave = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 2,
        marks: [{ studentId: student1Id, score: 91.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(userASave.status, 200);
    assert.equal((await userASave.json() as any).newRevision, 3);

    // User B attempts to save using stale baseRevision: 2 -> 409 Conflict!
    const userBSave = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 2, // STALE!
        marks: [{ studentId: student1Id, score: 40.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(userBSave.status, 409);
    const staleBody = await userBSave.json() as any;
    assert.equal(staleBody.code, 'STALE_REVISION');
    assert.equal(staleBody.currentRevision, 3);
    assert.equal(staleBody.baseRevision, 2);

    // Verify database was not overwritten by User B
    const markRow = db.prepare('SELECT score FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheetMath8AId, student1Id) as any;
    assert.equal(markRow.score, 91.0);
  });

  // Test 4: Sheet Submission requires all students to have officially confirmed subject enrollment
  test('EXAM-WORK-04: Sheet submission is blocked if any student has provisional enrollment, but succeeds once confirmed', async () => {
    // Student 2 is still provisional_unverified. Student 3 was dropped, so re-enroll student 3 as confirmed
    db.prepare("UPDATE student_subject_enrollments SET enrollment_status = 'confirmed', verified_by_user_id = ?, verified_at = datetime('now') WHERE student_id = ? AND subject_id = ?").run(sectionHeadNimaliUserId, student3Id, subjectMathId);

    // Ensure all 3 students have draft marks entered
    await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 3,
        marks: [
          { studentId: student1Id, score: 91.0, assessmentStatus: 'PRESENT' },
          { studentId: student2Id, score: 74.0, assessmentStatus: 'PRESENT' },
          { studentId: student3Id, score: 82.0, assessmentStatus: 'PRESENT' }
        ]
      })
    });

    // Attempt submission while student 2 has unconfirmed provisional enrollment -> 422 Unprocessable Entity!
    const failSubmitRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 4,
        notes: 'Attempting submission with provisional student'
      })
    });
    assert.equal(failSubmitRes.status, 422);
    const failBody = await failSubmitRes.json() as any;
    assert.equal(failBody.code, 'UNCONFIRMED_ENROLLMENT');
    assert.match(failBody.error, /Nuwan Perera.*unconfirmed subject enrollment/i);

    // Verify sheet status is still 'draft'
    const sheetDraft = db.prepare('SELECT status, revision FROM marks_sheets WHERE id = ?').get(sheetMath8AId) as any;
    assert.equal(sheetDraft.status, 'draft');

    // Section Head officially confirms Student 2's subject enrollment
    const s2Enroll = db.prepare('SELECT id FROM student_subject_enrollments WHERE student_id = ? AND subject_id = ?').get(student2Id, subjectMathId) as any;
    verifyStudentEnrollment(s2Enroll.id, sectionHeadNimaliUserId);

    // Now re-attempt submission -> 200 OK!
    const submitRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 4,
        notes: 'Official submission with all confirmed enrollments'
      })
    });
    assert.equal(submitRes.status, 200);
    const submitBody = await submitRes.json() as any;
    assert.equal(submitBody.status, 'submitted');
    assert.equal(submitBody.newRevision, 5);

    const sheetSubmitted = db.prepare('SELECT status, revision, submission_notes FROM marks_sheets WHERE id = ?').get(sheetMath8AId) as any;
    assert.equal(sheetSubmitted.status, 'submitted');
    assert.equal(sheetSubmitted.revision, 5);
  });

  // Test 5: Submitted sheets are locked against draft saves
  test('EXAM-WORK-05: Submitted sheets are locked against direct draft modifications and legacy writes', async () => {
    // 1. Workflow endpoint rejects draft save on submitted sheet -> 409 Conflict
    const saveDraftRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 5,
        marks: [{ studentId: student1Id, score: 99.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(saveDraftRes.status, 409);
    const saveBody = await saveDraftRes.json() as any;
    assert.equal(saveBody.code, 'LOCKED_SHEET');

    // 2. Legacy POST /api/marks/sheet targeting submitted sheet rejects with 403 Forbidden
    const legacyRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectMathId,
        status: 'draft',
        marks: [{ student_id: student1Id, score: 99.0 }]
      })
    });
    assert.equal(legacyRes.status, 403);
    assert.match((await legacyRes.json() as any).error, /locked in status 'submitted'/i);
  });

  // Test 6: Segregation of Duties: Review / Endorsement enforces anti-self-review and return workflow
  test('EXAM-WORK-06: Segregation of duties blocks self-review by assigned teacher and marks entrants; independent Section Head reviews/returns', async () => {
    // 1. Teacher Kamal temporarily granted Section Head appointment
    grantAcademicAuthorization({
      userId: teacherKamalUserId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: adminUserId
    });

    // Kamal attempts to review his own assigned sheet -> 403 SELF_REVIEW_TEACHER!
    const kamalReviewRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 5,
        decision: 'endorse',
        remarks: 'Self review attempt'
      })
    });
    assert.equal(kamalReviewRes.status, 403);
    const kamalErr = await kamalReviewRes.json() as any;
    assert.equal(kamalErr.code, 'SELF_REVIEW_TEACHER');

    // Clean up Kamal's appointment
    const kamalAuth = getActiveStaffAuthorizations(teacherKamalUserId, year2026Id).find(a => a.auth_role === 'section_head');
    if (kamalAuth) revokeAcademicAuthorization({ authorizationId: kamalAuth.id, revokedByUserId: adminUserId, reason: 'Cleanup' });

    // 2. Independent Section Head Nimali returns the sheet for correction
    const returnRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sectionHeadNimaliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 5,
        decision: 'return',
        remarks: 'Please recheck Student 1 score calculation.'
      })
    });
    assert.equal(returnRes.status, 200);
    const returnBody = await returnRes.json() as any;
    assert.equal(returnBody.status, 'returned');
    assert.equal(returnBody.newRevision, 6);

    // 3. Teacher Kamal can now modify in returned status
    const updateRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 6,
        marks: [{ studentId: student1Id, score: 95.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(updateRes.status, 200);
    assert.equal((await updateRes.json() as any).newRevision, 7);

    // 4. Kamal re-submits sheet
    const resubmitRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 7,
        notes: 'Recalculated score corrected to 95.0'
      })
    });
    assert.equal(resubmitRes.status, 200);
    assert.equal((await resubmitRes.json() as any).newRevision, 8);

    // 5. Independent Section Head Nimali endorses sheet
    const endorseRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sectionHeadNimaliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 8,
        decision: 'endorse',
        remarks: 'Endorsed after verified correction'
      })
    });
    assert.equal(endorseRes.status, 200);
    const endorseBody = await endorseRes.json() as any;
    assert.equal(endorseBody.status, 'reviewed');
    assert.equal(endorseBody.newRevision, 9);
  });

  // Test 7: Segregation of Duties: Final Approval requires independent Principal/VP
  test('EXAM-WORK-07: Final approval enforces separation from teacher, entrant, and reviewer; independent Principal approves', async () => {
    // 1. Reviewer Nimali attempts to approve sheet -> 403 SELF_APPROVAL_REVIEWER
    const reviewerApproveRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sectionHeadNimaliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 9,
        remarks: 'Reviewer attempting self approval'
      })
    });
    assert.equal(reviewerApproveRes.status, 403);

    // 2. Assigned teacher Kamal attempts to approve sheet -> 403 SELF_APPROVAL_TEACHER
    const teacherApproveRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 9,
        remarks: 'Teacher attempting self approval'
      })
    });
    assert.equal(teacherApproveRes.status, 403);

    // 3. Plain admin without appointment cannot approve
    const plainAdminToken = jwt.sign({ id: adminUserId, username: 'wf_admin', role: 'admin', tokenVersion: 1 }, process.env.JWT_SECRET!);
    const plainAdminApprove = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${plainAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 9,
        remarks: 'Plain admin attempt'
      })
    });
    assert.equal(plainAdminApprove.status, 403);

    // 4. Independent appointed Principal Perera approves sheet -> 200 OK!
    const principalApproveRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${principalPereraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 9,
        remarks: 'Officially moderated and approved by Principal Perera'
      })
    });
    assert.equal(principalApproveRes.status, 200);
    const approvBody = await principalApproveRes.json() as any;
    assert.equal(approvBody.status, 'approved');
    assert.equal(approvBody.newRevision, 10);

    const sheetFinal = db.prepare('SELECT status, revision, approved_by_user_id FROM marks_sheets WHERE id = ?').get(sheetMath8AId) as any;
    assert.equal(sheetFinal.status, 'approved');
    assert.equal(sheetFinal.approved_by_user_id, principalPereraUserId);
  });

  // Test 8: Immutable audit history and lifetime revision tracking
  test('EXAM-WORK-08: Complete immutable audit trail and revision snapshots are retrievable and accurately ordered', async () => {
    const historyRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/history`, {
      headers: { Authorization: `Bearer ${principalPereraToken}` }
    });
    assert.equal(historyRes.status, 200);
    const history = await historyRes.json() as any;

    assert.equal(history.sheetId, sheetMath8AId);
    assert.ok(Array.isArray(history.auditHistory));
    assert.ok(history.auditHistory.length >= 5);

    // Verify chronological actions
    const actions = history.auditHistory.map((h: any) => h.action);
    assert.ok(actions.includes('DRAFT_SAVE'));
    assert.ok(actions.includes('SUBMISSION'));
    assert.ok(actions.includes('RETURN'));
    assert.ok(actions.includes('ENDORSEMENT'));
    assert.ok(actions.includes('APPROVAL'));

    // Check revision snapshots
    assert.ok(Array.isArray(history.revisions));
    assert.ok(history.revisions.length >= 3);
  });

  // Test 9: Unpublished report card confidentiality & truthful reporting (P0-03, P0-04)
  test('EXAM-WORK-09: Unpublished student report strictly blocks in-scope teachers; leadership preview is watermarked; empty attendance is null', async () => {
    // Set Kamal as class teacher for 8A
    db.prepare('UPDATE classes SET class_teacher_id = ? WHERE id = ?').run(teacherKamalUserId, class8AId);

    // 1. In-scope assigned class teacher (Kamal) attempting to view student report on unpublished exam -> 403 Forbidden
    const classTeacherRes = await testServer.request(`/api/marks/student-report/${student1Id}/${examUnpublishedId}`, {
      headers: { Authorization: `Bearer ${teacherKamalToken}` }
    });
    assert.equal(classTeacherRes.status, 403);
    const ctBody = await classTeacherRes.json() as any;
    assert.equal(ctBody.code, 'UNPUBLISHED_RESULTS_LOCKED');
    assert.match(ctBody.error, /Unpublished examination results are confidential/i);

    // 2. In-scope assigned subject teacher (Sunethra) attempting to view student report on unpublished exam -> 403 Forbidden
    const subjectTeacherRes = await testServer.request(`/api/marks/student-report/${student1Id}/${examUnpublishedId}`, {
      headers: { Authorization: `Bearer ${teacherSunethraToken}` }
    });
    assert.equal(subjectTeacherRes.status, 403);
    const stBody = await subjectTeacherRes.json() as any;
    assert.equal(stBody.code, 'UNPUBLISHED_RESULTS_LOCKED');

    // 3. Out-of-scope unauthorized teacher attempting to view -> 403 Forbidden
    const unauthRes = await testServer.request(`/api/marks/student-report/${student1Id}/${examUnpublishedId}`, {
      headers: { Authorization: `Bearer ${unauthorizedTeacherToken}` }
    });
    assert.equal(unauthRes.status, 403);

    // 4. Authorized Section Head (Nimali) previews unpublished report -> 200 OK with provisional watermark
    const leaderRes = await testServer.request(`/api/marks/student-report/${student1Id}/${examUnpublishedId}`, {
      headers: { Authorization: `Bearer ${sectionHeadNimaliToken}` }
    });
    assert.equal(leaderRes.status, 200);
    const leaderBody = await leaderRes.json() as any;

    assert.equal(leaderBody.is_provisional_preview, true);
    assert.ok(leaderBody.confidentiality_watermark);
    assert.equal(leaderBody.confidentiality_watermark.is_confidential, true);
    assert.match(leaderBody.confidentiality_watermark.watermark_text, /CONFIDENTIAL LEADERSHIP PREVIEW ONLY/i);
    assert.equal(leaderBody.confidentiality_watermark.previewed_by_user_id, sectionHeadNimaliUserId);

    // P0-04 Truthful reporting checks:
    // Rank must be null (deferred to Gate 4)
    assert.equal(leaderBody.performance.rank, null);
    assert.ok(leaderBody.performance.classRankNotice);

    // Attendance with 0 recorded days must be null, never 100%
    assert.equal(leaderBody.attendance.totalSchoolDays, 0);
    assert.equal(leaderBody.attendance.attendancePercentage, null);
    assert.equal(leaderBody.attendance.status, 'Not Recorded');
  });

  // Test 10: Legacy POST /api/marks/sheet negative tests & zero DB writes (P0-01)
  test('EXAM-WORK-10: Legacy POST /api/marks/sheet rejects missing/stale baseRevision, cross-class student, dropped subject, and unassigned teacher with ZERO database writes', async () => {
    // Setup a draft marks sheet for Science in 8A assigned to Sunethra
    const sciSheetRes = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, revision, status)
      VALUES (?, ?, ?, ?, ?, 1, 'draft')
    `).run(exam2026Term1Id, class8AId, subjectSciId, year2026Id, teacherSunethraUserId);
    const sciSheetId = Number(sciSheetRes.lastInsertRowid);

    // Ensure student1 has confirmed enrollment in Science
    const e1 = enrollStudentInSubject({
      studentId: student1Id,
      subjectId: subjectSciId,
      classId: class8AId,
      academicYearId: year2026Id,
      enrollmentCategory: 'core_compulsory'
    });
    verifyStudentEnrollment(e1.id, sectionHeadNimaliUserId);

    const getDbSnapshot = () => ({
      marksCount: (db.prepare('SELECT count(*) as c FROM marks').get() as any).c,
      auditCount: (db.prepare('SELECT count(*) as c FROM marks_audit_history').get() as any).c,
      revCount: (db.prepare('SELECT count(*) as c FROM marks_sheet_revisions').get() as any).c,
      sheetRev: (db.prepare('SELECT revision FROM marks_sheets WHERE id = ?').get(sciSheetId) as any).revision
    });

    const baseline = getDbSnapshot();

    // 10.1: Missing baseRevision on existing sheet -> 400 MISSING_BASE_REVISION
    const missingRevRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectSciId,
        marks: [{ student_id: student1Id, score: 85.0 }]
        // baseRevision omitted!
      })
    });
    assert.equal(missingRevRes.status, 400);
    assert.equal((await missingRevRes.json() as any).code, 'MISSING_BASE_REVISION');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on missing baseRevision');

    // 10.2: Stale baseRevision -> 409 STALE_REVISION
    const staleRevRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectSciId,
        baseRevision: 999, // Stale!
        marks: [{ student_id: student1Id, score: 85.0 }]
      })
    });
    assert.equal(staleRevRes.status, 409);
    assert.equal((await staleRevRes.json() as any).code, 'STALE_REVISION');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on stale baseRevision');

    // 10.3: Cross-class student ID -> 400 CROSS_CLASS_STUDENT
    // Create student in Class 10A
    const alienStudentId = Number(db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES ('STU-1001', 'Cross Class Student', 'Alien', '2010-01-01', 'Male', 'Colombo', 'Guardian', 'Parent', '0770000099', 'g@test.lk', '0770000099', 'Active')
    `).run().lastInsertRowid);
    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')`).run(alienStudentId, class10AId, year2026Id);

    const crossClassRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectSciId,
        baseRevision: 1,
        marks: [{ student_id: alienStudentId, score: 85.0 }]
      })
    });
    assert.equal(crossClassRes.status, 400);
    assert.equal((await crossClassRes.json() as any).code, 'CROSS_CLASS_STUDENT');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on cross-class student ID');

    // 10.4: Dropped subject student -> 400 INELIGIBLE_SUBJECT_ENROLLMENT
    // Enroll and drop student3 in Science
    const e3 = enrollStudentInSubject({
      studentId: student3Id,
      subjectId: subjectSciId,
      classId: class8AId,
      academicYearId: year2026Id,
      enrollmentCategory: 'core_compulsory'
    });
    dropStudentEnrollment(e3.id, sectionHeadNimaliUserId, { reason: 'Subject dropped by guardian request' });

    const droppedSubjRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectSciId,
        baseRevision: 1,
        marks: [{ student_id: student3Id, score: 85.0 }]
      })
    });
    assert.equal(droppedSubjRes.status, 400);
    assert.equal((await droppedSubjRes.json() as any).code, 'INELIGIBLE_SUBJECT_ENROLLMENT');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on dropped subject enrollment');

    // 10.5: Unassigned teacher attempt -> 403 UNASSIGNED_TEACHER
    const unassignedRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectSciId,
        baseRevision: 1,
        marks: [{ student_id: student1Id, score: 85.0 }]
      })
    });
    assert.equal(unassignedRes.status, 403);
    assert.equal((await unassignedRes.json() as any).code, 'UNASSIGNED_TEACHER');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on unassigned teacher attempt');
  });

  // Test 11: Legacy POST /api/marks/sheet submission delegation & full-roster checks (P0-01)
  test('EXAM-WORK-11: Legacy POST /api/marks/sheet with status=submitted enforces confirmation and complete roster with zero writes on failure', async () => {
    // Science in 8A: student1 is confirmed. Enroll student2 as PROVISIONAL.
    const e2 = enrollStudentInSubject({
      studentId: student2Id,
      subjectId: subjectSciId,
      classId: class8AId,
      academicYearId: year2026Id,
      enrollmentCategory: 'core_compulsory'
    }); // student2 is provisional!

    const sciSheet = db.prepare('SELECT id, revision, status FROM marks_sheets WHERE class_id = ? AND subject_id = ?').get(class8AId, subjectSciId) as any;

    const getDbSnapshot = () => ({
      marksCount: (db.prepare('SELECT count(*) as c FROM marks').get() as any).c,
      auditCount: (db.prepare('SELECT count(*) as c FROM marks_audit_history').get() as any).c,
      revCount: (db.prepare('SELECT count(*) as c FROM marks_sheet_revisions').get() as any).c,
      sheetRev: (db.prepare('SELECT revision FROM marks_sheets WHERE id = ?').get(sciSheet.id) as any).revision,
      sheetStatus: (db.prepare('SELECT status FROM marks_sheets WHERE id = ?').get(sciSheet.id) as any).status
    });

    const baseline = getDbSnapshot();

    // 11.1: Submit with unconfirmed student enrollment -> 422 UNCONFIRMED_ENROLLMENT
    const unconfRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectSciId,
        baseRevision: sciSheet.revision,
        status: 'submitted',
        marks: [
          { student_id: student1Id, score: 88.0 },
          { student_id: student2Id, score: 72.0 }
        ]
      })
    });
    assert.equal(unconfRes.status, 422);
    assert.equal((await unconfRes.json() as any).code, 'UNCONFIRMED_ENROLLMENT');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on unconfirmed enrollment submission');

    // Confirm student2 in Science
    verifyStudentEnrollment(e2.id, sectionHeadNimaliUserId);

    const baselineAfterConfirm = getDbSnapshot();

    // 11.2: Submit with incomplete roster (student2 unassessed) -> 400 UNASSESSED_STUDENT
    const unassessedRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectSciId,
        baseRevision: sciSheet.revision,
        status: 'submitted',
        marks: [
          { student_id: student1Id, score: 88.0 }
          // student2 omitted!
        ]
      })
    });
    assert.equal(unassessedRes.status, 400);
    assert.equal((await unassessedRes.json() as any).code, 'UNASSESSED_STUDENT');
    assert.deepEqual(getDbSnapshot(), baselineAfterConfirm, 'Zero DB writes on incomplete roster submission');

    // 11.3: Successful submission via legacy endpoint
    const successSubmitRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectSciId,
        baseRevision: sciSheet.revision,
        status: 'submitted',
        marks: [
          { student_id: student1Id, score: 88.0 },
          { student_id: student2Id, score: 72.0 }
        ]
      })
    });
    assert.equal(successSubmitRes.status, 200);
    const successBody = await successSubmitRes.json() as any;
    assert.equal(successBody.status, 'submitted');

    const updatedSheet = db.prepare('SELECT status, revision FROM marks_sheets WHERE id = ?').get(sciSheet.id) as any;
    assert.equal(updatedSheet.status, 'submitted');
    assert.ok(updatedSheet.revision > sciSheet.revision);
  });

  // Test 12: Least privilege for draft & submit in canonical service (P0-02)
  test('EXAM-WORK-12: Plain admin and review-only leadership CANNOT save draft or submit marks without verified teacher assignment', async () => {
    // Setup a new sheet for Math in Class 10A, assigned to Kamal
    const sheet10ARes = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, revision, status)
      VALUES (?, ?, ?, ?, ?, 1, 'draft')
    `).run(exam2026Term1Id, class10AId, subjectMathId, year2026Id, teacherKamalUserId);
    const sheet10AId = Number(sheet10ARes.lastInsertRowid);

    // 12.1: Plain admin attempts to save draft marks -> 403 UNASSIGNED_TEACHER
    const adminDraftRes = await testServer.request(`/api/marks/sheets/${sheet10AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1,
        marks: []
      })
    });
    assert.equal(adminDraftRes.status, 403);
    assert.equal((await adminDraftRes.json() as any).code, 'UNASSIGNED_TEACHER');

    // 12.2: Section Head Nimali attempts to save draft marks -> 403 UNASSIGNED_TEACHER
    const shDraftRes = await testServer.request(`/api/marks/sheets/${sheet10AId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sectionHeadNimaliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1,
        marks: []
      })
    });
    assert.equal(shDraftRes.status, 403);
    assert.equal((await shDraftRes.json() as any).code, 'UNASSIGNED_TEACHER');

    // 12.3: Plain admin attempts to submit marks sheet -> 403 UNASSIGNED_TEACHER
    const adminSubmitRes = await testServer.request(`/api/marks/sheets/${sheet10AId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1
      })
    });
    assert.equal(adminSubmitRes.status, 403);
    assert.equal((await adminSubmitRes.json() as any).code, 'UNASSIGNED_TEACHER');

    // 12.4: Section Head attempts to submit marks sheet -> 403 UNASSIGNED_TEACHER
    const shSubmitRes = await testServer.request(`/api/marks/sheets/${sheet10AId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sectionHeadNimaliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1
      })
    });
    assert.equal(shSubmitRes.status, 403);
    assert.equal((await shSubmitRes.json() as any).code, 'UNASSIGNED_TEACHER');
  });

  // Test 13: Participating subject roster validation in mixed elective/stream classes (P1-06)
  test('EXAM-WORK-13: Submission checks ONLY participating students for the subject; classmates taking other electives do not block submission', async () => {
    // Setup elective subjects in 10A: Art & Music
    const subjArtId = Number(db.prepare(`INSERT INTO subjects (code, name, category, grade_level) VALUES ('ART_10', 'Western Art', 'Elective', '10-11')`).run().lastInsertRowid);
    const subjMusicId = Number(db.prepare(`INSERT INTO subjects (code, name, category, grade_level) VALUES ('MUS_10', 'Eastern Music', 'Elective', '10-11')`).run().lastInsertRowid);

    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class10AId, subjArtId);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class10AId, subjMusicId);

    // Assign Sunethra to Art in 10A
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, 'subject_teacher', ?)").run(teacherSunethraUserId, class10AId, subjArtId, year2026Id);

    // Create 3 students enrolled in 10A
    const stuA = Number(db.prepare(`INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status) VALUES ('E-101', 'Art Student 1', 'A1', '2010-01-01', 'Female', 'Kandy', 'Parent', 'Mother', '0771', 'e1@t.lk', '0771', 'Active')`).run().lastInsertRowid);
    const stuB = Number(db.prepare(`INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status) VALUES ('E-102', 'Art Student 2', 'A2', '2010-01-01', 'Male', 'Kandy', 'Parent', 'Father', '0772', 'e2@t.lk', '0772', 'Active')`).run().lastInsertRowid);
    const stuC = Number(db.prepare(`INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status) VALUES ('E-103', 'Music Student', 'M1', '2010-01-01', 'Female', 'Kandy', 'Parent', 'Mother', '0773', 'e3@t.lk', '0773', 'Active')`).run().lastInsertRowid);

    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')`).run(stuA, class10AId, year2026Id);
    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')`).run(stuB, class10AId, year2026Id);
    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')`).run(stuC, class10AId, year2026Id);

    // StuA & StuB take Art. StuC takes Music!
    const eStuA = enrollStudentInSubject({ studentId: stuA, subjectId: subjArtId, classId: class10AId, academicYearId: year2026Id, enrollmentCategory: 'ol_basket_1' });
    const eStuB = enrollStudentInSubject({ studentId: stuB, subjectId: subjArtId, classId: class10AId, academicYearId: year2026Id, enrollmentCategory: 'ol_basket_1' });
    enrollStudentInSubject({ studentId: stuC, subjectId: subjMusicId, classId: class10AId, academicYearId: year2026Id, enrollmentCategory: 'ol_basket_2' });

    // StuA is confirmed. StuB is left provisional.
    verifyStudentEnrollment(eStuA.id, principalPereraUserId);

    // Create Art marks sheet
    const artSheet = ensureMarksSheet(exam2026Term1Id, class10AId, subjArtId, { id: teacherSunethraUserId, username: 'wf_sunethra', role: 'subject_teacher' });

    // Sunethra enters draft marks for StuA & StuB
    saveDraftMarks({
      sheetId: artSheet.id,
      baseRevision: 1,
      marks: [
        { studentId: stuA, score: 92.0, assessmentStatus: 'PRESENT' },
        { studentId: stuB, score: 81.0, assessmentStatus: 'PRESENT' }
      ],
      user: { id: teacherSunethraUserId, username: 'wf_sunethra', role: 'subject_teacher' }
    });

    // Attempt submit -> 422 because StuB (participating in Art) is unconfirmed!
    const failSubmitRes = await testServer.request(`/api/marks/sheets/${artSheet.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: 2 })
    });
    assert.equal(failSubmitRes.status, 422);
    assert.equal((await failSubmitRes.json() as any).code, 'UNCONFIRMED_ENROLLMENT');

    // Confirm StuB
    verifyStudentEnrollment(eStuB.id, principalPereraUserId);

    // Submit now succeeds! Notice: StuC (who takes Music) is NOT enrolled in Art and does NOT block submission!
    const successArtSubmit = await testServer.request(`/api/marks/sheets/${artSheet.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: 2 })
    });
    assert.equal(successArtSubmit.status, 200);
    assert.equal((await successArtSubmit.json() as any).status, 'submitted');
  });

  // Test 14: Score normalization and provisional grade calculation test vectors (P1-05)
  test('EXAM-WORK-14: calcGradeLetter and evaluateProvisionalGrade correctly normalize against max_score and tag as provisional', () => {
    // 14.1: Audit test vector: 80 / 200 = 40% -> S (not A!)
    assert.equal(calcGradeLetter(80, 'PRESENT', 200), 'S');
    const prov80 = evaluateProvisionalGrade(80, 'PRESENT', 200);
    assert.equal(prov80.gradeLetter, 'S');
    assert.equal(prov80.percentage, 40.0);
    assert.equal(prov80.isProvisional, true);

    // 14.2: Audit test vector: 35 / 50 = 70% -> B (not S!)
    assert.equal(calcGradeLetter(35, 'PRESENT', 50), 'B');
    const prov35 = evaluateProvisionalGrade(35, 'PRESENT', 50);
    assert.equal(prov35.gradeLetter, 'B');
    assert.equal(prov35.percentage, 70.0);
    assert.equal(prov35.isProvisional, true);

    // 14.3: Standard cutoffs [75: A, 65: B, 50: C, 35: S, <35: F]
    assert.equal(calcGradeLetter(90, 'PRESENT', 100), 'A');
    assert.equal(calcGradeLetter(75, 'PRESENT', 100), 'A');
    assert.equal(calcGradeLetter(74.9, 'PRESENT', 100), 'B');
    assert.equal(calcGradeLetter(55, 'PRESENT', 100), 'C');
    assert.equal(calcGradeLetter(35, 'PRESENT', 100), 'S');
    assert.equal(calcGradeLetter(34.9, 'PRESENT', 100), 'F');
    assert.equal(calcGradeLetter(0, 'PRESENT', 100), 'F');

    // 14.4: Non-present and special assessment statuses
    assert.equal(calcGradeLetter(null, 'NOT_ASSESSED', 100), '-');
    assert.equal(calcGradeLetter(null, 'ABSENT', 100), 'AB');
    assert.equal(calcGradeLetter(null, 'EXEMPT', 100), 'EX');
    assert.equal(calcGradeLetter(null, 'MEDICAL', 100), 'MED');

    // 14.5: Invalid/zero maxScore fails closed
    assert.equal(calcGradeLetter(50, 'PRESENT', 0), '-');
    assert.equal(calcGradeLetter(50, 'PRESENT', -100), '-');
  });

  // Test 15: Sheet creation invariants in ensureMarksSheet (P1-07)
  test('EXAM-WORK-15: ensureMarksSheet rejects academic year mismatch, unoffered subjects, and leaves teacher_id null when unassigned', () => {
    // 15.1: Mismatched academic year
    const otherYearId = Number(db.prepare("INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ('2025', '2025-01-01', '2025-12-31', 0)").run().lastInsertRowid);
    const mismatchedExamId = Number(db.prepare("INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, is_published, status) VALUES ('Old Exam', 1, ?, '2025-03-01', '2025-03-15', 0, 'scheduled')").run(otherYearId).lastInsertRowid);

    assert.throws(
      () => ensureMarksSheet(mismatchedExamId, class8AId, subjectMathId, { id: adminUserId, username: 'admin', role: 'admin' }),
      (err: any) => err.code === 'ACADEMIC_YEAR_MISMATCH'
    );

    // 15.2: Subject not offered in class
    const unofferedSubjId = Number(db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('GER_8', 'German', 'Elective', '6-9')").run().lastInsertRowid);
    assert.throws(
      () => ensureMarksSheet(exam2026Term1Id, class8AId, unofferedSubjId, { id: adminUserId, username: 'admin', role: 'admin' }),
      (err: any) => err.code === 'SUBJECT_NOT_OFFERED'
    );

    // 15.3: Subject offered, but unassigned teacher: teacher_id remains NULL (NEVER user.id)
    const subjFrenchId = Number(db.prepare("INSERT INTO subjects (code, name, category, grade_level) VALUES ('FRE_8', 'French', 'Elective', '6-9')").run().lastInsertRowid);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class8AId, subjFrenchId);

    const sheetFrench = ensureMarksSheet(exam2026Term1Id, class8AId, subjFrenchId, { id: teacherKamalUserId, username: 'wf_kamal', role: 'subject_teacher' });
    assert.equal(sheetFrench.teacher_id, null, 'Unassigned teacher must remain NULL, not fabricated to requesting user');
  });

  // Test 16: Revision snapshot retrieval and audit payload completeness (P1-08)
  test('EXAM-WORK-16: Revisions history includes parsed marks payload and point-in-time snapshot endpoint returns full state', async () => {
    // Math 8A sheet was approved in EXAM-WORK-07 at revision 10
    // Fetch snapshot for revision 2 (draft save)
    const snapRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/revisions/2`, {
      headers: { Authorization: `Bearer ${principalPereraToken}` }
    });
    assert.equal(snapRes.status, 200);
    const snap = await snapRes.json() as any;

    assert.equal(snap.sheet_id, sheetMath8AId);
    assert.equal(snap.revision, 2);
    assert.ok(snap.marks_payload_json);
    assert.ok(Array.isArray(snap.marks_payload));
    assert.ok(snap.marks_payload.length > 0);

    // Fetch history and verify all revisions have marks_payload
    const histRes = await testServer.request(`/api/marks/sheets/${sheetMath8AId}/history`, {
      headers: { Authorization: `Bearer ${principalPereraToken}` }
    });
    assert.equal(histRes.status, 200);
    const hist = await histRes.json() as any;

    assert.ok(Array.isArray(hist.revisions));
    for (const r of hist.revisions) {
      assert.ok(r.marks_payload !== undefined, `Revision ${r.revision} must have marks_payload field`);
      assert.ok(r.marks_payload_json, `Revision ${r.revision} must have marks_payload_json field`);
    }
  });

  // ==========================================
  // GATE 3S VERIFICATION TESTS (EXAM-G3S-01 to 05)
  // ==========================================

  // Test 17: EXAM-G3S-01 Teacher Authorization Fail-Closed (P0-01)
  test('EXAM-G3S-01: Teacher Authorization Fail-Closed - Unassigned, deactivated, or revoked teacher rejected with 403 UNASSIGNED_TEACHER', async () => {
    // 1. Create a new subject History in Grade 8
    const subjHistId = Number(db.prepare(`INSERT INTO subjects (code, name, category, grade_level) VALUES ('HIST_8', 'History', 'Core', '6-9')`).run().lastInsertRowid);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class8AId, subjHistId);

    // 2. Create sheet container with teacher_id = NULL (no assigned teacher)
    const histSheetRes = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, revision, status)
      VALUES (?, ?, ?, ?, NULL, 1, 'draft')
    `).run(exam2026Term1Id, class8AId, subjHistId, year2026Id);
    const histSheetId = Number(histSheetRes.lastInsertRowid);

    const getDbSnapshot = () => ({
      marksCount: (db.prepare('SELECT count(*) as c FROM marks').get() as any).c,
      auditCount: (db.prepare('SELECT count(*) as c FROM marks_audit_history').get() as any).c,
      revCount: (db.prepare('SELECT count(*) as c FROM marks_sheet_revisions').get() as any).c,
      sheetRev: (db.prepare('SELECT revision FROM marks_sheets WHERE id = ?').get(histSheetId) as any).revision,
      sheetStatus: (db.prepare('SELECT status FROM marks_sheets WHERE id = ?').get(histSheetId) as any).status
    });
    const baseline = getDbSnapshot();

    // 17.1: Attempt canonical save-draft with teacherKamalToken (Kamal is NOT assigned to History)
    const draftRes = await testServer.request(`/api/marks/sheets/${histSheetId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: 1, marks: [{ studentId: student1Id, score: 75.0 }] })
    });
    assert.equal(draftRes.status, 403);
    assert.equal((await draftRes.json() as any).code, 'UNASSIGNED_TEACHER');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on unassigned teacher save-draft');

    // 17.2: Attempt canonical submit with teacherKamalToken
    const submitRes = await testServer.request(`/api/marks/sheets/${histSheetId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: 1 })
    });
    assert.equal(submitRes.status, 403);
    assert.equal((await submitRes.json() as any).code, 'UNASSIGNED_TEACHER');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on unassigned teacher submit');

    // 17.3: Attempt legacy POST /api/marks/sheet with teacherKamalToken
    const legacyRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjHistId,
        baseRevision: 1,
        marks: [{ student_id: student1Id, score: 75.0 }]
      })
    });
    assert.equal(legacyRes.status, 403);
    assert.equal((await legacyRes.json() as any).code, 'UNASSIGNED_TEACHER');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on unassigned teacher legacy post');

    // 17.4: Assign Sunethra to History, then test revoked / unassigned teacher authorization
    const assignStmt = db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, 'subject_teacher', ?)");
    assignStmt.run(teacherSunethraUserId, class8AId, subjHistId, year2026Id);

    // Revoke assignment
    db.prepare('DELETE FROM teacher_assignments WHERE teacher_id = ? AND class_id = ? AND subject_id = ?').run(teacherSunethraUserId, class8AId, subjHistId);

    const revokedRes = await testServer.request(`/api/marks/sheets/${histSheetId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: 1, marks: [{ studentId: student1Id, score: 80.0 }] })
    });
    assert.equal(revokedRes.status, 403);
    assert.equal((await revokedRes.json() as any).code, 'UNASSIGNED_TEACHER');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes when teacher assignment is revoked');

    // Also verify direct saveDraftMarks call fails-closed if teacher account is inactive
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(teacherSunethraUserId);
    try {
      assert.throws(
        () => saveDraftMarks({
          sheetId: histSheetId,
          baseRevision: 1,
          marks: [{ studentId: student1Id, score: 80.0 }],
          user: { id: teacherSunethraUserId, username: 'wf_sunethra', role: 'subject_teacher' }
        }),
        (err: any) => err.code === 'USER_DEACTIVATED' || err.code === 'UNASSIGNED_TEACHER'
      );
    } finally {
      // Ensure user is reactivated so subsequent tests are not contaminated
      db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(teacherSunethraUserId);
    }
  });

  // Test 18: EXAM-G3S-02 Positive Subject-Enrolment Verification (P0-02)
  test('EXAM-G3S-02: Positive Subject-Enrolment Verification - Missing, dropped, or unconfirmed enrolments strictly handled', async () => {
    // Setup dedicated subject PE in Class 8A with assigned teacher Sunethra
    const subjPEId = Number(db.prepare(`INSERT INTO subjects (code, name, category, grade_level) VALUES ('PE_8', 'Physical Education', 'Core', '6-9')`).run().lastInsertRowid);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class8AId, subjPEId);
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, 'subject_teacher', ?)").run(teacherSunethraUserId, class8AId, subjPEId, year2026Id);

    const peSheet = ensureMarksSheet(exam2026Term1Id, class8AId, subjPEId, { id: teacherSunethraUserId, username: 'wf_sunethra', role: 'subject_teacher' });
    assert.equal(peSheet.status, 'draft');
    assert.equal(peSheet.revision, 1);

    // Student A is in Class 8A, but NOT enrolled in PE at all
    const stuA = Number(db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES ('STU-G3S-A', 'Non Enrolled Student', 'NonEnrolled', '2012-01-01', 'Male', 'Kandy', 'Parent', 'Father', '0779990001', 'a@test.lk', '0779990001', 'Active')
    `).run().lastInsertRowid);
    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')`).run(stuA, class8AId, year2026Id);

    const getDbSnapshot = () => ({
      marksCount: (db.prepare('SELECT count(*) as c FROM marks').get() as any).c,
      auditCount: (db.prepare('SELECT count(*) as c FROM marks_audit_history').get() as any).c,
      revCount: (db.prepare('SELECT count(*) as c FROM marks_sheet_revisions').get() as any).c
    });
    const baseline = getDbSnapshot();

    // 18.1: Canonical save-draft with non-enrolled Student A -> 400 INELIGIBLE_SUBJECT_ENROLLMENT
    const draftNonEnrolled = await testServer.request(`/api/marks/sheets/${peSheet.id}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1,
        marks: [{ studentId: stuA, score: 75.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(draftNonEnrolled.status, 400);
    assert.equal((await draftNonEnrolled.json() as any).code, 'INELIGIBLE_SUBJECT_ENROLLMENT');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on non-enrolled student draft');

    // 18.2: Legacy POST /api/marks/sheet with non-enrolled Student A -> 400 INELIGIBLE_SUBJECT_ENROLLMENT
    const legacyNonEnrolled = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjPEId,
        baseRevision: 1,
        marks: [{ student_id: stuA, score: 75.0 }]
      })
    });
    assert.equal(legacyNonEnrolled.status, 400);
    assert.equal((await legacyNonEnrolled.json() as any).code, 'INELIGIBLE_SUBJECT_ENROLLMENT');
    assert.deepEqual(getDbSnapshot(), baseline, 'Zero DB writes on legacy post non-enrolled student');

    // 18.3: Enroll Student B in PE (provisional_unverified)
    const stuB = Number(db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status)
      VALUES ('STU-G3S-B', 'Provisional PE Student', 'ProvPE', '2012-02-02', 'Female', 'Kandy', 'Parent', 'Mother', '0779990002', 'b@test.lk', '0779990002', 'Active')
    `).run().lastInsertRowid);
    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')`).run(stuB, class8AId, year2026Id);

    const eB = enrollStudentInSubject({
      studentId: stuB,
      subjectId: subjPEId,
      classId: class8AId,
      academicYearId: year2026Id,
      enrollmentCategory: 'core_compulsory'
    });

    // Save draft with provisional Student B succeeds
    const draftProvRes = await testServer.request(`/api/marks/sheets/${peSheet.id}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1,
        marks: [{ studentId: stuB, score: 85.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(draftProvRes.status, 200);
    const updatedPESheet = await draftProvRes.json() as any;
    assert.equal(updatedPESheet.newRevision, 2);

    // 18.4: Attempt submit marks sheet containing Student B while provisional -> fails with 422 UNCONFIRMED_ENROLLMENT
    const submitProvRes = await testServer.request(`/api/marks/sheets/${peSheet.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: 2 })
    });
    assert.equal(submitProvRes.status, 422);
    assert.equal((await submitProvRes.json() as any).code, 'UNCONFIRMED_ENROLLMENT');

    // 18.5: Confirm Student B -> submit succeeds
    verifyStudentEnrollment(eB.id, sectionHeadNimaliUserId);

    const submitConfRes = await testServer.request(`/api/marks/sheets/${peSheet.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: 2 })
    });
    assert.equal(submitConfRes.status, 200);
    assert.equal((await submitConfRes.json() as any).status, 'submitted');
  });

  // Test 19: EXAM-G3S-03 Full Revision Snapshots on Multi-Step Edits (P1-03)
  test('EXAM-G3S-03: Full Revision Snapshots on Multi-Step Edits - Every revision records complete sheet roster state', async () => {
    // Create new subject Geography in Class 8A
    const subjGeoId = Number(db.prepare(`INSERT INTO subjects (code, name, category, grade_level) VALUES ('GEO_8', 'Geography', 'Core', '6-9')`).run().lastInsertRowid);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class8AId, subjGeoId);
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, 'subject_teacher', ?)").run(teacherKamalUserId, class8AId, subjGeoId, year2026Id);

    // Create two students enrolled in 8A and confirmed in Geography
    const s1 = Number(db.prepare(`INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status) VALUES ('STU-GEO-1', 'Geo Student 1', 'Geo1', '2012-05-01', 'Male', 'Kandy', 'Parent', 'Father', '0778880001', 'g1@test.lk', '0778880001', 'Active')`).run().lastInsertRowid);
    const s2 = Number(db.prepare(`INSERT INTO students (admission_no, full_name, calling_name, dob, gender, address, guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status) VALUES ('STU-GEO-2', 'Geo Student 2', 'Geo2', '2012-06-01', 'Female', 'Kandy', 'Parent', 'Mother', '0778880002', 'g2@test.lk', '0778880002', 'Active')`).run().lastInsertRowid);

    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')`).run(s1, class8AId, year2026Id);
    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, 'enrolled')`).run(s2, class8AId, year2026Id);

    const eg1 = enrollStudentInSubject({ studentId: s1, subjectId: subjGeoId, classId: class8AId, academicYearId: year2026Id, enrollmentCategory: 'core_compulsory' });
    const eg2 = enrollStudentInSubject({ studentId: s2, subjectId: subjGeoId, classId: class8AId, academicYearId: year2026Id, enrollmentCategory: 'core_compulsory' });
    verifyStudentEnrollment(eg1.id, sectionHeadNimaliUserId);
    verifyStudentEnrollment(eg2.id, sectionHeadNimaliUserId);

    // Create marks sheet
    const geoSheet = ensureMarksSheet(exam2026Term1Id, class8AId, subjGeoId, { id: teacherKamalUserId, username: 'wf_kamal', role: 'subject_teacher' });
    assert.equal(geoSheet.revision, 1);

    // Rev 2: Teacher saves marks for s1 only (score 78.0)
    const saveRev2Res = await testServer.request(`/api/marks/sheets/${geoSheet.id}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1,
        marks: [{ studentId: s1, score: 78.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(saveRev2Res.status, 200);
    const rev2Sheet = await saveRev2Res.json() as any;
    assert.equal(rev2Sheet.newRevision, 2);

    // Check Rev 2 Snapshot: must contain s1 (score 78) and s2 (score null / NOT_ASSESSED)
    const snap2Res = await testServer.request(`/api/marks/sheets/${geoSheet.id}/revisions/2`, {
      headers: { Authorization: `Bearer ${teacherKamalToken}` }
    });
    assert.equal(snap2Res.status, 200);
    const snap2 = await snap2Res.json() as any;
    const snap2Marks = snap2.marks_payload;
    assert.equal(snap2Marks.length, 2, 'Rev 2 snapshot must capture full roster (2 students)');
    const s1InSnap2 = snap2Marks.find((m: any) => m.student_id === s1 || m.studentId === s1);
    const s2InSnap2 = snap2Marks.find((m: any) => m.student_id === s2 || m.studentId === s2);
    assert.equal(s1InSnap2.score, 78.0);
    assert.equal(s1InSnap2.assessment_status || s1InSnap2.assessmentStatus, 'PRESENT');
    assert.equal(s2InSnap2.score, null);
    assert.equal(s2InSnap2.assessment_status || s2InSnap2.assessmentStatus, 'NOT_ASSESSED');

    // Rev 3: Teacher saves marks for s2 (score 82.0)
    const saveRev3Res = await testServer.request(`/api/marks/sheets/${geoSheet.id}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 2,
        marks: [{ studentId: s2, score: 82.0, assessmentStatus: 'PRESENT' }]
      })
    });
    assert.equal(saveRev3Res.status, 200);
    const rev3Sheet = await saveRev3Res.json() as any;
    assert.equal(rev3Sheet.newRevision, 3);

    // Check Rev 3 Snapshot: must contain BOTH s1 (score 78) and s2 (score 82)
    const snap3Res = await testServer.request(`/api/marks/sheets/${geoSheet.id}/revisions/3`, {
      headers: { Authorization: `Bearer ${teacherKamalToken}` }
    });
    assert.equal(snap3Res.status, 200);
    const snap3 = await snap3Res.json() as any;
    const snap3Marks = snap3.marks_payload;
    assert.equal(snap3Marks.length, 2, 'Rev 3 snapshot must capture full roster (2 students)');
    const s1InSnap3 = snap3Marks.find((m: any) => m.student_id === s1 || m.studentId === s1);
    const s2InSnap3 = snap3Marks.find((m: any) => m.student_id === s2 || m.studentId === s2);
    assert.equal(s1InSnap3.score, 78.0);
    assert.equal(s1InSnap3.assessment_status || s1InSnap3.assessmentStatus, 'PRESENT');
    assert.equal(s2InSnap3.score, 82.0);
    assert.equal(s2InSnap3.assessment_status || s2InSnap3.assessmentStatus, 'PRESENT');

    // Verify Rev 2 Snapshot remained immutable
    const snap2AgainRes = await testServer.request(`/api/marks/sheets/${geoSheet.id}/revisions/2`, {
      headers: { Authorization: `Bearer ${teacherKamalToken}` }
    });
    const snap2Again = await snap2AgainRes.json() as any;
    const s2InSnap2Again = snap2Again.marks_payload.find((m: any) => m.student_id === s2 || m.studentId === s2);
    assert.equal(s2InSnap2Again.score, null, 'Rev 2 snapshot must remain immutable with s2 score null');
  });

  // Test 20: EXAM-G3S-04 Fail-Closed Transactional Rollback on First Legacy Post (P1-04)
  test('EXAM-G3S-04: Fail-Closed Transactional Rollback on First Legacy Post - Invalid writes roll back sheet container completely', async () => {
    // Create new subject Commerce in Grade 8 with NO existing sheet container
    const subjComId = Number(db.prepare(`INSERT INTO subjects (code, name, category, grade_level) VALUES ('COM_8', 'Commerce', 'Elective', '6-9')`).run().lastInsertRowid);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class8AId, subjComId);
    db.prepare("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, 'subject_teacher', ?)").run(teacherKamalUserId, class8AId, subjComId, year2026Id);

    // Confirm student1 in Commerce
    const eCom = enrollStudentInSubject({ studentId: student1Id, subjectId: subjComId, classId: class8AId, academicYearId: year2026Id, enrollmentCategory: 'ol_basket_1' });
    verifyStudentEnrollment(eCom.id, sectionHeadNimaliUserId);

    // Confirm sheet does NOT exist prior to test
    const countSheets = () => (db.prepare('SELECT count(*) as c FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(exam2026Term1Id, class8AId, subjComId) as any).c;
    assert.equal(countSheets(), 0, 'No marks_sheet container should exist before first write');

    // 20.1: Send legacy POST /api/marks/sheet with invalid remarks (number 12345 instead of string)
    const invalidRemarksRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjComId,
        marks: [{ student_id: student1Id, score: 85.0, remarks: 12345 }]
      })
    });
    assert.equal(invalidRemarksRes.status, 400);
    assert.equal((await invalidRemarksRes.json() as any).code, 'INVALID_REMARKS_TYPE');
    assert.equal(countSheets(), 0, 'Marks sheet container MUST be rolled back when remarks type is invalid');

    // 20.2: Send legacy POST /api/marks/sheet with score out of bounds (> 100)
    const outOfBoundsRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjComId,
        marks: [{ student_id: student1Id, score: 150.0 }]
      })
    });
    assert.equal(outOfBoundsRes.status, 400);
    assert.equal((await outOfBoundsRes.json() as any).code, 'SCORE_OUT_OF_BOUNDS');
    assert.equal(countSheets(), 0, 'Marks sheet container MUST be rolled back when score is out of bounds');

    // 20.3: Send valid legacy POST -> succeeds and creates sheet
    const validPostRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjComId,
        marks: [{ student_id: student1Id, score: 85.0, remarks: 'Good work' }]
      })
    });
    assert.equal(validPostRes.status, 200);
    assert.equal(countSheets(), 1, 'Marks sheet container created after valid first post');
  });

  // Test 21: EXAM-G3S-05 Confidentiality of Unpublished Student Report Cards (P1-05)
  test('EXAM-G3S-05: Confidentiality of Unpublished Student Report Cards - Base admin denied 403; scoped leadership preview watermarked 200', async () => {
    // examUnpublishedId has is_published = 0
    const unpubExam = db.prepare('SELECT is_published FROM examinations WHERE id = ?').get(examUnpublishedId) as any;
    assert.equal(unpubExam.is_published, 0);

    // 21.1: Request unpublished report card with base adminToken (role = 'admin', but NO academic staff appointment)
    const adminReportRes = await testServer.request(`/api/marks/student-report/${student1Id}/${examUnpublishedId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(adminReportRes.status, 403);
    assert.equal((await adminReportRes.json() as any).code, 'UNPUBLISHED_RESULTS_LOCKED');

    // 21.2: Request unpublished report card with teacherSunethraToken (subject teacher, no leadership appointment)
    const teacherReportRes = await testServer.request(`/api/marks/student-report/${student1Id}/${examUnpublishedId}`, {
      headers: { Authorization: `Bearer ${teacherSunethraToken}` }
    });
    assert.equal(teacherReportRes.status, 403);
    assert.equal((await teacherReportRes.json() as any).code, 'UNPUBLISHED_RESULTS_LOCKED');

    // 21.3: Request unpublished report card with principalPereraToken (holds principal academic staff appointment)
    const principalReportRes = await testServer.request(`/api/marks/student-report/${student1Id}/${examUnpublishedId}`, {
      headers: { Authorization: `Bearer ${principalPereraToken}` }
    });
    assert.equal(principalReportRes.status, 200);
    const principalReport = await principalReportRes.json() as any;
    assert.equal(principalReport.is_provisional, true);
    assert.ok(typeof principalReport.provisional_notice === 'string');
    assert.ok(principalReport.provisional_notice.includes('PROVISIONAL & UNPUBLISHED'));
  });
});


