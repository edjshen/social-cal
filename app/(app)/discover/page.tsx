import { getSession } from '@/lib/auth/session';
import { getGraphContext, getEventsBetween } from '@/lib/db/queries';
import { canSeeContent, myConnectionIds } from '@/lib/domain/visibility';
import { enrich } from '@/lib/domain/enrich';
import { startOfToday, notExpired } from '@/lib/domain/dates';
import { calendarWindow } from '@/lib/calendar';
import DiscoverClient from '@/components/DiscoverClient';

export default async function DiscoverPage() {
  const meId = (await getSession()).userId!;
  const ctx = await getGraphContext();
  const from = startOfToday();
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  const conns = myConnectionIds(ctx.conns, meId);
  // Ghost users disappear from others' discovery (their own view still shows them).
  const ghostIds = new Set(ctx.users.filter((u) => u.ghost && u.id !== meId).map((u) => u.id));
  const all = await getEventsBetween(from.toISOString(), to.toISOString());
  const events = all
    .filter(
      (ev) =>
        notExpired(ev) &&
        !ghostIds.has(ev.creatorId) &&
        (ev.creatorId === meId || conns.has(ev.creatorId) || ev.visibility === 'public') &&
        canSeeContent(meId, ev, ctx.conns, ctx.places)
    )
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map((ev) => enrich(ev, meId, ctx));

  const mondayOf = (d: Date) => {
    const x = startOfToday(d);
    const wd = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - wd);
    return x;
  };
  const ws = mondayOf(new Date());
  const we = new Date(ws);
  we.setDate(we.getDate() + 7);
  const now = new Date();
  const mFirst = new Date(now.getFullYear(), now.getMonth(), 1);
  const mNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const week = {
    events: await calendarWindow(meId, ws.toISOString(), we.toISOString()),
    weekStartISO: ws.toISOString(),
  };
  const month = {
    events: await calendarWindow(meId, mFirst.toISOString(), mNext.toISOString()),
    monthISO: mFirst.toISOString(),
  };

  return <DiscoverClient events={events} meId={meId} week={week} month={month} />;
}
