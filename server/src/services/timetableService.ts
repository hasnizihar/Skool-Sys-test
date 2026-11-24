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
  autoSelectedPeriod?: number;
  livePeriodNumber?: number | null;
  availablePeriods: Array<{
    periodNumber: number | null;
    rawSlot?: number;
    name: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
    periodType?: string;
    isTeaching?: boolean;
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
 * Automatically determines the appropriate period (1..9) according to civil time 'HH:MM'.
 * Matches active period start/end times, interval (preceding period),
 * early morning (Period 1), or after school / evening (Period 9 / last period).
 */
export function matchPeriodByTime(
  currentTime: string,
  periods: Array<{ period_number?: number; periodNumber?: number | null; start_time?: string; startTime?: string; end_time?: string; endTime?: string }>
): number {
  const teachingOnly = (periods || []).filter(
    (p) => (p.periodNumber !== null && p.periodNumber !== undefined) || (p.period_number !== null && p.period_number !== undefined)
  );
  if (!teachingOnly || teachingOnly.length === 0) return 1;

  const toMins = (t?: string) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map((v) => parseInt(v, 10));
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  };

  const currentMins = toMins(currentTime);
  const getStart = (p: any) => p.startTime || p.start_time || '';
  const getEnd = (p: any) => p.endTime || p.end_time || '';
  const getNum = (p: any) => Number(p.periodNumber ?? p.period_number ?? 1);

  const sorted = [...teachingOnly].sort((a, b) => toMins(getStart(a)) - toMins(getStart(b)));

  // 1. Direct active interval match
  for (const p of sorted) {
    const s = toMins(getStart(p));
    const e = toMins(getEnd(p));
    if (currentMins >= s && currentMins < e) {
      return getNum(p);
    }
  }

  // 2. Before first period (early morning) -> Period 1
  if (sorted.length > 0 && currentMins < toMins(getStart(sorted[0]))) {
    return getNum(sorted[0]);
  }

  // 3. Between periods (e.g. interval) -> period before the interval
  for (let i = 0; i < sorted.length - 1; i++) {
    const cEnd = toMins(getEnd(sorted[i]));
    const nStart = toMins(getStart(sorted[i + 1]));
    if (currentMins >= cEnd && currentMins <= nStart) {
      return getNum(sorted[i]);
    }
  }

  // 4. After last period (evening/night) -> last period
  if (sorted.length > 0 && currentMins >= toMins(getEnd(sorted[sorted.length - 1]))) {
    return getNum(sorted[sorted.length - 1]);
  }

  return getNum(sorted[0]);
}

