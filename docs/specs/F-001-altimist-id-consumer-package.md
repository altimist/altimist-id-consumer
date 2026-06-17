# F-001 — `@altimist/altimist-id-consumer`

> Spec for the consumer-side AltimistID auth package. Tracks **mission-control #283**.
> Embodies **ADR-031** (Node-runtime middleware choke point). Reference
> implementation: `trading-journal` F-001 (`src/lib/altimist-id/`).

---

## Status

Accepted — decisions #1–#5 settled 2026-06-16, refinements 2026-06-17.
Implementation in progress on `feat/F-001-altimist-id-consumer-package`.

## Context

AltimistID is the org's identity rail. ADR-031 names the canonical way a Next.js
app enforces it: **one Node-runtime `middleware.ts` choke point** that does
DB-backed session validation plus a **default-deny** route policy, with roles
derived from VC presence. The journal (F-001) is the reference implementation and
is **live** on `chicago.altimistcapital.ai`. A greenfield Next.js app must be able
to `npm install` this pattern and wire up AltimistID auth with minimal work,
instead of copying ~18 files and keeping them in sync.

This package is the **consumer-side** library, exactly as `@altimist/did-web-client`
is the consumer-side verifier for F-010. It **depends on** `@altimist/did-web-client`
for the cryptographic primitives and never calls altimist.id on the request path
(same invariant).

`mission-control` is consumer #1 but still on the old Edge pattern (its ADR-031
migration is mc#336, not done). So this API is informed by **one** real Option-A
consumer (the journal, thin soak). The API is therefore **0.x** — churn expected
when mc migrates; design for that (see Non-goals + Versioning).

## User stories

- **US-1 — Greenfield integrator.** As a developer starting a new Next.js app, I
  install the package, copy 3 Prisma models, write a handful of one-line files,
  set env, register an AppPolicy, and have ADR-031 auth working.
- **US-2 — Default-deny by construction.** As that developer, any new route I add
  is staff-only until I deliberately expose it; I cannot forget to guard a route.
- **US-3 — Bring-your-own data layer.** As an integrator whose schema differs
  (e.g. mission-control), I implement a small `AidStore` against my existing
  tables instead of being forced onto package-dictated models.
- **US-4 — Own my UI.** As an integrator using the Altimist Design System, I get
  the tricky popup/postMessage login *behaviour* from the package but render the
  login/logout UI from the design system.
- **US-5 — Operate it.** As an operator, I can revoke a user's sessions and have
  it bite on their next request (DB-backed validation).

## Goals

- Ship the ADR-031 pattern as an installable package: Node-runtime middleware
  choke point + default-deny policy engine + DB-backed iron-session + VC-derived
  roles + hosted-handoff popup login (sign-in + register) + logout + revoke tooling.
- Consumer supplies only: **config**, a **data-layer adapter**, and their **route
  classification**. Everything else is the package.
- Faithful extraction: behaviour identical to the journal's shipped F-001. The
  journal's 116 tests port over (running against an in-memory store) as the proof.
