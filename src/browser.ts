/**
 * `@altimist/altimist-id-consumer/browser` — the hosted-handoff popup login logic,
 * framework-agnostic (no React). The Altimist Design System's login component
 * calls these; they own the tricky popup + postMessage handshake, origin/state
 * validation, and the mobile / popup-blocked fallbacks.
 *
 * Ported from the trading-journal F-001 login form's `runPopupFlow`.
 */
import { AID_PATHS } from './paths.js';

export interface SignInOptions {
  handle: string;
  /** Called with a user-facing error message. */
  onError: (message: string) => void;
  /** Called on success with the path to navigate to (caller does the routing). */
  onSuccess: (next: string) => void;
  /** Called if altimist.id needs consent; defaults to a full-page redirect. */
  onConsentRequired?: (consentUrl: string) => void;
  /** Where to return after sign-in (validated; defaults to `/`). */
  next?: string | null;
}

export type RegisterOptions = Omit<SignInOptions, 'handle'>;

function safeNext(raw: string | null | undefined): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

function initErrorMessage(error: string | undefined): string {
  if (error === 'rate_limited') return 'Too many sign-in attempts. Wait a moment and try again.';
  return 'Sign-in failed to start. Try again.';
}

function verifyErrorMessage(error: string | undefined): string {
  switch (error) {
    case 'invalid_jwt':
      return 'Sign-in could not be verified. Try again.';
    case 'issuer_not_allowed':
      return "That identity provider isn't accepted here.";
    case 'release_unavailable':
      return 'AltimistID is temporarily unavailable. Try again in a moment.';
    default:
      return 'Sign-in could not be completed. Try again.';
  }
}

function isMobileUserAgent(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse) and (hover: none)').matches;
}

function popupFeatures(width: number, height: number): string {
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
  return `width=${width},height=${height},left=${left},top=${top}`;
}

/** POST an init route; return the handoff/register URL or an error code. */
async function initHandoff(path: string): Promise<{ url: string } | { error?: string }> {
  const res = await fetch(path, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error };
  }
  const data = (await res.json()) as { handoffUrl?: string; registerUrl?: string };
  return { url: (data.handoffUrl ?? data.registerUrl) as string };
}

async function runPopupFlow(handoffUrl: string, opts: SignInOptions | RegisterOptions): Promise<void> {
  const { onError, onSuccess, onConsentRequired, next } = opts;
  const handoff = new URL(handoffUrl);
  const altimistIdOrigin = handoff.origin;
  const state = handoff.searchParams.get('state') ?? '';

  // Mobile: popups are unreliable — go straight to the redirect flow.
  if (isMobileUserAgent()) {
    window.location.assign(handoffUrl);
    return;
  }

  const popupUrl = new URL(handoffUrl);
  popupUrl.searchParams.set('via', 'popup');
  const popupRef = window.open(popupUrl.toString(), 'altimist-handoff', popupFeatures(480, 720));

  // Popup blocked → full-page redirect fallback (the callback route completes it).
  if (!popupRef) {
    window.location.assign(handoffUrl);
    return;
  }

  let messageArrived = false;
  let cleanup = () => {};
  const bridgeJwt = await new Promise<string | null>((resolve) => {
    function onMessage(event: MessageEvent) {
      if (event.source !== popupRef) return;
      if (event.origin !== altimistIdOrigin) return;
      const data = event.data as { type?: string; bridgeJwt?: string; state?: string } | null;
      if (!data || typeof data !== 'object' || data.state !== state) return;
      if (data.type === 'altimist-bridge-jwt' && typeof data.bridgeJwt === 'string') {
        messageArrived = true;
        cleanup();
        resolve(data.bridgeJwt);
      } else if (data.type === 'altimist-cancel') {
        messageArrived = true;
        cleanup();
        resolve(null);
      }
    }
    const closePoll = window.setInterval(() => {
      if (popupRef.closed) {
        cleanup();
        resolve(null);
      }
    }, 500);
    const timeout = window.setTimeout(() => {
      if (!popupRef.closed) popupRef.close();
      cleanup();
      resolve(null);
    }, 5 * 60 * 1000);
    cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(closePoll);
      window.clearTimeout(timeout);
    };
    window.addEventListener('message', onMessage);
  });

  // Grace period to detect a blocker that stubbed window.open then closed.
  await new Promise<void>((r) => setTimeout(r, 150));
  if (popupRef.closed && !messageArrived) {
    cleanup();
    window.location.assign(handoffUrl);
    return;
  }

  if (!bridgeJwt) {
    onError('Sign-in was cancelled. Try again.');
    return;
  }

  const verifyRes = await fetch(AID_PATHS.verify, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bridgeJwt }),
  });
  if (verifyRes.ok) {
    onSuccess(safeNext(next));
    return;
  }
  const body = (await verifyRes.json().catch(() => ({}))) as { error?: string; consentUrl?: string };
  if (body.error === 'consent_required' && body.consentUrl) {
    if (onConsentRequired) onConsentRequired(body.consentUrl);
    else window.location.assign(body.consentUrl);
    return;
  }
  onError(verifyErrorMessage(body.error));
}

export async function runAltimistSignIn(opts: SignInOptions): Promise<void> {
  const normalised = opts.handle.trim().toLowerCase();
  if (!normalised) {
    opts.onError('Enter your AltimistID handle.');
    return;
  }
  let init: { url: string } | { error?: string };
  try {
    init = await initHandoff(AID_PATHS.handoffInit);
  } catch {
    opts.onError(initErrorMessage(undefined));
    return;
  }
  if (!('url' in init)) {
    opts.onError(initErrorMessage(init.error));
    return;
  }
  const url = new URL(init.url);
  url.searchParams.set('handle', normalised);
  url.searchParams.set('autosubmit', '1');
  await runPopupFlow(url.toString(), opts);
}

export async function runAltimistRegister(opts: RegisterOptions): Promise<void> {
  let init: { url: string } | { error?: string };
  try {
    init = await initHandoff(AID_PATHS.registerInit);
  } catch {
    opts.onError(initErrorMessage(undefined));
    return;
  }
  if (!('url' in init)) {
    opts.onError(initErrorMessage(init.error));
    return;
  }
  await runPopupFlow(init.url, opts);
}
