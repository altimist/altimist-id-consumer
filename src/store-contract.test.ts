/**
 * AC-5 — both the in-memory store and the shipped `prismaStore` (against a fake
 * Prisma) satisfy the same `AidStore` contract. Run the identical suite for each.
 */
import { describe, it, expect } from 'vitest';
import type { AidStore } from './store.js';
import { prismaStore } from './prisma.js';
import { inMemoryStore, fakePrisma } from './test-helpers.js';

const implementations: Array<[string, () => AidStore]> = [
  ['inMemoryStore', () => inMemoryStore()],
  ['prismaStore(fakePrisma)', () => prismaStore(fakePrisma())],
];

describe.each(implementations)('AidStore contract — %s', (_name, make) => {
  it('creates and finds a user by did and by id', async () => {
    const store = make();
    const { id } = await store.createUser({ did: 'did:web:a.altimist.com', handle: 'a', role: 'staff', lastLogin: new Date() });
    expect(await store.findUserByDid('did:web:a.altimist.com')).toMatchObject({ id, handle: 'a', role: 'staff' });
    expect(await store.findUserById(id)).toMatchObject({ id, handle: 'a', role: 'staff' });
    expect(await store.findUserByDid('did:web:missing')).toBeNull();
  });

  it('enforces did uniqueness on createUser', async () => {
    const store = make();
    await store.createUser({ did: 'did:web:dup', handle: 'a', role: 'visitor', lastLogin: new Date() });
    await expect(
      store.createUser({ did: 'did:web:dup', handle: 'b', role: 'visitor', lastLogin: new Date() }),
    ).rejects.toThrow();
  });

  it('updates a user role/handle', async () => {
    const store = make();
    const { id } = await store.createUser({ did: 'did:web:u', handle: 'old', role: 'visitor', lastLogin: new Date() });
    await store.updateUser(id, { role: 'staff', handle: 'new', lastLogin: new Date() });
    expect(await store.findUserById(id)).toMatchObject({ role: 'staff', handle: 'new' });
  });

  it('creates, finds, and deletes a session', async () => {
    const store = make();
    const expiresAt = new Date(Date.now() + 60_000);
    await store.createSession({ token: 'tok', userId: 'u1', role: 'visitor', expiresAt });
    const row = await store.findSessionByToken('tok');
    expect(row).toMatchObject({ userId: 'u1', role: 'visitor' });
    expect(row!.expiresAt.getTime()).toBe(expiresAt.getTime());
    await store.deleteSession('tok');
    expect(await store.findSessionByToken('tok')).toBeNull();
  });

  it('deleteSession throws on a missing row (core wraps this)', async () => {
    const store = make();
    await expect(store.deleteSession('nope')).rejects.toThrow();
  });

  it('revokes sessions by handle, leaving others', async () => {
    const store = make();
    const { id: a } = await store.createUser({ did: 'did:web:a', handle: 'alice', role: 'visitor', lastLogin: new Date() });
    const { id: b } = await store.createUser({ did: 'did:web:b', handle: 'bob', role: 'visitor', lastLogin: new Date() });
    const exp = new Date(Date.now() + 60_000);
    await store.createSession({ token: 'a1', userId: a, role: 'visitor', expiresAt: exp });
    await store.createSession({ token: 'a2', userId: a, role: 'visitor', expiresAt: exp });
    await store.createSession({ token: 'b1', userId: b, role: 'visitor', expiresAt: exp });

    expect(await store.deleteSessionsByHandle('alice')).toBe(2);
    expect(await store.findSessionByToken('a1')).toBeNull();
    expect(await store.findSessionByToken('b1')).not.toBeNull();
  });

  it('deletes all sessions', async () => {
    const store = make();
    const exp = new Date(Date.now() + 60_000);
    await store.createSession({ token: 'x', userId: 'u', role: 'staff', expiresAt: exp });
    await store.createSession({ token: 'y', userId: 'u', role: 'staff', expiresAt: exp });
    expect(await store.deleteAllSessions()).toBe(2);
    expect(await store.findSessionByToken('x')).toBeNull();
  });

  it('writes audit without throwing', async () => {
    const store = make();
    await expect(
      store.writeAudit({ event: 'altimist.signin', outcome: 'success', metadata: { handle: 'a' } }),
    ).resolves.toBeUndefined();
  });
});
