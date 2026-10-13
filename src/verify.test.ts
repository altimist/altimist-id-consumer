import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock only the I/O boundary of the AID client; keep the pure helpers
// (peekBridgeJwt, parseDid, isIssuerAllowed) real so the issuer-allowlist and
// DID-extraction logic is exercised for real.
vi.mock('@altimist/did-web-client', async () => {
  const actual = await vi.importActual<typeof import('@altimist/did-web-client')>(
    '@altimist/did-web-client',
  );
  return {
    ...actual,
    verifyBridgeJwt: vi.fn(),
    releaseVcs: vi.fn(),
    verifyMembershipVC: vi.fn(),
    fetchTeamIssuer: vi.fn(),
  };
});

import {
  verifyBridgeJwt,
  releaseVcs,
  verifyMembershipVC,
  fetchTeamIssuer,
} from '@altimist/did-web-client';
import { verifyAndSignIn } from './verify.js';
import {
  setup,
  inMemoryStore,
  signedKeyList,
  TEST_DEADKEYS_URL,
  UNPINNED_LIST_PRIVATE,
  type InMemoryStore,
} from './test-helpers.js';
import type { ResolvedConfig } from './config.js';

type Mock = ReturnType<typeof vi.fn>;
const m = {
  verifyBridgeJwt: verifyBridgeJwt as unknown as Mock,
  releaseVcs: releaseVcs as unknown as Mock,
  verifyMembershipVC: verifyMembershipVC as unknown as Mock,
  fetchTeamIssuer: fetchTeamIssuer as unknown as Mock,
};

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function makeBridgeJwt(iss: string, kid = 'k1'): string {
  const header = { alg: 'WEBAUTHN-ES256', typ: 'JWT+WAS', kid };
  const payload = { iss, sub: iss, iat: 0, exp: 0, jti: 'jti-1' };
  return `${b64url(header)}.${b64url(payload)}.${b64url({ sig: 'x' })}`;
}

const ALT_ISS = 'did:web:nathan.altimist.ai';
const FED_ISS = 'did:web:patrickjv.com';

let store: InMemoryStore;
let cfg: ResolvedConfig;

