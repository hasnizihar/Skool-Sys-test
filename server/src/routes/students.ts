import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, requireRole, getUserAssignments } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { recalculateClassRollNumbers, recalculateAllClasses } from '../services/rollNumberService.js';

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

  // Role Scoping: Teachers (both class and subject) only see students in their assigned classes
  if (user.role !== 'admin') {
    const assignments = getUserAssignments(user.id);
    if (assignments.assignedClassIds.length > 0) {
      const placeholders = assignments.assignedClassIds.map(() => '?').join(',');
      sql += ` AND c.id IN (${placeholders})`;
      params.push(...assignments.assignedClassIds);
    } else {
      sql += ` AND 1=0`; // No assigned classes
    }

    // If teacher explicitly requested a classId, verify authorization
    if (classId && !assignments.assignedClassIds.includes(Number(classId))) {
      res.status(403).json({ error: 'Access denied. You are not assigned to this class.' });
      return;
    }
  }

  // Filters
  if (q && typeof q === 'string') {
    const searchPattern = `%${q.trim()}%`;
    sql += ` AND (s.admission_no LIKE ? OR s.full_name LIKE ? OR s.name_with_initials LIKE ? OR s.calling_name LIKE ? OR s.guardian_phone LIKE ? OR s.guardian_name LIKE ?)`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
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
    SELECT s.*, c.id as class_id, c.name as class_name, c.grade,
           e.roll_number, ay.name as academic_year,
           u.full_name as class_teacher_name
    FROM students s
    LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'enrolled'
    LEFT JOIN classes c ON e.class_id = c.id
    LEFT JOIN users u ON c.class_teacher_id = u.id
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    WHERE s.id = ?
  `).get(studentId) as any;

  if (!student) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  // Record-level permission check: non-admin teachers can only view students enrolled in their assigned classes
  if (req.user!.role !== 'admin') {
    const assignments = getUserAssignments(req.user!.id);
    if (!student.class_id || !assignments.assignedClassIds.includes(student.class_id)) {
      res.status(403).json({ error: 'Access denied. You are not assigned to teach this student.' });
      return;
    }
  }

  // Attendance stats for student
  const attendanceStats = db.prepare(`
    SELECT 
      COUNT(*) as total_days,
      SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days,
      SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days
    FROM attendance_records
    WHERE student_id = ?
  `).get(studentId) as any;

  const total = Number(attendanceStats?.total_days || 0);
  const present = Number(attendanceStats?.present_days || 0);
  const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 100;

  // Detailed attendance logs for student across the academic year
  const attendanceHistory = db.prepare(`
    SELECT ar.status, ar.remarks, sess.date, c.name as class_name
    FROM attendance_records ar
    JOIN attendance_sessions sess ON ar.session_id = sess.id
    JOIN classes c ON sess.class_id = c.id
    WHERE ar.student_id = ?
    ORDER BY sess.date DESC
  `).all(studentId);

  res.json({
    student,
    attendance: {
      ...attendanceStats,
      attendanceRate,
      history: attendanceHistory
    }
  });
});


// Create Student (Admin only)
router.post('/', requireAuth, requireRole(['admin']), (req, res) => {
  const {
    admission_no,
    full_name,
    name_with_initials,
    dob,
    gender,
    address,
    guardian_name,
    guardian_relation,
    guardian_occupation,
    guardian_phone,
    guardian_phone_2,
    guardian_email,
    class_id
  } = req.body;

  // 1. Validate 5-digit Index Number
  const trimmedIndex = String(admission_no || '').trim();
  if (!/^\d{5}$/.test(trimmedIndex)) {
    res.status(400).json({ error: 'Index Number must be exactly 5 digits (e.g. 16087).' });
    return;
  }

  // 2. Validate Gender: Strictly Male or Female only
  const normGender = String(gender || '').trim().toLowerCase();
  if (normGender !== 'male' && normGender !== 'female') {
    res.status(400).json({ error: 'Gender must be strictly Male or Female.' });
    return;
  }
  const cleanGender = normGender === 'female' ? 'Female' : 'Male';

  // 3. Validate Required Fields
  if (!full_name?.trim() || !name_with_initials?.trim() || !dob || !address?.trim() || !class_id || !guardian_name?.trim() || !guardian_phone?.trim()) {
    res.status(400).json({ error: 'Missing required student or guardian fields.' });
    return;
  }

  // 4. Check Unique Index Number
  const existing = db.prepare('SELECT id FROM students WHERE admission_no = ?').get(trimmedIndex);
  if (existing) {
    res.status(400).json({ error: `Index Number ${trimmedIndex} is already assigned to another student.` });
    return;
  }

  // 5. Duplicate Detection (Name + DOB)
  const nameDobMatch = db
    .prepare('SELECT id, admission_no FROM students WHERE LOWER(full_name) = LOWER(?) AND dob = ?')
    .get(full_name.trim(), dob) as any;
  if (nameDobMatch) {
    res.status(409).json({
      error: `Potential duplicate student: A student with name "${full_name}" and DOB "${dob}" already exists with Index No: ${nameDobMatch.admission_no}.`
    });
    return;
  }

  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };
  if (!currentYear) {
    res.status(500).json({ error: 'No active academic year configured in system.' });
    return;
  }

  const insertStudent = db.prepare(`
    INSERT INTO students (
      admission_no, full_name, name_with_initials, calling_name, dob, gender, address,
      guardian_name, guardian_relation, guardian_occupation, guardian_phone, guardian_phone_2, guardian_email,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
  `);

  const result = insertStudent.run(
    trimmedIndex,
    full_name.trim(),
    name_with_initials.trim(),
    name_with_initials.trim().split(' ').pop() || full_name.split(' ')[0],
    dob,
    cleanGender,
    address.trim(),
    guardian_name.trim(),
    guardian_relation?.trim() || 'Parent',
    guardian_occupation?.trim() || null,
    guardian_phone.trim(),
    guardian_phone_2?.trim() || null,
    guardian_email?.trim() || null
  );

  const newStudentId = Number(result.lastInsertRowid);
  const targetClassId = Number(class_id);

  // Enroll in class
  const enrollStmt = db.prepare(`
    INSERT INTO enrollments (student_id, class_id, academic_year_id, status)
    VALUES (?, ?, ?, 'enrolled')
  `);
  enrollStmt.run(newStudentId, targetClassId, currentYear.id);

  // Automatically compute and assign roll numbers (Boys then Girls by Index No)
  recalculateClassRollNumbers(db, targetClassId, currentYear.id);

  // Query assigned roll number
  const assignedRoll = (
    db
      .prepare('SELECT roll_number FROM enrollments WHERE student_id = ? AND academic_year_id = ?')
      .get(newStudentId, currentYear.id) as { roll_number: number }
  )?.roll_number;

  logAudit(
    req.user!.id,
    req.user!.username,
    'STUDENT_CREATE',
    'students',
    newStudentId,
    { admission_no: trimmedIndex, full_name, class_id: targetClassId, roll_number: assignedRoll },
    req.ip
  );

  res.status(201).json({ success: true, studentId: newStudentId, roll_number: assignedRoll });
});

// Update Student (Admin only)
router.put('/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const studentId = Number(req.params.id);
  const {
    admission_no,
    full_name,
    name_with_initials,
    dob,
    gender,
    address,
    guardian_name,
    guardian_relation,
    guardian_occupation,
    guardian_phone,
    guardian_phone_2,
    guardian_email,
    status,
    class_id
  } = req.body;

  const current = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
  if (!current) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  // Validate index number if changed
  let newIndex = current.admission_no;
  if (admission_no && String(admission_no).trim() !== current.admission_no) {
    const trimmed = String(admission_no).trim();
    if (!/^\d{5}$/.test(trimmed)) {
      res.status(400).json({ error: 'Index Number must be exactly 5 digits (e.g. 16087).' });
      return;
    }
    const dup = db.prepare('SELECT id FROM students WHERE admission_no = ? AND id != ?').get(trimmed, studentId);
    if (dup) {
      res.status(400).json({ error: `Index Number ${trimmed} is already assigned to another student.` });
      return;
    }
    newIndex = trimmed;
  }

  let cleanGender = current.gender;
  if (gender) {
    const gLower = String(gender).trim().toLowerCase();
    if (gLower !== 'male' && gLower !== 'female') {
      res.status(400).json({ error: 'Gender must be strictly Male or Female.' });
      return;
    }
    cleanGender = gLower === 'female' ? 'Female' : 'Male';
  }

  const updateStmt = db.prepare(`
    UPDATE students SET
      admission_no = ?,
      full_name = ?,
      name_with_initials = ?,
      dob = ?,
      gender = ?,
      address = ?,
      guardian_name = ?,
      guardian_relation = ?,
      guardian_occupation = ?,
      guardian_phone = ?,
      guardian_phone_2 = ?,
      guardian_email = ?,
      status = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  updateStmt.run(
    newIndex,
    full_name?.trim() || current.full_name,
    name_with_initials?.trim() || current.name_with_initials || current.calling_name || current.full_name,
    dob || current.dob,
    cleanGender,
    address !== undefined ? address : current.address,
    guardian_name?.trim() || current.guardian_name,
    guardian_relation?.trim() || current.guardian_relation,
    guardian_occupation !== undefined ? guardian_occupation : current.guardian_occupation,
    guardian_phone?.trim() || current.guardian_phone,
    guardian_phone_2 !== undefined ? guardian_phone_2 : current.guardian_phone_2,
    guardian_email !== undefined ? guardian_email : current.guardian_email,
    status || current.status,
    studentId
  );

  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };

  // Handle class re-assignment and roll number recalculations
  if (currentYear) {
    const existingEnroll = db
      .prepare('SELECT id, class_id FROM enrollments WHERE student_id = ? AND academic_year_id = ?')
      .get(studentId, currentYear.id) as { id: number; class_id: number } | undefined;

    const oldClassId = existingEnroll?.class_id;
    const newClassId: number = class_id ? Number(class_id) : (oldClassId || 0);

    if (existingEnroll && class_id && newClassId !== oldClassId) {
      db.prepare('UPDATE enrollments SET class_id = ? WHERE id = ?').run(newClassId, existingEnroll.id);
      // Recalculate old class rolls and new class rolls
      if (oldClassId) recalculateClassRollNumbers(db, oldClassId, currentYear.id);
      if (newClassId) recalculateClassRollNumbers(db, newClassId, currentYear.id);
    } else if (!existingEnroll && class_id) {
      db.prepare('INSERT INTO enrollments (student_id, class_id, academic_year_id, status) VALUES (?, ?, ?, "enrolled")')
        .run(studentId, newClassId, currentYear.id);
      if (newClassId) recalculateClassRollNumbers(db, newClassId, currentYear.id);
    } else if (cleanGender !== current.gender || newIndex !== current.admission_no) {
      // Gender or index changed within same class: recalculate roll numbers
      if (oldClassId) recalculateClassRollNumbers(db, oldClassId, currentYear.id);
    }
  }

  logAudit(req.user!.id, req.user!.username, 'STUDENT_UPDATE', 'students', studentId, { changes: req.body }, req.ip);

  res.json({ success: true, message: 'Student record updated successfully.' });
});

