import { and, eq, gte, lt, or } from 'drizzle-orm';
import { getDb } from './index';
import { users, connections, placements, events, attendance } from './schema';

export async function getUserById(id: string) { return (await getDb().select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null; }
export async function getUserByHandle(handle: string) {
  return (await getDb().select().from(users).where(or(eq(users.handle, handle), eq(users.shareId, handle))).limit(1))[0] ?? null;
}
export async function getAllUsers() { return getDb().select().from(users); }
export async function getAllConnections() { return getDb().select().from(connections); }
export async function getAllPlacements() { return getDb().select().from(placements); }
export async function getAllAttendance() { return getDb().select().from(attendance); }
export async function getEventsBetween(startISO: string, endISO: string) {
  return getDb().select().from(events).where(and(gte(events.startTime, startISO), lt(events.startTime, endISO)));
}
export async function getEventById(id: string) { return (await getDb().select().from(events).where(eq(events.id, id)).limit(1))[0] ?? null; }
export async function getEventsByCreator(creatorId: string) { return getDb().select().from(events).where(eq(events.creatorId, creatorId)); }

// A bundle the domain layer needs for visibility/enrich across a set of events.
export async function getGraphContext() {
  const [u, c, p, a] = await Promise.all([getAllUsers(), getAllConnections(), getAllPlacements(), getAllAttendance()]);
  return { users: u, conns: c, places: p, attendance: a };
}
