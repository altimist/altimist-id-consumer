import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { setup, inMemoryStore, type InMemoryStore } from './test-helpers.js';
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
function makeBridgeJwt(iss: string): string {
  const header = { alg: 'WEBAUTHN-ES256', typ: 'JWT+WAS', kid: 'k1' };
  const payload = { iss, sub: iss, iat: 0, exp: 0, jti: 'jti-1' };
  return `${b64url(header)}.${b64url(payload)}.${b64url({ sig: 'x' })}`;
}

const ALT_ISS = 'did:web:nathan.altimist.com';
const FED_ISS = 'did:web:patrickjv.com';

let store: InMemoryStore;
let cfg: ResolvedConfig;

beforeEach(() => {
  vi.clearAllMocks();
  ({ store, cfg } = setup());

  m.verifyBridgeJwt.mockResolvedValue({ ok: true, handle: 'nathan', kid: 'k1', jti: 'jti-1', iat: 0, exp: 0 });
  m.fetchTeamIssuer.mockResolvedValue({ team: 'altimist', jwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' } });
  m.releaseVcs.mockResolvedValue({ ok: true, vcs: [] });
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
    ({ store, cfg } = setup({ allowedIssuers: ['altimist.com', 'patrickjv.com'] }));
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

  it('a bridge-JWT verification failure denies sign-in', async () => {
    m.verifyBridgeJwt.mockResolvedValue({ ok: false, reason: 'verification-failed' });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'invalid_jwt', reason: 'verification-failed' });
    expect(store.users.size).toBe(0);
  });

  it('a release failure fails the sign-in (altimist.id unreachable)', async () => {
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
    m.releaseVcs.mockResolvedValue({ ok: false, reason: 'consent_required', consentUrl: 'https://altimist.id/consent/abc' });
    const out = await verifyAndSignIn(cfg, makeBridgeJwt(ALT_ISS));
    expect(out).toMatchObject({ kind: 'consent_required', consentUrl: 'https://altimist.id/consent/abc' });
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
