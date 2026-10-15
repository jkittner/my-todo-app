// Deterministic generator of realistic boards for performance tests. Same seed, same board.

type Status = 'todo' | 'doing' | 'done';

export const TAGS = [
  'finance',
  'admin',
  'reading',
  'writing',
  'setup',
  'errand',
  'call',
  'email',
  'review',
  'urgent',
  'waiting',
  'idea',
  'health',
  'travel',
  'kids',
  'garden',
  'car',
  'tax',
  'bug',
  'docs',
  'design',
  'meeting',
  'research',
  'shopping',
  'repair',
];
export const CATEGORIES = ['Work', 'Home', 'Freelance', 'Family', 'Health', 'Learning', 'Finance', 'Side project'];
const VERBS = [
  'Write',
  'Review',
  'Book',
  'Call',
  'Fix',
  'Plan',
  'Prepare',
  'Send',
  'Collect',
  'Update',
  'Clean',
  'Order',
  'Draft',
  'Check',
  'Renew',
];
const NOUNS = [
  'invoice',
  'report',
  'dentist appointment',
  'API proposal',
  'garden shed',
  'tax receipts',
  'passport',
  'slides',
  'backup drive',
  'insurance claim',
  'onboarding docs',
  'car service',
  'birthday gift',
  'budget sheet',
  'release notes',
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (d: Date, days: number, hours = 0) => new Date(d.getTime() + days * 86_400_000 + hours * 3_600_000);

/** Share of tasks per column; the rest are done. */
export interface StatusShare {
  todo: number;
  doing: number;
}

export function generateTasks(count: number, now: Date, seed = 42, share: StatusShare = { todo: 0.4, doing: 0.2 }) {
  const r = rng(seed);
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
  const some = <T>(list: T[], max: number) => [
    ...new Set(Array.from({ length: Math.floor(r() * (max + 1)) }, () => pick(list))),
  ];

  return Array.from({ length: count }, (_, i) => {
    const created = shift(now, -Math.floor(r() * 365), Math.floor(r() * 10));
    const roll = r();
    const status: Status = roll < share.todo ? 'todo' : roll < share.todo + share.doing ? 'doing' : 'done';
    const startedAt = status === 'todo' ? null : shift(created, r() * 20);
    const completedAt = status === 'done' && startedAt ? shift(startedAt, r() * 15) : null;
    const clamp = (d: Date | null) => (d && d > now ? now : d);
    const started = clamp(startedAt);
    const completed = clamp(completedAt);
    const originalDue = shift(created, 1 + Math.floor(r() * 45));
    const changes = r() < 0.25 ? 1 + Math.floor(r() * 3) : 0;
    let due = originalDue;
    const dueDateHistory = [];
    for (let c = 0; c < changes; c++) {
      const next = shift(due, 1 + Math.floor(r() * 14));
      dueDateHistory.push({ from: key(due), to: key(next), changedAt: shift(created, c + 1).toISOString() });
      due = next;
    }
    const statusHistory: { status: Status; at: string }[] = [{ status: 'todo', at: created.toISOString() }];
    if (started) statusHistory.push({ status: 'doing', at: started.toISOString() });
    if (completed) statusHistory.push({ status: 'done', at: completed.toISOString() });
    const paragraphs = Math.floor(r() * 4);
    const description = Array.from({ length: paragraphs }, (_, p) =>
      p === 1
        ? '- [x] First step\n- [ ] Second step\n- [ ] **Follow up**'
        : `Notes for ${pick(NOUNS)}: check the ${pick(NOUNS)} and ${pick(VERBS).toLowerCase()} it before the deadline.`,
    ).join('\n\n');
    const priorityRoll = r();
    return {
      id: `gen-${seed}-${i}`,
      title: `${pick(VERBS)} ${pick(NOUNS)} #${i + 1}`,
      description,
      priority: priorityRoll < 0.2 ? 'high' : priorityRoll < 0.5 ? 'medium' : priorityRoll < 0.75 ? 'low' : null,
      tags: some(TAGS, 3),
      categories: some(CATEGORIES, 2),
      status,
      createdAt: created.toISOString(),
      updatedAt: (completed ?? started ?? created).toISOString(),
      startedAt: started?.toISOString() ?? null,
      completedAt: completed?.toISOString() ?? null,
      dueDate: key(due),
      originalDueDate: key(originalDue),
      dueDateHistory,
      statusHistory,
    } as const;
  });
}

export function generateDb(count: number, now: Date, seed = 42) {
  return {
    schemaVersion: 1,
    tasks: generateTasks(count, now, seed),
    tags: TAGS,
    categories: CATEGORIES,
    prefs: { sort: [{ key: 'due', dir: 'asc' }], hideDone: false },
  };
}