// CSV Import & Validation Endpoint
router.post('/import-csv', requireAuth, requireRole(['admin']), (req, res) => {
  const { rows, execute } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'Please provide CSV rows array.' });
    return;
  }

  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };
  const allClasses = db.prepare('SELECT id, name, grade FROM classes').all() as any[];
  const classMap = new Map<string, number>();
  allClasses.forEach((c) => classMap.set(c.name.toLowerCase().trim(), c.id));

  const validationResults: any[] = [];
  let validCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors: string[] = [];

    const adm = String(
      row.admission_no || row.index_no || row['Index No'] || row['Index Number'] || row['Admission No'] || ''
    ).trim();
    const name = String(row.full_name || row['Full Name'] || '').trim();
    const initialsName = String(
      row.name_with_initials || row['Name with Initial'] || row['Name with Initials'] || row.calling_name || ''
    ).trim();
    const dob = String(row.dob || row['DOB'] || row['Date of Birth'] || '').trim();
    const rawGender = String(row.gender || row['Gender'] || 'Male').trim().toLowerCase();
    const gName = String(row.guardian_name || row['Guardian Name'] || '').trim();
    const gRel = String(row.guardian_relation || row['Guardian Relation'] || 'Father').trim();
    const gOcc = String(row.guardian_occupation || row['Guardian Occupation'] || row['Occupation'] || '').trim();
    const phone = String(row.guardian_phone || row.phone_1 || row['Phone Number 1'] || row['Phone 1'] || '').trim();
    const phone2 = String(row.guardian_phone_2 || row.phone_2 || row['Phone Number 2'] || row['Phone 2'] || '').trim();
    const email = String(row.guardian_email || row.email || row['Guardian Email'] || row['Email'] || '').trim();
    const addr = String(row.address || row['Address'] || '').trim();
    const className = String(row.class_name || row.class || row['Class'] || '').trim();

    // 1. Index validation (strict 5 digits)
    if (!adm) {
      errors.push('5-digit Index Number is required.');
    } else if (!/^\d{5}$/.test(adm)) {
      errors.push(`Index Number "${adm}" must be exactly 5 digits (e.g. 16087).`);
    }

    // 2. Full Name & Initials validation
    if (!name) errors.push('Full name is required.');
    const finalInitials = initialsName || (name.includes(' ') ? name.split(' ').slice(0, -1).map(p => `${p[0].toUpperCase()}.`).join('') + ' ' + name.split(' ').pop() : name);

    // 3. DOB validation
    if (!dob) errors.push('Date of birth is required.');

    // 4. Gender validation
    if (rawGender !== 'male' && rawGender !== 'female') {
      errors.push('Gender must be strictly "Male" or "Female".');
    }
    const cleanGender = rawGender === 'female' ? 'Female' : 'Male';

    // 5. Guardian validation
    if (!gName) errors.push('Guardian name is required.');
    if (!phone) errors.push('Phone Number 1 is required.');

    // 6. Address validation
    if (!addr) errors.push('Address is required.');

    // Duplicate check in database
    if (adm && /^\d{5}$/.test(adm)) {
      const existing = db.prepare('SELECT id, full_name FROM students WHERE admission_no = ?').get(adm) as any;
      if (existing) {
        errors.push(`Index No ${adm} already assigned to: ${existing.full_name}`);
        duplicateCount++;
      }
    }

    let matchedClassId: number | null = null;
    if (className) {
      matchedClassId = classMap.get(className.toLowerCase()) || null;
      if (!matchedClassId) {
        errors.push(`Class "${className}" does not exist in the school system.`);
      }
    } else {
      errors.push('Class assignment is required.');
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
        name_with_initials: finalInitials,
        dob,
        gender: cleanGender,
        address: addr,
        guardian_name: gName,
        guardian_relation: gRel,
        guardian_occupation: gOcc || 'Business / Self-Employed',
        guardian_phone: phone,
        guardian_phone_2: phone2 || null,
        guardian_email: email || null,
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
        admission_no, full_name, name_with_initials, calling_name, dob, gender, address,
        guardian_name, guardian_relation, guardian_occupation, guardian_phone, guardian_phone_2, guardian_email,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
    `);

    const enrollInsert = db.prepare(`
      INSERT INTO enrollments (student_id, class_id, academic_year_id, status)
      VALUES (?, ?, ?, 'enrolled')
    `);

    const affectedClassIds = new Set<number>();
    let importedCount = 0;

    for (const item of validationResults) {
      if (item.isValid) {
        try {
          const res = studentInsert.run(
            item.data.admission_no,
            item.data.full_name,
            item.data.name_with_initials,
            item.data.name_with_initials.split(' ').pop() || item.data.full_name.split(' ')[0],
            item.data.dob,
            item.data.gender,
            item.data.address,
            item.data.guardian_name,
            item.data.guardian_relation,
            item.data.guardian_occupation,
            item.data.guardian_phone,
            item.data.guardian_phone_2,
            item.data.guardian_email
          );
          const studentId = Number(res.lastInsertRowid);
          if (item.data.class_id && currentYear) {
            enrollInsert.run(studentId, item.data.class_id, currentYear.id);
            affectedClassIds.add(item.data.class_id);
          }
          importedCount++;
        } catch (err) {
          console.error('Import error row:', item.data.admission_no, err);
        }
      }
    }

    // Automatically recalculate roll numbers for all classes affected by the import
    if (currentYear) {
      for (const classId of affectedClassIds) {
        recalculateClassRollNumbers(db, classId, currentYear.id);
      }
    }

    logAudit(req.user!.id, req.user!.username, 'STUDENT_CSV_IMPORT', 'students', null, { importedCount, totalRows: rows.length }, req.ip);

    res.json({
      success: true,
      importedCount,
      totalRows: rows.length,
      affectedClasses: Array.from(affectedClassIds)
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

// Resequence Roll Numbers for a Class or School-wide
router.post('/recalculate-rolls', requireAuth, requireRole(['admin']), (req, res) => {
  const { class_id } = req.body;
  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };

  if (!currentYear) {
    res.status(500).json({ error: 'No active academic year found.' });
    return;
  }

  if (class_id) {
    const result = recalculateClassRollNumbers(db, Number(class_id), currentYear.id);
    res.json({ success: true, ...result });
  } else {
    const result = recalculateAllClasses(db, currentYear.id);
    res.json({ success: true, ...result });
  }
});

export default router;
