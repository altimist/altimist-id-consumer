// NH219 n5 / NH220: the bare-kid contract, with nothing faked. verify.test.ts mocks
// verifyBridgeJwt and so chooses its `kid`; here the REAL verifier runs on a bridge JWT signed
// with a real P-256 key (the WebAuthn segments forged the way did-web-client's own
// bridge.test.ts does), so the kid compared against the list is the one did-web-client
// actually returns: the bare fragment of the verification method, e.g. "cred-abc".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bridgeChallenge, BRIDGE_ALG, BRIDGE_TYP, BRIDGE_TTL_SECONDS } from '@altimist/did-web-client';
import { verifyAndSignIn } from './verify.js';
import { setup, signedKeyList, TEST_DEADKEYS_URL, type InMemoryStore } from './test-helpers.js';
import type { ResolvedConfig } from './config.js';

const HANDLE = 'nathan';
const ISS = `did:web:${HANDLE}.altimist.ai`;
const KID = 'cred-abc';
const FULL_KID = `${ISS}#${KID}`;
const DID_URL = `https://${HANDLE}.altimist.ai/.well-known/did.json`;
// setup()'s defaults: origins ['https://id.altimist.ai'], rpId 'id.altimist.ai'.
const ORIGIN = 'https://id.altimist.ai';
const RPID = 'id.altimist.ai';

const b64u = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64url');
const sha256 = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// IEEE P1363 (r || s) → ASN.1 DER, the form a WebAuthn signature travels in.
function derInt(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  let v = b.slice(i);
  if (v[0]! & 0x80) v = Uint8Array.from([0, ...v]);
  return Uint8Array.from([0x02, v.length, ...v]);
}
function p1363ToDer(sig: Uint8Array): Uint8Array {
  const r = derInt(sig.slice(0, 32));
  const s = derInt(sig.slice(32, 64));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}

let keyPair: CryptoKeyPair;
let publicJwk: JsonWebKey;

async function forgeBridgeJwt(): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const headerB64 = b64u(JSON.stringify({ alg: BRIDGE_ALG, typ: BRIDGE_TYP, kid: FULL_KID }));
  const payloadB64 = b64u(
    JSON.stringify({ iss: ISS, sub: HANDLE, iat, exp: iat + BRIDGE_TTL_SECONDS, jti: 'jti-real' }),
  );
  const clientDataJSON = new TextEncoder().encode(
    JSON.stringify({ type: 'webauthn.get', challenge: await bridgeChallenge(headerB64, payloadB64), origin: ORIGIN }),
  );
  const authData = new Uint8Array(37);
  authData.set(await sha256(new TextEncoder().encode(RPID)), 0);
  authData[32] = 0x01; // UP
  const signed = Uint8Array.from([...authData, ...(await sha256(clientDataJSON))]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signed));
  const bundle = { authenticatorData: b64u(authData), clientDataJSON: b64u(clientDataJSON), signature: b64u(p1363ToDer(sig)) };
  return `${headerB64}.${payloadB64}.${b64u(JSON.stringify(bundle))}`;
}

let store: InMemoryStore;
let cfg: ResolvedConfig;
let fetchMock: ReturnType<typeof vi.fn>;

/** Serve the DID document and `list`; anything else (the VC release) answers 503. */
function serve(list: string) {
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === DID_URL) {
      return new Response(
        JSON.stringify({
          '@context': ['https://www.w3.org/ns/did/v1'],
          id: ISS,
          verificationMethod: [{ id: FULL_KID, type: 'JsonWebKey2020', controller: ISS, publicKeyJwk: publicJwk }],
          authentication: [FULL_KID],
          assertionMethod: [FULL_KID],
        }),
        { status: 200 },
      );
    }
    if (url === TEST_DEADKEYS_URL) return new Response(list, { status: 200 });
    return new Response('unavailable', { status: 503 });
  });
}

beforeEach(async () => {
  keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), alg: 'ES256' };
  ({ store, cfg } = setup());
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the bare-kid contract against the real verifyBridgeJwt (NH219 n5)', () => {
  it('refuses when the list holds the bare credential id of the key that signed', async () => {
    serve(await signedKeyList([KID]));
    const out = await verifyAndSignIn(cfg, await forgeBridgeJwt());
    expect(out).toEqual({ kind: 'invalid_jwt', reason: 'key-revoked' });
    expect(store.audits).toContainEqual(
      expect.objectContaining({ metadata: expect.objectContaining({ reason: 'key_revoked', kid: KID }) }),
    );
    expect(store.sessions.size).toBe(0);
  });

  it('a list holding the full DID URL does not match: the token verifies and reaches the release', async () => {
    serve(await signedKeyList([FULL_KID]));
    const out = await verifyAndSignIn(cfg, await forgeBridgeJwt());
    // Past the kid check: the release endpoint (503 here) is what refuses, not the list.
    expect(out).toEqual({ kind: 'release_unavailable' });
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain(cfg.releaseEndpoint);
  });
});
