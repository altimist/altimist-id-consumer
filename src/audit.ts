/**
 * Best-effort auth audit trail. Sign-ins, refusals, 403s and logouts write here.
 * The write must never block or fail the request it describes — so the core calls
 * `safeAudit`, which swallows store errors. (The store's `writeAudit` itself is
 * dumb I/O and may throw; the error policy lives here, in the core.)
 */
import type { AidStore, AuthEvent } from './store.js';

export async function safeAudit(
  store: AidStore,
  event: AuthEvent,
  outcome: 'success' | 'fail',
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await store.writeAudit({ event, outcome, metadata: (metadata ?? {}) as object });
  } catch {
    // Swallowed deliberately — auditing is observability, not a gate.
  }
}
