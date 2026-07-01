import type { Connection, OrbitMember, EventOrbit } from '../db/schema';
import type { Visibility } from './types';

type Ev = { creatorId: string; visibility: Visibility };

export function areConnected(conns: Connection[], a: string, b: string) {
  return conns.some(
    (c) => c.status === 'accepted' && ((c.aId === a && c.bId === b) || (c.aId === b && c.bId === a))
  );
}
export function myConnectionIds(conns: Connection[], me: string) {
  const ids = new Set<string>();
  for (const c of conns)
    if (c.status === 'accepted' && (c.aId === me || c.bId === me))
      ids.add(c.aId === me ? c.bId : c.aId);
  return ids;
}
export function connectionStatus(conns: Connection[], me: string, other: string) {
  const c = conns.find(
    (c) => (c.aId === me && c.bId === other) || (c.aId === other && c.bId === me)
  );
  if (!c) return 'none' as const;
  if (c.status === 'accepted') return 'connected' as const;
  return c.requestedBy === me ? ('pending_out' as const) : ('pending_in' as const);
}

// --- custom orbits (shared group calendars) --------------------------------

// The set of orbit ids `me` belongs to.
export function myOrbitIds(members: OrbitMember[], me: string | null): Set<string> {
  const ids = new Set<string>();
  if (!me) return ids;
  for (const m of members) if (m.userId === me) ids.add(m.orbitId);
  return ids;
}
// The set of orbit ids an event is shared onto. A per-instance exception row
// (parentId set) inherits its parent series' shares, so an edited/moved
// occurrence stays on the same orbit calendars as the series.
export function eventOrbitIds(
  eventOrbits: EventOrbit[],
  eventId: string,
  parentId?: string | null
): Set<string> {
  const ids = new Set<string>();
  for (const eo of eventOrbits)
    if (eo.eventId === eventId || (parentId && eo.eventId === parentId)) ids.add(eo.orbitId);
  return ids;
}
// True when `viewer` is a member of at least one orbit the event is shared to —
// the mechanism that lets orbit members see each other's shared events even
// without a direct connection.
export function sharedToViewer(
  viewer: string | null,
  eventId: string,
  parentId: string | null | undefined,
  eventOrbits: EventOrbit[],
  members: OrbitMember[]
): boolean {
  const mine = myOrbitIds(members, viewer);
  if (!mine.size) return false;
  for (const eo of eventOrbits)
    if ((eo.eventId === eventId || (parentId && eo.eventId === parentId)) && mine.has(eo.orbitId))
      return true;
  return false;
}

// Access is CREATOR-controlled. `viaOrbit` is true when the viewer shares an orbit
// calendar with the event (see sharedToViewer) — that alone grants content access,
// independent of the direct-connection graph. Otherwise a connection sees anything
// that isn't marked private; "My Orbit" (visibility 'orbit', or legacy 'inner') is
// the single tier of people you're connected to.
export function canSeeContent(
  viewer: string | null,
  ev: Ev,
  conns: Connection[],
  viaOrbit = false
): boolean {
  if (ev.visibility === 'public') return true;
  if (!viewer) return false;
  if (ev.creatorId === viewer) return true;
  if (viaOrbit) return true;
  if (!areConnected(conns, ev.creatorId, viewer)) return false;
  // Private events never reach the creator's connections at large — only the
  // creator and members of orbits it's shared to (handled by viaOrbit above).
  return ev.visibility !== 'private';
}
export function canSeeBusy(
  viewer: string | null,
  ev: Ev,
  conns: Connection[],
  viaOrbit = false
): boolean {
  if (canSeeContent(viewer, ev, conns, viaOrbit)) return true;
  if (!viewer) return false;
  // A private event stays fully hidden from non-members; other events still
  // surface as free/busy to the creator's connections.
  if (ev.visibility === 'private') return false;
  return areConnected(conns, ev.creatorId, viewer);
}
