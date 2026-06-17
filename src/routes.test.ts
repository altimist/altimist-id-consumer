import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createRoutes } from './routes.js';
import { issueSession } from './session.js';
import { __resetRateLimits } from './rate-limit.js';
import { STATE_COOKIE_NAME } from './handoff.js';
import { setup, type InMemoryStore } from './test-helpers.js';
import type { ResolvedConfig } from './config.js';

let store: InMemoryStore;
let cfg: ResolvedConfig;
let routes: ReturnType<typeof createRoutes>;

beforeEach(() => {
  __resetRateLimits();
  ({ store, cfg } = setup());
  routes = createRoutes(cfg);
});

const post = (path: string, init?: RequestInit) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', ...init });

describe('handoffInit', () => {
  it('returns a handoff URL with app_id/redirect_uri/state and sets a state cookie', async () => {
    const res = await routes.handoffInit.POST(post('/api/auth/altimist/handoff/init'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { handoffUrl: string };
    const url = new URL(body.handoffUrl);
    expect(url.origin + url.pathname).toBe('https://altimist.id/auth/handoff');
    expect(url.searchParams.get('app_id')).toBe('test-app');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost/auth/altimist/callback');
    const state = url.searchParams.get('state')!;
    expect(state.length).toBeGreaterThan(0);
    expect(res.cookies.get(STATE_COOKIE_NAME)?.value).toBe(state);
  });

  it('rate-limits after the window allowance', async () => {
    let last = await routes.handoffInit.POST(post('/api/auth/altimist/handoff/init'));
    for (let i = 0; i < 11; i++) {
      last = await routes.handoffInit.POST(post('/api/auth/altimist/handoff/init'));
    }
    expect(last.status).toBe(429);
    expect(last.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('registerInit', () => {
  it('points at /signup/self-service with a flow=register return_to', async () => {
    const res = await routes.registerInit.POST(post('/api/auth/altimist/register/init'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { registerUrl: string };
    const url = new URL(body.registerUrl);
    expect(url.origin + url.pathname).toBe('https://altimist.id/signup/self-service');
    expect(url.searchParams.get('return_to')).toBe('http://localhost/auth/altimist/callback?flow=register');
  });
});

describe('verify — input validation', () => {
  it('400s a non-JSON body', async () => {
    const res = await routes.verify.POST(post('/api/auth/altimist/verify', { body: 'not json' }));
    expect(res.status).toBe(400);
  });
  it('400s a body missing bridgeJwt', async () => {
    const res = await routes.verify.POST(
      post('/api/auth/altimist/verify', { body: JSON.stringify({}), headers: { 'content-type': 'application/json' } }),
    );
    expect(res.status).toBe(400);
  });
});

describe('logout', () => {
  it('destroys the session, clears the cookie, and audits', async () => {
    const { session, cookie } = await issueSession(cfg, 'u', 'staff');
    const req = new NextRequest('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });
    const res = await routes.logout.POST(req);
    expect(res.status).toBe(200);
    expect(store.sessions.has(session.token)).toBe(false);
    expect(res.cookies.get(cookie.name)?.value).toBe('');
    expect(store.audits).toContainEqual(expect.objectContaining({ event: 'logout', outcome: 'success' }));
  });
});

describe('me', () => {
  it('401s without a session', async () => {
    const res = await routes.me.GET(new NextRequest('http://localhost/api/auth/me'));
    expect(res.status).toBe(401);
  });
  it('returns handle + role for a valid session', async () => {
    store.users.set('user-x', { id: 'user-x', did: 'did:web:x', handle: 'tester', role: 'visitor', lastLogin: new Date() });
    const { cookie } = await issueSession(cfg, 'user-x', 'visitor');
    const req = new NextRequest('http://localhost/api/auth/me', {
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });
    const res = await routes.me.GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ handle: 'tester', role: 'visitor' });
  });
});

describe('callback — CSRF state', () => {
  it('redirects to /login?error=handoff when state is missing/mismatched', async () => {
    const res = await routes.callback.GET(
      new NextRequest('http://localhost/auth/altimist/callback?bridge_jwt=x&state=a'),
    );
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('error')).toBe('handoff');
  });
});
