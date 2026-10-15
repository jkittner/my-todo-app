// iCalendar (RFC 5545) export. VTODO for Thunderbird's task list, VEVENT for its calendar.
import type { Priority, Status, Task } from '../model/task';
import { cleanLabels } from '../model/task';
import { addDays, parseDateKey, toDateKey } from '../logic/dates';

const PRODID = '-//Todo board//Local tasks//EN';
const UID_DOMAIN = 'todo-board.local';

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** UTF-8 length of one code point. */
const octetsOf = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Folds a content line to at most 75 octets per line without splitting UTF-8 characters. */
export function foldLine(line: string): string {
  if (line.length <= 75 && /^[\x00-\x7f]*$/.test(line)) return line;
  const parts: string[] = [];
  let start = 0;
  let octets = 0;
  let limit = 75;
  let i = 0;
  while (i < line.length) {
    const cp = line.codePointAt(i) as number;
    const units = cp > 0xffff ? 2 : 1;
    const size = octetsOf(cp);
    if (octets + size > limit) {
      parts.push(line.slice(start, i));
      start = i;
      octets = 0;
      limit = 74; // continuation lines start with a space
    }
    octets += size;
    i += units;
  }
  parts.push(line.slice(start));
  return parts.join('\r\n ');
}

/** 2026-10-15T09:30:00.000Z -> 20261015T093000Z */
export function formatUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

const formatDate = (key: string) => key.replace(/-/g, '');

const ICAL_PRIORITY: Record<Exclude<Priority, null>, number> = { high: 1, medium: 5, low: 9 };
const ICAL_STATUS: Record<Status, string> = { todo: 'NEEDS-ACTION', doing: 'IN-PROCESS', done: 'COMPLETED' };
const PERCENT: Record<Status, number> = { todo: 0, doing: 50, done: 100 };

function commonLines(task: Task): string[] {
  const lines = [
    `CREATED:${formatUtc(task.createdAt)}`,
    `LAST-MODIFIED:${formatUtc(task.updatedAt)}`,
    `SUMMARY:${escapeText(task.title)}`,
  ];
  if (task.description.trim()) lines.push(`DESCRIPTION:${escapeText(task.description)}`);
  const cats = cleanLabels([...task.categories, ...task.tags]);
  if (cats.length) lines.push(`CATEGORIES:${cats.map(escapeText).join(',')}`);
  if (task.priority) lines.push(`PRIORITY:${ICAL_PRIORITY[task.priority]}`);
  return lines;
}

function todoLines(task: Task, stamp: string): string[] {
  const lines = [
    'BEGIN:VTODO',
    `UID:${task.id}@${UID_DOMAIN}`,
    `DTSTAMP:${stamp}`,
    ...commonLines(task),
    `DUE;VALUE=DATE:${formatDate(task.dueDate)}`,
    `STATUS:${ICAL_STATUS[task.status]}`,
    `PERCENT-COMPLETE:${PERCENT[task.status]}`,
  ];
  if (task.completedAt) lines.push(`COMPLETED:${formatUtc(task.completedAt)}`);
  lines.push('END:VTODO');
  return lines;
}

function eventLines(task: Task, stamp: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${task.id}-due@${UID_DOMAIN}`,
    `DTSTAMP:${stamp}`,
    ...commonLines(task),
    `DTSTART;VALUE=DATE:${formatDate(task.dueDate)}`,
    `DTEND;VALUE=DATE:${formatDate(toDateKey(addDays(parseDateKey(task.dueDate), 1)))}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

function calendar(name: string, body: string[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(name)}`,
    ...body,
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Tasks as VTODO entries, which Thunderbird imports into its task list. */
export function exportTasksIcs(tasks: Task[], now: Date): string {
  const stamp = formatUtc(now.toISOString());
  return calendar(
    'Todo board tasks',
    tasks.flatMap((t) => todoLines(t, stamp)),
  );
}

/** Each task as an all-day event on its due date, for any calendar app. */
export function exportCalendarIcs(tasks: Task[], now: Date): string {
  const stamp = formatUtc(now.toISOString());
  return calendar(
    'Todo board due dates',
    tasks.flatMap((t) => eventLines(t, stamp)),
  );
}
