/**
 * `@altimist/altimist-id-consumer/prisma` — the shipped `AidStore` adapter for the
 * canonical schema (User / Session / AuthAuditLog).
 *
 * `prisma` is typed with a minimal STRUCTURAL interface rather than imported from
 * `@prisma/client`, so this package builds with no Prisma dependency and no
 * `prisma generate` step. A real `PrismaClient` (with the canonical models)
 * satisfies `PrismaLike` structurally. A consumer whose schema differs writes
 * their own `AidStore` instead of using this.
 *
 * Methods are plain delegations; the CORE owns error policy (it wraps the
 * best-effort deletes/audits), so these can throw freely.
 */
import type { AidStore, Role } from './index.js';

/** The subset of a Prisma client this adapter uses. A generated `PrismaClient`
 *  with models User/Session/AuthAuditLog is structurally assignable to this. */
export interface PrismaLike {
  session: {
    create(args: any): Promise<unknown>;
    findUnique(args: any): Promise<{ userId: string; role: string; expiresAt: Date } | null>;
    delete(args: any): Promise<unknown>;
    deleteMany(args?: any): Promise<{ count: number }>;
  };
  user: {
    findUnique(args: any): Promise<{ id: string; handle: string; role: string } | null>;
    create(args: any): Promise<{ id: string }>;
    update(args: any): Promise<unknown>;
  };
  authAuditLog: {
    create(args: any): Promise<unknown>;
  };
}

export function prismaStore(prisma: PrismaLike): AidStore {
  return {
    createSession: (s) => prisma.session.create({ data: s }).then(() => {}),

    findSessionByToken: (token) =>
      prisma.session.findUnique({ where: { token } }).then((r) =>
        r ? { userId: r.userId, role: r.role as Role, expiresAt: r.expiresAt } : null,
      ),

    deleteSession: (token) => prisma.session.delete({ where: { token } }).then(() => {}),

    deleteSessionsByHandle: (handle) =>
      prisma.session.deleteMany({ where: { user: { handle } } }).then((r) => r.count),

    deleteAllSessions: () => prisma.session.deleteMany({}).then((r) => r.count),

    findUserByDid: (did) =>
      prisma.user.findUnique({ where: { did } }).then((u) =>
        u ? { id: u.id, handle: u.handle, role: u.role as Role } : null,
      ),

    findUserById: (id) =>
      prisma.user.findUnique({ where: { id } }).then((u) =>
        u ? { id: u.id, handle: u.handle, role: u.role as Role } : null,
      ),

    createUser: (u) => prisma.user.create({ data: u }).then((r) => ({ id: r.id })),

    updateUser: (id, data) => prisma.user.update({ where: { id }, data }).then(() => {}),

    writeAudit: (e) => prisma.authAuditLog.create({ data: e }).then(() => {}),
  };
}
