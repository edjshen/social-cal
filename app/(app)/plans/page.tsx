import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Plans · Barycal' };
import { calendarWindow } from '@/lib/calendar';
import { startOfToday } from '@/lib/domain/dates';
import PlansClient from '@/components/PlansClient';
export default async function PlansPage() {
  const meId = (await getSession()).userId!;
  const from = startOfToday();
  const to = new Date(from);
  to.setDate(to.getDate() + 60);
  const all = await calendarWindow(meId, from.toISOString(), to.toISOString());
  const mine = all.filter((e: any) => !e.busy && (e.creator?.id === meId || e.myRsvp));
  return <PlansClient events={mine} meId={meId} />;
}
