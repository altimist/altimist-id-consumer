import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { enforce } from './enforce.js';
import { issueSession } from './session.js';
import { __resetM2mFailures } from './m2m-auth.js';
import { setup, inMemoryStore, type InMemoryStore } from './test-helpers.js';
import type { ResolvedConfig } from './config.js';

const isNext = (res: NextResponse) => res.headers.get('x-middleware-next') === '1';

let store: InMemoryStore;
let cfg: ResolvedConfig;

beforeEach(() => {
  __resetM2mFailures();
  ({ store, cfg } = setup());
});

function anon(method: string, path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method });
}
async function authed(method: string, path: string, role: 'staff' | 'visitor'): Promise<NextRequest> {
  const { cookie } = await issueSession(cfg, 'u', role);
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { cookie: `${cookie.name}=${cookie.value}` },
  });
}

async function sha256(key: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + key);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('enforce — public + M2M', () => {
  it('passes public paths through without a session lookup', async () => {
    const spy = vi.spyOn(store, 'findSessionByToken');
    const res = await enforce(anon('GET', '/api/health'), cfg);
    expect(isNext(res)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('delegates M2M routes to the X-API-Key gate; passes with a valid key', async () => {
    const apiKeyHash = await sha256('secret', 'salt');
    ({ store, cfg } = setup({ m2m: { apiKeyHash, apiKeyHashSalt: 'salt' } }));
    const req = new NextRequest('http://localhost/api/positions/open', {
      method: 'GET',
      headers: { 'x-api-key': 'secret' },
    });
    const res = await enforce(req, cfg);
    expect(isNext(res)).toBe(true);
  });

  it('returns the X-API-Key gate response when it rejects', async () => {
    const apiKeyHash = await sha256('secret', 'salt');
    ({ store, cfg } = setup({ m2m: { apiKeyHash, apiKeyHashSalt: 'salt' } }));
    const res = await enforce(anon('POST', '/api/compute-mfe-mae'), cfg); // no key header
    expect(res.status).toBe(401);
  });

  it('M2M path with no m2m config fails closed (503)', async () => {
    const res = await enforce(anon('GET', '/api/positions/open'), cfg);
    expect(res.status).toBe(503);
  });
});

describe('enforce — anonymous', () => {
  it('redirects an anonymous page request to /login', async () => {
    const res = await enforce(anon('GET', '/'), cfg);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/login$/);
  });
  it('preserves the originally-requested page as ?next', async () => {
    const res = await enforce(anon('GET', '/live'), cfg);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/live');
  });
  it('returns 401 JSON for an anonymous API request', async () => {
    const res = await enforce(anon('GET', '/api/backtests'), cfg);
    expect(res.status).toBe(401);
  });
});

describe('enforce — visitor authorization', () => {
  it('passes a visitor GET on the allowlist', async () => {
    const res = await enforce(await authed('GET', '/api/backtests', 'visitor'), cfg);
    expect(isNext(res)).toBe(true);
  });
  it('403s a non-allowlisted visitor GET, and audits it', async () => {
    const res = await enforce(await authed('GET', '/api/database', 'visitor'), cfg);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'read_only_role' });
    expect(store.audits).toContainEqual(
      expect.objectContaining({ event: 'authz.denied', outcome: 'fail' }),
    );
  });
  it('403s a visitor non-GET', async () => {
    const res = await enforce(await authed('POST', '/api/rithmic/test-order', 'visitor'), cfg);
    expect(res.status).toBe(403);
  });
  it('redirects a visitor away from a staff-only page', async () => {
    const res = await enforce(await authed('GET', '/chat', 'visitor'), cfg);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/$/);
  });
});

describe('enforce — staff', () => {
  it('passes staff on any route, GET or not', async () => {
    expect(isNext(await enforce(await authed('POST', '/api/rithmic/control', 'staff'), cfg))).toBe(true);
    expect(isNext(await enforce(await authed('GET', '/api/database', 'staff'), cfg))).toBe(true);
  });
});

describe('enforce — session paths + fail-closed', () => {
  it('lets an authenticated visitor reach logout and me', async () => {
    expect(isNext(await enforce(await authed('POST', '/api/auth/logout', 'visitor'), cfg))).toBe(true);
    expect(isNext(await enforce(await authed('GET', '/api/auth/me', 'visitor'), cfg))).toBe(true);
  });
  it('401s anonymous logout', async () => {
    expect((await enforce(anon('POST', '/api/auth/logout'), cfg)).status).toBe(401);
  });
  it('fails closed: an API request is 401 when session validation throws', async () => {
    const base = inMemoryStore();
    ({ cfg } = setup({ store: base }));
    const { cookie } = await issueSession(cfg, 'u', 'visitor');
    base.findSessionByToken = async () => {
      throw new Error('db down');
    };
    const req = new NextRequest('http://localhost/api/backtests', {
      method: 'GET',
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });
    expect((await enforce(req, cfg)).status).toBe(401);
  });
  it('fails closed: a page request redirects to /login (preserving next) when validation throws', async () => {
    const base = inMemoryStore();
    ({ cfg } = setup({ store: base }));
    const { cookie } = await issueSession(cfg, 'u', 'visitor');
    base.findSessionByToken = async () => {
      throw new Error('db down');
    };
    const req = new NextRequest('http://localhost/analyse', {
      method: 'GET',
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });
    const res = await enforce(req, cfg);
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/analyse');
  });
});
