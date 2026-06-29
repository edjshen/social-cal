import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Calendar · Barycal' };
import { calendarWindow } from '@/lib/calendar';
import CalendarApp from '@/components/calendar/CalendarApp';

// Full Google-Calendar-style tab. Renders an initial window of visible events
// (the viewer's own + everything their circles share, per the visibility rules)
// and hands off to the client app, which lazy-loads more as you navigate.
export default async function CalendarPage() {
  const meId = (await getSession()).userId!;
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 31);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setDate(to.getDate() + 92);
  const events = await calendarWindow(meId, from.toISOString(), to.toISOString(), {
    includePastRecurring: true,
  });
  return (
    <CalendarApp
      initialEvents={events as any}
      initialFromISO={from.toISOString()}
      initialToISO={to.toISOString()}
      meId={meId}
    />
  );
}
