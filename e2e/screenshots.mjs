// Captures every view in light and dark mode at desktop and phone width for visual review.
// Usage: npm run screenshots [-- <outDir>]   (default: test-results/screenshots)
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const out = process.argv[2] ?? 'test-results/screenshots';
await mkdir(out, { recursive: true });
const { SAMPLE_DB, NOW } = await import('./fixtures.ts');
const url = pathToFileURL(path.resolve('dist/index.html')).href;
const browser = await chromium.launch();

async function open(scheme, [w, h], db) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    (value) => value && localStorage.setItem('todoboard.v1', value),
    db ? JSON.stringify(db) : '',
  );
  return page;
}

for (const scheme of ['light', 'dark']) {
  for (const [size, label] of [
    [[1440, 900], 'desktop'],
    [[375, 812], 'mobile'],
  ]) {
    const page = await open(scheme, size, SAMPLE_DB);
    for (const route of ['board', 'insights', 'calendar']) {
      await page.goto(`${url}#/${route}`);
      await page.screenshot({ path: `${out}/${route}-${label}-${scheme}.png`, fullPage: true });
    }
    await page.goto(`${url}#/board`);
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('button', { name: 'finance', exact: true }).click();
    await page.screenshot({ path: `${out}/filters-${label}-${scheme}.png` });
    await page.goto(`${url}#/board?task=t-api`);
    await page.screenshot({ path: `${out}/modal-${label}-${scheme}.png` });
    await page.close();

    const empty = await open(scheme, size, null);
    await empty.goto(`${url}#/board`);
    await empty.screenshot({ path: `${out}/empty-${label}-${scheme}.png` });
    await empty.getByRole('button', { name: 'Add task' }).first().click();
    await empty.getByRole('button', { name: 'Add task' }).last().click();
    await empty.screenshot({ path: `${out}/add-${label}-${scheme}.png` });
    await empty.close();
  }
}
await browser.close();
console.log(`Screenshots saved to ${out}`);
