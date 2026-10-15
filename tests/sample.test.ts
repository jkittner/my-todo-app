import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBackup, type Library } from '../src/io/backup';
import { statusCounts } from '../src/logic/stats';

describe('examples/sample-1500-tasks.json', () => {
  it('is a valid backup with tasks spread over all three columns', () => {
    const lib = parseBackup(readFileSync('examples/sample-1500-tasks.json', 'utf8')) as Library;
    expect(typeof lib).toBe('object');
    expect(lib.tasks).toHaveLength(1500);
    const counts = statusCounts(lib.tasks);
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(400);
    expect(lib.tags.length).toBeGreaterThan(0);
    expect(lib.categories.length).toBeGreaterThan(0);
  });
});
