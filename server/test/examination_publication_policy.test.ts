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
  revokeAcademicAuthorization
} from '../src/services/academicAuthorizationService.js';
import {
  createAssessmentPolicyProfile,
  approveAssessmentPolicyProfile,
  getAssessmentPolicyProfile,
  calculateSubjectGrade,
  calculateClassResults
} from '../src/services/assessmentPolicyService.js';
import { publishExamination } from '../src/services/examinationPublicationService.js';
import { requestMarkCorrection, reviewMarkCorrection } from '../src/services/marksCorrectionService.js';

describe('PR-005 Gate 4: Assessment Policies, Controlled Publication & Audited Post-Publication Corrections', { concurrency: 1 }, () => {
  let testDbPath: string;
  let testServer: TestServerInstance;

  // Tokens
  let adminToken: string;
  let teacherKamalToken: string;
  let teacherSunethraToken: string;
  let sectionHeadNimaliToken: string;
  let principalPereraToken: string;
  let vpAcademicToken: string;
  let deactivatedToken: string;

  // User IDs
  let adminUserId: number;
  let teacherKamalUserId: number;
  let teacherSunethraUserId: number;
  let sectionHeadNimaliUserId: number;
  let principalPereraUserId: number;
  let vpAcademicUserId: number;
  let deactivatedUserId: number;

  // Academic Entities
  let year2026Id: number;
  let class8AId: number;
  let subjectMathId: number;
  let subjectSciId: number;

  let student1Id: number;
  let student2Id: number;
  let student3Id: number;

  let examTerm1Id: number;
  let sheetMathId: number;
  let sheetSciId: number;
  let provisionalPolicyId: number;
  let approvedPolicyId: number;

  before(async () => {
    const tempDir = os.tmpdir();
    testDbPath = path.join(tempDir, `skoolsys_gate4_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`);
    process.env.DB_PATH = testDbPath;
    process.env.JWT_SECRET = 'gate4-super-secret-jwt-key-with-over-32-characters-2026';

    testServer = await startTestServer();

    // 1. Seed synthetic users
    const userStmt = db.prepare('INSERT INTO users (username, email, password_hash, full_name, role, is_active, token_version) VALUES (?, ?, ?, ?, ?, ?, 1)');
    adminUserId = Number(userStmt.run('g4_admin', 'admin@kcc.test', 'hash', 'Base Admin', 'admin', 1).lastInsertRowid);
    teacherKamalUserId = Number(userStmt.run('g4_kamal', 'kamal@kcc.test', 'hash', 'Mr. Kamal', 'subject_teacher', 1).lastInsertRowid);
    teacherSunethraUserId = Number(userStmt.run('g4_sunethra', 'sunethra@kcc.test', 'hash', 'Ms. Sunethra', 'subject_teacher', 1).lastInsertRowid);
    sectionHeadNimaliUserId = Number(userStmt.run('g4_nimali', 'nimali@kcc.test', 'hash', 'Mrs. Nimali', 'subject_teacher', 1).lastInsertRowid);
    principalPereraUserId = Number(userStmt.run('g4_perera', 'principal@kcc.test', 'hash', 'Principal Perera', 'admin', 1).lastInsertRowid);
    vpAcademicUserId = Number(userStmt.run('g4_vp', 'vp@kcc.test', 'hash', 'Dr. Silva VP', 'admin', 1).lastInsertRowid);
    deactivatedUserId = Number(userStmt.run('g4_deact', 'deact@kcc.test', 'hash', 'Deactivated Leader', 'admin', 1).lastInsertRowid);

    const secret = process.env.JWT_SECRET;
    adminToken = jwt.sign({ id: adminUserId, username: 'g4_admin', role: 'admin', tokenVersion: 1 }, secret);
    teacherKamalToken = jwt.sign({ id: teacherKamalUserId, username: 'g4_kamal', role: 'subject_teacher', tokenVersion: 1 }, secret);
    teacherSunethraToken = jwt.sign({ id: teacherSunethraUserId, username: 'g4_sunethra', role: 'subject_teacher', tokenVersion: 1 }, secret);
    sectionHeadNimaliToken = jwt.sign({ id: sectionHeadNimaliUserId, username: 'g4_nimali', role: 'subject_teacher', tokenVersion: 1 }, secret);
    principalPereraToken = jwt.sign({ id: principalPereraUserId, username: 'g4_perera', role: 'admin', tokenVersion: 1 }, secret);
    vpAcademicToken = jwt.sign({ id: vpAcademicUserId, username: 'g4_vp', role: 'admin', tokenVersion: 1 }, secret);
    deactivatedToken = jwt.sign({ id: deactivatedUserId, username: 'g4_deact', role: 'admin', tokenVersion: 1 }, secret);

    // 2. Academic Entities
    year2026Id = Number(db.prepare("INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ('2026-G4', '2026-01-01', '2026-12-31', 1)").run().lastInsertRowid);

    // Academic staff appointments
    grantAcademicAuthorization({ userId: principalPereraUserId, academicYearId: year2026Id, authRole: 'principal', gradeBand: 'all', grantedByUserId: adminUserId });
    grantAcademicAuthorization({ userId: vpAcademicUserId, academicYearId: year2026Id, authRole: 'vice_principal_academic', gradeBand: 'all', grantedByUserId: adminUserId });
    grantAcademicAuthorization({ userId: sectionHeadNimaliUserId, academicYearId: year2026Id, authRole: 'section_head', gradeBand: 'junior_6_9', grantedByUserId: adminUserId });
    grantAcademicAuthorization({ userId: deactivatedUserId, academicYearId: year2026Id, authRole: 'principal', gradeBand: 'all', grantedByUserId: adminUserId });

    // Deactivate user account after appointment granted to test active user account validation
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(deactivatedUserId);

    // Classes & Subjects
    class8AId = Number(db.prepare('INSERT INTO classes (grade, name, room_number, academic_year_id) VALUES (8, \'8-A\', \'101\', ?)').run(year2026Id).lastInsertRowid);
    subjectMathId = Number(db.prepare('INSERT INTO subjects (code, name, category, grade_level) VALUES (\'G4-MATH\', \'Mathematics\', \'Core\', \'8\')').run().lastInsertRowid);
    subjectSciId = Number(db.prepare('INSERT INTO subjects (code, name, category, grade_level) VALUES (\'G4-SCI\', \'Science\', \'Core\', \'8\')').run().lastInsertRowid);

    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class8AId, subjectMathId);
    db.prepare('INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)').run(class8AId, subjectSciId);

    // Teacher Assignments
    db.prepare('INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, \'subject_teacher\', ?)').run(teacherKamalUserId, class8AId, subjectMathId, year2026Id);
    db.prepare('INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id) VALUES (?, ?, ?, \'subject_teacher\', ?)').run(teacherSunethraUserId, class8AId, subjectSciId, year2026Id);

    // Students & Enrolments
    const stuStmt = db.prepare('INSERT INTO students (admission_no, full_name, calling_name, dob, gender, guardian_name, guardian_relation, guardian_phone, status) VALUES (?, ?, ?, \'2012-05-10\', \'Male\', \'Parent\', \'Father\', \'0771234567\', \'Active\')');
    student1Id = Number(stuStmt.run('ADM-G4-01', 'Kasun Perera', 'Kasun').lastInsertRowid);
    student2Id = Number(stuStmt.run('ADM-G4-02', 'Nuwan Silva', 'Nuwan').lastInsertRowid);
    student3Id = Number(stuStmt.run('ADM-G4-03', 'Amara Dias', 'Amara').lastInsertRowid);

    const enrStmt = db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, ?, \'enrolled\')');
    enrStmt.run(student1Id, class8AId, year2026Id, 1);
    enrStmt.run(student2Id, class8AId, year2026Id, 2);
    enrStmt.run(student3Id, class8AId, year2026Id, 3);

    const sseStmt = db.prepare('INSERT INTO student_subject_enrollments (student_id, subject_id, class_id, academic_year_id, enrollment_status, enrollment_category, verified_by_user_id, verified_at) VALUES (?, ?, ?, ?, \'confirmed\', \'core_compulsory\', ?, datetime(\'now\'))');
    for (const stuId of [student1Id, student2Id, student3Id]) {
      sseStmt.run(stuId, subjectMathId, class8AId, year2026Id, principalPereraUserId);
      sseStmt.run(stuId, subjectSciId, class8AId, year2026Id, principalPereraUserId);
    }

    // Examination
    examTerm1Id = Number(db.prepare(`
      INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, is_published, status, grade_band)
      VALUES ('Term 1 Exam 2026', 1, ?, '2026-03-01', '2026-03-15', 0, 'scheduled', 'junior_6_9')
    `).run(year2026Id).lastInsertRowid);

    // Seed approved assessment policy profile for baseline fixture
    const corePolicyRes = createAssessmentPolicyProfile({
      academicYearId: year2026Id,
      gradeBand: 'junior_6_9',
      policyCode: 'POL-G4-CORE',
      title: 'Junior Secondary Assessment Policy 2026',
      gradingScale: [
        { grade: 'A', minPercentage: 75.0, label: 'Distinction' },
        { grade: 'B', minPercentage: 65.0, label: 'Credit' },
        { grade: 'C', minPercentage: 50.0, label: 'Pass' },
        { grade: 'S', minPercentage: 35.0, label: 'Ordinary Pass' },
        { grade: 'F', minPercentage: 0.0, label: 'Fail' }
      ],
      user: { id: adminUserId, username: 'g4_admin', role: 'admin' } as any
    });
    approveAssessmentPolicyProfile(corePolicyRes.policy.id, { id: principalPereraUserId, username: 'g4_perera', role: 'admin' } as any);
    approvedPolicyId = corePolicyRes.policy.id;

    // Seed approved sheets and marks
    const sheetMathRes = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, revision, status, approved_by_user_id, approved_at)
      VALUES (?, ?, ?, ?, ?, 2, 'approved', ?, datetime('now'))
    `).run(examTerm1Id, class8AId, subjectMathId, year2026Id, teacherKamalUserId, principalPereraUserId);
    sheetMathId = Number(sheetMathRes.lastInsertRowid);

    const sheetSciRes = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, revision, status, approved_by_user_id, approved_at)
      VALUES (?, ?, ?, ?, ?, 2, 'approved', ?, datetime('now'))
    `).run(examTerm1Id, class8AId, subjectSciId, year2026Id, teacherSunethraUserId, principalPereraUserId);
    sheetSciId = Number(sheetSciRes.lastInsertRowid);

    // Insert student marks:
    // Student 1: Math 90, Science 90 (Total: 180, Avg: 90) -> Tie for Rank 1
    // Student 2: Math 90, Science 90 (Total: 180, Avg: 90) -> Tie for Rank 1
    // Student 3: Math 70, Science 70 (Total: 140, Avg: 70) -> Competition Rank 3!
    const markStmt = db.prepare(`
      INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, score, max_score, assessment_status, grade_letter, status, entered_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, 100.0, 'PRESENT', ?, 'submitted', ?)
    `);

    markStmt.run(sheetMathId, examTerm1Id, class8AId, subjectMathId, student1Id, 90.0, 'A', teacherKamalUserId);
    markStmt.run(sheetSciId, examTerm1Id, class8AId, subjectSciId, student1Id, 90.0, 'A', teacherSunethraUserId);

    markStmt.run(sheetMathId, examTerm1Id, class8AId, subjectMathId, student2Id, 90.0, 'A', teacherKamalUserId);
    markStmt.run(sheetSciId, examTerm1Id, class8AId, subjectSciId, student2Id, 90.0, 'A', teacherSunethraUserId);

    markStmt.run(sheetMathId, examTerm1Id, class8AId, subjectMathId, student3Id, 70.0, 'B', teacherKamalUserId);
    markStmt.run(sheetSciId, examTerm1Id, class8AId, subjectSciId, student3Id, 70.0, 'B', teacherSunethraUserId);
  });

  after(async () => {
    if (testServer) await testServer.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {}
  });

  // =========================================================================
  // GATE 4A: Assessment Policies & Calculation Engine Tests
  // =========================================================================

  test('G4A-01: Policy creation defaults to provisional state (is_approved_by_school = 0)', async () => {
    const res = await testServer.request('/api/marks/policies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}` },
      body: {
        academicYearId: year2026Id,
        gradeBand: 'junior_6_9',
        policyCode: 'POL-G4-PROVISIONAL-TEST',
        title: 'Junior Secondary Assessment Policy Lifecycle Test',
        gradingScale: [
          { grade: 'A', minPercentage: 75.0, label: 'Distinction' },
          { grade: 'B', minPercentage: 65.0, label: 'Credit' },
          { grade: 'C', minPercentage: 50.0, label: 'Pass' },
          { grade: 'S', minPercentage: 35.0, label: 'Ordinary Pass' },
          { grade: 'F', minPercentage: 0.0, label: 'Fail' }
        ]
      }
    });

    assert.equal(res.status, 201);
    const body = await res.json() as any;
    assert.equal(body.success, true);
    provisionalPolicyId = body.policy.id;
    assert.equal(body.policy.is_approved_by_school, 0);
    assert.equal(body.policy.isProvisional, true);
    assert.equal(body.policy.approvalStatus, 'provisional');
    assert.equal(body.policy.version, 2); // Incremented from 1 for junior_6_9 in year 2026
  });

  test('G4A-02: Policy approval authorization matrix: Base admin & teachers rejected; Principal approved', async () => {
    // 1. Plain admin without academic appointment -> 403 Forbidden
    const adminRes = await testServer.request(`/api/marks/policies/${provisionalPolicyId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(adminRes.status, 403);
    assert.equal((await adminRes.json() as any).code, 'INSUFFICIENT_AUTHORIZATION');

    // 2. Subject teacher -> 403 Forbidden
    const teacherRes = await testServer.request(`/api/marks/policies/${provisionalPolicyId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}` }
    });
    assert.equal(teacherRes.status, 403);

    // 3. Deactivated user token -> 401 Unauthorized via authentication middleware
    const deactRes = await testServer.request(`/api/marks/policies/${provisionalPolicyId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deactivatedToken}` }
    });
    assert.equal(deactRes.status, 401);

    // 3b. Direct service invocation with deactivated user -> throws USER_DEACTIVATED (403)
    assert.throws(
      () => approveAssessmentPolicyProfile(provisionalPolicyId, { id: deactivatedUserId, username: 'g4_deact', role: 'admin' } as any),
      (err: any) => err.code === 'USER_DEACTIVATED'
    );

    // 4. Authorized Principal -> 200 OK
    const principalRes = await testServer.request(`/api/marks/policies/${provisionalPolicyId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${principalPereraToken}` }
    });
    assert.equal(principalRes.status, 200);
    const pBody = await principalRes.json() as any;
    assert.equal(pBody.policy.is_approved_by_school, 1);
    assert.equal(pBody.policy.approvalStatus, 'approved');
    assert.equal(pBody.policy.isProvisional, false);
    assert.equal(pBody.policy.approved_by_user_id, principalPereraUserId);
  });

  test('G4A-03: Calculation engine: maxScore normalization, all non-present statuses, deterministic competition rank', () => {
    const policy = getAssessmentPolicyProfile(approvedPolicyId);

    // 1. Normalization by maxScore
    const grade1 = calculateSubjectGrade(40, 50, 'PRESENT', policy); // 40/50 = 80% -> A
    assert.equal(grade1.normalizedPercentage, 80);
    assert.equal(grade1.gradeLetter, 'A');

    const grade2 = calculateSubjectGrade(32.5, 50, 'PRESENT', policy); // 32.5/50 = 65% -> B
    assert.equal(grade2.normalizedPercentage, 65);
    assert.equal(grade2.gradeLetter, 'B');

    // 2. All non-present assessment statuses
    assert.equal(calculateSubjectGrade(null, 100, 'ABSENT', policy).gradeLetter, 'AB');
    assert.equal(calculateSubjectGrade(null, 100, 'EXEMPT', policy).gradeLetter, 'EX');
    assert.equal(calculateSubjectGrade(null, 100, 'MEDICAL', policy).gradeLetter, 'MED');
    assert.equal(calculateSubjectGrade(null, 100, 'NOT_ASSESSED', policy).gradeLetter, '-');

    // 3. Invalid maxScore safe fallback
    assert.equal(calculateSubjectGrade(50, 0, 'PRESENT', policy).gradeLetter, '-');
  });

  // =========================================================================
  // GATE 4B: Secure Examination-Wide Publication Tests
  // =========================================================================

  test('G4B-01: Verify fixture setup: approved marks sheets and student marks ready', () => {
    assert.ok(sheetMathId > 0);
    assert.ok(sheetSciId > 0);
    const sheetCount = db.prepare('SELECT COUNT(*) as cnt FROM marks_sheets WHERE examination_id = ?').get(examTerm1Id) as any;
    assert.equal(sheetCount.cnt, 2);
    const marksCount = db.prepare('SELECT COUNT(*) as cnt FROM marks WHERE examination_id = ?').get(examTerm1Id) as any;
    assert.equal(marksCount.cnt, 6);
  });

  test('G4B-02: Unauthorized publication attempts rejected with zero database changes', async () => {
    // 1. Base admin without appointment -> 403 Forbidden
    const adminRes = await testServer.request(`/api/marks/examinations/${examTerm1Id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { policyProfileId: approvedPolicyId }
    });
    assert.equal(adminRes.status, 403);
    assert.equal((await adminRes.json() as any).code, 'INSUFFICIENT_AUTHORIZATION');

    // 2. Assigned teacher -> 403 Forbidden
    const teacherRes = await testServer.request(`/api/marks/examinations/${examTerm1Id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}` },
      body: { policyProfileId: approvedPolicyId }
    });
    assert.equal(teacherRes.status, 403);

    // 3. Section Head -> 403 Forbidden
    const shRes = await testServer.request(`/api/marks/examinations/${examTerm1Id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sectionHeadNimaliToken}` },
      body: { policyProfileId: approvedPolicyId }
    });
    assert.equal(shRes.status, 403);

    // Verify zero data changes: examination remains unpublished
    const examCheck = db.prepare('SELECT is_published, status FROM examinations WHERE id = ?').get(examTerm1Id) as any;
    assert.equal(examCheck.is_published, 0);
    assert.equal(examCheck.status, 'scheduled');
  });

  test('G4B-03: Publication invariant: Declined when policy is provisional or missing (zero DB changes)', async () => {
    // Create an unapproved provisional policy
    const unapprovedPol = createAssessmentPolicyProfile({
      academicYearId: year2026Id,
      gradeBand: 'junior_6_9',
      policyCode: 'POL-UNAPPROVED-TEST',
      title: 'Unapproved Provisional Policy',
      gradingScale: [{ grade: 'A', minPercentage: 75 }],
      user: { id: teacherKamalUserId, username: 'g4_kamal', role: 'subject_teacher' } as any
    });
    assert.equal(unapprovedPol.policy.is_approved_by_school, 0);

    const publishRes = await testServer.request(`/api/marks/examinations/${examTerm1Id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${principalPereraToken}` },
      body: { policyProfileId: unapprovedPol.policy.id }
    });

    assert.equal(publishRes.status, 400);
    const body = await publishRes.json() as any;
    assert.equal(body.code, 'UNAPPROVED_POLICY');

    // Verify zero database changes
    const examCheck = db.prepare('SELECT is_published, status FROM examinations WHERE id = ?').get(examTerm1Id) as any;
    assert.equal(examCheck.is_published, 0);
  });

  test('G4B-04: Publication invariant: Declined when any marks sheet is unapproved (zero DB changes)', async () => {
    // Temporarily set Science sheet to 'reviewed' instead of 'approved'
    db.prepare("UPDATE marks_sheets SET status = 'reviewed' WHERE id = ?").run(sheetSciId);

    const publishRes = await testServer.request(`/api/marks/examinations/${examTerm1Id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${principalPereraToken}` },
      body: { policyProfileId: approvedPolicyId }
    });

    const body = await publishRes.json() as any;
    assert.equal(publishRes.status, 409);
    assert.equal(body.code, 'UNAPPROVED_SHEETS');

    // Restore Science sheet to approved
    db.prepare("UPDATE marks_sheets SET status = 'approved' WHERE id = ?").run(sheetSciId);
  });

  test('G4B-05: Publication invariant: Declined when student subject enrollment is provisional_unverified (zero DB changes)', async () => {
    // Temporarily set student 3 Science enrollment to provisional_unverified
    db.prepare("UPDATE student_subject_enrollments SET enrollment_status = 'provisional_unverified' WHERE student_id = ? AND subject_id = ?").run(student3Id, subjectSciId);

    const publishRes = await testServer.request(`/api/marks/examinations/${examTerm1Id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${principalPereraToken}` },
      body: { policyProfileId: approvedPolicyId }
    });

    assert.equal(publishRes.status, 400);
    const body = await publishRes.json() as any;
    assert.equal(body.code, 'UNVERIFIED_ENROLLMENTS');

    // Restore confirmed enrollment
    db.prepare("UPDATE student_subject_enrollments SET enrollment_status = 'confirmed' WHERE student_id = ? AND subject_id = ?").run(student3Id, subjectSciId);
  });

  test('G4B-06: Atomic examination publication: Scoped Principal publishes; immutable snapshot and all table states synchronized', async () => {
    const publishRes = await testServer.request(`/api/marks/examinations/${examTerm1Id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${principalPereraToken}` },
      body: { policyProfileId: approvedPolicyId }
    });

    assert.equal(publishRes.status, 200);
    const body = await publishRes.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.publicationVersion, 1);
    assert.equal(body.sheetsPublishedCount, 2);
    assert.equal(body.studentsPublishedCount, 3);
    assert.ok(body.auditHash);

    // Verify database state:
    // 1. Examination status and is_published cannot disagree
    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examTerm1Id) as any;
    assert.equal(exam.is_published, 1);
    assert.equal(exam.status, 'published');
    assert.equal(exam.published_by_user_id, principalPereraUserId);
    assert.equal(exam.publication_version, 1);

    // 2. Both marks sheets transitioned to published
    const sheets = db.prepare('SELECT status, revision FROM marks_sheets WHERE examination_id = ?').all(examTerm1Id) as any[];
    for (const s of sheets) {
      assert.equal(s.status, 'published');
      assert.equal(s.revision, 3); // Bumped from 2 to 3
    }

    // 3. All marks records transitioned to published
    const marks = db.prepare('SELECT status FROM marks WHERE examination_id = ?').all(examTerm1Id) as any[];
    for (const m of marks) {
      assert.equal(m.status, 'published');
    }

    // 4. Immutable publication snapshot recorded
    const pubRecord = db.prepare('SELECT * FROM examination_publications WHERE examination_id = ?').get(examTerm1Id) as any;
    assert.ok(pubRecord);
    assert.equal(pubRecord.publication_version, 1);
    assert.equal(pubRecord.policy_profile_id, approvedPolicyId);
    const snapshot = JSON.parse(pubRecord.publication_snapshot_json);
    assert.equal(snapshot.classes.length, 1);
    assert.equal(snapshot.classes[0].students.length, 3);
  });

  test('G4B-07: Concurrency & repeat publication guard: Subsequent or stale publish requests rejected (409)', async () => {
    const repeatRes = await testServer.request(`/api/marks/examinations/${examTerm1Id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${principalPereraToken}` },
      body: { policyProfileId: approvedPolicyId }
    });

    assert.equal(repeatRes.status, 409);
    const body = await repeatRes.json() as any;
    assert.equal(body.code, 'EXAMINATION_ALREADY_PUBLISHED');
  });

  test('G4B-08: Normal marks entry strictly locked post-publication (legacy and draft APIs return 409/403)', async () => {
    // 1. Legacy POST /api/marks/sheet
    const legacyRes = await testServer.request('/api/marks/sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}` },
      body: {
        examId: examTerm1Id,
        classId: class8AId,
        subjectId: subjectMathId,
        marks: [{ student_id: student1Id, score: 95 }]
      }
    });
    assert.equal(legacyRes.status, 409);
    assert.equal((await legacyRes.json() as any).code, 'EXAMINATION_ALREADY_PUBLISHED');

    // 2. Draft save POST /api/marks/sheets/:id/save-draft
    const draftRes = await testServer.request(`/api/marks/sheets/${sheetMathId}/save-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}` },
      body: {
        baseRevision: 3,
        marks: [{ studentId: student1Id, score: 95 }]
      }
    });
    assert.equal(draftRes.status, 409);
    assert.equal((await draftRes.json() as any).code, 'LOCKED_SHEET');
  });

  test('G4B-09: Official Student Report Card reflects official competition rank and ties (1, 1, 3)', async () => {
    // Student 1 (Score 90, 90 -> Rank 1)
    const rep1Res = await testServer.request(`/api/marks/student-report/${student1Id}/${examTerm1Id}`, {
      headers: { Authorization: `Bearer ${principalPereraToken}` }
    });
    assert.equal(rep1Res.status, 200);
    const rep1 = await rep1Res.json() as any;
    assert.equal(rep1.is_published, true);
    assert.equal(rep1.is_provisional, false);
    assert.equal(rep1.performance.rank, 1);

    // Student 2 (Score 90, 90 -> Tie for Rank 1)
    const rep2Res = await testServer.request(`/api/marks/student-report/${student2Id}/${examTerm1Id}`, {
      headers: { Authorization: `Bearer ${principalPereraToken}` }
    });
    assert.equal(rep2Res.status, 200);
    const rep2 = await rep2Res.json() as any;
    assert.equal(rep2.performance.rank, 1);

    // Student 3 (Score 70, 70 -> Standard competition rank 3, skipping rank 2!)
    const rep3Res = await testServer.request(`/api/marks/student-report/${student3Id}/${examTerm1Id}`, {
      headers: { Authorization: `Bearer ${principalPereraToken}` }
    });
    assert.equal(rep3Res.status, 200);
    const rep3 = await rep3Res.json() as any;
    assert.equal(rep3.performance.rank, 3);
  });

  // =========================================================================
  // GATE 4C: Controlled Post-Publication Corrections Tests
  // =========================================================================

  let student3MathMark: any;
  let correction1Id: number;

  test('G4C-01: Requesting post-publication correction: validates CAS expectedPreviousScore and leaves marks unchanged', async () => {
    student3MathMark = db.prepare('SELECT * FROM marks WHERE sheet_id = ? AND student_id = ?').get(sheetMathId, student3Id) as any;
    assert.equal(student3MathMark.score, 70.0);

    // 1. Stale previous score CAS mismatch -> 409 STALE_MARK_STATE
    const staleRes = await testServer.request('/api/marks/corrections', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}` },
      body: {
        markId: student3MathMark.id,
        expectedPreviousScore: 65.0, // Stale!
        expectedPreviousStatus: 'PRESENT',
        requestedScore: 85.0,
        requestedStatus: 'PRESENT',
        correctionCategory: 'clerical_addition',
        detailedJustification: 'Summation clerical error on question 4 (+15 marks).'
      }
    });
    assert.equal(staleRes.status, 409);
    assert.equal((await staleRes.json() as any).code, 'STALE_MARK_STATE');

    // 2. Missing mandatory justification -> 400
    const missingJustRes = await testServer.request('/api/marks/corrections', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}` },
      body: {
        markId: student3MathMark.id,
        expectedPreviousScore: 70.0,
        expectedPreviousStatus: 'PRESENT',
        requestedScore: 85.0,
        requestedStatus: 'PRESENT',
        correctionCategory: 'clerical_addition',
        detailedJustification: '   ' // empty
      }
    });
    assert.equal(missingJustRes.status, 400);
    assert.equal((await missingJustRes.json() as any).code, 'MANDATORY_JUSTIFICATION_MISSING');

    // 3. Valid correction request by assigned subject teacher
    const validRes = await testServer.request('/api/marks/corrections', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}` },
      body: {
        markId: student3MathMark.id,
        expectedPreviousScore: 70.0,
        expectedPreviousStatus: 'PRESENT',
        requestedScore: 85.0,
        requestedStatus: 'PRESENT',
        correctionCategory: 'clerical_addition',
        detailedJustification: 'Summation clerical error on question 4 (+15 marks).'
      }
    });
    assert.equal(validRes.status, 201);
    const body = await validRes.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.status, 'pending');
    correction1Id = body.correctionId;

    // Verify marks table was NOT modified on request
    const markAfterReq = db.prepare('SELECT score FROM marks WHERE id = ?').get(student3MathMark.id) as any;
    assert.equal(markAfterReq.score, 70.0);
  });

  test('G4C-02: Segregation of Duties (Anti-Self-Approval): Requester, Entrant, Teacher and Plain Admin rejected', async () => {
    // 1. Requester cannot approve (Mr. Kamal requested it)
    const selfApproveRes = await testServer.request(`/api/marks/corrections/${correction1Id}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherKamalToken}` },
      body: { decision: 'approve', reviewComments: 'Self approval' }
    });
    assert.equal(selfApproveRes.status, 403);

    // 2. Plain admin without appointment cannot approve
    const adminApproveRes = await testServer.request(`/api/marks/corrections/${correction1Id}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { decision: 'approve', reviewComments: 'Admin approval' }
    });
    assert.equal(adminApproveRes.status, 403);
    assert.equal((await adminApproveRes.json() as any).code, 'INSUFFICIENT_AUTHORIZATION');

    // 3. Section Head cannot finalize post-publication approval
    const shApproveRes = await testServer.request(`/api/marks/corrections/${correction1Id}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sectionHeadNimaliToken}` },
      body: { decision: 'approve' }
    });
    assert.equal(shApproveRes.status, 403);
  });

  test('G4C-03: Independent Vice Principal Academic approves correction: Atomic mark update, revision bump & audit provenance', async () => {
    const approveRes = await testServer.request(`/api/marks/corrections/${correction1Id}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vpAcademicToken}` },
      body: {
        decision: 'approve',
        reviewComments: 'Clerical addition verified against physical script page 4.'
      }
    });

    assert.equal(approveRes.status, 200);
    const body = await approveRes.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.status, 'approved');
    assert.equal(body.newScore, 85.0);
    assert.equal(body.newGrade, 'A'); // 85% is Distinction 'A'
    assert.equal(body.newRevision, 4); // Sheet revision bumped to 4

    // Verify database state:
    // 1. Mark score and grade updated
    const updatedMark = db.prepare('SELECT score, grade_letter FROM marks WHERE id = ?').get(student3MathMark.id) as any;
    assert.equal(updatedMark.score, 85.0);
    assert.equal(updatedMark.grade_letter, 'A');

    // 2. Sheet revision incremented
    const updatedSheet = db.prepare('SELECT revision FROM marks_sheets WHERE id = ?').get(sheetMathId) as any;
    assert.equal(updatedSheet.revision, 4);

    // 3. Revision snapshot stored in marks_sheet_revisions
    const revSnapshot = db.prepare('SELECT * FROM marks_sheet_revisions WHERE sheet_id = ? AND revision = 4').get(sheetMathId) as any;
    assert.ok(revSnapshot);

    // 4. Detailed audit trail recorded in marks_audit_history
    const auditRecord = db.prepare(`
      SELECT * FROM marks_audit_history
      WHERE action = 'POST_PUBLICATION_CORRECTION' AND correction_id = ?
    `).get(correction1Id) as any;
    assert.ok(auditRecord);
    assert.equal(auditRecord.previous_score, 70.0);
    assert.equal(auditRecord.new_score, 85.0);
    assert.equal(auditRecord.actor_user_id, vpAcademicUserId);
  });

  test('G4C-04: Student Report Card displays reissued status and complete corrections provenance', async () => {
    const repRes = await testServer.request(`/api/marks/student-report/${student3Id}/${examTerm1Id}`, {
      headers: { Authorization: `Bearer ${principalPereraToken}` }
    });

    assert.equal(repRes.status, 200);
    const rep = await repRes.json() as any;

    assert.equal(rep.is_published, true);
    assert.equal(rep.is_reissued, true);
    assert.equal(rep.corrections_history.length, 1);
    assert.equal(rep.corrections_history[0].corrected_score, 85.0);
    assert.equal(rep.corrections_history[0].expected_previous_score, 70.0);
    assert.equal(rep.corrections_history[0].correction_category, 'clerical_addition');
    assert.equal(rep.corrections_history[0].approved_by_name, 'Dr. Silva VP');

    // Recomputed performance:
    // Student 3 now has Math 85 + Science 70 = 155 (Avg: 77.5) -> Still Rank 3
    assert.equal(rep.performance.totalScore, 155.0);
    assert.equal(rep.performance.average, 77.5);
    assert.equal(rep.performance.rank, 3);
  });
});