/**
 * Resolves active period context in the Sri Lankan civil timezone.
 *
 * Supports optional simulation/review overrides:
 * - overrideDate: inspect statuses on a historical date.
 * - overridePeriod: explicitly focus on a specific teaching period (1..9).
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
  const dayOfWeek = overrideDate ? getColomboDayOfWeek(new Date(overrideDate + 'T12:00:00Z')) : getColomboDayOfWeek();

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];

  let dailyPeriods: any[] = [];
  try {
    dailyPeriods = targetDb.prepare(`
      SELECT period_number, name, start_time, end_time, period_type, is_active, sort_order
      FROM school_daily_period_schedules
      WHERE day_of_week = ? AND is_active = 1
      ORDER BY start_time ASC, period_number ASC
    `).all(dayName) as any[];
  } catch {
    dailyPeriods = [];
  }

  // Enforce: ONLY teaching periods are considered as numbered periods (1..9)
  // Non-teaching slots (assembly, interval, prayer, etc.) do not consume teaching period numbers.
  let teachingCounter = 0;
  const availablePeriods = (dailyPeriods.length > 0 ? dailyPeriods : config.periods).map((p: any) => {
    const isTeaching = (p.period_type || 'teaching') === 'teaching';
    let teachingPeriodNum: number | null = null;
    let displayName = p.name?.trim() || '';

    if (isTeaching) {
      teachingCounter++;
      const match = displayName.match(/Period\s*(\d+)/i);
      teachingPeriodNum = match ? parseInt(match[1], 10) : teachingCounter;
      displayName = `Period ${teachingPeriodNum}`;
    } else {
      if (p.period_type === 'assembly' && !displayName) displayName = 'Morning Assembly';
      if (p.period_type === 'interval' && !displayName) displayName = 'Interval / Recess';
    }

    return {
      rawSlot: p.period_number,
      periodNumber: isTeaching ? (teachingPeriodNum ?? teachingCounter) : null,
      name: displayName,
      startTime: p.start_time,
      endTime: p.end_time,
      isActive: Boolean(p.is_active),
      periodType: p.period_type || 'teaching',
      isTeaching
    };
  });

  const breakInfo = config.breakStartTime && config.breakEndTime ? {
    afterPeriod: config.breakAfterPeriod,
    name: config.breakName,
    startTime: config.breakStartTime,
    endTime: config.breakEndTime
  } : undefined;

  const teachingPeriods = availablePeriods.filter((p) => p.isTeaching && p.periodNumber !== null) as Array<{
    periodNumber: number;
    name: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
    periodType: string;
    isTeaching: boolean;
  }>;
  const autoSelectedPeriod = matchPeriodByTime(currentTime, teachingPeriods);

  // 1. Unconfigured State
  if (!config.isConfigured || availablePeriods.length === 0) {
    return {
      configured: false,
      state: 'unconfigured',
      periodNumber: overridePeriod && overridePeriod >= 1 && overridePeriod <= 12 ? overridePeriod : null,
      periodName: overridePeriod ? `Period ${overridePeriod}` : null,
      startTime: null,
      endTime: null,
      schoolDate,
      currentTime,
      isBreak: false,
      message: 'Official school timetable configuration is pending. The Principal must configure the periods in settings.',
      autoSelectedPeriod,
      availablePeriods,
      breakInfo
    };
  }

  // 2. Explicit Period Override (for reviewing historical/specific teaching periods)
  if (overridePeriod !== undefined && overridePeriod !== null) {
    const pNum = Number(overridePeriod);
    const selected = availablePeriods.find((p) => p.periodNumber === pNum && p.isTeaching);
    if (selected) {
      return {
        configured: true,
        state: 'active',
        periodNumber: selected.periodNumber,
        periodName: selected.name,
        startTime: selected.startTime,
        endTime: selected.endTime,
        schoolDate,
        currentTime,
        isBreak: false,
        message: `${selected.name} (${selected.startTime} - ${selected.endTime})`,
        autoSelectedPeriod,
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
      autoSelectedPeriod,
      availablePeriods,
      breakInfo
    };
  }

  const currentMins = timeToMinutes(currentTime);

  // 4a. Check if current time falls within any non-teaching interval (Interval, Prayer, Assembly)
  const activeNonTeaching = availablePeriods.find(
    (p) => !p.isTeaching && currentMins >= timeToMinutes(p.startTime) && currentMins < timeToMinutes(p.endTime)
  );
  if (activeNonTeaching) {
    return {
      configured: true,
      state: 'break',
      periodNumber: null,
      periodName: activeNonTeaching.name,
      startTime: activeNonTeaching.startTime,
      endTime: activeNonTeaching.endTime,
      schoolDate,
      currentTime,
      isBreak: true,
      message: `${activeNonTeaching.name} in progress (${activeNonTeaching.startTime} - ${activeNonTeaching.endTime}). No teaching periods are active during this interval.`,
      autoSelectedPeriod,
      availablePeriods,
      breakInfo: {
        afterPeriod: 0,
        name: activeNonTeaching.name,
        startTime: activeNonTeaching.startTime,
        endTime: activeNonTeaching.endTime
      }
    };
  }

  // 4b. Break check (from legacy settings if configured)
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
        autoSelectedPeriod,
        availablePeriods,
        breakInfo
      };
    }
  }

  // 5. Check whole school day boundary across all scheduled events
  const allScheduledEvents = [...availablePeriods]
    .filter((p) => p.startTime && p.endTime)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const firstEvent = allScheduledEvents[0];
  const lastEvent = allScheduledEvents[allScheduledEvents.length - 1];

  if (firstEvent && currentMins < timeToMinutes(firstEvent.startTime)) {
    const firstTeaching = teachingPeriods[0];
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
      message: `Before school hours. School commences at ${firstEvent.startTime}${firstTeaching ? ` (Period 1 commences at ${firstTeaching.startTime})` : ''}.`,
      autoSelectedPeriod,
      availablePeriods,
      breakInfo
    };
  }

  if (lastEvent && currentMins >= timeToMinutes(lastEvent.endTime)) {
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
      message: `School day concluded at ${lastEvent.endTime}.`,
      autoSelectedPeriod,
      availablePeriods,
      breakInfo
    };
  }

  // 6. Match active teaching period
  const sortedTeaching = [...teachingPeriods].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  for (const p of sortedTeaching) {
    const pStart = timeToMinutes(p.startTime);
    const pEnd = timeToMinutes(p.endTime);
    if (currentMins >= pStart && currentMins < pEnd) {
      return {
        configured: true,
        state: 'active',
        periodNumber: p.periodNumber,
        periodName: p.name,
        startTime: p.startTime,
        endTime: p.endTime,
        schoolDate,
        currentTime,
        isBreak: false,
        message: `${p.name} in progress (${p.startTime} - ${p.endTime})`,
        autoSelectedPeriod,
        availablePeriods,
        breakInfo
      };
    }
  }

  // 7. Between teaching periods (transition interval between periods)
  for (let i = 0; i < sortedTeaching.length - 1; i++) {
    const cEnd = timeToMinutes(sortedTeaching[i].endTime);
    const nStart = timeToMinutes(sortedTeaching[i + 1].startTime);
    if (currentMins >= cEnd && currentMins <= nStart) {
      return {
        configured: true,
        state: 'active',
        periodNumber: sortedTeaching[i].periodNumber,
        periodName: sortedTeaching[i].name,
        startTime: sortedTeaching[i].startTime,
        endTime: sortedTeaching[i].endTime,
        schoolDate,
        currentTime,
        isBreak: false,
        message: `Transition between ${sortedTeaching[i].name} and ${sortedTeaching[i + 1].name}`,
        autoSelectedPeriod,
        availablePeriods,
        breakInfo
      };
    }
  }

  // Fallback to first teaching period if inside school hours
  return {
    configured: true,
    state: 'active',
    periodNumber: sortedTeaching[0]?.periodNumber || 1,
    periodName: sortedTeaching[0]?.name || 'Period 1',
    startTime: sortedTeaching[0]?.startTime || null,
    endTime: sortedTeaching[0]?.endTime || null,
    schoolDate,
    currentTime,
    isBreak: false,
    message: 'Period transition interval',
    autoSelectedPeriod,
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
