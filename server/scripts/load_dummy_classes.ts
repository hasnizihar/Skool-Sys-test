import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATHS = [
  path.resolve('server/skoolsys.db'),
  path.resolve('skoolsys.db')
];

interface ClassDef {
  grade: number;
  name: string;
  sectionName: string;
}

const TARGET_CLASSES: ClassDef[] = [
  // 1. Secondary Section 1 (6-11 / A, B)
  { grade: 6, name: '6A', sectionName: 'Secondary Section 1' },
  { grade: 6, name: '6B', sectionName: 'Secondary Section 1' },
  { grade: 7, name: '7A', sectionName: 'Secondary Section 1' },
  { grade: 7, name: '7B', sectionName: 'Secondary Section 1' },
  { grade: 8, name: '8A', sectionName: 'Secondary Section 1' },
  { grade: 8, name: '8B', sectionName: 'Secondary Section 1' },
  { grade: 9, name: '9A', sectionName: 'Secondary Section 1' },
  { grade: 9, name: '9B', sectionName: 'Secondary Section 1' },
  { grade: 10, name: '10A', sectionName: 'Secondary Section 1' },
  { grade: 10, name: '10B', sectionName: 'Secondary Section 1' },
  { grade: 11, name: '11A', sectionName: 'Secondary Section 1' },
  { grade: 11, name: '11B', sectionName: 'Secondary Section 1' },

  // 2. Secondary Section 2 (6-11 / C, D)
  { grade: 6, name: '6C', sectionName: 'Secondary Section 2' },
  { grade: 6, name: '6D', sectionName: 'Secondary Section 2' },
  { grade: 7, name: '7C', sectionName: 'Secondary Section 2' },
  { grade: 7, name: '7D', sectionName: 'Secondary Section 2' },
  { grade: 8, name: '8C', sectionName: 'Secondary Section 2' },
  { grade: 8, name: '8D', sectionName: 'Secondary Section 2' },
  { grade: 9, name: '9C', sectionName: 'Secondary Section 2' },
  { grade: 9, name: '9D', sectionName: 'Secondary Section 2' },
  { grade: 10, name: '10C', sectionName: 'Secondary Section 2' },
  { grade: 10, name: '10D', sectionName: 'Secondary Section 2' },
  { grade: 11, name: '11C', sectionName: 'Secondary Section 2' },
  { grade: 11, name: '11D', sectionName: 'Secondary Section 2' },

  // 3. Secondary Section 3 (6-11 / E, F)
  { grade: 6, name: '6E', sectionName: 'Secondary Section 3' },
  { grade: 6, name: '6F', sectionName: 'Secondary Section 3' },
  { grade: 7, name: '7E', sectionName: 'Secondary Section 3' },
  { grade: 7, name: '7F', sectionName: 'Secondary Section 3' },
  { grade: 8, name: '8E', sectionName: 'Secondary Section 3' },
  { grade: 8, name: '8F', sectionName: 'Secondary Section 3' },
  { grade: 9, name: '9E', sectionName: 'Secondary Section 3' },
  { grade: 9, name: '9F', sectionName: 'Secondary Section 3' },
  { grade: 10, name: '10E', sectionName: 'Secondary Section 3' },
  { grade: 10, name: '10F', sectionName: 'Secondary Section 3' },
  { grade: 11, name: '11E', sectionName: 'Secondary Section 3' },
  { grade: 11, name: '11F', sectionName: 'Secondary Section 3' },

  // 4. Science Section (12, 13 / Bio, Maths / A, B)
  { grade: 12, name: '12 Bio A', sectionName: 'Science Section' },
  { grade: 12, name: '12 Bio B', sectionName: 'Science Section' },
  { grade: 12, name: '12 Maths A', sectionName: 'Science Section' },
  { grade: 12, name: '12 Maths B', sectionName: 'Science Section' },
  { grade: 13, name: '13 Bio A', sectionName: 'Science Section' },
  { grade: 13, name: '13 Bio B', sectionName: 'Science Section' },
  { grade: 13, name: '13 Maths A', sectionName: 'Science Section' },
  { grade: 13, name: '13 Maths B', sectionName: 'Science Section' },

  // 5. Commerce Section (12, 13 / Commerce / A, B)
  { grade: 12, name: '12 Commerce A', sectionName: 'Commerce Section' },
  { grade: 12, name: '12 Commerce B', sectionName: 'Commerce Section' },
  { grade: 13, name: '13 Commerce A', sectionName: 'Commerce Section' },
  { grade: 13, name: '13 Commerce B', sectionName: 'Commerce Section' },

  // 6. Technology Section (12, 13 / E Tech, B Tech / A, B)
  { grade: 12, name: '12 E Tech A', sectionName: 'Technology Section' },
  { grade: 12, name: '12 E Tech B', sectionName: 'Technology Section' },
  { grade: 12, name: '12 B Tech A', sectionName: 'Technology Section' },
  { grade: 12, name: '12 B Tech B', sectionName: 'Technology Section' },
  { grade: 13, name: '13 E Tech A', sectionName: 'Technology Section' },
  { grade: 13, name: '13 E Tech B', sectionName: 'Technology Section' },
  { grade: 13, name: '13 B Tech A', sectionName: 'Technology Section' },
  { grade: 13, name: '13 B Tech B', sectionName: 'Technology Section' },

  // 7. Arts Section (12, 13 / Arts / A, B)
  { grade: 12, name: '12 Arts A', sectionName: 'Arts Section' },
  { grade: 12, name: '12 Arts B', sectionName: 'Arts Section' },
  { grade: 13, name: '13 Arts A', sectionName: 'Arts Section' },
  { grade: 13, name: '13 Arts B', sectionName: 'Arts Section' },
];

