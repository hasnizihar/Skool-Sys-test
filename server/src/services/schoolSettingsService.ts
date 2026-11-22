import { DatabaseSync } from 'node:sqlite';
import { db } from '../db/database.js';

export interface SchoolProfileData {
  id?: number;
  school_name_en: string;
  school_name_ta?: string;
  school_name_si?: string;
  secondary_title?: string;
  census_no: string;
  school_type: string;
  address_line1: string;
  address_line2?: string;
  district: string;
  province: string;
  country?: string;
  postal_code?: string;
  zone: string;
  division: string;
  phone: string;
  email: string;
  principal_name: string;
  principal_notes?: string;
  founded_year?: number;
  student_category?: string;
  medium?: string;
  supported_grades?: string;
  emblem_status?: string;
  updated_at?: string;
  updated_by_user_id?: number | null;
}

export type PeriodType = 'assembly' | 'teaching' | 'interval' | 'prayer' | 'extra_curricular' | 'other';

export interface DailyPeriodScheduleItem {
  id?: number;
  day_of_week?: string;
  period_number: number;
  name: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  period_type: PeriodType;
  is_active: number;
  sort_order?: number;
}

export const VALID_DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const;

export type DayOfWeek = typeof VALID_DAYS_OF_WEEK[number];

export const DEFAULT_SCHOOL_PROFILE: SchoolProfileData = {
  school_name_en: 'Kattankudy Central College',
  school_name_ta: 'காத்தான்குடி மத்திய கல்லூரி',
  school_name_si: 'කාත්තන්කුඩි මධ්‍ය මහා විද්‍යාලය',
  secondary_title: 'National School — Kattankudy',
  census_no: '14145',
  school_type: 'National School (1AB)',
  address_line1: 'No. 322, Beach Road',
  address_line2: 'New Kattankudy 06',
  district: 'Batticaloa District',
  province: 'Eastern Province',
  country: 'Sri Lanka',
  postal_code: '30130',
  zone: 'Batticaloa Central',
  division: 'Kattankudy',
  phone: '+94 65 224 5321',
  email: 'info@kcc.sch.lk',
  principal_name: 'Mr. A. L. M. Sabry',
  principal_notes: 'Confirmed Ministry of Education 1AB National School Principal',
  founded_year: 1930,
  student_category: 'Boys',
  medium: 'Tamil / English',
  supported_grades: 'Grades 6–13',
  emblem_status: 'verified'
};

export const DEFAULT_WEEKDAY_PERIODS: Omit<DailyPeriodScheduleItem, 'id' | 'day_of_week'>[] = [
  { period_number: 1, name: 'Period 1', start_time: '07:50', end_time: '08:30', period_type: 'teaching', is_active: 1 },
  { period_number: 2, name: 'Period 2', start_time: '08:30', end_time: '09:10', period_type: 'teaching', is_active: 1 },
  { period_number: 3, name: 'Period 3', start_time: '09:10', end_time: '09:50', period_type: 'teaching', is_active: 1 },
  { period_number: 4, name: 'Period 4', start_time: '09:50', end_time: '10:30', period_type: 'teaching', is_active: 1 },
  { period_number: 5, name: 'Interval / Recess', start_time: '10:30', end_time: '10:50', period_type: 'interval', is_active: 1 },
  { period_number: 6, name: 'Period 5', start_time: '10:50', end_time: '11:30', period_type: 'teaching', is_active: 1 },
  { period_number: 7, name: 'Period 6', start_time: '11:30', end_time: '12:10', period_type: 'teaching', is_active: 1 },
  { period_number: 8, name: 'Period 7', start_time: '12:10', end_time: '12:50', period_type: 'teaching', is_active: 1 },
  { period_number: 9, name: 'Period 8', start_time: '12:50', end_time: '13:30', period_type: 'teaching', is_active: 1 }
];

