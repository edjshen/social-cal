// Read helpers for the platform-admin console (/admin/*). Plain getDb() selects
// + JS aggregation over the ledger/redemptions/check-ins. No mutations here —
// every page is a server component that calls these; writes live in
// lib/actions/admin.ts (each gated by requireAdmin()).

import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  platformPerks,
  globalRewardRules,
  pointsLedger,
  redemptions,
  checkIns,
  users,
} from '../db/schema';
import { PLATFORM_SCOPE } from '../domain/rewards';
import type { PlatformPerk, GlobalRewardRules, Redemption, CheckIn } from '../db/schema';

// ------------------------------- Dashboard -------------------------------

export interface AdminCounts {
  activePerks: number;
  pointsIssued: number; // sum of positive 'earned' deltas at scope 'platform'
  redemptions: number;
  checkIns: number;
}

export async function getAdminCounts(): Promise<AdminCounts> {
  const db = getDb();
  const [perks, ledger, reds, cins] = await Promise.all([
    db.select({ active: platformPerks.active }).from(platformPerks),
    db
      .select({ delta: pointsLedger.delta, kind: pointsLedger.kind, scope: pointsLedger.scope })
      .from(pointsLedger),
    db.select({ id: redemptions.id }).from(redemptions),
    db.select({ id: checkIns.id }).from(checkIns),
  ]);
  const pointsIssued = ledger
    .filter((r) => r.scope === PLATFORM_SCOPE && r.kind === 'earned' && r.delta > 0)
    .reduce((a, r) => a + r.delta, 0);
  return {
    activePerks: perks.filter((p) => p.active).length,
    pointsIssued,
    redemptions: reds.length,
    checkIns: cins.length,
  };
}

// --------------------------------- Perks ---------------------------------

export async function listPlatformPerks(): Promise<PlatformPerk[]> {
  return getDb().select().from(platformPerks).orderBy(desc(platformPerks.createdAt));
}

export async function getPlatformPerk(id: string): Promise<PlatformPerk | undefined> {
  const rows = await getDb().select().from(platformPerks).where(eq(platformPerks.id, id)).limit(1);
  return rows[0];
}

// --------------------------------- Rules ---------------------------------

/** The single active global-rules row, if any. */
export async function getActiveGlobalRules(): Promise<GlobalRewardRules | undefined> {
  const rows = await getDb()
    .select()
    .from(globalRewardRules)
    .where(eq(globalRewardRules.active, true))
    .limit(1);
  return rows[0];
}

// ------------------------------- Analytics -------------------------------

export interface PerkAnalyticsRow {
  perk: PlatformPerk;
  redemptionCount: number;
  pointSink: number; // total points spent on this perk (= count * pointCost, derived)
}

export interface CatalogAnalytics {
  rows: PerkAnalyticsRow[];
  totalPlatformSink: number; // sum of |spend| deltas at scope 'platform'
  topPerks: PerkAnalyticsRow[];
}

export async function getCatalogAnalytics(): Promise<CatalogAnalytics> {
  const db = getDb();
  const [perks, reds, ledger] = await Promise.all([
    db.select().from(platformPerks),
    db.select({ perkId: redemptions.perkId, scope: redemptions.scope }).from(redemptions),
    db
      .select({ delta: pointsLedger.delta, kind: pointsLedger.kind, scope: pointsLedger.scope })
      .from(pointsLedger),
  ]);

  const countByPerk = new Map<string, number>();
  for (const r of reds) {
    if (r.scope !== PLATFORM_SCOPE) continue;
    countByPerk.set(r.perkId, (countByPerk.get(r.perkId) ?? 0) + 1);
  }

  const rows: PerkAnalyticsRow[] = perks.map((perk) => {
    const redemptionCount = countByPerk.get(perk.id) ?? 0;
    return { perk, redemptionCount, pointSink: redemptionCount * perk.pointCost };
  });
  rows.sort((a, b) => b.redemptionCount - a.redemptionCount);

  const totalPlatformSink = ledger
    .filter((r) => r.scope === PLATFORM_SCOPE && r.kind === 'spend')
    .reduce((a, r) => a + Math.abs(r.delta), 0);

  return { rows, totalPlatformSink, topPerks: rows.slice(0, 5) };
}

// ------------------------------ Moderation ------------------------------

export interface CheckInWithUser extends CheckIn {
  displayName: string | null;
  handle: string | null;
}
export interface RedemptionWithUser extends Redemption {
  displayName: string | null;
  handle: string | null;
}

async function userLookup(): Promise<Map<string, { displayName: string; handle: string }>> {
  const all = await getDb()
    .select({ id: users.id, displayName: users.displayName, handle: users.handle })
    .from(users);
  const m = new Map<string, { displayName: string; handle: string }>();
  for (const u of all) m.set(u.id, { displayName: u.displayName, handle: u.handle });
  return m;
}

export async function listRecentCheckIns(limit = 50): Promise<CheckInWithUser[]> {
  const db = getDb();
  const [rows, lk] = await Promise.all([
    db.select().from(checkIns).orderBy(desc(checkIns.createdAt)).limit(limit),
    userLookup(),
  ]);
  return rows.map((r) => ({
    ...r,
    displayName: lk.get(r.userId)?.displayName ?? null,
    handle: lk.get(r.userId)?.handle ?? null,
  }));
}

export async function listRecentRedemptions(limit = 50): Promise<RedemptionWithUser[]> {
  const db = getDb();
  const [rows, lk] = await Promise.all([
    db.select().from(redemptions).orderBy(desc(redemptions.issuedAt)).limit(limit),
    userLookup(),
  ]);
  return rows.map((r) => ({
    ...r,
    displayName: lk.get(r.userId)?.displayName ?? null,
    handle: lk.get(r.userId)?.handle ?? null,
  }));
}

// ------------------------------ Fulfillment ------------------------------

/** Redemptions needing platform fulfillment: partner-code/manual that are issued/redeemed. */
export async function listFulfillmentQueue(limit = 100): Promise<RedemptionWithUser[]> {
  const db = getDb();
  const [rows, lk] = await Promise.all([
    db.select().from(redemptions).orderBy(desc(redemptions.issuedAt)).limit(limit),
    userLookup(),
  ]);
  return rows
    .filter(
      (r) =>
        (r.fulfillment === 'partner-code' || r.fulfillment === 'manual') &&
        (r.status === 'issued' || r.status === 'redeemed')
    )
    .map((r) => ({
      ...r,
      displayName: lk.get(r.userId)?.displayName ?? null,
      handle: lk.get(r.userId)?.handle ?? null,
    }));
}
