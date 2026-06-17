/**
 * Route-handler factories. `createRoutes(deps)` returns one handler object per
 * canonical auth route; the consumer mounts each as a one-line re-export, e.g.
 * `export const { POST } = aid.routes.verify;`
 *
 * Logic ported from the trading-journal F-001 route handlers, parameterised on
 * the resolved config.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import type { ResolvedConfig } from './config.js';
import { verifyAndSignIn } from './verify.js';
import { getSession, destroySession, clearedCookie, SESSION_COOKIE } from './session.js';
import { safeAudit } from './audit.js';
import { checkRateLimit } from './rate-limit.js';
import {
  STATE_COOKIE_NAME,
  STATE_COOKIE_PATH,
  STATE_COOKIE_MAX_AGE_SECONDS,
  clientIp,
  randomState,
  callbackUrl,
} from './handoff.js';

export type RouteHandler = (req: NextRequest) => Promise<NextResponse>;

export interface AidRoutes {
  handoffInit: { POST: RouteHandler };
  registerInit: { POST: RouteHandler };
  verify: { POST: RouteHandler };
  logout: { POST: RouteHandler };
  me: { GET: RouteHandler };
  callback: { GET: RouteHandler };
}

const VerifyBody = z.object({ bridgeJwt: z.string().min(1) });

function rateLimited(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

function setStateCookie(res: NextResponse, state: string): void {
  res.cookies.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: STATE_COOKIE_PATH,
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });
}

export function createRoutes(deps: ResolvedConfig): AidRoutes {
  const handoffInit: RouteHandler = async (req) => {
    const limit = checkRateLimit(`auth-handoff-init:${clientIp(req)}`);
    if (!limit.ok) return rateLimited(limit.retryAfterSeconds);

    const state = randomState();
    const url = new URL(`${deps.altimistIdBaseUrl}/auth/handoff`);
    url.searchParams.set('app_id', deps.appId);
    url.searchParams.set('redirect_uri', callbackUrl(req));
    url.searchParams.set('state', state);

    const res = NextResponse.json({ handoffUrl: url.toString() });
    setStateCookie(res, state);
    return res;
  };

  const registerInit: RouteHandler = async (req) => {
    const limit = checkRateLimit(`auth-register-init:${clientIp(req)}`);
    if (!limit.ok) return rateLimited(limit.retryAfterSeconds);

    const state = randomState();
    const url = new URL(`${deps.altimistIdBaseUrl}/signup/self-service`);
    url.searchParams.set('app_id', deps.appId);
    url.searchParams.set('return_to', `${callbackUrl(req)}?flow=register`);
    url.searchParams.set('state', state);

    const res = NextResponse.json({ registerUrl: url.toString() });
    setStateCookie(res, state);
    return res;
  };

  const verify: RouteHandler = async (req) => {
    const limit = checkRateLimit(`auth-verify:${clientIp(req)}`);
    if (!limit.ok) return rateLimited(limit.retryAfterSeconds);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const parsed = VerifyBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const out = await verifyAndSignIn(deps, parsed.data.bridgeJwt);
    switch (out.kind) {
      case 'ok': {
        const res = NextResponse.json({ handle: out.handle, role: out.role });
        res.cookies.set(out.cookie.name, out.cookie.value, out.cookie.options);
        return res;
      }
      case 'invalid_jwt':
        return NextResponse.json({ error: 'invalid_jwt', reason: out.reason }, { status: 401 });
      case 'issuer_not_allowed':
        return NextResponse.json({ error: 'issuer_not_allowed', host: out.host }, { status: 403 });
      case 'consent_required':
        return NextResponse.json({ error: 'consent_required', consentUrl: out.consentUrl }, { status: 403 });
      case 'release_unavailable':
        return NextResponse.json({ error: 'release_unavailable' }, { status: 502 });
    }
  };

  const logout: RouteHandler = async (req) => {
    const sealed = req.cookies.get(SESSION_COOKIE)?.value;
    await destroySession(deps, sealed);
    await safeAudit(deps.store, 'logout', 'success', {});

    const res = NextResponse.json({ ok: true });
    const cleared = clearedCookie();
    res.cookies.set(cleared.name, cleared.value, cleared.options);
    return res;
  };

  const me: RouteHandler = async (req) => {
    const session = await getSession(deps, req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const user = await deps.store.findUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ handle: user.handle, role: session.role });
  };

  const callback: RouteHandler = async (req) => {
    const bridgeJwt = req.nextUrl.searchParams.get('bridge_jwt');
    const state = req.nextUrl.searchParams.get('state');
    const cookieState = req.cookies.get(STATE_COOKIE_NAME)?.value;

    const loginUrl = new URL(deps.policy.loginPath, req.url);

    // Fail closed on a missing/mismatched state — an attacker can't read the
    // HttpOnly cookie, so can't forge a matching pair.
    if (!bridgeJwt || !state || !cookieState || state !== cookieState) {
      loginUrl.searchParams.set('error', 'handoff');
      return NextResponse.redirect(loginUrl);
    }

    const out = await verifyAndSignIn(deps, bridgeJwt);
    if (out.kind !== 'ok') {
      loginUrl.searchParams.set('error', out.kind);
      return NextResponse.redirect(loginUrl);
    }

    const res = NextResponse.redirect(new URL('/', req.url));
    res.cookies.set(out.cookie.name, out.cookie.value, out.cookie.options);
    res.cookies.set(STATE_COOKIE_NAME, '', { path: STATE_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  return {
    handoffInit: { POST: handoffInit },
    registerInit: { POST: registerInit },
    verify: { POST: verify },
    logout: { POST: logout },
    me: { GET: me },
    callback: { GET: callback },
  };
}
