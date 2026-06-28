import type { Connection, Placement } from '../db/schema';
import type { Tier, Visibility } from './types';

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
export function tierOf(places: Placement[], owner: string, other: string): Tier | null {
  const p = places.find((p) => p.ownerId === owner && p.otherId === other);
  return p ? p.tier : null;
}
// Access is CREATOR-controlled: the tier the creator placed the viewer into decides
// visibility of the creator's inner content. A viewer cannot self-grant access by
// placing the creator into their own inner circle. (Matches the original app and the
// seed's reciprocal placements.)
export function canSeeContent(
  viewer: string | null,
  ev: Ev,
  conns: Connection[],
  places: Placement[]
) {
  if (ev.visibility === 'public') return true;
  if (!viewer) return false;
  if (ev.creatorId === viewer) return true;
  if (!areConnected(conns, ev.creatorId, viewer)) return false;
  const tier = tierOf(places, ev.creatorId, viewer) || 'orbit';
  if (ev.visibility === 'orbit') return true;
  if (ev.visibility === 'inner') return tier === 'inner';
  return false;
}
export function canSeeBusy(
  viewer: string | null,
  ev: Ev,
  conns: Connection[],
  places: Placement[]
) {
  if (canSeeContent(viewer, ev, conns, places)) return true;
  if (!viewer) return false;
  return areConnected(conns, ev.creatorId, viewer);
}
