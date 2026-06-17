// Public entry — the Node core. Imports neither @prisma/client nor react
// (pinned by the purity test). The Prisma adapter is at `./prisma`; the popup
// login helpers are at `./browser`.

export { createAid, type Aid } from './create-aid.js';
export { configFromEnv, type AidConfig } from './config.js';
export { AID_PATHS } from './paths.js';

export type {
  AidStore,
  AuthEvent,
  UserRecord,
  SessionRecord,
} from './store.js';
export type { Role, Caller, PolicyDecision } from './policy.js';
export type { VerifyOutcome } from './verify.js';
export type { ActiveSession, SessionCookie } from './session.js';
export type { AidRoutes, RouteHandler } from './routes.js';
