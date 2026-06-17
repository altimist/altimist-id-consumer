/**
 * Sign-in verification core (the verify route body).
 *
 * Identity is established by the bridge JWT; the *role* is derived from VC
 * presence: a verified staff VC from the team hub ⇒ staff; anything else ⇒
 * visitor. A missing staff VC is NOT a refusal — it's the visitor path.
 *
 * Fail-closed: issuer-allowlist miss, bridge-verify failure, or a release outage
 * all deny sign-in; they never default-allow.
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
  isIssuerAllowed,
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
  | { kind: 'release_unavailable' };

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

  if (!isIssuerAllowed(issHost, deps.allowedIssuers)) {
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
