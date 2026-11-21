import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, requireRole, canAccessSection } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { getColomboCivilDate, isValidCivilDate } from '../utils/dateUtils.js';
import {
  resolveActivePeriodContext,
  getTimetableConfig,
  updateTimetableConfig
} from '../services/timetableService.js';

const router = Router();

// ============================================================================
// GET /api/classroom-status/context
// Retrieve active period, civil date, time, and timetable configuration context
// ============================================================================
router.get('/context', requireAuth, (req, res) => {
  try {
    const { date, period, time } = req.query;
    const overrideDate = date && isValidCivilDate(String(date)) ? String(date) : undefined;
    const overridePeriod = period && !isNaN(Number(period)) ? Number(period) : undefined;
    const customTime = time ? String(time) : undefined;

    const context = resolveActivePeriodContext(overrideDate, overridePeriod, customTime);
    res.json({ context });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to resolve period context.' });
  }
});

// ============================================================================
// GET /api/classroom-status/overview
// School-wide or section-scoped classroom monitoring grid for active period
// ============================================================================
router.get('/overview', requireAuth, (req, res) => {
  const user = req.user!;
  try {
    const { date, period, time } = req.query;
    const overrideDate = date && isValidCivilDate(String(date)) ? String(date) : undefined;
    const overridePeriod = period && !isNaN(Number(period)) ? Number(period) : undefined;
    const customTime = time ? String(time) : undefined;

    const context = resolveActivePeriodContext(overrideDate, overridePeriod, customTime);
    const activeDate = context.schoolDate;
    const activePeriod = context.periodNumber;

    // Fetch accessible sections
    const allSections = db.prepare(`
      SELECT id, name, code, description, grade_range
      FROM sections
      ORDER BY name ASC
    `).all() as any[];

    const visibleSections = user.role === 'admin'
      ? allSections
      : allSections.filter((s: any) => canAccessSection(user, s.id));

    let totalClasses = 0;
    let teachingCount = 0;
    let notTeachingCount = 0;
    let otherActivityCount = 0;
    let pendingCount = 0;

    const sectionsWithClasses = visibleSections.map((sec: any) => {
      const classes = db.prepare(`
        SELECT c.id, c.name, c.grade, c.room_number, c.class_teacher_id,
               u.full_name as class_teacher_name
        FROM classes c
        LEFT JOIN users u ON c.class_teacher_id = u.id
        WHERE c.section_id = ?
        ORDER BY c.grade ASC, c.name ASC
      `).all(sec.id) as any[];

      const classesWithStatus = classes.map((cls: any) => {
        totalClasses++;

        let statusRecord: any = null;
        if (activePeriod) {
          statusRecord = db.prepare(`
            SELECT cps.id, cps.status, cps.activity_note, cps.revision, cps.updated_at,
                   u.full_name as recorded_by_name, u.username as recorded_by_username
            FROM classroom_period_statuses cps
            JOIN users u ON cps.recorded_by_user_id = u.id
            WHERE cps.class_id = ? AND cps.school_date = ? AND cps.period_number = ?
          `).get(cls.id, activeDate, activePeriod) as any;
        }

        const displayStatus = statusRecord ? statusRecord.status : 'pending';

        if (displayStatus === 'teaching') teachingCount++;
        else if (displayStatus === 'not_teaching') notTeachingCount++;
        else if (displayStatus === 'other_activity') otherActivityCount++;
        else pendingCount++;

        return {
          id: cls.id,
          name: cls.name,
          grade: cls.grade,
          roomNumber: cls.room_number,
          classTeacherId: cls.class_teacher_id,
          classTeacherName: cls.class_teacher_name,
          status: displayStatus,
          statusRecordId: statusRecord?.id || null,
          revision: statusRecord?.revision || 0,
          activityNote: statusRecord?.activity_note || null,
          recordedBy: statusRecord?.recorded_by_name || null,
          recordedAt: statusRecord?.updated_at || null
        };
      });

      return {
        id: sec.id,
        name: sec.name,
        code: sec.code,
        description: sec.description,
        gradeRange: sec.grade_range,
        classes: classesWithStatus
      };
    });

    // For Principal: report any unassigned classes (section_id IS NULL)
    let unassignedClasses: any[] = [];
    if (user.role === 'admin') {
      const unassigned = db.prepare(`
        SELECT c.id, c.name, c.grade, c.room_number, c.class_teacher_id,
               u.full_name as class_teacher_name
        FROM classes c
        LEFT JOIN users u ON c.class_teacher_id = u.id
        WHERE c.section_id IS NULL
        ORDER BY c.grade ASC, c.name ASC
      `).all() as any[];

      unassignedClasses = unassigned.map((cls: any) => {
        let statusRecord: any = null;
        if (activePeriod) {
          statusRecord = db.prepare(`
            SELECT cps.id, cps.status, cps.activity_note, cps.revision, cps.updated_at,
                   u.full_name as recorded_by_name
            FROM classroom_period_statuses cps
            JOIN users u ON cps.recorded_by_user_id = u.id
            WHERE cps.class_id = ? AND cps.school_date = ? AND cps.period_number = ?
          `).get(cls.id, activeDate, activePeriod) as any;
        }

        return {
          id: cls.id,
          name: cls.name,
          grade: cls.grade,
          roomNumber: cls.room_number,
          classTeacherId: cls.class_teacher_id,
          classTeacherName: cls.class_teacher_name,
          status: statusRecord ? statusRecord.status : 'pending',
          statusRecordId: statusRecord?.id || null,
          revision: statusRecord?.revision || 0,
          activityNote: statusRecord?.activity_note || null,
          recordedBy: statusRecord?.recorded_by_name || null,
          recordedAt: statusRecord?.updated_at || null
        };
      });
    }

    res.json({
      context,
      sections: sectionsWithClasses,
      unassignedClasses,
      summary: {
        total: totalClasses,
        teaching: teachingCount,
        notTeaching: notTeachingCount,
        otherActivity: otherActivityCount,
        pending: pendingCount
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve classroom status overview.' });
  }
});

// ============================================================================
// POST /api/classroom-status/record
// Record or edit teaching status for a classroom during a period
// ============================================================================
router.post('/record', requireAuth, (req, res) => {
  const user = req.user!;
  const { classId, status, periodNumber, schoolDate, activityNote, expectedRevision } = req.body;

  // 1. Validate Class
  const cId = Number(classId);
  if (!classId || isNaN(cId) || cId <= 0) {
    res.status(400).json({ error: 'Valid classId is required.', code: 'INVALID_CLASS_ID' });
    return;
  }

  const cls = db.prepare(`
    SELECT c.id, c.name, c.section_id, s.name as section_name
    FROM classes c
    LEFT JOIN sections s ON c.section_id = s.id
    WHERE c.id = ?
  `).get(cId) as any;

  if (!cls) {
    res.status(404).json({ error: 'Classroom not found.', code: 'CLASS_NOT_FOUND' });
    return;
  }

  // 2. Validate Status
  const validStatuses = ['teaching', 'not_teaching', 'other_activity'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({
      error: `Invalid status "${status}". Allowed values: teaching, not_teaching, other_activity.`,
      code: 'INVALID_STATUS'
    });
    return;
  }

  // 3. Authorization Check
  if (user.role !== 'admin') {
    if (!cls.section_id || !canAccessSection(user, cls.section_id)) {
      res.status(403).json({
        error: 'Access denied. You are not authorized to record status for this section.',
        code: 'FORBIDDEN_SECTION_CLASS'
      });
      return;
    }
  }

  // 4. Resolve Target Period & Date
  let targetDate = schoolDate;
  if (!targetDate) {
    targetDate = getColomboCivilDate();
  } else if (!isValidCivilDate(targetDate)) {
    res.status(400).json({ error: 'Invalid schoolDate format (YYYY-MM-DD).', code: 'INVALID_DATE' });
    return;
  }

  let targetPeriod = periodNumber ? Number(periodNumber) : null;
  if (!targetPeriod || isNaN(targetPeriod)) {
    const activeCtx = resolveActivePeriodContext(targetDate);
    if (!activeCtx.periodNumber) {
      res.status(400).json({
        error: activeCtx.message || 'No active school period currently in progress.',
        code: 'NO_ACTIVE_PERIOD',
        context: activeCtx
      });
      return;
    }
    targetPeriod = activeCtx.periodNumber;
  }

  if (targetPeriod < 1 || targetPeriod > 9) {
    res.status(400).json({ error: 'periodNumber must be between 1 and 9.', code: 'INVALID_PERIOD' });
    return;
  }

  try {
    db.exec('BEGIN IMMEDIATE;');

    const existing = db.prepare(`
      SELECT cps.id, cps.status, cps.revision, cps.activity_note, cps.updated_at,
             u.full_name as recorded_by_name
      FROM classroom_period_statuses cps
      JOIN users u ON cps.recorded_by_user_id = u.id
      WHERE cps.class_id = ? AND cps.school_date = ? AND cps.period_number = ?
    `).get(cId, targetDate, targetPeriod) as any;

    // 5. Concurrency & Revision Conflict Check
    if (existing && expectedRevision !== undefined && expectedRevision !== null) {
      if (existing.revision !== Number(expectedRevision)) {
        db.exec('ROLLBACK;');
        res.status(409).json({
          error: 'Conflict: Classroom status has been updated by another user.',
          code: 'STATUS_REVISION_CONFLICT',
          currentStatus: {
            id: existing.id,
            classId: cId,
            periodNumber: targetPeriod,
            schoolDate: targetDate,
            status: existing.status,
            activityNote: existing.activity_note,
            revision: existing.revision,
            recordedBy: existing.recorded_by_name,
            updatedAt: existing.updated_at
          }
        });
        return;
      }
    }

    let statusId: number;
    let newRevision: number;

    const cleanNote = activityNote !== undefined ? (activityNote ? String(activityNote).trim() : null) : null;

    if (existing) {
      newRevision = existing.revision + 1;
      db.prepare(`
        UPDATE classroom_period_statuses SET
          status = ?,
          activity_note = ?,
          recorded_by_user_id = ?,
          revision = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(status, cleanNote, user.id, newRevision, existing.id);
      statusId = existing.id;
    } else {
      newRevision = 1;
      const insRes = db.prepare(`
        INSERT INTO classroom_period_statuses (
          class_id, school_date, period_number, status, activity_note, recorded_by_user_id, revision
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(cId, targetDate, targetPeriod, status, cleanNote, user.id);
      statusId = Number(insRes.lastInsertRowid);
    }

    db.exec('COMMIT;');

    // 6. Audit Trail Logging
    const auditAction = existing ? 'CLASSROOM_STATUS_UPDATE' : 'CLASSROOM_STATUS_RECORD';
    logAudit(
      user.id,
      user.username,
      auditAction,
      'classroom_period_statuses',
      String(statusId),
      {
        classId: cId,
        className: cls.name,
        sectionId: cls.section_id,
        sectionName: cls.section_name,
        schoolDate: targetDate,
        periodNumber: targetPeriod,
        previousStatus: existing?.status || null,
        newStatus: status,
        activityNote: cleanNote,
        revision: newRevision
      },
      req.ip
    );

    res.status(existing ? 200 : 201).json({
      success: true,
      message: `Classroom "${cls.name}" status recorded as "${status}".`,
      record: {
        id: statusId,
        classId: cId,
        className: cls.name,
        sectionId: cls.section_id,
        schoolDate: targetDate,
        periodNumber: targetPeriod,
        status,
        activityNote: cleanNote,
        revision: newRevision,
        recordedBy: user.full_name,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (err: any) {
    try { db.exec('ROLLBACK;'); } catch {}
    res.status(500).json({ error: err.message || 'Failed to record classroom status.' });
  }
});

// ============================================================================
// GET /api/classroom-status/timetable
// Retrieve school timetable configuration and 9 periods
// ============================================================================
router.get('/timetable', requireAuth, (req, res) => {
  try {
    const config = getTimetableConfig();
    res.json({ config });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve timetable configuration.' });
  }
});

// ============================================================================
// PUT /api/classroom-status/timetable
// Configure official 9 teaching periods and break interval (Principal only)
// ============================================================================
router.put('/timetable', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const result = updateTimetableConfig(req.body);

    logAudit(
      req.user!.id,
      req.user!.username,
      'TIMETABLE_CONFIG_UPDATE',
      'timetable_settings',
      'primary',
      { periodsCount: req.body?.periods?.length, breakAfterPeriod: req.body?.breakAfterPeriod },
      req.ip
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update timetable configuration.' });
  }
});

// ============================================================================
// GET /api/classroom-status/history
// Historical status change events for a class and period (Audit review)
// ============================================================================
router.get('/history', requireAuth, (req, res) => {
  const user = req.user!;
  const { classId, date, period } = req.query;

  if (!classId) {
    res.status(400).json({ error: 'classId is required.' });
    return;
  }

  const cId = Number(classId);
  const cls = db.prepare('SELECT id, name, section_id FROM classes WHERE id = ?').get(cId) as any;
  if (!cls) {
    res.status(404).json({ error: 'Classroom not found.' });
    return;
  }

  if (user.role !== 'admin' && (!cls.section_id || !canAccessSection(user, cls.section_id))) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  try {
    let sql = `
      SELECT id, username, action, entity_type, entity_id, details, timestamp
      FROM audit_logs
      WHERE entity_type = 'classroom_period_statuses'
    `;
    const params: any[] = [];

    if (date) {
      sql += ` AND details LIKE ?`;
      params.push(`%"schoolDate":"${date}"%`);
    }

    if (period) {
      sql += ` AND details LIKE ?`;
      params.push(`%"periodNumber":${Number(period)}%`);
    }

    sql += ` AND details LIKE ?`;
    params.push(`%"classId":${cId}%`);
    sql += ` ORDER BY id DESC LIMIT 50`;

    const logs = db.prepare(sql).all(...params) as any[];
    const parsedLogs = logs.map((l) => ({
      ...l,
      parsedDetails: l.details ? JSON.parse(l.details) : null
    }));

    res.json({ logs: parsedLogs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve status history.' });
  }
});

export default router;
