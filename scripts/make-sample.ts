// Writes a backup file with generated tasks to explore large boards by hand.
// Usage: npm run sample [-- <count>]   then Data → Restore from backup in the app.
import { writeFile } from 'node:fs/promises';
import { generateTasks, TAGS, CATEGORIES } from '../e2e/generate.ts';

const count = Number(process.argv[2] ?? 1500);
const now = new Date();
// Roughly a third of the tasks in each column.
const tasks = generateTasks(count, now, 2026, { todo: 1 / 3, doing: 1 / 3 });
const backup = {
  app: 'todo-board',
  version: 1,
  exportedAt: now.toISOString(),
  tasks,
  tags: TAGS,
  categories: CATEGORIES,
};
const file = `examples/sample-${count}-tasks.json`;
await writeFile(file, JSON.stringify(backup, null, 2) + '\n');

const by = (s: string) => tasks.filter((t) => t.status === s).length;
console.log(`Wrote ${file}: ${by('todo')} to do, ${by('doing')} in progress, ${by('done')} done.`);
