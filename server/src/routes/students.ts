import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, requireRole, getUserAssignments } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// List Students with Search and Filters
router.get('/', requireAuth, (req, res) => {
  const { q, grade, classId, status } = req.query;
  const user = req.user!;

  let sql = `
    SELECT s.*, c.id as class_id, c.name as class_name, c.grade, e.roll_number
    FROM students s
    LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'enrolled'
    LEFT JOIN classes c ON e.class_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];

  // Role Scoping
  if (user.role === 'class_teacher') {
    const assignments = getUserAssignments(user.id);
    if (assignments.assignedClassIds.length > 0) {
      const placeholders = assignments.assignedClassIds.map(() => '?').join(',');
      sql += ` AND c.id IN (${placeholders})`;
      params.push(...assignments.assignedClassIds);
    } else {
      sql += ` AND 1=0`; // No assigned classes
    }
  }

  // Filters
  if (q && typeof q === 'string') {
    const searchPattern = `%${q.trim()}%`;
    sql += ` AND (s.admission_no LIKE ? OR s.full_name LIKE ? OR s.calling_name LIKE ? OR s.guardian_phone LIKE ? OR s.guardian_name LIKE ?)`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (grade) {
    sql += ` AND c.grade = ?`;
    params.push(Number(grade));
  }

  if (classId) {
    sql += ` AND c.id = ?`;
    params.push(Number(classId));
  }

  if (status) {
    sql += ` AND s.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY c.grade ASC, c.name ASC, e.roll_number ASC, s.admission_no ASC`;

  const students = db.prepare(sql).all(...params);
  res.json({ students, count: students.length });
});

// Get Single Student Detail
router.get('/:id', requireAuth, (req, res) => {
  const studentId = Number(req.params.id);

  const student = db.prepare(`
    SELECT s.*, c.id as class_id, c.name as class_name, c.grade, e.roll_number, ay.name as academic_year
    FROM students s
    LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'enrolled'
    LEFT JOIN classes c ON e.class_id = c.id
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    WHERE s.id = ?
  `).get(studentId) as any;

  if (!student) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  // Attendance stats for student
  const attendanceStats = db.prepare(`
    SELECT 
      COUNT(*) as total_days,
      SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days,
      SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days,
      SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_days,
      SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) as excused_days
    FROM attendance_records
    WHERE student_id = ?
  `).get(studentId) as any;

  const total = Number(attendanceStats?.total_days || 0);
  const present = Number(attendanceStats?.present_days || 0);
  const late = Number(attendanceStats?.late_days || 0);
  const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 100;

  // Recent Exam Marks
  const marks = db.prepare(`
    SELECT m.*, sub.name as subject_name, sub.code as subject_code, ex.name as examination_name, ex.term
    FROM marks m
    JOIN subjects sub ON m.subject_id = sub.id
    JOIN examinations ex ON m.examination_id = ex.id
    WHERE m.student_id = ?
    ORDER BY ex.term DESC, sub.name ASC
  `).all(studentId);

  res.json({
    student,
    attendance: {
      ...attendanceStats,
      attendanceRate
    },
    marks
  });
});

// Create Student (Admin only)
router.post('/', requireAuth, requireRole(['admin']), (req, res) => {
  const {
    admission_no, full_name, calling_name, dob, gender, address,
    guardian_name, guardian_relation, guardian_phone, guardian_email,
    guardian_nic, emergency_contact, class_id, roll_number
  } = req.body;

  if (!admission_no || !full_name || !dob || !gender || !guardian_name || !guardian_phone) {
    res.status(400).json({ error: 'Missing required student fields.' });
    return;
  }

  // Check unique admission_no
  const existing = db.prepare('SELECT id FROM students WHERE admission_no = ?').get(admission_no);
  if (existing) {
    res.status(400).json({ error: `Admission Number ${admission_no} is already assigned to another student.` });
    return;
  }

  // Duplicate warning detection by full name and dob
  const nameDobMatch = db.prepare('SELECT id, admission_no FROM students WHERE LOWER(full_name) = LOWER(?) AND dob = ?').get(full_name, dob) as any;
  if (nameDobMatch) {
    res.status(409).json({
      error: `Potential duplicate student: A student with name "${full_name}" and DOB "${dob}" already exists with Admission No: ${nameDobMatch.admission_no}.`
    });
    return;
  }

  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };

  const insertStudent = db.prepare(`
    INSERT INTO students (
      admission_no, full_name, calling_name, dob, gender, address,
      guardian_name, guardian_relation, guardian_phone, guardian_email,
      guardian_nic, emergency_contact, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
  `);

  const result = insertStudent.run(
    admission_no.trim(), full_name.trim(), calling_name?.trim() || full_name.split(' ')[0],
    dob, gender, address || null, guardian_name.trim(), guardian_relation || 'Parent',
    guardian_phone.trim(), guardian_email || null, guardian_nic || null,
    emergency_contact || guardian_phone,
  );

  const newStudentId = Number(result.lastInsertRowid);

  // Enroll in class if provided
  if (class_id && currentYear) {
    const enrollStmt = db.prepare(`
      INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status)
      VALUES (?, ?, ?, ?, 'enrolled')
    `);
    enrollStmt.run(newStudentId, Number(class_id), currentYear.id, roll_number ? Number(roll_number) : null);
  }

  logAudit(req.user!.id, req.user!.username, 'STUDENT_CREATE', 'students', newStudentId, { admission_no, full_name, class_id }, req.ip);

  res.status(201).json({ success: true, studentId: newStudentId });
});

// Update Student (Admin only)
router.put('/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const studentId = Number(req.params.id);
  const {
    full_name, calling_name, dob, gender, address,
    guardian_name, guardian_relation, guardian_phone, guardian_email,
    guardian_nic, emergency_contact, status, class_id, roll_number
  } = req.body;

  const current = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
  if (!current) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  const updateStmt = db.prepare(`
    UPDATE students SET
      full_name = ?, calling_name = ?, dob = ?, gender = ?, address = ?,
      guardian_name = ?, guardian_relation = ?, guardian_phone = ?, guardian_email = ?,
      guardian_nic = ?, emergency_contact = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  updateStmt.run(
    full_name || current.full_name,
    calling_name || current.calling_name,
    dob || current.dob,
    gender || current.gender,
    address !== undefined ? address : current.address,
    guardian_name || current.guardian_name,
    guardian_relation || current.guardian_relation,
    guardian_phone || current.guardian_phone,
    guardian_email !== undefined ? guardian_email : current.guardian_email,
    guardian_nic !== undefined ? guardian_nic : current.guardian_nic,
    emergency_contact !== undefined ? emergency_contact : current.emergency_contact,
    status || current.status,
    studentId
  );

  // Update enrollment if class_id is passed
  if (class_id) {
    const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };
    if (currentYear) {
      const existingEnroll = db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND academic_year_id = ?').get(studentId, currentYear.id) as any;
      if (existingEnroll) {
        db.prepare('UPDATE enrollments SET class_id = ?, roll_number = ? WHERE id = ?')
          .run(Number(class_id), roll_number ? Number(roll_number) : null, existingEnroll.id);
      } else {
        db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, roll_number, status) VALUES (?, ?, ?, ?, "enrolled")')
          .run(studentId, Number(class_id), currentYear.id, roll_number ? Number(roll_number) : null);
      }
    }
  }

  logAudit(req.user!.id, req.user!.username, 'STUDENT_UPDATE', 'students', studentId, { changes: req.body }, req.ip);

  res.json({ success: true, message: 'Student updated successfully.' });
});

