/**
 * Config: the user-facing `AidConfig`, the internal `ResolvedConfig` (all defaults
 * applied + policy sets merged), and `configFromEnv()`.
 *
 * The config object is the source of truth (testable, no hidden globals, no
 * leaking app defaults). `configFromEnv()` reads the ADR-031-mandated env names
 * for ergonomics; the consumer still supplies `store` and `policy` explicitly.
 */
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
   * Consumer-app identifier; must match an `AppPolicy.appId` on altimist.id.
   * Optional at the type level for the same reason as `sessionPassword` (usually
   * from `ALTIMIST_APP_ID` via `configFromEnv()`); validated at startup.
   */
  appId?: string;

  // identity / verification (defaulted to altimist.id production values)
  /** `did:web` host eTLD+1s this consumer trusts. Default `[resolverDomain]`. */
  allowedIssuers?: readonly string[];
  /** Home domain for DID resolution + role policy. Default `altimist.com`. */
  resolverDomain?: string;
  /** RP-ID the bridge assertion is bound to. Default `altimist.id`. */
  rpId?: string;
  /** Origins the bridge assertion may have come from. Default `['https://altimist.id']`. */
  origins?: string[];
  /** altimist.id origin (hosted handoff + release endpoint). Default `https://altimist.id`. */
  altimistIdBaseUrl?: string;
  /** Full VC-release endpoint. Default `${altimistIdBaseUrl}/api/release/vcs`. */
  releaseEndpoint?: string;

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
  staffTtlSeconds: number;
  visitorTtlSeconds: number;
  team: string;
  staffScopes: Set<string>;
  m2m?: { apiKeyHash: string; apiKeyHashSalt: string };
  policy: ResolvedPolicy;
  matcher: string[];
}

const DAY = 24 * 60 * 60;

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

  const resolverDomain = (config.resolverDomain ?? 'altimist.com').trim();
  const allowedIssuers =
    config.allowedIssuers && config.allowedIssuers.length > 0
      ? config.allowedIssuers.map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [resolverDomain];
  const altimistIdBaseUrl = (config.altimistIdBaseUrl ?? 'https://altimist.id')
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
    rpId: (config.rpId ?? 'altimist.id').trim(),
    origins:
      config.origins && config.origins.length > 0
        ? config.origins
        : ['https://altimist.id'],
    altimistIdBaseUrl,
    releaseEndpoint: config.releaseEndpoint ?? `${altimistIdBaseUrl}/api/release/vcs`,
    staffTtlSeconds: config.staffTtlSeconds ?? 7 * DAY,
    visitorTtlSeconds: config.visitorTtlSeconds ?? DAY,
    team: config.team ?? 'altimist',
    staffScopes: new Set(config.staffScopes ?? ['staff.admin', 'staff.member']),
    m2m: config.m2m,
    policy,
    matcher: config.matcher ?? DEFAULT_MATCHER,
  };
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
  if (process.env.API_KEY_HASH && process.env.API_KEY_HASH_SALT) {
    out.m2m = {
      apiKeyHash: process.env.API_KEY_HASH,
      apiKeyHashSalt: process.env.API_KEY_HASH_SALT,
    };
  }
  return out;
}
