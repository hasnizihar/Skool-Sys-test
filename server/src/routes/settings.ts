import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import {
  getSchoolProfile,
  updateSchoolProfile,
  getTimetableSchedules,
  updateDailyTimetableSchedule,
  copyTimetableSchedule,
  resetTimetableSchedule,
  DailyPeriodScheduleItem
} from '../services/schoolSettingsService.js';

const router = Router();

// ============================================================================
// 1. School Information & Metadata Endpoints
// ============================================================================

/**
 * GET /api/admin/settings/school-profile
 * Retrieve official school profile, institutional metadata, and identity info.
 * Requires authentication.
 */
router.get('/school-profile', requireAuth, (req, res) => {
  try {
    const profile = getSchoolProfile();
    res.json({ profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve school profile.' });
  }
});

/**
 * PUT /api/admin/settings/school-profile
 * Update official school profile and institutional metadata.
 * Strictly restricted to Administrator (Principal).
 */
router.put('/school-profile', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const updated = updateSchoolProfile(req.body, req.user!.id);

    logAudit(
      req.user!.id,
      req.user!.username,
      'UPDATE_SCHOOL_PROFILE',
      'school_information',
      1,
      {
        schoolName: updated.school_name_en,
        censusNo: updated.census_no,
        principal: updated.principal_name
      },
      req.ip
    );

    res.json({
      success: true,
      message: 'School profile and institutional metadata updated successfully.',
      profile: updated
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update school profile.' });
  }
});

// ============================================================================
// 2. Daily Timetable & Period Schedule Endpoints
// ============================================================================

/**
 * GET /api/admin/settings/timetable-schedules
 * Retrieve day-by-day timetable schedules (Monday - Sunday).
 * Optional query parameter: ?day=monday
 * Requires authentication.
 */
router.get('/timetable-schedules', requireAuth, (req, res) => {
  try {
    const { day } = req.query;
    const result = getTimetableSchedules(day ? String(day) : undefined);
    if (day) {
      res.json({ day, periods: result });
    } else {
      res.json(result);
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to retrieve timetable schedules.' });
  }
});

/**
 * PUT /api/admin/settings/timetable-schedules/:day
 * Atomically update the period timetable schedule for a specific day.
 * Strictly restricted to Administrator (Principal).
 */
router.put('/timetable-schedules/:day', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const day = String(req.params.day);
    const { periods } = req.body;

    if (!Array.isArray(periods)) {
      res.status(400).json({ error: 'Request body must contain an array of periods.' });
      return;
    }

    const result = updateDailyTimetableSchedule(day, periods as DailyPeriodScheduleItem[], req.user!.id);

    logAudit(
      req.user!.id,
      req.user!.username,
      'UPDATE_DAILY_TIMETABLE',
      'school_daily_period_schedules',
      null,
      { day, periodsCount: periods.length },
      req.ip
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update timetable schedule.' });
  }
});

/**
 * POST /api/admin/settings/timetable-schedules/copy
 * Copy a source day's period schedule to one or more target days.
 * Strictly restricted to Administrator (Principal).
 */
router.post('/timetable-schedules/copy', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const { sourceDay, targetDays } = req.body;
    if (!sourceDay || !Array.isArray(targetDays) || targetDays.length === 0) {
      res.status(400).json({ error: 'sourceDay and a non-empty targetDays array are required.' });
      return;
    }

    const result = copyTimetableSchedule(sourceDay, targetDays, req.user!.id);

    logAudit(
      req.user!.id,
      req.user!.username,
      'COPY_DAILY_TIMETABLE',
      'school_daily_period_schedules',
      null,
      { sourceDay, targetDays },
      req.ip
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to copy timetable schedule.' });
  }
});

/**
 * POST /api/admin/settings/timetable-schedules/reset-default
 * Reset timetable schedules for a specific day or all weekdays to the pilot default.
 * Strictly restricted to Administrator (Principal).
 */
router.post('/timetable-schedules/reset-default', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const { day } = req.body;
    const result = resetTimetableSchedule(day ? String(day) : undefined, req.user!.id);

    logAudit(
      req.user!.id,
      req.user!.username,
      'RESET_DAILY_TIMETABLE',
      'school_daily_period_schedules',
      null,
      { day: day || 'all_weekdays' },
      req.ip
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reset timetable schedule.' });
  }
});

export default router;
