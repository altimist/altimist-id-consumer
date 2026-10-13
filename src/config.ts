/**
 * Config: the user-facing `AidConfig`, the internal `ResolvedConfig` (all defaults
 * applied + policy sets merged), and `configFromEnv()`.
 *
 * The config object is the source of truth (testable, no hidden globals, no
 * leaking app defaults). `configFromEnv()` reads the ADR-031-mandated env names
 * for ergonomics; the consumer still supplies `store` and `policy` explicitly.
 */
import type { SeqMemory } from '@altimist/did-web-client';
import type { AidStore } from './store.js';
import type { ResolvedPolicy } from './policy.js';
import {
  AID_PATHS,
  AID_PUBLIC_PATHS,
  AID_AUTH_SESSION_PATHS,
  DEFAULT_MATCHER,
} from './paths.js';

export interface AidConfig {
  /** The data-layer seam — required (see `prismaStore` for the canonical case). */
  store: AidStore;
  /**
   * iron-session sealing key, ≥32 chars. Optional at the type level because it is
   * normally supplied via `configFromEnv()` (which spreads in `SESSION_PASSWORD`);
   * `resolveConfig` throws at startup if it is missing or too short, so it is
   * effectively required and fail-closed.
   */
  sessionPassword?: string;
  /**
   * Consumer-app identifier; must match an `AppPolicy.appId` on Altimist ID.
   * Optional at the type level for the same reason as `sessionPassword` (usually
   * from `ALTIMIST_APP_ID` via `configFromEnv()`); validated at startup.
   */
  appId?: string;

  // identity / verification (defaulted to Altimist ID production values on
  // id.altimist.ai since the PL212 cutover, ADR-073)
  /** `did:web` hosts this consumer trusts: each entry admits its exact host and hosts
   *  exactly one label under it (PL212). Default `[resolverDomain]`. */
  allowedIssuers?: readonly string[];
  /** Home domain for DID resolution + role policy. Default `altimist.ai`
   *  (`altimist.com` before PL212). Staging: `staging.altimist.ai`. */
  resolverDomain?: string;
  /** RP-ID the bridge assertion is bound to. Default `id.altimist.ai`
   *  (`altimist.id` before PL212). Staging: `id.staging.altimist.ai`. */
  rpId?: string;
  /** Origins the bridge assertion may have come from. Default `['https://id.altimist.ai']`. */
  origins?: string[];
  /** Altimist ID origin (hosted handoff + release endpoint). Default
   *  `https://id.altimist.ai`. Staging: `https://id.staging.altimist.ai`. */
  altimistIdBaseUrl?: string;
  /** Full VC-release endpoint. Default `${altimistIdBaseUrl}/api/release/vcs`. */
  releaseEndpoint?: string;

  /**
   * Resolver C (PL263, F-040 rev 15 D-6): the signed dead-key list. Sign-in fetches it from `url`
   * and refuses unless it verifies against one of `listKeys` (Ed25519 JWKs). An interim departure
   * from F-040 rev 15 D-4, which pins the trust anchor in did-web-client: until it does, the
   * deployment's config sets it (NH219 m4).
   * Required, with no default: the deployment sets both. `resolveConfig` throws without them.
   */
  deadKeys?: { url: string; listKeys: readonly JsonWebKey[] };
  /**
   * altimist-id's revocation list (PL263: a kid on it OR on the signed list is revoked). https.
   * Default production's `https://altimist.com/.well-known/revocations.json`; staging sets its
   * own, `https://id.staging.altimist.ai/api/resolver/revocations` (NH283 m5).
   */
  revocationsUrl?: string;

  // session
  staffTtlSeconds?: number; // default 7d
  visitorTtlSeconds?: number; // default 24h

  // role derivation
  team?: string; // default 'altimist'
  staffScopes?: string[]; // default ['staff.admin','staff.member']

  // optional machine-to-machine X-API-Key gate
  m2m?: { apiKeyHash: string; apiKeyHashSalt: string };

