import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** In the built page, the fallback note speaks to visitors instead of developers. */
const buildFallbackNote: Plugin = {
  name: 'build-fallback-note',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      /<!-- build:replace-start -->[\s\S]*<!-- build:replace-end -->/,
      '<p>Todo board needs JavaScript to run. Turn on JavaScript for this page, then reload it.</p>',
    ),
};

/** Vite never inlines `<link rel="icon">`, so embed the favicon itself to keep the build a single file. */
const inlineFavicon: Plugin = {
  name: 'inline-favicon',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) =>
      html.replace(/href="\/(src\/assets\/favicon\.png)"/, (_, path: string) => {
        const data = readFileSync(fileURLToPath(new URL(path, import.meta.url))).toString('base64');
        return `href="data:image/png;base64,${data}"`;
      }),
  },
};

export default defineConfig({
  base: './',
  plugins: [preact(), buildFallbackNote, inlineFavicon, viteSingleFile()],
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'vmThreads',
    setupFiles: ['./tests/setup.ts'],
    // Generous so a busy machine (e.g. a coverage run next to other work) cannot time tests out.
    testTimeout: 15_000,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts'],
      reporter: ['text', 'html'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
