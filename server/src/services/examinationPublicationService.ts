import { db } from '../db/database.js';
import { AuthUser } from '../middleware/auth.js';
import crypto from 'node:crypto';
import {
  getActiveStaffAuthorizations,
  doesBandCoverGrade
} from './academicAuthorizationService.js';
import {
  calculateClassResults,
  getAssessmentPolicyProfile
} from './assessmentPolicyService.js';

export interface PublishExaminationParams {
  examinationId: number;
  policyProfileId?: number;
  expectedStatus?: string;
  user: AuthUser;
  ipAddress?: string;
}

export interface PublishExaminationResult {
  success: boolean;
  examinationId: number;
  publicationVersion: number;
  policyProfileId: number;
  policyVersion: number;
  publishedAt: string;
  publishedByUserId: number;
  sheetsPublishedCount: number;
  studentsPublishedCount: number;
  auditHash: string;
}

/**
 * Gate 4B: Secure Examination-Wide Publication Service
 *
 * Atomically validates all publication invariants, executes official calculation engine,
 * records point-in-time publication snapshot and audit logs, and transitions examination
 * and marks sheets to 'published' in a single SQLite write transaction.
 */
export function publishExamination(params: PublishExaminationParams): PublishExaminationResult {
  const { examinationId, policyProfileId, expectedStatus, user, ipAddress = '127.0.0.1' } = params;

  // G4R-07: ATOMIC IMMEDIATE TRANSACTION BEGIN
  // Acquire SQLite write lock BEFORE any eligibility or invariant validation
  db.exec('BEGIN IMMEDIATE;');
  try {
    // 1. Live Active User Account Verification
    const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as { id: number; is_active: number } | undefined;
    if (!activeUser || activeUser.is_active !== 1) {
      const err = new Error('User account is deactivated or invalid.');
      (err as any).statusCode = 403;
      (err as any).code = 'USER_DEACTIVATED';
      throw err;
    }

    // 2. Fetch Examination Details under write lock
    const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examinationId) as any;
    if (!exam) {
      const err = new Error('Examination not found.');
      (err as any).statusCode = 404;
      (err as any).code = 'EXAM_NOT_FOUND';
      throw err;
    }

    // 3. Concurrency & Repeated / Stale Publication Guard
    if (exam.is_published === 1 || exam.status === 'published') {
      const err = new Error('Examination has already been officially published. Re-publication is prohibited.');
      (err as any).statusCode = 409;
      (err as any).code = 'EXAMINATION_ALREADY_PUBLISHED';
      throw err;
    }

    if (expectedStatus && exam.status !== expectedStatus) {
      const err = new Error(`Examination status changed concurrently. Expected '${expectedStatus}', found '${exam.status}'.`);
      (err as any).statusCode = 409;
      (err as any).code = 'STALE_EXAMINATION_STATE';
      throw err;
    }

    // 4. Role & Scope Verification
    // Invariant: Only active year- and grade-scoped Principal or VP Academic appointment may publish.
    // Plain-admin role without active academic staff appointment MUST be rejected with 403!
    const activeAuths = getActiveStaffAuthorizations(user.id, exam.academic_year_id);
    const examGradeBand = exam.grade_band || 'all';

    const isAuthorizedPublisher = activeAuths.some(a =>
      ['principal', 'vice_principal_academic'].includes(a.auth_role) &&
      (a.grade_band === 'all' || a.grade_band === examGradeBand)
    );

    if (!isAuthorizedPublisher) {
      const err = new Error(
        'Access denied: Official examination publication requires an active Principal or Vice Principal Academic appointment covering this academic year and grade band. Plain administrators, teachers, and Section Heads cannot authorize examination publication.'
      );
      (err as any).statusCode = 403;
      (err as any).code = 'INSUFFICIENT_AUTHORIZATION';
      throw err;
    }

    // 5. Policy Profile Resolution & School Approval Verification
    // Invariant: Decline official results when policy is unapproved or provisional.
    let resolvedPolicy: any;
    if (policyProfileId) {
      resolvedPolicy = getAssessmentPolicyProfile(policyProfileId);
      if (resolvedPolicy.academic_year_id !== exam.academic_year_id) {
        const err = new Error(`Policy profile academic year (${resolvedPolicy.academic_year_id}) does not match examination academic year (${exam.academic_year_id}).`);
        (err as any).statusCode = 400;
        (err as any).code = 'POLICY_YEAR_MISMATCH';
        throw err;
      }
    } else {
      // Look up approved policy for exam's academic year and grade band
      const approvedPolicyRow = db.prepare(`
        SELECT id FROM assessment_policy_profiles
        WHERE academic_year_id = ? AND (grade_band = ? OR grade_band = 'all' OR ? = 'all') AND is_approved_by_school = 1
        ORDER BY version DESC, id DESC
        LIMIT 1
      `).get(exam.academic_year_id, examGradeBand, examGradeBand) as { id: number } | undefined;

      if (!approvedPolicyRow) {
        const err = new Error(
          'Publication declined: No school-approved assessment policy exists for this examination. Provisional policies require formal school sign-off before official publication.'
        );
        (err as any).statusCode = 400;
        (err as any).code = 'UNAPPROVED_POLICY';
        throw err;
      }
      resolvedPolicy = getAssessmentPolicyProfile(approvedPolicyRow.id);
    }

    if (resolvedPolicy.is_approved_by_school !== 1) {
      const err = new Error(
        `Publication declined: Assessment policy '${resolvedPolicy.policy_code}' is provisional. Formal school approval by Principal/VP Academic is mandatory for official publication.`
      );
      (err as any).statusCode = 400;
      (err as any).code = 'UNAPPROVED_POLICY';
      throw err;
    }

    // 6. Unresolved Quarantine Check
    const quarantinedMarks = db.prepare(`
      SELECT COUNT(*) as cnt FROM quarantined_legacy_marks
      WHERE examination_id = ?
    `).get(examinationId) as { cnt: number };

    if (Number(quarantinedMarks?.cnt || 0) > 0) {
      const err = new Error(
        `Publication declined: Examination contains ${quarantinedMarks.cnt} unresolved quarantined marks. All legacy anomalies must be resolved prior to publication.`
      );
      (err as any).statusCode = 409;
      (err as any).code = 'UNRESOLVED_QUARANTINE';
      throw err;
    }

    // 7. Marks Sheets Verification
    // Find all applicable marks sheets for this examination
    const sheets = db.prepare(`
      SELECT ms.*, c.name as class_name, c.grade as class_grade, s.name as subject_name, s.code as subject_code
      FROM marks_sheets ms
      JOIN classes c ON ms.class_id = c.id
      JOIN subjects s ON ms.subject_id = s.id
      WHERE ms.examination_id = ?
    `).all(examinationId) as any[];

    if (sheets.length === 0) {
      const err = new Error('Publication declined: No marks sheets found for this examination.');
      (err as any).statusCode = 400;
      (err as any).code = 'NO_APPLICABLE_SHEETS';
      throw err;
    }

    // Every applicable sheet MUST be in status 'approved'
    const unapprovedSheets = sheets.filter(s => s.status !== 'approved');
    if (unapprovedSheets.length > 0) {
      const unapprovedSummary = unapprovedSheets.map(s => `${s.class_name} - ${s.subject_name} (${s.status})`).join(', ');
      const err = new Error(
        `Publication declined: All marks sheets must be approved before publication. Unapproved sheets: ${unapprovedSummary}`
      );
      (err as any).statusCode = 409;
      (err as any).code = 'UNAPPROVED_SHEETS';
      throw err;
    }

    // Every sheet must have a separate authorized approver recorded (no self-approval)
    for (const s of sheets) {
      if (!s.approved_by_user_id) {
        const err = new Error(`Sheet ${s.id} (${s.class_name} ${s.subject_name}) is missing approver provenance.`);
        (err as any).statusCode = 409;
        (err as any).code = 'MISSING_APPROVER_PROVENANCE';
        throw err;
      }
      if (s.teacher_id && Number(s.approved_by_user_id) === Number(s.teacher_id)) {
        const err = new Error(`Sheet ${s.id} (${s.class_name} ${s.subject_name}) has invalid self-approval provenance.`);
        (err as any).statusCode = 409;
        (err as any).code = 'SELF_APPROVAL_VIOLATION';
        throw err;
      }
    }

    // G4R-01: Positive confirmed enrolment check across all marks in this examination
    const unconfirmedMarkCheck = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM marks m
      JOIN marks_sheets ms ON m.sheet_id = ms.id
      WHERE ms.examination_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM student_subject_enrollments sse
          WHERE sse.student_id = m.student_id
            AND sse.subject_id = m.subject_id
            AND sse.academic_year_id = ms.academic_year_id
            AND sse.enrollment_status = 'confirmed'
        )
    `).get(examinationId) as { cnt: number };

    if (Number(unconfirmedMarkCheck?.cnt || 0) > 0) {
      const err = new Error(
        `Publication declined: Examination contains ${unconfirmedMarkCheck.cnt} marks for students without a confirmed subject enrolment record.`
      );
      (err as any).statusCode = 400;
      (err as any).code = 'UNVERIFIED_ENROLLMENTS';
      throw err;
    }

    // 8. Roster & Student Assessment Reconciliation
    // Check that all enrolled participating students have confirmed subject enrollments
    // Invariant: Decline official results if enrolments are unverified or any student is NOT_ASSESSED
    const distinctClassIds = Array.from(new Set(sheets.map(s => s.class_id)));
    const classCalculationResults: any[] = [];
    let totalConfirmedStudents = 0;

    for (const classId of distinctClassIds) {
      const classRes = calculateClassResults(examinationId, classId, resolvedPolicy);
      if (!classRes.isOfficialEligible) {
        if (classRes.unverifiedStudentCount > 0) {
          const err = new Error(
            `Publication declined: Class ${classId} contains ${classRes.unverifiedStudentCount} unverified student subject enrollments or unconfirmed marks. All subject enrollments must be confirmed prior to publication.`
          );
          (err as any).statusCode = 400;
          (err as any).code = 'UNVERIFIED_ENROLLMENTS';
          throw err;
        }
        if (classRes.unassessedStudentCount > 0) {
          const err = new Error(
            `Publication declined: Class ${classId} contains ${classRes.unassessedStudentCount} unassessed student marks. All student entries must be fully assessed.`
          );
          (err as any).statusCode = 400;
          (err as any).code = 'UNASSESSED_STUDENT';
          throw err;
        }
      }
      classCalculationResults.push(classRes);
      totalConfirmedStudents += classRes.students.length;
    }

    const nextPubVersion = (exam.publication_version || 0) + 1;
    const publishedAt = new Date().toISOString();

    // Compile comprehensive immutable publication snapshot
    const publicationSnapshot = {
      examinationId,
      examinationName: exam.name,
      term: exam.term,
      academicYearId: exam.academic_year_id,
      publicationVersion: nextPubVersion,
      publishedAt,
      publishedByUserId: user.id,
      policy: {
        id: resolvedPolicy.id,
        policyCode: resolvedPolicy.policy_code,
        title: resolvedPolicy.title,
        version: resolvedPolicy.version,
        gradingScale: resolvedPolicy.gradingScale,
        rankingRules: resolvedPolicy.rankingRules
      },
      classes: classCalculationResults,
      sheetSnapshots: sheets.map(s => ({
        sheetId: s.id,
        classId: s.class_id,
        subjectId: s.subject_id,
        revision: s.revision,
        approvedByUserId: s.approved_by_user_id,
        approvedAt: s.approved_at
      }))
    };

    const snapshotJson = JSON.stringify(publicationSnapshot);
    const auditHash = crypto.createHash('sha256').update(snapshotJson).digest('hex');

    // Insert into examination_publications
    db.prepare(`
      INSERT INTO examination_publications (
        examination_id, publication_version, policy_profile_id, policy_version,
        published_by_user_id, published_at, publication_snapshot_json, audit_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      examinationId,
      nextPubVersion,
      resolvedPolicy.id,
      resolvedPolicy.version,
      user.id,
      publishedAt,
      snapshotJson,
      auditHash
    );

    // Update examination table: ensure examinations.status, is_published, and report visibility cannot disagree
    db.prepare(`
      UPDATE examinations SET
        is_published = 1,
        status = 'published',
        published_at = ?,
        published_by_user_id = ?,
        publication_version = ?,
        assessment_policy_id = ?
      WHERE id = ?
    `).run(publishedAt, user.id, nextPubVersion, resolvedPolicy.id, examinationId);

    // Update all applicable sheets: transition status to 'published', bump revision
    for (const sheet of sheets) {
      const newSheetRevision = sheet.revision + 1;
      db.prepare(`
        UPDATE marks_sheets SET
          status = 'published',
          revision = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(newSheetRevision, sheet.id);

      // Record point-in-time published sheet revision snapshot
      const sheetMarks = db.prepare(`
        SELECT m.student_id, m.score, m.max_score, m.assessment_status, m.grade_letter, m.status
        FROM marks m
        WHERE m.sheet_id = ?
      `).all(sheet.id);

      db.prepare(`
        INSERT INTO marks_sheet_revisions (
          sheet_id, revision, status, saved_by_user_id, marks_payload_json, created_at
        ) VALUES (?, ?, 'published', ?, ?, datetime('now'))
      `).run(sheet.id, newSheetRevision, user.id, JSON.stringify(sheetMarks));
    }

    // Update all marks records for this examination to 'published'
    db.prepare(`
      UPDATE marks SET
        status = 'published',
        updated_at = datetime('now')
      WHERE examination_id = ?
    `).run(examinationId);

    // Audit trail logging
    db.prepare(`
      INSERT INTO audit_logs (
        user_id, username, action, entity_type, entity_id, details, ip_address, timestamp
      ) VALUES (?, ?, 'EXAMINATION_PUBLISH', 'examinations', ?, ?, ?, datetime('now'))
    `).run(
      user.id,
      user.username,
      String(examinationId),
      JSON.stringify({
        publicationVersion: nextPubVersion,
        policyProfileId: resolvedPolicy.id,
        policyVersion: resolvedPolicy.version,
        sheetsCount: sheets.length,
        studentsCount: totalConfirmedStudents,
        auditHash
      }),
      ipAddress
    );

    db.exec('COMMIT;');

    return {
      success: true,
      examinationId,
      publicationVersion: nextPubVersion,
      policyProfileId: resolvedPolicy.id,
      policyVersion: resolvedPolicy.version,
      publishedAt,
      publishedByUserId: user.id,
      sheetsPublishedCount: sheets.length,
      studentsPublishedCount: totalConfirmedStudents,
      auditHash
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
