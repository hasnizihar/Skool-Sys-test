import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

function seedYearAttendance() {
  const dbPath = path.resolve('server/skoolsys.db');
  console.log('Target database:', dbPath);
  const db = new DatabaseSync(dbPath);

  // 1. Get current academic year 2026
  const year = db.prepare("SELECT id, name FROM academic_years WHERE name = '2026'").get() as { id: number; name: string } | undefined;
  if (!year) {
    console.error('Academic year 2026 not found.');
    return;
  }

  // 2. Get teachers and classes with students (Secondary Section 1 classes 6A - 11B + 12 Bio A, etc.)
  const classes = db.prepare(`
    SELECT c.id, c.name, c.grade, c.section_id, s.name as section_name
    FROM classes c
    JOIN sections s ON c.section_id = s.id
    WHERE s.id = 4
    ORDER BY c.grade, c.name
  `).all() as any[];

  console.log(`Found ${classes.length} classes in Secondary Section 1`);

  const teacher = db.prepare("SELECT id FROM users WHERE role = 'class_teacher' OR role = 'admin' LIMIT 1").get() as { id: number };
  const teacherId = teacher ? teacher.id : 1;

  // 3. Calculate all Sri Lankan school term days in 2026 (Mon-Fri)
  const pad = (n: number) => String(n).padStart(2, '0');
  const termRanges = [
    ['2026-01-12', '2026-04-10'], // Term 1
    ['2026-04-27', '2026-08-07'], // Term 2
    ['2026-08-24', '2026-11-20']  // Term 3 up to today
  ];

  const schoolDays: string[] = [];
  for (const [start, end] of termRanges) {
    let curr = new Date(start);
    const stop = new Date(end);
    while (curr <= stop) {
      const dow = curr.getDay();
      if (dow >= 1 && dow <= 5) {
        schoolDays.push(`${curr.getFullYear()}-${pad(curr.getMonth() + 1)}-${pad(curr.getDate())}`);
      }
      curr.setDate(curr.getDate() + 1);
    }
  }

  console.log(`Total school days to populate: ${schoolDays.length}`);

  // Prepared statements
  const checkSession = db.prepare("SELECT id FROM attendance_sessions WHERE class_id = ? AND date = ?");
  const insertSession = db.prepare(`
    INSERT INTO attendance_sessions (uuid, class_id, date, academic_year_id, taken_by_user_id, status, notes)
    VALUES (?, ?, ?, ?, ?, 'submitted', ?)
  `);

  const getEnrollments = db.prepare("SELECT student_id FROM enrollments WHERE class_id = ?");
  const checkRecord = db.prepare("SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?");
  const insertRecord = db.prepare(`
    INSERT INTO attendance_records (session_id, student_id, status, remarks)
    VALUES (?, ?, ?, ?)
  `);

  let totalSessionsCreated = 0;
  let totalRecordsCreated = 0;

  db.exec('BEGIN TRANSACTION;');

  try {
    for (const cls of classes) {
      const students = getEnrollments.all(cls.id) as { student_id: number }[];
      if (students.length === 0) continue;

      for (let dayIdx = 0; dayIdx < schoolDays.length; dayIdx++) {
        const dt = schoolDays[dayIdx];
        let sess = checkSession.get(cls.id, dt) as { id: number } | undefined;

        if (!sess) {
          const uuid = `sess-${cls.id}-${dt}`;
          insertSession.run(uuid, cls.id, dt, year.id, teacherId, `Daily register for ${cls.name}`);
          sess = db.prepare("SELECT id FROM attendance_sessions WHERE uuid = ?").get(uuid) as { id: number };
          totalSessionsCreated++;
        }

        for (let sIdx = 0; sIdx < students.length; sIdx++) {
          const studentId = students[sIdx].student_id;
          const existing = checkRecord.get(sess.id, studentId);
          if (existing) continue;

          // Realistic pseudo-random deterministic variation based on studentId and dayIdx
          const seedVal = (studentId * 31 + dayIdx * 17) % 100;
          let status = 'present';
          let remarks = 'Normal attendance';

          if (seedVal === 0 || seedVal === 5 || seedVal === 15) {
            status = 'absent';
            const reasons = ['Fever / Medical leave', 'Family function', 'Transportation issue', 'Personal urgent matter'];
            remarks = reasons[(studentId + dayIdx) % reasons.length];
          } else if (seedVal === 11 || seedVal === 22) {
            status = 'late';
            const lateReasons = ['School bus delayed 15 mins', 'Heavy morning rain', 'Traffic congestion'];
            remarks = lateReasons[(studentId + dayIdx) % lateReasons.length];
          } else if (seedVal === 99) {
            status = 'excused';
            remarks = 'Representing school in regional competition';
          }

          insertRecord.run(sess.id, studentId, status, remarks);
          totalRecordsCreated++;
        }
      }
    }

    db.exec('COMMIT;');
    console.log(`Successfully created ${totalSessionsCreated} sessions and ${totalRecordsCreated} attendance records.`);
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Failed to populate attendance:', err);
    throw err;
  }
}

seedYearAttendance();
