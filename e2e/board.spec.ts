import { expect, test } from '@playwright/test';
import { cardTitles, column, openApp, stored } from './helpers';
import { NOW, SAMPLE_DB } from './fixtures';

test.describe('board', () => {
  test('shows statistics and collapsed cards', async ({ page }) => {
    await openApp(page);
    const totals = page.getByRole('list', { name: 'Board totals' });
    await expect(totals).toContainText('4 to do');
    await expect(totals).toContainText('2 in progress');
    await expect(totals).toContainText('4 done');
    await expect(totals).toContainText('1 overdue');
    await expect(totals).toContainText('3 due this week');
    await expect(totals).toContainText('median to complete');
    const card = column(page, 'To do').locator('.card').first();
    await expect(card).toContainText('Send October invoice');
    await expect(card).toContainText('High');
    await expect(card).toContainText('Overdue');
    await expect(card).not.toContainText('Export PDF');
  });

  test('adds a task with validation and keeps it after reload', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Add task' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add task' });
    await dialog.getByRole('button', { name: 'Add task' }).click();
    await expect(dialog.getByText('Enter a title.')).toBeVisible();
    await expect(dialog.getByText('Pick a due date.')).toBeVisible();
    await dialog.getByLabel('Title').fill('Renew passport');
    await dialog.getByLabel('Due date').fill('2026-10-30');
    await dialog.getByRole('radio', { name: 'Medium' }).check({ force: true });
    await dialog.getByLabel('Tags').fill('admin');
    await dialog.getByLabel('Tags').press('Enter');
    await dialog.getByLabel('Categories').fill('Home');
    await dialog.getByLabel('Categories').press('Enter');
    await dialog.getByRole('textbox', { name: 'Description' }).fill('- [ ] Photos\n- [ ] **Form**');
    await dialog.getByRole('tab', { name: 'Preview' }).click();
    await expect(dialog.locator('.markdown input[type=checkbox]')).toHaveCount(2);
    await expect(dialog.locator('.markdown strong')).toHaveText('Form');
    await dialog.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByRole('status')).toContainText('Task added');
    await page.reload();
    await expect(column(page, 'To do').getByText('Renew passport')).toBeVisible();
    const task = (await stored(page)).tasks.find((t: { title: string }) => t.title === 'Renew passport');
    expect(task).toMatchObject({
      priority: 'medium',
      tags: ['admin'],
      categories: ['Home'],
      dueDate: '2026-10-30',
      status: 'todo',
    });
  });

  test('drags tasks across columns and records the dates', async ({ page }) => {
    await openApp(page);
    await column(page, 'To do').getByText('Book bike service').dragTo(column(page, 'In progress'));
    await expect(column(page, 'In progress').getByText('Book bike service')).toBeVisible();
    await column(page, 'In progress').getByText('Book bike service').dragTo(column(page, 'Done'));
    await expect(column(page, 'Done').getByText('Book bike service')).toBeVisible();
    // Saving runs right after the screen updates, so poll the stored copy.
    const bike = async () => (await stored(page)).tasks.find((t: { id: string }) => t.id === 't-bike');
    await expect
      .poll(bike)
      .toMatchObject({ status: 'done', startedAt: NOW.toISOString(), completedAt: NOW.toISOString() });
    await column(page, 'Done').getByText('Book bike service').dragTo(column(page, 'To do'));
    await expect.poll(bike).toMatchObject({ status: 'todo', startedAt: null, completedAt: null });
  });

  test('moves a focused card with the keyboard', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: /^Book bike service/ }).focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(column(page, 'In progress').getByText('Book bike service')).toBeVisible();
  });

  test('sorts by due date, priority and title', async ({ page }) => {
    await openApp(page);
    expect(await cardTitles(page, 'To do')).toEqual([
      'Send October invoice to Lindqvist & Partner',
      'Collect receipts for tax return',
      'Book bike service',
      'Read the RFC 5545 VTODO section',
    ]);
    await page.getByRole('button', { name: 'Soonest first' }).click();
    expect((await cardTitles(page, 'To do'))[0]).toBe('Read the RFC 5545 VTODO section');
    await page.getByLabel('Sort by', { exact: true }).selectOption('priority');
    await page.getByRole('button', { name: 'Lowest first' }).click();
    expect(await cardTitles(page, 'In progress')).toEqual([
      'Draft API pagination proposal',
      'Review onboarding checklist',
    ]);
    await page.getByLabel('Sort by', { exact: true }).selectOption('title');
    expect(await cardTitles(page, 'To do')).toEqual([
      'Book bike service',
      'Collect receipts for tax return',
      'Read the RFC 5545 VTODO section',
      'Send October invoice to Lindqvist & Partner',
    ]);
    await page.reload();
    await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('title');
  });

  test('sorts by priority and then by due date, and remembers it', async ({ page }) => {
    // Two pairs share a priority, so the second level decides their order.
    const priorities: Record<string, string> = {
      't-invoice': 'high',
      't-tax': 'high',
      't-bike': 'low',
      't-read': 'low',
    };
    await openApp(page, '#/board', {
      ...SAMPLE_DB,
      tasks: SAMPLE_DB.tasks.map((t) => ({ ...t, priority: priorities[t.id] ?? t.priority })),
    });
    await page.getByLabel('Sort by', { exact: true }).selectOption('priority');
    await page.getByRole('button', { name: 'Add sort' }).click();
    await expect(page.getByLabel('then by (level 2)')).toHaveValue('due');
    await page.getByRole('button', { name: 'Soonest first' }).click();
    // High first, low second; within each priority the latest due date comes first.
    expect(await cardTitles(page, 'To do')).toEqual([
      'Collect receipts for tax return',
      'Send October invoice to Lindqvist & Partner',
      'Read the RFC 5545 VTODO section',
      'Book bike service',
    ]);
    await page.reload();
    await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('priority');
    await expect(page.getByLabel('then by (level 2)')).toHaveValue('due');
    await expect(page.getByRole('button', { name: 'Latest first' })).toBeVisible();
    expect((await stored(page)).prefs.sort).toEqual([
      { key: 'priority', dir: 'asc' },
      { key: 'due', dir: 'desc' },
    ]);
  });

  test('searches titles and descriptions', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('/');
    await page.keyboard.type('cursor');
    expect(await cardTitles(page, 'In progress')).toEqual(['Draft API pagination proposal']);
    expect(await cardTitles(page, 'To do')).toEqual([]);
    await expect(page.getByText('Showing 1 of 10 tasks')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search and filters' }).click();
    expect(await cardTitles(page, 'To do')).toHaveLength(4);
  });

  test('filters by tag, category, due and created dates', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Filters' }).click();
    const panel = page.getByRole('group', { name: 'Filters' });
    await panel.getByRole('button', { name: 'finance' }).click();
    expect(await cardTitles(page, 'To do')).toEqual([
      'Send October invoice to Lindqvist & Partner',
      'Collect receipts for tax return',
    ]);
    await panel.getByRole('button', { name: 'finance' }).click();
    await panel.getByRole('button', { name: 'Home' }).click();
    expect(await cardTitles(page, 'To do')).toEqual(['Collect receipts for tax return', 'Book bike service']);
    await panel.getByRole('button', { name: 'Home' }).click();
    await page.getByLabel('Due between: from').fill('2026-10-16');
    await page.getByLabel('Due between: to').fill('2026-10-31');
    expect(await cardTitles(page, 'To do')).toEqual(['Collect receipts for tax return', 'Book bike service']);
    await page.getByRole('button', { name: 'Clear search and filters' }).click();
    await page.getByLabel('Created between: from').fill('2026-10-12');
    expect(await cardTitles(page, 'To do')).toEqual(['Book bike service', 'Read the RFC 5545 VTODO section']);
  });

  test('filters overdue tasks from the totals', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '1 overdue' }).click();
    expect(await cardTitles(page, 'To do')).toEqual(['Send October invoice to Lindqvist & Partner']);
    expect(await cardTitles(page, 'In progress')).toEqual([]);
  });

  test('limits done tasks to 30 days, loads the rest, and hides them', async ({ page }) => {
    await openApp(page);
    expect(await cardTitles(page, 'Done')).toHaveLength(3);
    await page.getByRole('button', { name: 'Load all done tasks (1 older)' }).click();
    expect(await cardTitles(page, 'Done')).toContain('Migrate notes to new laptop');
    await page.getByLabel('Hide done tasks').check();
    await expect(column(page, 'Done')).toHaveCount(0);
    // Saving runs right after the screen updates; reloading before that would drop the change.
    await expect.poll(async () => (await stored(page)).prefs.hideDone).toBe(true);
    await page.reload();
    await expect(page.getByLabel('Hide done tasks')).toBeChecked();
    await expect(column(page, 'Done')).toHaveCount(0);
  });

  test('edits a task in the modal and tracks the due date change', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: /^Collect receipts/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit task' });
    await expect(dialog.getByLabel('Title')).toHaveValue('Collect receipts for tax return');
    await dialog.getByLabel('Due date').fill('2026-10-22');
    await dialog.getByLabel('Status').selectOption('doing');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toContainText('Changes saved');
    await expect(column(page, 'In progress').getByText('Collect receipts')).toBeVisible();
    await page.getByRole('button', { name: /^Collect receipts/ }).click();
    await expect(page.getByRole('dialog').getByText('Changed once')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/Oct 19 to Oct 22/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('deletes a task after confirmation', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: /^Book bike service/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete task' }).click();
    await expect(page.getByRole('status')).toContainText('Task deleted');
    await expect(page.getByText('Book bike service')).toHaveCount(0);
  });
});
