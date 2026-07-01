'use server';
// Rewards-admin server actions for the /superadmin/rewards console. Every action
// begins by asserting the caller is a platform admin via requireSuperadmin
// (platform_admins + MFA step-up). Server Actions are directly-invocable HTTP
// endpoints, so this gate is the real authorization — the layout is only UI.

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  platformPerks,
  globalRewardRules,
  pointsLedger,
  redemptions,
  checkIns,
  orgPerks,
} from '../db/schema';
import { PLATFORM_SCOPE, orgScope } from '../domain/rewards';
import { requireSuperadmin } from '../auth/superadmin';
import { clampStr } from '../validate';

const PERK_TITLE_MAX = 120;
const PERK_DESC_MAX = 800;
const SEGMENT_JSON_MAX = 4000;

const FULFILLMENTS = ['auto-digital', 'partner-code', 'manual'] as const;
const SOURCES = ['first-party', 'sponsor', 'partner', 'org'] as const;
type Fulfillment = (typeof FULFILLMENTS)[number];
type Source = (typeof SOURCES)[number];

/** Assert the caller is a platform admin (platform_admins + MFA) and return their id. */
async function requireAdmin(): Promise<string> {
  const { userId } = await requireSuperadmin();
  return userId;
}

// -------------------------- helpers --------------------------

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
/** Parse a non-negative integer, or fallback. */
function intOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
/** Optional non-negative int: '' / null / undefined -> null. */
function optInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
/** Optional ISO datetime string, else null. */
function optDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'on' || v === 1 || v === '1';
}
/** Parse a JSON-object string safely; bad/oversized input -> {}. */
function parseJsonObject(v: unknown, max = SEGMENT_JSON_MAX): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v !== 'string' || !v.trim()) return {};
  if (v.length > max) return {};
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ============================ Platform perks ============================

export interface PerkInput {
  id?: string;
  title: unknown;
  description?: unknown;
  pointCost?: unknown;
  fulfillment?: unknown;
  source?: unknown;
  sponsorId?: unknown;
  placement?: unknown;
  segment?: unknown;
  totalInventory?: unknown;
  perUserLimit?: unknown;
  active?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
}

export async function savePlatformPerk(input: PerkInput): Promise<{ id: string }> {
  await requireAdmin();
  const db = getDb();

  const title = clampStr(input.title, PERK_TITLE_MAX).trim();
  if (!title) throw new Error('Title required');
  const description = clampStr(input.description ?? '', PERK_DESC_MAX);
  const pointCost = Math.max(0, intOr(input.pointCost, 0));
  const fulfillment: Fulfillment = oneOf(input.fulfillment, FULFILLMENTS, 'auto-digital');
  const source: Source = oneOf(input.source, SOURCES, 'first-party');
  const sponsorId =
    typeof input.sponsorId === 'string' && input.sponsorId.trim()
      ? clampStr(input.sponsorId, 120)
      : null;
  const placement = Math.max(0, intOr(input.placement, 0));
  const segment = parseJsonObject(input.segment);
  const totalInventory = optInt(input.totalInventory);
  const perUserLimit = optInt(input.perUserLimit);
  const active = input.active === undefined ? true : asBool(input.active);
  const validFrom = optDate(input.validFrom);
  const validTo = optDate(input.validTo);

  const id = typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID();

  const set = {
    title,
    description,
    pointCost,
    fulfillment,
    source,
    sponsorId,
    placement,
    segment,
    totalInventory,
    perUserLimit,
    active,
    validFrom,
    validTo,
  };

  await db
    .insert(platformPerks)
    .values({ id, ...set, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: platformPerks.id, set });

  revalidatePath('/superadmin/rewards/perks');
  revalidatePath('/superadmin/rewards');
  return { id };
}

export async function deletePlatformPerk(id: unknown): Promise<void> {
  await requireAdmin();
  if (typeof id !== 'string' || !id) throw new Error('Bad request');
  await getDb().delete(platformPerks).where(eq(platformPerks.id, id));
  revalidatePath('/superadmin/rewards/perks');
  revalidatePath('/superadmin/rewards');
}

// ========================== Global reward rules ==========================

export interface RulesInput {
  basePoints?: unknown;
  bonuses?: unknown; // JSON: { sceneExplorer:{on,points,n}, crossOrgStreak:{on,points,windowDays} }
}

