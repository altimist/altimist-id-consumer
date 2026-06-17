/**
 * Shared test doubles: an in-memory `AidStore`, a fake Prisma client (for the
 * adapter contract test), and a `setup()` that builds a `ResolvedConfig` with a
 * journal-like route policy. Excluded from the build (tsconfig).
 */
import { resolveConfig, type AidConfig, type ResolvedConfig } from './config.js';
import type { AidStore } from './store.js';
import type { PrismaLike } from './prisma.js';

export const TEST_SESSION_PASSWORD = 'test-password-test-password-test-password';

interface UserRow {
  id: string;
  did: string;
  handle: string;
  role: string;
  lastLogin: Date;
}
interface SessionRow {
  token: string;
  userId: string;
  role: string;
  expiresAt: Date;
}

export interface InMemoryStore extends AidStore {
  users: Map<string, UserRow>;
  sessions: Map<string, SessionRow>;
  audits: Array<{ event: string; outcome: string; metadata: object }>;
}

/** An in-memory `AidStore`. `createUser` enforces the `did` uniqueness the
 *  canonical schema has, and `deleteSession` throws on a missing row (like
 *  Prisma's `delete`), so the core's error handling is exercised for real. */
export function inMemoryStore(): InMemoryStore {
  const users = new Map<string, UserRow>();
  const sessions = new Map<string, SessionRow>();
  const audits: Array<{ event: string; outcome: string; metadata: object }> = [];
  let seq = 0;

  return {
    users,
    sessions,
    audits,
    async createSession(s) {
      sessions.set(s.token, { ...s });
    },
    async findSessionByToken(token) {
      const r = sessions.get(token);
      return r ? { userId: r.userId, role: r.role as 'staff' | 'visitor', expiresAt: r.expiresAt } : null;
    },
    async deleteSession(token) {
      if (!sessions.has(token)) throw new Error('session not found');
      sessions.delete(token);
    },
    async deleteSessionsByHandle(handle) {
      let n = 0;
      for (const [token, s] of sessions) {
        const u = users.get(s.userId);
        if (u && u.handle === handle) {
          sessions.delete(token);
          n++;
        }
      }
      return n;
    },
    async deleteAllSessions() {
      const n = sessions.size;
      sessions.clear();
      return n;
    },
    async findUserByDid(did) {
      for (const u of users.values()) {
        if (u.did === did) return { id: u.id, handle: u.handle, role: u.role as 'staff' | 'visitor' };
      }
      return null;
    },
    async findUserById(id) {
      const u = users.get(id);
      return u ? { id: u.id, handle: u.handle, role: u.role as 'staff' | 'visitor' } : null;
    },
    async createUser(u) {
      for (const ex of users.values()) {
        if (ex.did === u.did) throw new Error('unique constraint: did');
      }
      const id = `user-${++seq}`;
      users.set(id, { id, ...u });
      return { id };
    },
    async updateUser(id, data) {
      const u = users.get(id);
      if (u) Object.assign(u, data);
    },
    async writeAudit(e) {
      audits.push(e);
    },
  };
}

/** A fake Prisma client (PrismaLike) backed by Maps — for the adapter contract
 *  test, so `prismaStore` is exercised without a real database. */
export function fakePrisma(): PrismaLike & { _users: Map<string, any>; _sessions: Map<string, any> } {
  const sessions = new Map<string, any>();
  const users = new Map<string, any>();
  let seq = 0;
  return {
    _users: users,
    _sessions: sessions,
    session: {
      create: async ({ data }: any) => {
        sessions.set(data.token, { ...data });
        return data;
      },
      findUnique: async ({ where }: any) => sessions.get(where.token) ?? null,
      delete: async ({ where }: any) => {
        if (!sessions.has(where.token)) throw new Error('not found');
        const r = sessions.get(where.token);
        sessions.delete(where.token);
        return r;
      },
      deleteMany: async (args?: any) => {
        const handle = args?.where?.user?.handle;
        let count = 0;
        for (const [token, s] of sessions) {
          if (handle === undefined || users.get(s.userId)?.handle === handle) {
            sessions.delete(token);
            count++;
          }
        }
        return { count };
      },
    },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id) return users.get(where.id) ?? null;
        for (const u of users.values()) if (u.did === where.did) return u;
        return null;
      },
      create: async ({ data }: any) => {
        for (const u of users.values()) if (u.did === data.did) throw new Error('unique did');
        const id = `puser-${++seq}`;
        const row = { id, ...data };
        users.set(id, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const u = users.get(where.id);
        if (u) Object.assign(u, data);
        return u;
      },
    },
    authAuditLog: {
      create: async () => ({}),
    },
  };
}

/** A journal-like route policy, enough to exercise the policy engine. */
export const TEST_POLICY: NonNullable<AidConfig['policy']> = {
  publicPaths: ['/api/health'],
  m2mPaths: ['/api/positions/open', '/api/positions/unsynced', '/api/compute-mfe-mae'],
  staffOnlyPages: ['/chat'],
  visitorGetAllowlist: [
    '/api/analyse/history',
    '/api/backtests',
    '/api/backtests/[runId]/trades',
    '/api/backtests/[runId]/[strategyName]/trades',
    '/api/imbalance/analysis',
    '/api/market-data/status',
    '/api/volume-profile/[symbol]/[date]',
    '/api/live/stream',
    '/api/rithmic/pnl-snapshot',
    '/api/live/feed-comparison',
    '/api/live/ping',
    '/api/ami/recent',
    '/api/chart/bars',
    '/api/paper/equity-curve',
    '/api/paper/portfolios',
    '/api/paper/portfolios/[id]',
    '/api/surveillance/summary',
    '/api/tags',
  ],
};

export interface TestContext {
  store: InMemoryStore;
  cfg: ResolvedConfig;
}

export function setup(overrides?: Partial<AidConfig>): TestContext {
  const store = overrides?.store ? (overrides.store as InMemoryStore) : inMemoryStore();
  const cfg = resolveConfig({
    store,
    sessionPassword: TEST_SESSION_PASSWORD,
    appId: 'test-app',
    allowedIssuers: ['altimist.com'],
    policy: TEST_POLICY,
    ...overrides,
  });
  return { store, cfg };
}
