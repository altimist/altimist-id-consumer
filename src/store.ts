/**
 * `AidStore` — the package's one data-layer seam (F-001 spec §Data seam).
 *
 * The core performs NO database access except through this interface, and imports
 * nothing from Prisma. A consumer supplies an implementation: use the shipped
 * `prismaStore` (`@altimist/altimist-id-consumer/prisma`) for the canonical
 * schema, or implement these 10 methods against any database.
 *
 * Methods are dumb I/O — they perform the operation and may throw. The CORE owns
 * error policy (audit writes best-effort/swallowed, session validation
 * fail-closed, expiry/logout deletes ignored), so adapter authors never need to
 * know which calls are allowed to fail.
 */
import type { Role } from './policy.js';

export type AuthEvent =
  | 'altimist.signin'
  | 'altimist.signin.refused'
  | 'authz.denied'
  | 'logout';

export interface SessionRecord {
  userId: string;
  role: Role;
  expiresAt: Date;
}

export interface UserRecord {
  id: string;
  handle: string;
  role: Role;
}

export interface AidStore {
  // sessions
  createSession(s: {
    token: string;
    userId: string;
    role: Role;
    expiresAt: Date;
  }): Promise<void>;
  findSessionByToken(token: string): Promise<SessionRecord | null>;
  deleteSession(token: string): Promise<void>;
  deleteSessionsByHandle(handle: string): Promise<number>;
  deleteAllSessions(): Promise<number>;
  // users
  findUserByDid(did: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(u: {
    did: string;
    handle: string;
    role: Role;
    lastLogin: Date;
  }): Promise<{ id: string }>;
  updateUser(
    id: string,
    data: { role: Role; handle: string; lastLogin: Date },
  ): Promise<void>;
  // audit
  writeAudit(e: {
    event: AuthEvent;
    outcome: 'success' | 'fail';
    metadata: object;
  }): Promise<void>;
}
