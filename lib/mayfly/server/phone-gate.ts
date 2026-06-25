/**
 * Shared phone-gate helpers for the Mayfly room API routes.
 *
 * Each helper returns either `null` (proceed) or a `Response` (stop + return it)
 * so route handlers stay flat.
 */
import { checkCode, isVerifyConfigured, isOtpBypassAllowed } from './twilio-verify';
import {
  checkServerRateLimit,
  recordServerRateLimitHit,
  clientIpKey,
  hashedRateLimitKey,
  rateLimitResponse,
} from './rate-limit';

const TOO_MANY = 'Too many attempts. Please wait a few minutes.';

/** Rate-limit by caller IP (+ phone when present). Returns null or a Response. */
export async function consumeRateLimit(
  request: Request,
  phone: string | null,
  scope: string,
  { max = 8, windowMs = 10 * 60 * 1000 }: { max?: number; windowMs?: number } = {}
): Promise<Response | null> {
  const keys: string[] = [clientIpKey(request)];
  if (phone) keys.push(await hashedRateLimitKey('phone', phone));
  try {
    for (const key of keys) {
      const check = await checkServerRateLimit({ scope, key, max, windowMs });
      if (!check.ok) return rateLimitResponse(TOO_MANY, check);
    }
    for (const key of keys) {
      const consume = await recordServerRateLimitHit({ scope, key, max, windowMs });
      if (!consume.ok) return rateLimitResponse(TOO_MANY, consume);
    }
  } catch (err) {
    console.error(`[rooms ${scope}] rate limit failed:`, (err as Error)?.message);
    return Response.json({ error: 'Service unavailable. Please try again soon.' }, { status: 503 });
  }
  return null;
}

/**
 * Verify an OTP for a phone. Returns null on success (incl. the dev bypass), or
 * a Response describing the failure. Fails CLOSED in prod when Twilio is unset.
 */
export async function verifyOtpOrReject(phone: string, code: unknown): Promise<Response | null> {
  if (isVerifyConfigured()) {
    if (!code) {
      return Response.json({ error: 'Enter the code we texted you.' }, { status: 400 });
    }
    const v = await checkCode(phone, String(code));
    if (!v.ok) {
      return Response.json({ error: v.error || 'Wrong code.', code: v.code }, { status: 400 });
    }
    return null;
  }
  if (isOtpBypassAllowed()) {
    console.warn('[rooms] Twilio not configured; OTP bypass explicitly allowed');
    return null;
  }
  return Response.json(
    { error: 'Verification is temporarily unavailable. Please try again soon.' },
    { status: 503 }
  );
}

const ROOM_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const PUBKEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function isValidRoomId(s: unknown): boolean {
  return typeof s === 'string' && ROOM_ID_RE.test(s);
}
export function isValidPubKey(s: unknown): boolean {
  return typeof s === 'string' && PUBKEY_RE.test(s);
}
