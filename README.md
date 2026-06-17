# `@altimist/altimist-id-consumer`

Add AltimistID authentication to a Next.js app the way [ADR-031](https://github.com/altimist/altimist-strategy/blob/main/decisions/ADR-031-altimistid-consumer-middleware-choke-point.md) prescribes — one Node-runtime middleware choke point doing DB-backed session validation plus a **default-deny** route policy, with roles derived from verifiable credentials — without copying a dozen files between apps.

```bash
npm install @altimist/altimist-id-consumer @altimist/did-web-client iron-session
```

> **Status:** `0.x`, initial development. The API may change until mission-control
> migrates onto it (mc#336). See [`docs/specs/F-001-altimist-id-consumer-package.md`](./docs/specs/F-001-altimist-id-consumer-package.md).

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
- **Not** an OAuth/OIDC server. Sign-in is a hosted handoff to altimist.id (where
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
| `ALTIMIST_APP_ID` | matches your altimist.id `AppPolicy.appId` |
| `ALTIMIST_ALLOWED_ISSUERS` | comma-separated `did:web` host eTLD+1s (federation; defaults to `altimist.com`) |
| `API_KEY_HASH`, `API_KEY_HASH_SALT` | optional M2M X-API-Key gate |

You must also register an `AppPolicy` on altimist.id for your app (`appId`,
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
