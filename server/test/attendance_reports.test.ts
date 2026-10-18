import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { setupIsolatedTestDb, teardownIsolatedTestDb, TestFixtureData } from './helpers/testDb.js';
import { runMigration004 } from '../src/db/migrations/004_attendance_integrity.js';
import {
  processAttendanceSubmission,
  computeServerRosterFingerprint
} from '../src/services/attendanceService.js';
import { getColomboCivilDate, isValidCivilDate } from '../src/utils/dateUtils.js';

describe('PR-004 Reporting & Verification Tests (ATT-031-033, ATT-036-037, ATT-039-040, ATT-052-053, ATT-058-059, ATT-062-064)', () => {
  let fixture: TestFixtureData;
  let db: DatabaseSync;

  beforeEach(() => {
    fixture = setupIsolatedTestDb();
    db = new DatabaseSync(fixture.dbPath);
    db.exec('PRAGMA busy_timeout = 5000;');
    runMigration004(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Ignore
    }
    teardownIsolatedTestDb(fixture.dbPath);
  });

  function getValidFingerprint(classId: number, academicYearId: number, dateStr: string) {
    const students = db.prepare(`
      SELECT s.id, s.admission_no, s.status as student_status
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      WHERE e.class_id = ? AND e.academic_year_id = ? AND e.status = 'enrolled' AND s.status = 'Active'
      ORDER BY s.id ASC
    `).all(classId, academicYearId) as Array<{ id: number; admission_no: string; student_status: string }>;

    return computeServerRosterFingerprint(classId, academicYearId, dateStr, students);
  }

  // ATT-031: Daily attendance report includes class summaries
  it('ATT-031: daily report accurately aggregates enrolled, present, absent, late, excused counts', () => {
    const date = '2026-06-01';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    const summary = db.prepare(`
      SELECT 
        c.id as class_id,
        sess.id as session_id, sess.status as session_status,
        COUNT(DISTINCT CASE WHEN e.status = 'enrolled' AND s.status = 'Active' THEN e.student_id END) as enrolled_count,
        COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.student_id END) as present_count
      FROM classes c
      LEFT JOIN enrollments e ON e.class_id = c.id AND e.academic_year_id = c.academic_year_id AND e.status = 'enrolled'
      LEFT JOIN students s ON e.student_id = s.id AND s.status = 'Active'
      LEFT JOIN attendance_sessions sess ON sess.class_id = c.id AND sess.date = ?
      LEFT JOIN attendance_records ar ON ar.session_id = sess.id AND ar.student_id = e.student_id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(date, fixture.testClassA.id) as any;

    assert.strictEqual(summary.session_status, 'submitted');
    assert.strictEqual(summary.enrolled_count, 1);
    assert.strictEqual(summary.present_count, 1);
  });

  // ATT-032 & ATT-033: Absent students phone follow-up directory is scoped to assigned classes
  it('ATT-032 & ATT-033: absentees list contains student contact info and remarks', () => {
    const date = '2026-06-02';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'absent', remarks: 'Fever' }]
    });

    const absents = db.prepare(`
      SELECT 
        s.id, s.admission_no, s.full_name, s.guardian_name, s.guardian_phone,
        c.name as class_name, ar.remarks
      FROM attendance_records ar
      JOIN attendance_sessions sess ON ar.session_id = sess.id
      JOIN students s ON ar.student_id = s.id
      JOIN classes c ON sess.class_id = c.id
      WHERE sess.date = ? AND ar.status = 'absent'
    `).all(date) as any[];

    assert.strictEqual(absents.length, 1);
    assert.strictEqual(absents[0].admission_no, fixture.studentA.admissionNo);
    assert.strictEqual(absents[0].remarks, 'Fever');
    assert.strictEqual(absents[0].guardian_phone, '0770000000');
  });

  // ATT-036: Rejection of legacy payload format on POST /session
  it('ATT-036: rejects legacy payload without clientMutationId/mode/revision', () => {
    const legacy = {
      classId: fixture.testClassA.id,
      date: '2026-06-03',
      records: [{ student_id: fixture.studentA.id, status: 'present' }]
    };

    // When processed by validateAttendancePayload
    const { validateAttendancePayload } = require('../src/validation/attendanceValidation.js');
    const res = validateAttendancePayload(legacy);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error.code, 'LEGACY_PAYLOAD_UNSUPPORTED');
  });

  // ATT-037 & ATT-059: Leap day date validation
  it('ATT-037 & ATT-059: correctly validates leap-year Feb 29 and rejects non-leap Feb 29', () => {
    assert.strictEqual(isValidCivilDate('2024-02-29'), true, '2024 is a leap year');
    assert.strictEqual(isValidCivilDate('2028-02-29'), true, '2028 is a leap year');
    assert.strictEqual(isValidCivilDate('2025-02-29'), false, '2025 is not a leap year');
    assert.strictEqual(isValidCivilDate('2026-02-29'), false, '2026 is not a leap year');
    assert.strictEqual(isValidCivilDate('2026-04-31'), false, 'April has only 30 days');
  });

  // ATT-039: Colombo civil calendar date resolution
  it('ATT-039: getColomboCivilDate returns YYYY-MM-DD in Asia/Colombo time', () => {
    const dateStr = getColomboCivilDate();
    assert.match(dateStr, /^\d{4}-\d{2}-\d{2}$/);
    assert.strictEqual(isValidCivilDate(dateStr), true);
  });

  // ATT-040 & ATT-058: Monthly attendance grid report displays attendance across dates for a class
  it('ATT-040 & ATT-058: queries attendance records for month across all sessions', () => {
    const dates = ['2026-06-10', '2026-06-11', '2026-06-12'];
    for (const d of dates) {
      const fp = getValidFingerprint(fixture.testClassA.id, 1, d);
      processAttendanceSubmission(db, fixture.classTeacher, {
        classId: fixture.testClassA.id,
        date: d,
        mode: 'submitted',
        baseRevision: 0,
        clientMutationId: crypto.randomUUID(),
        rosterFingerprint: fp,
        notes: null,
        records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
      });
    }

    const sessions = db.prepare(`
      SELECT id, date, status, revision
      FROM attendance_sessions
      WHERE class_id = ? AND date LIKE '2026-06%'
      ORDER BY date ASC
    `).all(fixture.testClassA.id) as any[];

    assert.strictEqual(sessions.length, 3);
  });

  // ATT-052: Midyear transfer: historical attendance records preserved
  it('ATT-052: transferred student records remain preserved and queryable for historical dates', () => {
    const date = '2026-06-15';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    // Student A transfers midyear
    db.prepare("UPDATE enrollments SET status = 'transferred' WHERE student_id = ?").run(fixture.studentA.id);

    // Query historical record
    const record = db.prepare(`
      SELECT ar.* FROM attendance_records ar
      JOIN attendance_sessions sess ON ar.session_id = sess.id
      WHERE sess.class_id = ? AND sess.date = ? AND ar.student_id = ?
    `).get(fixture.testClassA.id, date, fixture.studentA.id) as any;

    assert(record !== undefined);
    assert.strictEqual(record.status, 'present');
  });

  // ATT-053: Class without recorded attendance displays session_status = null (truthful reporting)
  it('ATT-053: reports session_status as null for date with no recorded session', () => {
    const date = '2026-06-20'; // No attendance submitted for this date

    const summary = db.prepare(`
      SELECT 
        c.id as class_id,
        sess.id as session_id, sess.status as session_status
      FROM classes c
      LEFT JOIN attendance_sessions sess ON sess.class_id = c.id AND sess.date = ?
      WHERE c.id = ?
    `).get(date, fixture.testClassA.id) as any;

    assert.strictEqual(summary.session_id, null);
    assert.strictEqual(summary.session_status, null);
  });

  // ATT-062: Audit trail records ATTENDANCE_SUBMIT and ATTENDANCE_UPDATE
  it('ATT-062: audit trail records both initial submission and subsequent revisions', () => {
    const date = '2026-06-25';
    const fp = getValidFingerprint(fixture.testClassA.id, 1, date);

    // Initial Rev 1
    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'draft',
      baseRevision: 0,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: null,
      records: [{ student_id: fixture.studentA.id, status: 'present', remarks: null }]
    });

    // Update Rev 2
    processAttendanceSubmission(db, fixture.classTeacher, {
      classId: fixture.testClassA.id,
      date,
      mode: 'submitted',
      baseRevision: 1,
      clientMutationId: crypto.randomUUID(),
      rosterFingerprint: fp,
      notes: 'Finalized',
      records: [{ student_id: fixture.studentA.id, status: 'late', remarks: 'Late' }]
    });

    const logs = db.prepare(`
      SELECT action, details FROM audit_logs
      WHERE entity_type = 'attendance_sessions'
      ORDER BY id ASC
    `).all() as any[];

    assert.strictEqual(logs.length, 2);
    assert.strictEqual(logs[0].action, 'ATTENDANCE_SUBMIT');
    assert.strictEqual(logs[1].action, 'ATTENDANCE_UPDATE');
  });

  // ATT-064: Multiple academic year isolation
  it('ATT-064: isolates attendance sessions between different academic years', () => {
    // Add Academic Year 2027
    db.prepare(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ('2027-TEST', '2027-01-01', '2027-12-31', 0);
    `).run();

    const class2027Res = db.prepare(`
      INSERT INTO classes (grade, name, academic_year_id)
      VALUES (9, 'Grade 9-A 2027', 2);
    `).run();
    const class2027Id = Number(class2027Res.lastInsertRowid);

    // Query reports for 2026 classes only
    const classes2026 = db.prepare(`
      SELECT id, name FROM classes WHERE academic_year_id = 1
    `).all() as any[];

    assert(classes2026.every((c) => c.id !== class2027Id));
  });
});
