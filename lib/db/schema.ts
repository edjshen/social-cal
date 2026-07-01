import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull().unique(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  bio: text('bio').notNull().default(''),
  scenes: text('scenes', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  avatar: text('avatar').notNull(),
  shareId: text('share_id').notNull().unique(),
  ghost: integer('ghost', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    aId: text('a_id')
      .notNull()
      .references(() => users.id),
    bId: text('b_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['pending', 'accepted'] }).notNull(),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    // Non-unique by design: connection uniqueness (including the reverse pair
    // (b,a)) is enforced at the application layer via connectionStatus(), matching
    // the original app. A DB unique index on the ordered pair would be incomplete.
    pair: index('conn_pair').on(t.aId, t.bId),
  })
);

export const placements = sqliteTable(
  'placements',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    otherId: text('other_id')
      .notNull()
      .references(() => users.id),
    tier: text('tier', { enum: ['inner', 'orbit'] }).notNull(),
  },
  (t) => ({ uniq: unique('place_owner_other').on(t.ownerId, t.otherId) })
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id),
    type: text('type', { enum: ['intention', 'plan', 'event', 'scene'] }).notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    location: text('location').notNull().default(''),
    startTime: text('start_time').notNull(),
    endTime: text('end_time'),
    // Recurrence frequency. Historically only 'weekly' existed; the calendar tab
    // adds the rest of the Google-Calendar set. Enum is type-only at runtime
    // (no CHECK constraint), so older rows storing 'weekly' stay valid.
    recurring: text('recurring', { enum: ['daily', 'weekly', 'monthly', 'yearly', 'weekday'] }),
    // All-day events render in the day-spanning band rather than the time grid.
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    // Optional explicit color key (see CAL_COLORS). Null falls back to type color.
    color: text('color'),
    // --- per-instance recurrence exceptions (Google-Calendar style) ---
    // For an exception row, the base series it belongs to. Null for a normal event
    // or a series base. An exception row is itself non-recurring.
    parentId: text('parent_id'),
    // The YYYY-MM-DD of the original occurrence this row overrides/cancels.
    originalDate: text('original_date'),
    // True when this exception row CANCELS its occurrence (a "deleted" instance).
    cancelled: integer('cancelled', { mode: 'boolean' }).notNull().default(false),
    // For a series base: recurrence stops at/after this instant (exclusive). Used
    // by "this and following" splits. Null = recurs indefinitely.
    recurUntil: text('recur_until'),
    visibility: text('visibility', { enum: ['inner', 'orbit', 'public'] }).notNull(),
    expiresAt: text('expires_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byStart: index('events_start').on(t.startTime),
    byCreator: index('events_creator').on(t.creatorId),
  })
);

export const attendance = sqliteTable(
  'attendance',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    rsvp: text('rsvp', { enum: ['going', 'down', 'maybe', 'cant'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ byEvent: index('attend_event').on(t.eventId) })
);

// Generic fixed-window rate-limit counters for Barycal-side abuse controls (auth
// brute force / account-spam). Mirrors the Mayfly limiter but is kept separate
// to honor the Mayfly<->Barycal import boundary. `scope` namespaces a limit (e.g.
// 'auth.login.ip'); `k` is the per-caller key (IP or handle).
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    id: text('id').primaryKey(),
    scope: text('scope').notNull(),
    k: text('k').notNull(),
    hits: integer('hits').notNull().default(0),
    windowStart: integer('window_start').notNull(),
  },
  (t) => ({ uniq: unique('rate_limits_scope_k').on(t.scope, t.k) })
);

// ============================== Rewards & Loyalty ==============================
// poisys (the organizer OS) is the source of truth for organizations, their
// rewards events, per-org perks, and tiers; those are PROJECTED into D1 over the
// signed bridge for display + redemption. The points ledger, check-ins, and
// redemptions are AUTHORED here (where the partygoer acts); org-scoped rows sync
// back to poisys. Platform perks + the global reward rules are barycal-owned.

// Organizations mirrored from poisys. `id` == poisys organization_id.
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  avatar: text('avatar'),
  bio: text('bio').notNull().default(''),
  // Opaque bridge handle for the poisys org (indirection from the raw id).
  poisysOrgRef: text('poisys_org_ref'),
  createdAt: text('created_at').notNull(),
});

