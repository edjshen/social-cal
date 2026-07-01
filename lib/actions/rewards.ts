'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  checkIns as CI,
  globalRewardRules as GRR,
  orgFollows as OF,
  orgPerks as OP,
  organizations as ORG,
  platformPerks as PP,
  pointsLedger as PL,
  redemptions as RD,
  rewardEventSecrets as RES,
  rewardEvents as RE,
  rewardRsvps as RR,
  users as U,
} from '../db/schema';
import { requireUserId } from '../auth/session';
import {
  DEFAULT_GLOBAL_RULES,
  PLATFORM_SCOPE,
  balanceFor,
  checkinWindowOpen,
  computeGrant,
  orgScope,
} from '../domain/rewards';
import { parseEventQr, randomCode, sha256Hex, verifyRotatingCode } from '../rewards/bridge';
import { reportCheckin, reportRedemptionIssued } from '../rewards/bridge-client';

export interface CheckinResult {
  ok: boolean;
  reason?: string;
  globalAwarded?: number;
  orgAwarded?: number;
  orgName?: string;
}

/** Validate a scanned event QR and credit points (global always; per-org if opted in). */
export async function checkInByQr(rawQr: string): Promise<CheckinResult> {
  const uid = await requireUserId();
  const parsed = parseEventQr(String(rawQr ?? ''));
  if (!parsed) return { ok: false, reason: 'Unrecognized code' };
  const db = getDb();
  const now = Date.now();

  const event = (await db.select().from(RE).where(eq(RE.id, parsed.eventId)).limit(1))[0];
  if (!event || event.status !== 'published') return { ok: false, reason: 'Event not found' };
  if (!checkinWindowOpen(event, now))
    return { ok: false, reason: 'Check-in is closed for this event' };

  const secret = (await db.select().from(RES).where(eq(RES.eventId, event.id)).limit(1))[0];
  if (!secret) return { ok: false, reason: 'Check-in unavailable' };
  const valid = await verifyRotatingCode(
    secret.rotatingSecret,
    secret.stepSeconds,
    parsed.code,
    now
  );
  if (!valid) return { ok: false, reason: 'Code expired — scan the live QR again' };

  // One earning check-in per user per event.
  const dupe = (
    await db
      .select()
      .from(CI)
      .where(and(eq(CI.userId, uid), eq(CI.eventId, event.id)))
      .limit(1)
  )[0];
  if (dupe) return { ok: false, reason: 'Already checked in' };

  const [priorCheckIns, globalRows, me, org, rsvp] = await Promise.all([
    db.select().from(CI).where(eq(CI.userId, uid)),
    db.select().from(GRR).where(eq(GRR.active, true)).limit(1),
    db.select().from(U).where(eq(U.id, uid)).limit(1),
    db.select().from(ORG).where(eq(ORG.id, event.orgId)).limit(1),
    db
      .select()
      .from(RR)
      .where(and(eq(RR.userId, uid), eq(RR.eventId, event.id)))
      .limit(1),
  ]);

  // A 'going' RSVP's commit time drives the early-RSVP bonus (no active global
  // rules row yet ⇒ fall back to the v1 default economy so points still flow).
  const goingRsvpAt = rsvp[0]?.status === 'going' ? rsvp[0].createdAt : null;
  const grant = computeGrant(event, globalRows[0] ?? DEFAULT_GLOBAL_RULES, {
    priorCheckIns,
    rsvpAt: goingRsvpAt,
    referredFriendCheckedIn: false,
    nowMs: now,
  });

  const nowISO = new Date().toISOString();
  await db.insert(CI).values({
    id: crypto.randomUUID(),
    userId: uid,
    eventId: event.id,
    orgId: event.orgId,
    globalAwarded: grant.global,
    orgAwarded: grant.org,
    bonusBreakdown: grant.breakdown,
    createdAt: nowISO,
  });
  const ledgerRows = [];
  if (grant.global > 0)
    ledgerRows.push({
      id: crypto.randomUUID(),
      userId: uid,
      scope: PLATFORM_SCOPE,
      delta: grant.global,
      kind: 'earned' as const,
      reason: 'checkin',
      sourceRef: event.id,
      createdAt: nowISO,
    });
  if (grant.org > 0)
    ledgerRows.push({
      id: crypto.randomUUID(),
      userId: uid,
      scope: orgScope(event.orgId),
      delta: grant.org,
      kind: 'earned' as const,
      reason: 'checkin',
      sourceRef: event.id,
      createdAt: nowISO,
    });
  if (ledgerRows.length) await db.insert(PL).values(ledgerRows);

  // Best-effort return sync to poisys analytics.
  await reportCheckin({
    eventId: event.id,
    barycalUserRef: me[0]?.shareId ?? uid,
    displayName: me[0]?.displayName ?? '',
    pointsAwarded: grant.org,
    globalAwarded: grant.global,
    bonusBreakdown: grant.breakdown,
    checkedInAt: nowISO,
  });

  revalidatePath('/organizations');
  revalidatePath('/you');
  return {
    ok: true,
    globalAwarded: grant.global,
    orgAwarded: grant.org,
    orgName: org[0]?.name,
  };
}

