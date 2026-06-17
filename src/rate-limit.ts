/**
 * Per-key fixed-window rate limiter for the public auth endpoints (in-memory;
 * single-instance model). Bounds handle enumeration on the init routes and
 * brute-force on verify. Returns the decision so the caller shapes the 429.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;

export function checkRateLimit(
  key: string,
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count++;
  return { ok: true, retryAfterSeconds: 0 };
}

/** Test-only: clear all buckets between cases. */
export function __resetRateLimits(): void {
  buckets.clear();
}
