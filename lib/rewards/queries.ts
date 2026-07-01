// Read helpers for the partygoer-facing rewards surfaces (Organizations tab,
// Profile wallet). Source-of-truth split: org/event/perk/tier rows are projected
// from poisys; ledger/check-ins/redemptions are authored here.

import { and, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import {
  checkIns as CI,
  orgFollows as OF,
  orgPerks as OP,
  orgTiers as OT,
  organizations as ORG,
  platformPerks as PP,
  pointsLedger as PL,
  redemptions as RD,
  rewardEvents as RE,
  rewardRsvps as RR,
} from '../db/schema';
import type { Organization, OrgPerk, OrgTier, PlatformPerk, RewardEvent } from '../db/schema';
import {
  PLATFORM_SCOPE,
  balanceFor,
  orgScope,
  resolveTier,
  type ResolvedTier,
  type ScopeBalance,
} from '../domain/rewards';

export interface OrgListItem {
  org: Organization;
  nextEvent: RewardEvent | null;
  following: boolean;
  balance: ScopeBalance;
  tier: ResolvedTier;
}

/** Organizations for the index, sorted by those with the soonest upcoming event. */
export async function getOrgsForIndex(meId: string, nowISO: string): Promise<OrgListItem[]> {
  const db = getDb();
  const [orgs, events, tiers, follows, ledger] = await Promise.all([
    db.select().from(ORG),
    db
      .select()
      .from(RE)
      .where(and(eq(RE.status, 'published'), gte(RE.startsAt, nowISO))),
    db.select().from(OT),
    db.select().from(OF).where(eq(OF.userId, meId)),
    db.select().from(PL).where(eq(PL.userId, meId)),
  ]);
  const followed = new Set(follows.map((f) => f.orgId));
  const nextByOrg = new Map<string, RewardEvent>();
  for (const e of events) {
    const cur = nextByOrg.get(e.orgId);
    if (!cur || e.startsAt < cur.startsAt) nextByOrg.set(e.orgId, e);
  }
  const tiersByOrg = groupBy(tiers, (t) => t.orgId);

  const items: OrgListItem[] = orgs.map((org) => {
    const balance = balanceFor(ledger, orgScope(org.id));
    return {
      org,
      nextEvent: nextByOrg.get(org.id) ?? null,
      following: followed.has(org.id),
      balance,
      tier: resolveTier(tiersByOrg.get(org.id) ?? [], balance.earned),
    };
  });

  // Sort: orgs with an upcoming event first (soonest), then the rest by name.
  items.sort((a, b) => {
    if (a.nextEvent && b.nextEvent) return a.nextEvent.startsAt < b.nextEvent.startsAt ? -1 : 1;
    if (a.nextEvent) return -1;
    if (b.nextEvent) return 1;
    return a.org.name.localeCompare(b.org.name);
  });
  return items;
}

export interface OrgDetail {
  org: Organization;
  upcoming: RewardEvent[];
  perks: OrgPerk[];
  tiers: OrgTier[];
  following: boolean;
  balance: ScopeBalance;
  tier: ResolvedTier;
  history: Array<{ kind: 'checkin' | 'redeem'; at: string; label: string; points: number }>;
  /** My RSVP status per upcoming event id. */
  myRsvps: Record<string, 'going' | 'cant'>;
  /** Count of 'going' RSVPs per upcoming event id (turnout signal). */
  goingCounts: Record<string, number>;
}

export async function getOrgDetail(
  slug: string,
  meId: string,
  nowISO: string
): Promise<OrgDetail | null> {
  const db = getDb();
  const org = (await db.select().from(ORG).where(eq(ORG.slug, slug)).limit(1))[0];
  if (!org) return null;
  const [upcoming, perks, tiers, follow, ledger, myCheckins, myRedemptions] = await Promise.all([
    db
      .select()
      .from(RE)
      .where(and(eq(RE.orgId, org.id), eq(RE.status, 'published'), gte(RE.startsAt, nowISO))),
    db
      .select()
      .from(OP)
      .where(and(eq(OP.orgId, org.id), eq(OP.active, true))),
    db.select().from(OT).where(eq(OT.orgId, org.id)),
    db
      .select()
      .from(OF)
      .where(and(eq(OF.userId, meId), eq(OF.orgId, org.id)))
      .limit(1),
    db.select().from(PL).where(eq(PL.userId, meId)),
    db
      .select()
      .from(CI)
      .where(and(eq(CI.userId, meId), eq(CI.orgId, org.id))),
    db
      .select()
      .from(RD)
      .where(and(eq(RD.userId, meId), eq(RD.scope, orgScope(org.id)))),
  ]);
  upcoming.sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));

  // RSVPs for the upcoming events (mine + 'going' counts for a turnout signal).
  const upIds = upcoming.map((e) => e.id);
  const rsvpRows = upIds.length ? await db.select().from(RR).where(inArray(RR.eventId, upIds)) : [];
  const myRsvps: Record<string, 'going' | 'cant'> = {};
  const goingCounts: Record<string, number> = {};
  for (const r of rsvpRows) {
    if (r.userId === meId) myRsvps[r.eventId] = r.status;
    if (r.status === 'going') goingCounts[r.eventId] = (goingCounts[r.eventId] ?? 0) + 1;
  }

  const balance = balanceFor(ledger, orgScope(org.id));
  const history = [
    ...myCheckins.map((c) => ({
      kind: 'checkin' as const,
      at: c.createdAt,
      label: 'Checked in',
      points: c.orgAwarded,
    })),
    ...myRedemptions.map((r) => ({
      kind: 'redeem' as const,
      at: r.issuedAt,
      label: `Redeemed perk (${r.status})`,
      points: 0,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    org,
    upcoming,
    perks,
    tiers,
    following: !!follow[0],
    balance,
    tier: resolveTier(tiers, balance.earned),
    history,
    myRsvps,
    goingCounts,
  };
}

export interface Wallet {
  global: ScopeBalance;
  perOrg: Array<{ org: Organization; balance: ScopeBalance; tier: ResolvedTier }>;
  platformPerks: PlatformPerk[];
}

export async function getWallet(meId: string, nowISO: string): Promise<Wallet> {
  const db = getDb();
  const ledger = await db.select().from(PL).where(eq(PL.userId, meId));
  const orgScopes = ledger
    .map((r) => r.scope)
    .filter((s) => s.startsWith('org:'))
    .map((s) => s.slice('org:'.length));
  const [orgs, tiers, perks] = await Promise.all([
    orgScopes.length
      ? db.select().from(ORG).where(inArray(ORG.id, orgScopes))
      : Promise.resolve([]),
    orgScopes.length
      ? db.select().from(OT).where(inArray(OT.orgId, orgScopes))
      : Promise.resolve([]),
    db.select().from(PP).where(eq(PP.active, true)),
  ]);
  const tiersByOrg = groupBy(tiers, (t) => t.orgId);
  const perOrg = (orgs as Organization[]).map((org) => {
    const balance = balanceFor(ledger, orgScope(org.id));
    return { org, balance, tier: resolveTier(tiersByOrg.get(org.id) ?? [], balance.earned) };
  });
  perOrg.sort((a, b) => b.balance.earned - a.balance.earned);

  const eligible = (perks as PlatformPerk[])
    .filter((p) => withinWindow(p.validFrom, p.validTo, nowISO))
    .sort((a, b) => b.placement - a.placement || a.pointCost - b.pointCost);

  return { global: balanceFor(ledger, PLATFORM_SCOPE), perOrg, platformPerks: eligible };
}

function withinWindow(from: string | null, to: string | null, nowISO: string): boolean {
  if (from && nowISO < from) return false;
  if (to && nowISO > to) return false;
  return true;
}

function groupBy<T, K>(rows: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}
