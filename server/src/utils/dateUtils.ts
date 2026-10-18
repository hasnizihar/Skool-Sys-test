/**
 * SkoolSys 2.0 — Date Utilities for Sri Lankan Civil Calendar
 * Pinned strictly to Asia/Colombo (UTC+05:30) to eliminate UTC midnight boundary shifts.
 */

/**
 * Returns the current date (or a provided Date object) as an ISO civil date string 'YYYY-MM-DD'
 * in the Asia/Colombo time zone.
 */
export function getColomboCivilDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;

  return `${y}-${m}-${d}`;
}

/**
 * Validates whether a string is a real, calendar-possible ISO civil date 'YYYY-MM-DD'.
 * Rejects non-ISO formats, out-of-range months, invalid days, and non-leap year Feb 29.
 */
export function isValidCivilDate(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;

  // Days per month considering leap years
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const maxDays = daysInMonth[month - 1];
  return day >= 1 && day <= maxDays;
}
