import { DatabaseSync } from 'node:sqlite';

export interface ClassEnrollmentItem {
  enrollment_id: number;
  student_id: number;
  admission_no: string;
  gender: string;
}

/**
 * Extracts numeric value for natural sorting of 5-digit index numbers or legacy codes.
 * e.g. "16087" -> 16087, "SCH-2024-001" -> 2024001
 */
export function getIndexNumeric(admissionNo: string | null | undefined): number {
  if (!admissionNo) return 0;
  const digits = String(admissionNo).replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Recalculates and assigns sequential roll numbers for all active students in a given class.
 * Ordering Rule:
 * 1. Boys first (gender == 'Male'), sorted by Index Number (numeric ASC: 16001, 16005, ...) -> 1 .. M
 * 2. Girls next (gender == 'Female'), sorted by Index Number (numeric ASC: 16002, 16010, ...) -> (M+1) .. N
 */
export function recalculateClassRollNumbers(
  db: DatabaseSync,
  classId: number,
  academicYearId?: number
): { classId: number; updatedCount: number } {
  let yearId = academicYearId;
  if (!yearId) {
    const activeYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as
      | { id: number }
      | undefined;
    yearId = activeYear?.id;
  }

  if (!yearId) {
    return { classId, updatedCount: 0 };
  }

  const enrollments = db
    .prepare(
      `
    SELECT e.id as enrollment_id, s.id as student_id, s.admission_no, s.gender
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    WHERE e.class_id = ? AND e.academic_year_id = ? AND e.status = 'enrolled' AND s.status = 'Active'
  `
    )
    .all(classId, yearId) as unknown as ClassEnrollmentItem[];

  if (!enrollments || enrollments.length === 0) {
    return { classId, updatedCount: 0 };
  }

  // Partition into Male and Female
  const males = enrollments.filter((e) => e.gender?.trim().toLowerCase() === 'male');
  const females = enrollments.filter((e) => e.gender?.trim().toLowerCase() === 'female');
  const others = enrollments.filter((e) => {
    const g = e.gender?.trim().toLowerCase();
    return g !== 'male' && g !== 'female';
  });

  // Sort each group by Index Number (numeric ASC, fallback to localeCompare)
  const compareIndex = (a: ClassEnrollmentItem, b: ClassEnrollmentItem) => {
    const numA = getIndexNumeric(a.admission_no);
    const numB = getIndexNumeric(b.admission_no);
    if (numA !== numB) return numA - numB;
    return String(a.admission_no).localeCompare(String(b.admission_no));
  };

  males.sort(compareIndex);
  females.sort(compareIndex);
  others.sort(compareIndex);

  // Ordered list: Boys first, then Girls, then any others
  const orderedList = [...males, ...females, ...others];

  const updateStmt = db.prepare('UPDATE enrollments SET roll_number = ? WHERE id = ?');
  orderedList.forEach((item, index) => {
    const roll = index + 1;
    updateStmt.run(roll, item.enrollment_id);
  });

  return { classId, updatedCount: orderedList.length };
}

/**
 * Recalculates roll numbers for all classes across the school for an academic year.
 */
export function recalculateAllClasses(
  db: DatabaseSync,
  academicYearId?: number
): { classesProcessed: number; totalUpdated: number } {
  let yearId = academicYearId;
  if (!yearId) {
    const activeYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as
      | { id: number }
      | undefined;
    yearId = activeYear?.id;
  }

  if (!yearId) return { classesProcessed: 0, totalUpdated: 0 };

  const classes = db
    .prepare('SELECT DISTINCT class_id FROM enrollments WHERE academic_year_id = ?')
    .all(yearId) as unknown as Array<{ class_id: number }>;

  let totalUpdated = 0;
  for (const c of classes) {
    const res = recalculateClassRollNumbers(db, c.class_id, yearId);
    totalUpdated += res.updatedCount;
  }

  return { classesProcessed: classes.length, totalUpdated };
}
