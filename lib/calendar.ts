import { getGraphContext, getEventsBetween, getCalendarEventsBetween } from './db/queries';
import { canSeeBusy, myConnectionIds } from './domain/visibility';
import { enrich } from './domain/enrich';

// `includePastRecurring` widens the fetch to long-running recurring series whose
// base predates the window (the calendar tab expands them client-side). Other
// callers (e.g. /plans, which lists raw events) keep the plain window so a past-
// dated recurring base doesn't surface as a stale list item.
export async function calendarWindow(
  meId: string,
  startISO: string,
  endISO: string,
  opts?: { includePastRecurring?: boolean }
) {
  const ctx = await getGraphContext();
  const conns = myConnectionIds(ctx.conns, meId);
  // Ghost users disappear from others' calendars (the viewer's own events stay).
  const ghostIds = new Set(ctx.users.filter((u) => u.ghost && u.id !== meId).map((u) => u.id));
  const all = await (opts?.includePastRecurring
    ? getCalendarEventsBetween(startISO, endISO)
    : getEventsBetween(startISO, endISO));
  return all
    .filter(
      (ev) =>
        !ghostIds.has(ev.creatorId) &&
        (ev.creatorId === meId ||
          ev.visibility === 'public' ||
          (conns.has(ev.creatorId) && canSeeBusy(meId, ev, ctx.conns, ctx.places)))
    )
    .map((ev) => enrich(ev, meId, ctx))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}
