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

export interface DurationUnit {
  ms: number;
  /** Axis caption, e.g. "hours". */
  name: string;
  /** Writes a value already in this unit, e.g. 2.5 → "2.5 h". */
  format: (value: number) => string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const DURATION_UNITS: { upTo: number; unit: DurationUnit }[] = [
  { upTo: 3_600_000, unit: { ms: 60_000, name: 'minutes', format: (v) => `${round1(v)} min` } },
  { upTo: 2 * DAY_MS, unit: { ms: 3_600_000, name: 'hours', format: (v) => `${round1(v)} h` } },
  {
    upTo: Infinity,
    unit: { ms: DAY_MS, name: 'days', format: (v) => `${round1(v)} ${round1(v) === 1 ? 'day' : 'days'}` },
  },
];

/** The unit that reads best for durations up to `maxMs`: minutes under an hour, hours up to two days, then days. */
export function durationUnit(maxMs: number): DurationUnit {
  return (DURATION_UNITS.find((u) => maxMs < u.upTo) as (typeof DURATION_UNITS)[number]).unit;
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
