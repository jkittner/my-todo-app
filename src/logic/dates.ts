// Calendar dates are stored as local "YYYY-MM-DD" strings; timestamps as ISO strings.

export const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toDateKey(parseDateKey(value)) === value;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Monday 00:00 of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (r.getDay() + 6) % 7;
  return addDays(r, -offset);
}

export function weekRange(d: Date): { from: string; to: string } {
  const start = startOfWeek(d);
  return { from: toDateKey(start), to: toDateKey(addDays(start, 6)) };
}

export function monthRange(d: Date): { from: string; to: string } {
  return {
    from: toDateKey(new Date(d.getFullYear(), d.getMonth(), 1)),
    to: toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

/** The moment a due date has passed: midnight at the start of the following day. */
export function dueDeadline(dueKey: string): Date {
  return addDays(parseDateKey(dueKey), 1);
}

export function isPastDue(dueKey: string, now: Date): boolean {
  return now.getTime() >= dueDeadline(dueKey).getTime();
}

export function msBetween(fromIso: string, toIso: string): number {
  return new Date(toIso).getTime() - new Date(fromIso).getTime();
}

/** Short human duration such as "3 h", "2.5 days" or "under 1 h". */
export function formatDuration(ms: number): string {
  if (ms < 3_600_000) return 'under 1 h';
  if (ms < DAY_MS) return `${Math.round(ms / 3_600_000)} h`;
  const days = Math.round((ms / DAY_MS) * 10) / 10;
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const MONTH_MS = (DAY_MS * 365.25) / 12;
export const YEAR_MS = DAY_MS * 365.25;

/** Minutes up to an hour, hours up to a day, days up to two months, months up to a year, then years. */
const HUMAN_SCALES = [
  { size: MINUTE_MS, until: 60 * MINUTE_MS, decimals: 0, one: 'min', many: 'min' },
  { size: HOUR_MS, until: DAY_MS, decimals: 1, one: 'h', many: 'h' },
  { size: DAY_MS, until: 60 * DAY_MS, decimals: 1, one: 'day', many: 'days' },
  { size: MONTH_MS, until: YEAR_MS, decimals: 1, one: 'month', many: 'months' },
  { size: YEAR_MS, until: Infinity, decimals: 1, one: 'year', many: 'years' },
];

/**
 * A duration in the unit that fits its size: "45 min", "3.5 h", "2 days", "4.5 months", "1.2 years".
 * Chart labels use it so a quick task reads as minutes and a long one as years.
 */
export function humanDuration(ms: number): string {
  if (ms === 0) return '0';
  if (ms < MINUTE_MS) return 'under 1 min';
  const scale = HUMAN_SCALES.find((s) => ms < s.until) as (typeof HUMAN_SCALES)[number];
  const factor = 10 ** scale.decimals;
  const value = Math.round((ms / scale.size) * factor) / factor;
  return `${value} ${value === 1 ? scale.one : scale.many}`;
}

const shortFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Oct 18" within the current year, "Oct 18, 2025" otherwise. */
export function formatDateKey(key: string, now: Date): string {
  const d = parseDateKey(key);
  return d.getFullYear() === now.getFullYear() ? shortFmt.format(d) : longFmt.format(d);
}

export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
