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
  getMarksSheetHistory
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

  // Test 9: Legacy routes containment and unpublished results confidentiality
  test('EXAM-WORK-09: Legacy routes contain confidentiality leaks and reject privileged status injection', async () => {
    // 1. Unauthorized teacher attempting to view unpublished exam marks sheet -> 403 Forbidden
    const unpubRes = await testServer.request(`/api/marks/sheet?examId=${examUnpublishedId}&classId=${class8AId}&subjectId=${subjectMathId}`, {
      headers: { Authorization: `Bearer ${unauthorizedTeacherToken}` }
    });
    assert.equal(unpubRes.status, 403);
    assert.match((await unpubRes.json() as any).error, /Access denied/i);

    // 2. Unauthorized teacher attempting to view student report on unpublished exam -> 403 Forbidden
    const reportRes = await testServer.request(`/api/marks/student-report/${student1Id}/${examUnpublishedId}`, {
      headers: { Authorization: `Bearer ${unauthorizedTeacherToken}` }
    });
    assert.equal(reportRes.status, 403);
    assert.match((await reportRes.json() as any).error, /Access denied/i);

    // 3. Privileged status injection rejection on legacy POST /api/marks/sheet -> 400
    const injectRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherSunethraToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam2026Term1Id,
        classId: class8AId,
        subjectId: subjectSciId,
        status: 'approved', // INJECTION ATTEMPT!
        marks: [{ student_id: student1Id, score: 85.0 }]
      })
    });
    assert.equal(injectRes.status, 400);
    assert.match((await injectRes.json() as any).error, /legacy marks entry may only set 'draft' or 'submitted'/i);
  });
});
