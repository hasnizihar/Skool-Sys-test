import { DatabaseSync } from 'node:sqlite';
import { recalculateAllClasses } from '../../services/rollNumberService.js';

export const TARGET_SCHEMA_VERSION = 9;

export interface Migration009Result {
  applied: boolean;
  version: number;
}

/**
 * Helper to generate "Name with Initial" from a full legal name if missing.
 * e.g. "Kasun Malinda Ranasinghe" -> "K.M. Ranasinghe"
 * e.g. "Mohamed Rinas" -> "M. Rinas"
 */
function formatNameWithInitials(fullName: string): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName;
  const lastName = parts[parts.length - 1];
  const initials = parts
    .slice(0, parts.length - 1)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join('');
  return `${initials} ${lastName}`;
}

/**
 * Migration 009: Student Metadata Schema Refinement & 5-Digit Index Migration
 *
 * 1. Adds `name_with_initials`, `guardian_occupation`, and `guardian_phone_2` columns to `students`.
 * 2. Migrates all legacy/dummy student admission numbers to 5-digit index numbers (16001+).
 * 3. Backfills `name_with_initials` from full_name.
 * 4. Recalculates all class roll numbers according to the new rule: Boys first, then Girls in Index order.
 */
export function runMigration009(db: DatabaseSync): Migration009Result {
  const versionRow = db.prepare('PRAGMA user_version;').get() as { user_version: number };
  const currentVersion = Number(versionRow?.user_version || 0);

  const studentCols = db.prepare("SELECT name FROM pragma_table_info('students')").all() as Array<{ name: string }>;
  const colNames = studentCols.map((c) => c.name);

  const hasNameInitials = colNames.includes('name_with_initials');
  const hasOccupation = colNames.includes('guardian_occupation');
  const hasPhone2 = colNames.includes('guardian_phone_2');

  if (currentVersion >= TARGET_SCHEMA_VERSION && hasNameInitials && hasOccupation && hasPhone2) {
    return {
      applied: false,
      version: currentVersion
    };
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    // 1. Add missing columns to students table if needed
    if (!hasNameInitials) {
      db.exec('ALTER TABLE students ADD COLUMN name_with_initials TEXT;');
    }
    if (!hasOccupation) {
      db.exec('ALTER TABLE students ADD COLUMN guardian_occupation TEXT;');
    }
    if (!hasPhone2) {
      db.exec('ALTER TABLE students ADD COLUMN guardian_phone_2 TEXT;');
    }

    // 2. Query all existing students to check for legacy non-5-digit admission numbers
    const allStudents = db
      .prepare('SELECT id, admission_no, full_name, calling_name, emergency_contact, guardian_occupation, name_with_initials FROM students ORDER BY id ASC')
      .all() as Array<{
      id: number;
      admission_no: string;
      full_name: string;
      calling_name?: string;
      emergency_contact?: string;
      guardian_occupation?: string;
      name_with_initials?: string;
    }>;

    const updateStudentStmt = db.prepare(`
      UPDATE students SET
        admission_no = ?,
        name_with_initials = ?,
        guardian_occupation = COALESCE(guardian_occupation, 'Business / Self-Employed'),
        guardian_phone_2 = COALESCE(guardian_phone_2, emergency_contact)
      WHERE id = ?
    `);

    // Assign clean 5-digit index numbers starting at 16001 for any student with non-5-digit format
    let nextIndex = 16001;
    for (const st of allStudents) {
      const is5Digit = /^\d{5}$/.test(st.admission_no);
      let targetIndex = st.admission_no;

      if (!is5Digit) {
        targetIndex = String(nextIndex);
        nextIndex++;
      } else {
        const num = parseInt(st.admission_no, 10);
        if (num >= nextIndex) {
          nextIndex = num + 1;
        }
      }

      const initialsName = st.name_with_initials || formatNameWithInitials(st.full_name) || st.calling_name || st.full_name;
      updateStudentStmt.run(targetIndex, initialsName, st.id);
    }

    // 3. Recalculate roll numbers for all classes across active academic year
    recalculateAllClasses(db);

    // 4. Update PRAGMA user_version to 9
    db.exec(`PRAGMA user_version = ${TARGET_SCHEMA_VERSION};`);
    db.exec('COMMIT;');

    return {
      applied: true,
      version: TARGET_SCHEMA_VERSION
    };
  } catch (err: any) {
    db.exec('ROLLBACK;');
    throw new Error(`Migration 009 failed: ${err.message}`);
  }
}
