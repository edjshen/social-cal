import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull().unique(),
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

export type User = typeof users.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type Placement = typeof placements.$inferSelect;
// Named BarycalEvent (not Event) to avoid shadowing the global DOM/Workers `Event`.
export type BarycalEvent = typeof events.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