// A partygoer following an org. Optional — does NOT gate earning (auto on check-in);
// it only curates the feed / notifications.
export const orgFollows = sqliteTable(
  'org_follows',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ uniq: unique('org_follows_user_org').on(t.userId, t.orgId) })
);

// Rewards-eligible events projected from poisys. `id` == poisys event_id.
export const rewardEvents = sqliteTable(
  'reward_events',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    title: text('title').notNull(),
    venueArea: text('venue_area').notNull().default(''),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at'),
    // Check-in window. Outside it, a scan earns nothing.
    checkinOpensAt: text('checkin_opens_at'),
    checkinClosesAt: text('checkin_closes_at'),
    // Per-org grant config (org opt-in). orgBasePoints 0 => no per-org program here;
    // the event still feeds the global pool.
    orgBasePoints: integer('org_base_points').notNull().default(0),
    orgBonuses: text('org_bonuses', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    status: text('status', { enum: ['published', 'unpublished'] })
      .notNull()
      .default('published'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ byOrgStart: index('reward_events_org_start').on(t.orgId, t.startsAt) })
);

// Server-only rotating-QR secret per event. NEVER selected into client components
// (kept in its own table so a `select().from(rewardEvents)` can't leak it).
export const rewardEventSecrets = sqliteTable('reward_event_secrets', {
  eventId: text('event_id')
    .primaryKey()
    .references(() => rewardEvents.id),
  rotatingSecret: text('rotating_secret').notNull(),
  stepSeconds: integer('step_seconds').notNull().default(30),
});

// Per-org perks projected from poisys. `id` == poisys reward_perks.id.
export const orgPerks = sqliteTable(
  'org_perks',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    pointCost: integer('point_cost').notNull(),
    minTier: text('min_tier'),
    totalInventory: integer('total_inventory'),
    perUserLimit: integer('per_user_limit'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    validFrom: text('valid_from'),
    validTo: text('valid_to'),
  },
  (t) => ({ byOrg: index('org_perks_org').on(t.orgId) })
);

// Per-org tier thresholds projected from poisys.
export const orgTiers = sqliteTable(
  'org_tiers',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    minPoints: integer('min_points').notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => ({ byOrg: index('org_tiers_org').on(t.orgId) })
);

// Platform issuance rules (barycal-set global engine). Single active row + history.
export const globalRewardRules = sqliteTable('global_reward_rules', {
  id: text('id').primaryKey(),
  basePoints: integer('base_points').notNull().default(100),
  // e.g. { crossOrgStreak: {points, window}, sceneExplorer: {points, n} }
  bonuses: text('bonuses', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'`),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  updatedAt: text('updated_at').notNull(),
});

// Platform-run perks (barycal-owned, spent with GLOBAL points). v1 = first-party
// only; schema is sponsorship-ready (source/sponsor/placement/segment) for later.
export const platformPerks = sqliteTable(
  'platform_perks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    pointCost: integer('point_cost').notNull(),
    fulfillment: text('fulfillment', { enum: ['auto-digital', 'partner-code', 'manual'] })
      .notNull()
      .default('auto-digital'),
    source: text('source', { enum: ['first-party', 'sponsor', 'partner', 'org'] })
      .notNull()
      .default('first-party'),
    sponsorId: text('sponsor_id'),
    placement: integer('placement').notNull().default(0),
    segment: text('segment', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    totalInventory: integer('total_inventory'),
    perUserLimit: integer('per_user_limit'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    validFrom: text('valid_from'),
    validTo: text('valid_to'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byActive: index('platform_perks_active').on(t.active, t.validTo),
    bySource: index('platform_perks_source').on(t.source, t.placement),
  })
);

// Append-only points ledger. Two scopes per row so per-org AND global balances
// derive from one table. A check-in writes an 'earned' row at scope 'platform'
// (always) and another at scope 'org:<id>' (only if the org opted in). Tiers/rank
// use 'earned' rows only; spendable = earned - spend.
export const pointsLedger = sqliteTable(
  'points_ledger',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    scope: text('scope').notNull(), // 'platform' | 'org:<orgId>'
    delta: integer('delta').notNull(), // + earn, - spend, +/- void/refund
    kind: text('kind', { enum: ['earned', 'spend'] }).notNull(),
    reason: text('reason').notNull(), // checkin | bonus:* | redeem | void | refund
    sourceRef: text('source_ref'), // event id / redemption id
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ byUserScope: index('points_ledger_user_scope').on(t.userId, t.scope) })
);

