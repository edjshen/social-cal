import type { Connection, Placement, Attendance, User, BarycalEvent } from '../db/schema';
import { ATTEND, type PublicUser } from './types';
import { publicUser } from './helpers';
import { canSeeContent, myConnectionIds } from './visibility';

export interface EnrichCtx {
  users: User[];
  conns: Connection[];
  places: Placement[];
  attendance: Attendance[];
}

const byId = (users: User[], id: string) => users.find((u) => u.id === id) || null;

export function enrich(
  ev: BarycalEvent,
  viewer: string | null,
  ctx: EnrichCtx,
  opts: { detail?: boolean } = {}
) {
  // Ghost mode: a ghost's events are redacted to the free/busy stub for everyone
  // but the ghost themselves — hiding their identity AND content uniformly. This
  // is the single enforcement point for the whole event read path (Discover,
  // calendar, /e/[id]); profile pages additionally pre-filter ghost users.
  const creator = byId(ctx.users, ev.creatorId);
  const hiddenByGhost = !!creator?.ghost && viewer !== ev.creatorId;
  if (hiddenByGhost || !canSeeContent(viewer, ev, ctx.conns, ctx.places)) {
    // `cancelled` is carried even on the redacted stub so a cancelled occurrence
    // never surfaces as a phantom busy block on anyone's calendar.
    return {
      id: ev.id,
      type: 'busy' as const,
      busy: true,
      startTime: ev.startTime,
      endTime: ev.endTime,
      visibility: ev.visibility,
      cancelled: !!ev.cancelled,
      parentId: ev.parentId || null,
      originalDate: ev.originalDate || null,
    };
  }
  const att = ctx.attendance.filter((a) => a.eventId === ev.id);
  const mineIds = viewer ? myConnectionIds(ctx.conns, viewer) : new Set<string>();
  // A ghost stays hidden as an ATTENDEE too — never surface a ghost's identity in
  // social proof or the attendee roster (they can still see themselves).
  const notGhost = (uid: string) => uid === viewer || !byId(ctx.users, uid)?.ghost;
  const going = att.filter(
    (a) => ATTEND.includes(a.rsvp) && mineIds.has(a.userId) && notGhost(a.userId)
  );
  const out: any = {
    id: ev.id,
    type: ev.type,
    title: ev.title,
    description: ev.description || '',
    location: ev.location || '',
    startTime: ev.startTime,
    endTime: ev.endTime || null,
    recurring: ev.recurring || null,
    visibility: ev.visibility,
    allDay: !!ev.allDay,
    color: ev.color || null,
    // per-instance recurrence exception metadata (used by client expansion)
    parentId: ev.parentId || null,
    originalDate: ev.originalDate || null,
    cancelled: !!ev.cancelled,
    recurUntil: ev.recurUntil || null,
    creator: publicUser(creator),
    proof: {
      count: going.length,
      sample: going
        .slice(0, 3)
        .map((a) => publicUser(byId(ctx.users, a.userId)))
        .filter(Boolean) as PublicUser[],
    },
    myRsvp: viewer ? (att.find((a) => a.userId === viewer)?.rsvp ?? null) : null,
    // Ghost-filtered too, so the count can't betray a hidden attendee's presence
    // (consistent with proof.count / the attendees roster).
    attendeeCount: att.filter((a) => ATTEND.includes(a.rsvp) && notGhost(a.userId)).length,
  };
  if (opts.detail) {
    // Never ship the full roster to the client. For non-public events restrict
    // to the viewer's own connections (+ the creator + self); cap either way so
    // an event page can't be used to bulk-harvest who attended.
    const goingAll = att.filter((a) => ATTEND.includes(a.rsvp) && notGhost(a.userId));
    const shown =
      ev.visibility === 'public'
        ? goingAll
        : goingAll.filter(
            (a) => a.userId === ev.creatorId || a.userId === viewer || mineIds.has(a.userId)
          );
    out.attendees = shown
      .slice(0, 12)
      .map((a) => ({ ...publicUser(byId(ctx.users, a.userId)), rsvp: a.rsvp }));
  }
  return out;
}
export type EnrichedEvent = ReturnType<typeof enrich>;
