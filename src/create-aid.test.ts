import { describe, it, expect } from 'vitest';
import { createAid } from './create-aid.js';
import { configFromEnv } from './config.js';
import { inMemoryStore, TEST_SESSION_PASSWORD, type InMemoryStore } from './test-helpers.js';

function make(store: InMemoryStore) {
  return createAid({
    store,
    sessionPassword: TEST_SESSION_PASSWORD,
    appId: 'test-app',
    policy: { staffOnlyPages: ['/admin'], visitorGetAllowlist: ['/api/public'] },
  });
}

describe('createAid — wiring', () => {
  it('exposes a Node-runtime middleware config with a matcher', () => {
    const aid = make(inMemoryStore());
    expect(aid.middlewareConfig.runtime).toBe('nodejs');
    expect(Array.isArray(aid.middlewareConfig.matcher)).toBe(true);
    expect(aid.middlewareConfig.matcher.length).toBeGreaterThan(0);
  });

  it('exposes all six route-handler factories with the right methods', () => {
    const aid = make(inMemoryStore());
    expect(typeof aid.routes.handoffInit.POST).toBe('function');
    expect(typeof aid.routes.registerInit.POST).toBe('function');
    expect(typeof aid.routes.verify.POST).toBe('function');
    expect(typeof aid.routes.logout.POST).toBe('function');
    expect(typeof aid.routes.me.GET).toBe('function');
    expect(typeof aid.routes.callback.GET).toBe('function');
  });

  it('accepts the configFromEnv() spread pattern (sessionPassword/appId from env)', () => {
    const prev = { sp: process.env.SESSION_PASSWORD, app: process.env.ALTIMIST_APP_ID };
    process.env.SESSION_PASSWORD = 'x'.repeat(40);
    process.env.ALTIMIST_APP_ID = 'env-app';
    try {
      // This is the canonical greenfield pattern; it must both typecheck (spread
      // of Partial<AidConfig>) and construct at runtime.
      const aid = createAid({ ...configFromEnv(), store: inMemoryStore() });
      expect(aid.middlewareConfig.runtime).toBe('nodejs');
    } finally {
      process.env.SESSION_PASSWORD = prev.sp;
      process.env.ALTIMIST_APP_ID = prev.app;
    }
  });

  it('evaluate applies the resolved (merged) policy', () => {
    const aid = make(inMemoryStore());
    expect(aid.evaluate('GET', '/login', { authenticated: false })).toEqual({ action: 'public' });
    expect(aid.evaluate('GET', '/api/public', { authenticated: true, role: 'visitor' })).toEqual({ action: 'allow' });
    expect(aid.evaluate('GET', '/admin', { authenticated: true, role: 'visitor' })).toEqual({ action: 'redirect', to: '/' });
  });
});

describe('createAid — revokeSessions', () => {
  it('--all deletes every session', async () => {
    const store = inMemoryStore();
    const exp = new Date(Date.now() + 60_000);
    await store.createSession({ token: 'a', userId: 'u', role: 'staff', expiresAt: exp });
    await store.createSession({ token: 'b', userId: 'u', role: 'staff', expiresAt: exp });
    const aid = make(store);
    expect(await aid.revokeSessions('--all')).toBe(2);
    expect(store.sessions.size).toBe(0);
  });

  it('by handle deletes only that user’s sessions', async () => {
    const store = inMemoryStore();
    store.users.set('u-alice', { id: 'u-alice', did: 'did:web:a', handle: 'alice', role: 'visitor', lastLogin: new Date() });
    store.users.set('u-bob', { id: 'u-bob', did: 'did:web:b', handle: 'bob', role: 'visitor', lastLogin: new Date() });
    const exp = new Date(Date.now() + 60_000);
    await store.createSession({ token: 'a1', userId: 'u-alice', role: 'visitor', expiresAt: exp });
    await store.createSession({ token: 'b1', userId: 'u-bob', role: 'visitor', expiresAt: exp });
    const aid = make(store);
    expect(await aid.revokeSessions('alice')).toBe(1);
    expect(store.sessions.has('a1')).toBe(false);
    expect(store.sessions.has('b1')).toBe(true);
  });

  it('throws on an empty argument', async () => {
    const aid = make(inMemoryStore());
    await expect(aid.revokeSessions('')).rejects.toThrow();
  });
});
