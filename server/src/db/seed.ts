import { db, initDatabase } from './database.js';
import bcrypt from 'bcryptjs';

export function runSeed() {
  initDatabase();

  console.log('🌱 Starting SkoolSys database seed...');

  // 1. Academic Year
  db.exec("DELETE FROM attendance_records;");
  db.exec("DELETE FROM attendance_sessions;");
  db.exec("DELETE FROM marks;");
  db.exec("DELETE FROM examinations;");
  db.exec("DELETE FROM enrollments;");
  db.exec("DELETE FROM teacher_assignments;");
  db.exec("DELETE FROM class_subjects;");
  db.exec("DELETE FROM classes;");
  db.exec("DELETE FROM subjects;");
  db.exec("DELETE FROM students;");
  db.exec("DELETE FROM users;");
  db.exec("DELETE FROM academic_years;");
  db.exec("DELETE FROM audit_logs;");

  const yearStmt = db.prepare(`
    INSERT INTO academic_years (name, start_date, end_date, is_current)
    VALUES (?, ?, ?, ?)
  `);
  yearStmt.run('2026', '2026-01-05', '2026-12-15', 1);
  const currentYear = db.prepare("SELECT id FROM academic_years WHERE name = '2026'").get() as { id: number };

  // 2. Users
  const salt = bcrypt.genSaltSync(10);
  const adminPass = bcrypt.hashSync('admin123', salt);
  const teacherPass = bcrypt.hashSync('teacher123', salt);

  const userStmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  userStmt.run('admin', 'admin@skoolsys.edu', adminPass, 'Dr. Anura Bandara (Principal / Admin)', 'admin');
  userStmt.run('teacher_nimali', 'nimali.perera@skoolsys.edu', teacherPass, 'Mrs. Nimali Perera', 'class_teacher');
  userStmt.run('teacher_samantha', 'samantha.silva@skoolsys.edu', teacherPass, 'Mr. Samantha Silva', 'subject_teacher');
  userStmt.run('teacher_priya', 'priya.wickrama@skoolsys.edu', teacherPass, 'Ms. Priyanthi Wickramasinghe', 'subject_teacher');

  const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number };
  const teacherNimali = db.prepare("SELECT id FROM users WHERE username = 'teacher_nimali'").get() as { id: number };
  const teacherSamantha = db.prepare("SELECT id FROM users WHERE username = 'teacher_samantha'").get() as { id: number };
  const teacherPriya = db.prepare("SELECT id FROM users WHERE username = 'teacher_priya'").get() as { id: number };

  // 3. Classes (Grades 6 to 13)
  const classStmt = db.prepare(`
    INSERT INTO classes (grade, name, room_number, academic_year_id, class_teacher_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  classStmt.run(6, 'Grade 6-A', 'Block A - 101', currentYear.id, null);
  classStmt.run(6, 'Grade 6-B', 'Block A - 102', currentYear.id, null);
  classStmt.run(7, 'Grade 7-A', 'Block A - 201', currentYear.id, null);
  classStmt.run(7, 'Grade 7-B', 'Block A - 202', currentYear.id, null);
  classStmt.run(8, 'Grade 8-A', 'Block B - 101', currentYear.id, teacherNimali.id);
  classStmt.run(8, 'Grade 8-B', 'Block B - 102', currentYear.id, null);
  classStmt.run(9, 'Grade 9-A', 'Block B - 201', currentYear.id, null);
  classStmt.run(9, 'Grade 9-B', 'Block B - 202', currentYear.id, null);
  classStmt.run(10, 'Grade 10-A', 'Block C - 101', currentYear.id, null);
  classStmt.run(10, 'Grade 10-B', 'Block C - 102', currentYear.id, null);
  classStmt.run(11, 'Grade 11-A', 'Block C - 201', currentYear.id, null);
  classStmt.run(11, 'Grade 11-B', 'Block C - 202', currentYear.id, null);
  classStmt.run(12, 'Grade 12-Science', 'Science Lab 1', currentYear.id, null);
  classStmt.run(12, 'Grade 12-Commerce', 'Block D - 101', currentYear.id, null);
  classStmt.run(12, 'Grade 12-Arts', 'Block D - 201', currentYear.id, null);
  classStmt.run(13, 'Grade 13-Science', 'Science Lab 2', currentYear.id, null);
  classStmt.run(13, 'Grade 13-Commerce', 'Block D - 102', currentYear.id, null);
  classStmt.run(13, 'Grade 13-Arts', 'Block D - 202', currentYear.id, null);

  const grade8A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 8-A'").get() as { id: number };
  const grade8B = db.prepare("SELECT id FROM classes WHERE name = 'Grade 8-B'").get() as { id: number };
  const grade11A = db.prepare("SELECT id FROM classes WHERE name = 'Grade 11-A'").get() as { id: number };

  // 4. Subjects
  const subjectStmt = db.prepare(`
    INSERT INTO subjects (code, name, category, grade_level)
    VALUES (?, ?, ?, ?)
  `);

  subjectStmt.run('MATH', 'Mathematics', 'Core', '6-11');
  subjectStmt.run('SCI', 'Science', 'Core', '6-11');
  subjectStmt.run('ENG', 'English Language', 'Core', '6-13');
  subjectStmt.run('SIN', 'Sinhala Language & Lit.', 'Core', '6-11');
  subjectStmt.run('HIST', 'History', 'Core', '6-11');
  subjectStmt.run('ICT', 'Info. & Comm. Technology', 'Science', '6-13');
  subjectStmt.run('HPE', 'Health & Physical Education', 'Core', '6-11');
  subjectStmt.run('ART', 'Art & Aesthetics', 'Aesthetic', '6-11');
  subjectStmt.run('COMM', 'Commerce & Accounting', 'Commerce', '10-11');
  subjectStmt.run('PHY', 'Physics', 'Science', '12-13');
  subjectStmt.run('CHEM', 'Chemistry', 'Science', '12-13');
  subjectStmt.run('CMATH', 'Combined Mathematics', 'Science', '12-13');

  const math = db.prepare("SELECT id FROM subjects WHERE code = 'MATH'").get() as { id: number };
  const sci = db.prepare("SELECT id FROM subjects WHERE code = 'SCI'").get() as { id: number };
  const eng = db.prepare("SELECT id FROM subjects WHERE code = 'ENG'").get() as { id: number };
  const sin = db.prepare("SELECT id FROM subjects WHERE code = 'SIN'").get() as { id: number };
  const hist = db.prepare("SELECT id FROM subjects WHERE code = 'HIST'").get() as { id: number };
  const ict = db.prepare("SELECT id FROM subjects WHERE code = 'ICT'").get() as { id: number };
  const hpe = db.prepare("SELECT id FROM subjects WHERE code = 'HPE'").get() as { id: number };
  const art = db.prepare("SELECT id FROM subjects WHERE code = 'ART'").get() as { id: number };

  // Class subjects for Grade 8-A
  const classSubStmt = db.prepare(`INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)`);
  [math, sci, eng, sin, hist, ict, hpe, art].forEach(s => {
    classSubStmt.run(grade8A.id, s.id);
    classSubStmt.run(grade8B.id, s.id);
  });

  // 5. Teacher Assignments
  const assignStmt = db.prepare(`
    INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, assignment_type, academic_year_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Mrs. Nimali is class teacher of Grade 8-A and teaches English in 8-A
  assignStmt.run(teacherNimali.id, grade8A.id, null, 'class_teacher', currentYear.id);
  assignStmt.run(teacherNimali.id, grade8A.id, eng.id, 'subject_teacher', currentYear.id);

  // Mr. Samantha Silva teaches Mathematics in 8-A, 8-B, 11-A
  assignStmt.run(teacherSamantha.id, grade8A.id, math.id, 'subject_teacher', currentYear.id);
  assignStmt.run(teacherSamantha.id, grade8B.id, math.id, 'subject_teacher', currentYear.id);
  assignStmt.run(teacherSamantha.id, grade11A.id, math.id, 'subject_teacher', currentYear.id);

  // Ms. Priyanthi teaches Science in 8-A, 8-B
  assignStmt.run(teacherPriya.id, grade8A.id, sci.id, 'subject_teacher', currentYear.id);
  assignStmt.run(teacherPriya.id, grade8B.id, sci.id, 'subject_teacher', currentYear.id);

  // 6. Students & Enrollments (Realistic Grade 8-A roster)
  const studentData = [
    { adm: 'SCH-2024-001', name: 'Kasun Malinda Ranasinghe', call: 'Kasun', dob: '2012-03-14', gender: 'Male', gName: 'Sunil Ranasinghe', gRel: 'Father', phone: '0771234567', addr: 'No 45, Temple Road, Colombo 05' },
    { adm: 'SCH-2024-002', name: 'Tharushi Nilakshi Fernando', call: 'Tharushi', dob: '2012-05-22', gender: 'Female', gName: 'Kamal Fernando', gRel: 'Father', phone: '0712345678', addr: 'No 12/A, Station Lane, Dehiwala' },
    { adm: 'SCH-2024-003', name: 'Dineth Sathsara Jayawardena', call: 'Dineth', dob: '2012-01-19', gender: 'Male', gName: 'Rohan Jayawardena', gRel: 'Father', phone: '0763456789', addr: '23, Galle Road, Mount Lavinia' },
    { adm: 'SCH-2024-004', name: 'Chamodi Sandunika Senanayake', call: 'Chamodi', dob: '2012-07-08', gender: 'Female', gName: 'Malini Senanayake', gRel: 'Mother', phone: '0784567890', addr: '56, School Lane, Moratuwa' },
    { adm: 'SCH-2024-005', name: 'Kavindu Theekshana Weerasinghe', call: 'Kavindu', dob: '2012-09-15', gender: 'Male', gName: 'Prasanna Weerasinghe', gRel: 'Father', phone: '0755678901', addr: '89, Kandy Road, Kiribathgoda' },
    { adm: 'SCH-2024-006', name: 'Oshadi Bhagya Wickramasinghe', call: 'Oshadi', dob: '2012-11-30', gender: 'Female', gName: 'Chithra Wickramasinghe', gRel: 'Mother', phone: '0716789012', addr: '104, Hill Street, Nugegoda' },
    { adm: 'SCH-2024-007', name: 'Bawantha Nimnada Abeykoon', call: 'Bawantha', dob: '2012-04-05', gender: 'Male', gName: 'Ajith Abeykoon', gRel: 'Father', phone: '0777890123', addr: '71, High Level Rd, Maharagama' },
    { adm: 'SCH-2024-008', name: 'Hiruni Himasha Dissanayake', call: 'Hiruni', dob: '2012-08-12', gender: 'Female', gName: 'Sujith Dissanayake', gRel: 'Father', phone: '0728901234', addr: '15, Park Avenue, Rajagiriya' },
    { adm: 'SCH-2024-009', name: 'Akeel Mohamed Rizwan', call: 'Akeel', dob: '2012-02-28', gender: 'Male', gName: 'Mohamed Rizwan', gRel: 'Father', phone: '0779012345', addr: '34, Main Street, Dematagoda' },
    { adm: 'SCH-2024-010', name: 'Dilini Hansika Ratnayake', call: 'Dilini', dob: '2012-06-17', gender: 'Female', gName: 'Gamini Ratnayake', gRel: 'Father', phone: '0760123456', addr: '92, Circular Road, Kotte' },
    { adm: 'SCH-2024-011', name: 'Sahan Prabhashwara Gunathilake', call: 'Sahan', dob: '2012-10-03', gender: 'Male', gName: 'Bandula Gunathilake', gRel: 'Father', phone: '0781234567', addr: '18, Lake Road, Battaramulla' },
    { adm: 'SCH-2024-012', name: 'Methmi Rashmika Kulatunga', call: 'Methmi', dob: '2012-12-25', gender: 'Female', gName: 'Deepani Kulatunga', gRel: 'Mother', phone: '0752345678', addr: '63, Hospital Road, Kalubowila' },
    { adm: 'SCH-2024-013', name: 'Sithum Nimsara Karunaratne', call: 'Sithum', dob: '2012-01-11', gender: 'Male', gName: 'Nihal Karunaratne', gRel: 'Father', phone: '0713456789', addr: '41, Jaya Road, Wellawatte' },
    { adm: 'SCH-2024-014', name: 'Praveena Janani Warnakulasuriya', call: 'Praveena', dob: '2012-04-19', gender: 'Female', gName: 'Anthony Warnakulasuriya', gRel: 'Father', phone: '0774567890', addr: '09, Church Lane, Wattala' },
    { adm: 'SCH-2024-015', name: 'Naveen Lakshan Alahakoon', call: 'Naveen', dob: '2012-07-27', gender: 'Male', gName: 'Sarath Alahakoon', gRel: 'Father', phone: '0725678901', addr: '82, Old Road, Pannipitiya' },
    { adm: 'SCH-2024-016', name: 'Sanduni Kaushalya Samaraweera', call: 'Sanduni', dob: '2012-09-02', gender: 'Female', gName: 'Anoma Samaraweera', gRel: 'Mother', phone: '0766789012', addr: '27, Cross Road, Malabe' },
    { adm: 'SCH-2024-017', name: 'Thevindu Hasaranga Mendis', call: 'Thevindu', dob: '2012-03-21', gender: 'Male', gName: 'Upali Mendis', gRel: 'Father', phone: '0787890123', addr: '50, Riverside, Kelaniya' },
    { adm: 'SCH-2024-018', name: 'Anuki Dahamya Jayasuriya', call: 'Anuki', dob: '2012-08-30', gender: 'Female', gName: 'Priyantha Jayasuriya', gRel: 'Father', phone: '0758901234', addr: '11, Flower Terrace, Colombo 07' },
    { adm: 'SCH-2024-019', name: 'Lithira Senhas Hettiarachchi', call: 'Lithira', dob: '2012-10-14', gender: 'Male', gName: 'Lalith Hettiarachchi', gRel: 'Father', phone: '0719012345', addr: '38, Sri Sumangala Mawatha, Panadura' },
    { adm: 'SCH-2024-020', name: 'Vethum Sanjaya Rajapaksha', call: 'Vethum', dob: '2012-05-09', gender: 'Male', gName: 'Janaka Rajapaksha', gRel: 'Father', phone: '0770123456', addr: '99, Moragaha Lane, Piliyandala' }
  ];

  const studentInsert = db.prepare(`
    INSERT INTO students (
      admission_no, full_name, calling_name, dob, gender, address,
      guardian_name, guardian_relation, guardian_phone, guardian_email, emergency_contact, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
  `);

  const enrollInsert = db.prepare(`
    INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status)
    VALUES (?, ?, ?, ?, 'enrolled')
  `);

  const createdStudents: number[] = [];

  studentData.forEach((s, idx) => {
    studentInsert.run(
      s.adm, s.name, s.call, s.dob, s.gender, s.addr,
      s.gName, s.gRel, s.phone, `${s.call.toLowerCase()}@family.lk`, s.phone
    );
    const st = db.prepare("SELECT id FROM students WHERE admission_no = ?").get(s.adm) as { id: number };
    createdStudents.push(st.id);
    enrollInsert.run(st.id, grade8A.id, currentYear.id, idx + 1);
  });

  // 7. Attendance Sessions & Records (for the last 5 days)
  const sessionInsert = db.prepare(`
    INSERT INTO attendance_sessions (uuid, class_id, date, academic_year_id, taken_by_user_id, status, notes)
    VALUES (?, ?, ?, ?, ?, 'submitted', ?)
  `);

  const recordInsert = db.prepare(`
    INSERT INTO attendance_records (session_id, student_id, status, remarks)
    VALUES (?, ?, ?, ?)
  `);

  const recentDates = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
  recentDates.forEach((dt, dayIdx) => {
    const uuid = `session-8a-${dt}`;
    sessionInsert.run(uuid, grade8A.id, dt, currentYear.id, teacherNimali.id, `Daily register for Grade 8-A`);
    const sess = db.prepare("SELECT id FROM attendance_sessions WHERE uuid = ?").get(uuid) as { id: number };

    createdStudents.forEach((studentId, sIdx) => {
      let status = 'present';
      let remarks = '';
      if ((sIdx + dayIdx) % 15 === 0) {
        status = 'absent';
        remarks = 'Sick leave requested';
      } else if ((sIdx + dayIdx) % 11 === 0) {
        status = 'late';
        remarks = 'School bus delayed 15 mins';
      } else if ((sIdx + dayIdx) % 19 === 0) {
        status = 'excused';
        remarks = 'Representing school chess team';
      }
      recordInsert.run(sess.id, studentId, status, remarks);
    });
  });

  // 8. Examinations
  const examStmt = db.prepare(`
    INSERT INTO examinations (name, term, academic_year_id, start_date, end_date, is_published)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  examStmt.run('Term 1 Assessment 2026', 1, currentYear.id, '2026-03-20', '2026-03-31', 1);
  examStmt.run('Mid-Year Examination 2026', 2, currentYear.id, '2026-07-15', '2026-07-28', 0);
  examStmt.run('Year-End Final Examination 2026', 3, currentYear.id, '2026-11-20', '2026-12-05', 0);

  const term1Exam = db.prepare("SELECT id FROM examinations WHERE name = 'Term 1 Assessment 2026'").get() as { id: number };

  // 9. Marks
  const marksInsert = db.prepare(`
    INSERT INTO marks (examination_id, class_id, subject_id, student_id, score, max_score, grade_letter, status, entered_by_user_id)
    VALUES (?, ?, ?, ?, ?, 100, ?, 'published', ?)
  `);

  function calcGrade(score: number): string {
    if (score >= 75) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    if (score >= 35) return 'S';
    return 'F';
  }

  // Populate marks for Mathematics, Science, and English
  const subjectsToScore = [
    { sub: math, user: teacherSamantha.id, base: 78 },
    { sub: sci, user: teacherPriya.id, base: 72 },
    { sub: eng, user: teacherNimali.id, base: 82 }
  ];

  subjectsToScore.forEach(({ sub, user, base }) => {
    createdStudents.forEach((studentId, idx) => {
      // Deterministic realistic variance
      const variance = ((idx * 7) % 35) - 15;
      let score = Math.min(98, Math.max(30, base + variance));
      const grade = calcGrade(score);
      marksInsert.run(term1Exam.id, grade8A.id, sub.id, studentId, score, grade, user);
    });
  });

  // 10. Audit log entries
  const auditInsert = db.prepare(`
    INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  auditInsert.run(adminUser.id, 'admin', 'SYSTEM_INIT', 'System', '0', JSON.stringify({ message: 'Initial MVP system database setup and school seed completed.' }));
  auditInsert.run(teacherNimali.id, 'teacher_nimali', 'ATTENDANCE_SUBMIT', 'attendance_sessions', recentDates[4], JSON.stringify({ class: 'Grade 8-A', recordsCount: createdStudents.length }));
  auditInsert.run(teacherSamantha.id, 'teacher_samantha', 'MARKS_SUBMIT', 'marks', `${term1Exam.id}-MATH`, JSON.stringify({ class: 'Grade 8-A', subject: 'Mathematics', exam: 'Term 1 Assessment 2026' }));

  console.log('✅ SkoolSys Database seeded successfully with:');
  console.log('   - 1 Academic Year (2026)');
  console.log('   - 4 System Users (Admin, Class Teacher, Subject Teachers)');
  console.log('   - 18 Classes (Grades 6 to 13)');
  console.log('   - 12 Core & Secondary Subjects');
  console.log('   - 20 Full Student Profiles enrolled in Grade 8-A');
  console.log('   - 5 Days of Class Attendance records');
  console.log('   - 3 Examination definitions & Full Term 1 marks for Math, Science, English');
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed();
}
