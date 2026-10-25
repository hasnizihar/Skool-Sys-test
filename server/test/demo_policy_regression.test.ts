import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { switchDatabase, db, closeDatabase } from '../src/db/database.js';
import { runSeed } from '../src/db/seed.js';
import {
  calculateSubjectGrade,
  calculateClassResults,
  getAssessmentPolicyProfile,
  GradingScaleItem,
  AbsenceRules,
  RankingRules
} from '../src/services/assessmentPolicyService.js';

describe('MVP Final Polish: Demo Academic Policies & Publication Truthfulness Regression Suite', () => {
  let tempDbPath: string;
  let originalEnv: NodeJS.ProcessEnv;

  before(() => {
    originalEnv = { ...process.env };
    process.env.CONFIRM_DISPOSABLE_SEED = '1';
    process.env.ALLOW_DISPOSABLE_SEED = '1';

    tempDbPath = path.join(os.tmpdir(), `skoolsys_demo_regression_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    switchDatabase(tempDbPath);
    runSeed({ targetDbPath: tempDbPath });
  });

  after(() => {
    process.env = originalEnv;
    closeDatabase();
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch {}
  });

  describe('FIX 01: Canonical Academic Policy & Grading Scale Assertions', () => {
    it('1.1 Regression assertion: 85/100 displays A, 67/100 displays B, and 45/100 displays S', () => {
      const juniorPolicy = db.prepare("SELECT * FROM assessment_policy_profiles WHERE policy_code = 'KCC-SEC-STD-2026-V1'").get() as any;
      assert.ok(juniorPolicy, 'Junior standard policy must exist in database');

      // Regression assertions required by specification:
      // 85/100 -> A
      const res85 = calculateSubjectGrade(85, 100, 'PRESENT', juniorPolicy);
      assert.strictEqual(res85.gradeLetter, 'A', '85/100 must evaluate to grade A (Distinction)');
      assert.strictEqual(res85.normalizedPercentage, 85);
      assert.strictEqual(res85.assessmentStatus, 'PRESENT');

      // 67/100 -> B
      const res67 = calculateSubjectGrade(67, 100, 'PRESENT', juniorPolicy);
      assert.strictEqual(res67.gradeLetter, 'B', '67/100 must evaluate to grade B (Very Good Pass)');
      assert.strictEqual(res67.normalizedPercentage, 67);
      assert.strictEqual(res67.assessmentStatus, 'PRESENT');

      // 45/100 -> S
      const res45 = calculateSubjectGrade(45, 100, 'PRESENT', juniorPolicy);
      assert.strictEqual(res45.gradeLetter, 'S', '45/100 must evaluate to grade S (Ordinary Pass)');
      assert.strictEqual(res45.normalizedPercentage, 45);
      assert.strictEqual(res45.assessmentStatus, 'PRESENT');

      // Boundary and fail thresholds
      const res55 = calculateSubjectGrade(55, 100, 'PRESENT', juniorPolicy);
      assert.strictEqual(res55.gradeLetter, 'C', '55/100 must evaluate to grade C (Credit Pass)');

      const res30 = calculateSubjectGrade(30, 100, 'PRESENT', juniorPolicy);
      assert.strictEqual(res30.gradeLetter, 'F', '30/100 must evaluate to grade F (Fail)');

      // Non-present statuses
      const resAb = calculateSubjectGrade(null, 100, 'ABSENT', juniorPolicy);
      assert.strictEqual(resAb.gradeLetter, 'AB');
      assert.strictEqual(resAb.normalizedPercentage, null);

      const resMed = calculateSubjectGrade(null, 100, 'MEDICAL', juniorPolicy);
      assert.strictEqual(resMed.gradeLetter, 'MED');
      assert.strictEqual(resMed.normalizedPercentage, null);

      const resEx = calculateSubjectGrade(null, 100, 'EXEMPT', juniorPolicy);
      assert.strictEqual(resEx.gradeLetter, 'EX');
      assert.strictEqual(resEx.normalizedPercentage, null);
    });

    it('1.2 Verified canonical JSON schema in Junior, O/L, and A/L synthetic policies', () => {
      const policies = db.prepare('SELECT * FROM assessment_policy_profiles ORDER BY id ASC').all() as any[];
      assert.strictEqual(policies.length, 4, 'Must seed exactly 4 synthetic policy profiles');

      const expectedCodes = ['KCC-SEC-STD-2026-V1', 'KCC-OL-STD-2026-V1', 'KCC-AL-STD-2026-V1', 'KCC-PILOT-2026-V2'];
      assert.deepStrictEqual(policies.map(p => p.policy_code), expectedCodes);

      policies.forEach(policy => {
        // Assert title clearly indicates synthetic demo fixture
        assert.ok(policy.title.includes('Synthetic Fixture Only'), `Policy ${policy.policy_code} must be labeled as synthetic fixture`);

        // Validate grading_scale_json structure
        const scale = JSON.parse(policy.grading_scale_json) as GradingScaleItem[];
        assert.ok(Array.isArray(scale), 'Grading scale must be an array');
        assert.strictEqual(scale.length, 5, 'Standard grading scale has 5 bands: A, B, C, S, F');

        scale.forEach(item => {
          assert.ok(typeof item.grade === 'string' && item.grade.length > 0, 'Must have grade letter string');
          assert.ok(typeof item.minPercentage === 'number' && item.minPercentage >= 0 && item.minPercentage <= 100, 'Must have valid minPercentage');
          assert.ok(typeof item.label === 'string', 'Must have label description');
          // Incompatible legacy keys must NOT exist
          assert.strictEqual((item as any).gradeLetter, undefined, 'Must NOT contain legacy gradeLetter');
          assert.strictEqual((item as any).minScore, undefined, 'Must NOT contain legacy minScore');
          assert.strictEqual((item as any).maxScore, undefined, 'Must NOT contain legacy maxScore');
        });

        // Validate absence_rules_json structure
        const absence = JSON.parse(policy.absence_rules_json) as AbsenceRules;
        assert.ok(['zero', 'exclude', 'provisional_fail'].includes(absence.absentHandling), 'Valid absentHandling');
        assert.ok(['exclude', 'deferred'].includes(absence.medicalHandling), 'Valid medicalHandling');
        assert.strictEqual(absence.exemptHandling, 'exclude', 'Valid exemptHandling');
        assert.strictEqual((absence as any).absentTreatedAsZero, undefined, 'Must NOT contain legacy absentTreatedAsZero');

        // Validate ranking_rules_json structure
        const ranking = JSON.parse(policy.ranking_rules_json) as RankingRules;
        assert.strictEqual(ranking.rankingMethod, 'competition', 'Ranking method must be competition');
        assert.strictEqual(ranking.tieHandling, 'equal_rank_skip_next', 'Tie handling must be equal_rank_skip_next');
        assert.ok(ranking.minimumSubjectsRequired >= 1, 'minimumSubjectsRequired must be >= 1');
      });

      // Assert school approval statuses
      const junior = policies.find(p => p.policy_code === 'KCC-SEC-STD-2026-V1');
      const ol = policies.find(p => p.policy_code === 'KCC-OL-STD-2026-V1');
      const al = policies.find(p => p.policy_code === 'KCC-AL-STD-2026-V1');
      const pilot = policies.find(p => p.policy_code === 'KCC-PILOT-2026-V2');

      assert.strictEqual(junior.is_approved_by_school, 1);
      assert.strictEqual(ol.is_approved_by_school, 1);
      assert.strictEqual(al.is_approved_by_school, 1);
      assert.strictEqual(pilot.is_approved_by_school, 0, 'Pilot policy must be provisional (unapproved)');
    });
  });

  describe('FIX 02: Truthful Published Demonstration Results', () => {
    it('2.1 Published examination passes canonical publication validations and carries authentic SHA-256 audit hash', () => {
      const exam = db.prepare("SELECT * FROM examinations WHERE name LIKE 'Term 1 Assessment 2026%'").get() as any;
      assert.ok(exam, 'Term 1 Assessment 2026 must exist');
      assert.strictEqual(exam.is_published, 1, 'Examination must be published');
      assert.strictEqual(exam.status, 'published', 'Examination status must be published');
      assert.strictEqual(exam.publication_version, 1);

      // Verify legitimate publication record created by canonical service
      const pubRecord = db.prepare('SELECT * FROM examination_publications WHERE examination_id = ?').get(exam.id) as any;
      assert.ok(pubRecord, 'Publication record must exist in examination_publications');
      assert.strictEqual(pubRecord.publication_version, 1);
      assert.strictEqual(pubRecord.published_by_user_id, 1, 'Published by admin/principal');

      // Assert audit hash is NOT arbitrary placeholder
      assert.notStrictEqual(pubRecord.audit_hash, 'a1b2c3d4e5f67890123456789abcdef0', 'Must NOT use placeholder audit hash');
      assert.strictEqual(pubRecord.audit_hash.length, 64, 'Audit hash must be full 64-hex SHA-256');

      // Verify audit hash cryptographically matches SHA-256 over publication_snapshot_json
      const expectedHash = crypto.createHash('sha256').update(pubRecord.publication_snapshot_json).digest('hex');
      assert.strictEqual(pubRecord.audit_hash, expectedHash, 'Audit hash must match SHA-256 of immutable snapshot');

      // Verify snapshot structure
      const snapshot = JSON.parse(pubRecord.publication_snapshot_json);
      assert.strictEqual(snapshot.examinationId, exam.id);
      assert.ok(snapshot.classes.length >= 3, 'Snapshot must contain calculated results for all participating classes');
    });

    it('2.2 Every scheduled subject in Term 1 is complete, approved, and has full marks', () => {
      const exam = db.prepare("SELECT id FROM examinations WHERE name LIKE 'Term 1 Assessment 2026%'").get() as any;

      const schedules = db.prepare(`
        SELECT es.*, c.name as class_name, s.code as subject_code
        FROM examination_schedules es
        JOIN classes c ON es.class_id = c.id
        JOIN subjects s ON es.subject_id = s.id
        WHERE es.examination_id = ?
      `).all(exam.id) as any[];

      assert.strictEqual(schedules.length, 10, 'Term 1 must have exactly 10 scheduled offerings (Grade 8: 3, Grade 11: 4, Grade 12: 3)');

      schedules.forEach(sched => {
        assert.strictEqual(sched.status, 'approved', `Schedule ${sched.class_name} - ${sched.subject_code} must be approved`);
        assert.ok(sched.approved_by_user_id, 'Schedule must have approver provenance');

        // Check corresponding marks sheet
        const sheet = db.prepare(`
          SELECT * FROM marks_sheets
          WHERE examination_id = ? AND class_id = ? AND subject_id = ?
        `).get(exam.id, sched.class_id, sched.subject_id) as any;

        assert.ok(sheet, `Marks sheet for ${sched.class_name} - ${sched.subject_code} must exist`);
        assert.strictEqual(sheet.status, 'published', `Sheet for ${sched.class_name} - ${sched.subject_code} must be published`);
        assert.ok(sheet.approved_by_user_id, 'Sheet must have approved_by_user_id');
        assert.notStrictEqual(sheet.teacher_id, sheet.approved_by_user_id, 'Separation of duties: Teacher cannot self-approve sheet');

        // Check marks completeness
        const rosterCount = (db.prepare("SELECT COUNT(*) as cnt FROM enrollments WHERE class_id = ? AND status = 'enrolled'").get(sched.class_id) as any).cnt;
        const marksCount = (db.prepare('SELECT COUNT(*) as cnt FROM marks WHERE sheet_id = ? AND score IS NOT NULL').get(sheet.id) as any).cnt;
        assert.strictEqual(marksCount, rosterCount, `Sheet ${sched.class_name} - ${sched.subject_code} must contain complete marks for all enrolled students`);
      });
    });

    it('2.3 Report cards for Grade 8-A, Grade 11-A, and Grade 12-Science reconcile cleanly and calculate ranks and grades', () => {
      const exam = db.prepare("SELECT id FROM examinations WHERE name LIKE 'Term 1 Assessment 2026%'").get() as any;
      const grade8A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 8-A'").get() as any;
      const grade11A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 11-A'").get() as any;
      const grade12Sci = db.prepare("SELECT id FROM classes WHERE name = 'Grade 12-Science'").get() as any;

      // Grade 8-A
      const res8A = calculateClassResults(exam.id, grade8A.id);
      assert.strictEqual(res8A.isOfficialEligible, true, 'Grade 8-A must be eligible for official published report cards');
      assert.strictEqual(res8A.unverifiedStudentCount, 0);
      assert.strictEqual(res8A.unassessedStudentCount, 0);
      assert.strictEqual(res8A.students.length, 20);

      // Student 1 (Kasun) in Grade 8-A: score 85 in Math after approved correction
      const kasun = res8A.students.find(s => s.admissionNo === 'SCH-2024-001');
      assert.ok(kasun);
      const mathSub = db.prepare("SELECT id FROM subjects WHERE code = 'MATH'").get() as any;
      assert.strictEqual(kasun.subjectGrades[mathSub.id].score, 85);
      assert.strictEqual(kasun.subjectGrades[mathSub.id].gradeLetter, 'A');
      assert.ok(kasun.rank !== null && kasun.rank >= 1, 'Kasun must receive a competition rank');

      // Grade 11-A (O/L)
      const res11A = calculateClassResults(exam.id, grade11A.id);
      assert.strictEqual(res11A.isOfficialEligible, true, 'Grade 11-A must be eligible for official published report cards');
      assert.strictEqual(res11A.students.length, 15);
      const akram = res11A.students.find(s => s.admissionNo === 'SCH-2021-001');
      assert.ok(akram);
      assert.ok(akram.rank !== null && akram.rank >= 1);
      assert.ok(akram.averagePercentage !== null && akram.averagePercentage > 0);

      // Grade 12-Science (A/L)
      const res12Sci = calculateClassResults(exam.id, grade12Sci.id);
      assert.strictEqual(res12Sci.isOfficialEligible, true, 'Grade 12-Science must be eligible for official published report cards');
      assert.strictEqual(res12Sci.students.length, 12);
      const irfan = res12Sci.students.find(s => s.admissionNo === 'SCH-2020-001');
      assert.ok(irfan);
      assert.ok(irfan.rank !== null && irfan.rank >= 1);
    });

    it('2.4 Separate unpublished demonstrations show draft, submitted, reviewed, and approved states in Mid-Year exam', () => {
      const midYearExam = db.prepare("SELECT * FROM examinations WHERE name LIKE 'Mid-Year Examination 2026%'").get() as any;
      assert.ok(midYearExam);
      assert.strictEqual(midYearExam.is_published, 0, 'Mid-Year Exam must remain UNPUBLISHED');
      assert.strictEqual(midYearExam.status, 'scheduled');

      const midYearSheets = db.prepare(`
        SELECT ms.*, s.code as subject_code
        FROM marks_sheets ms
        JOIN subjects s ON ms.subject_id = s.id
        WHERE ms.examination_id = ?
      `).all(midYearExam.id) as any[];

      const statuses = midYearSheets.map(s => ({ code: s.subject_code, status: s.status }));

      // History: draft
      const hist = statuses.find(s => s.code === 'HIST');
      assert.ok(hist, 'History sheet must exist');
      assert.strictEqual(hist.status, 'draft', 'History sheet must demonstrate DRAFT state');

      // English: submitted
      const eng = statuses.find(s => s.code === 'ENG');
      assert.ok(eng, 'English sheet must exist');
      assert.strictEqual(eng.status, 'submitted', 'English sheet must demonstrate SUBMITTED state');

      // Science: reviewed
      const sci = statuses.find(s => s.code === 'SCI');
      assert.ok(sci, 'Science sheet must exist');
      assert.strictEqual(sci.status, 'reviewed', 'Science sheet must demonstrate REVIEWED state');

      // HPE: approved
      const hpe = statuses.find(s => s.code === 'HPE');
      assert.ok(hpe, 'HPE sheet must exist');
      assert.strictEqual(hpe.status, 'approved', 'HPE sheet must demonstrate APPROVED state');

      // Math: unseeded so interactive entry can be demonstrated live
      const math = statuses.find(s => s.code === 'MATH');
      assert.strictEqual(math, undefined, 'Math in Mid-Year must be unseeded for live interactive entry demonstration');
    });

    it('2.5 Post-publication correction workflow exhibits approved/reissued, pending, and rejected states', () => {
      const exam = db.prepare("SELECT id FROM examinations WHERE name LIKE 'Term 1 Assessment 2026%'").get() as any;
      const corrections = db.prepare('SELECT * FROM marks_corrections WHERE examination_id = ?').all(exam.id) as any[];

      assert.strictEqual(corrections.length, 3, 'Must have 3 post-publication corrections');

      const approved = corrections.find(c => c.status === 'approved');
      assert.ok(approved, 'Must have approved correction');
      assert.strictEqual(approved.requested_score, 85);
      assert.ok(approved.reviewed_by_user_id, 'Approved correction must have reviewer provenance');

      const pending = corrections.find(c => c.status === 'pending');
      assert.ok(pending, 'Must have pending correction');
      assert.strictEqual(pending.requested_score, 79);
      assert.strictEqual(pending.reviewed_by_user_id, null);

      const rejected = corrections.find(c => c.status === 'rejected');
      assert.ok(rejected, 'Must have rejected correction');
      assert.strictEqual(rejected.requested_score, 95);
      assert.ok(rejected.review_comments?.includes('Rejected'), 'Rejected correction must document reason');
    });
  });

  describe('FIX 03: Demonstration Safety & Verified Disposable Identity', () => {
    it('3.1 Disposable fixture marker is positively stamped in database', () => {
      const marker = db.prepare("SELECT * FROM _skoolsys_disposable_marker WHERE marker_id = 'primary_marker'").get() as any;
      assert.ok(marker, 'Disposable marker record must exist in _skoolsys_disposable_marker');
      assert.strictEqual(marker.disposable_token, 'DISPOSABLE_DEMO_SEED_2026');
    });

    it('3.2 All staff personas and examinations carry explicit synthetic demo identification', () => {
      const users = db.prepare('SELECT username, full_name FROM users').all() as any[];
      users.forEach(u => {
        assert.ok(
          u.full_name.includes('DEMO ONLY') && u.full_name.includes('Synthetic'),
          `User ${u.username} full_name must clearly indicate DEMO ONLY / Synthetic persona`
        );
      });

      const exams = db.prepare('SELECT name FROM examinations').all() as any[];
      exams.forEach(e => {
        assert.ok(
          e.name.includes('Demo / Synthetic'),
          `Examination '${e.name}' must clearly indicate Demo / Synthetic`
        );
      });
    });
  });
});