export async function saveGlobalRules(input: RulesInput): Promise<{ id: string }> {
  await requireAdmin();
  const db = getDb();
  const basePoints = Math.max(0, intOr(input.basePoints, 100));
  const bonuses = parseJsonObject(input.bonuses);
  const now = new Date().toISOString();

  const existing = await db
    .select({ id: globalRewardRules.id })
    .from(globalRewardRules)
    .where(eq(globalRewardRules.active, true))
    .limit(1);

  if (existing[0]) {
    await db
      .update(globalRewardRules)
      .set({ basePoints, bonuses, updatedAt: now })
      .where(eq(globalRewardRules.id, existing[0].id));
    revalidatePath('/superadmin/rewards/rules');
    return { id: existing[0].id };
  }

  const id = crypto.randomUUID();
  await db
    .insert(globalRewardRules)
    .values({ id, basePoints, bonuses, active: true, updatedAt: now });
  revalidatePath('/superadmin/rewards/rules');
  return { id };
}

// ============================== Moderation ==============================

/**
 * Void a check-in: append COMPENSATING negative 'earned' rows for each awarded
 * amount at its scope (platform always; org if it granted points). Non-destructive
 * — the check-in row is left intact (auditable); balances net to zero via the
 * ledger. reason = 'void'.
 */
export async function voidCheckIn(checkInId: unknown): Promise<void> {
  await requireAdmin();
  if (typeof checkInId !== 'string' || !checkInId) throw new Error('Bad request');
  const db = getDb();
  const rows = await db.select().from(checkIns).where(eq(checkIns.id, checkInId)).limit(1);
  const ci = rows[0];
  if (!ci) throw new Error('Not found');

  const now = new Date().toISOString();
  const reversals: (typeof pointsLedger.$inferInsert)[] = [];
  if (ci.globalAwarded > 0) {
    reversals.push({
      id: crypto.randomUUID(),
      userId: ci.userId,
      scope: PLATFORM_SCOPE,
      delta: -ci.globalAwarded,
      kind: 'earned',
      reason: 'void',
      sourceRef: ci.eventId,
      createdAt: now,
    });
  }
  if (ci.orgAwarded > 0) {
    reversals.push({
      id: crypto.randomUUID(),
      userId: ci.userId,
      scope: orgScope(ci.orgId),
      delta: -ci.orgAwarded,
      kind: 'earned',
      reason: 'void',
      sourceRef: ci.eventId,
      createdAt: now,
    });
  }
  if (reversals.length) await db.insert(pointsLedger).values(reversals);

  revalidatePath('/superadmin/rewards/moderation');
}

/**
 * Void a redemption: set status='voided' and REFUND the perk's point cost back
 * to the matching scope as a +'spend' row (reason='refund') — mirrors the
 * append-only refund model (spend then refund both at kind='spend' so spendable
 * recovers while lifetime-earned is untouched).
 */
export async function voidRedemption(redemptionId: unknown): Promise<void> {
  await requireAdmin();
  if (typeof redemptionId !== 'string' || !redemptionId) throw new Error('Bad request');
  const db = getDb();
  const rows = await db.select().from(redemptions).where(eq(redemptions.id, redemptionId)).limit(1);
  const r = rows[0];
  if (!r) throw new Error('Not found');
  if (r.status === 'voided') return; // idempotent

  // Resolve the perk's point cost for the refund. Platform perks vs. org perks
  // live in different tables, keyed by scope.
  let cost = 0;
  if (r.scope === PLATFORM_SCOPE) {
    const p = await db
      .select({ pointCost: platformPerks.pointCost })
      .from(platformPerks)
      .where(eq(platformPerks.id, r.perkId))
      .limit(1);
    cost = p[0]?.pointCost ?? 0;
  } else {
    const p = await db
      .select({ pointCost: orgPerks.pointCost })
      .from(orgPerks)
      .where(eq(orgPerks.id, r.perkId))
      .limit(1);
    cost = p[0]?.pointCost ?? 0;
  }

  const now = new Date().toISOString();
  await db.update(redemptions).set({ status: 'voided' }).where(eq(redemptions.id, r.id));
  if (cost > 0) {
    await db.insert(pointsLedger).values({
      id: crypto.randomUUID(),
      userId: r.userId,
      scope: r.scope,
      delta: cost, // + refund of the spend
      kind: 'spend',
      reason: 'refund',
      sourceRef: r.id,
      createdAt: now,
    });
  }

  revalidatePath('/superadmin/rewards/moderation');
  revalidatePath('/superadmin/rewards/fulfillment');
}

// ============================== Fulfillment ==============================

/** Mark a partner-code/manual redemption fulfilled: status='redeemed' + redeemedAt. */
export async function markFulfilled(redemptionId: unknown): Promise<void> {
  await requireAdmin();
  if (typeof redemptionId !== 'string' || !redemptionId) throw new Error('Bad request');
  await getDb()
    .update(redemptions)
    .set({ status: 'redeemed', redeemedAt: new Date().toISOString() })
    .where(and(eq(redemptions.id, redemptionId), eq(redemptions.status, 'issued')));
  revalidatePath('/superadmin/rewards/fulfillment');
}