let fetchMock: Mock;
/** Serve `body` as the dead-key list (status 200), or answer with `status` and no list. */
function serveList(body: string, status = 200) {
  fetchMock.mockResolvedValue(new Response(body, { status }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  ({ store, cfg } = setup());
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  serveList(await signedKeyList(['dead-1']));

  m.verifyBridgeJwt.mockResolvedValue({ ok: true, handle: 'nathan', kid: 'k1', jti: 'jti-1', iat: 0, exp: 0 });
  m.fetchTeamIssuer.mockResolvedValue({ team: 'altimist', jwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' } });
  m.releaseVcs.mockResolvedValue({ ok: true, vcs: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function userByDid(did: string) {
  for (const u of store.users.values()) if (u.did === did) return u;
  return undefined;
}

describe('verifyAndSignIn — staff', () => {
  it('a verified staff VC yields role staff and a session', async () => {
    m.releaseVcs.mockResolvedValue({ ok: true, vcs: ['vc-jwt'] });
    m.verifyMembershipVC.mockResolvedValue({
      ok: true, scopes: ['staff.admin'], team: 'altimist',
      expiresAt: new Date(Date.now() + 1e9), issuedAt: new Date(), jti: 'vc-1',
    });

    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));

    expect(out).toMatchObject({ kind: 'ok', handle: 'nathan', role: 'staff' });
    expect(userByDid(ALT_ISS)?.role).toBe('staff');
    expect(store.sessions.size).toBe(1);
    if (out.kind === 'ok') expect(out.cookie.name).toBe('aid_session');
  });

  it('checks the VC subject against the canonical DID from the JWT iss', async () => {
    m.releaseVcs.mockResolvedValue({ ok: true, vcs: ['vc-jwt'] });
    m.verifyMembershipVC.mockResolvedValue({
      ok: true, scopes: ['staff.member'], team: 'altimist',
      expiresAt: new Date(Date.now() + 1e9), issuedAt: new Date(), jti: 'vc-1',
    });

    await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(m.verifyMembershipVC).toHaveBeenCalledWith(
      expect.objectContaining({ vcJwt: 'vc-jwt', subjectDid: ALT_ISS }),
    );
  });

  it('federated staff identity signs in when its eTLD+1 is allowlisted', async () => {
    ({ store, cfg } = setup({ allowedIssuers: ['altimist.ai', 'patrickjv.com'] }));
    m.verifyBridgeJwt.mockResolvedValue({ ok: true, handle: 'patrickjv', kid: 'k1', jti: 'jti-1', iat: 0, exp: 0 });
    m.releaseVcs.mockResolvedValue({ ok: true, vcs: ['vc-jwt'] });
    m.verifyMembershipVC.mockResolvedValue({
      ok: true, scopes: ['staff.admin'], team: 'altimist',
      expiresAt: new Date(Date.now() + 1e9), issuedAt: new Date(), jti: 'vc-1',
    });

    const out = await verifyAndSignIn(cfg, makeBridgeJwt(FED_ISS));
    expect(out).toMatchObject({ kind: 'ok', handle: 'patrickjv', role: 'staff' });
  });
});

describe('verifyAndSignIn — visitor', () => {
  it('a valid AID with no VCs gets role visitor and signs in', async () => {
    m.releaseVcs.mockResolvedValue({ ok: true, vcs: [] });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'ok', role: 'visitor' });
    expect(userByDid(ALT_ISS)?.role).toBe('visitor');
    expect(m.verifyMembershipVC).not.toHaveBeenCalled();
  });

  it('a released VC that fails verification does not grant staff', async () => {
    m.releaseVcs.mockResolvedValue({ ok: true, vcs: ['bad-vc'] });
    m.verifyMembershipVC.mockResolvedValue({ ok: false, reason: 'bad-signature' });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'ok', role: 'visitor' });
  });

  it('a non-staff scope does not grant staff', async () => {
    m.releaseVcs.mockResolvedValue({ ok: true, vcs: ['vc-jwt'] });
    m.verifyMembershipVC.mockResolvedValue({
      ok: true, scopes: ['some.other.scope'], team: 'altimist',
      expiresAt: new Date(Date.now() + 1e9), issuedAt: new Date(), jti: 'vc-1',
    });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'ok', role: 'visitor' });
  });
});

describe('verifyAndSignIn — JIT provisioning + role recompute', () => {
  it('first sign-in JIT-creates the user row', async () => {
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out.kind).toBe('ok');
    expect(store.users.size).toBe(1);
  });

  it('an existing user keeps their row but has role recomputed at sign-in', async () => {
    store.users.set('user-existing', {
      id: 'user-existing', did: ALT_ISS, handle: 'nathan', role: 'visitor', lastLogin: new Date(),
    });
    m.releaseVcs.mockResolvedValue({ ok: true, vcs: ['vc-jwt'] });
    m.verifyMembershipVC.mockResolvedValue({
      ok: true, scopes: ['staff.admin'], team: 'altimist',
      expiresAt: new Date(Date.now() + 1e9), issuedAt: new Date(), jti: 'vc-1',
    });

    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'ok', role: 'staff' });
    expect(store.users.size).toBe(1);
    expect(store.users.get('user-existing')?.role).toBe('staff');
  });

  it('on a concurrent-first-signin clash, re-fetches and proceeds (Prisma-agnostic)', async () => {
    // Custom store: first findUserByDid returns null, create throws (race), the
    // re-fetch finds the row the winner inserted. The core never inspects the error.
    const base = inMemoryStore();
    let lookups = 0;
    const racing = {
      ...base,
      findUserByDid: async () => {
        lookups++;
        return lookups === 1 ? null : { id: 'user-raced', handle: 'nathan', role: 'visitor' as const };
      },
      createUser: async () => {
        throw new Error('unique constraint clash');
      },
    };
    ({ cfg } = setup({ store: racing as unknown as InMemoryStore }));

    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'ok' });
    if (out.kind === 'ok') expect(out.userId).toBe('user-raced');
  });

  it('rethrows if createUser fails and no row appears (genuine failure)', async () => {
    const base = inMemoryStore();
    const broken = {
      ...base,
      findUserByDid: async () => null,
      createUser: async () => {
        throw new Error('db down');
      },
    };
    ({ cfg } = setup({ store: broken as unknown as InMemoryStore }));
    await expect(verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS))).rejects.toThrow(/db down/);
  });
});

