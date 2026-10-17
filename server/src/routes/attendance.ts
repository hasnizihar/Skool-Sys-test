import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, getUserAssignments } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// Check if user is authorized to manage attendance for this class
function canManageAttendance(user: any, classId: number): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'class_teacher') {
    const assignments = getUserAssignments(user.id);
    return assignments.assignedClassIds.includes(Number(classId));
  }
  return false;
}

// Get Attendance Session for a Class and Date
router.get('/session', requireAuth, (req, res) => {
  const { classId, date } = req.query;

  if (!classId || !date) {
    res.status(400).json({ error: 'classId and date (YYYY-MM-DD) are required.' });
    return;
  }

  const cId = Number(classId);
  const dt = String(date);

  const session = db.prepare(`
    SELECT s.*, u.full_name as taken_by_name, c.name as class_name, c.grade
    FROM attendance_sessions s
    JOIN classes c ON s.class_id = c.id
    LEFT JOIN users u ON s.taken_by_user_id = u.id
    WHERE s.class_id = ? AND s.date = ?
  `).get(cId, dt) as any;

  // Fetch class roster
  const students = db.prepare(`
    SELECT s.id as student_id, s.admission_no, s.full_name, s.calling_name, s.gender, s.guardian_phone,
           e.roll_number,
           ar.status as attendance_status, ar.remarks as attendance_remarks, ar.id as record_id
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.session_id = ?
    WHERE e.class_id = ? AND e.status = 'enrolled'
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(session ? session.id : null, cId) as any[];

  // Calculate summary counts
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let unmarkedCount = 0;

  students.forEach(st => {
    if (st.attendance_status === 'present') presentCount++;
    else if (st.attendance_status === 'absent') absentCount++;
    else if (st.attendance_status === 'late') lateCount++;
    else if (st.attendance_status === 'excused') excusedCount++;
    else unmarkedCount++;
  });

  res.json({
    session: session || null,
    students,
    summary: {
      total: students.length,
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      excused: excusedCount,
      unmarked: unmarkedCount,
      attendanceRate: students.length > 0 ? Math.round(((presentCount + lateCount) / students.length) * 100) : 0
    }
  });
});

// Save or Update Daily Attendance Session
router.post('/session', requireAuth, (req, res) => {
  const { classId, date, records, notes, status } = req.body;
  const user = req.user!;

  if (!classId || !date || !Array.isArray(records)) {
    res.status(400).json({ error: 'Missing classId, date, or records.' });
    return;
  }

  const cId = Number(classId);
  const dt = String(date);

  // Check authorization
  if (!canManageAttendance(user, cId)) {
    res.status(403).json({ error: 'You are not assigned as the class teacher for this class.' });
    return;
  }

  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };

  // Find or create session
  let existingSession = db.prepare('SELECT id FROM attendance_sessions WHERE class_id = ? AND date = ?').get(cId, dt) as any;
  let sessionId: number;

  if (existingSession) {
    sessionId = existingSession.id;
    db.prepare(`
      UPDATE attendance_sessions SET
        status = ?, notes = ?, taken_by_user_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status || 'submitted', notes || null, user.id, sessionId);
  } else {
    const uuid = `sess-${cId}-${dt}-${Date.now()}`;
    const insertSession = db.prepare(`
      INSERT INTO attendance_sessions (uuid, class_id, date, academic_year_id, taken_by_user_id, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const sResult = insertSession.run(uuid, cId, dt, currentYear?.id || null, user.id, status || 'submitted', notes || null);
    sessionId = Number(sResult.lastInsertRowid);
  }

  // Upsert records
  const upsertRecord = db.prepare(`
    INSERT INTO attendance_records (session_id, student_id, status, remarks, synced_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(session_id, student_id) DO UPDATE SET
      status = excluded.status,
      remarks = excluded.remarks,
      synced_at = datetime('now')
  `);

  for (const rec of records) {
    const stStatus = ['present', 'absent', 'late', 'excused'].includes(rec.status) ? rec.status : 'present';
    upsertRecord.run(sessionId, Number(rec.student_id), stStatus, rec.remarks || null);
  }

  logAudit(user.id, user.username, 'ATTENDANCE_SUBMIT', 'attendance_sessions', sessionId, { classId: cId, date: dt, recordCount: records.length }, req.ip);

  res.json({
    success: true,
    sessionId,
    message: `Attendance register for ${dt} saved successfully with ${records.length} records.`
  });
});

// Offline Sync Endpoint: Batched sync from IndexedDB
router.post('/sync', requireAuth, (req, res) => {
  const { queue } = req.body;
  const user = req.user!;

  if (!Array.isArray(queue) || queue.length === 0) {
    res.json({ success: true, synced: 0, message: 'Nothing to sync.' });
    return;
  }

  const currentYear = db.prepare('SELECT id FROM academic_years WHERE is_current = 1').get() as { id: number };
  const syncedSessions: any[] = [];
  const errors: any[] = [];

  for (const item of queue) {
    try {
      const cId = Number(item.classId);
      const dt = String(item.date);

      if (!canManageAttendance(user, cId)) {
        errors.push({ id: item.id, error: `Unauthorized for class ${cId}` });
        continue;
      }

      // Check existing session
      let session = db.prepare('SELECT id FROM attendance_sessions WHERE class_id = ? AND date = ?').get(cId, dt) as any;
      let sessionId: number;

      if (session) {
        sessionId = session.id;
        db.prepare(`
          UPDATE attendance_sessions SET
            notes = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(item.notes || null, sessionId);
      } else {
        const uuid = item.uuid || `sync-${cId}-${dt}-${Date.now()}`;
        const sRes = db.prepare(`
          INSERT INTO attendance_sessions (uuid, class_id, date, academic_year_id, taken_by_user_id, status, notes)
          VALUES (?, ?, ?, ?, ?, 'submitted', ?)
        `).run(uuid, cId, dt, currentYear?.id || null, user.id, item.notes || 'Offline synced');
        sessionId = Number(sRes.lastInsertRowid);
      }

      // Upsert records
      const upsert = db.prepare(`
        INSERT INTO attendance_records (session_id, student_id, status, remarks, synced_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(session_id, student_id) DO UPDATE SET
          status = excluded.status,
          remarks = excluded.remarks,
          synced_at = datetime('now')
      `);

      if (Array.isArray(item.records)) {
        for (const r of item.records) {
          upsert.run(sessionId, Number(r.student_id), r.status || 'present', r.remarks || null);
        }
      }

      syncedSessions.push({
        id: item.id,
        sessionId,
        classId: cId,
        date: dt,
        recordsCount: item.records?.length || 0,
        syncedAt: new Date().toISOString()
      });
    } catch (err: any) {
      errors.push({ id: item.id, error: err.message });
    }
  }

  logAudit(user.id, user.username, 'ATTENDANCE_OFFLINE_SYNC', 'attendance_sessions', null, { syncedCount: syncedSessions.length, errorCount: errors.length }, req.ip);

  res.json({
    success: true,
    syncedCount: syncedSessions.length,
    syncedSessions,
    errors
  });
});

