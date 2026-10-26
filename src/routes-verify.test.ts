import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// The verify route's mapping of each VerifyOutcome to HTTP. The outcome itself is
// verify.test.ts's business; here verifyAndSignIn is stubbed.
vi.mock('./verify.js', () => ({ verifyAndSignIn: vi.fn() }));

import { verifyAndSignIn } from './verify.js';
import { createRoutes } from './routes.js';
import { __resetRateLimits } from './rate-limit.js';
import { setup } from './test-helpers.js';

const verify = verifyAndSignIn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetRateLimits();
  verify.mockReset();
});

const postJwt = () =>
  new NextRequest('http://localhost/api/auth/altimist/verify', {
    method: 'POST',
    body: JSON.stringify({ bridgeJwt: 'a.b.c' }),
    headers: { 'content-type': 'application/json' },
  });

describe('verify route — the dead-key list outcome (Resolver C, PL263)', () => {
  it('maps key_list_unverified to 503 with the list failure, and sets no cookie', async () => {
    verify.mockResolvedValue({ kind: 'key_list_unverified', reason: 'expired' });
    const res = await createRoutes(setup().cfg).verify.POST(postJwt());
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'key_list_unverified', reason: 'expired' });
    expect(res.cookies.getAll()).toEqual([]);
  });

  it('a revoked bridge key is a 401 invalid_jwt', async () => {
    verify.mockResolvedValue({ kind: 'invalid_jwt', reason: 'key-revoked' });
    const res = await createRoutes(setup().cfg).verify.POST(postJwt());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_jwt', reason: 'key-revoked' });
  });
});
