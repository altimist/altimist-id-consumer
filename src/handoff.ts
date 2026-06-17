/**
 * Helpers + CSRF state-cookie constants for the hosted-handoff flow.
 *
 * `handoff/init` mints a random `state`, pins it in an HttpOnly cookie scoped to
 * the callback path, and echoes it in the handoff URL. On the redirect fallback,
 * the callback compares the URL's `state` to the cookie; an attacker on another
 * origin can't read the cookie, so can't forge a matching pair. (The popup path
 * validates `state` client-side in the postMessage handler.)
 */
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

/** This app's callback URL, derived from the user-facing origin (proxy-aware). */
export function callbackUrl(req: NextRequest): string {
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
    new URL(req.url).protocol.replace(':', '');
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ??
    req.headers.get('host') ??
    new URL(req.url).host;
  return `${proto}://${host}${AID_PATHS.callback}`;
}
