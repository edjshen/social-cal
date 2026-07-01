// Pure rewards domain logic: point-grant computation, balance derivation, and
// tier/rank resolution. No DB or network here — callers pass in rows.
//
// Two independently-governed pools:
//   • GLOBAL (scope 'platform')  — default, platform-set base + platform bonuses.
//   • PER-ORG (scope 'org:<id>') — opt-in, set by the org admin (base + 4 bonuses).
// A check-in always writes a global grant; the per-org grant is 0 unless the org
// opted in. Tiers/rank derive from lifetime EARNED points; spendable = earned − spend.

import type {
  CheckIn,
  GlobalRewardRules,
  OrgTier,
  PointsLedgerRow,
  RewardEvent,
} from '../db/schema';

export const PLATFORM_SCOPE = 'platform';
export const orgScope = (orgId: string) => `org:${orgId}`;

// ------------------------------- Balances -------------------------------

export interface ScopeBalance {
  /** Spendable now (earned − spend, incl. voids/refunds). */
  spendable: number;
  /** Lifetime earned (drives tiers/rank); never reduced by spending. */
  earned: number;
}

/** Roll a user's ledger rows into per-scope balances. */
export function balancesByScope(rows: PointsLedgerRow[]): Map<string, ScopeBalance> {
  const out = new Map<string, ScopeBalance>();
  for (const r of rows) {
    const b = out.get(r.scope) ?? { spendable: 0, earned: 0 };
    b.spendable += r.delta;
    if (r.kind === 'earned' && r.delta > 0) b.earned += r.delta;
    out.set(r.scope, b);
  }
  return out;
}

export function balanceFor(rows: PointsLedgerRow[], scope: string): ScopeBalance {
  return balancesByScope(rows).get(scope) ?? { spendable: 0, earned: 0 };
}

// --------------------------------- Tiers ---------------------------------

export interface ResolvedTier {
  current: OrgTier | null;
  next: OrgTier | null;
  /** 0..1 progress from current threshold toward next (1 if at top). */
  progress: number;
}

/** Resolve the highest tier whose threshold the earned points meet. */
export function resolveTier(tiers: OrgTier[], earned: number): ResolvedTier {
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints || a.sort - b.sort);
  let current: OrgTier | null = null;
  let next: OrgTier | null = null;
  for (const t of sorted) {
    if (earned >= t.minPoints) current = t;
    else {
      next = t;
      break;
    }
  }
  let progress = 1;
  if (next) {
    const floor = current?.minPoints ?? 0;
    const span = next.minPoints - floor;
    progress = span > 0 ? Math.min(1, Math.max(0, (earned - floor) / span)) : 0;
  }
  return { current, next, progress };
}

// ------------------------------ Point grants ------------------------------

export interface GrantResult {
  global: number;
  org: number;
  breakdown: {
    global: Record<string, number>;
    org: Record<string, number>;
  };
}

/** Numeric helper for the loosely-typed JSON bonus configs. */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function bonusCfg(bonuses: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = bonuses[key];
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  return null;
}
function bonusOn(cfg: Record<string, unknown> | null): boolean {
  return !!cfg && cfg.on !== false;
}

/** The platform global engine, as consumed by computeGrant (DB row or a default). */
export type GlobalRules = Pick<GlobalRewardRules, 'basePoints' | 'bonuses' | 'active'>;

/**
 * Out-of-the-box global economy, used when no `global_reward_rules` row is active yet so points flow
 * on day one (a platform admin can override via /superadmin/rewards/rules). Numbers are the v1 baseline:
 * 100 per check-in, +50 for a cross-org streak (a prior check-in within 14 days), +150 once you've
 * been to 3+ different orgs.
 */
export const DEFAULT_GLOBAL_RULES: GlobalRules = {
  basePoints: 100,
  active: true,
  bonuses: {
    crossOrgStreak: { on: true, points: 50, windowDays: 14 },
    sceneExplorer: { on: true, points: 150, n: 3 },
  },
};

