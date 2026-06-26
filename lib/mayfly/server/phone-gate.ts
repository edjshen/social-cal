/**
 * Shared phone-gate helpers for the Mayfly room API routes.
 *
 * Each helper returns either `null` (proceed) or a `Response` (stop + return it)
 * so route handlers stay flat.
 */
import { checkCode, isVerifyConfigured } from './twilio-verify';
import {
  consumeServerRateLimit,
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
    // Atomically count one hit per key; reject on the first key over its limit.
    // (A rejected request may still cost an earlier key a hit — that's the safe
    // direction under abuse.)
    for (const key of keys) {
      const r = await consumeServerRateLimit({ scope, key, max, windowMs });
      if (!r.ok) return rateLimitResponse(TOO_MANY, r);
    }
  } catch (err) {
    console.error(`[rooms ${scope}] rate limit failed:`, (err as Error)?.message);
    return Response.json({ error: 'Service unavailable. Please try again soon.' }, { status: 503 });
  }
  return null;
}

/**
 * Verify an OTP for a phone. Returns null on success, or a Response describing
 * the failure. Fails CLOSED when Twilio Verify is not configured.
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
