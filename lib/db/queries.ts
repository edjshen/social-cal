import { and, eq, gte, gt, lt, or, isNull, isNotNull, inArray } from 'drizzle-orm';
import { getDb } from './index';
import {
  users,
  connections,
  placements,
  events,
  attendance,
  orbits,
  orbitMembers,
  eventOrbits,
} from './schema';

export async function getUserById(id: string) {
  return (await getDb().select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null;
}
export async function getUserByHandle(handle: string) {
  return (
    (
      await getDb()
        .select()
        .from(users)
        .where(or(eq(users.handle, handle), eq(users.shareId, handle)))
        .limit(1)
    )[0] ?? null
  );
}
export async function getAllUsers() {
  return getDb().select().from(users);
}
export async function getAllConnections() {
  return getDb().select().from(connections);
}
export async function getAllPlacements() {
  return getDb().select().from(placements);
}
export async function getAllAttendance() {
  return getDb().select().from(attendance);
}
export async function getAllOrbits() {
  return getDb().select().from(orbits);
}
export async function getAllOrbitMembers() {
  return getDb().select().from(orbitMembers);
}
export async function getAllEventOrbits() {
  return getDb().select().from(eventOrbits);
}
export async function getOrbitById(id: string) {
  return (await getDb().select().from(orbits).where(eq(orbits.id, id)).limit(1))[0] ?? null;
}
export async function getOrbitMembers(orbitId: string) {
  return getDb().select().from(orbitMembers).where(eq(orbitMembers.orbitId, orbitId));
}
// Every orbit `userId` belongs to, with the caller's role in each.
export async function getOrbitsForUser(userId: string) {
  const mine = await getDb().select().from(orbitMembers).where(eq(orbitMembers.userId, userId));
  if (!mine.length) return [] as { orbit: typeof orbits.$inferSelect; role: string }[];
  const ids = mine.map((m) => m.orbitId);
  const rows = await getDb().select().from(orbits).where(inArray(orbits.id, ids));
  const roleBy = new Map(mine.map((m) => [m.orbitId, m.role]));
  return rows
    .map((o) => ({ orbit: o, role: roleBy.get(o.id) ?? 'member' }))
    .sort((a, b) => a.orbit.name.localeCompare(b.orbit.name));
}
// Orbit ids an event is currently shared onto (used to pre-check the editor).
export async function getEventOrbitIds(eventId: string) {
  const rows = await getDb()
    .select({ orbitId: eventOrbits.orbitId })
    .from(eventOrbits)
    .where(eq(eventOrbits.eventId, eventId));
  return rows.map((r) => r.orbitId);
}
// Every event placed on an orbit's shared calendar (unfiltered; callers enrich
// and window it for the viewer).
export async function getEventsForOrbit(orbitId: string) {
  const links = await getDb()
    .select({ eventId: eventOrbits.eventId })
    .from(eventOrbits)
    .where(eq(eventOrbits.orbitId, orbitId));
  if (!links.length) return [];
  return getDb()
    .select()
    .from(events)
    .where(inArray(events.id, [...new Set(links.map((l) => l.eventId))]));
}
export async function getEventsBetween(startISO: string, endISO: string) {
  return getDb()
    .select()
    .from(events)
    .where(and(gte(events.startTime, startISO), lt(events.startTime, endISO)));
}
// Like getEventsBetween, but also pulls recurring series that STARTED before the
// window and are still active (no recur_until, or it ends after the window
// starts). Their generated occurrences can land inside the window even though
// the stored base row's start_time predates it — needed so the calendar shows
// long-running weekly/monthly events. The client expands these into occurrences.
export async function getCalendarEventsBetween(startISO: string, endISO: string) {
  return getDb()
    .select()
    .from(events)
    .where(
      or(
        and(gte(events.startTime, startISO), lt(events.startTime, endISO)),
        and(
          isNotNull(events.recurring),
          lt(events.startTime, startISO),
          or(isNull(events.recurUntil), gt(events.recurUntil, startISO))
        )
      )
    );
}
export async function getEventById(id: string) {
  return (await getDb().select().from(events).where(eq(events.id, id)).limit(1))[0] ?? null;
}
export async function getEventsByCreator(creatorId: string) {
  return getDb().select().from(events).where(eq(events.creatorId, creatorId));
}

// A bundle the domain layer needs for visibility/enrich across a set of events.
export async function getGraphContext() {
  const [u, c, p, a, o, m, eo] = await Promise.all([
    getAllUsers(),
    getAllConnections(),
    getAllPlacements(),
    getAllAttendance(),
    getAllOrbits(),
    getAllOrbitMembers(),
    getAllEventOrbits(),
  ]);
  return { users: u, conns: c, places: p, attendance: a, orbits: o, members: m, eventOrbits: eo };
}
