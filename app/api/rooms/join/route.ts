/**
 * POST /api/rooms/join
 *   { roomId, isEvent, eventSlug?, words?, expiresAt?, handle, profilePub, phone?, code?, consent? }
 *     → { ok }
 *
 * Logs a participant joining a room (mayfly_participants). Phone gate per the
 * product decision "create + ad-hoc joins":
 *   - ad-hoc user room (isEvent=false): require a verified phone.
 *   - public event room (isEvent=true): open join, no phone; also upserts the
 *     event-room registry row on first join.
 *
 * Messages stay end-to-end encrypted; this route only records identity/metadata.
 */
import { parseJsonBody } from '@/lib/http';
import { normalizePhoneUS } from '@/lib/phone';
import {
  consumeRateLimit,
  verifyOtpOrReject,
  isValidRoomId,
  isValidPubKey,
} from '@/lib/mayfly/server/phone-gate';
import { logParticipantJoined, upsertEventRoom } from '@/lib/mayfly/server/rooms-log';
import { hasConsent, logConsent } from '@/lib/mayfly/server/consent';
import { mintRelayToken } from '@/lib/mayfly/server/relay-admission';

const SCOPE = 'rooms.join';

export async function POST(request: Request): Promise<Response> {
  const [body, err] = await parseJsonBody(request);
  if (err) return err;

  const b = body as Record<string, unknown> | null;
  if (!isValidRoomId(b?.roomId) || !isValidPubKey(b?.profilePub)) {
    return Response.json({ error: 'Invalid room or profile.' }, { status: 400 });
  }
  const isEvent = b?.isEvent === true;
  const handle = typeof b?.handle === 'string' ? b.handle.slice(0, 40) : null;
  const words = typeof b?.words === 'string' ? b.words.slice(0, 80) : null;
  const eventSlug = typeof b?.eventSlug === 'string' ? b.eventSlug.slice(0, 120) : null;
  const expiresAt =
    Number.isFinite(b?.expiresAt) && (b?.expiresAt as number) > 0
      ? Math.floor(b?.expiresAt as number)
      : null;

  let phone: string | null = null;
  if (!isEvent) {
    // Ad-hoc user room → phone gate + consent.
    phone = normalizePhoneUS(b?.phone);
    if (!phone) {
      return Response.json({ error: 'Please enter a valid US phone number.' }, { status: 400 });
    }
    if (!hasConsent(b?.consent)) {
      return Response.json({ error: 'Consent is required to continue.' }, { status: 400 });
    }
    const limited = await consumeRateLimit(request, phone, SCOPE);
    if (limited) return limited;
    const rejected = await verifyOtpOrReject(phone, b?.code);
    if (rejected) return rejected;
  } else {
    // Open event room → just light IP rate limiting (no phone).
    const limited = await consumeRateLimit(request, null, SCOPE, { max: 30 });
    if (limited) return limited;
  }

  try {
    if (isEvent) {
      await upsertEventRoom({ roomId: b?.roomId as string, words, eventSlug, expiresAt });
    } else {
      await logConsent({ phone: phone!, context: 'join', roomId: b?.roomId as string });
    }
    await logParticipantJoined({
      roomId: b?.roomId as string,
      profilePub: b?.profilePub as string,
      handle,
      phone,
    });
  } catch (e) {
    console.error('[rooms.join] log failed:', (e as Error)?.message);
  }

  // Best-effort like the logging above: a mint hiccup must never 500 a join
  // whose log already landed — degrade to a null token (tokenless connect,
  // which the relay allows while ROOM_RELAY_SECRET is unset).
  const relayToken = await mintRelayToken(b?.roomId as string).catch(() => null);
  return Response.json({ ok: true, relayToken });
}
