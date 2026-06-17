import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { checkApiKey, __resetM2mFailures, type M2mConfig } from './m2m-auth.js';

async function sha256(key: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + key);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

let m2m: M2mConfig;

beforeEach(async () => {
  __resetM2mFailures();
  m2m = { apiKeyHash: await sha256('secret', 'salt'), apiKeyHashSalt: 'salt' };
});

function req(key?: string): NextRequest {
  return new NextRequest('http://localhost/api/positions/open', {
    method: 'GET',
    headers: key ? { 'x-api-key': key } : {},
  });
}

describe('checkApiKey', () => {
  it('returns 503 when no m2m config is supplied (fail-closed)', async () => {
    const res = await checkApiKey(req('secret'), undefined);
    expect(res?.status).toBe(503);
  });
  it('passes (null) for a valid key', async () => {
    expect(await checkApiKey(req('secret'), m2m)).toBeNull();
  });
  it('401s a missing key', async () => {
    expect((await checkApiKey(req(), m2m))?.status).toBe(401);
  });
  it('401s an invalid key', async () => {
    expect((await checkApiKey(req('wrong'), m2m))?.status).toBe(401);
  });
});