export interface RedeemResult {
  ok: boolean;
  reason?: string;
  code?: string;
  expiresAt?: string;
  autoFulfilled?: boolean;
}

const CODE_TTL_MS = 15 * 60 * 1000;

/** Redeem a perk: debit the matching pool and mint a one-time code. */
export async function redeemPerk(input: {
  perkScope: 'platform' | string; // 'platform' or an orgId
  perkId: string;
}): Promise<RedeemResult> {
  const uid = await requireUserId();
  const db = getDb();
  const isPlatform = input.perkScope === 'platform';
  const scope = isPlatform ? PLATFORM_SCOPE : orgScope(input.perkScope);
  const nowISO = new Date().toISOString();

  // Load the perk (platform or org catalog).
  const perk = isPlatform
    ? (await db.select().from(PP).where(eq(PP.id, input.perkId)).limit(1))[0]
    : (await db.select().from(OP).where(eq(OP.id, input.perkId)).limit(1))[0];
  if (!perk || !perk.active) return { ok: false, reason: 'Perk unavailable' };

  // Funds check.
  const ledger = await db.select().from(PL).where(eq(PL.userId, uid));
  const { spendable } = balanceFor(ledger, scope);
  if (spendable < perk.pointCost) return { ok: false, reason: 'Not enough points' };

  // Per-user limit + inventory.
  const existing = await db
    .select()
    .from(RD)
    .where(and(eq(RD.userId, uid), eq(RD.perkId, perk.id)));
  const liveByUser = existing.filter(
    (r) => r.status === 'issued' || r.status === 'redeemed'
  ).length;
  if (perk.perUserLimit != null && liveByUser >= perk.perUserLimit)
    return { ok: false, reason: 'Redemption limit reached' };
  if (perk.totalInventory != null) {
    const all = await db.select().from(RD).where(eq(RD.perkId, perk.id));
    const claimed = all.filter((r) => r.status === 'issued' || r.status === 'redeemed').length;
    if (claimed >= perk.totalInventory) return { ok: false, reason: 'Sold out' };
  }

  const code = randomCode(8);
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const fulfillment = isPlatform ? (perk as typeof PP.$inferSelect).fulfillment : null;
  const autoFulfilled = isPlatform && fulfillment === 'auto-digital';

  await db.insert(RD).values({
    id: crypto.randomUUID(),
    userId: uid,
    scope,
    perkId: perk.id,
    codeHash,
    status: autoFulfilled ? 'redeemed' : 'issued',
    fulfillment,
    issuedAt: nowISO,
    expiresAt,
    redeemedAt: autoFulfilled ? nowISO : null,
  });
  await db.insert(PL).values({
    id: crypto.randomUUID(),
    userId: uid,
    scope,
    delta: -perk.pointCost,
    kind: 'spend',
    reason: 'redeem',
    sourceRef: perk.id,
    createdAt: nowISO,
  });

  // Org redemptions verify at the poisys door scanner — notify it of the issued code.
  if (!isPlatform)
    await reportRedemptionIssued({ perkId: perk.id, barycalUserRef: uid, codeHash, expiresAt });

  revalidatePath('/you');
  revalidatePath('/organizations');
  return { ok: true, code, expiresAt, autoFulfilled };
}

/**
 * RSVP to a reward event. 'going' (set early) unlocks the org's early-RSVP bonus at check-in and
 * feeds turnout forecasting; 'cant' clears it. The original commit time is preserved across toggles
 * so re-confirming 'going' doesn't reset the early-RSVP clock.
 */
export async function setRewardRsvp(
  eventId: string,
  status: 'going' | 'cant'
): Promise<{ status: 'going' | 'cant' }> {
  const uid = await requireUserId();
  if (status !== 'going' && status !== 'cant') throw new Error('Bad request');
  const db = getDb();
  const event = (await db.select().from(RE).where(eq(RE.id, eventId)).limit(1))[0];
  if (!event) throw new Error('Event not found');

  const existing = (
    await db
      .select()
      .from(RR)
      .where(and(eq(RR.userId, uid), eq(RR.eventId, eventId)))
      .limit(1)
  )[0];
  if (existing) {
    await db.update(RR).set({ status }).where(eq(RR.id, existing.id));
  } else {
    await db.insert(RR).values({
      id: crypto.randomUUID(),
      userId: uid,
      eventId,
      status,
      createdAt: new Date().toISOString(),
    });
  }
  revalidatePath('/organizations');
  return { status };
}

/** Follow/unfollow an org (curates the feed; does NOT gate earning). */
export async function toggleFollowOrg(orgId: string): Promise<{ following: boolean }> {
  const uid = await requireUserId();
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(OF)
      .where(and(eq(OF.userId, uid), eq(OF.orgId, orgId)))
      .limit(1)
  )[0];
  if (existing) {
    await db.delete(OF).where(eq(OF.id, existing.id));
    revalidatePath('/organizations');
    return { following: false };
  }
  await db.insert(OF).values({
    id: crypto.randomUUID(),
    userId: uid,
    orgId,
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/organizations');
  return { following: true };
}
