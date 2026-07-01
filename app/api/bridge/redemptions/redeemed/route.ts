/**
 * POST /api/bridge/redemptions/redeemed  (poisys door scanner -> barycal, HMAC-verified)
 *
 * Body = { codeHash }. When the poisys door staff scan & honor an org perk, the
 * poisys side marks it redeemed and notifies barycal so the partygoer's local
 * redemption row flips issued -> redeemed. Signature is over the exact raw bytes.
 */
import { and, eq } from 'drizzle-orm';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/lib/db';
import { redemptions } from '@/lib/db/schema';
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

  let body: { codeHash?: string };
  try {
    body = JSON.parse(raw) as { codeHash?: string };
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  if (!body?.codeHash) return Response.json({ error: 'bad payload' }, { status: 400 });

  // Only flip codes that are still 'issued' — never resurrect expired/voided ones.
  await getDb()
    .update(redemptions)
    .set({ status: 'redeemed', redeemedAt: new Date().toISOString() })
    .where(and(eq(redemptions.codeHash, body.codeHash), eq(redemptions.status, 'issued')));

  return Response.json({ ok: true });
}
