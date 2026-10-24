import { DatabaseSync } from 'node:sqlite';

export const TARGET_SCHEMA_VERSION = 5;

export interface Migration005Result {
  applied: boolean;
  version: number;
  migratedSheets: number;
  migratedMarks: number;
  quarantinedMarks: number;
}

/**
 * Migration 005: Examination Integrity, Canonical Marks Schema & Audit Trail
 *
 * Implements a 12-step atomic SQLite table rebuild to install genuine table-level
 * score and status constraints, generated virtual columns, lossless legacy quarantine,
 * and foundations for student subject eligibility and staff authorizations.
 */
export function runMigration005(db: DatabaseSync): Migration005Result {
  // 1. Inspect current schema version
  const versionRow = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const currentVersion = Number(versionRow?.user_version || 0);

  // Check if target tables and columns already exist to detect schema drift
  const sheetsTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'marks_sheets';"
  ).get() as { cnt: number };
  const hasSheetsTable = Number(sheetsTableCheck?.cnt || 0) > 0;

  const marksSheetIdCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM pragma_table_info('marks') WHERE name = 'sheet_id';"
  ).get() as { cnt: number };
  const hasSheetIdCol = Number(marksSheetIdCheck?.cnt || 0) > 0;

  const termsTableCheck = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'academic_terms';"
  ).get() as { cnt: number };
  const hasTermsTable = Number(termsTableCheck?.cnt || 0) > 0;

  if (currentVersion >= TARGET_SCHEMA_VERSION && hasSheetsTable && hasSheetIdCol && hasTermsTable) {
    return {
      applied: false,
      version: currentVersion,
      migratedSheets: 0,
      migratedMarks: 0,
      quarantinedMarks: 0
    };
  }

  // 2. Query initial foreign key state
  const initialFkRow = db.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };
  const initialFk = Number(initialFkRow?.foreign_keys || 0);

  // 3. Begin atomic 12-step rebuild
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN IMMEDIATE TRANSACTION;');

  try {
    // Step A: Create academic_terms table for truthful school-term date bounds
    db.exec(`
      CREATE TABLE IF NOT EXISTS academic_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
        term_number INTEGER NOT NULL CHECK(term_number IN (1, 2, 3)),
        name TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        is_verified INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0, 1)),
        UNIQUE(academic_year_id, term_number)
      );
    `);

    // Ensure all existing academic years have default provisional term placeholders WITHOUT fabricating dates
    const existingYears = db.prepare('SELECT id, name FROM academic_years').all() as any[];
    const insertTermStmt = db.prepare(`
      INSERT OR IGNORE INTO academic_terms (academic_year_id, term_number, name, start_date, end_date, is_verified)
      VALUES (?, ?, ?, NULL, NULL, 0)
    `);

    for (const yr of existingYears) {
      insertTermStmt.run(yr.id, 1, `Term 1 (${yr.name})`);
      insertTermStmt.run(yr.id, 2, `Term 2 (${yr.name})`);
      insertTermStmt.run(yr.id, 3, `Term 3 (${yr.name})`);
    }

    // Step B: Upgrade examinations table with operational fields if missing
    const examCols = db.prepare("SELECT name FROM pragma_table_info('examinations')").all() as { name: string }[];
    const examColNames = new Set(examCols.map((c) => c.name));

    if (!examColNames.has('exam_type')) {
      db.exec(`ALTER TABLE examinations ADD COLUMN exam_type TEXT DEFAULT 'term' CHECK(exam_type IN ('term', 'mid_year', 'year_end', 'mock', 'unit_test'));`);
    }
    if (!examColNames.has('grade_band')) {
      db.exec(`ALTER TABLE examinations ADD COLUMN grade_band TEXT DEFAULT 'all' CHECK(grade_band IN ('all', 'junior_6_9', 'ol_10_11', 'al_12_13'));`);
    }
    if (!examColNames.has('status')) {
      db.exec(`ALTER TABLE examinations ADD COLUMN status TEXT DEFAULT 'scheduled' CHECK(status IN ('draft', 'scheduled', 'marking_open', 'marking_closed', 'under_review', 'approved', 'published', 'archived'));`);
    }
    if (!examColNames.has('term_id')) {
      db.exec(`ALTER TABLE examinations ADD COLUMN term_id INTEGER REFERENCES academic_terms(id);`);
    }
    if (!examColNames.has('published_at')) {
      db.exec(`ALTER TABLE examinations ADD COLUMN published_at TEXT;`);
    }
    if (!examColNames.has('published_by_user_id')) {
      db.exec(`ALTER TABLE examinations ADD COLUMN published_by_user_id INTEGER REFERENCES users(id);`);
    }

    // Synchronize existing examinations status and terms
    db.exec(`
      UPDATE examinations 
      SET status = 'published' 
      WHERE is_published = 1 AND (status IS NULL OR status = 'scheduled');
    `);

    db.exec(`
      UPDATE examinations 
      SET term_id = (
        SELECT id FROM academic_terms 
        WHERE academic_terms.academic_year_id = examinations.academic_year_id 
          AND academic_terms.term_number = examinations.term
        LIMIT 1
      )
      WHERE term_id IS NULL;
    `);

    // Step C: Create academic_staff_authorizations table (scoped permissions without altering users.role)
    db.exec(`
      CREATE TABLE IF NOT EXISTS academic_staff_authorizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
        auth_role TEXT NOT NULL CHECK(auth_role IN (
          'principal',
          'vice_principal_academic',
          'section_head',
          'exam_coordinator'
        )),
        grade_band TEXT NOT NULL CHECK(grade_band IN ('junior_6_9', 'ol_10_11', 'al_12_13', 'all')),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        granted_by_user_id INTEGER NOT NULL REFERENCES users(id),
        granted_at TEXT DEFAULT (datetime('now')),
        revoked_by_user_id INTEGER REFERENCES users(id),
        revoked_at TEXT,
        revocation_reason TEXT,
        UNIQUE(user_id, academic_year_id, auth_role, grade_band)
      );
    `);

    // Step D: Create assessment_policy_profiles table (versioned provisional policies)
    db.exec(`
      CREATE TABLE IF NOT EXISTS assessment_policy_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
        grade_band TEXT NOT NULL CHECK(grade_band IN ('junior_6_9', 'ol_10_11', 'al_12_13')),
        policy_code TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        grading_scale_json TEXT NOT NULL,
        absence_rules_json TEXT NOT NULL,
        ranking_rules_json TEXT NOT NULL,
        correction_window_days INTEGER NOT NULL DEFAULT 21,
        is_approved_by_school INTEGER NOT NULL DEFAULT 0 CHECK(is_approved_by_school IN (0, 1)),
        approved_by_user_id INTEGER REFERENCES users(id),
        approved_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Step E: Create student_subject_enrollments table (student-specific eligibility)
    db.exec(`
      CREATE TABLE IF NOT EXISTS student_subject_enrollments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
        enrollment_status TEXT NOT NULL DEFAULT 'provisional_unverified' CHECK(enrollment_status IN (
          'confirmed',
          'provisional_unverified',
          'dropped',
          'transferred'
        )),
        enrollment_category TEXT NOT NULL CHECK(enrollment_category IN (
          'core_compulsory',
          'religion_specific',
          'language_specific',
          'ol_basket_1',
          'ol_basket_2',
          'ol_basket_3',
          'al_stream_main',
          'al_common_compulsory'
        )),
        created_at TEXT DEFAULT (datetime('now')),
        verified_by_user_id INTEGER REFERENCES users(id),
        verified_at TEXT,
        UNIQUE(student_id, subject_id, academic_year_id)
      );
    `);

    // Step F: Create marks_sheets container table
    db.exec(`
      CREATE TABLE IF NOT EXISTS marks_sheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        examination_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
        teacher_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
        max_score REAL NOT NULL DEFAULT 100.0 CHECK(max_score > 0.0 AND max_score <= 1000.0),
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN (
          'draft',
          'submitted',
          'returned',
          'reviewed',
          'approved',
          'empty_exempt',
          'published',
          'legacy_unmoderated',
          'quarantined'
        )),
        submission_notes TEXT,
        submitted_at TEXT,
        reviewed_by_user_id INTEGER REFERENCES users(id),
        reviewed_at TEXT,
        review_remarks TEXT,
        approved_by_user_id INTEGER REFERENCES users(id),
        approved_at TEXT,
        approval_remarks TEXT,
        payload_hash TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(examination_id, class_id, subject_id)
      );

      CREATE TABLE IF NOT EXISTS marks_sheet_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sheet_id INTEGER NOT NULL REFERENCES marks_sheets(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL CHECK(revision >= 1),
        status TEXT NOT NULL,
        saved_by_user_id INTEGER REFERENCES users(id),
        marks_payload_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(sheet_id, revision)
      );
    `);

    try {
      db.exec('ALTER TABLE marks_sheets ADD COLUMN max_score REAL NOT NULL DEFAULT 100.0 CHECK(max_score > 0.0 AND max_score <= 1000.0);');
    } catch {}

    // Step G: Create quarantined_legacy_marks table
    db.exec(`
      CREATE TABLE IF NOT EXISTS quarantined_legacy_marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        legacy_mark_id INTEGER,
        examination_id INTEGER,
        class_id INTEGER,
        subject_id INTEGER,
        student_id INTEGER,
        raw_score REAL,
        raw_is_absent INTEGER,
        raw_is_exempt INTEGER,
        raw_status TEXT,
        raw_payload_json TEXT NOT NULL,
        quarantine_reason TEXT NOT NULL,
        quarantined_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Step H: Create marks_corrections and marks_audit_history tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS marks_corrections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mark_id INTEGER NOT NULL,
        sheet_id INTEGER NOT NULL REFERENCES marks_sheets(id) ON DELETE RESTRICT,
        examination_id INTEGER NOT NULL REFERENCES examinations(id),
        student_id INTEGER NOT NULL REFERENCES students(id),
        subject_id INTEGER NOT NULL REFERENCES subjects(id),
        requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
        expected_previous_score REAL,
        expected_previous_status TEXT NOT NULL,
        requested_score REAL,
        requested_status TEXT NOT NULL,
        correction_category TEXT NOT NULL CHECK(correction_category IN (
          'clerical_addition',
          'missed_question',
          'incorrect_index',
          're_scrutiny',
          'other'
        )),
        detailed_justification TEXT NOT NULL,
        evidence_attachment_ref TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        reviewed_by_user_id INTEGER REFERENCES users(id),
        reviewed_at TEXT,
        review_comments TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS marks_audit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mark_id INTEGER NOT NULL,
        sheet_id INTEGER NOT NULL,
        examination_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        action TEXT NOT NULL CHECK(action IN (
          'INITIAL_ENTRY',
          'DRAFT_SAVE',
          'SUBMISSION',
          'RETURN',
          'ENDORSEMENT',
          'APPROVAL',
          'POST_PUBLICATION_CORRECTION'
        )),
        actor_user_id INTEGER NOT NULL REFERENCES users(id),
        previous_score REAL,
        new_score REAL,
        previous_status TEXT,
        new_status TEXT,
        correction_id INTEGER REFERENCES marks_corrections(id),
        reason TEXT,
        ip_address TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Step I: Create marks_new with genuine check constraints & generated virtual columns
    db.exec(`
      CREATE TABLE IF NOT EXISTS marks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sheet_id INTEGER NOT NULL REFERENCES marks_sheets(id) ON DELETE RESTRICT,
        examination_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE RESTRICT,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        max_score REAL NOT NULL DEFAULT 100.0 CHECK(max_score > 0.0 AND max_score <= 1000.0),
        score REAL CHECK(
          score IS NULL OR 
          (score >= 0.0 AND score <= max_score AND score = ROUND(score, 1))
        ),
        assessment_status TEXT NOT NULL DEFAULT 'PRESENT' CHECK(assessment_status IN (
          'PRESENT',
          'ABSENT',
          'MEDICAL',
          'EXEMPT',
          'NOT_ASSESSED'
        )),
        is_absent INTEGER GENERATED ALWAYS AS (CASE WHEN assessment_status = 'ABSENT' THEN 1 ELSE 0 END) VIRTUAL,
        is_exempt INTEGER GENERATED ALWAYS AS (CASE WHEN assessment_status = 'EXEMPT' THEN 1 ELSE 0 END) VIRTUAL,
        grade_letter TEXT,
        status TEXT DEFAULT 'submitted' CHECK(status IN ('draft', 'submitted', 'published')),
        remarks TEXT,
        entered_by_user_id INTEGER REFERENCES users(id),
        updated_at TEXT DEFAULT (datetime('now')),
        
        CONSTRAINT chk_score_status_integrity CHECK (
          (assessment_status = 'PRESENT' AND score IS NOT NULL) OR
          (assessment_status IN ('ABSENT', 'MEDICAL', 'EXEMPT', 'NOT_ASSESSED') AND score IS NULL)
        ),
        UNIQUE(examination_id, subject_id, student_id)
      );
    `);

    // Step J: Lossless Migration of Legacy Marks and Deterministic Sheet Creation
    let migratedSheets = 0;
    let migratedMarks = 0;
    let quarantinedMarks = 0;

    // Check if marks table exists and has rows
    const marksTableExists = db.prepare(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = 'marks';"
    ).get() as { cnt: number };
    const hasLegacyMarksTable = Number(marksTableExists?.cnt || 0) > 0;

    const preflightTotalMarks = hasLegacyMarksTable
      ? (db.prepare('SELECT COUNT(*) as cnt FROM marks').get() as { cnt: number }).cnt
      : 0;

    if (preflightTotalMarks > 0) {
      // Find all distinct legacy sheets
      const legacySheets = db.prepare(`
        SELECT DISTINCT examination_id, class_id, subject_id
        FROM marks
      `).all() as { examination_id: number; class_id: number; subject_id: number }[];

      const insertQuarantineStmt = db.prepare(`
        INSERT INTO quarantined_legacy_marks (
          legacy_mark_id, examination_id, class_id, subject_id, student_id,
          raw_score, raw_is_absent, raw_is_exempt, raw_status, raw_payload_json, quarantine_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertSheetStmt = db.prepare(`
        INSERT INTO marks_sheets (
          examination_id, class_id, subject_id, academic_year_id,
          teacher_id, revision, status, submission_notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))
      `);

      const insertMarkNewStmt = db.prepare(`
        INSERT INTO marks_new (
          id, sheet_id, examination_id, class_id, subject_id, student_id,
          max_score, score, assessment_status, grade_letter, status, remarks, entered_by_user_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const sheet of legacySheets) {
        // Explicit column projection without remarks column (remarks does not exist in PR-004 schema)
        const sheetRows = db.prepare(`
          SELECT id, examination_id, class_id, subject_id, student_id,
                 score, is_absent, is_exempt, max_score, grade_letter,
                 status, entered_by_user_id, updated_at
          FROM marks
          WHERE examination_id = ? AND class_id = ? AND subject_id = ?
        `).all(sheet.examination_id, sheet.class_id, sheet.subject_id) as any[];

        // 1. Verify parent entity existence
        const exam = db.prepare('SELECT id, academic_year_id, is_published FROM examinations WHERE id = ?').get(sheet.examination_id) as any;
        const classInfo = db.prepare('SELECT id, academic_year_id FROM classes WHERE id = ?').get(sheet.class_id) as any;
        const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(sheet.subject_id) as any;

        if (!exam || !classInfo || !subject) {
          for (const row of sheetRows) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), 'ORPHAN_PARENT_RECORD_MISSING'
            );
            quarantinedMarks++;
          }
          continue;
        }

        // 2. Verify academic year consistency (fail closed on mismatch)
        if (exam.academic_year_id && classInfo.academic_year_id && exam.academic_year_id !== classInfo.academic_year_id) {
          for (const row of sheetRows) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), `ACADEMIC_YEAR_MISMATCH: exam_year=${exam.academic_year_id}, class_year=${classInfo.academic_year_id}`
            );
            quarantinedMarks++;
          }
          continue;
        }

        const resolvedYearId = exam.academic_year_id || classInfo.academic_year_id;
        if (!resolvedYearId) {
          for (const row of sheetRows) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), 'INDETERMINATE_ACADEMIC_YEAR'
            );
            quarantinedMarks++;
          }
          continue;
        }

        // 3. Resolve teacher assignment truthfully from teacher_assignments ONLY
        const assignments = db.prepare(`
          SELECT teacher_id FROM teacher_assignments
          WHERE class_id = ? AND subject_id = ? AND assignment_type = 'subject_teacher' AND academic_year_id = ?
        `).all(sheet.class_id, sheet.subject_id, resolvedYearId) as { teacher_id: number }[];

        let resolvedTeacherId: number | null = null;
        if (assignments.length === 1) {
          resolvedTeacherId = assignments[0].teacher_id;
        }
        // If no unique teacher assignment exists, teacher_id remains NULL.
        // We strictly NEVER substitute entered_by_user_id for appointed teacher ownership.

        // 4. Determine sheet status without fabricating approval
        const sheetStatus = exam.is_published === 1 ? 'legacy_unmoderated' : 'draft';
        const note = exam.is_published === 1
          ? 'Imported from PR-004 legacy marks without formal PR-005 moderation approval'
          : 'Imported unapproved legacy draft';

        const sheetResult = insertSheetStmt.run(
          sheet.examination_id, sheet.class_id, sheet.subject_id, resolvedYearId,
          resolvedTeacherId, sheetStatus, note
        );
        const newSheetId = Number(sheetResult.lastInsertRowid);
        migratedSheets++;

        // 5. Migrate individual marks rows with strict constraint validation
        for (const row of sheetRows) {
          // Check student existence
          const studentExists = db.prepare('SELECT id FROM students WHERE id = ?').get(row.student_id);
          if (!studentExists) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), 'ORPHAN_STUDENT_RECORD'
            );
            quarantinedMarks++;
            continue;
          }

          // Validate max_score: must be numeric and strictly in (0, 1000]
          if (row.max_score === null || row.max_score === undefined) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), 'INVALID_MAX_SCORE_NULL_OR_MISSING'
            );
            quarantinedMarks++;
            continue;
          }

          const maxScore = Number(row.max_score);
          if (isNaN(maxScore) || maxScore <= 0.0 || maxScore > 1000.0) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), `INVALID_MAX_SCORE: ${row.max_score} not in (0, 1000]`
            );
            quarantinedMarks++;
            continue;
          }

          const rawScore = row.score !== null && row.score !== undefined ? Number(row.score) : null;
          const isAbsent = Boolean(row.is_absent);
          const isExempt = Boolean(row.is_exempt);

          // Check contradictory flags
          if (isAbsent && isExempt) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), 'CONTRADICTORY_FLAGS_BOTH_ABSENT_AND_EXEMPT'
            );
            quarantinedMarks++;
            continue;
          }

          if (rawScore !== null && (isAbsent || isExempt)) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), 'SCORE_CONFLICT_WITH_ABSENT_OR_EXEMPT_FLAG'
            );
            quarantinedMarks++;
            continue;
          }

          if (rawScore !== null && isNaN(rawScore)) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), `INVALID_SCORE_NAN: ${row.score}`
            );
            quarantinedMarks++;
            continue;
          }

          if (rawScore !== null && (rawScore < 0.0 || rawScore > maxScore)) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), `SCORE_OUT_OF_BOUNDS: ${rawScore} not in [0, ${maxScore}]`
            );
            quarantinedMarks++;
            continue;
          }

          // Strict precision validation: NEVER silently round scores like 81.25 -> 81.3
          if (rawScore !== null && Math.round(rawScore * 10) / 10 !== rawScore) {
            insertQuarantineStmt.run(
              row.id, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
              row.score, row.is_absent, row.is_exempt, row.status,
              JSON.stringify(row), `NON_CANONICAL_PRECISION: score ${rawScore} exceeds single-decimal precision`
            );
            quarantinedMarks++;
            continue;
          }

          // Assign canonical assessment_status and score
          let finalStatus = 'PRESENT';
          let finalScore: number | null = rawScore;

          if (isAbsent) {
            finalStatus = 'ABSENT';
            finalScore = null;
          } else if (isExempt) {
            finalStatus = 'EXEMPT';
            finalScore = null;
          } else if (rawScore === null) {
            finalStatus = 'NOT_ASSESSED';
            finalScore = null;
          } else {
            finalStatus = 'PRESENT';
            finalScore = rawScore; // Exact representation without silent truncation/rounding
          }

          insertMarkNewStmt.run(
            row.id, newSheetId, sheet.examination_id, sheet.class_id, sheet.subject_id, row.student_id,
            maxScore, finalScore, finalStatus, row.grade_letter ?? null,
            row.status || 'submitted',
            null /* remarks (not in PR-004 schema) */,
            row.entered_by_user_id ?? null, row.updated_at || new Date().toISOString()
          );
          migratedMarks++;
        }
      }
    }

    // Step K: Replace marks table atomically
    if (hasLegacyMarksTable) {
      db.exec('DROP TABLE marks;');
    }
    db.exec('ALTER TABLE marks_new RENAME TO marks;');

    // Step L: Recreate Indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_marks_sheet_lookup ON marks(sheet_id);
      CREATE INDEX IF NOT EXISTS idx_marks_exam_subject_class ON marks(examination_id, subject_id, class_id);
      CREATE INDEX IF NOT EXISTS idx_marks_student_lookup ON marks(student_id, examination_id);
      CREATE INDEX IF NOT EXISTS idx_marks_sheets_lookup ON marks_sheets(examination_id, class_id, subject_id);
      CREATE INDEX IF NOT EXISTS idx_marks_sheets_status ON marks_sheets(status, academic_year_id);
      CREATE INDEX IF NOT EXISTS idx_student_subject_lookup ON student_subject_enrollments(class_id, subject_id, academic_year_id);
      CREATE INDEX IF NOT EXISTS idx_marks_audit_student ON marks_audit_history(student_id, examination_id);
    `);

    // Invariant Verification 0: Reconcile exact marks count in-transaction
    if (migratedMarks + quarantinedMarks !== preflightTotalMarks) {
      throw new Error(
        `Migration 005 Reconciliation Invariant Violation: migrated (${migratedMarks}) + quarantined (${quarantinedMarks}) = ${migratedMarks + quarantinedMarks} !== preflight total (${preflightTotalMarks})`
      );
    }

    const marksInDb = (db.prepare('SELECT COUNT(*) as cnt FROM marks').get() as { cnt: number }).cnt;
    const quarantinedInDb = (db.prepare('SELECT COUNT(*) as cnt FROM quarantined_legacy_marks').get() as { cnt: number }).cnt;
    if (marksInDb !== migratedMarks) {
      throw new Error(`Migration 005 Invariant Violation: active marks count in DB (${marksInDb}) !== tracked migratedMarks (${migratedMarks})`);
    }
    if (quarantinedInDb !== quarantinedMarks) {
      throw new Error(`Migration 005 Invariant Violation: quarantined marks count in DB (${quarantinedInDb}) !== tracked quarantinedMarks (${quarantinedMarks})`);
    }

    // Invariant Verification 1: PRAGMA foreign_key_check
    const fkErrors = db.prepare('PRAGMA foreign_key_check;').all();
    if (fkErrors.length > 0) {
      throw new Error(`Migration 005 Foreign Key Invariant Violation: ${JSON.stringify(fkErrors)}`);
    }

    // Invariant Verification 2: PRAGMA integrity_check
    const integrityCheck = db.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
    if (integrityCheck?.integrity_check !== 'ok') {
      throw new Error(`Migration 005 Database Integrity Check Failed: ${JSON.stringify(integrityCheck)}`);
    }

    // Step M: Advance user_version to 5
    db.exec(`PRAGMA user_version = ${TARGET_SCHEMA_VERSION};`);
    db.exec('COMMIT;');

    return {
      applied: true,
      version: TARGET_SCHEMA_VERSION,
      migratedSheets,
      migratedMarks,
      quarantinedMarks
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore if rollback already performed
    }
    throw err;
  } finally {
    if (initialFk === 1) {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }
}