// CSV Import & Validation Endpoint
router.post('/import-csv', requireAuth, requireRole(['admin']), (req, res) => {
  const { rows, execute } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'Please provide CSV rows array.' });
    return;
  }

  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };
  const allClasses = db.prepare('SELECT id, name FROM classes').all() as any[];
  const classMap = new Map<string, number>();
  allClasses.forEach(c => classMap.set(c.name.toLowerCase().trim(), c.id));

  const validationResults: any[] = [];
  let validCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors: string[] = [];

    const adm = String(row.admission_no || row['Admission No'] || '').trim();
    const name = String(row.full_name || row['Full Name'] || '').trim();
    const call = String(row.calling_name || row['Calling Name'] || name.split(' ')[0]).trim();
    const dob = String(row.dob || row['DOB'] || '').trim();
    const gender = String(row.gender || row['Gender'] || 'Male').trim();
    const gName = String(row.guardian_name || row['Guardian Name'] || '').trim();
    const gRel = String(row.guardian_relation || row['Guardian Relation'] || 'Parent').trim();
    const phone = String(row.guardian_phone || row['Guardian Phone'] || '').trim();
    const addr = String(row.address || row['Address'] || '').trim();
    const className = String(row.class_name || row['Class'] || '').trim();

    if (!adm) errors.push('Admission number is required.');
    if (!name) errors.push('Full name is required.');
    if (!dob) errors.push('Date of birth is required.');
    if (!gName) errors.push('Guardian name is required.');
    if (!phone) errors.push('Guardian phone is required.');

    // Duplicate check in database
    if (adm) {
      const existing = db.prepare('SELECT id, full_name FROM students WHERE admission_no = ?').get(adm) as any;
      if (existing) {
        errors.push(`Admission No already exists for student: ${existing.full_name}`);
        duplicateCount++;
      }
    }

    let matchedClassId = null;
    if (className) {
      matchedClassId = classMap.get(className.toLowerCase());
      if (!matchedClassId) {
        errors.push(`Class "${className}" does not exist in the system.`);
      }
    }

    const isValid = errors.length === 0;
    if (isValid) {
      validCount++;
    } else {
      errorCount++;
    }

    validationResults.push({
      index: i + 1,
      data: {
        admission_no: adm,
        full_name: name,
        calling_name: call,
        dob,
        gender: ['Female', 'Other'].includes(gender) ? gender : 'Male',
        guardian_name: gName,
        guardian_relation: gRel,
        guardian_phone: phone,
        address: addr,
        class_id: matchedClassId,
        class_name: className
      },
      errors,
      isValid
    });
  }

  // If execute flag is set, insert valid rows into database
  if (execute) {
    const studentInsert = db.prepare(`
      INSERT INTO students (
        admission_no, full_name, calling_name, dob, gender, address,
        guardian_name, guardian_relation, guardian_phone, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
    `);

    const enrollInsert = db.prepare(`
      INSERT INTO enrollments (student_id, class_id, academic_year_id, status)
      VALUES (?, ?, ?, 'enrolled')
    `);

    let importedCount = 0;
    for (const item of validationResults) {
      if (item.isValid) {
        try {
          const res = studentInsert.run(
            item.data.admission_no,
            item.data.full_name,
            item.data.calling_name,
            item.data.dob,
            item.data.gender,
            item.data.address || null,
            item.data.guardian_name,
            item.data.guardian_relation,
            item.data.guardian_phone
          );
          const studentId = Number(res.lastInsertRowid);
          if (item.data.class_id && currentYear) {
            enrollInsert.run(studentId, item.data.class_id, currentYear.id);
          }
          importedCount++;
        } catch (err) {
          console.error('Import error row:', item.data.admission_no, err);
        }
      }
    }

    logAudit(req.user!.id, req.user!.username, 'STUDENT_CSV_IMPORT', 'students', null, { importedCount, totalRows: rows.length }, req.ip);

    res.json({
      success: true,
      importedCount,
      totalRows: rows.length
    });
    return;
  }

  // Otherwise return validation preview
  res.json({
    totalRows: rows.length,
    validCount,
    duplicateCount,
    errorCount,
    preview: validationResults
  });
});

export default router;