export interface GrantContext {
  /** This user's prior check-ins (any org), most-recent-first not required. */
  priorCheckIns: CheckIn[];
  /** Whether the user RSVP'd, and when (ISO), for the early-RSVP bonus. */
  rsvpAt?: string | null;
  /** A referred friend also checked into this event (bring-a-friend). */
  referredFriendCheckedIn?: boolean;
  /** Now, for time-based bonuses. */
  nowMs: number;
}

/**
 * Compute the global + per-org grants for one valid check-in.
 * Global uses platform rules; per-org uses the event's org config (0 base ⇒ no
 * per-org program). Bonuses are independent and additive.
 */
export function computeGrant(
  event: RewardEvent,
  global: GlobalRules | null,
  ctx: GrantContext
): GrantResult {
  const gBreak: Record<string, number> = {};
  const oBreak: Record<string, number> = {};

  // ---- GLOBAL (platform-governed) ----
  const gBase = global?.active ? global.basePoints : 0;
  if (gBase) gBreak.base = gBase;
  const gBonuses = global?.bonuses ?? {};

  // Scene explorer: bonus once the user has checked into N distinct orgs (incl. this).
  const explorer = bonusCfg(gBonuses, 'sceneExplorer');
  if (bonusOn(explorer)) {
    const orgs = new Set(ctx.priorCheckIns.map((c) => c.orgId));
    orgs.add(event.orgId);
    if (orgs.size >= num(explorer!.n, 3)) gBreak.sceneExplorer = num(explorer!.points);
  }

  // Cross-org streak: bonus when there's a prior check-in within `windowDays`.
  const xstreak = bonusCfg(gBonuses, 'crossOrgStreak');
  if (bonusOn(xstreak)) {
    const windowMs = num(xstreak!.windowDays, 14) * 86400_000;
    const recent = ctx.priorCheckIns.some((c) => ctx.nowMs - Date.parse(c.createdAt) <= windowMs);
    if (recent) gBreak.crossOrgStreak = num(xstreak!.points);
  }

  // ---- PER-ORG (opt-in, org-governed) ----
  const oBase = event.orgBasePoints || 0;
  if (oBase > 0) {
    oBreak.base = oBase;
    const ob = event.orgBonuses ?? {};
    const priorThisOrg = ctx.priorCheckIns.filter((c) => c.orgId === event.orgId);

    const firstTime = bonusCfg(ob, 'firstTime');
    const isFirst = priorThisOrg.length === 0;
    if (bonusOn(firstTime) && isFirst) oBreak.firstTime = num(firstTime!.points);

    // Streak/regular (mutually exclusive with first-time).
    const streak = bonusCfg(ob, 'streak');
    if (bonusOn(streak) && !isFirst) oBreak.streak = num(streak!.points);

    const early = bonusCfg(ob, 'earlyRsvp');
    if (bonusOn(early) && ctx.rsvpAt && event.startsAt) {
      const hours = (Date.parse(event.startsAt) - Date.parse(ctx.rsvpAt)) / 3_600_000;
      // poisys stores the required lead-hours in the bonus `param` (default 24h).
      if (hours >= num(early!.param, 24)) oBreak.earlyRsvp = num(early!.points);
    }

    const friend = bonusCfg(ob, 'bringFriend');
    if (bonusOn(friend) && ctx.referredFriendCheckedIn) oBreak.bringFriend = num(friend!.points);
  }

  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  return {
    global: sum(gBreak),
    org: sum(oBreak),
    breakdown: { global: gBreak, org: oBreak },
  };
}

/** Is `now` inside the event's check-in window? */
export function checkinWindowOpen(event: RewardEvent, nowMs: number): boolean {
  const opens = event.checkinOpensAt
    ? Date.parse(event.checkinOpensAt)
    : Date.parse(event.startsAt);
  const closes = event.checkinClosesAt
    ? Date.parse(event.checkinClosesAt)
    : event.endsAt
      ? Date.parse(event.endsAt) + 2 * 3_600_000 // 2h grace past end
      : Date.parse(event.startsAt) + 6 * 3_600_000; // or 6h past start
  return nowMs >= opens && nowMs <= closes;
}
