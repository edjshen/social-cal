'use server';
import { requireUserId } from '../auth/session';
import { calendarWindow } from '../calendar';
import { toISOOrThrow } from '../validate';

// Fetch the viewer-visible events in [fromISO, toISO) for the calendar tab. Used
// for lazy-loading when the user navigates beyond the server-rendered window.
export async function loadCalendar(fromISO: string, toISO: string) {
  const uid = await requireUserId();
  const from = toISOOrThrow(fromISO, 'from');
  const to = toISOOrThrow(toISO, 'to');
  return calendarWindow(uid, from, to, { includePastRecurring: true });
}
