/**
 * POST /api/rooms/verify/start
 *   { phone } → { ok, otpRequired }
 *
 * Sends an SMS verification code (Twilio Verify) before creating a room or
 * joining an ad-hoc user room. Public per-event rooms do NOT use this — they
 * join openly. Fails closed when Twilio Verify is not configured.
 */
import { parseJsonBody } from '@/lib/http';
import { normalizePhoneUS } from '@/lib/phone';
import { sendCode, isVerifyConfigured } from '@/lib/mayfly/server/twilio-verify';
import { consumeRateLimit } from '@/lib/mayfly/server/phone-gate';
import { consumeServerRateLimit } from '@/lib/mayfly/server/rate-limit';

const SCOPE = 'rooms.verify.start';
const MAX_SENDS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SENDS_PER_DAY = 6; // per phone (and per IP) per day — caps harassment
const GLOBAL_MAX_PER_HOUR = 500; // app-wide SMS circuit breaker (toll-fraud cap)

export async function POST(request: Request): Promise<Response> {
  const [body, err] = await parseJsonBody(request);
  if (err) return err;

  const b = body as Record<string, unknown> | null;
  const phone = normalizePhoneUS(b?.phone);
  if (!phone) {
    return Response.json({ error: 'Please enter a valid US phone number.' }, { status: 400 });
  }

  if (!isVerifyConfigured()) {
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

  // Coarse backstops beyond the 10-minute window: a per-phone (and per-IP) daily
  // cap, plus an app-wide hourly ceiling so a distributed attack across many
  // numbers can't run up unbounded Twilio spend.
  const dayLimited = await consumeRateLimit(request, phone, `${SCOPE}.day`, {
    max: MAX_SENDS_PER_DAY,
    windowMs: DAY_MS,
  });
  if (dayLimited) return dayLimited;

  let globalOk = true;
  try {
    globalOk = (
      await consumeServerRateLimit({
        scope: `${SCOPE}.global`,
        key: 'all',
        max: GLOBAL_MAX_PER_HOUR,
        windowMs: 60 * 60 * 1000,
      })
    ).ok;
  } catch {
    globalOk = true; // a counter hiccup shouldn't hard-block legitimate sends
  }
  if (!globalOk) {
    return Response.json(
      { error: 'Verification is temporarily unavailable. Please try again soon.' },
      { status: 503 }
    );
  }

  const r = await sendCode(phone);
  if (!r.ok) {
    return Response.json(
      { error: r.error || 'Could not send a code. Please try again.' },
      { status: 502 }
    );
  }
  return Response.json({ ok: true, otpRequired: true });
}
