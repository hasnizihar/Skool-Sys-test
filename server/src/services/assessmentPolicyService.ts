import { db } from '../db/database.js';
import { AuthUser } from '../middleware/auth.js';
import {
  GradeBand,
  doesBandCoverGrade,
  getActiveStaffAuthorizations
} from './academicAuthorizationService.js';

export interface GradingScaleItem {
  grade: string;
  minPercentage: number;
  label?: string;
}

export interface AbsenceRules {
  absentHandling: 'zero' | 'exclude' | 'provisional_fail';
  medicalHandling: 'exclude' | 'deferred';
  exemptHandling: 'exclude';
}

export interface RankingRules {
  rankingMethod: 'competition'; // Standard competition ranking: "1224"
  tieHandling: 'equal_rank_skip_next';
  minimumSubjectsRequired: number;
}

export interface AssessmentPolicyProfile {
  id: number;
  academic_year_id: number;
  grade_band: GradeBand;
  policy_code: string;
  title: string;
  version: number;
  grading_scale_json: string;
  absence_rules_json: string;
  ranking_rules_json: string;
  subject_weights_json?: string;
  correction_window_days: number;
  is_approved_by_school: number;
  approved_by_user_id: number | null;
  approved_at: string | null;
  created_by_user_id: number | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
}

export const PROVISIONAL_DEFAULT_GRADING_SCALE: GradingScaleItem[] = [
  { grade: 'A', minPercentage: 75.0, label: 'Distinction' },
  { grade: 'B', minPercentage: 65.0, label: 'Very Good Pass' },
  { grade: 'C', minPercentage: 50.0, label: 'Credit Pass' },
  { grade: 'S', minPercentage: 35.0, label: 'Ordinary Pass' },
  { grade: 'F', minPercentage: 0.0, label: 'Fail' }
];

export const PROVISIONAL_DEFAULT_ABSENCE_RULES: AbsenceRules = {
  absentHandling: 'zero',
  medicalHandling: 'exclude',
  exemptHandling: 'exclude'
};

export const PROVISIONAL_DEFAULT_RANKING_RULES: RankingRules = {
  rankingMethod: 'competition',
  tieHandling: 'equal_rank_skip_next',
  minimumSubjectsRequired: 1
};

/**
 * Creates or retrieves a provisional default policy profile for a given academic year and grade band.
 * All default policies are initialized as PROVISIONAL (is_approved_by_school = 0) pending formal KCC sign-off.
 */
export function getOrCreateDefaultProvisionalPolicy(
  academicYearId: number,
  gradeBand: GradeBand,
  creatorUserId?: number
): AssessmentPolicyProfile {
  const existing = db.prepare(`
    SELECT * FROM assessment_policy_profiles
    WHERE academic_year_id = ? AND grade_band = ?
    ORDER BY version DESC, id DESC
    LIMIT 1
  `).get(academicYearId, gradeBand) as unknown as AssessmentPolicyProfile | undefined;

  if (existing) {
    return existing;
  }

  const policyCode = `POL-${academicYearId}-${gradeBand.toUpperCase()}-V1`;
  const title = `Provisional Assessment Policy (${gradeBand} - Academic Year ${academicYearId})`;

  const stmt = db.prepare(`
    INSERT INTO assessment_policy_profiles (
      academic_year_id, grade_band, policy_code, title, version,
      grading_scale_json, absence_rules_json, ranking_rules_json, subject_weights_json,
      correction_window_days, is_approved_by_school, created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, '{}', 21, 0, ?, datetime('now'))
  `);

  const result = stmt.run(
    academicYearId,
    gradeBand,
    policyCode,
    title,
    JSON.stringify(PROVISIONAL_DEFAULT_GRADING_SCALE),
    JSON.stringify(PROVISIONAL_DEFAULT_ABSENCE_RULES),
    JSON.stringify(PROVISIONAL_DEFAULT_RANKING_RULES),
    creatorUserId || null
  );

  return (db.prepare('SELECT * FROM assessment_policy_profiles WHERE id = ?').get(Number(result.lastInsertRowid)) as unknown) as AssessmentPolicyProfile;
}

