// altimist/altimist-ai#2519 row 60 — safeAudit on its own. The route tests drive it through a
// store that never throws, so nothing showed that a failing audit write leaves the request alone,
// or that a missing metadata argument is stored as {} rather than undefined.
import { describe, it, expect, vi } from 'vitest';
import { safeAudit } from './audit.js';
import { inMemoryStore } from './test-helpers.js';

describe('safeAudit', () => {
  it('writes the event, outcome and metadata as given', async () => {
    const store = inMemoryStore();
    await safeAudit(store, 'authz.denied', 'fail', { path: '/admin' });
    expect(store.audits).toEqual([{ event: 'authz.denied', outcome: 'fail', metadata: { path: '/admin' } }]);
  });

  it('stores {} when no metadata is passed, never undefined', async () => {
    const store = inMemoryStore();
    await safeAudit(store, 'logout', 'success');
    expect(store.audits).toEqual([{ event: 'logout', outcome: 'success', metadata: {} }]);
  });

  it('swallows a store that throws, so the request it describes carries on', async () => {
    const store = inMemoryStore();
    store.writeAudit = vi.fn(() => Promise.reject(new Error('database is down')));
    await expect(safeAudit(store, 'altimist.signin', 'success', { handle: 'a' })).resolves.toBeUndefined();
    expect(store.writeAudit).toHaveBeenCalledTimes(1);
  });

  it('swallows a store that throws synchronously too', async () => {
    const store = inMemoryStore();
    store.writeAudit = vi.fn(() => {
      throw new Error('not connected');
    });
    await expect(safeAudit(store, 'logout', 'success')).resolves.toBeUndefined();
  });

  it('waits for the write to finish before it returns', async () => {
    const store = inMemoryStore();
    let done = false;
    store.writeAudit = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });
    await safeAudit(store, 'logout', 'success');
    expect(done).toBe(true);
  });
});
