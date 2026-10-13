/**
 * Sign-in verification core (the verify route body).
 *
 * Identity is established by the bridge JWT; the *role* is derived from VC
 * presence: a verified staff VC from the team hub ⇒ staff; anything else ⇒
 * visitor. A missing staff VC is NOT a refusal — it's the visitor path.
 *
 * Fail-closed: issuer-allowlist miss, bridge-verify failure, an unverified
 * dead-key list, or a release outage all deny sign-in; they never default-allow.
 *
 * Takes `ResolvedConfig` as deps. The JIT race is handled here, Prisma-agnostically
 * (no error-code inspection), so the core stays free of any Prisma dependency.
 */
import {
  verifyBridgeJwt,
  releaseVcs,
  verifyMembershipVC,
  fetchTeamIssuer,
  peekBridgeJwt,
  parseDid,
  verifySignedKeyList,
  decideKeyListUse,
  type KeyListFailure,
} from '@altimist/did-web-client';
import type { Role } from './policy.js';
import type { ResolvedConfig } from './config.js';
import { issueSession, type SessionCookie } from './session.js';
import { safeAudit } from './audit.js';

export type VerifyOutcome =
  | { kind: 'ok'; userId: string; handle: string; role: Role; cookie: SessionCookie }
  | { kind: 'invalid_jwt'; reason: string }
  | { kind: 'issuer_not_allowed'; host: string }
  | { kind: 'consent_required'; consentUrl: string }
  | { kind: 'release_unavailable' }
  | { kind: 'key_list_unverified'; reason: KeyListFailure | 'revocations' };

/**
 * PL212 (BPM105): an allowlist entry admits its exact host and hosts exactly one
 * label under it. So `altimist.ai` admits `nathan.altimist.ai` but not
 * `alice.staging.altimist.ai`, and `staging.altimist.ai` admits the latter.
 * did-web-client's `isIssuerAllowed` matches by registrable domain, which
 * cannot tell the two apart once staging sits under altimist.ai.
 */
function issuerHostAllowed(issHost: string, allowed: readonly string[]): boolean {
  const host = issHost.toLowerCase();
  return allowed.some((entry) => {
    if (host === entry) return true;
    if (!host.endsWith('.' + entry)) return false;
    const label = host.slice(0, -(entry.length + 1));
    return label.length > 0 && !label.includes('.');
  });
}

/** F-020 US-5 — accept a bridge assertion bound to the issuer's own RP or the home RP. */
function expectedRpIds(deps: ResolvedConfig, issHost: string): string[] {
  const home = deps.rpId;
  return issHost === home ? [home] : [home, issHost];
}

export async function verifyAndSignIn(
  deps: ResolvedConfig,
  bridgeJwt: string,
): Promise<VerifyOutcome> {
  // 1) Peek the unverified token for the issuer DID, so the allowlist check fires
  //    before any cryptographic work or network call.
  let iss: string;
  let issHost: string;
  try {
    const peeked = peekBridgeJwt(bridgeJwt);
    iss = String(peeked.payload.iss);
    issHost = parseDid(iss).host;
  } catch {
    await safeAudit(deps.store, 'altimist.signin.refused', 'fail', { reason: 'malformed_token' });
    return { kind: 'invalid_jwt', reason: 'malformed' };
  }

  if (!issuerHostAllowed(issHost, deps.allowedIssuers)) {
    await safeAudit(deps.store, 'altimist.signin.refused', 'fail', {
      reason: 'issuer_not_allowed',
      host: issHost,
    });
    return { kind: 'issuer_not_allowed', host: issHost };
  }

  // 2) Verify the bridge JWT against the public DID document (fail-closed).
  const verified = await verifyBridgeJwt({
    token: bridgeJwt,
    expectedOrigin: deps.origins,
    expectedRPID: expectedRpIds(deps, issHost),
    clockSkewSeconds: 60, // absorb browser↔server NTP skew
  });
  if (!verified.ok) {
    await safeAudit(deps.store, 'altimist.signin.refused', 'fail', {
      reason: verified.reason,
      host: issHost,
    });
    return { kind: 'invalid_jwt', reason: verified.reason };
  }
  const handle = verified.handle;
  const subjectDid = iss; // canonical DID the VC subject must match

  // 2b) Resolver C (PL263, F-040 rev 15 D-6): the bridge key must not be on the signed
  //     dead-key list. Sign-in is consequence-bearing, so the list is used with the
  //     'settlement' intent only: any failure refuses, and a list that did not verify is
  //     never read as an empty one (F-040 rev 15 AC6, rev 14 AC24).
  const decision = decideKeyListUse(
    await verifySignedKeyList(await fetchKeyList(deps.deadKeysUrl), {
      listKeys: deps.deadKeysListKeys,
      now: Date.now(),
      seen: deps.deadKeysSeen,
    }),
    'settlement',
  );
  if (!decision.use) {
    await safeAudit(deps.store, 'altimist.signin.refused', 'fail', {
      reason: 'key_list_unverified',
      listFailure: decision.reason,
      host: issHost,
    });
    return { kind: 'key_list_unverified', reason: decision.reason };
  }
  // The contract on both sides is a bare kid: `verified.kid` is the fragment of the method
  // that verified the signature (not the header's hint), and the list holds bare credential
  // IDs (D-6: DeadKey.kid = Device.kid). A full DID URL on the list would not match.
  if (decision.keys.includes(verified.kid)) {
    await safeAudit(deps.store, 'altimist.signin.refused', 'fail', {
      reason: 'key_revoked',
      kid: verified.kid,
      handle,
    });
    return { kind: 'invalid_jwt', reason: 'key-revoked' };
  }
  // 2c) PL263 / F-040 rev 15 D-6: a kid on revocations.json OR on the signed list is revoked.
  //     altimist-id writes a device revocation as sha256("device:" + bare kid), lowercase hex.
  //     Read here rather than with did-web-client's isRevoked, which has no timeout and reads a
  //     body without a `revoked` array as "nothing revoked" (fail-open). Any failure refuses.
  const revoked = await fetchRevocations();
  if (!revoked) {
    await safeAudit(deps.store, 'altimist.signin.refused', 'fail', {
      reason: 'key_list_unverified',
      listFailure: 'revocations',
      host: issHost,
    });
    return { kind: 'key_list_unverified', reason: 'revocations' };
  }
  if (revoked.includes(await sha256Hex(`device:${verified.kid}`))) {
    await safeAudit(deps.store, 'altimist.signin.refused', 'fail', {
      reason: 'key_revoked',
      kid: verified.kid,
      handle,
      via: 'revocations',
    });
    return { kind: 'invalid_jwt', reason: 'key-revoked' };
  }

  // 3) Request the user's staff VC(s). A release outage fails the sign-in;
  //    consent_required is a pending state surfaced to the UI, not a refusal.
  const staffVcTypes = [...deps.staffScopes];
  const release = await releaseVcs({
    endpoint: deps.releaseEndpoint,
    bridgeJwt,
    appId: deps.appId,
    types: staffVcTypes,
  });
  if (!release.ok) {
    if (release.reason === 'consent_required') {
      return { kind: 'consent_required', consentUrl: release.consentUrl };
    }
    if (release.reason === 'policy_denied') {
      // App not permitted these VC types for this user ⇒ no provable staff
      // status ⇒ visitor (default-deny on privilege, not on access).
      return finishSignIn(deps, subjectDid, handle, 'visitor');
    }
    await safeAudit(deps.store, 'altimist.signin.refused', 'fail', {
      handle,
      reason: 'release_unavailable',
    });
    return { kind: 'release_unavailable' };
  }

  // 4) Compute role from VC presence.
  const role = await roleFromReleasedVcs(deps, release.vcs, subjectDid);

  return finishSignIn(deps, subjectDid, handle, role);
}

