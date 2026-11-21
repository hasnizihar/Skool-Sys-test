import { DatabaseSync } from 'node:sqlite';
import { db } from '../db/database.js';
import { getColomboCivilDate } from '../utils/dateUtils.js';

export interface SchoolPeriod {
  id: number;
  period_number: number;
  name: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  is_active: number;
  sort_order: number;
}

export interface TimetableConfig {
  timezone: string;
  breakAfterPeriod: number;
  breakName: string;
  breakStartTime: string;
  breakEndTime: string;
  schoolDays: number[]; // 1=Mon, ..., 5=Fri
  isConfigured: boolean;
  periods: SchoolPeriod[];
}

export interface ActivePeriodContext {
  configured: boolean;
  state: 'active' | 'break' | 'before_school' | 'after_school' | 'weekend' | 'unconfigured';
  periodNumber: number | null;
  periodName: string | null;
  startTime: string | null;
  endTime: string | null;
  schoolDate: string;  // YYYY-MM-DD
  currentTime: string; // HH:MM
  isBreak: boolean;
  message: string;
  availablePeriods: Array<{
    periodNumber: number;
    name: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>;
  breakInfo?: {
    afterPeriod: number;
    name: string;
    startTime: string;
    endTime: string;
  };
}

/**
 * Returns current civil time 'HH:MM' (24-hour) in Asia/Colombo.
 */
export function getColomboCivilTime(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const h = parts.find((p) => p.type === 'hour')!.value;
  const m = parts.find((p) => p.type === 'minute')!.value;
  return `${h}:${m}`;
}

/**
 * Returns day of week (0=Sunday, 1=Monday, ..., 6=Saturday) in Asia/Colombo.
 */
export function getColomboDayOfWeek(date: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    weekday: 'short'
  });
  const dayName = formatter.format(date);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.indexOf(dayName);
}

/**
 * Converts "HH:MM" string to minutes from midnight for robust comparisons.
 */
function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return -1;
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Reads timetable configuration from the database.
 */
export function getTimetableConfig(targetDb: DatabaseSync = db): TimetableConfig {
  const settingsRows = targetDb.prepare('SELECT setting_key, setting_value FROM timetable_settings').all() as Array<{
    setting_key: string;
    setting_value: string;
  }>;

  const map = new Map<string, string>();
  for (const row of settingsRows) {
    map.set(row.setting_key, row.setting_value);
  }

  const periods = targetDb.prepare(`
    SELECT id, period_number, name, start_time, end_time, is_active, sort_order
    FROM school_periods
    WHERE is_active = 1
    ORDER BY period_number ASC
  `).all() as unknown as SchoolPeriod[];

  const schoolDaysStr = map.get('school_days') || '1,2,3,4,5';
  const schoolDays = schoolDaysStr.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
  const isConfigured = map.get('is_configured') === '1' && periods.length >= 9;

  return {
    timezone: map.get('timezone') || 'Asia/Colombo',
    breakAfterPeriod: parseInt(map.get('break_after_period') || '4', 10),
    breakName: map.get('break_name') || 'Interval / Recess',
    breakStartTime: map.get('break_start_time') || '',
    breakEndTime: map.get('break_end_time') || '',
    schoolDays,
    isConfigured,
    periods
  };
}

/**
 * Resolves active period context in the Sri Lankan civil timezone.
 *
 * Supports optional simulation/review overrides:
 * - overrideDate: inspect statuses on a historical date.
 * - overridePeriod: explicitly focus on a specific period (1..9).
 * - customTime: override time for deterministic testing.
 */