describe('verifyAndSignIn — fail-closed', () => {
  it('an issuer outside the allowlist is denied before any bridge verification', async () => {
    const out = await verifyAndSignIn(cfg, makeBridgeJwt('did:web:evil.com'));
    expect(out).toMatchObject({ kind: 'issuer_not_allowed', host: 'evil.com' });
    expect(m.verifyBridgeJwt).not.toHaveBeenCalled();
  });

  it('a retired <handle>.altimist.com issuer is denied by default (PL212, ADR-073)', async () => {
    // No allowedIssuers: the package default (from resolverDomain) decides.
    ({ store, cfg } = setup({ allowedIssuers: undefined }));
    const out = await verifyAndSignIn(cfg, makeBridgeJwt('did:web:nathan.altimist.com'));
    expect(out).toMatchObject({ kind: 'issuer_not_allowed', host: 'nathan.altimist.com' });
    expect(m.verifyBridgeJwt).not.toHaveBeenCalled();
  });

  // BR389 (BPM105), same rule as P5: an allowlist entry admits the exact host and
  // hosts exactly ONE label under it.
  it('staging: resolverDomain staging.altimist.ai admits alice.staging.altimist.ai by default (BR1 M1)', async () => {
    ({ store, cfg } = setup({ allowedIssuers: undefined, resolverDomain: 'staging.altimist.ai' }));
    const out = await verifyAndSignIn(cfg, makeBridgeJwt('did:web:alice.staging.altimist.ai'));
    expect(out.kind).not.toBe('issuer_not_allowed');
    expect(m.verifyBridgeJwt).toHaveBeenCalledTimes(1);
  });

  it('the production default refuses a staging host before any bridge verification (BR1 m1)', async () => {
    ({ store, cfg } = setup({ allowedIssuers: undefined }));
    const out = await verifyAndSignIn(cfg, makeBridgeJwt('did:web:alice.staging.altimist.ai'));
    expect(out).toMatchObject({ kind: 'issuer_not_allowed', host: 'alice.staging.altimist.ai' });
    expect(m.verifyBridgeJwt).not.toHaveBeenCalled();
  });

  it.each([
    ['did:web:altimist.ai', ['altimist.ai'], true],
    ['did:web:nathan.altimist.ai', ['altimist.ai'], true],
    ['did:web:a.b.altimist.ai', ['altimist.ai'], false],
    ['did:web:patrickjv.com', ['patrickjv.com'], true],
    ['did:web:x.y.patrickjv.com', ['patrickjv.com'], false],
    ['did:web:evilaltimist.ai', ['altimist.ai'], false],
  ])('%s with allowlist %j: allowed %s (exact host or one label under it)', async (iss, allowedIssuers, ok) => {
    ({ store, cfg } = setup({ allowedIssuers }));
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(iss));
    expect(out.kind === 'issuer_not_allowed').toBe(!ok);
    expect(m.verifyBridgeJwt).toHaveBeenCalledTimes(ok ? 1 : 0);
  });

  it('a bridge-JWT verification failure denies sign-in', async () => {
    m.verifyBridgeJwt.mockResolvedValue({ ok: false, reason: 'verification-failed' });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'invalid_jwt', reason: 'verification-failed' });
    expect(store.users.size).toBe(0);
  });

  it('a release failure fails the sign-in (Altimist ID unreachable)', async () => {
    m.releaseVcs.mockResolvedValue({ ok: false, reason: 'network_error', detail: 'ECONNREFUSED' });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'release_unavailable' });
    expect(store.users.size).toBe(0);
  });

  it('a malformed bridge token is rejected as invalid_jwt (no throw)', async () => {
    const out = await verifyAndSignIn(cfg, 'not-a-jwt');
    expect(out).toMatchObject({ kind: 'invalid_jwt' });
    expect(m.verifyBridgeJwt).not.toHaveBeenCalled();
  });

  it('surfaces consent_required from VC release with its consentUrl', async () => {
    m.releaseVcs.mockResolvedValue({ ok: false, reason: 'consent_required', consentUrl: 'https://id.altimist.ai/consent/abc' });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'consent_required', consentUrl: 'https://id.altimist.ai/consent/abc' });
  });

  it('policy_denied from release means visitor (no provable staff), not refusal', async () => {
    m.releaseVcs.mockResolvedValue({ ok: false, reason: 'policy_denied' });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'ok', role: 'visitor' });
  });
});

