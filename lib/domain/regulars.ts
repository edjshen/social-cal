import type { Attendance, BarycalEvent, User } from '../db/schema';
import { ATTEND } from './types';
import { publicUser } from './helpers';

export function computeRegulars(
  me: string,
  events: BarycalEvent[],
  attendance: Attendance[],
  users: User[]
) {
  // A ghost never surfaces as someone else's Regular (they chose to disappear).
  const ghostIds = new Set(users.filter((u) => u.ghost && u.id !== me).map((u) => u.id));
  const myEventIds = attendance
    .filter((a) => a.userId === me && ATTEND.includes(a.rsvp))
    .map((a) => a.eventId);
  const tally = new Map<string, { count: number; last: string | null; contexts: Set<string> }>();
  for (const eid of myEventIds) {
    const ev = events.find((e) => e.id === eid);
    if (!ev) continue;
    for (const a of attendance.filter((x) => x.eventId === eid)) {
      if (a.userId === me || ghostIds.has(a.userId) || !ATTEND.includes(a.rsvp)) continue;
      const t = tally.get(a.userId) || {
        count: 0,
        last: null as string | null,
        contexts: new Set<string>(),
      };
      t.count += 1;
      if (!t.last || new Date(ev.startTime) > new Date(t.last)) t.last = ev.startTime;
      if (ev.location || ev.title)
        t.contexts.add((ev.type === 'intention' ? 'lunch' : ev.title.split(' ')[0]).toLowerCase());
      tally.set(a.userId, t);
    }
  }
  const rows = [...tally.entries()]
    .map(([id, t]) => ({
      user: publicUser(users.find((u) => u.id === id) || null),
      count: t.count,
      last: t.last,
      contexts: [...t.contexts].slice(0, 3),
    }))
    .filter((r) => r.user)
    .sort((a, b) => b.count - a.count || new Date(b.last!).getTime() - new Date(a.last!).getTime());
  return { regulars: rows.filter((r) => r.count >= 3), rising: rows.filter((r) => r.count === 2) };
}
