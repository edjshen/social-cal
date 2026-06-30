import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { getDb } from './index';
import {
  users,
  connections,
  placements,
  events,
  attendance,
  adminAuditLog,
  mfaCredentials,
  mfaRecoveryCodes,
  platformAdmins,
} from './schema';

// --- reads (unscoped; admin sees everything) ---
export async function adminListUsers() {
  return getDb()
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      email: users.email,
      ghost: users.ghost,
      createdAt: users.createdAt,
      events: sql<number>`(select count(*) from ${events} where ${events.creatorId} = ${users.id})`,
      connections: sql<number>`(select count(*) from ${connections} where (${connections.aId} = ${users.id} or ${connections.bId} = ${users.id}) and ${connections.status} = 'accepted')`,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function adminGetUserDetail(userId: string) {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  const [evs, conns, places, rsvps] = await db.batch([
    db.select().from(events).where(eq(events.creatorId, userId)),
    db
      .select()
      .from(connections)
      .where(or(eq(connections.aId, userId), eq(connections.bId, userId))),
    db
      .select()
      .from(placements)
      .where(or(eq(placements.ownerId, userId), eq(placements.otherId, userId))),
    db.select().from(attendance).where(eq(attendance.userId, userId)),
  ] as const);
  return { user: u, events: evs, connections: conns, placements: places, rsvps };
}

export async function adminListEvents() {
  // No canSeeContent — admin sees every event regardless of visibility.
  return getDb()
    .select({
      id: events.id,
      title: events.title,
      type: events.type,
      visibility: events.visibility,
      startTime: events.startTime,
      creatorId: events.creatorId,
      creatorHandle: users.handle,
    })
    .from(events)
    .leftJoin(users, eq(events.creatorId, users.id))
    .orderBy(desc(events.startTime));
}

export async function adminListConnections() {
  return getDb().select().from(connections).orderBy(desc(connections.createdAt));
}

export async function adminStats() {
  const db = getDb();
  const since = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
  const [[u], [g], byType, [rsvp], [conn], [d7], [d30]] = await db.batch([
    db.select({ n: sql<number>`count(*)` }).from(users),
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.ghost, true)),
    db
      .select({ type: events.type, n: sql<number>`count(*)` })
      .from(events)
      .groupBy(events.type),
    db.select({ n: sql<number>`count(*)` }).from(attendance),
    db
      .select({ n: sql<number>`count(*)` })
      .from(connections)
      .where(eq(connections.status, 'accepted')),
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, since(7))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, since(30))),
  ] as const);
  return {
    users: u.n,
    ghosted: g.n,
    rsvps: rsvp.n,
    connections: conn.n,
    signups7d: d7.n,
    signups30d: d30.n,
    eventsByType: byType as { type: string; n: number }[],
  };
}
export type AdminStats = Awaited<ReturnType<typeof adminStats>>;

export async function adminListAudit(
  opts: { limit?: number; offset?: number; action?: string; actor?: string } = {}
) {
  const { limit = 50, offset = 0, action, actor } = opts;
  const where = and(
    action ? eq(adminAuditLog.action, action) : undefined,
    actor ? eq(adminAuditLog.actorId, actor) : undefined
  );
  return getDb()
    .select()
    .from(adminAuditLog)
    .where(where)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit)
    .offset(offset);
}

// --- destructive cascade builders (FK-safe order: children before parents) ---
// events.parentId has NO FK, and exception rows share creatorId, so deleting
// `events WHERE creatorId = U` removes a user's base AND exception rows.
export async function deleteUserCascade(userId: string) {
  const db = getDb();
  const evIds = db.select({ id: events.id }).from(events).where(eq(events.creatorId, userId));
  await db.batch([
    db.delete(attendance).where(eq(attendance.userId, userId)),
    db.delete(attendance).where(inArray(attendance.eventId, evIds)),
    db.delete(events).where(eq(events.creatorId, userId)),
    db.delete(placements).where(or(eq(placements.ownerId, userId), eq(placements.otherId, userId))),
    db
      .delete(connections)
      .where(
        or(
          eq(connections.aId, userId),
          eq(connections.bId, userId),
          eq(connections.requestedBy, userId)
        )
      ),
    db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId)),
    db.delete(mfaCredentials).where(eq(mfaCredentials.userId, userId)),
    db.delete(platformAdmins).where(eq(platformAdmins.userId, userId)),
    db.delete(users).where(eq(users.id, userId)),
  ] as const);
}

export async function deleteEventCascade(eventId: string) {
  const db = getDb();
  await db.batch([
    db.delete(attendance).where(eq(attendance.eventId, eventId)),
    db.delete(events).where(eq(events.parentId, eventId)), // recurrence exceptions
    db.delete(events).where(eq(events.id, eventId)),
  ] as const);
}
