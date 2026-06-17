import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueSession,
  getSession,
  destroySession,
  clearedCookie,
  SESSION_COOKIE,
  type SessionDeps,
} from './session.js';
import { inMemoryStore, TEST_SESSION_PASSWORD, type InMemoryStore } from './test-helpers.js';

const DAY = 24 * 60 * 60;

let store: InMemoryStore;
let deps: SessionDeps;

beforeEach(() => {
  store = inMemoryStore();
  deps = {
    store,
    sessionPassword: TEST_SESSION_PASSWORD,
    staffTtlSeconds: 7 * DAY,
    visitorTtlSeconds: DAY,
  };
});

describe('issueSession', () => {
  it('persists a session row with the role and a 256-bit token', async () => {
    const { session } = await issueSession(deps, 'user-1', 'staff');
    expect(store.sessions.size).toBe(1);
    const row = store.sessions.get(session.token)!;
    expect(row.userId).toBe('user-1');
    expect(row.role).toBe('staff');
    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('staff sessions expire in 7 days, visitor sessions in 24 hours', async () => {
    const staff = await issueSession(deps, 'u', 'staff');
    const visitor = await issueSession(deps, 'u', 'visitor');
    const sevenDays = 7 * DAY * 1000;
    const oneDay = DAY * 1000;
    expect(staff.session.expiresAt.getTime() - Date.now()).toBeGreaterThan(sevenDays - 5000);
    expect(staff.session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(sevenDays + 1000);
    expect(visitor.session.expiresAt.getTime() - Date.now()).toBeGreaterThan(oneDay - 5000);
    expect(visitor.session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(oneDay + 1000);
  });

  it('returns a sealed cookie that is httpOnly, Secure, SameSite=Lax', async () => {
    const { cookie } = await issueSession(deps, 'u', 'visitor');
    expect(cookie.name).toBe(SESSION_COOKIE);
    expect(cookie.value.length).toBeGreaterThan(0);
    expect(cookie.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: DAY,
    });
  });

  it('throws if sessionPassword is too short (fail-closed config)', async () => {
    const bad: SessionDeps = { ...deps, sessionPassword: 'short' };
    await expect(issueSession(bad, 'u', 'staff')).rejects.toThrow();
  });
});

describe('getSession (store-backed validation every request)', () => {
  it('round-trips: a freshly issued cookie resolves to its session', async () => {
    const { cookie } = await issueSession(deps, 'user-9', 'staff');
    const resolved = await getSession(deps, cookie.value);
    expect(resolved).toMatchObject({ userId: 'user-9', role: 'staff' });
  });

  it('returns null for a missing cookie', async () => {
    expect(await getSession(deps, undefined)).toBeNull();
  });

  it('returns null (anonymous) when the cookie cannot be unsealed', async () => {
    expect(await getSession(deps, 'not-a-valid-sealed-cookie')).toBeNull();
  });

  it('returns null when the row is gone (revoked) — revocation immediate', async () => {
    const { session, cookie } = await issueSession(deps, 'u', 'staff');
    store.sessions.delete(session.token);
    expect(await getSession(deps, cookie.value)).toBeNull();
  });

  it('returns null and deletes the row when the session has expired', async () => {
    const { session, cookie } = await issueSession(deps, 'u', 'visitor');
    store.sessions.get(session.token)!.expiresAt = new Date(Date.now() - 1000);
    expect(await getSession(deps, cookie.value)).toBeNull();
    expect(store.sessions.has(session.token)).toBe(false);
  });
});

describe('destroySession (logout)', () => {
  it('deletes the session row keyed by the cookie token', async () => {
    const { session, cookie } = await issueSession(deps, 'u', 'staff');
    await destroySession(deps, cookie.value);
    expect(store.sessions.has(session.token)).toBe(false);
  });

  it('is a no-op for an unparseable cookie (no throw)', async () => {
    await expect(destroySession(deps, 'garbage')).resolves.toBeUndefined();
  });
});

describe('clearedCookie', () => {
  it('expires the cookie immediately (maxAge 0)', () => {
    expect(clearedCookie().options.maxAge).toBe(0);
  });
});
