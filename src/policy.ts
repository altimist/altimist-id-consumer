/**
 * Route policy: the single source of truth for who may reach what.
 *
 * Pure, dependency-free, and deliberately mechanical so it can be unit-tested
 * exhaustively. The path sets are supplied (resolved in `config.ts`, merging the
 * package's own auth-route classification with the consumer's route allowlist);
 * this module is purely the engine.
 *
 * Rules, evaluated in order:
 *   1. Public:  paths reachable with no session.
 *   2. M2M:     paths authenticated by X-API-Key in the choke point.
 *   3. Auth-session: session required, allowed for any authenticated role
 *      (logout / me).
 *   4. Non-GET ⇒ staff.
 *   5. GET ⇒ staff-only unless on the explicit visitor allowlist. New/unclassified
 *      routes are therefore staff-only by default (default deny). Exposing one to
 *      visitors is a deliberate edit to the allowlist.
 *   6. Pages require a session; pages on `staffOnlyPages` redirect visitors home.
 */

export type Role = 'staff' | 'visitor';

export type Caller =
  | { authenticated: false }
  | { authenticated: true; role: Role };

export type PolicyDecision =
  | { action: 'public' }
  | { action: 'm2m' }
  | { action: 'allow' }
  | { action: 'deny'; status: 401 }
  | { action: 'deny'; status: 403; reason: 'read_only_role' }
  | { action: 'redirect'; to: string };

/** Fully-resolved policy sets (the package's own paths merged with the consumer's). */
export interface ResolvedPolicy {
  publicPaths: Set<string>;
  m2mPaths: Set<string>;
  authSessionPaths: Set<string>;
  staffOnlyPages: Set<string>;
  /** Patterns where `[seg]` matches a single dynamic path segment. */
  visitorGetAllowlist: readonly string[];
  /** Where anonymous page requests are redirected (the login page). */
  loginPath: string;
}

function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isApi(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

/** Match a path against a pattern where `[seg]` is a one-segment wildcard. */
function segmentMatch(pattern: string, path: string): boolean {
  const p = pattern.split('/');
  const a = path.split('/');
  if (p.length !== a.length) return false;
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    if (seg.startsWith('[') && seg.endsWith(']')) {
      if (a[i].length === 0) return false; // a dynamic segment must be non-empty
      continue;
    }
    if (seg !== a[i]) return false;
  }
  return true;
}

function isVisitorGetAllowed(allowlist: readonly string[], path: string): boolean {
  return allowlist.some((pattern) => segmentMatch(pattern, path));
}

export function evaluate(
  method: string,
  pathname: string,
  caller: Caller,
  policy: ResolvedPolicy,
): PolicyDecision {
  const path = normalize(pathname);

  if (policy.publicPaths.has(path)) return { action: 'public' };
  if (policy.m2mPaths.has(path)) return { action: 'm2m' };

  const api = isApi(path);

  // Logout / me: any authenticated role; anonymous has no session to act on.
  if (policy.authSessionPaths.has(path)) {
    if (!caller.authenticated) return { action: 'deny', status: 401 };
    return { action: 'allow' };
  }

  if (!caller.authenticated) {
    return api
      ? { action: 'deny', status: 401 }
      : { action: 'redirect', to: policy.loginPath };
  }

  // Staff: full access.
  if (caller.role === 'staff') return { action: 'allow' };

  // Visitor — read-only.
  if (!api) {
    return policy.staffOnlyPages.has(path)
      ? { action: 'redirect', to: '/' }
      : { action: 'allow' };
  }

  const isGet = method.toUpperCase() === 'GET';
  if (isGet && isVisitorGetAllowed(policy.visitorGetAllowlist, path)) {
    return { action: 'allow' };
  }
  return { action: 'deny', status: 403, reason: 'read_only_role' };
}
