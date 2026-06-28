import { getDb } from './index';
import { events as eventsTable } from './schema';
import { getUserByHandle, getGraphContext, getEventsByCreator } from './queries';
import { canSeeContent, connectionStatus } from '../domain/visibility';
import { enrich } from '../domain/enrich';
import { publicUser } from '../domain/helpers';
import { startOfToday, notExpired } from '../domain/dates';
import { computeRegulars } from '../domain/regulars';
import { ATTEND } from '../domain/types';

export async function getProfileData(handleOrShareId: string, viewerId: string | null) {
  const u = await getUserByHandle(handleOrShareId);
  if (!u) return null;
  if (u.ghost && viewerId !== u.id) return null;
  const ctx = await getGraphContext();
  const from = startOfToday();
  const own = await getEventsByCreator(u.id);
  const upcoming = own
    .filter(
      (ev) =>
        new Date(ev.startTime) >= from &&
        notExpired(ev) &&
        canSeeContent(viewerId, ev, ctx.conns, ctx.places)
    )
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 12)
    .map((ev) => enrich(ev, viewerId, ctx));
  const pub = publicUser(u)!;
  const out: {
    user: typeof pub & { bio: string; scenes: string[]; ghost: boolean };
    upcoming: any[];
    isSelf: boolean;
    connection: string | null;
    stats?: { regulars: number; plans: number; scenes: number };
  } = {
    // Expose the real ghost flag only to the owner (so their edit form reflects
    // current state); everyone else always sees false. Ghost users are already
    // 404'd for non-self viewers above, so their true flag never ships to others.
    user: {
      ...pub,
      bio: u.bio,
      scenes: u.scenes || [],
      ghost: viewerId === u.id ? u.ghost : false,
    },
    upcoming,
    isSelf: viewerId === u.id,
    connection: viewerId && viewerId !== u.id ? connectionStatus(ctx.conns, viewerId, u.id) : null,
  };
  if (viewerId === u.id) {
    const allEvents = await getDb().select().from(eventsTable);
    out.stats = {
      regulars: computeRegulars(u.id, allEvents, ctx.attendance, ctx.users).regulars.length,
      plans: ctx.attendance.filter((a) => a.userId === u.id && ATTEND.includes(a.rsvp)).length,
      scenes: (u.scenes || []).length,
    };
  }
  return out;
}
export type ProfileData = NonNullable<Awaited<ReturnType<typeof getProfileData>>>;
