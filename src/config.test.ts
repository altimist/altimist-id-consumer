import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConfig, configFromEnv } from './config.js';
import { inMemoryStore, TEST_SESSION_PASSWORD } from './test-helpers.js';

const base = () => ({
  store: inMemoryStore(),
  sessionPassword: TEST_SESSION_PASSWORD,
  appId: 'my-app',
});

describe('resolveConfig — required fields', () => {
  it('throws without a store', () => {
    expect(() => resolveConfig({ ...base(), store: undefined as any })).toThrow(/store/);
  });
  it('throws without a >=32-char sessionPassword', () => {
    expect(() => resolveConfig({ ...base(), sessionPassword: 'short' })).toThrow(/sessionPassword/);
  });
  it('throws without an appId', () => {
    expect(() => resolveConfig({ ...base(), appId: '' })).toThrow(/appId/);
  });
});

describe('resolveConfig — defaults', () => {
  it('applies altimist.id production defaults', () => {
    const cfg = resolveConfig(base());
    expect(cfg.rpId).toBe('altimist.id');
    expect(cfg.origins).toEqual(['https://altimist.id']);
    expect(cfg.altimistIdBaseUrl).toBe('https://altimist.id');
    expect(cfg.releaseEndpoint).toBe('https://altimist.id/api/release/vcs');
    expect(cfg.team).toBe('altimist');
    expect([...cfg.staffScopes]).toEqual(['staff.admin', 'staff.member']);
    expect(cfg.allowedIssuers).toEqual(['altimist.com']); // from default resolverDomain
    expect(cfg.staffTtlSeconds).toBe(7 * 24 * 60 * 60);
    expect(cfg.visitorTtlSeconds).toBe(24 * 60 * 60);
  });

  it('honours an explicit allowedIssuers (lowercased)', () => {
    const cfg = resolveConfig({ ...base(), allowedIssuers: ['Altimist.com', 'patrickjv.com'] });
    expect(cfg.allowedIssuers).toEqual(['altimist.com', 'patrickjv.com']);
  });

  it('strips a trailing slash from altimistIdBaseUrl', () => {
    const cfg = resolveConfig({ ...base(), altimistIdBaseUrl: 'https://id.example.com/' });
    expect(cfg.altimistIdBaseUrl).toBe('https://id.example.com');
    expect(cfg.releaseEndpoint).toBe('https://id.example.com/api/release/vcs');
  });
});

describe('resolveConfig — policy merge', () => {
  it('merges the package auth routes with the consumer route classification', () => {
    const cfg = resolveConfig({
      ...base(),
      policy: { publicPaths: ['/api/health'], m2mPaths: ['/api/sync'], staffOnlyPages: ['/admin'], visitorGetAllowlist: ['/api/x'] },
    });
    // package-owned public paths present
    expect(cfg.policy.publicPaths.has('/api/auth/altimist/verify')).toBe(true);
    expect(cfg.policy.publicPaths.has('/login')).toBe(true);
    // consumer public path present
    expect(cfg.policy.publicPaths.has('/api/health')).toBe(true);
    // package-owned auth-session paths present
    expect(cfg.policy.authSessionPaths.has('/api/auth/logout')).toBe(true);
    expect(cfg.policy.authSessionPaths.has('/api/auth/me')).toBe(true);
    // consumer sets
    expect(cfg.policy.m2mPaths.has('/api/sync')).toBe(true);
    expect(cfg.policy.staffOnlyPages.has('/admin')).toBe(true);
    expect(cfg.policy.visitorGetAllowlist).toContain('/api/x');
    expect(cfg.policy.loginPath).toBe('/login');
  });
});

describe('configFromEnv', () => {
  const ENV = process.env;
  beforeEach(() => {
    process.env = { ...ENV };
  });
  afterEach(() => {
    process.env = ENV;
  });

  it('reads the ADR-031 env names', () => {
    process.env.SESSION_PASSWORD = 'p'.repeat(40);
    process.env.ALTIMIST_APP_ID = 'env-app';
    process.env.ALTIMIST_ALLOWED_ISSUERS = 'altimist.com, Patrickjv.com';
    process.env.API_KEY_HASH = 'hash';
    process.env.API_KEY_HASH_SALT = 'salt';

    const c = configFromEnv();
    expect(c.sessionPassword).toBe('p'.repeat(40));
    expect(c.appId).toBe('env-app');
    expect(c.allowedIssuers).toEqual(['altimist.com', 'patrickjv.com']);
    expect(c.m2m).toEqual({ apiKeyHash: 'hash', apiKeyHashSalt: 'salt' });
  });

  it('omits keys that are unset (so resolveConfig defaults apply)', () => {
    delete process.env.SESSION_PASSWORD;
    delete process.env.ALTIMIST_ALLOWED_ISSUERS;
    delete process.env.API_KEY_HASH;
    const c = configFromEnv();
    expect('sessionPassword' in c).toBe(false);
    expect('allowedIssuers' in c).toBe(false);
    expect('m2m' in c).toBe(false);
  });

  it('does not set m2m unless BOTH hash and salt are present', () => {
    process.env.API_KEY_HASH = 'hash';
    delete process.env.API_KEY_HASH_SALT;
    expect('m2m' in configFromEnv()).toBe(false);
  });
});
