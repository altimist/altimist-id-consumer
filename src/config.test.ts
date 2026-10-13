import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConfig, configFromEnv } from './config.js';
import { inMemoryStore, TEST_SESSION_PASSWORD, TEST_DEADKEYS_URL, TEST_LIST_KEY } from './test-helpers.js';

const base = () => ({
  store: inMemoryStore(),
  sessionPassword: TEST_SESSION_PASSWORD,
  appId: 'my-app',
  deadKeys: { url: TEST_DEADKEYS_URL, listKeys: [TEST_LIST_KEY] },
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

  // Resolver C (PL263): the dead-key list URL and the pinned list keys have no default.
  it('throws without the dead-key list config', () => {
    expect(() => resolveConfig({ ...base(), deadKeys: undefined })).toThrow(/deadKeys/);
  });
  it('throws without a dead-key list URL, or with one that is not https', () => {
    expect(() => resolveConfig({ ...base(), deadKeys: { url: '', listKeys: [TEST_LIST_KEY] } })).toThrow(/deadKeys\.url/);
    expect(() =>
      resolveConfig({ ...base(), deadKeys: { url: 'http://id.altimist.ai/deadkeys', listKeys: [TEST_LIST_KEY] } }),
    ).toThrow(/deadKeys\.url/);
    expect(() => resolveConfig({ ...base(), deadKeys: { url: 'not a url', listKeys: [TEST_LIST_KEY] } })).toThrow(/deadKeys\.url/);
  });
  it('throws without at least one pinned list key', () => {
    expect(() => resolveConfig({ ...base(), deadKeys: { url: TEST_DEADKEYS_URL, listKeys: [] } })).toThrow(/deadKeys\.listKeys/);
  });
  it('carries the list config through, with its own seq memory per resolved config', () => {
    const a = resolveConfig(base());
    const b = resolveConfig(base());
    expect(a.deadKeysUrl).toBe(TEST_DEADKEYS_URL);
    expect(a.deadKeysListKeys).toEqual([TEST_LIST_KEY]);
    expect(a.deadKeysSeen).toEqual({});
    expect(a.deadKeysSeen).not.toBe(b.deadKeysSeen);
  });
});

describe('resolveConfig — defaults', () => {
  it('applies id.altimist.ai production defaults (PL212, ADR-073)', () => {
    const cfg = resolveConfig(base());
    expect(cfg.rpId).toBe('id.altimist.ai');
    expect(cfg.origins).toEqual(['https://id.altimist.ai']);
    expect(cfg.altimistIdBaseUrl).toBe('https://id.altimist.ai');
    expect(cfg.releaseEndpoint).toBe('https://id.altimist.ai/api/release/vcs');
    expect(cfg.team).toBe('altimist');
    expect([...cfg.staffScopes]).toEqual(['staff.admin', 'staff.member']);
    expect(cfg.allowedIssuers).toEqual(['altimist.ai']); // from default resolverDomain
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

  it('reads the dead-key list URL and the pinned list keys (a JSON array of JWKs)', () => {
    process.env.ALTIMIST_DEADKEYS_URL = TEST_DEADKEYS_URL;
    process.env.ALTIMIST_DEADKEYS_LIST_KEYS = JSON.stringify([TEST_LIST_KEY]);
    expect(configFromEnv().deadKeys).toEqual({ url: TEST_DEADKEYS_URL, listKeys: [TEST_LIST_KEY] });
  });

  it('leaves deadKeys unset unless both are set (resolveConfig then refuses to start)', () => {
    process.env.ALTIMIST_DEADKEYS_URL = TEST_DEADKEYS_URL;
    delete process.env.ALTIMIST_DEADKEYS_LIST_KEYS;
    expect('deadKeys' in configFromEnv()).toBe(false);
  });

  it('throws on list keys that are not a JSON array', () => {
    process.env.ALTIMIST_DEADKEYS_URL = TEST_DEADKEYS_URL;
    for (const bad of ['not json', '{"kty":"OKP"}']) {
      process.env.ALTIMIST_DEADKEYS_LIST_KEYS = bad;
      expect(() => configFromEnv()).toThrow(/ALTIMIST_DEADKEYS_LIST_KEYS/);
    }
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