describe('verifyAndSignIn — audit', () => {
  it('writes a success audit row on sign-in', async () => {
    await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(store.audits).toContainEqual(
      expect.objectContaining({ event: 'altimist.signin', outcome: 'success' }),
    );
  });

  it('writes a refusal audit row when the issuer is not allowed', async () => {
    await verifyAndSignIn(cfg, makeBridgeJwt('did:web:evil.com'));
    expect(store.audits).toContainEqual(
      expect.objectContaining({ event: 'altimist.signin.refused', outcome: 'fail' }),
    );
  });
});

// Resolver C (PL263, F-040 rev 15 D-6): before sign-in completes, the consumer fetches the signed
// dead-key list from config, verifies it with did-web-client's verifySignedKeyList, and uses it
// only through decideKeyListUse(check, 'settlement'). Any failure refuses the sign-in; a key on
// the list is revoked. F-040 rev 15 AC6 (rev 14 AC24): never project from an empty set.
describe('verifyAndSignIn — the signed dead-key list (Resolver C)', () => {
  const refusedWith = (reason: string) =>
    expect(store.audits).toContainEqual(
      expect.objectContaining({
        event: 'altimist.signin.refused',
        outcome: 'fail',
        metadata: expect.objectContaining({ reason: 'key_list_unverified', listFailure: reason }),
      }),
    );

  it('fetches the list from the configured URL and signs in when the bridge key is not on it', async () => {
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'ok', handle: 'nathan' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(TEST_DEADKEYS_URL);
    // Never a cached copy: a cache could hide a key struck off a moment ago (NH219 n3).
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
  });

  it('a verified list with no keys on it is a real answer: sign-in proceeds', async () => {
    serveList(await signedKeyList([]));
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'ok' });
  });

  // The list is checked against the key that VERIFIED the signature (verifyBridgeJwt's kid),
  // never the header's hint: verifyBridgeJwt tries every method in the DID document, so a dead
  // key can sign while the header names a live one (NH219 m1).
  it('refuses a dead signing key whose header names a live key', async () => {
    serveList(await signedKeyList(['dead-k']));
    m.verifyBridgeJwt.mockResolvedValue({ ok: true, handle: 'nathan', kid: 'dead-k', jti: 'jti-1', iat: 0, exp: 0 });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS, 'live-k'));
    expect(out).toMatchObject({ kind: 'invalid_jwt', reason: 'key-revoked' });
    expect(store.sessions.size).toBe(0);
    expect(m.releaseVcs).not.toHaveBeenCalled();
  });

  it('refuses a bridge key that is on the verified list, before any VC release', async () => {
    serveList(await signedKeyList(['dead-1', 'k1']));
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'invalid_jwt', reason: 'key-revoked' });
    expect(store.users.size).toBe(0);
    expect(store.sessions.size).toBe(0);
    expect(m.releaseVcs).not.toHaveBeenCalled();
    expect(store.audits).toContainEqual(
      expect.objectContaining({
        event: 'altimist.signin.refused',
        metadata: expect.objectContaining({ reason: 'key_revoked', kid: 'k1' }),
      }),
    );
  });

  // Each failure refuses, although the bridge key (k1) is on none of these lists: a caller that
  // treated a failed list as an empty one would sign every one of these in (AC6).
  it.each([
    ['missing: the list URL answers 404', 'missing', async () => serveList('not found', 404)],
    ['missing: the list URL answers 503', 'missing', async () => serveList('', 503)],
    ['missing: the body is empty', 'missing', async () => serveList('')],
    ['missing: the fetch throws', 'missing', async () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
    ['malformed: not a list', 'malformed', async () => serveList('{"keys":"k2"}')],
    ['signature: signed by a key nobody pinned', 'signature', async () =>
      serveList(await signedKeyList(['dead-1'], { signWith: UNPINNED_LIST_PRIVATE }))],
    ['signature: a dead key struck off after signing', 'signature', async () => {
      const l = JSON.parse(await signedKeyList(['dead-1']));
      serveList(JSON.stringify({ ...l, keys: [] }));
    }],
    ['expired: valid_until has passed', 'expired', async () =>
      serveList(await signedKeyList(['dead-1'], { issuedAt: Date.now() - 600_000 }))],
    // did-web-client 57db6c1 threw out of verifyAndSignIn on this (a 500, no audit row; NH219 M1).
    ['signature: a sig of length 1 mod 4 (AAAAA)', 'signature', async () => {
      const l = JSON.parse(await signedKeyList(['dead-1']));
      serveList(JSON.stringify({ ...l, sig: 'AAAAA' }));
    }],
    // A signed list may live 300 s at most (F-040 rev 15 D-6); 57db6c1 accepted both (NH219 M1).
    ['expired: valid_until a year out', 'expired', async () =>
      serveList(await signedKeyList(['dead-1'], { validUntil: Date.now() + 365 * 86_400_000 }))],
    ['expired: issuedAt an hour in the future', 'expired', async () =>
      serveList(await signedKeyList(['dead-1'], { issuedAt: Date.now() + 3_600_000 }))],
  ])('%s: refused as key_list_unverified, nothing projected', async (_name, reason, arrange) => {
    await arrange();
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toEqual({ kind: 'key_list_unverified', reason });
    expect(store.users.size).toBe(0);
    expect(store.sessions.size).toBe(0);
    expect(m.releaseVcs).not.toHaveBeenCalled();
    refusedWith(reason);
  });

  // A list host that accepts the connection and never answers must not hold sign-in open: after
  // 5 s the fetch is aborted, which is `missing`, so 503 (NH219 m2).
  it('gives up on a list host that never answers after 5 s: missing, refused', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    let settled = false;
    const pending = verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS)).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    const out = await Promise.race([pending, new Promise((r) => setTimeout(() => r('still pending'), 500))]);
    expect(out).toEqual({ kind: 'key_list_unverified', reason: 'missing' });
    refusedWith('missing');
    expect(store.sessions.size).toBe(0);
  });

  it('refuses a list whose seq is below one this config already accepted (replay)', async () => {
    serveList(await signedKeyList(['dead-1'], { seq: 7 }));
    expect(await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS))).toMatchObject({ kind: 'ok' });

    serveList(await signedKeyList([], { seq: 6 }));
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toEqual({ kind: 'key_list_unverified', reason: 'seq' });
    refusedWith('seq');
  });

  it('keeps the seq high-water per config: a fresh config starts with none', async () => {
    serveList(await signedKeyList([], { seq: 7 }));
    await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    ({ store, cfg } = setup());
    serveList(await signedKeyList([], { seq: 6 }));
    expect(await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS))).toMatchObject({ kind: 'ok' });
  });

  it('does not fetch the list for a token refused earlier (issuer, bridge)', async () => {
    await verifyAndSignIn(cfg, makeBridgeJwt('did:web:evil.com'));
    m.verifyBridgeJwt.mockResolvedValue({ ok: false, reason: 'verification-failed' });
    await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
