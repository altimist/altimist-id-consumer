/**
 * AC-4 — the core (`.`) imports neither `@prisma/client` nor `react`. Prisma
 * lives only in `./prisma` (`prisma.ts`); UI lives in the design system. Two
 * checks: a static scan of the core source, and a runtime import (the package's
 * dev env has neither installed, so importing the core proves it doesn't need them).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = dirname(fileURLToPath(import.meta.url));

// Files that ARE allowed to reference Prisma / React.
const EXEMPT = new Set(['prisma.ts', 'browser.ts']);

function coreSourceFiles(): string[] {
  return readdirSync(SRC).filter(
    (f) =>
      f.endsWith('.ts') &&
      !f.endsWith('.test.ts') &&
      f !== 'test-helpers.ts' &&
      !EXEMPT.has(f),
  );
}

const FORBIDDEN = /(?:from|require\()\s*['"](@prisma\/client|react)['"]/;

describe('core purity (AC-4)', () => {
  it('no core source file imports @prisma/client or react', () => {
    const offenders: string[] = [];
    for (const f of coreSourceFiles()) {
      const src = readFileSync(join(SRC, f), 'utf8');
      if (FORBIDDEN.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('the core entry imports without Prisma/React present in the environment', async () => {
    await expect(import('./index.js')).resolves.toBeTruthy();
  });

  it('the /prisma and /browser entries import without throwing', async () => {
    await expect(import('./prisma.js')).resolves.toBeTruthy();
    await expect(import('./browser.js')).resolves.toBeTruthy();
  });
});
