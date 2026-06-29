/**
 * POST /api/bridge/events/unpublish  (poisys -> barycal, HMAC-verified)
 *
 * Body = { eventId }. Marks the projected reward event 'unpublished' (hides it
 * from discovery; existing points/check-ins are retained). Signature is over
 * the exact raw body bytes, read before JSON.parse.
 */
import { eq } from 'drizzle-orm';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/lib/db';
import { rewardEvents } from '@/lib/db/schema';
import { verifyPayload, BRIDGE_TS_HEADER, BRIDGE_SIG_HEADER } from '@/lib/rewards/bridge';

function bridgeSecret(): string | undefined {
  const env = getCloudflareContext().env as unknown as { BRIDGE_SECRET?: string };
  return env.BRIDGE_SECRET ?? process.env.BRIDGE_SECRET;
}

export async function POST(req: Request): Promise<Response> {
  const secret = bridgeSecret();
  if (!secret) return Response.json({ error: 'bridge not configured' }, { status: 503 });

  const raw = await req.text();
  const ts = Number(req.headers.get(BRIDGE_TS_HEADER));
  const sig = req.headers.get(BRIDGE_SIG_HEADER) ?? '';
  const ok = await verifyPayload(secret, ts, raw, sig, Date.now());
  if (!ok) return Response.json({ error: 'bad signature' }, { status: 401 });

  let body: { eventId?: string };
  try {
    body = JSON.parse(raw) as { eventId?: string };
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  if (!body?.eventId) return Response.json({ error: 'bad payload' }, { status: 400 });

  await getDb()
    .update(rewardEvents)
    .set({ status: 'unpublished' })
    .where(eq(rewardEvents.id, body.eventId));

  return Response.json({ ok: true });
}