// Daily Attendance Report (Summary of all classes for date)
router.get('/reports/daily', requireAuth, (req, res) => {
  const { date } = req.query;
  const dt = (date as string) || new Date().toISOString().split('T')[0];

  const classSummaries = db.prepare(`
    SELECT 
      c.id as class_id, c.name as class_name, c.grade,
      u.full_name as class_teacher_name,
      sess.id as session_id, sess.status as session_status, sess.updated_at as submitted_at,
      COUNT(e.student_id) as enrolled_count,
      SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present_count,
      SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
      SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late_count,
      SUM(CASE WHEN ar.status = 'excused' THEN 1 ELSE 0 END) as excused_count
    FROM classes c
    LEFT JOIN users u ON c.class_teacher_id = u.id
    LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'enrolled'
    LEFT JOIN attendance_sessions sess ON sess.class_id = c.id AND sess.date = ?
    LEFT JOIN attendance_records ar ON ar.session_id = sess.id AND ar.student_id = e.student_id
    GROUP BY c.id
    ORDER BY c.grade ASC, c.name ASC
  `).all(dt);

  // List of all absent students on that date with contact info
  const absentStudents = db.prepare(`
    SELECT 
      s.id, s.admission_no, s.full_name, s.guardian_name, s.guardian_phone,
      c.name as class_name, ar.remarks
    FROM attendance_records ar
    JOIN attendance_sessions sess ON ar.session_id = sess.id
    JOIN students s ON ar.student_id = s.id
    JOIN classes c ON sess.class_id = c.id
    WHERE sess.date = ? AND ar.status = 'absent'
    ORDER BY c.grade ASC, c.name ASC, s.admission_no ASC
  `).all(dt);

  res.json({
    date: dt,
    classes: classSummaries,
    absentStudents
  });
});

// Monthly Attendance Grid Report for a Class
router.get('/reports/monthly', requireAuth, (req, res) => {
  const { classId, year, month } = req.query;

  if (!classId || !year || !month) {
    res.status(400).json({ error: 'classId, year, and month are required.' });
    return;
  }

  const cId = Number(classId);
  const y = Number(year);
  const m = Number(month); // 1-12
  const monthStr = m < 10 ? `0${m}` : `${m}`;
  const datePrefix = `${y}-${monthStr}%`;

  // Get enrolled students
  const students = db.prepare(`
    SELECT s.id, s.admission_no, s.full_name, e.roll_number
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    WHERE e.class_id = ? AND e.status = 'enrolled'
    ORDER BY e.roll_number ASC, s.admission_no ASC
  `).all(cId) as any[];

  // Get all attendance sessions in this month
  const sessions = db.prepare(`
    SELECT id, date, status
    FROM attendance_sessions
    WHERE class_id = ? AND date LIKE ?
    ORDER BY date ASC
  `).all(cId, datePrefix) as any[];

  // Get all records in this month
  const records = db.prepare(`
    SELECT ar.student_id, ar.status, sess.date
    FROM attendance_records ar
    JOIN attendance_sessions sess ON ar.session_id = sess.id
    WHERE sess.class_id = ? AND sess.date LIKE ?
  `).all(cId, datePrefix) as any[];

  const studentMap: Record<number, Record<string, string>> = {};
  students.forEach(st => {
    studentMap[st.id] = {};
  });

  records.forEach(r => {
    if (studentMap[r.student_id]) {
      studentMap[r.student_id][r.date] = r.status;
    }
  });

  res.json({
    classId: cId,
    year: y,
    month: m,
    sessions,
    students,
    attendanceGrid: studentMap
  });
});

export default router;