export function resolveActivePeriodContext(
  overrideDate?: string,
  overridePeriod?: number,
  customTime?: string,
  targetDb: DatabaseSync = db
): ActivePeriodContext {
  const config = getTimetableConfig(targetDb);
  const schoolDate = overrideDate || getColomboCivilDate();
  const currentTime = customTime || getColomboCivilTime();
  const dayOfWeek = getColomboDayOfWeek();

  const availablePeriods = config.periods.map((p) => ({
    periodNumber: p.period_number,
    name: p.name,
    startTime: p.start_time,
    endTime: p.end_time,
    isActive: Boolean(p.is_active)
  }));

  const breakInfo = config.breakStartTime && config.breakEndTime ? {
    afterPeriod: config.breakAfterPeriod,
    name: config.breakName,
    startTime: config.breakStartTime,
    endTime: config.breakEndTime
  } : undefined;

  // 1. Unconfigured State
  if (!config.isConfigured || config.periods.length === 0) {
    return {
      configured: false,
      state: 'unconfigured',
      periodNumber: overridePeriod && overridePeriod >= 1 && overridePeriod <= 9 ? overridePeriod : null,
      periodName: overridePeriod ? `Period ${overridePeriod}` : null,
      startTime: null,
      endTime: null,
      schoolDate,
      currentTime,
      isBreak: false,
      message: 'Official school timetable configuration is pending. The Principal must configure the 9 periods in settings.',
      availablePeriods,
      breakInfo
    };
  }

  // 2. Explicit Period Override (for reviewing historical/specific periods)
  if (overridePeriod !== undefined && overridePeriod !== null) {
    const pNum = Number(overridePeriod);
    const selected = config.periods.find((p) => p.period_number === pNum);
    if (selected) {
      return {
        configured: true,
        state: 'active',
        periodNumber: selected.period_number,
        periodName: selected.name,
        startTime: selected.start_time,
        endTime: selected.end_time,
        schoolDate,
        currentTime,
        isBreak: false,
        message: `${selected.name} (${selected.start_time} - ${selected.end_time})`,
        availablePeriods,
        breakInfo
      };
    }
  }

  // 3. Weekend / Non-school day check (only if not an override date)
  if (!overrideDate && !config.schoolDays.includes(dayOfWeek)) {
    return {
      configured: true,
      state: 'weekend',
      periodNumber: null,
      periodName: null,
      startTime: null,
      endTime: null,
      schoolDate,
      currentTime,
      isBreak: false,
      message: 'Outside active school days (Weekend)',
      availablePeriods,
      breakInfo
    };
  }

  const currentMins = timeToMinutes(currentTime);

  // 4. Break check
  if (config.breakStartTime && config.breakEndTime) {
    const bStart = timeToMinutes(config.breakStartTime);
    const bEnd = timeToMinutes(config.breakEndTime);
    if (currentMins >= bStart && currentMins < bEnd) {
      return {
        configured: true,
        state: 'break',
        periodNumber: null,
        periodName: config.breakName,
        startTime: config.breakStartTime,
        endTime: config.breakEndTime,
        schoolDate,
        currentTime,
        isBreak: true,
        message: `${config.breakName} in progress (${config.breakStartTime} - ${config.breakEndTime})`,
        availablePeriods,
        breakInfo
      };
    }
  }

  // 5. Sorted period boundary check
  const sorted = [...config.periods].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  const firstPeriod = sorted[0];
  const lastPeriod = sorted[sorted.length - 1];

  if (firstPeriod && currentMins < timeToMinutes(firstPeriod.start_time)) {
    return {
      configured: true,
      state: 'before_school',
      periodNumber: null,
      periodName: null,
      startTime: null,
      endTime: null,
      schoolDate,
      currentTime,
      isBreak: false,
      message: `Before school hours. Period 1 commences at ${firstPeriod.start_time}.`,
      availablePeriods,
      breakInfo
    };
  }

  if (lastPeriod && currentMins >= timeToMinutes(lastPeriod.end_time)) {
    return {
      configured: true,
      state: 'after_school',
      periodNumber: null,
      periodName: null,
      startTime: null,
      endTime: null,
      schoolDate,
      currentTime,
      isBreak: false,
      message: `School day concluded at ${lastPeriod.end_time}.`,
      availablePeriods,
      breakInfo
    };
  }

  // 6. Match active period
  for (const p of sorted) {
    const pStart = timeToMinutes(p.start_time);
    const pEnd = timeToMinutes(p.end_time);
    if (currentMins >= pStart && currentMins < pEnd) {
      return {
        configured: true,
        state: 'active',
        periodNumber: p.period_number,
        periodName: p.name,
        startTime: p.start_time,
        endTime: p.end_time,
        schoolDate,
        currentTime,
        isBreak: false,
        message: `${p.name} in progress (${p.start_time} - ${p.end_time})`,
        availablePeriods,
        breakInfo
      };
    }
  }

  // Fallback if between periods
  return {
    configured: true,
    state: 'active',
    periodNumber: sorted[0]?.period_number || 1,
    periodName: sorted[0]?.name || 'Period 1',
    startTime: sorted[0]?.start_time || null,
    endTime: sorted[0]?.end_time || null,
    schoolDate,
    currentTime,
    isBreak: false,
    message: 'Period transition interval',
    availablePeriods,
    breakInfo
  };
}

