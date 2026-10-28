import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { db, switchDatabase } from '../src/db/database.js';
import { startTestServer, TestServerInstance } from './helpers/testServer.js';
import { grantAcademicAuthorization } from '../src/services/academicAuthorizationService.js';
import { createAssessmentPolicyProfile, approveAssessmentPolicyProfile } from '../src/services/assessmentPolicyService.js';
import { ensureMarksSheet, saveDraftMarks, submitMarksSheet, reviewMarksSheet, approveMarksSheet } from '../src/services/marksWorkflowService.js';
import { publishExamination } from '../src/services/examinationPublicationService.js';

describe('PR-005 Gate 5: Examination Schedules & Workspace Backend Tests', { concurrency: 1 }, () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  let year2026Id: number;
  let adminUserId: number;
  let principalUserId: number;
  let sectionHeadJuniorId: number;
  let teacherRohanId: number;
  let teacherUnrelatedId: number;

  let adminToken: string;
  let principalToken: string;
  let sectionHeadJuniorToken: string;
  let teacherRohanToken: string;
  let teacherUnrelatedToken: string;

  let class7AId: number;
  let class10AId: number;
  let subjectMathId: number;
  let subjectSciId: number;
  let student1Id: number;
  let student2Id: number;

  let examTerm1Id: number;
  let policyId: number;

  before(async () => {
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `skoolsys_gate5_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`);
    process.env.DB_PATH = testDbPath;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'gate5_workspace_secret_2026_at_least_32_characters_long';
    switchDatabase(testDbPath);

    testServer = await startTestServer();

    // 1. Seed Academic Year 2026
    const yrRes = db.prepare(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ('2026', '2026-01-01', '2026-12-31', 1)
    `).run();
    year2026Id = Number(yrRes.lastInsertRowid);

    // 2. Seed Users
    const insertUser = (username: string, role: string, fullName: string) => {
      const res = db.prepare(`
        INSERT INTO users (username, email, password_hash, role, full_name, is_active, token_version)
        VALUES (?, ?, 'hashed_pw', ?, ?, 1, 1)
      `).run(username, `${username}@kcc.lk`, role, fullName);
      return Number(res.lastInsertRowid);
    };

    adminUserId = insertUser('gate5_admin', 'admin', 'System Administrator');
    principalUserId = insertUser('gate5_principal', 'subject_teacher', 'Principal Janaka');
    sectionHeadJuniorId = insertUser('gate5_sec_head', 'subject_teacher', 'Section Head Bandara');
    teacherRohanId = insertUser('gate5_teacher_rohan', 'subject_teacher', 'Teacher Rohan');
    teacherUnrelatedId = insertUser('gate5_teacher_unrelated', 'subject_teacher', 'Teacher Unrelated');

    // Generate JWTs
    const makeToken = (id: number, username: string, role: string) => {
      return jwt.sign({ id, username, role, token_version: 1 }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    };

    adminToken = makeToken(adminUserId, 'gate5_admin', 'admin');
    principalToken = makeToken(principalUserId, 'gate5_principal', 'subject_teacher');
    sectionHeadJuniorToken = makeToken(sectionHeadJuniorId, 'gate5_sec_head', 'subject_teacher');
    teacherRohanToken = makeToken(teacherRohanId, 'gate5_teacher_rohan', 'subject_teacher');
    teacherUnrelatedToken = makeToken(teacherUnrelatedId, 'gate5_teacher_unrelated', 'subject_teacher');

    // 3. Grant Academic Staff Authorizations
    grantAcademicAuthorization({
      userId: principalUserId,
      academicYearId: year2026Id,
      authRole: 'principal',
      gradeBand: 'all',
      grantedByUserId: adminUserId
    });

    grantAcademicAuthorization({
      userId: sectionHeadJuniorId,
      academicYearId: year2026Id,
      authRole: 'section_head',
      gradeBand: 'junior_6_9',
      grantedByUserId: principalUserId
    });

    // 4. Seed Classes: Grade 7 (Junior) and Grade 10 (OL)
    const cls7Res = db.prepare(`
      INSERT INTO classes (name, grade, academic_year_id) VALUES ('7-A', 7, ?)
    `).run(year2026Id);
    class7AId = Number(cls7Res.lastInsertRowid);

    const cls10Res = db.prepare(`
      INSERT INTO classes (name, grade, academic_year_id) VALUES ('10-A', 10, ?)
    `).run(year2026Id);
    class10AId = Number(cls10Res.lastInsertRowid);

    // 5. Seed Subjects
    const mathRes = db.prepare(`
      INSERT INTO subjects (name, code, category, grade_level) VALUES ('Mathematics', 'MATH-G7', 'Core', '6-9')
    `).run();
    subjectMathId = Number(mathRes.lastInsertRowid);

    const sciRes = db.prepare(`
      INSERT INTO subjects (name, code, category, grade_level) VALUES ('Science', 'SCI-G10', 'Core', '10-11')
    `).run();
    subjectSciId = Number(sciRes.lastInsertRowid);

    // 6. Seed Class-Subject Curriculum Offerings
    db.prepare(`INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)`).run(class7AId, subjectMathId);
    db.prepare(`INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)`).run(class10AId, subjectSciId);

    // 7. Seed Teaching Assignment
    db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, assignment_type)
      VALUES (?, ?, ?, ?, 'subject_teacher')
    `).run(teacherRohanId, class7AId, subjectMathId, year2026Id);

    // 8. Seed Students & Enrolments
    const sStmt = db.prepare(`
      INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status)
      VALUES (?, ?, ?, '2012-05-10', 'Male', 'Guardian', 'Parent', '0771234567', 'Active')
    `);
    student1Id = Number(sStmt.run('ADM-G5-001', 'Student One', 'One').lastInsertRowid);
    student2Id = Number(sStmt.run('ADM-G5-002', 'Student Two', 'Two').lastInsertRowid);

    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 1, 'enrolled')`).run(student1Id, class7AId, year2026Id);
    db.prepare(`INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, 2, 'enrolled')`).run(student2Id, class7AId, year2026Id);

    // Confirmed subject enrollments
    db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_category, enrollment_status)
      VALUES (?, ?, ?, ?, 'core_compulsory', 'confirmed')
    `).run(student1Id, subjectMathId, class7AId, year2026Id);
    db.prepare(`
      INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_category, enrollment_status)
      VALUES (?, ?, ?, ?, 'core_compulsory', 'confirmed')
    `).run(student2Id, subjectMathId, class7AId, year2026Id);

    // 9. Seed Examination
    const exRes = db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, grade_band, exam_type, status, is_published, start_date, end_date)
      VALUES ('Term 1 Evaluation 2026', 1, ?, 'all', 'term', 'draft', 0, '2026-03-01', '2026-03-15')
    `).run(year2026Id);
    examTerm1Id = Number(exRes.lastInsertRowid);

    // 10. Seed Approved Assessment Policy
    const polRes = createAssessmentPolicyProfile({
      academicYearId: year2026Id,
      gradeBand: 'junior_6_9',
      policyCode: 'KCC-POL-2026-JUNIOR-G5',
      title: 'KCC Junior Assessment Policy 2026 G5',
      gradingScale: [
        { grade: 'A', minPercentage: 75.0 },
        { grade: 'B', minPercentage: 65.0 },
        { grade: 'C', minPercentage: 50.0 },
        { grade: 'S', minPercentage: 35.0 },
        { grade: 'F', minPercentage: 0.0 }
      ],
      rankingRules: { rankingMethod: 'competition', tieHandling: 'equal_rank_skip_next', minimumSubjectsRequired: 1 },
      subjectWeights: { [String(subjectMathId)]: 1.0 },
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      user: { id: principalUserId, username: 'gate5_principal', role: 'subject_teacher' } as any
    });
    policyId = polRes.policy.id;
    approveAssessmentPolicyProfile(policyId, { id: principalUserId, username: 'gate5_principal', role: 'subject_teacher' } as any);
  });

  after(async () => {
    if (testServer) await testServer.close();
    try {
      if (testDbPath && fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch {}
  });

  // 1. Examination Schedules Initial Listing & Summary
  test('GET /api/marks/examinations/:id/schedules returns empty schedule summary initially', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules`, {
      headers: { Authorization: `Bearer ${principalToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.schedules.length, 0);
    assert.equal(body.summary.total, 0);
    assert.equal(body.summary.approved, 0);
    assert.equal(body.summary.isFullyApproved, false);
    assert.equal(body.summary.completenessPercentage, 0);
  });

  // 2. Schedule Creation Scoping & Validation
  test('POST /api/marks/examinations/:id/schedules: rejects unauthorized teacher (403)', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherRohanToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ classId: class7AId, subjectId: subjectMathId, isRequired: true })
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'INSUFFICIENT_AUTHORIZATION');
  });

  test('POST /api/marks/examinations/:id/schedules: rejects unscoped base admin (403)', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ classId: class7AId, subjectId: subjectMathId, isRequired: true })
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'INSUFFICIENT_AUTHORIZATION');
  });

  test('POST /api/marks/examinations/:id/schedules: rejects invalid class-subject offering not in class_subjects (400)', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${principalToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ classId: class7AId, subjectId: subjectSciId, isRequired: true })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'INVALID_CLASS_SUBJECT_OFFERING');
  });

  test('POST /api/marks/examinations/:id/schedules: section head can add junior grade schedule item as draft', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sectionHeadJuniorToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ classId: class7AId, subjectId: subjectMathId, isRequired: true })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.status, 'draft');
    assert.ok(body.scheduleId);
  });

  test('POST /api/marks/examinations/:id/schedules: section head cannot add schedule for out-of-band Grade 10 (403)', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sectionHeadJuniorToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ classId: class10AId, subjectId: subjectSciId, isRequired: true })
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'INSUFFICIENT_AUTHORIZATION');
  });

  // 3. Schedule Approval & Provenance Recording
  test('POST /api/marks/examinations/:id/schedules/approve: rejects regular teacher (403)', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherRohanToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'INSUFFICIENT_AUTHORIZATION');
  });

  test('POST /api/marks/examinations/:id/schedules/approve: principal successfully approves draft schedules', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${principalToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.approvedCount, 1);

    // Verify schedule list reflects approved status and approver provenance
    const listRes = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules`, {
      headers: { Authorization: `Bearer ${principalToken}` }
    });
    const listBody = await listRes.json();
    assert.equal(listBody.schedules[0].status, 'approved');
    assert.equal(listBody.schedules[0].approved_by_user_id, principalUserId);
    assert.equal(listBody.schedules[0].approved_by_name, 'Principal Janaka');
    assert.equal(listBody.summary.approved, 1);
    assert.equal(listBody.summary.isFullyApproved, true);
    assert.equal(listBody.summary.completenessPercentage, 100);
  });

  // 4. Pre-Publication Readiness Checklist Inspection
  test('GET /api/marks/examinations/:id/publication-readiness: identifies missing approved marks sheets as blocker', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/publication-readiness`, {
      headers: { Authorization: `Bearer ${principalToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.isReady, false);
    assert.equal(body.checks.hasSchedule, true);
    assert.equal(body.checks.scheduleApproved, true);
    assert.equal(body.checks.allSheetsApproved, false);
    assert.ok(body.blockers.some((b: string) => b.includes('required marks sheet')));
  });

  // 5. Marks Sheet Workflow & Listing Scoping
  let sheetId: number;
  test('Marks workflow: create sheet, save draft, submit, review, and approve', async () => {
    // Subject teacher creates sheet
    const sheet = ensureMarksSheet(examTerm1Id, class7AId, subjectMathId, { id: teacherRohanId, username: 'gate5_teacher_rohan', role: 'subject_teacher' } as any);
    sheetId = sheet.id;

    // Save draft marks
    const draftRes = saveDraftMarks({
      sheetId,
      baseRevision: 1,
      marks: [
        { studentId: student1Id, score: 85, maxScore: 100, assessmentStatus: 'PRESENT', gradeLetter: 'A' },
        { studentId: student2Id, score: 62, maxScore: 100, assessmentStatus: 'PRESENT', gradeLetter: 'C' }
      ],
      user: { id: teacherRohanId, username: 'gate5_teacher_rohan', role: 'subject_teacher' } as any
    });
    assert.equal(draftRes.success, true);

    // Teacher submits
    const submitRes = submitMarksSheet({
      sheetId,
      baseRevision: draftRes.newRevision,
      notes: 'Ready for moderation',
      user: { id: teacherRohanId, username: 'gate5_teacher_rohan', role: 'subject_teacher' } as any
    });
    assert.equal(submitRes.success, true);
    assert.equal(submitRes.status, 'submitted');

    // Section head reviews/endorses
    const reviewRes = reviewMarksSheet({
      sheetId,
      baseRevision: submitRes.newRevision,
      decision: 'endorse',
      remarks: 'Scores verified with assessment records',
      user: { id: sectionHeadJuniorId, username: 'gate5_sec_head', role: 'subject_teacher' } as any
    });
    assert.equal(reviewRes.success, true);
    assert.equal(reviewRes.status, 'reviewed');

    // Principal approves
    const approveRes = approveMarksSheet({
      sheetId,
      baseRevision: reviewRes.newRevision,
      remarks: 'Approved for publication',
      user: { id: principalUserId, username: 'gate5_principal', role: 'subject_teacher' } as any
    });
    assert.equal(approveRes.success, true);
    assert.equal(approveRes.status, 'approved');
  });

  test('GET /api/marks/sheets: scoped listing for assigned teacher vs unrelated teacher', async () => {
    // Assigned teacher Rohan sees the sheet
    const rohanRes = await fetch(`${testServer.baseUrl}/api/marks/sheets?examinationId=${examTerm1Id}`, {
      headers: { Authorization: `Bearer ${teacherRohanToken}` }
    });
    assert.equal(rohanRes.status, 200);
    const rohanBody = await rohanRes.json();
    assert.equal(rohanBody.sheets.length, 1);
    assert.equal(rohanBody.sheets[0].id, sheetId);
    assert.equal(rohanBody.sheets[0].marks_count, 2);

    // Unrelated teacher receives empty list
    const unrelatedRes = await fetch(`${testServer.baseUrl}/api/marks/sheets?examinationId=${examTerm1Id}`, {
      headers: { Authorization: `Bearer ${teacherUnrelatedToken}` }
    });
    assert.equal(unrelatedRes.status, 200);
    const unrelatedBody = await unrelatedRes.json();
    assert.equal(unrelatedBody.sheets.length, 0);

    // Principal sees the sheet
    const principalRes = await fetch(`${testServer.baseUrl}/api/marks/sheets?examinationId=${examTerm1Id}`, {
      headers: { Authorization: `Bearer ${principalToken}` }
    });
    assert.equal(principalRes.status, 200);
    const principalBody = await principalRes.json();
    assert.equal(principalBody.sheets.length, 1);
  });

  // 6. Pre-Publication Readiness is Now Satisfied
  test('GET /api/marks/examinations/:id/publication-readiness: confirms ready to publish', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/publication-readiness`, {
      headers: { Authorization: `Bearer ${principalToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.isReady, true);
    assert.equal(body.blockers.length, 0);
    assert.equal(body.checks.hasSchedule, true);
    assert.equal(body.checks.scheduleApproved, true);
    assert.equal(body.checks.allSheetsApproved, true);
    assert.equal(body.checks.enrolmentsConfirmed, true);
    assert.equal(body.checks.policyApproved, true);
    assert.equal(body.checks.legacyQuarantineClean, true);
    assert.equal(body.checks.publisherAuthorized, true);
  });

  // 7. Schedule Deletion Guard: cannot delete schedule item when sheet is active in approved status
  test('DELETE /api/marks/examinations/:id/schedules/:scheduleId: blocked when marks sheet is active (409)', async () => {
    const listRes = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules`, {
      headers: { Authorization: `Bearer ${principalToken}` }
    });
    const listBody = await listRes.json();
    const schedId = listBody.schedules[0].id;

    const delRes = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules/${schedId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${principalToken}` }
    });
    assert.equal(delRes.status, 409);
    const delBody = await delRes.json();
    assert.equal(delBody.code, 'ACTIVE_MARKS_SHEET_EXISTS');
  });

  // 8. Publish Examination & Post-Publication Schedule Modification Lock
  test('Publish examination and verify schedule changes are locked', async () => {
    const pubRes = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${principalToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ policyProfileId: policyId })
    });
    const pubBody = await pubRes.json();
    assert.equal(pubBody.error, undefined);
    assert.equal(pubRes.status, 200);
    assert.equal(pubBody.success, true);
    assert.equal(pubBody.examinationId, examTerm1Id);

    const examRow = db.prepare('SELECT status, is_published FROM examinations WHERE id = ?').get(examTerm1Id) as any;
    assert.equal(examRow.status, 'published');
    assert.equal(examRow.is_published, 1);

    // Attempt to add new schedule after publication -> blocked by DB trigger / route guard (409)
    const addRes = await fetch(`${testServer.baseUrl}/api/marks/examinations/${examTerm1Id}/schedules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${principalToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ classId: class7AId, subjectId: subjectMathId, isRequired: true })
    });
    assert.equal(addRes.status, 409);
    const addBody = await addRes.json();
    assert.equal(addBody.code, 'EXAMINATION_LOCKED');
  });
});
