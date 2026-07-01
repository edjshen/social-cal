/**
 * POST /api/bridge/events  (poisys -> barycal publish, HMAC-verified)
 *
 * Body = EventProjection (see lib/rewards/bridge.ts). Idempotently upserts the
 * organization, its rewards event, the server-only rotating-QR secret, and
 * REPLACES that org's projected perks + tiers from the payload.
 *
 * The signature is computed over the EXACT request bytes, so the raw body text
 * is read once BEFORE JSON.parse and fed to verifyPayload.
 */
import { eq } from 'drizzle-orm';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/lib/db';
import {
  organizations,
  rewardEvents,
  rewardEventSecrets,
  orgPerks,
  orgTiers,
} from '@/lib/db/schema';
import {
  verifyPayload,
  BRIDGE_TS_HEADER,
  BRIDGE_SIG_HEADER,
  type EventProjection,
  type PerkProjection,
  type TierProjection,
} from '@/lib/rewards/bridge';

function bridgeSecret(): string | undefined {
  const env = getCloudflareContext().env as unknown as { BRIDGE_SECRET?: string };
  return env.BRIDGE_SECRET ?? process.env.BRIDGE_SECRET;
}

export async function POST(req: Request): Promise<Response> {
  const secret = bridgeSecret();
  if (!secret) return Response.json({ error: 'bridge not configured' }, { status: 503 });

  // Read RAW bytes first — the HMAC is over the exact body string.
  const raw = await req.text();
  const ts = Number(req.headers.get(BRIDGE_TS_HEADER));
  const sig = req.headers.get(BRIDGE_SIG_HEADER) ?? '';
  const ok = await verifyPayload(secret, ts, raw, sig, Date.now());
  if (!ok) return Response.json({ error: 'bad signature' }, { status: 401 });

  let payload: EventProjection;
  try {
    payload = JSON.parse(raw) as EventProjection;
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }

  if (!payload?.eventId || !payload?.org?.id) {
    return Response.json({ error: 'bad payload' }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();
  const org = payload.org;

  // --- organization (upsert; preserve createdAt on conflict) ---
  await db
    .insert(organizations)
    .values({
      id: org.id,
      slug: org.slug,
      name: org.name,
      avatar: org.avatar ?? null,
      bio: org.bio ?? '',
      poisysOrgRef: org.id,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: organizations.id,
      set: {
        slug: org.slug,
        name: org.name,
        avatar: org.avatar ?? null,
        bio: org.bio ?? '',
      },
    });

  // --- reward event (upsert; status forced to published on (re)publish) ---
  await db
    .insert(rewardEvents)
    .values({
      id: payload.eventId,
      orgId: org.id,
      title: payload.title,
      venueArea: payload.venueArea ?? '',
      startsAt: payload.startsAt,
      endsAt: payload.endsAt ?? null,
      checkinOpensAt: payload.checkinOpensAt ?? null,
      checkinClosesAt: payload.checkinClosesAt ?? null,
      orgBasePoints: payload.orgBasePoints ?? 0,
      orgBonuses: payload.orgBonuses ?? {},
      status: 'published',
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: rewardEvents.id,
      set: {
        orgId: org.id,
        title: payload.title,
        venueArea: payload.venueArea ?? '',
        startsAt: payload.startsAt,
        endsAt: payload.endsAt ?? null,
        checkinOpensAt: payload.checkinOpensAt ?? null,
        checkinClosesAt: payload.checkinClosesAt ?? null,
        orgBasePoints: payload.orgBasePoints ?? 0,
        orgBonuses: payload.orgBonuses ?? {},
        status: 'published',
      },
    });

  // --- rotating-QR secret (server-only table) ---
  await db
    .insert(rewardEventSecrets)
    .values({
      eventId: payload.eventId,
      rotatingSecret: payload.rotatingSecret,
      stepSeconds: payload.stepSeconds ?? 30,
    })
    .onConflictDoUpdate({
      target: rewardEventSecrets.eventId,
      set: {
        rotatingSecret: payload.rotatingSecret,
        stepSeconds: payload.stepSeconds ?? 30,
      },
    });

  // --- replace this org's perks from the projection (delete-missing then upsert) ---
  const perks: PerkProjection[] = Array.isArray(payload.perks) ? payload.perks : [];
  await db.delete(orgPerks).where(eq(orgPerks.orgId, org.id));
  for (const p of perks) {
    await db
      .insert(orgPerks)
      .values({
        id: p.id,
        orgId: org.id,
        title: p.title,
        description: p.description ?? '',
        pointCost: p.pointCost,
        minTier: p.minTier ?? null,
        totalInventory: p.totalInventory ?? null,
        perUserLimit: p.perUserLimit ?? null,
        active: p.active,
        validFrom: p.validFrom ?? null,
        validTo: p.validTo ?? null,
      })
      .onConflictDoUpdate({
        target: orgPerks.id,
        set: {
          orgId: org.id,
          title: p.title,
          description: p.description ?? '',
          pointCost: p.pointCost,
          minTier: p.minTier ?? null,
          totalInventory: p.totalInventory ?? null,
          perUserLimit: p.perUserLimit ?? null,
          active: p.active,
          validFrom: p.validFrom ?? null,
          validTo: p.validTo ?? null,
        },
      });
  }

  // --- replace this org's tiers from the projection ---
  const tiers: TierProjection[] = Array.isArray(payload.tiers) ? payload.tiers : [];
  await db.delete(orgTiers).where(eq(orgTiers.orgId, org.id));
  for (const t of tiers) {
    await db
      .insert(orgTiers)
      .values({
        id: t.id,
        orgId: org.id,
        name: t.name,
        minPoints: t.minPoints,
        sort: t.sort,
      })
      .onConflictDoUpdate({
        target: orgTiers.id,
        set: { orgId: org.id, name: t.name, minPoints: t.minPoints, sort: t.sort },
      });
  }

  return Response.json({ ok: true });
}
