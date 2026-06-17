/**
 * The Option A enforcement core (called by the consumer's `middleware.ts`).
 *
 * A single fail-closed choke point: classify the path, run the M2M key gate for
 * the consumer's M2M paths, otherwise validate the session against the store and
 * apply `evaluate`. Default-deny is automatic (any route not on the visitor
 * allowlist, and any non-GET, is staff-only) and revocation is immediate (the
 * session row is read every request).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { evaluate, type Caller, type PolicyDecision } from './policy.js';
import { getSession, SESSION_COOKIE } from './session.js';
import { checkApiKey } from './m2m-auth.js';
import { safeAudit } from './audit.js';
import type { ResolvedConfig } from './config.js';

const ANON: Caller = { authenticated: false };

function isApi(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

function toResponse(
  decision: PolicyDecision,
  req: NextRequest,
  loginPath: string,
): NextResponse {
  switch (decision.action) {
    case 'public':
    case 'allow':
      return NextResponse.next();
    case 'redirect':
      return decision.to === loginPath
        ? loginRedirect(req, loginPath)
        : NextResponse.redirect(new URL(decision.to, req.url));
    case 'deny':
      if (decision.status === 401) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: decision.reason }, { status: 403 });
    case 'm2m':
      // Unreachable: handled before toResponse. Fail closed.
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

/**
 * Redirect to the login page, preserving where the user was headed as `?next` so
 * the login form can send them back after sign-in. Only set for real page paths
 * (skip the root and the login page itself).
 */
function loginRedirect(req: NextRequest, loginPath: string): NextResponse {
  const url = new URL(loginPath, req.url);
  const orig = req.nextUrl.pathname + req.nextUrl.search;
  if (orig && orig !== '/' && orig !== loginPath) {
    url.searchParams.set('next', orig);
  }
  return NextResponse.redirect(url);
}

/** Fail-closed fallback used when something unexpected throws. */
function denied(req: NextRequest, loginPath: string): NextResponse {
  return isApi(req.nextUrl.pathname)
    ? NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    : loginRedirect(req, loginPath);
}

export async function enforce(
  req: NextRequest,
  deps: ResolvedConfig,
): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const method = req.method;
  const loginPath = deps.policy.loginPath;

  try {
    // Public and M2M decisions don't depend on the caller, so detect them with an
    // anonymous probe and skip the session store hit entirely.
    const probe = evaluate(method, pathname, ANON, deps.policy);
    if (probe.action === 'public') return NextResponse.next();
    if (probe.action === 'm2m') {
      return (await checkApiKey(req, deps.m2m)) ?? NextResponse.next();
    }

    // Everything else: validate the session against the store every request.
    const session = await getSession(deps, req.cookies.get(SESSION_COOKIE)?.value);
    const caller: Caller = session
      ? { authenticated: true, role: session.role }
      : ANON;

    const decision = evaluate(method, pathname, caller, deps.policy);
    if (decision.action === 'deny' && decision.status === 403) {
      await safeAudit(deps.store, 'authz.denied', 'fail', {
        path: pathname,
        method,
        role: session?.role,
        userId: session?.userId,
      });
    }
    return toResponse(decision, req, loginPath);
  } catch {
    return denied(req, loginPath);
  }
}
