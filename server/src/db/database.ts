import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

export function getDbPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), 'skoolsys.db');
}

export let DB_PATH = getDbPath();

let activeDb: DatabaseSync = new DatabaseSync(DB_PATH);
try {
  activeDb.exec('PRAGMA journal_mode = WAL;');
  activeDb.exec('PRAGMA foreign_keys = ON;');
} catch {
  // Silently ignore PRAGMA setup error if in special mode
}

export function switchDatabase(filePath?: string): DatabaseSync {
  try {
    activeDb.close();
  } catch {
    // Silently ignore if already closed
  }
  DB_PATH = filePath || getDbPath();
  activeDb = new DatabaseSync(DB_PATH);
  try {
    activeDb.exec('PRAGMA journal_mode = WAL;');
    activeDb.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // Silently ignore
  }
  return activeDb;
}

export function closeDatabase(): void {
  try {
    activeDb.close();
  } catch {
    // Silently ignore if already closed
  }
}

// Transparent Proxy wrapper so all routes importing `db` seamlessly execute against activeDb
export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const value = Reflect.get(activeDb, prop);
    if (typeof value === 'function') {
      return value.bind(activeDb);
    }
    return value;
  }
});

export function initDatabase() {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'class_teacher', 'subject_teacher')),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL CHECK(grade >= 6 AND grade <= 13),
      name TEXT NOT NULL,
      room_number TEXT,
      academic_year_id INTEGER REFERENCES academic_years(id),
      class_teacher_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Core',
      grade_level TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      UNIQUE(class_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
      assignment_type TEXT NOT NULL CHECK(assignment_type IN ('class_teacher', 'subject_teacher')),
      academic_year_id INTEGER REFERENCES academic_years(id)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_no TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      calling_name TEXT NOT NULL,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female', 'Other')),
      address TEXT,
      guardian_name TEXT NOT NULL,
      guardian_relation TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      guardian_email TEXT,
      guardian_nic TEXT,
      emergency_contact TEXT,
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Transferred', 'Graduated', 'Suspended')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
      roll_number INTEGER,
      status TEXT DEFAULT 'enrolled' CHECK(status IN ('enrolled', 'transferred', 'promoted')),
      UNIQUE(student_id, academic_year_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      academic_year_id INTEGER REFERENCES academic_years(id),
      taken_by_user_id INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'submitted' CHECK(status IN ('draft', 'submitted')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(class_id, date)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'excused')),
      remarks TEXT,
      synced_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS examinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      term INTEGER NOT NULL CHECK(term IN (1, 2, 3)),
      academic_year_id INTEGER REFERENCES academic_years(id),
      start_date TEXT,
      end_date TEXT,
      is_published INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      score REAL,
      is_absent INTEGER DEFAULT 0,
      is_exempt INTEGER DEFAULT 0,
      max_score REAL DEFAULT 100,
      grade_letter TEXT,
      status TEXT DEFAULT 'submitted' CHECK(status IN ('draft', 'submitted', 'published')),
      entered_by_user_id INTEGER REFERENCES users(id),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(examination_id, subject_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      username TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_students_admission ON students(admission_no);
    CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id, academic_year_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_sessions(date, class_id);
    CREATE INDEX IF NOT EXISTS idx_marks_exam_subject ON marks(examination_id, subject_id, class_id);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp DESC);
  `;

  db.exec(schema);
}
