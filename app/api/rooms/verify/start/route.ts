/**
 * POST /api/rooms/verify/start
 *   { phone } → { ok, otpRequired }
 *
 * Sends an SMS verification code (Twilio Verify) before creating a room or
 * joining an ad-hoc user room. Public per-event rooms do NOT use this — they
 * join openly. Fails closed in prod without Twilio; MAYFLY_ALLOW_UNVERIFIED=true
 * or SPIN_ALLOW_UNVERIFIED=true bypasses for local dev.
 */
import { parseJsonBody } from '@/lib/http';
import { normalizePhoneUS } from '@/lib/phone';
import {
  sendCode,
  isVerifyConfigured,
  isOtpBypassAllowed,
} from '@/lib/mayfly/server/twilio-verify';
import { consumeRateLimit } from '@/lib/mayfly/server/phone-gate';

const SCOPE = 'rooms.verify.start';
const MAX_SENDS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const [body, err] = await parseJsonBody(request);
  if (err) return err;

  const b = body as Record<string, unknown> | null;
  const phone = normalizePhoneUS(b?.phone);
  if (!phone) {
    return Response.json({ error: 'Please enter a valid US phone number.' }, { status: 400 });
  }

  if (!isVerifyConfigured()) {
    if (isOtpBypassAllowed()) {
      return Response.json({ ok: true, otpRequired: false });
    }
    return Response.json(
      { error: 'Verification is temporarily unavailable. Please try again soon.' },
      { status: 503 }
    );
  }

  const limited = await consumeRateLimit(request, phone, SCOPE, {
    max: MAX_SENDS,
    windowMs: WINDOW_MS,
  });
  if (limited) return limited;

  const r = await sendCode(phone);
  if (!r.ok) {
    return Response.json(
      { error: r.error || 'Could not send a code. Please try again.' },
      { status: 502 }
    );
  }
  return Response.json({ ok: true, otpRequired: true });
}