  // route classification — the consumer's OWN routes (the package owns its auth
  // routes' classification automatically).
  policy?: {
    publicPaths?: string[];
    m2mPaths?: string[];
    authSessionPaths?: string[];
    staffOnlyPages?: string[];
    /** Patterns; `[seg]` matches one dynamic segment. */
    visitorGetAllowlist?: string[];
  };

  /** Override the middleware matcher (sensible default provided). */
  matcher?: string[];
}

export interface ResolvedConfig {
  store: AidStore;
  sessionPassword: string;
  appId: string;
  allowedIssuers: readonly string[];
  rpId: string;
  origins: string[];
  altimistIdBaseUrl: string;
  releaseEndpoint: string;
  deadKeysUrl: string;
  deadKeysListKeys: readonly JsonWebKey[];
  /** The last list `seq` this config accepted; in memory, per config (F-040 rev 15 D-6). */
  deadKeysSeen: SeqMemory;
  revocationsUrl: string;
  staffTtlSeconds: number;
  visitorTtlSeconds: number;
  team: string;
  staffScopes: Set<string>;
  m2m?: { apiKeyHash: string; apiKeyHashSalt: string };
  policy: ResolvedPolicy;
  matcher: string[];
}

const DAY = 24 * 60 * 60;

/** Resolver D's contract: a pinned list key is exactly {kty:'OKP', crv:'Ed25519', x: 32-byte base64url}. */
function isPublicEd25519Jwk(k: unknown): boolean {
  if (typeof k !== 'object' || k === null || Array.isArray(k)) return false;
  const o = k as Record<string, unknown>;
  const names = Object.keys(o).sort();
  return (
    names.length === 3 && names[0] === 'crv' && names[1] === 'kty' && names[2] === 'x' &&
    o.kty === 'OKP' && o.crv === 'Ed25519' && typeof o.x === 'string' && /^[A-Za-z0-9_-]{43}$/.test(o.x)
  );
}

export function resolveConfig(config: AidConfig): ResolvedConfig {
  if (!config.store) {
    throw new Error('AidConfig.store is required');
  }
  if (!config.sessionPassword || config.sessionPassword.length < 32) {
    throw new Error('AidConfig.sessionPassword must be set and at least 32 characters');
  }
  if (!config.appId) {
    throw new Error('AidConfig.appId is required');
  }
  if (!config.deadKeys) {
    throw new Error('AidConfig.deadKeys is required (the signed dead-key list URL and its pinned list keys)');
  }
  if (!isHttpsUrl(config.deadKeys.url)) {
    throw new Error('AidConfig.deadKeys.url must be an https URL');
  }
  if (!Array.isArray(config.deadKeys.listKeys) || config.deadKeys.listKeys.length === 0) {
    throw new Error('AidConfig.deadKeys.listKeys must name at least one pinned list key');
  }
  if (!config.deadKeys.listKeys.every(isPublicEd25519Jwk)) {
    throw new Error("AidConfig.deadKeys.listKeys entries must be exactly {kty:'OKP', crv:'Ed25519', x} (no 'd', no other member)");
  }

  const resolverDomain = (config.resolverDomain ?? 'altimist.ai').trim();
  const allowedIssuers =
    config.allowedIssuers && config.allowedIssuers.length > 0
      ? config.allowedIssuers.map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [resolverDomain.toLowerCase()];
  const revocationsUrl = config.revocationsUrl ?? 'https://altimist.com/.well-known/revocations.json';
  if (!isHttpsUrl(revocationsUrl)) {
    throw new Error('AidConfig.revocationsUrl must be an https URL');
  }
  const altimistIdBaseUrl = (config.altimistIdBaseUrl ?? 'https://id.altimist.ai')
    .trim()
    .replace(/\/$/, '');

  const p = config.policy ?? {};
  const policy: ResolvedPolicy = {
    publicPaths: new Set([...AID_PUBLIC_PATHS, ...(p.publicPaths ?? [])]),
    m2mPaths: new Set(p.m2mPaths ?? []),
    authSessionPaths: new Set([...AID_AUTH_SESSION_PATHS, ...(p.authSessionPaths ?? [])]),
    staffOnlyPages: new Set(p.staffOnlyPages ?? []),
    visitorGetAllowlist: p.visitorGetAllowlist ?? [],
    loginPath: AID_PATHS.login,
  };

  return {
    store: config.store,
    sessionPassword: config.sessionPassword,
    appId: config.appId,
    allowedIssuers,
    rpId: (config.rpId ?? 'id.altimist.ai').trim(),
    origins:
      config.origins && config.origins.length > 0
        ? config.origins
        : ['https://id.altimist.ai'],
    altimistIdBaseUrl,
    releaseEndpoint: config.releaseEndpoint ?? `${altimistIdBaseUrl}/api/release/vcs`,
    deadKeysUrl: config.deadKeys.url,
    deadKeysListKeys: config.deadKeys.listKeys,
    deadKeysSeen: {},
    revocationsUrl,
    staffTtlSeconds: config.staffTtlSeconds ?? 7 * DAY,
    visitorTtlSeconds: config.visitorTtlSeconds ?? DAY,
    team: config.team ?? 'altimist',
    staffScopes: new Set(config.staffScopes ?? ['staff.admin', 'staff.member']),
    m2m: config.m2m,
    policy,
    matcher: config.matcher ?? DEFAULT_MATCHER,
  };
}