export const DEFAULT_FRIDAY_PERIODS: Omit<DailyPeriodScheduleItem, 'id' | 'day_of_week'>[] = [
  { period_number: 1, name: 'Period 1', start_time: '07:30', end_time: '08:10', period_type: 'teaching', is_active: 1 },
  { period_number: 2, name: 'Period 2', start_time: '08:10', end_time: '08:50', period_type: 'teaching', is_active: 1 },
  { period_number: 3, name: 'Period 3', start_time: '08:50', end_time: '09:30', period_type: 'teaching', is_active: 1 },
  { period_number: 4, name: 'Period 4', start_time: '09:30', end_time: '10:10', period_type: 'teaching', is_active: 1 },
  { period_number: 5, name: 'Interval / Break', start_time: '10:10', end_time: '10:30', period_type: 'interval', is_active: 1 },
  { period_number: 6, name: 'Period 5', start_time: '10:30', end_time: '11:10', period_type: 'teaching', is_active: 1 },
  { period_number: 7, name: 'Period 6', start_time: '11:10', end_time: '11:50', period_type: 'teaching', is_active: 1 }
];

/**
 * Converts "HH:MM" string to minutes from midnight for robust comparisons.
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return -1;
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Ensures tables exist and default data is seeded if empty.
 */
export function ensureSettingsSchemaAndDefaults(targetDb: DatabaseSync = db): void {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS school_information (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      school_name_en TEXT NOT NULL,
      school_name_ta TEXT,
      school_name_si TEXT,
      secondary_title TEXT,
      census_no TEXT NOT NULL,
      school_type TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      address_line2 TEXT,
      district TEXT NOT NULL,
      province TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Sri Lanka',
      postal_code TEXT,
      zone TEXT NOT NULL,
      division TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      principal_name TEXT NOT NULL,
      principal_notes TEXT,
      founded_year INTEGER,
      student_category TEXT DEFAULT 'Boys',
      medium TEXT DEFAULT 'Tamil / English',
      supported_grades TEXT DEFAULT 'Grades 6–13',
      emblem_status TEXT DEFAULT 'verified',
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS school_daily_period_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week TEXT NOT NULL CHECK(day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
      period_number INTEGER NOT NULL CHECK(period_number >= 1 AND period_number <= 12),
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      period_type TEXT NOT NULL DEFAULT 'teaching' CHECK(period_type IN ('assembly', 'teaching', 'interval', 'prayer', 'extra_curricular', 'other')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      sort_order INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(day_of_week, period_number)
    );

    CREATE INDEX IF NOT EXISTS idx_school_daily_schedule ON school_daily_period_schedules(day_of_week, period_number);
  `);

  // Ensure default school information row exists
  const infoRow = targetDb.prepare('SELECT count(*) as count FROM school_information WHERE id = 1').get() as { count: number };
  if (!infoRow || infoRow.count === 0) {
    const p = DEFAULT_SCHOOL_PROFILE;
    targetDb.prepare(`
      INSERT INTO school_information (
        id, school_name_en, school_name_ta, school_name_si, secondary_title,
        census_no, school_type, address_line1, address_line2, district, province,
        country, postal_code, zone, division, phone, email, principal_name,
        principal_notes, founded_year, student_category, medium, supported_grades,
        emblem_status, updated_at
      ) VALUES (
        1, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, datetime('now')
      )
    `).run(
      p.school_name_en, p.school_name_ta || null, p.school_name_si || null, p.secondary_title || null,
      p.census_no, p.school_type, p.address_line1, p.address_line2 || null, p.district, p.province,
      p.country || 'Sri Lanka', p.postal_code || null, p.zone, p.division, p.phone, p.email, p.principal_name,
      p.principal_notes || null, p.founded_year || null, p.student_category || 'Boys', p.medium || 'Tamil / English', p.supported_grades || 'Grades 6–13',
      p.emblem_status || 'verified'
    );
  }

  // Ensure default daily period schedules exist
  const scheduleRow = targetDb.prepare('SELECT count(*) as count FROM school_daily_period_schedules').get() as { count: number };
  if (!scheduleRow || scheduleRow.count === 0) {
    const insertPeriod = targetDb.prepare(`
      INSERT INTO school_daily_period_schedules (
        day_of_week, period_number, name, start_time, end_time, period_type, is_active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Monday through Thursday
    for (const day of ['monday', 'tuesday', 'wednesday', 'thursday'] as const) {
      for (const item of DEFAULT_WEEKDAY_PERIODS) {
        insertPeriod.run(
          day,
          item.period_number,
          item.name,
          item.start_time,
          item.end_time,
          item.period_type,
          item.is_active,
          item.period_number
        );
      }
    }

    // Friday
    for (const item of DEFAULT_FRIDAY_PERIODS) {
      insertPeriod.run(
        'friday',
        item.period_number,
        item.name,
        item.start_time,
        item.end_time,
        item.period_type,
        item.is_active,
        item.period_number
      );
    }
  }

  // Remove any legacy Jummah / prayer schedule records
  try {
    targetDb.prepare("DELETE FROM school_daily_period_schedules WHERE day_of_week = 'friday' AND (period_type = 'prayer' OR name LIKE '%Jummah%')").run();
  } catch {}
}

/**
 * Retrieves the official institutional school profile.
 */
export function getSchoolProfile(targetDb: DatabaseSync = db): SchoolProfileData {
  ensureSettingsSchemaAndDefaults(targetDb);
  const row = targetDb.prepare('SELECT * FROM school_information WHERE id = 1').get() as any;
  if (!row) {
    return DEFAULT_SCHOOL_PROFILE;
  }
  return row as SchoolProfileData;
}

/**
 * Updates the official institutional school profile. Restricted to Administrator.
 */
export function updateSchoolProfile(
  payload: Partial<SchoolProfileData>,
  userId: number,
  targetDb: DatabaseSync = db
): SchoolProfileData {
  ensureSettingsSchemaAndDefaults(targetDb);

  // Validation
  const errors: string[] = [];
  if (!payload.school_name_en?.trim()) errors.push('English school name is required.');
  if (!payload.census_no?.trim()) errors.push('MOE Census number is required.');
  if (!payload.school_type?.trim()) errors.push('School type / classification is required.');
  if (!payload.address_line1?.trim()) errors.push('Address Line 1 is required.');
  if (!payload.district?.trim()) errors.push('District is required.');
  if (!payload.province?.trim()) errors.push('Province is required.');
  if (!payload.zone?.trim()) errors.push('Educational Zone is required.');
  if (!payload.division?.trim()) errors.push('Educational Division is required.');
  if (!payload.phone?.trim()) errors.push('Official phone number is required.');
  if (!payload.principal_name?.trim()) errors.push('Principal name is required.');

  if (!payload.email?.trim()) {
    errors.push('Official email is required.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    errors.push('A valid email address is required.');
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const current = getSchoolProfile(targetDb);

  const updated: SchoolProfileData = {
    school_name_en: payload.school_name_en!.trim(),
    school_name_ta: payload.school_name_ta?.trim() || current.school_name_ta || '',
    school_name_si: payload.school_name_si?.trim() || current.school_name_si || '',
    secondary_title: payload.secondary_title?.trim() || current.secondary_title || '',
    census_no: payload.census_no!.trim(),
    school_type: payload.school_type!.trim(),
    address_line1: payload.address_line1!.trim(),
    address_line2: payload.address_line2?.trim() || current.address_line2 || '',
    district: payload.district!.trim(),
    province: payload.province!.trim(),
    country: payload.country?.trim() || 'Sri Lanka',
    postal_code: payload.postal_code?.trim() || current.postal_code || '',
    zone: payload.zone!.trim(),
    division: payload.division!.trim(),
    phone: payload.phone!.trim(),
    email: payload.email!.trim(),
    principal_name: payload.principal_name!.trim(),
    principal_notes: payload.principal_notes?.trim() || current.principal_notes || '',
    founded_year: payload.founded_year !== undefined ? Number(payload.founded_year) : current.founded_year,
    student_category: payload.student_category?.trim() || current.student_category || 'Boys',
    medium: payload.medium?.trim() || current.medium || 'Tamil / English',
    supported_grades: payload.supported_grades?.trim() || current.supported_grades || 'Grades 6–13',
    emblem_status: payload.emblem_status?.trim() || current.emblem_status || 'verified',
    updated_by_user_id: userId
  };

  targetDb.prepare(`
    UPDATE school_information SET
      school_name_en = ?,
      school_name_ta = ?,
      school_name_si = ?,
      secondary_title = ?,
      census_no = ?,
      school_type = ?,
      address_line1 = ?,
      address_line2 = ?,
      district = ?,
      province = ?,
      country = ?,
      postal_code = ?,
      zone = ?,
      division = ?,
      phone = ?,
      email = ?,
      principal_name = ?,
      principal_notes = ?,
      founded_year = ?,
      student_category = ?,
      medium = ?,
      supported_grades = ?,
      emblem_status = ?,
      updated_at = datetime('now'),
      updated_by_user_id = ?
    WHERE id = 1
  `).run(
    updated.school_name_en,
    updated.school_name_ta ?? null,
    updated.school_name_si ?? null,
    updated.secondary_title ?? null,
    updated.census_no,
    updated.school_type,
    updated.address_line1,
    updated.address_line2 ?? null,
    updated.district,
    updated.province,
    updated.country ?? 'Sri Lanka',
    updated.postal_code ?? null,
    updated.zone,
    updated.division,
    updated.phone,
    updated.email,
    updated.principal_name,
    updated.principal_notes ?? null,
    updated.founded_year ?? null,
    updated.student_category ?? 'Boys',
    updated.medium ?? 'Tamil / English',
    updated.supported_grades ?? 'Grades 6–13',
    updated.emblem_status ?? 'verified',
    userId ?? null
  );

  return getSchoolProfile(targetDb);
}

/**
 * Validates a list of periods for a day schedule:
 * - Period numbers between 1 and 12, unique
 * - Name required
 * - Start time < End time
 * - No overlaps between active periods
 */
export function validatePeriodSchedule(periods: DailyPeriodScheduleItem[]): void {
  if (!Array.isArray(periods)) {
    throw new Error('Periods schedule must be an array.');
  }

  const seenNumbers = new Set<number>();
  const activePeriods: Array<{ period: DailyPeriodScheduleItem; startMin: number; endMin: number }> = [];

  for (const item of periods) {
    if (typeof item.period_number !== 'number' || item.period_number < 1 || item.period_number > 12) {
      throw new Error(`Period number ${item.period_number} is invalid. Must be between 1 and 12.`);
    }
    if (seenNumbers.has(item.period_number)) {
      throw new Error(`Duplicate period number: ${item.period_number}. Each period number must be unique.`);
    }
    seenNumbers.add(item.period_number);

    if (!item.name?.trim()) {
      throw new Error(`Period ${item.period_number} must have a name.`);
    }

    const sMin = timeToMinutes(item.start_time);
    const eMin = timeToMinutes(item.end_time);

    if (sMin < 0 || eMin < 0) {
      throw new Error(`Period "${item.name}" has invalid time format. Use HH:MM in 24-hour time.`);
    }
    if (sMin >= eMin) {
      throw new Error(`Period "${item.name}" start time (${item.start_time}) must be earlier than end time (${item.end_time}).`);
    }

    if (item.is_active !== 0) {
      activePeriods.push({ period: item, startMin: sMin, endMin: eMin });
    }
  }

  // Check for time overlaps among active periods
  activePeriods.sort((a, b) => a.startMin - b.startMin);
  for (let i = 1; i < activePeriods.length; i++) {
    const prev = activePeriods[i - 1];
    const curr = activePeriods[i];
    if (curr.startMin < prev.endMin) {
      throw new Error(
        `Time conflict: "${curr.period.name}" (${curr.period.start_time} - ${curr.period.end_time}) overlaps with "${prev.period.name}" (${prev.period.start_time} - ${prev.period.end_time}).`
      );
    }
  }
}

/**
 * Retrieves daily timetable schedules.
 * If dayOfWeek is provided, returns periods for that day.
 * If omitted, returns an object grouped by all 7 days of the week.
 */
export function getTimetableSchedules(
  dayOfWeek?: string,
  targetDb: DatabaseSync = db
): { schedules: Record<string, DailyPeriodScheduleItem[]>; days: readonly string[] } | DailyPeriodScheduleItem[] {
  ensureSettingsSchemaAndDefaults(targetDb);

  if (dayOfWeek) {
    const normalizedDay = dayOfWeek.toLowerCase().trim() as DayOfWeek;
    if (!VALID_DAYS_OF_WEEK.includes(normalizedDay)) {
      throw new Error(`Invalid day of week: "${dayOfWeek}". Valid days are: ${VALID_DAYS_OF_WEEK.join(', ')}.`);
    }

    const rows = targetDb.prepare(`
      SELECT id, day_of_week, period_number, name, start_time, end_time, period_type, is_active, sort_order
      FROM school_daily_period_schedules
      WHERE day_of_week = ?
      ORDER BY period_number ASC
    `).all(normalizedDay) as any[];

    return rows as DailyPeriodScheduleItem[];
  }

  const allRows = targetDb.prepare(`
    SELECT id, day_of_week, period_number, name, start_time, end_time, period_type, is_active, sort_order
    FROM school_daily_period_schedules
    ORDER BY day_of_week ASC, period_number ASC
  `).all() as any[];

  const schedules: Record<string, DailyPeriodScheduleItem[]> = {};
  for (const day of VALID_DAYS_OF_WEEK) {
    schedules[day] = [];
  }

  for (const row of allRows) {
    if (schedules[row.day_of_week]) {
      schedules[row.day_of_week].push(row as DailyPeriodScheduleItem);
    }
  }

  return { schedules, days: VALID_DAYS_OF_WEEK };
}

/**
 * Atomically updates the period timetable schedule for a specific day of the week.
 */
export function updateDailyTimetableSchedule(
  dayOfWeek: string,
  periods: DailyPeriodScheduleItem[],
  _userId: number,
  targetDb: DatabaseSync = db
): { success: boolean; message: string; periods: DailyPeriodScheduleItem[] } {
  ensureSettingsSchemaAndDefaults(targetDb);

  const normalizedDay = dayOfWeek.toLowerCase().trim() as DayOfWeek;
  if (!VALID_DAYS_OF_WEEK.includes(normalizedDay)) {
    throw new Error(`Invalid day of week: "${dayOfWeek}". Valid days are: ${VALID_DAYS_OF_WEEK.join(', ')}.`);
  }

  validatePeriodSchedule(periods);

  targetDb.exec('BEGIN IMMEDIATE;');
  try {
    // Clear existing periods for this day
    targetDb.prepare('DELETE FROM school_daily_period_schedules WHERE day_of_week = ?').run(normalizedDay);

    const insertStmt = targetDb.prepare(`
      INSERT INTO school_daily_period_schedules (
        day_of_week, period_number, name, start_time, end_time, period_type, is_active, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const p of periods) {
      insertStmt.run(
        normalizedDay,
        p.period_number,
        p.name.trim(),
        p.start_time.trim(),
        p.end_time.trim(),
        p.period_type || 'teaching',
        p.is_active !== undefined ? (p.is_active ? 1 : 0) : 1,
        p.sort_order || p.period_number
      );
    }

    targetDb.exec('COMMIT;');

    const saved = targetDb.prepare(`
      SELECT id, day_of_week, period_number, name, start_time, end_time, period_type, is_active, sort_order
      FROM school_daily_period_schedules
      WHERE day_of_week = ?
      ORDER BY period_number ASC
    `).all(normalizedDay) as any[];

    return {
      success: true,
      message: `Timetable schedule for ${normalizedDay.charAt(0).toUpperCase() + normalizedDay.slice(1)} updated successfully (${saved.length} periods).`,
      periods: saved as DailyPeriodScheduleItem[]
    };
  } catch (err) {
    try {
      targetDb.exec('ROLLBACK;');
    } catch {}
    throw err;
  }
}

/**
 * Copies a source day's period schedule to one or more target days.
 */
export function copyTimetableSchedule(
  sourceDay: string,
  targetDays: string[],
  userId: number,
  targetDb: DatabaseSync = db
): { success: boolean; message: string; targetDays: string[] } {
  ensureSettingsSchemaAndDefaults(targetDb);

  const normSource = sourceDay.toLowerCase().trim() as DayOfWeek;
  if (!VALID_DAYS_OF_WEEK.includes(normSource)) {
    throw new Error(`Invalid source day: "${sourceDay}".`);
  }

  if (!Array.isArray(targetDays) || targetDays.length === 0) {
    throw new Error('At least one target day must be selected.');
  }

  const validTargets = targetDays.map((d) => d.toLowerCase().trim() as DayOfWeek);
  for (const t of validTargets) {
    if (!VALID_DAYS_OF_WEEK.includes(t)) {
      throw new Error(`Invalid target day: "${t}".`);
    }
  }

  const sourcePeriods = targetDb.prepare(`
    SELECT period_number, name, start_time, end_time, period_type, is_active, sort_order
    FROM school_daily_period_schedules
    WHERE day_of_week = ?
    ORDER BY period_number ASC
  `).all(normSource) as any[];

  if (sourcePeriods.length === 0) {
    throw new Error(`Source day "${normSource}" does not have any configured periods to copy.`);
  }

  targetDb.exec('BEGIN IMMEDIATE;');
  try {
    const deleteStmt = targetDb.prepare('DELETE FROM school_daily_period_schedules WHERE day_of_week = ?');
    const insertStmt = targetDb.prepare(`
      INSERT INTO school_daily_period_schedules (
        day_of_week, period_number, name, start_time, end_time, period_type, is_active, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const targetDay of validTargets) {
      deleteStmt.run(targetDay);
      for (const p of sourcePeriods) {
        insertStmt.run(
          targetDay,
          p.period_number,
          p.name,
          p.start_time,
          p.end_time,
          p.period_type,
          p.is_active,
          p.sort_order
        );
      }
    }

    targetDb.exec('COMMIT;');

    const prettyTargets = validTargets.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
    return {
      success: true,
      message: `Successfully copied ${sourcePeriods.length} periods from ${normSource.charAt(0).toUpperCase() + normSource.slice(1)} to ${prettyTargets}.`,
      targetDays: validTargets
    };
  } catch (err) {
    try {
      targetDb.exec('ROLLBACK;');
    } catch {}
    throw err;
  }
}

/**
 * Resets a day or all weekdays to the default pilot baseline schedule.
 */
export function resetTimetableSchedule(
  dayOfWeek?: string,
  _userId?: number,
  targetDb: DatabaseSync = db
): { success: boolean; message: string } {
  ensureSettingsSchemaAndDefaults(targetDb);

  targetDb.exec('BEGIN IMMEDIATE;');
  try {
    const insertPeriod = targetDb.prepare(`
      INSERT INTO school_daily_period_schedules (
        day_of_week, period_number, name, start_time, end_time, period_type, is_active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const daysToReset = dayOfWeek
      ? [dayOfWeek.toLowerCase().trim() as DayOfWeek]
      : (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const);

    for (const day of daysToReset) {
      if (!VALID_DAYS_OF_WEEK.includes(day)) {
        throw new Error(`Invalid day: "${day}".`);
      }

      targetDb.prepare('DELETE FROM school_daily_period_schedules WHERE day_of_week = ?').run(day);

      if (day === 'friday') {
        for (const item of DEFAULT_FRIDAY_PERIODS) {
          insertPeriod.run(
            'friday',
            item.period_number,
            item.name,
            item.start_time,
            item.end_time,
            item.period_type,
            item.is_active,
            item.period_number
          );
        }
      } else if (['monday', 'tuesday', 'wednesday', 'thursday'].includes(day)) {
        for (const item of DEFAULT_WEEKDAY_PERIODS) {
          insertPeriod.run(
            day,
            item.period_number,
            item.name,
            item.start_time,
            item.end_time,
            item.period_type,
            item.is_active,
            item.period_number
          );
        }
      }
    }

    targetDb.exec('COMMIT;');
    return {
      success: true,
      message: dayOfWeek
        ? `Reset ${dayOfWeek} timetable schedule to default.`
        : 'Reset all standard weekday schedules to default.'
    };
  } catch (err) {
    try {
      targetDb.exec('ROLLBACK;');
    } catch {}
    throw err;
  }
}
