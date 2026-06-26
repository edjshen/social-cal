import { getGraphContext, getEventsBetween } from './db/queries';
import { canSeeBusy, myConnectionIds } from './domain/visibility';
import { enrich } from './domain/enrich';

export async function calendarWindow(meId: string, startISO: string, endISO: string) {
  const ctx = await getGraphContext();
  const conns = myConnectionIds(ctx.conns, meId);
  const all = await getEventsBetween(startISO, endISO);
  return all
    .filter((ev) => ev.creatorId === meId || ev.visibility === 'public' || (conns.has(ev.creatorId) && canSeeBusy(meId, ev, ctx.conns, ctx.places)))
    .map((ev) => enrich(ev, meId, ctx))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}