/**
 * Configures the official 9 periods and break structure.
 * (Principal / Admin only)
 */
export function updateTimetableConfig(
  payload: {
    periods: Array<{ periodNumber: number; name?: string; startTime: string; endTime: string }>;
    breakAfterPeriod?: number;
    breakStartTime?: string;
    breakEndTime?: string;
    breakName?: string;
    schoolDays?: number[];
  },
  targetDb: DatabaseSync = db
): { success: boolean; message: string } {
  if (!Array.isArray(payload.periods) || payload.periods.length !== 9) {
    throw new Error('Exactly 9 teaching periods must be configured.');
  }

  // Validate period numbers 1 through 9
  const numbers = new Set<number>();
  for (const p of payload.periods) {
    if (typeof p.periodNumber !== 'number' || p.periodNumber < 1 || p.periodNumber > 9) {
      throw new Error(`Invalid period number: ${p.periodNumber}. Must be between 1 and 9.`);
    }
    if (numbers.has(p.periodNumber)) {
      throw new Error(`Duplicate period number: ${p.periodNumber}.`);
    }
    numbers.add(p.periodNumber);

    const sMin = timeToMinutes(p.startTime);
    const eMin = timeToMinutes(p.endTime);
    if (sMin < 0 || eMin < 0 || sMin >= eMin) {
      throw new Error(`Period ${p.periodNumber} has invalid start/end times: "${p.startTime}" - "${p.endTime}".`);
    }
  }

  targetDb.exec('BEGIN IMMEDIATE;');
  try {
    const upsertPeriod = targetDb.prepare(`
      INSERT INTO school_periods (period_number, name, start_time, end_time, is_active, sort_order, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, datetime('now'))
      ON CONFLICT(period_number) DO UPDATE SET
        name = excluded.name,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        is_active = 1,
        sort_order = excluded.sort_order,
        updated_at = datetime('now')
    `);

    for (const p of payload.periods) {
      upsertPeriod.run(
        p.periodNumber,
        p.name || `Period ${p.periodNumber}`,
        p.startTime,
        p.endTime,
        p.periodNumber
      );
    }

    const setSetting = targetDb.prepare(`
      INSERT INTO timetable_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = datetime('now')
    `);

    if (payload.breakAfterPeriod !== undefined) {
      setSetting.run('break_after_period', String(payload.breakAfterPeriod));
    }
    if (payload.breakStartTime !== undefined) {
      setSetting.run('break_start_time', payload.breakStartTime);
    }
    if (payload.breakEndTime !== undefined) {
      setSetting.run('break_end_time', payload.breakEndTime);
    }
    if (payload.breakName !== undefined) {
      setSetting.run('break_name', payload.breakName);
    }
    if (payload.schoolDays !== undefined) {
      setSetting.run('school_days', payload.schoolDays.join(','));
    }

    setSetting.run('is_configured', '1');

    targetDb.exec('COMMIT;');
    return { success: true, message: 'Timetable configured successfully with 9 teaching periods.' };
  } catch (err) {
    try {
      targetDb.exec('ROLLBACK;');
    } catch {}
    throw err;
  }
}
