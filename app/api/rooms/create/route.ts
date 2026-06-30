/**
 * POST /api/rooms/create
 *   { phone, code, roomId, words, mode, expiresAt, consent } → { ok }
 *
 * Verifies the creator's phone (Twilio OTP) and logs the new room to D1
 * (mayfly_rooms). The room id + key are generated client-side and never sent
 * here in full — only the public room id, for the registry. Messages stay E2E
 * (this route never sees them).
 */
import { parseJsonBody } from '@/lib/http';
import { normalizePhoneUS } from '@/lib/phone';
import { consumeRateLimit, verifyOtpOrReject, isValidRoomId } from '@/lib/mayfly/server/phone-gate';
import { logRoomCreated } from '@/lib/mayfly/server/rooms-log';
import { hasConsent, logConsent } from '@/lib/mayfly/server/consent';
import { mintRelayToken } from '@/lib/mayfly/server/relay-admission';

const SCOPE = 'rooms.create';

export async function POST(request: Request): Promise<Response> {
  const [body, err] = await parseJsonBody(request);
  if (err) return err;

  const b = body as Record<string, unknown> | null;
  const phone = normalizePhoneUS(b?.phone);
  if (!phone) {
    return Response.json({ error: 'Please enter a valid US phone number.' }, { status: 400 });
  }
  if (!hasConsent(b?.consent)) {
    return Response.json({ error: 'Consent is required to continue.' }, { status: 400 });
  }
  if (!isValidRoomId(b?.roomId)) {
    return Response.json({ error: 'Invalid room.' }, { status: 400 });
  }
  const mode = b?.mode === 'open' ? 'open' : 'sealed';
  const words = typeof b?.words === 'string' ? b.words.slice(0, 80) : null;
  const expiresAt =
    Number.isFinite(b?.expiresAt) && (b?.expiresAt as number) > 0
      ? Math.floor(b.expiresAt as number)
      : null;

  const limited = await consumeRateLimit(request, phone, SCOPE);
  if (limited) return limited;

  const rejected = await verifyOtpOrReject(phone, b?.code);
  if (rejected) return rejected;

  // Best-effort log: the chat works entirely through the relay + IndexedDB, so
  // a D1 hiccup must not block the user. (Logging IS a product requirement;
  // failures are surfaced in ops logs.)
  try {
    await logConsent({ phone, context: 'create', roomId: b?.roomId as string });
    await logRoomCreated({
      roomId: b?.roomId as string,
      words,
      mode,
      creatorPhone: phone,
      expiresAt,
    });
  } catch (e) {
    console.error('[rooms.create] log failed:', (e as Error)?.message);
  }

  // Best-effort like the logging above: a mint hiccup must never 500 a request
  // whose consent/log already landed — degrade to a null token (tokenless
  // connect, which the relay allows while ROOM_RELAY_SECRET is unset).
  const relayToken = await mintRelayToken(b?.roomId as string).catch(() => null);
  return Response.json({ ok: true, relayToken });
}
