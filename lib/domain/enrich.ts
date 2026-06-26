import type { Connection, Placement, Attendance, User, OrbitEvent } from '../db/schema';
import { ATTEND, type PublicUser } from './types';
import { publicUser } from './helpers';
import { canSeeContent, myConnectionIds } from './visibility';

export interface EnrichCtx { users: User[]; conns: Connection[]; places: Placement[]; attendance: Attendance[]; }

const byId = (users: User[], id: string) => users.find((u) => u.id === id) || null;

export function enrich(ev: OrbitEvent, viewer: string | null, ctx: EnrichCtx, opts: { detail?: boolean } = {}) {
  if (!canSeeContent(viewer, ev, ctx.conns, ctx.places)) {
    return { id: ev.id, type: 'busy' as const, busy: true, startTime: ev.startTime, endTime: ev.endTime, visibility: ev.visibility };
  }
  const att = ctx.attendance.filter((a) => a.eventId === ev.id);
  const mineIds = viewer ? myConnectionIds(ctx.conns, viewer) : new Set<string>();
  const going = att.filter((a) => ATTEND.includes(a.rsvp) && mineIds.has(a.userId));
  const out: any = {
    id: ev.id, type: ev.type, title: ev.title, description: ev.description || '', location: ev.location || '',
    startTime: ev.startTime, endTime: ev.endTime || null, recurring: ev.recurring || null, visibility: ev.visibility,
    creator: publicUser(byId(ctx.users, ev.creatorId)),
    proof: { count: going.length, sample: going.slice(0, 3).map((a) => publicUser(byId(ctx.users, a.userId))).filter(Boolean) as PublicUser[] },
    myRsvp: viewer ? (att.find((a) => a.userId === viewer)?.rsvp ?? null) : null,
    attendeeCount: att.filter((a) => ATTEND.includes(a.rsvp)).length,
  };
  if (opts.detail) out.attendees = att.filter((a) => ATTEND.includes(a.rsvp)).map((a) => ({ ...publicUser(byId(ctx.users, a.userId)), rsvp: a.rsvp }));
  return out;
}
export type EnrichedEvent = ReturnType<typeof enrich>;
