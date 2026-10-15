// Sample board used by the end-to-end tests and screenshots. Dates are relative to NOW.
export const NOW = new Date('2026-10-15T10:00:00');

const day = (offset: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  return d;
};
const key = (offset: number) => {
  const d = day(offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const iso = (offset: number, hour = 9) => {
  const d = day(offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

type Status = 'todo' | 'doing' | 'done';
interface Spec {
  id: string;
  title: string;
  status: Status;
  priority: 'high' | 'medium' | 'low' | null;
  due: number;
  created: number;
  started?: number;
  completed?: number;
  tags?: string[];
  categories?: string[];
  description?: string;
  originalDue?: number;
}

function task(s: Spec) {
  const createdAt = iso(s.created);
  const startedAt = s.started !== undefined ? iso(s.started, 11) : null;
  const completedAt = s.completed !== undefined ? iso(s.completed, 16) : null;
  const history: { status: Status; at: string }[] = [{ status: 'todo', at: createdAt }];
  if (startedAt) history.push({ status: 'doing', at: startedAt });
  if (completedAt) history.push({ status: 'done', at: completedAt });
  const dueDateHistory =
    s.originalDue !== undefined ? [{ from: key(s.originalDue), to: key(s.due), changedAt: iso(s.created + 1) }] : [];
  return {
    id: s.id,
    title: s.title,
    description: s.description ?? '',
    priority: s.priority,
    tags: s.tags ?? [],
    categories: s.categories ?? [],
    status: s.status,
    createdAt,
    updatedAt: completedAt ?? startedAt ?? createdAt,
    startedAt,
    completedAt,
    dueDate: key(s.due),
    originalDueDate: key(s.originalDue ?? s.due),
    dueDateHistory,
    statusHistory: history,
  };
}

export const SAMPLE_TASKS = [
  task({
    id: 't-invoice',
    title: 'Send October invoice to Lindqvist & Partner',
    status: 'todo',
    priority: 'high',
    due: -2,
    created: -9,
    tags: ['finance'],
    categories: ['Freelance'],
    description: '- [x] Log hours\n- [ ] Export PDF\n- [ ] Email **before noon**',
  }),
  task({
    id: 't-tax',
    title: 'Collect receipts for tax return',
    status: 'todo',
    priority: 'medium',
    due: 4,
    created: -6,
    tags: ['finance'],
    categories: ['Home'],
  }),
  task({
    id: 't-bike',
    title: 'Book bike service',
    status: 'todo',
    priority: 'low',
    due: 12,
    created: -3,
    categories: ['Home'],
  }),
  task({
    id: 't-read',
    title: 'Read the RFC 5545 VTODO section',
    status: 'todo',
    priority: null,
    due: 20,
    created: -1,
    tags: ['reading'],
  }),
  task({
    id: 't-api',
    title: 'Draft API pagination proposal',
    status: 'doing',
    priority: 'high',
    due: 2,
    originalDue: -1,
    created: -12,
    started: -5,
    tags: ['writing'],
    categories: ['Work'],
    description:
      '## Options\n\n| Approach | Pros |\n| --- | --- |\n| Cursor | Stable under inserts |\n| Offset | Simple |',
  }),
  task({
    id: 't-review',
    title: 'Review onboarding checklist',
    status: 'doing',
    priority: 'medium',
    due: 1,
    created: -8,
    started: -2,
    categories: ['Work'],
  }),
  task({
    id: 't-slides',
    title: 'Prepare team retro slides',
    status: 'done',
    priority: 'medium',
    due: -3,
    created: -14,
    started: -6,
    completed: -4,
    categories: ['Work'],
  }),
  task({
    id: 't-dentist',
    title: 'Call dentist to reschedule',
    status: 'done',
    priority: 'low',
    due: -10,
    created: -15,
    started: -11,
    completed: -9,
    categories: ['Home'],
  }),
  task({
    id: 't-backup',
    title: 'Set up laptop backups',
    status: 'done',
    priority: 'high',
    due: -20,
    originalDue: -25,
    created: -30,
    started: -24,
    completed: -18,
    tags: ['setup'],
    categories: ['Home'],
  }),
  task({
    id: 't-old',
    title: 'Migrate notes to new laptop',
    status: 'done',
    priority: null,
    due: -45,
    created: -60,
    started: -50,
    completed: -44,
    tags: ['setup'],
  }),
];

export const SAMPLE_DB = {
  schemaVersion: 1,
  tasks: SAMPLE_TASKS,
  tags: ['finance', 'reading', 'writing', 'setup'],
  categories: ['Freelance', 'Home', 'Work'],
  prefs: { sort: [{ key: 'due', dir: 'asc' }], hideDone: false },
};
