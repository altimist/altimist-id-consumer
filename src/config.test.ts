import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConfig, configFromEnv } from './config.js';
import { inMemoryStore, TEST_SESSION_PASSWORD, TEST_DEADKEYS_URL, TEST_LIST_KEY, TEST_LIST_PRIVATE } from './test-helpers.js';

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
  // Resolver D's contract (DG146, via BR2154): each pinned key is exactly {kty:'OKP', crv:'Ed25519', x}.
  // Any other member, a private 'd' above all, or another key type refuses to start.
  it.each([
    ['a private d', { ...TEST_LIST_KEY, d: 'YshYa5ILIw_vDcygYDlO2pT59O8_RTQrDL81F-QNnO4' }],
    ['a kid', { ...TEST_LIST_KEY, kid: 'list-1' }],
    ['a use', { ...TEST_LIST_KEY, use: 'sig' }],
    ['key_ops', { ...TEST_LIST_KEY, key_ops: ['verify'] }],
    ['kty EC', { ...TEST_LIST_KEY, kty: 'EC' }],
    ['crv X25519', { ...TEST_LIST_KEY, crv: 'X25519' }],
    ['no x', { kty: 'OKP', crv: 'Ed25519' }],
    ['x not base64url', { ...TEST_LIST_KEY, x: TEST_LIST_KEY.x!.slice(0, 42) + '=' }],
    ['x the wrong length', { ...TEST_LIST_KEY, x: TEST_LIST_KEY.x!.slice(0, 40) }],
    ['x not a string', { ...TEST_LIST_KEY, x: 7 }],
    ['null', null],
    ['an array', [TEST_LIST_KEY]],
  ])('throws on a pinned list key carrying %s', (_label, bad) => {
    expect(() =>
      resolveConfig({ ...base(), deadKeys: { url: TEST_DEADKEYS_URL, listKeys: [TEST_LIST_KEY, bad as JsonWebKey] } }),
    ).toThrow(/deadKeys\.listKeys/);
  });
  it.each([
    ['one JWK object', TEST_LIST_KEY],
    ['the JSON string of an array', JSON.stringify([TEST_LIST_KEY])],
  ])('throws, with its own message, when listKeys is %s rather than an array', (_label, bad) => {
    expect(() =>
      resolveConfig({ ...base(), deadKeys: { url: TEST_DEADKEYS_URL, listKeys: bad as unknown as JsonWebKey[] } }),
    ).toThrow(/deadKeys\.listKeys must name at least one pinned list key/);
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
    process.env.SIGNED_KEY_LIST_URL = TEST_DEADKEYS_URL;
    process.env.SIGNED_KEY_LIST_PUBLIC_JWKS = JSON.stringify([TEST_LIST_KEY]);
    expect(configFromEnv().deadKeys).toEqual({ url: TEST_DEADKEYS_URL, listKeys: [TEST_LIST_KEY] });
  });

  it('leaves deadKeys unset unless both are set (resolveConfig then refuses to start)', () => {
    process.env.SIGNED_KEY_LIST_URL = TEST_DEADKEYS_URL;
    delete process.env.SIGNED_KEY_LIST_PUBLIC_JWKS;
    expect('deadKeys' in configFromEnv()).toBe(false);
  });

  it('reads only SIGNED_KEY_LIST_URL and SIGNED_KEY_LIST_PUBLIC_JWKS, not the earlier names', () => {
    delete process.env.SIGNED_KEY_LIST_URL;
    delete process.env.SIGNED_KEY_LIST_PUBLIC_JWKS;
    process.env.ALTIMIST_DEADKEYS_URL = TEST_DEADKEYS_URL;
    process.env.ALTIMIST_DEADKEYS_LIST_KEYS = JSON.stringify([TEST_LIST_KEY]);
    expect('deadKeys' in configFromEnv()).toBe(false);
  });

  it('takes neither earlier name alongside a current one', () => {
    process.env.ALTIMIST_DEADKEYS_URL = TEST_DEADKEYS_URL;
    process.env.SIGNED_KEY_LIST_PUBLIC_JWKS = JSON.stringify([TEST_LIST_KEY]);
    delete process.env.SIGNED_KEY_LIST_URL;
    expect('deadKeys' in configFromEnv()).toBe(false);
    delete process.env.SIGNED_KEY_LIST_PUBLIC_JWKS;
    process.env.ALTIMIST_DEADKEYS_LIST_KEYS = JSON.stringify([TEST_LIST_KEY]);
    process.env.SIGNED_KEY_LIST_URL = TEST_DEADKEYS_URL;
    expect('deadKeys' in configFromEnv()).toBe(false);
  });

  it('a private JWK in SIGNED_KEY_LIST_PUBLIC_JWKS refuses to start', () => {
    process.env.SESSION_PASSWORD = 'p'.repeat(40);
    process.env.ALTIMIST_APP_ID = 'env-app';
    process.env.SIGNED_KEY_LIST_URL = TEST_DEADKEYS_URL;
    process.env.SIGNED_KEY_LIST_PUBLIC_JWKS = JSON.stringify([TEST_LIST_PRIVATE]);
    expect(() => resolveConfig({ ...configFromEnv(), store: inMemoryStore() } as any)).toThrow(/deadKeys\.listKeys/);
  });

  it('throws on list keys that are not a JSON array', () => {
    process.env.SIGNED_KEY_LIST_URL = TEST_DEADKEYS_URL;
    for (const bad of ['not json', '{"kty":"OKP"}']) {
      process.env.SIGNED_KEY_LIST_PUBLIC_JWKS = bad;
      expect(() => configFromEnv()).toThrow(/SIGNED_KEY_LIST_PUBLIC_JWKS/);
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
