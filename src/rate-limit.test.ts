import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, __resetRateLimits } from './rate-limit.js';

beforeEach(() => __resetRateLimits());

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('k', 10, 60_000).ok).toBe(true);
    }
  });

  it('blocks once the limit is reached, with a Retry-After', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('k', 10, 60_000);
    const r = checkRateLimit('k', 10, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('a', 10, 60_000);
    expect(checkRateLimit('a', 10, 60_000).ok).toBe(false);
    expect(checkRateLimit('b', 10, 60_000).ok).toBe(true);
  });

  it('resets after the window elapses', () => {
    expect(checkRateLimit('w', 1, 1).ok).toBe(true);
    // window of 1ms: a tiny wait lets the bucket reset on the next call
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit('w', 1, 1).ok).toBe(true);
        resolve();
      }, 5);
    });
  });
});
