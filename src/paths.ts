/**
 * Canonical AltimistID route paths. Fixed by the package (see F-001 spec §Routes):
 * the `/browser` helpers POST to these, the route factories are mounted at these,
 * and the policy engine auto-classifies them. Exported as constants so there are
 * no duplicated magic strings across the layers.
 */
export const AID_PATHS = {
  handoffInit: '/api/auth/altimist/handoff/init',
  registerInit: '/api/auth/altimist/register/init',
  verify: '/api/auth/altimist/verify',
  callback: '/auth/altimist/callback',
  logout: '/api/auth/logout',
  me: '/api/auth/me',
  login: '/login',
} as const;

/** Package-owned routes reachable with no session (sign-in / register entry + the
 *  login page that anonymous users are redirected to). */
export const AID_PUBLIC_PATHS: readonly string[] = [
  AID_PATHS.verify,
  AID_PATHS.handoffInit,
  AID_PATHS.registerInit,
  AID_PATHS.callback,
  AID_PATHS.login,
];

/** Package-owned routes that require a session but are allowed for any role —
 *  a visitor must be able to end their own session and read their own identity. */
export const AID_AUTH_SESSION_PATHS: readonly string[] = [
  AID_PATHS.logout,
  AID_PATHS.me,
];

/**
 * Default middleware matcher: run on everything except Next internals and static
 * assets. The explicit manifest.json / robots.txt / sw.js excludes matter — they
 * are fetched on the (unauthenticated) login page and must not redirect.
 */
export const DEFAULT_MATCHER: string[] = [
  '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sw.js|.*\\.(?:svg|png|ico|jpg|jpeg|webp|gif|js|css|map|txt|woff2?|webmanifest)$).*)',
];