/** How long sign-in waits for a list (headers and body) before refusing it as `missing`. */
const KEY_LIST_TIMEOUT_MS = 5_000;

/** The list body, or `null` (verifySignedKeyList's "missing") on any fetch failure, non-2xx or timeout. */
async function fetchKeyList(url: string): Promise<string | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), KEY_LIST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: abort.signal });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The revocation list altimist-id publishes; the same URL in every environment, as C-3 reads it. */
const REVOCATIONS_URL = 'https://altimist.com/.well-known/revocations.json';

/** `revoked` as an array of strings, or `null` on any fetch failure, non-2xx, timeout or malformed body. */
async function fetchRevocations(): Promise<string[] | null> {
  const body = await fetchKeyList(REVOCATIONS_URL);
  if (body === null) return null;
  try {
    const revoked: unknown = (JSON.parse(body) as { revoked?: unknown } | null)?.revoked;
    return Array.isArray(revoked) && revoked.every((h) => typeof h === 'string') ? revoked : null;
  } catch {
    return null;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function roleFromReleasedVcs(
  deps: ResolvedConfig,
  vcs: string[],
  subjectDid: string,
): Promise<Role> {
  if (vcs.length === 0) return 'visitor';
  const issuer = await fetchTeamIssuer(deps.team);
  for (const vcJwt of vcs) {
    const r = await verifyMembershipVC({ vcJwt, issuerPublicJwk: issuer.jwk, subjectDid });
    if (r.ok && r.scopes.some((s) => deps.staffScopes.has(s))) return 'staff';
  }
  return 'visitor';
}

async function finishSignIn(
  deps: ResolvedConfig,
  subjectDid: string,
  handle: string,
  role: Role,
): Promise<VerifyOutcome> {
  const now = new Date();
  let userId: string;
  let kind: 'returning' | 'jit_provisioned';

  const existing = await deps.store.findUserByDid(subjectDid);
  if (existing) {
    await deps.store.updateUser(existing.id, { role, handle, lastLogin: now });
    userId = existing.id;
    kind = 'returning';
  } else {
    try {
      const created = await deps.store.createUser({ did: subjectDid, handle, role, lastLogin: now });
      userId = created.id;
      kind = 'jit_provisioned';
    } catch (err) {
      // Concurrent first sign-in for the same DID — re-fetch (Prisma-agnostic: we
      // never inspect the error code). If the row now exists, proceed as
      // returning; otherwise the create genuinely failed, so rethrow.
      const raced = await deps.store.findUserByDid(subjectDid);
      if (!raced) throw err;
      userId = raced.id;
      kind = 'returning';
    }
  }

  const { cookie } = await issueSession(deps, userId, role);
  await safeAudit(deps.store, 'altimist.signin', 'success', { handle, userId, role, kind });
  return { kind: 'ok', userId, handle, role, cookie };
}