function isHttpsUrl(raw: string | undefined): boolean {
  try {
    return new URL(raw ?? '').protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Build the identity/session/M2M parts of `AidConfig` from the ADR-031 env names.
 * The consumer spreads this and adds `store` + `policy` (which can't come from env).
 */
export function configFromEnv(): Partial<AidConfig> {
  const out: Partial<AidConfig> = {};
  if (process.env.SESSION_PASSWORD) out.sessionPassword = process.env.SESSION_PASSWORD;
  if (process.env.ALTIMIST_APP_ID) out.appId = process.env.ALTIMIST_APP_ID;

  const issuers = process.env.ALTIMIST_ALLOWED_ISSUERS?.trim();
  if (issuers) {
    out.allowedIssuers = issuers
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  if (process.env.ALTIMIST_RESOLVER_DOMAIN) {
    out.resolverDomain = process.env.ALTIMIST_RESOLVER_DOMAIN;
  }
  if (process.env.ALTIMIST_RP_ID) out.rpId = process.env.ALTIMIST_RP_ID;

  const origins = process.env.ALTIMIST_ORIGIN?.trim();
  if (origins) {
    out.origins = origins.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (process.env.ALTIMIST_RELEASE_BASE_URL) {
    out.altimistIdBaseUrl = process.env.ALTIMIST_RELEASE_BASE_URL;
  }
  // Resolver D's names (DG146, BR2154), the same in every caller.
  const deadKeysUrl = process.env.SIGNED_KEY_LIST_URL?.trim();
  const listKeys = process.env.SIGNED_KEY_LIST_PUBLIC_JWKS?.trim();
  if (deadKeysUrl && listKeys) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(listKeys);
    } catch {
      parsed = undefined;
    }
    if (!Array.isArray(parsed)) {
      throw new Error('SIGNED_KEY_LIST_PUBLIC_JWKS must be a JSON array of Ed25519 JWKs');
    }
    out.deadKeys = { url: deadKeysUrl, listKeys: parsed as JsonWebKey[] };
  }
  const revocationsUrl = process.env.ALTIMIST_REVOCATIONS_URL?.trim();
  if (revocationsUrl) out.revocationsUrl = revocationsUrl;
  if (process.env.API_KEY_HASH && process.env.API_KEY_HASH_SALT) {
    out.m2m = {
      apiKeyHash: process.env.API_KEY_HASH,
      apiKeyHashSalt: process.env.API_KEY_HASH_SALT,
    };
  }
  return out;
}