- Stay dependency-light: the **core has no Prisma and no React dependency**
  (mirrors did-web-client's discipline).

## Non-goals

- **Not** migrating mission-control or the trading-journal in this work (journal
  is live — left untouched; mc migration is mc#336).
- **Not** shipping styled UI components — the Altimist Design System owns those.
- **Not** a 1.0 stable API — `0.x`, with the explicit expectation that mc's
  migration will refine the `AidStore` and config shapes.
- **Not** owning the consumer's database schema or migrations.

---

## Decisions (settled 2026-06-16)

1. **Data-layer seam = repository port + shipped adapter.** The package core
   defines an `AidStore` interface and never imports Prisma. An optional
   `@altimist/altimist-id-consumer/prisma` subpath ships `prismaStore(prisma)` —
   a ready-made adapter for the canonical schema, so the common case needs no
   adapter code. (Rejected: injecting a Prisma client — unchecked runtime
   contract, version-couples the package, breaks for mc's differing schema.
   Rejected: package-owned models — fights Prisma's single-client model, forces a
   destructive migration on the live journal.)
2. **Export surface = core + factories + `/prisma` + `/browser`, no styled UI.**
   Middleware factory, route-handler factories, the policy engine, and the
   headless popup-login functions — but the visual components come from the
   design system.
3. **Config = object + `configFromEnv()` helper.** Explicit config object is the
   source of truth (testable, no leaking defaults); `configFromEnv()` reads the
   ADR-mandated env names for ergonomics. `SESSION_PASSWORD` is required (≥32).
4. **New repo** `altimist/altimist-id-consumer`, mirroring `did-web-client`.
5. **Dogfood = throwaway validation app.** A minimal scratch Next.js project on a
   small subdomain (+ its own altimist.id AppPolicy) proves the package
   end-to-end; then publish `v0.1.0`. The live journal is not touched.

### Refinements (settled 2026-06-17)

- **JIT race handled in the core, Prisma-agnostically.** The journal's
  `isUniqueConstraintError` (which inspects Prisma's `P2002` code) is **removed**.
  The core instead does `createUser` → on *any* rejection, re-fetch
  `findUserByDid`; if the row now exists, treat as returning; else rethrow. The
  core never inspects error codes ⇒ **core stays Prisma-free** (guarded by AC-4).
- **Port methods are dumb I/O.** `AidStore` methods just perform the DB op and may
  throw; the **core** owns error policy (audit writes best-effort/swallowed,
  session validation fail-closed, expiry-delete failures ignored). Adapter authors
  never need to know which calls may fail.
- **Routes fixed + exported as `AID_PATHS` constants**, shared by the policy engine
  and the `/browser` helpers (no duplicated magic strings). Configurability is
  rejected for v0.1: a path-vs-policy misalignment would silently 401 the
  anonymous sign-in — the exact footgun ADR-031 exists to remove. A `paths`
  override (threaded to both `createAid` and the browser helpers) is a clean future
  addition if ever needed.
- **Register flow optional.** A consumer that disallows self-service register
  simply doesn't mount `registerInit` and renders no register button; `register/init`
  remaining in the public-path set is harmless (unmounted ⇒ 404).
- **`User.handle` is not unique** in the canonical schema (only `did` is), so
  `deleteSessionsByHandle` is a `deleteMany` — it revokes every session for that
  handle. Desirable for an operator tool; documented, not enforced.

---

## Public interface

ESM-only, three subpath exports (mirrors did-web-client's `.` / `./browser`):

| Subpath | Runtime | Purpose | Peer deps |
|---|---|---|---|
| `.` | Node | core: config, policy engine, middleware + route factories, session/verify | `next` (≥15.5) |
| `./prisma` | Node | `prismaStore(prisma)` canonical `AidStore` adapter + `revokeSessions` | `@prisma/client` |
| `./browser` | Browser | `runAltimistSignIn` / `runAltimistRegister` popup logic (no React) | — |

Direct deps: `@altimist/did-web-client@^0.7.2`, `iron-session`, `zod`.

### Core (`.`)

```ts
// The one seam the consumer plugs storage into. Package core imports nothing
// from Prisma; this is a plain interface.
export interface AidStore {
  createSession(s: { token: string; userId: string; role: Role; expiresAt: Date }): Promise<void>;
  findSessionByToken(token: string): Promise<{ userId: string; role: Role; expiresAt: Date } | null>;
  deleteSession(token: string): Promise<void>;
  deleteSessionsByHandle(handle: string): Promise<number>;
  deleteAllSessions(): Promise<number>;
  findUserByDid(did: string): Promise<{ id: string; handle: string; role: Role } | null>;
  findUserById(id: string): Promise<{ id: string; handle: string; role: Role } | null>;
  createUser(u: { did: string; handle: string; role: Role; lastLogin: Date }): Promise<{ id: string }>;
  updateUser(id: string, data: { role: Role; handle: string; lastLogin: Date }): Promise<void>;
  writeAudit(e: { event: AuthEvent; outcome: 'success' | 'fail'; metadata: object }): Promise<void>;
}

export type Role = 'staff' | 'visitor';

export interface AidConfig {
  store: AidStore;                       // required — the data seam
  sessionPassword?: string;              // ≥32 chars; usually via configFromEnv(); runtime-validated
  appId?: string;                        // matches an altimist.id AppPolicy.appId; usually via env
  // identity / verification (all defaulted to the altimist.id production values)
  allowedIssuers?: readonly string[];    // eTLD+1 hosts; default [resolverDomain]
  resolverDomain?: string;               // default 'altimist.com'
  rpId?: string;                         // default 'altimist.id'
  origins?: string[];                    // default ['https://altimist.id']
  altimistIdBaseUrl?: string;            // default 'https://altimist.id'
  releaseEndpoint?: string;              // default `${altimistIdBaseUrl}/api/release/vcs`
  // session TTLs
  staffTtlSeconds?: number;              // default 7d
  visitorTtlSeconds?: number;            // default 24h
  // role derivation
  team?: string;                         // default 'altimist'
  staffScopes?: string[];                // default ['staff.admin','staff.member']
  // M2M (optional) — the X-API-Key gate for sync routes
  m2m?: { apiKeyHash: string; apiKeyHashSalt: string };
  // route classification — the consumer's OWN routes; package owns its auth routes
  policy?: {
    publicPaths?: string[];
    m2mPaths?: string[];
    staffOnlyPages?: string[];
    visitorGetAllowlist?: string[];      // patterns; `[seg]` = one dynamic segment
  };
  // optional middleware matcher override (sensible default provided)
  matcher?: string[];
}

export function configFromEnv(): Partial<AidConfig>;   // reads SESSION_PASSWORD, ALTIMIST_* , API_KEY_HASH*
export function createAid(config: AidConfig): Aid;

export interface Aid {
  // Next.js middleware binding
  middleware: (req: NextRequest) => Promise<NextResponse>;
  middlewareConfig: { runtime: 'nodejs'; matcher: string[] };
  // route-handler factories (mount at the canonical paths — see below)
  routes: {
    handoffInit: { POST: RouteHandler };
    registerInit: { POST: RouteHandler };
    verify: { POST: RouteHandler };
    logout: { POST: RouteHandler };
    me: { GET: RouteHandler };
    callback: { GET: RouteHandler };
  };
  // operator + escape hatches
  revokeSessions(handleOrAll: string): Promise<number>;
  verifyAndSignIn(bridgeJwt: string): Promise<VerifyOutcome>;
  getSession(sealed: string | undefined): Promise<ActiveSession | null>;
  evaluate(method: string, pathname: string, caller: Caller): PolicyDecision;
}
```

**Canonical route paths** the factories expect to be mounted at (fixed; the
`/browser` helpers call these):

```
app/api/auth/altimist/handoff/init/route.ts   → export const { POST } = aid.routes.handoffInit
app/api/auth/altimist/register/init/route.ts  → export const { POST } = aid.routes.registerInit
app/api/auth/altimist/verify/route.ts         → export const { POST } = aid.routes.verify
app/api/auth/logout/route.ts                  → export const { POST } = aid.routes.logout
app/api/auth/me/route.ts                       → export const { GET }  = aid.routes.me
app/auth/altimist/callback/route.ts            → export const { GET }  = aid.routes.callback
middleware.ts                                  → export const middleware = aid.middleware;
                                                 export const config = { runtime: 'nodejs', matcher: [...] }  // STATIC literal
```

> **Dogfood finding (2026-06-17):** Next's static analysis cannot read a runtime
> value for the middleware `config`, so `export const config = aid.middlewareConfig`
> fails the build (and silently falls back to Edge, where the verification deps
> can't load). The consumer must write a static `{ runtime: 'nodejs', matcher: [...] }`
> literal. `aid.middlewareConfig` remains as a reference value only.

### `/prisma`

```ts
export function prismaStore(prisma: PrismaLike): AidStore;
```

Assumes the canonical models (below). `PrismaLike` is a minimal structural type
(not an `@prisma/client` import), so the package builds with no Prisma dependency
and no `prisma generate` step; a real `PrismaClient` satisfies it structurally.

### `/browser`

```ts
export function runAltimistSignIn(opts: {
  handle: string;
  onError: (message: string) => void;
  onSuccess: (next: string) => void;        // caller does router.replace(next)
  onConsentRequired?: (consentUrl: string) => void;
  next?: string | null;
}): Promise<void>;

export function runAltimistRegister(opts: { onError; onSuccess; onConsentRequired? }): Promise<void>;
```

The ~90 lines of popup + `postMessage` orchestration (origin/state validation,
mobile + popup-blocked fallbacks, post to `/verify`), framework-agnostic. The
design system's `<LoginForm>` calls these.

### Canonical Prisma schema (documented; copy into the consumer's `schema.prisma`)

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

---

## Acceptance criteria

1. **AC-1 (port behaviour preserved).** The journal's F-001 test suite, ported to
   run against an in-memory `AidStore`, passes unchanged in semantics (policy,
   session, verify, enforce, m2m, rate-limit, routes, revoke).
2. **AC-2 (default-deny).** An unclassified GET route → 401 (anon) / 403 (visitor);
   any non-GET (outside M2M + auth-session paths) → staff-only. Verified by tests.
3. **AC-3 (immediate revocation).** Deleting a session via `revokeSessions` causes
   the next request to be treated as anonymous. Verified by test.
4. **AC-4 (core purity).** The `.` entry imports neither `@prisma/client` nor
   `react`. Verified by a build/import test (mirrors did-web-client's purity tests).
5. **AC-5 (Prisma adapter round-trips).** `prismaStore` against the canonical
   schema satisfies `AidStore` and passes the same store contract tests as the
   in-memory store.
6. **AC-6 (greenfield wiring).** The throwaway validation app integrates via the
   documented one-line files + canonical schema + env, and proves: anon→/login,
   API→401, public passthrough locally; full passkey sign-in + register + logout
   on its deployed origin.
7. **AC-7 (build/publish).** `tsc`→`dist`, `prepublishOnly` runs tests + build,
   published as `@altimist/altimist-id-consumer@0.1.0`, public access.

---

## Extraction map (what moves, what changes)

| Journal file | Package destination | Change |
|---|---|---|
| `policy.ts` | core | engine kept; hardcoded lists → consumer `config.policy` (package owns auth-route entries) |
| `enforce.ts` | core | `prisma`/config globals → `AidConfig` closure |
| `session.ts` | core | `import { prisma }` → `config.store`; `SESSION_PASSWORD`/TTL → config |
| `verify.ts` | core | `import { prisma }` → `config.store`; `STAFF_*`/`TEAM` → config |
| `audit.ts` | core | `import { prisma }` → `config.store.writeAudit` |
| `m2m-auth.ts` | core | `API_KEY_HASH*` env → `config.m2m` |
| `rate-limit.ts`, `handoff-cookie.ts`, `handoff-shared.ts` | core | file-move |
| `config.ts` | core | becomes `configFromEnv()` + defaults |
| 6 route handlers | `routes.*` factories | logic → factory; consumer file = one-line re-export |
| `middleware.ts` | `aid.middleware` + `middlewareConfig` | thin binding |
| `login-form.tsx` (popup logic) | `/browser` functions | React stripped; markup → design system |
| `LogoutButton.tsx` | (design system) | not shipped (logout = POST + redirect) |
| `revoke-sessions.ts` | `aid.revokeSessions` | consumer script = 3-line wrapper |
| `User`/`Session`/`AuthAuditLog` models | documented snippet + `prismaStore` assumption | not owned by package |

---

## Plan

1. Create repo `altimist/altimist-id-consumer` from the Altimist template; sync
   baseline CLAUDE.md; add this spec at `docs/specs/F-001-...md`.
2. Extract core + `/prisma` + `/browser`; define `AidStore`; build factories.
3. Port the journal's 116 tests onto the in-memory store; add store-contract tests
   run against both in-memory and `prismaStore`; add the core-purity test.
4. `tsc` clean, all tests green.
5. **Dogfood:** scratch Next.js app → install package → canonical schema → one-line
   files → env → altimist.id AppPolicy for its subdomain → verify AC-6.
6. Publish `v0.1.0` (altimistdev + 2FA, public).
7. Fabio's project (and any future greenfield) consumes `v0.1.0`.

## Risks / open items

- **Node-middleware bundling.** Must confirm the target deployment bundles the
  consumer's `prismaStore` (Prisma import) inside Node-runtime middleware (the
  journal's #1 deploy risk; ADR-031 follow-up). The throwaway app validates this.
- **did-web-client version drift.** Pin `^0.7.2`; the package re-exports nothing
  from it (consumer depends on it directly only if they need primitives).
- **API churn from mc.** `AidStore` and `config.policy` shapes may change when mc
  migrates (mc#336). Kept `0.x`; document the expectation.
- **AppPolicy prerequisite.** Each consumer still needs its own altimist.id
  AppPolicy row (appId + redirectOrigins + signupOrigins) and env — unchanged from
  ADR-031; documented in the README.
- **Throwaway app domain.** Needs a real deployed origin for the passkey ceremony
  (localhost can't run it). Small subdomain + AppPolicy PR.
