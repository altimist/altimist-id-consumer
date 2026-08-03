/**
 * Helpers + CSRF state-cookie constants for the hosted-handoff flow.
 *
 * `handoff/init` mints a random `state`, pins it in an HttpOnly cookie scoped to
 * the callback path, and echoes it in the handoff URL. On the redirect fallback,
 * the callback compares the URL's `state` to the cookie; an attacker on another
 * origin can't read the cookie, so can't forge a matching pair. (The popup path
 * validates `state` client-side in the postMessage handler.)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AID_PATHS } from './paths.js';

export const STATE_COOKIE_NAME = 'aid_handoff_state';
export const STATE_COOKIE_PATH = AID_PATHS.callback;
export const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** CSRF state token (192-bit, base64url). */
export function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

/**
 * This app's user-facing origin (proxy-aware). Needed ONLY for building an
 * ABSOLUTE cross-origin URL — the altimist.id `redirect_uri`/`return_to`,
 * which altimist.id validates against a per-app allow-list, closing the
 * open-redirect risk of trusting `X-Forwarded-Host` here.
 *
 * Never use this for a same-origin redirect (login page, post-login
 * landing, etc.) — use `sameOriginRedirect` instead. Two reasons:
 *   1. `req.url` alone isn't safe: self-hosted behind a reverse proxy, the
 *      Next.js process sees its own local bind address (e.g.
 *      `http://localhost:3000`), not the public host.
 *   2. `X-Forwarded-Host` is an unvalidated client-controlled header at the
 *      auth boundary — trusting it for a same-origin redirect is itself an
 *      open-redirect vector, since nothing here checks it against
 *      anything. It's safe ONLY because altimist.id independently
 *      allow-lists the resulting cross-origin URL on its side.
 */
export function forwardedOrigin(req: NextRequest): string {
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
    new URL(req.url).protocol.replace(':', '');
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ??
    req.headers.get('host') ??
    new URL(req.url).host;
  return `${proto}://${host}`;
}

/** This app's callback URL, derived from the user-facing origin (proxy-aware). */
export function callbackUrl(req: NextRequest): string {
  return `${forwardedOrigin(req)}${AID_PATHS.callback}`;
}

/**
 * Redirect to a same-origin relative path. All in-app redirects (login page,
 * post-login landing, role-gated "go elsewhere") are same-origin, so there is
 * no need to — and must not — build an absolute URL from a host: the browser
 * resolves a relative `Location` against the real request origin, with no
 * host to get wrong and no header to trust.
 */
export function sameOriginRedirect(
  path: string,
  params?: Record<string, string>,
): NextResponse {
  let location = path;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) location += (path.includes('?') ? '&' : '?') + qs;
  }
  return new NextResponse(null, { status: 307, headers: { location } });
}