/**
 * Retrieves a policy profile by ID, augmenting with provisional status indicators.
 */
export function getAssessmentPolicyProfile(policyId: number): any {
  const policy = (db.prepare('SELECT * FROM assessment_policy_profiles WHERE id = ?').get(policyId) as unknown) as AssessmentPolicyProfile | undefined;
  if (!policy) {
    const err = new Error('Assessment policy profile not found.');
    (err as any).statusCode = 404;
    (err as any).code = 'POLICY_NOT_FOUND';
    throw err;
  }

  let gradingScale: GradingScaleItem[];
  let absenceRules: AbsenceRules;
  let rankingRules: RankingRules;
  let subjectWeights: Record<string, number>;

  try { gradingScale = JSON.parse(policy.grading_scale_json); } catch { gradingScale = PROVISIONAL_DEFAULT_GRADING_SCALE; }
  try { absenceRules = JSON.parse(policy.absence_rules_json); } catch { absenceRules = PROVISIONAL_DEFAULT_ABSENCE_RULES; }
  try { rankingRules = JSON.parse(policy.ranking_rules_json); } catch { rankingRules = PROVISIONAL_DEFAULT_RANKING_RULES; }
  try { subjectWeights = JSON.parse(policy.subject_weights_json || '{}'); } catch { subjectWeights = {}; }

  return {
    ...policy,
    gradingScale,
    absenceRules,
    rankingRules,
    subjectWeights,
    isProvisional: policy.is_approved_by_school !== 1,
    approvalStatus: policy.is_approved_by_school === 1 ? 'approved' : 'provisional'
  };
}

/**
 * Creates a new versioned policy profile. Explicitly requires provenance.
 * Initial state is strictly provisional until approved by school leadership.
 */
