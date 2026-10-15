// Real-browser performance with 300, 1,000 and 5,000 generated tasks. Budgets are
// generous multiples of measured times; each run logs its numbers for comparison.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { NOW } from './fixtures';
import { generateDb } from './generate';
import { column, STORAGE_KEY, stored } from './helpers';

/** CI sets PERF_BUDGET_FACTOR to loosen budgets on slower shared runners. */
const FACTOR = Number(process.env.PERF_BUDGET_FACTOR ?? 1);

const BUDGET_MS: Record<
  number,
  {
    load: number;
    keystroke: number;
    drag: number;
    modal: number;
    insights: number;
    calendar: number;
    exportIcs: number;
  }
> = {
  300: { load: 1500, keystroke: 150, drag: 800, modal: 800, insights: 1000, calendar: 800, exportIcs: 1500 },
  1000: { load: 1500, keystroke: 150, drag: 800, modal: 800, insights: 1000, calendar: 800, exportIcs: 2000 },
  5000: { load: 2500, keystroke: 250, drag: 1200, modal: 1000, insights: 1500, calendar: 1000, exportIcs: 4000 },
};

async function seed(page: Page, db: unknown) {
  await page.clock.setFixedTime(NOW);
  await page.goto('#/board');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(db)] as const);
  await page.reload();
}

async function time(fn: () => Promise<unknown>) {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}

for (const n of [300, 1000, 5000]) {
  test.describe(`with ${n} tasks`, () => {
    const budget = Object.fromEntries(
      Object.entries(BUDGET_MS[n]).map(([k, v]) => [k, v * FACTOR]),
    ) as (typeof BUDGET_MS)[number];
    const db = generateDb(n, NOW);

    test('stays responsive on the board, insights and calendar', async ({ page }, info) => {
      await seed(page, db);
      const load = await time(async () => {
        await page.reload();
        await page.locator('.card').first().waitFor();
      });
      expect(load).toBeLessThan(budget.load);
      expect(await page.locator('.card').count()).toBeLessThanOrEqual(300);

      // Each keystroke is measured from input to the next painted frame.
      await page.getByRole('searchbox').focus();
      const keystrokes = await page.evaluate(async () => {
        const input = document.getElementById('search') as HTMLInputElement;
        const times: number[] = [];
        for (const ch of 'invoice') {
          const start = performance.now();
          input.value += ch;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
          times.push(Math.round(performance.now() - start));
        }
        return times;
      });
      expect(Math.max(...keystrokes)).toBeLessThan(budget.keystroke);
      await expect(page.getByText(/^Showing \d+ of [\d,]+ tasks/)).toBeVisible();
      await page.getByRole('button', { name: 'Clear search and filters' }).click();

      const first = column(page, 'To do').locator('.card').first();
      const title = (await first.locator('.card-title').textContent()) as string;
      const doingCount = column(page, 'In progress').locator('.column-count');
      const before = Number((await doingCount.textContent())?.replace(/,/g, ''));
      // Drop on the column head: the column is long, and aiming at its centre would make
      // Playwright scroll mid-drag. The moved card may sort beyond the first page, so watch the count.
      const drag = await time(async () => {
        await first.dragTo(column(page, 'In progress').locator('.column-head'));
        await expect(doingCount).toHaveText((before + 1).toLocaleString('en'));
      });
      expect(drag).toBeLessThan(budget.drag);
      await expect
        .poll(async () => (await stored(page)).tasks.find((t: { title: string }) => t.title === title).status)
        .toBe('doing');

      const modal = await time(async () => {
        await column(page, 'To do').locator('.card-button').first().click();
        await page.getByRole('dialog', { name: 'Edit task' }).waitFor();
      });
      expect(modal).toBeLessThan(budget.modal);
      await page.keyboard.press('Escape');

      const insights = await time(async () => {
        await page.getByRole('link', { name: 'Insights' }).click();
        await page.getByRole('heading', { name: 'Due in October 2026' }).waitFor();
      });
      expect(insights).toBeLessThan(budget.insights);

      const calendar = await time(async () => {
        await page.getByRole('link', { name: 'Calendar' }).click();
        await page.getByRole('grid', { name: 'October 2026' }).waitFor();
      });
      expect(calendar).toBeLessThan(budget.calendar);

      const numbers = { load, keystrokes: Math.max(...keystrokes), drag, modal, insights, calendar };
      info.annotations.push({ type: 'perf', description: JSON.stringify(numbers) });
      console.log(`[perf] ${info.project.name} ${n} tasks: ${JSON.stringify(numbers)}`);
    });

    test('exports and restores every task', async ({ page }) => {
      await seed(page, db);
      await page.goto('#/calendar');
      let file = '';
      const exportMs = await time(async () => {
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('button', { name: 'Export tasks for Thunderbird (.ics)' }).click(),
        ]);
        file = (await download.path()) as string;
      });
      expect(exportMs).toBeLessThan(budget.exportIcs);
      expect((await readFile(file, 'utf8')).match(/BEGIN:VTODO/g)).toHaveLength(n);

      await page.getByRole('button', { name: 'Data' }).click();
      const [backup] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Back up tasks (.json)' }).click(),
      ]);
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
      await page.reload();
      await page.getByTestId('restore-input').setInputFiles((await backup.path()) as string);
      await page.getByRole('button', { name: 'Replace tasks' }).click();
      await expect(page.getByRole('status')).toContainText(`Restored ${n} tasks from backup`);
      await expect(page.getByRole('status')).not.toContainText('could not be saved');
      await expect.poll(async () => (await stored(page)).tasks.length).toBe(n);
    });
  });
}