const RENAMES: Record<string, string> = {
  'Grade 7-A': '7A',
  'Grade 7-B': '7B',
  'Grade 8-A': '8A',
  'Grade 8-B': '8B',
  'Grade 9-A': '9A',
  'Grade 9-B': '9B',
  'Grade 10-A': '10A',
  'Grade 10-B': '10B',
  'Grade 11-A': '11A',
  'Grade 11-B': '11B',
  'Grade 12-Science': '12 Bio A',
  '12 Bio': '12 Bio B',
  'Grade 12-Commerce': '12 Commerce A',
  'Grade 12-Arts': '12 Arts A',
  'Grade 13-Science': '13 Bio A',
  'Grade 13-Commerce': '13 Commerce A',
  'Grade 13-Arts': '13 Arts A',
};

for (const dbPath of DB_PATHS) {
  if (!fs.existsSync(dbPath)) continue;
  console.log(`\n========================================`);
  console.log(`Processing Database: ${dbPath}`);
  console.log(`========================================`);

  const db = new DatabaseSync(dbPath);

  // 1. Ensure sections exist with proper grade ranges
  const SECTIONS_CONFIG = [
    { name: 'Secondary Section 1', grade_range: '6-11' },
    { name: 'Secondary Section 2', grade_range: '6-11' },
    { name: 'Secondary Section 3', grade_range: '6-11' },
    { name: 'Science Section', grade_range: '12-13' },
    { name: 'Commerce Section', grade_range: '12-13' },
    { name: 'Technology Section', grade_range: '12-13' },
    { name: 'Arts Section', grade_range: '12-13' },
  ];

  for (const sec of SECTIONS_CONFIG) {
    const existing = db.prepare('SELECT id FROM sections WHERE name = ?').get(sec.name) as { id: number } | undefined;
    if (existing) {
      db.prepare('UPDATE sections SET grade_range = ? WHERE id = ?').run(sec.grade_range, existing.id);
    } else {
      db.prepare('INSERT INTO sections (name, grade_range) VALUES (?, ?)').run(sec.name, sec.grade_range);
    }
  }

  // Build section ID lookup
  const sectionsMap = new Map<string, number>();
  const allSecs = db.prepare('SELECT id, name FROM sections').all() as { id: number; name: string }[];
  for (const s of allSecs) {
    sectionsMap.set(s.name, s.id);
  }

  // Academic year
  let yearRow = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number } | undefined;
  if (!yearRow) {
    yearRow = db.prepare('SELECT id FROM academic_years LIMIT 1').get() as { id: number } | undefined;
  }
  const yearId = yearRow ? yearRow.id : 1;

  // Active Teachers for class assignment
  const teachers = db.prepare("SELECT id FROM users WHERE role IN ('class_teacher', 'subject_teacher') AND is_active = 1").all() as { id: number }[];
  const teacherIds = teachers.map((t) => t.id);
  let teacherIndex = 0;

  // 2. Rename existing classes
  for (const [oldName, newName] of Object.entries(RENAMES)) {
    const existing = db.prepare('SELECT id FROM classes WHERE name = ?').get(oldName) as { id: number } | undefined;
    if (existing) {
      db.prepare('UPDATE classes SET name = ? WHERE id = ?').run(newName, existing.id);
      console.log(`Renamed class '${oldName}' -> '${newName}'`);
    }
  }

  // 3. Insert or update classes
  let createdCount = 0;
  let updatedCount = 0;

  for (const cls of TARGET_CLASSES) {
    const secId = sectionsMap.get(cls.sectionName);
    if (!secId) {
      console.warn(`Section not found: ${cls.sectionName}`);
      continue;
    }

    const assignedTeacherId = teacherIds.length > 0 ? teacherIds[teacherIndex % teacherIds.length] : null;
    teacherIndex++;

    const existingClass = db.prepare('SELECT id, section_id, class_teacher_id FROM classes WHERE name = ? AND grade = ?').get(cls.name, cls.grade) as { id: number; section_id: number | null; class_teacher_id: number | null } | undefined;

    if (existingClass) {
      db.prepare('UPDATE classes SET section_id = ?, academic_year_id = ? WHERE id = ?').run(secId, yearId, existingClass.id);
      if (!existingClass.class_teacher_id && assignedTeacherId) {
        db.prepare('UPDATE classes SET class_teacher_id = ? WHERE id = ?').run(assignedTeacherId, existingClass.id);
      }
      updatedCount++;
    } else {
      const res = db.prepare(`
        INSERT INTO classes (grade, name, academic_year_id, class_teacher_id, section_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(cls.grade, cls.name, yearId, assignedTeacherId, secId);
      const newClassId = Number(res.lastInsertRowid);

      if (assignedTeacherId) {
        db.prepare(`
          INSERT OR IGNORE INTO teacher_assignments (teacher_id, class_id, assignment_type, academic_year_id)
          VALUES (?, ?, 'class_teacher', ?)
        `).run(assignedTeacherId, newClassId, yearId);
      }
      createdCount++;
    }
  }

  // 4. Ensure Section Head Assignments for all 7 sections
  // Assign Section Head users (ids 27 and 28 if available, or first available teachers)
  const sh6to9 = db.prepare("SELECT id FROM users WHERE username = 'section_head_junior'").get() as { id: number } | undefined;
  const sh10to13 = db.prepare("SELECT id FROM users WHERE username = 'section_head_senior'").get() as { id: number } | undefined;

  const juniorHeadId = sh6to9?.id || teacherIds[0];
  const seniorHeadId = sh10to13?.id || teacherIds[1] || teacherIds[0];

  const shaAssignments = [
    { secName: 'Secondary Section 1', userId: juniorHeadId },
    { secName: 'Secondary Section 2', userId: juniorHeadId },
    { secName: 'Secondary Section 3', userId: juniorHeadId },
    { secName: 'Science Section', userId: seniorHeadId },
    { secName: 'Commerce Section', userId: seniorHeadId },
    { secName: 'Technology Section', userId: seniorHeadId },
    { secName: 'Arts Section', userId: seniorHeadId },
  ];

  for (const sha of shaAssignments) {
    const secId = sectionsMap.get(sha.secName);
    if (secId && sha.userId) {
      db.prepare(`
        INSERT OR IGNORE INTO section_head_assignments (section_id, user_id)
        VALUES (?, ?)
      `).run(secId, sha.userId);
    }
  }

  console.log(`Summary for ${dbPath}:`);
  console.log(`  Created classes: ${createdCount}`);
  console.log(`  Updated classes: ${updatedCount}`);
  const totalClasses = db.prepare('SELECT count(*) as count FROM classes').get() as { count: number };
  console.log(`  Total classes in database: ${totalClasses.count}`);

  db.close();
}
