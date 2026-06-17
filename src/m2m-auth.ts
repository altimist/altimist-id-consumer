/**
 * Machine-to-machine X-API-Key gate (SHA-256 hashed key + salt, per-IP failure
 * rate limiting, fail-closed 503 when unconfigured). Used by the choke point for
 * the consumer's M2M paths. Takes the `m2m` config instead of reading env.
 *
 * Returns `null` when the request passes; otherwise the NextResponse to send.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export interface M2mConfig {
  apiKeyHash: string;
  apiKeyHashSalt: string;
}

interface FailedAttempt {
  count: number;
  firstFailure: number;
  blockedUntil: number;
}

const failedAttempts = new Map<string, FailedAttempt>();

const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const BLOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function isRateLimited(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;

  const now = Date.now();
  if (entry.blockedUntil > now) return true;
  if (now - entry.firstFailure > WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return false;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(ip);

  if (!entry || now - entry.firstFailure > WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, firstFailure: now, blockedUntil: 0 });
    return;
  }

  entry.count++;
  if (entry.count >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_DURATION_MS;
    console.warn(
      `[AUTH] IP ${ip} blocked for ${BLOCK_DURATION_MS / 60000} minutes after ${entry.count} failed attempts`,
    );
  }
}

let lastCleanup = Date.now();
function cleanupExpired(): void {
  const now = Date.now();
  if (now - lastCleanup < 60000) return;
  lastCleanup = now;
  for (const [ip, entry] of failedAttempts) {
    if (now - entry.firstFailure > WINDOW_MS && entry.blockedUntil < now) {
      failedAttempts.delete(ip);
    }
  }
}

async function hashApiKey(key: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function checkApiKey(
  request: NextRequest,
  m2m: M2mConfig | undefined,
): Promise<NextResponse | null> {
  if (!m2m) {
    console.error('[AUTH] M2M paths configured but no m2m { apiKeyHash, apiKeyHashSalt } set');
    return NextResponse.json({ error: 'Server authentication not configured' }, { status: 503 });
  }

  const ip = getClientIp(request);
  cleanupExpired();

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many failed attempts. Try again later.' }, { status: 429 });
  }

  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    recordFailure(ip);
    console.warn(`[AUTH] Missing API key from ${ip} - ${request.method} ${request.nextUrl.pathname}`);
    return NextResponse.json({ error: 'API key required' }, { status: 401 });
  }

  const hash = await hashApiKey(apiKey, m2m.apiKeyHashSalt);
  if (hash !== m2m.apiKeyHash) {
    recordFailure(ip);
    console.warn(`[AUTH] Invalid API key from ${ip} - ${request.method} ${request.nextUrl.pathname}`);
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  return null;
}

/** Test-only: clear the failure tracker between cases. */
export function __resetM2mFailures(): void {
  failedAttempts.clear();
}
