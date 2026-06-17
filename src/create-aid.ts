/**
 * `createAid(config)` — assembles the whole integration from a single config:
 * the Node-runtime middleware binding, the route-handler factories, the
 * revoke-sessions operator helper, and lower-level escape hatches.
 */
import type { NextRequest, NextResponse } from 'next/server';
import { resolveConfig, type AidConfig, type ResolvedConfig } from './config.js';
import { enforce } from './enforce.js';
import { createRoutes, type AidRoutes } from './routes.js';
import { verifyAndSignIn, type VerifyOutcome } from './verify.js';
import { getSession, type ActiveSession } from './session.js';
import { evaluate, type Caller, type PolicyDecision } from './policy.js';

export interface Aid {
  /** Bind in `middleware.ts`: `export const middleware = aid.middleware`. */
  middleware: (req: NextRequest) => Promise<NextResponse>;
  /**
   * Reference values for the middleware `config`. NOTE: Next requires `config` to
   * be a STATIC object literal, so you cannot do `export const config =
   * aid.middlewareConfig`. Copy the `{ runtime: 'nodejs', matcher: [...] }` literal
   * into your `middleware.ts` (see the README). This field is for reference only.
   */
  middlewareConfig: { runtime: 'nodejs'; matcher: string[] };
  /** Route-handler factories; mount each at its canonical path (one-line re-export). */
  routes: AidRoutes;
  /** Operator: delete a user's sessions (or `--all`); bites on the next request. */
  revokeSessions(handleOrAll: string): Promise<number>;
  // escape hatches
  verifyAndSignIn(bridgeJwt: string): Promise<VerifyOutcome>;
  getSession(sealed: string | undefined): Promise<ActiveSession | null>;
  evaluate(method: string, pathname: string, caller: Caller): PolicyDecision;
}

export function createAid(config: AidConfig): Aid {
  const cfg: ResolvedConfig = resolveConfig(config);

  return {
    middleware: (req) => enforce(req, cfg),
    middlewareConfig: { runtime: 'nodejs', matcher: cfg.matcher },
    routes: createRoutes(cfg),
    revokeSessions: (arg) => revoke(cfg, arg),
    verifyAndSignIn: (bridgeJwt) => verifyAndSignIn(cfg, bridgeJwt),
    getSession: (sealed) => getSession(cfg, sealed),
    evaluate: (method, pathname, caller) => evaluate(method, pathname, caller, cfg.policy),
  };
}

async function revoke(cfg: ResolvedConfig, arg: string): Promise<number> {
  if (!arg) throw new Error('usage: revokeSessions(<handle>|--all)');
  if (arg === '--all') return cfg.store.deleteAllSessions();
  return cfg.store.deleteSessionsByHandle(arg);
}