// One earning check-in per user per event (dual-grant record).
export const checkIns = sqliteTable(
  'check_ins',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    eventId: text('event_id')
      .notNull()
      .references(() => rewardEvents.id),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    globalAwarded: integer('global_awarded').notNull().default(0),
    orgAwarded: integer('org_awarded').notNull().default(0),
    bonusBreakdown: text('bonus_breakdown', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ uniq: unique('check_ins_user_event').on(t.userId, t.eventId) })
);

// One-time redemption codes for org AND platform perks. codeHash only (never raw).
export const redemptions = sqliteTable(
  'redemptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    scope: text('scope').notNull(), // 'platform' | 'org:<orgId>'
    perkId: text('perk_id').notNull(), // org_perks.id or platform_perks.id
    codeHash: text('code_hash').notNull(),
    status: text('status', { enum: ['issued', 'redeemed', 'expired', 'voided'] })
      .notNull()
      .default('issued'),
    fulfillment: text('fulfillment'),
    issuedAt: text('issued_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    redeemedAt: text('redeemed_at'),
  },
  (t) => ({
    byUser: index('redemptions_user').on(t.userId),
    byCode: index('redemptions_code').on(t.codeHash),
  })
);

// RSVP to a projected reward event. Optional, but RSVP'ing 'going' ≥ X hours
// before doors unlocks the org's early-RSVP bonus (the timestamp is the commit
// time) and feeds organizer turnout forecasting.
export const rewardRsvps = sqliteTable(
  'reward_rsvps',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    eventId: text('event_id')
      .notNull()
      .references(() => rewardEvents.id),
    status: text('status', { enum: ['going', 'cant'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ uniq: unique('reward_rsvps_user_event').on(t.userId, t.eventId) })
);

// ============================== Platform admin & MFA ==============================
// Superadmin console (#37) + MFA hardening (#39). /superadmin (including the
// rewards admin) is gated via requireSuperadmin: platform_admins records the
// explicit grant, admin_audit_log is append-only, and the mfa_* tables back TOTP
// + single-use recovery codes.

export const platformAdmins = sqliteTable('platform_admins', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  grantedAt: text('granted_at').notNull(),
});

export const adminAuditLog = sqliteTable(
  'admin_audit_log',
  {
    id: text('id').primaryKey(),
    // append-only; no FK so the audit trail outlives any deleted user
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    summary: text('summary').notNull(),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byCreated: index('audit_created').on(t.createdAt),
    byActor: index('audit_actor').on(t.actorId),
  })
);

export const mfaCredentials = sqliteTable('mfa_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretEnc: text('secret_enc').notNull(),
  confirmedAt: text('confirmed_at'),
  createdAt: text('created_at').notNull(),
});

export const mfaRecoveryCodes = sqliteTable(
  'mfa_recovery_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: text('used_at'),
  },
  (t) => ({ byUser: index('recovery_user').on(t.userId) })
);

// Device push-notification tokens (one row per device install), populated by the
// native iOS/Android shell via POST /api/push/register; web visitors never write
// here. `token` is the FCM registration token (globally unique per install), so
// it's the conflict target — a token that moves to a newly signed-in user
// updates in place rather than duplicating.
export const pushTokens = sqliteTable(
  'push_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    token: text('token').notNull().unique(),
    platform: text('platform', { enum: ['ios', 'android', 'web'] }).notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({ byUser: index('push_tokens_user').on(t.userId) })
);

export type User = typeof users.$inferSelect;
export type RewardRsvp = typeof rewardRsvps.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrgFollow = typeof orgFollows.$inferSelect;
export type RewardEvent = typeof rewardEvents.$inferSelect;
export type OrgPerk = typeof orgPerks.$inferSelect;
export type OrgTier = typeof orgTiers.$inferSelect;
export type PlatformPerk = typeof platformPerks.$inferSelect;
export type GlobalRewardRules = typeof globalRewardRules.$inferSelect;
export type PointsLedgerRow = typeof pointsLedger.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type Redemption = typeof redemptions.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type Placement = typeof placements.$inferSelect;
// Named BarycalEvent (not Event) to avoid shadowing the global DOM/Workers `Event`.
export type BarycalEvent = typeof events.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type AdminAuditRow = typeof adminAuditLog.$inferSelect;
export type MfaCredential = typeof mfaCredentials.$inferSelect;
export type MfaRecoveryCode = typeof mfaRecoveryCodes.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
