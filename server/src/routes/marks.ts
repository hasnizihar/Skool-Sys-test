import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, getUserAssignments, canManageMarks, canViewMarksSheet, canAccessClass } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

function calcGradeLetter(score: number | null, isAbsent: boolean, isExempt: boolean): string {
  if (isAbsent) return 'AB';
  if (isExempt) return 'EX';
  if (score === null || score === undefined) return '-';
  if (score >= 75) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'S';
  return 'F';
}

// Marks Sheet for Class, Exam, and Subject
router.get('/sheet', requireAuth, (req, res) => {
  const { examId, classId, subjectId } = req.query;

  if (!examId || !classId || !subjectId) {
    res.status(400).json({ error: 'examId, classId, and subjectId are required.' });
    return;
  }

  const eId = Number(examId);
  const cId = Number(classId);
  const sId = Number(subjectId);

  // Record-level permission check: must be admin or assigned to class/subject
  if (!canViewMarksSheet(req.user!, cId, sId)) {
    res.status(403).json({ error: 'Access denied. You are not assigned to view marks for this class or subject.' });
    return;
  }

  const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(eId);
  const classInfo = db.prepare('SELECT * FROM classes WHERE id = ?').get(cId);
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(sId);

  if (!exam || !classInfo || !subject) {
    res.status(404).json({ error: 'Exam, Class, or Subject not found.' });
    return;
  }

  // Enrolled students with current marks
  const roster = db.prepare(`
    SELECT s.id as student_id, s.admission_no, s.full_name, s.calling_name,
           e.roll_number,
           m.id as mark_id, m.score, m.is_absent, m.is_exempt, m.max_score, m.grade_letter, m.status as mark_status, m.updated_at
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    LEFT JOIN marks m ON m.student_id = s.id AND m.examination_id = ? AND m.subject_id = ? AND m.class_id = ?
    WHERE e.class_id = ? AND e.status = 'enrolled'
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(eId, sId, cId, cId) as any[];

  // Statistics
  let validScores: number[] = [];
  let gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, S: 0, F: 0, AB: 0, EX: 0, unmarked: 0 };

  roster.forEach(r => {
    if (r.is_absent) {
      gradeCounts.AB++;
    } else if (r.is_exempt) {
      gradeCounts.EX++;
    } else if (r.score !== null && r.score !== undefined) {
      validScores.push(Number(r.score));
      const g = r.grade_letter || calcGradeLetter(r.score, false, false);
      if (gradeCounts[g] !== undefined) gradeCounts[g]++;
    } else {
      gradeCounts.unmarked++;
    }
  });

  const totalGraded = validScores.length;
  const avg = totalGraded > 0 ? Math.round((validScores.reduce((a, b) => a + b, 0) / totalGraded) * 10) / 10 : 0;
  const max = totalGraded > 0 ? Math.max(...validScores) : 0;
  const min = totalGraded > 0 ? Math.min(...validScores) : 0;
  const passed = validScores.filter(s => s >= 35).length;
  const passRate = totalGraded > 0 ? Math.round((passed / totalGraded) * 100) : 0;

  res.json({
    exam,
    class: classInfo,
    subject,
    roster,
    stats: {
      totalStudents: roster.length,
      totalGraded,
      average: avg,
      maxScore: max,
      minScore: min,
      passRate,
      gradeCounts
    }
  });
});

// Bulk Save Marks for Subject Sheet
router.post('/sheet', requireAuth, (req, res) => {
  const { examId, classId, subjectId, marks, status } = req.body;
  const user = req.user!;

  if (!examId || !classId || !subjectId || !Array.isArray(marks)) {
    res.status(400).json({ error: 'Missing examId, classId, subjectId, or marks array.' });
    return;
  }

  const eId = Number(examId);
  const cId = Number(classId);
  const sId = Number(subjectId);

  if (!canManageMarks(user, cId, sId)) {
    res.status(403).json({ error: 'Access denied. You are not authorized to enter marks for this class and subject.' });
    return;
  }

  // Ensure marks_sheet exists
  let sheet = db.prepare('SELECT id FROM marks_sheets WHERE examination_id = ? AND class_id = ? AND subject_id = ?').get(eId, cId, sId) as { id: number } | undefined;
  if (!sheet) {
    const classRow = db.prepare('SELECT academic_year_id FROM classes WHERE id = ?').get(cId) as any;
    const examRow = db.prepare('SELECT academic_year_id FROM examinations WHERE id = ?').get(eId) as any;
    const yearId = examRow?.academic_year_id || classRow?.academic_year_id || 1;
    const result = db.prepare(`
      INSERT INTO marks_sheets (examination_id, class_id, subject_id, academic_year_id, teacher_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eId, cId, sId, yearId, user.id, status || 'submitted');
    sheet = { id: Number(result.lastInsertRowid) };
  } else if (status) {
    db.prepare("UPDATE marks_sheets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, sheet.id);
  }

  const upsert = db.prepare(`
    INSERT INTO marks (sheet_id, examination_id, class_id, subject_id, student_id, max_score, score, assessment_status, grade_letter, status, entered_by_user_id, updated_at)
    VALUES (?, ?, ?, ?, ?, 100, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(examination_id, subject_id, student_id) DO UPDATE SET
      sheet_id = excluded.sheet_id,
      score = excluded.score,
      assessment_status = excluded.assessment_status,
      grade_letter = excluded.grade_letter,
      status = excluded.status,
      entered_by_user_id = excluded.entered_by_user_id,
      updated_at = datetime('now')
  `);

  for (const m of marks) {
    const isAbsent = Boolean(m.is_absent);
    const isExempt = Boolean(m.is_exempt);
    let assessmentStatus = 'PRESENT';
    let score: number | null = null;

    if (isAbsent) {
      assessmentStatus = 'ABSENT';
      score = null;
    } else if (isExempt) {
      assessmentStatus = 'EXEMPT';
      score = null;
    } else if (m.score === null || m.score === '' || m.score === undefined) {
      assessmentStatus = 'NOT_ASSESSED';
      score = null;
    } else {
      assessmentStatus = 'PRESENT';
      score = Math.max(0, Math.min(100, Math.round(Number(m.score) * 10) / 10));
    }
    const gradeLetter = calcGradeLetter(score, isAbsent, isExempt);

    upsert.run(
      sheet.id,
      eId, cId, sId, Number(m.student_id),
      score,
      assessmentStatus,
      gradeLetter,
      status || 'submitted',
      user.id
    );
  }

  logAudit(user.id, user.username, 'MARKS_SUBMIT', 'marks', `${eId}-${sId}-${cId}`, { examId: eId, subjectId: sId, count: marks.length }, req.ip);

  res.json({
    success: true,
    message: `Marks sheet saved successfully for ${marks.length} students.`
  });
});

// Student Terminal Report Card
router.get('/student-report/:studentId/:examId', requireAuth, (req, res) => {
  const studentId = Number(req.params.studentId);
  const examId = Number(req.params.examId);

  const student = db.prepare(`
    SELECT s.*, c.id as class_id, c.name as class_name, c.grade, e.roll_number,
           u.full_name as class_teacher_name, ay.name as academic_year
    FROM students s
    JOIN enrollments e ON s.id = e.student_id AND e.status = 'enrolled'
    JOIN classes c ON e.class_id = c.id
    LEFT JOIN users u ON c.class_teacher_id = u.id
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    WHERE s.id = ?
  `).get(studentId) as any;

  if (!student) {
    res.status(404).json({ error: 'Student not enrolled or not found.' });
    return;
  }

  // Record-level permission check: non-admin teachers can only view reports for students in their assigned classes
  if (req.user!.role !== 'admin' && !canAccessClass(req.user!, student.class_id)) {
    res.status(403).json({ error: 'Access denied. You are not assigned to this student\'s class.' });
    return;
  }

  const exam = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examId) as any;
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  // Get marks for all subjects assigned to this class
  const classSubjects = db.prepare(`
    SELECT sub.id as subject_id, sub.code as subject_code, sub.name as subject_name, sub.category,
           m.score, m.is_absent, m.is_exempt, m.max_score, m.grade_letter, m.status as mark_status,
           u.full_name as teacher_name
    FROM class_subjects cs
    JOIN subjects sub ON cs.subject_id = sub.id
    LEFT JOIN marks m ON m.student_id = ? AND m.subject_id = sub.id AND m.examination_id = ?
    LEFT JOIN teacher_assignments ta ON ta.class_id = cs.class_id AND ta.subject_id = sub.id
    LEFT JOIN users u ON ta.teacher_id = u.id
    WHERE cs.class_id = ?
    ORDER BY sub.category ASC, sub.name ASC
  `).all(studentId, examId, student.class_id) as any[];

  // Attendance summary
  const attendance = db.prepare(`
    SELECT 
      COUNT(*) as total_school_days,
      SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present_days,
      SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late_days,
      SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_days
    FROM attendance_records ar
    JOIN attendance_sessions sess ON ar.session_id = sess.id
    WHERE ar.student_id = ? AND sess.class_id = ?
  `).get(studentId, student.class_id) as any;

  // Calculate Student Total, Average & Rank in Class
  let totalScore = 0;
  let gradedCount = 0;

  classSubjects.forEach(s => {
    if (s.score !== null && !s.is_absent && !s.is_exempt) {
      totalScore += Number(s.score);
      gradedCount++;
    }
  });

  const average = gradedCount > 0 ? Math.round((totalScore / gradedCount) * 10) / 10 : 0;

  // Calculate Rank in Class for this Exam
  const classRanks = db.prepare(`
    SELECT m.student_id, AVG(m.score) as student_avg
    FROM marks m
    WHERE m.examination_id = ? AND m.class_id = ? AND m.score IS NOT NULL AND m.is_absent = 0
    GROUP BY m.student_id
    ORDER BY student_avg DESC
  `).all(examId, student.class_id) as any[];

  let rank = '-';
  const foundRankIndex = classRanks.findIndex(r => r.student_id === studentId);
  if (foundRankIndex !== -1) {
    rank = `${foundRankIndex + 1} of ${classRanks.length}`;
  }

  res.json({
    student,
    exam,
    subjects: classSubjects,
    performance: {
      totalScore,
      gradedSubjectCount: gradedCount,
      average,
      rank,
      totalClassStudents: classRanks.length
    },
    attendance: {
      totalSchoolDays: attendance?.total_school_days || 0,
      presentDays: attendance?.present_days || 0,
      lateDays: attendance?.late_days || 0,
      absentDays: attendance?.absent_days || 0,
      attendancePercentage: attendance?.total_school_days > 0 
        ? Math.round(((attendance.present_days + attendance.late_days) / attendance.total_school_days) * 100) 
        : 100
    }
  });
});

export default router;
