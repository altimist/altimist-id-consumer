import { describe, it, expect } from 'vitest';
import { evaluate, type Caller, type ResolvedPolicy } from './policy.js';
import { setup } from './test-helpers.js';

const POLICY: ResolvedPolicy = setup().cfg.policy;

const ANON: Caller = { authenticated: false };
const VISITOR: Caller = { authenticated: true, role: 'visitor' };
const STAFF: Caller = { authenticated: true, role: 'staff' };

const ev = (method: string, path: string, caller: Caller) => evaluate(method, path, caller, POLICY);

describe('policy.evaluate — public paths (rule 1)', () => {
  it('a consumer-supplied public path (/api/health) is public for anyone', () => {
    expect(ev('GET', '/api/health', ANON)).toEqual({ action: 'public' });
  });
  it('/login is public (package-owned)', () => {
    expect(ev('GET', '/login', ANON)).toEqual({ action: 'public' });
  });
  it('the package auth routes are public', () => {
    expect(ev('POST', '/api/auth/altimist/verify', ANON)).toEqual({ action: 'public' });
    expect(ev('POST', '/api/auth/altimist/handoff/init', ANON)).toEqual({ action: 'public' });
    expect(ev('POST', '/api/auth/altimist/register/init', ANON)).toEqual({ action: 'public' });
    expect(ev('GET', '/auth/altimist/callback', ANON)).toEqual({ action: 'public' });
  });
});

describe('policy.evaluate — M2M routes (rule 2)', () => {
  it.each(['/api/positions/open', '/api/positions/unsynced', '/api/compute-mfe-mae'])(
    '%s defers to the X-API-Key branch regardless of method/session',
    (path) => {
      expect(ev('GET', path, ANON)).toEqual({ action: 'm2m' });
      expect(ev('POST', path, ANON)).toEqual({ action: 'm2m' });
    },
  );
});

describe('policy.evaluate — anonymous', () => {
  it('anonymous page request redirects to the login path', () => {
    expect(ev('GET', '/', ANON)).toEqual({ action: 'redirect', to: '/login' });
    expect(ev('GET', '/analyse', ANON)).toEqual({ action: 'redirect', to: '/login' });
  });
  it('anonymous protected API returns 401', () => {
    expect(ev('GET', '/api/backtests', ANON)).toEqual({ action: 'deny', status: 401 });
    expect(ev('POST', '/api/rithmic/test-order', ANON)).toEqual({ action: 'deny', status: 401 });
  });
});

describe('policy.evaluate — non-GET is staff-only (rule 4)', () => {
  it('visitor gets 403 read_only_role on any non-GET', () => {
    expect(ev('POST', '/api/rithmic/test-order', VISITOR)).toEqual({ action: 'deny', status: 403, reason: 'read_only_role' });
    expect(ev('PATCH', '/api/paper/portfolios/abc123', VISITOR)).toEqual({ action: 'deny', status: 403, reason: 'read_only_role' });
    expect(ev('POST', '/api/tags', VISITOR)).toEqual({ action: 'deny', status: 403, reason: 'read_only_role' });
  });
  it('staff can perform any non-GET', () => {
    expect(ev('POST', '/api/rithmic/test-order', STAFF)).toEqual({ action: 'allow' });
    expect(ev('POST', '/api/rithmic/control', STAFF)).toEqual({ action: 'allow' });
  });
});

describe('policy.evaluate — visitor GET allowlist (rule 5)', () => {
  const allowed = [
    '/api/analyse/history',
    '/api/backtests',
    '/api/backtests/run-1/trades',
    '/api/backtests/run-1/orb/trades',
    '/api/imbalance/analysis',
    '/api/market-data/status',
    '/api/volume-profile/NQ/2026-06-01',
    '/api/live/stream',
    '/api/rithmic/pnl-snapshot',
    '/api/live/feed-comparison',
    '/api/live/ping',
    '/api/ami/recent',
    '/api/chart/bars',
    '/api/paper/equity-curve',
    '/api/paper/portfolios',
    '/api/paper/portfolios/p-1',
    '/api/surveillance/summary',
    '/api/tags',
  ];
  it.each(allowed)('visitor GET %s is allowed', (path) => {
    expect(ev('GET', path, VISITOR)).toEqual({ action: 'allow' });
  });

  const denied = [
    '/api/chat/threads',
    '/api/database',
    '/api/rithmic/test-order',
    '/api/rithmic/control',
    '/api/market-data/download',
  ];
  it.each(denied)('visitor GET %s is 403 (staff-only)', (path) => {
    expect(ev('GET', path, VISITOR)).toEqual({ action: 'deny', status: 403, reason: 'read_only_role' });
  });

  it('staff GET is allowed everywhere, allowlisted or not', () => {
    expect(ev('GET', '/api/database', STAFF)).toEqual({ action: 'allow' });
    expect(ev('GET', '/api/analyse/history', STAFF)).toEqual({ action: 'allow' });
  });
});

describe('policy.evaluate — default deny', () => {
  it('an unclassified GET API route is staff-only by default', () => {
    expect(ev('GET', '/api/some-future-route', VISITOR)).toEqual({ action: 'deny', status: 403, reason: 'read_only_role' });
    expect(ev('GET', '/api/some-future-route', STAFF)).toEqual({ action: 'allow' });
  });
});

describe('policy.evaluate — auth-session paths (logout/me)', () => {
  it('a signed-in role can reach logout + me', () => {
    expect(ev('POST', '/api/auth/logout', VISITOR)).toEqual({ action: 'allow' });
    expect(ev('POST', '/api/auth/logout', STAFF)).toEqual({ action: 'allow' });
    expect(ev('GET', '/api/auth/me', VISITOR)).toEqual({ action: 'allow' });
  });
  it('anonymous logout/me is 401', () => {
    expect(ev('POST', '/api/auth/logout', ANON)).toEqual({ action: 'deny', status: 401 });
    expect(ev('GET', '/api/auth/me', ANON)).toEqual({ action: 'deny', status: 401 });
  });
});

describe('policy.evaluate — pages (rule 6)', () => {
  it('any page requires a session; anonymous redirects to login', () => {
    expect(ev('GET', '/chat', ANON)).toEqual({ action: 'redirect', to: '/login' });
  });
  it('visitor may view normal pages', () => {
    expect(ev('GET', '/', VISITOR)).toEqual({ action: 'allow' });
    expect(ev('GET', '/analyse', VISITOR)).toEqual({ action: 'allow' });
  });
  it('a staffOnlyPage redirects a visitor away but allows staff', () => {
    expect(ev('GET', '/chat', VISITOR)).toEqual({ action: 'redirect', to: '/' });
    expect(ev('GET', '/chat', STAFF)).toEqual({ action: 'allow' });
  });
});

describe('policy.evaluate — trailing slash normalisation', () => {
  it('treats /api/backtests/ the same as /api/backtests', () => {
    expect(ev('GET', '/api/backtests/', VISITOR)).toEqual({ action: 'allow' });
  });
});