export function createAssessmentPolicyProfile(params: {
  academicYearId: number;
  gradeBand: GradeBand;
  policyCode: string;
  title: string;
  gradingScale: GradingScaleItem[];
  absenceRules?: AbsenceRules;
  rankingRules?: RankingRules;
  subjectWeights?: Record<string, number>;
  correctionWindowDays?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  user: AuthUser;
}): { success: boolean; policy: any } {
  const {
    academicYearId,
    gradeBand,
    policyCode,
    title,
    gradingScale,
    absenceRules = PROVISIONAL_DEFAULT_ABSENCE_RULES,
    rankingRules = PROVISIONAL_DEFAULT_RANKING_RULES,
    subjectWeights = {},
    correctionWindowDays = 21,
    effectiveFrom = null,
    effectiveTo = null,
    user
  } = params;

  if (!academicYearId || !gradeBand || !policyCode || !title) {
    const err = new Error('Missing required fields for assessment policy profile.');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_POLICY_INPUT';
    throw err;
  }

  // Active user check
  const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as { id: number; is_active: number } | undefined;
  if (!activeUser || activeUser.is_active !== 1) {
    const err = new Error('User account is deactivated or invalid.');
    (err as any).statusCode = 403;
    (err as any).code = 'USER_DEACTIVATED';
    throw err;
  }

  // Scoped academic authorization check:
  // Requires either active academic leadership appointment or teaching assignment in the specified academic year
  const activeAuths = getActiveStaffAuthorizations(user.id, academicYearId);
  const hasLeadershipAuth = activeAuths.some(a =>
    ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role) &&
    (a.grade_band === 'all' || a.grade_band === gradeBand)
  );

  const isAssignedTeacherInYear = db.prepare(`
    SELECT COUNT(*) as cnt FROM teacher_assignments WHERE teacher_id = ? AND academic_year_id = ?
  `).get(user.id, academicYearId) as { cnt: number };

  if (!hasLeadershipAuth && Number(isAssignedTeacherInYear?.cnt || 0) === 0) {
    const err = new Error(
      'Access denied: Creating assessment policy profiles requires an active academic appointment or teaching assignment in the specified academic year.'
    );
    (err as any).statusCode = 403;
    (err as any).code = 'INSUFFICIENT_AUTHORIZATION';
    throw err;
  }

  if (!['junior_6_9', 'ol_10_11', 'al_12_13'].includes(gradeBand)) {
    const err = new Error(`Invalid grade band '${gradeBand}'. Must be junior_6_9, ol_10_11, or al_12_13.`);
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_GRADE_BAND';
    throw err;
  }

  // G4R-08: Validate policy configuration inputs
  if (!Array.isArray(gradingScale) || gradingScale.length === 0) {
    const err = new Error('Grading scale must be a non-empty array of threshold bands.');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_POLICY_CONFIGURATION';
    throw err;
  }

  const seenGrades = new Set<string>();
  const seenPercentages = new Set<number>();
  let hasZeroMin = false;

  for (const item of gradingScale) {
    if (!item.grade || typeof item.grade !== 'string' || !item.grade.trim()) {
      const err = new Error('Every grading scale item must define a non-empty grade letter/code.');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
    const g = item.grade.trim();
    if (seenGrades.has(g)) {
      const err = new Error(`Duplicate grade '${g}' found in grading scale.`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
    seenGrades.add(g);

    if (typeof item.minPercentage !== 'number' || !isFinite(item.minPercentage) || item.minPercentage < 0 || item.minPercentage > 100) {
      const err = new Error(`Grading scale item '${g}' has invalid minPercentage '${item.minPercentage}'. Must be between 0 and 100.`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }

    if (seenPercentages.has(item.minPercentage)) {
      const err = new Error(`Duplicate minPercentage '${item.minPercentage}' found in grading scale.`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
    seenPercentages.add(item.minPercentage);

    if (item.minPercentage === 0) {
      hasZeroMin = true;
    }
  }

  if (!hasZeroMin) {
    const err = new Error('Grading scale must define a lowest band with minPercentage = 0.');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_POLICY_CONFIGURATION';
    throw err;
  }

  // G4S-04: Validate ranking rules if provided
  if (rankingRules) {
    if (rankingRules.rankingMethod && rankingRules.rankingMethod !== 'competition') {
      const err = new Error(`Unsupported rankingMethod '${rankingRules.rankingMethod}'. Only 'competition' ranking is supported.`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
    if (rankingRules.tieHandling && rankingRules.tieHandling !== 'equal_rank_skip_next') {
      const err = new Error(`Unsupported tieHandling '${rankingRules.tieHandling}'. Only 'equal_rank_skip_next' tie handling is supported.`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
    if (rankingRules.minimumSubjectsRequired !== undefined && rankingRules.minimumSubjectsRequired !== null) {
      if (!Number.isInteger(rankingRules.minimumSubjectsRequired) || rankingRules.minimumSubjectsRequired < 1) {
        const err = new Error(`minimumSubjectsRequired must be a positive integer. Received: ${rankingRules.minimumSubjectsRequired}`);
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_POLICY_CONFIGURATION';
        throw err;
      }
    }
  }

  // G4S-04: Validate absence rules if provided
  if (absenceRules) {
    if (absenceRules.absentHandling && !['zero', 'exclude', 'provisional_fail'].includes(absenceRules.absentHandling)) {
      const err = new Error(`Invalid absentHandling '${absenceRules.absentHandling}'. Must be 'zero', 'exclude', or 'provisional_fail'.`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
    if (absenceRules.medicalHandling && !['exclude', 'deferred'].includes(absenceRules.medicalHandling)) {
      const err = new Error(`Invalid medicalHandling '${absenceRules.medicalHandling}'. Must be 'exclude' or 'deferred'.`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
  }

  // Validate subject weights if provided
  if (subjectWeights && typeof subjectWeights === 'object') {
    for (const [key, val] of Object.entries(subjectWeights)) {
      if (typeof val !== 'number' || !isFinite(val) || val <= 0) {
        const err = new Error(`Subject weight for '${key}' must be a finite positive number. Received: ${val}`);
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_POLICY_CONFIGURATION';
        throw err;
      }
    }
  }

  // Validate correction window days
  if (correctionWindowDays !== undefined && correctionWindowDays !== null) {
    if (!Number.isInteger(correctionWindowDays) || correctionWindowDays < 1 || correctionWindowDays > 365) {
      const err = new Error(`Correction window days must be an integer between 1 and 365. Received: ${correctionWindowDays}`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
  }

  // Validate effective dates
  if (effectiveFrom && effectiveTo) {
    const fromTime = new Date(effectiveFrom).getTime();
    const toTime = new Date(effectiveTo).getTime();
    if (isNaN(fromTime) || isNaN(toTime)) {
      const err = new Error('effectiveFrom and effectiveTo must be valid date strings.');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
    if (fromTime > toTime) {
      const err = new Error(`effectiveFrom (${effectiveFrom}) cannot be later than effectiveTo (${effectiveTo}).`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_POLICY_CONFIGURATION';
      throw err;
    }
  }

  // Determine version number
  const latest = db.prepare(`
    SELECT MAX(version) as max_ver FROM assessment_policy_profiles
    WHERE academic_year_id = ? AND grade_band = ?
  `).get(academicYearId, gradeBand) as { max_ver: number | null };
  const nextVersion = (latest?.max_ver || 0) + 1;

  const stmt = db.prepare(`
    INSERT INTO assessment_policy_profiles (
      academic_year_id, grade_band, policy_code, title, version,
      grading_scale_json, absence_rules_json, ranking_rules_json, subject_weights_json,
      correction_window_days, is_approved_by_school, created_by_user_id,
      effective_from, effective_to, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'))
  `);

  const result = stmt.run(
    academicYearId,
    gradeBand,
    policyCode.trim(),
    title.trim(),
    nextVersion,
    JSON.stringify(gradingScale),
    JSON.stringify(absenceRules || PROVISIONAL_DEFAULT_ABSENCE_RULES),
    JSON.stringify(rankingRules || PROVISIONAL_DEFAULT_RANKING_RULES),
    JSON.stringify(subjectWeights || {}),
    correctionWindowDays || 21,
    user.id,
    effectiveFrom ?? null,
    effectiveTo ?? null
  );

  return {
    success: true,
    policy: getAssessmentPolicyProfile(Number(result.lastInsertRowid))
  };
}

/**
 * Formally approves an assessment policy profile.
 * STRICT INVARIANT: Requires active Principal or Vice Principal Academic appointment
 * covering the target academic year and grade band (or all).
 * Plain admin role without active academic appointment is strictly denied.
 */
export function approveAssessmentPolicyProfile(policyId: number, user: AuthUser): { success: boolean; policy: any } {
  const policy = (db.prepare('SELECT * FROM assessment_policy_profiles WHERE id = ?').get(policyId) as unknown) as AssessmentPolicyProfile | undefined;
  if (!policy) {
    const err = new Error('Assessment policy profile not found.');
    (err as any).statusCode = 404;
    (err as any).code = 'POLICY_NOT_FOUND';
    throw err;
  }

  // Active user check
  const activeUser = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(user.id) as { id: number; is_active: number } | undefined;
  if (!activeUser || activeUser.is_active !== 1) {
    const err = new Error('User account is deactivated or invalid.');
    (err as any).statusCode = 403;
    (err as any).code = 'USER_DEACTIVATED';
    throw err;
  }

  // Scoped authorization check: only active Principal or VP Academic covering the year and band
  const activeAuths = getActiveStaffAuthorizations(user.id, policy.academic_year_id);
  const isAuthorized = activeAuths.some(a =>
    ['principal', 'vice_principal_academic'].includes(a.auth_role) &&
    (a.grade_band === 'all' || a.grade_band === policy.grade_band)
  );

  if (!isAuthorized) {
    const err = new Error(
      'Access denied: Approving an official school assessment policy requires an active Principal or Vice Principal Academic appointment covering this academic year and grade band.'
    );
    (err as any).statusCode = 403;
    (err as any).code = 'INSUFFICIENT_AUTHORIZATION';
    throw err;
  }

  db.prepare(`
    UPDATE assessment_policy_profiles SET
      is_approved_by_school = 1,
      approved_by_user_id = ?,
      approved_at = datetime('now')
    WHERE id = ?
  `).run(user.id, policyId);

  return {
    success: true,
    policy: getAssessmentPolicyProfile(policyId)
  };
}

/**
 * Normalizes and calculates a student subject score and grade according to a policy profile.
 */
export function calculateSubjectGrade(
  score: number | null,
  maxScore: number = 100.0,
  assessmentStatus: string,
  policy?: AssessmentPolicyProfile | null
): {
  gradeLetter: string;
  normalizedPercentage: number | null;
  assessmentStatus: string;
} {
  if (assessmentStatus === 'ABSENT') {
    return { gradeLetter: 'AB', normalizedPercentage: null, assessmentStatus: 'ABSENT' };
  }
  if (assessmentStatus === 'EXEMPT') {
    return { gradeLetter: 'EX', normalizedPercentage: null, assessmentStatus: 'EXEMPT' };
  }
  if (assessmentStatus === 'MEDICAL') {
    return { gradeLetter: 'MED', normalizedPercentage: null, assessmentStatus: 'MEDICAL' };
  }
  if (assessmentStatus === 'NOT_ASSESSED' || score === null || score === undefined) {
    return { gradeLetter: '-', normalizedPercentage: null, assessmentStatus: 'NOT_ASSESSED' };
  }

  if (maxScore <= 0) {
    return { gradeLetter: '-', normalizedPercentage: null, assessmentStatus: 'INVALID_MAX_SCORE' };
  }

  const percentage = Math.round(((score / maxScore) * 100.0) * 10) / 10;

  // Evaluate grade letter against policy scale
  let scale: GradingScaleItem[] = PROVISIONAL_DEFAULT_GRADING_SCALE;
  if (policy?.grading_scale_json) {
    try {
      scale = typeof policy.grading_scale_json === 'string'
        ? JSON.parse(policy.grading_scale_json)
        : policy.grading_scale_json;
    } catch {}
  }

  // Sort scale descending by minPercentage
  const sortedScale = [...scale].sort((a, b) => b.minPercentage - a.minPercentage);
  let assignedGrade = 'F';

  for (const band of sortedScale) {
    if (percentage >= band.minPercentage) {
      assignedGrade = band.grade;
      break;
    }
  }

  return {
    gradeLetter: assignedGrade,
    normalizedPercentage: percentage,
    assessmentStatus: 'PRESENT'
  };
}

/**
 * Calculates aggregated class results, student averages, pass rates, and deterministic competition ranks.
 * Invariant: If unverified student-subject enrolments or unassessed marks exist and official results are required,
 * this function declines official results by setting isOfficialEligible: false.
 */
export function calculateClassResults(
  examinationId: number,
  classId: number,
  policyProfile?: AssessmentPolicyProfile | null
): {
  classId: number;
  examinationId: number;
  isOfficialEligible: boolean;
  unverifiedStudentCount: number;
  unassessedStudentCount: number;
  students: {
    studentId: number;
    admissionNo: string;
    fullName: string;
    rollNumber: number | null;
    totalScore: number;
    averagePercentage: number | null;
    gradedSubjectsCount: number;
    passedSubjectsCount: number;
    absentCount: number;
    exemptCount: number;
    medicalCount: number;
    rank: number | null;
    subjectGrades: Record<number, {
      score: number | null;
      maxScore: number;
      percentage: number | null;
      gradeLetter: string;
      assessmentStatus: string;
    }>;
  }[];
} {
  const classInfo = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId) as any;
  if (!classInfo) {
    throw new Error(`Class ${classId} not found.`);
  }

  // 1. Resolve examination info and policy profile
  const examInfo = db.prepare('SELECT assessment_policy_id, academic_year_id FROM examinations WHERE id = ?').get(examinationId) as any;
  const examAcademicYearId = examInfo?.academic_year_id || classInfo?.academic_year_id;

  let policy = policyProfile;
  if (!policy && examInfo?.assessment_policy_id) {
    try { policy = getAssessmentPolicyProfile(examInfo.assessment_policy_id); } catch {}
  }

  let absenceRules: AbsenceRules = PROVISIONAL_DEFAULT_ABSENCE_RULES;
  let rankingRules: RankingRules = PROVISIONAL_DEFAULT_RANKING_RULES;
  let subjectWeights: Record<string, number> = {};

  if (policy) {
    if (policy.absence_rules_json) {
      try {
        absenceRules = typeof policy.absence_rules_json === 'string'
          ? JSON.parse(policy.absence_rules_json)
          : policy.absence_rules_json;
      } catch {
        absenceRules = PROVISIONAL_DEFAULT_ABSENCE_RULES;
      }
    }
    if (policy.ranking_rules_json) {
      try {
        rankingRules = typeof policy.ranking_rules_json === 'string'
          ? JSON.parse(policy.ranking_rules_json)
          : policy.ranking_rules_json;
      } catch {
        rankingRules = PROVISIONAL_DEFAULT_RANKING_RULES;
      }
    }
    if (policy.subject_weights_json) {
      try {
        subjectWeights = typeof policy.subject_weights_json === 'string'
          ? JSON.parse(policy.subject_weights_json)
          : policy.subject_weights_json;
      } catch {
        subjectWeights = {};
      }
    }
  }

  // G4S-04: Reject unsupported policy configurations
  if (rankingRules.rankingMethod && rankingRules.rankingMethod !== 'competition') {
    const err = new Error(`Unsupported rankingMethod '${rankingRules.rankingMethod}'. Only 'competition' ranking is currently supported.`);
    (err as any).statusCode = 400;
    (err as any).code = 'UNSUPPORTED_POLICY_CONFIGURATION';
    throw err;
  }
  if (rankingRules.tieHandling && rankingRules.tieHandling !== 'equal_rank_skip_next') {
    const err = new Error(`Unsupported tieHandling '${rankingRules.tieHandling}'. Only 'equal_rank_skip_next' tie handling is currently supported.`);
    (err as any).statusCode = 400;
    (err as any).code = 'UNSUPPORTED_POLICY_CONFIGURATION';
    throw err;
  }
  if (absenceRules.absentHandling && !['zero', 'exclude', 'provisional_fail'].includes(absenceRules.absentHandling)) {
    const err = new Error(`Unsupported absentHandling '${absenceRules.absentHandling}'. Must be 'zero', 'exclude', or 'provisional_fail'.`);
    (err as any).statusCode = 400;
    (err as any).code = 'UNSUPPORTED_POLICY_CONFIGURATION';
    throw err;
  }

  // 2. Get confirmed and active enrollments for this class
  const enrollments = db.prepare(`
    SELECT s.id as student_id, s.admission_no, s.full_name, e.roll_number
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    WHERE e.class_id = ? AND e.status = 'enrolled'
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(classId) as any[];

  // 3. FIX 01: Get examined class subjects strictly from approved examination_schedules
  // Never infer examination coverage solely from marks sheets or marks that happen to exist.
  const classSubjects = db.prepare(`
    SELECT DISTINCT es.subject_id, s.code as subject_code, s.name as subject_name
    FROM examination_schedules es
    JOIN subjects s ON es.subject_id = s.id
    WHERE es.examination_id = ? AND es.class_id = ? AND (es.status = 'approved' OR es.status IS NULL)
  `).all(examinationId, classId) as { subject_id: number; subject_code: string; subject_name: string }[];

  const subjectIds = classSubjects.map(cs => cs.subject_id);
  const subjectCodeMap = new Map<number, string>(classSubjects.map(cs => [cs.subject_id, cs.subject_code]));

  // 4. G4S-01: Scoped enrolment verification
  let unverifiedCount = 0;

  // Positive confirmed enrollment verification across ALL marks in this exam/class
  // If ANY mark exists for a student who lacks a confirmed enrollment in that subject, flag as unverified!
  const unconfirmedMarkCheck = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM marks m
    WHERE m.examination_id = ? AND m.class_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM student_subject_enrollments sse
        WHERE sse.student_id = m.student_id
          AND sse.subject_id = m.subject_id
          AND sse.academic_year_id = ?
          AND sse.enrollment_status = 'confirmed'
      )
  `).get(examinationId, classId, examAcademicYearId) as { cnt: number };

  unverifiedCount += Number(unconfirmedMarkCheck?.cnt || 0);

  // Check provisional enrolments ONLY for applicable examined subjects and participating students.
  // Unrelated subjects outside this examination or unexamined electives NEVER block publication.
  if (subjectIds.length > 0) {
    const placeholders = subjectIds.map(() => '?').join(',');
    const provisionalExaminedCheck = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM student_subject_enrollments sse
      JOIN enrollments e ON sse.student_id = e.student_id AND sse.academic_year_id = e.academic_year_id
      JOIN subjects s ON sse.subject_id = s.id
      WHERE e.class_id = ? AND e.status = 'enrolled'
        AND sse.enrollment_status = 'provisional_unverified'
        AND sse.subject_id IN (${placeholders})
        AND (
          s.category = 'Core'
          OR sse.enrollment_category = 'core_compulsory'
          OR EXISTS (
            SELECT 1 FROM marks m
            WHERE m.examination_id = ? AND m.class_id = ?
              AND m.student_id = sse.student_id AND m.subject_id = sse.subject_id
          )
        )
    `).get(classId, ...subjectIds, examinationId, classId) as { cnt: number };

    unverifiedCount += Number(provisionalExaminedCheck?.cnt || 0);
  }

  // 5. Gather marks for all students in this class for this exam
  const studentResults: any[] = [];
  let unassessedCount = 0;

  for (const stu of enrollments) {
    const studentMarks = db.prepare(`
      SELECT m.subject_id, m.score, m.max_score, m.assessment_status
      FROM marks m
      WHERE m.student_id = ? AND m.examination_id = ? AND m.class_id = ?
    `).all(stu.student_id, examinationId, classId) as any[];

    const markMap: Record<number, any> = {};
    studentMarks.forEach(m => { markMap[m.subject_id] = m; });

    let totalScore = 0;
    let weightedPercentageSum = 0;
    let totalWeight = 0;
    let gradedCount = 0;
    let passedCount = 0;
    let absentCount = 0;
    let exemptCount = 0;
    let medicalCount = 0;
    let isDeferred = false;

    const subjectGrades: Record<number, any> = {};

    for (const subId of subjectIds) {
      // Positive confirmed check: Check if student is actively and positively confirmed for this subject
      const subEnrollment = db.prepare(`
        SELECT enrollment_status FROM student_subject_enrollments
        WHERE student_id = ? AND subject_id = ? AND academic_year_id = ?
      `).get(stu.student_id, subId, examAcademicYearId) as { enrollment_status: string } | undefined;

      // If no confirmed enrollment or dropped/transferred, this student does NOT participate in this subject
      // (e.g. taking alternative elective such as Tamil instead of Sinhala)
      if (!subEnrollment || subEnrollment.enrollment_status !== 'confirmed') {
        // If an illegal mark exists despite lack of confirmed enrollment:
        if (markMap[subId]) {
          unverifiedCount++;
        }
        continue; // Excluded correctly without penalizing as unassessed
      }

      // Student is confirmed participating in this subject!
      const m = markMap[subId];
      if (!m || m.assessment_status === 'NOT_ASSESSED') {
        unassessedCount++;
        subjectGrades[subId] = {
          score: null,
          maxScore: 100.0,
          percentage: null,
          gradeLetter: '-',
          assessmentStatus: 'NOT_ASSESSED'
        };
        continue;
      }

      // Determine subject weight
      const subCode = subjectCodeMap.get(subId) || '';
      let weight = 1.0;
      if (subjectWeights[String(subId)] !== undefined) {
        weight = Number(subjectWeights[String(subId)]);
      } else if (subCode && subjectWeights[subCode] !== undefined) {
        weight = Number(subjectWeights[subCode]);
      }
      if (!isFinite(weight) || weight <= 0) {
        weight = 1.0;
      }

      const gradeRes = calculateSubjectGrade(m.score, m.max_score || 100.0, m.assessment_status, policy);
      subjectGrades[subId] = {
        score: m.score,
        maxScore: m.max_score || 100.0,
        percentage: gradeRes.normalizedPercentage,
        gradeLetter: gradeRes.gradeLetter,
        assessmentStatus: m.assessment_status
      };

      if (m.assessment_status === 'PRESENT' && gradeRes.normalizedPercentage !== null) {
        totalScore += Number(m.score);
        weightedPercentageSum += (gradeRes.normalizedPercentage * weight);
        totalWeight += weight;
        gradedCount++;
        if (gradeRes.normalizedPercentage >= 35.0) passedCount++;
      } else if (m.assessment_status === 'ABSENT') {
        absentCount++;
        if (absenceRules.absentHandling === 'zero' || absenceRules.absentHandling === 'provisional_fail') {
          totalWeight += weight; // Treated as 0% contributing with subject weight
        } else if (absenceRules.absentHandling === 'exclude') {
          // Excluded from total weight
        }
      } else if (m.assessment_status === 'EXEMPT') {
        exemptCount++;
        // Excluded from total weight
      } else if (m.assessment_status === 'MEDICAL') {
        medicalCount++;
        if (absenceRules.medicalHandling === 'exclude') {
          // Excluded from total weight
        } else if (absenceRules.medicalHandling === 'deferred') {
          isDeferred = true;
        }
      }
    }

    const averagePercentage = totalWeight > 0 ? Math.round((weightedPercentageSum / totalWeight) * 100) / 100 : null;

    studentResults.push({
      studentId: stu.student_id,
      admissionNo: stu.admission_no,
      fullName: stu.full_name,
      rollNumber: stu.roll_number,
      totalScore: Math.round(totalScore * 10) / 10,
      averagePercentage,
      gradedSubjectsCount: gradedCount,
      passedSubjectsCount: passedCount,
      absentCount,
      exemptCount,
      medicalCount,
      isDeferred,
      rank: null,
      subjectGrades
    });
  }

  // 6. G4S-04: Compute deterministic standard competition ranking ("1224" method)
  // Respect configured minimum subject requirements before assigning official rankings
  const minSubjects = typeof rankingRules.minimumSubjectsRequired === 'number'
    ? rankingRules.minimumSubjectsRequired
    : 1;

  const eligibleForRank = studentResults.filter(s => {
    if (s.averagePercentage === null) return false;
    if (s.isDeferred) return false;
    if (absenceRules.absentHandling === 'provisional_fail' && s.absentCount > 0) return false;
    const assessedCount = s.gradedSubjectsCount + (absenceRules.absentHandling === 'zero' ? s.absentCount : 0);
    return assessedCount >= minSubjects;
  });

  // Sort primarily by policy-weighted averagePercentage descending ONLY.
  // Secondary sort by rollNumber is solely for deterministic array ordering, NEVER breaking equal-rank ties.
  eligibleForRank.sort((a, b) => {
    const diff = (b.averagePercentage ?? -1) - (a.averagePercentage ?? -1);
    if (Math.abs(diff) > 0.0001) return diff;
    return (a.rollNumber || 9999) - (b.rollNumber || 9999);
  });

  for (let i = 0; i < eligibleForRank.length; i++) {
    if (i === 0) {
      eligibleForRank[0].rank = 1;
    } else {
      const prev = eligibleForRank[i - 1];
      const curr = eligibleForRank[i];
      // Approved tie handling: equal average percentage produces equal rank!
      if (Math.abs((curr.averagePercentage ?? 0) - (prev.averagePercentage ?? 0)) < 0.0001) {
        curr.rank = prev.rank;
      } else {
        curr.rank = i + 1; // Competition rank skips next
      }
    }
  }

  const isOfficialEligible = classSubjects.length > 0 && unverifiedCount === 0 && unassessedCount === 0;

  return {
    classId,
    examinationId,
    isOfficialEligible,
    unverifiedStudentCount: unverifiedCount,
    unassessedStudentCount: unassessedCount,
    students: studentResults
  };
}
