import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';

export const mayflyRooms = sqliteTable(
  'mayfly_rooms',
  {
    roomId: text('room_id').primaryKey(),
    threeWords: text('three_words'),
    mode: text('mode', { enum: ['sealed', 'open'] })
      .notNull()
      .default('sealed'),
    source: text('source', { enum: ['user', 'event'] }).notNull(),
    eventSlug: text('event_slug'),
    creatorPhone: text('creator_phone'),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at'),
  },
  (t) => ({
    byEvent: index('mayfly_rooms_event').on(t.eventSlug),
    byCreated: index('mayfly_rooms_created').on(t.createdAt),
  })
);

export const mayflyParticipants = sqliteTable(
  'mayfly_participants',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    profilePub: text('profile_pub').notNull(),
    handle: text('handle'),
    phone: text('phone'),
    joinedAt: text('joined_at').notNull(),
  },
  (t) => ({
    uniq: unique('mayfly_part_room_pub').on(t.roomId, t.profilePub),
    byRoom: index('mayfly_part_room').on(t.roomId),
  })
);

export const mayflyConsents = sqliteTable(
  'mayfly_consents',
  {
    id: text('id').primaryKey(),
    phone: text('phone').notNull(),
    consentVersion: text('consent_version').notNull(),
    context: text('context', { enum: ['create', 'join'] }).notNull(),
    roomId: text('room_id'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byPhone: index('mayfly_consents_phone').on(t.phone),
    byCreated: index('mayfly_consents_created').on(t.createdAt),
  })
);

export const mayflyRateLimits = sqliteTable(
  'mayfly_rate_limits',
  {
    id: text('id').primaryKey(),
    scope: text('scope').notNull(),
    k: text('k').notNull(),
    hits: integer('hits').notNull().default(0),
    windowStart: integer('window_start').notNull(),
  },
  (t) => ({ uniq: unique('mayfly_rl_scope_k').on(t.scope, t.k) })
);
