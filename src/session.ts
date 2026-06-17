/**
 * Session issue / validate / destroy.
 *
 * The cookie carries an iron-session-sealed random token; the authoritative
 * session (role-at-issue + expiry) lives in the store. Every request re-reads the
 * row, so deleting it (revokeSessions) revokes access on the next request.
 *
 * Functions take a `SessionDeps` — `ResolvedConfig` satisfies it structurally, so
 * the choke point and verify just pass their resolved config.
 */
import { sealData, unsealData } from 'iron-session';
import type { AidStore } from './store.js';
import type { Role } from './policy.js';

export const SESSION_COOKIE = 'aid_session';

export interface SessionDeps {
  store: AidStore;
  sessionPassword: string;
  staffTtlSeconds: number;
  visitorTtlSeconds: number;
}

function ttlFor(deps: SessionDeps, role: Role): number {
  return role === 'staff' ? deps.staffTtlSeconds : deps.visitorTtlSeconds;
}

function randomToken(): string {
  const bytes = new Uint8Array(32); // 256-bit
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: true;
    sameSite: 'lax';
    path: '/';
    maxAge: number;
  };
}

export interface ActiveSession {
  userId: string;
  role: Role;
  token: string;
  expiresAt: Date;
}

function cookie(value: string, maxAge: number): SessionCookie {
  return {
    name: SESSION_COOKIE,
    value,
    options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge },
  };
}

export async function issueSession(
  deps: SessionDeps,
  userId: string,
  role: Role,
): Promise<{ session: ActiveSession; cookie: SessionCookie }> {
  const token = randomToken();
  const ttl = ttlFor(deps, role);
  const expiresAt = new Date(Date.now() + ttl * 1000);

  await deps.store.createSession({ token, userId, role, expiresAt });

  const sealed = await sealData({ token }, { password: deps.sessionPassword, ttl });
  return {
    session: { userId, role, token, expiresAt },
    cookie: cookie(sealed, ttl),
  };
}

async function tokenFromCookie(
  deps: SessionDeps,
  sealed: string,
): Promise<string | null> {
  try {
    const data = await unsealData<{ token?: string }>(sealed, {
      password: deps.sessionPassword,
    });
    return data?.token ?? null;
  } catch {
    return null; // unseal failure = anonymous (fail-closed)
  }
}

export async function getSession(
  deps: SessionDeps,
  sealed: string | undefined,
): Promise<ActiveSession | null> {
  if (!sealed) return null;
  const token = await tokenFromCookie(deps, sealed);
  if (!token) return null;

  const row = await deps.store.findSessionByToken(token);
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await deps.store.deleteSession(token).catch(() => {});
    return null;
  }

  return {
    userId: row.userId,
    role: row.role,
    token,
    expiresAt: row.expiresAt,
  };
}

export async function destroySession(
  deps: SessionDeps,
  sealed: string | undefined,
): Promise<void> {
  if (!sealed) return;
  const token = await tokenFromCookie(deps, sealed);
  if (!token) return;
  await deps.store.deleteSession(token).catch(() => {});
}

/** Cookie that expires the session client-side (logout response). */
export function clearedCookie(): SessionCookie {
  return cookie('', 0);
}
