# `@altimist/altimist-id-consumer`

Add AltimistID authentication to a Next.js app the way [ADR-031](https://github.com/altimist/altimist-strategy/blob/main/decisions/ADR-031-altimistid-consumer-middleware-choke-point.md) prescribes — one Node-runtime middleware choke point doing DB-backed session validation plus a **default-deny** route policy, with roles derived from verifiable credentials — without copying a dozen files between apps.

```bash
npm install @altimist/altimist-id-consumer @altimist/did-web-client iron-session
```

> **Status:** `0.x`, initial development. The API may change until mission-control
> migrates onto it (mc#336). See [`docs/specs/F-001-altimist-id-consumer-package.md`](./docs/specs/F-001-altimist-id-consumer-package.md).

> **Changed at the PL212 cutover (12/10/2026, [ADR-073](https://github.com/altimist/altimist-strategy/blob/main/decisions/ADR-073-altimist-id-on-altimist-ai.md)), from 0.2.0.** Altimist ID is at `id.altimist.ai`. It is the RP ID, the origin and the handoff host, and `altimist.id` forwards there. DIDs are `did:web:<handle>.altimist.ai`, so the default issuer allowlist is `altimist.ai`, and a `<handle>.altimist.com` issuer is refused. An allowlist entry admits its exact host and hosts exactly one label under it: `altimist.ai` admits `nathan.altimist.ai` but not `alice.staging.altimist.ai`. On staging, set the environment variables below to the `staging.altimist.ai` hosts; with `ALTIMIST_RESOLVER_DOMAIN=staging.altimist.ai` the default allowlist is `staging.altimist.ai`, which admits `<handle>.staging.altimist.ai`, so `ALTIMIST_ALLOWED_ISSUERS` can stay unset.

## What this is

- **The ADR-031 pattern as a package.** A fail-closed `middleware.ts` choke point,
  a default-deny route policy engine, DB-backed iron-session cookies, VC-derived
  `staff`/`visitor` roles, the hosted-handoff popup login (sign-in + register),
  logout, and session-revocation tooling.
- **Bring-your-own data layer.** The package core has **no** Prisma dependency — it
  talks to a small `AidStore` interface. Use the shipped `prismaStore` adapter for
  the canonical schema, or implement `AidStore` against any database.
- **No UI.** The package ships the tricky popup/`postMessage` login *behaviour*
  (framework-agnostic, on `/browser`); your design system renders the components.

## What this is *not*

- **Not** `@altimist/did-web-client`. That library is the verification primitive
  (DID + VC checks); this one is the full consumer integration that *uses* it.
- **Not** an OAuth/OIDC server. Sign-in is a hosted handoff to Altimist ID (`id.altimist.ai`, where
  the passkey ceremony runs); everything else is local to your app.
- **Not** owner of your database schema. You own your `schema.prisma`, migrations,
  and Prisma client.

## Quick start

A greenfield app wires up in a handful of one-line files.

**1. One module assembles everything:**

```ts
// src/lib/aid.ts
import { createAid, configFromEnv } from '@altimist/altimist-id-consumer';
import { prismaStore } from '@altimist/altimist-id-consumer/prisma';
import { prisma } from './prisma';

export const aid = createAid({
  ...configFromEnv(),              // SESSION_PASSWORD, ALTIMIST_*, API_KEY_HASH*
  store: prismaStore(prisma),      // the data seam — canonical schema → no adapter code
  policy: {
    staffOnlyPages: ['/admin'],
    visitorGetAllowlist: ['/api/public-thing'],
  },
});
```

**2. The middleware choke point:**

```ts
// middleware.ts
import { aid } from '@/lib/aid';

export const middleware = aid.middleware;

// Next requires `config` to be a STATIC object literal — it cannot read a runtime
// value (so `export const config = aid.middlewareConfig` does NOT work). The
// `runtime: 'nodejs'` is load-bearing: without it the middleware runs on Edge,
// where the verification deps can't load. Copy this literal verbatim.
export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sw.js|.*\\.(?:svg|png|ico|jpg|jpeg|webp|gif|js|css|map|txt|woff2?|webmanifest)$).*)',
  ],
};
```

> `aid.middlewareConfig` exposes the same `{ runtime, matcher }` for reference, but
> Next's static analysis means you must write the literal above in `middleware.ts`.

**3. The auth routes (one line each, mounted at the canonical paths):**

```ts
// app/api/auth/altimist/handoff/init/route.ts   → export const { POST } = aid.routes.handoffInit;
// app/api/auth/altimist/register/init/route.ts  → export const { POST } = aid.routes.registerInit;  (optional)
// app/api/auth/altimist/verify/route.ts         → export const { POST } = aid.routes.verify;
// app/api/auth/logout/route.ts                  → export const { POST } = aid.routes.logout;
// app/api/auth/me/route.ts                       → export const { GET }  = aid.routes.me;
// app/auth/altimist/callback/route.ts            → export const { GET }  = aid.routes.callback;
```

**4. Your login UI calls the popup logic:**

```tsx
'use client';
import { runAltimistSignIn } from '@altimist/altimist-id-consumer/browser';
// your design-system <LoginForm> calls runAltimistSignIn({ handle, onError, onSuccess })
```

## The data seam

The core never imports Prisma; it depends on this interface:

```ts
interface AidStore {
  createSession(s): Promise<void>;
  findSessionByToken(token): Promise<{ userId; role; expiresAt } | null>;
  deleteSession(token): Promise<void>;
  deleteSessionsByHandle(handle): Promise<number>;
  deleteAllSessions(): Promise<number>;
  findUserByDid(did): Promise<{ id; handle; role } | null>;
  findUserById(id): Promise<{ id; handle; role } | null>;
  createUser(u): Promise<{ id }>;
  updateUser(id, data): Promise<void>;
  writeAudit(e): Promise<void>;
}
```

`prismaStore(prisma)` implements it against the canonical schema. A consumer whose
schema differs (e.g. mission-control) writes a ~40-line adapter mapping its own
tables.

## Canonical Prisma schema

Copy into your `schema.prisma` to use `prismaStore` with no adapter code:

```prisma
model User {
  id        String    @id @default(cuid())
  did       String    @unique
  handle    String
  role      String    // 'staff' | 'visitor' — recomputed each sign-in
  createdAt DateTime  @default(now())
  lastLogin DateTime?
  sessions  Session[]
}
model Session {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      String
  expiresAt DateTime
  createdAt DateTime @default(now())
}
model AuthAuditLog {
  id        String   @id @default(cuid())
  event     String
  outcome   String
  metadata  Json?
  createdAt DateTime @default(now())
  @@index([event, createdAt])
}
```

## Environment

| Var | Purpose |
|---|---|
| `SESSION_PASSWORD` | iron-session sealing key (≥32 chars, **required**) |
| `ALTIMIST_APP_ID` | matches your Altimist ID `AppPolicy.appId` |
| `ALTIMIST_ALLOWED_ISSUERS` | comma-separated `did:web` hosts (federation); each admits its exact host and hosts exactly one label under it. Defaults to the resolver domain (`altimist.ai`; staging `staging.altimist.ai`) |
| `ALTIMIST_RESOLVER_DOMAIN` | home domain for DIDs (default `altimist.ai`; staging `staging.altimist.ai`) |
| `ALTIMIST_RP_ID` | RP ID the assertion is bound to (default `id.altimist.ai`; staging `id.staging.altimist.ai`) |
| `ALTIMIST_ORIGIN` | comma-separated origins the assertion may come from (default `https://id.altimist.ai`; staging `https://id.staging.altimist.ai`) |
| `ALTIMIST_RELEASE_BASE_URL` | Altimist ID origin for the handoff and VC release (default `https://id.altimist.ai`; staging `https://id.staging.altimist.ai`) |
| `SIGNED_KEY_LIST_URL` | https URL of Resolver D's signed key list (F-040 rev 15 D-6; **required**, no default). Production `https://altimist.com/.well-known/signed-key-list.json`; staging `https://altimist.dev/.well-known/signed-key-list.json` |
| `SIGNED_KEY_LIST_PUBLIC_JWKS` | the pinned list keys, a JSON array of public JWKs, each exactly `{"kty":"OKP","crv":"Ed25519","x":"…"}` (**required**, no default; an interim departure from F-040 rev 15 D-4, which pins the trust anchor in `@altimist/did-web-client`: until it does, whoever sets this sets the revocation trust root; any other member, `d` included, refuses to start) |
| `ALTIMIST_REVOCATIONS_URL` | https URL of Altimist ID's revocation list (default production's `https://altimist.com/.well-known/revocations.json`; staging `https://id.staging.altimist.ai/api/resolver/revocations`) |
| `API_KEY_HASH`, `API_KEY_HASH_SALT` | optional M2M X-API-Key gate |

Every sign-in fetches the dead-key list and verifies it against the pinned list
keys (did-web-client's `verifySignedKeyList`, used with the `settlement` intent).
If the list is missing, malformed, badly signed, expired or older than one this
process already accepted, sign-in is refused with `key_list_unverified` (HTTP
503); it never proceeds as if the list were empty. A bridge key on the list is
refused as `invalid_jwt` / `key-revoked` (HTTP 401).

Every sign-in also reads Altimist ID's revocation list at `ALTIMIST_REVOCATIONS_URL`
(no cache, 5 s timeout). A kid on either list is revoked (PL263, F-040 rev 15
D-6): if `sha256("device:" + kid)` (lowercase hex, the bare kid) is in its
`revoked` array, sign-in is refused as `key-revoked`. If it cannot be read, or
`revoked` is not an array of 64-character lowercase hex strings, sign-in is
refused with `key_list_unverified` / `revocations` (HTTP 503). Staging must set
its own URL: production's list does not name staging's revoked devices.

You must also register an `AppPolicy` on Altimist ID for your app (`appId`,
`redirectOrigins` pointing at `https://<your-domain>/auth/altimist/callback`, and
`signupOrigins` if you allow self-service register). Node-runtime middleware
requires **Next.js ≥ 15.5**.

## Development

```bash
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run build       # tsc to dist/
```

## License

UNLICENSED — internal Altimist.
