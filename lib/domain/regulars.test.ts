import { describe, it, expect } from 'vitest';
import { computeRegulars } from './regulars';

const users = [
  { id: 'ed', handle: 'ed', displayName: 'Ed Shen', avatar: 'a,b' },
  { id: 'maya', handle: 'maya', displayName: 'Maya Chen', avatar: 'c,d' },
  { id: 'sam', handle: 'sam', displayName: 'Sam Ortiz', avatar: 'e,f' },
];
// ed co-attended 3 events with maya, 2 with sam
const events = [1,2,3].map((n) => ({ id: 'e'+n, creatorId: 'maya', type: 'event', title: 'Climb '+n, location: 'VITAL', startTime: `2026-0${n}-01T10:00:00Z` }))
  .concat([4,5].map((n) => ({ id: 'e'+n, creatorId: 'sam', type: 'event', title: 'Wine '+n, location: 'home', startTime: `2026-0${n}-02T20:00:00Z` })));
const attendance: any[] = [];
for (const n of [1,2,3]) { attendance.push({ eventId: 'e'+n, userId: 'ed', rsvp: 'going' }, { eventId: 'e'+n, userId: 'maya', rsvp: 'going' }); }
for (const n of [4,5]) { attendance.push({ eventId: 'e'+n, userId: 'ed', rsvp: 'going' }, { eventId: 'e'+n, userId: 'sam', rsvp: 'down' }); }

describe('computeRegulars', () => {
  it('splits regulars (>=3x) and rising (==2x), sorted by count', () => {
    const { regulars, rising } = computeRegulars('ed', events as any, attendance as any, users as any);
    expect(regulars.map((r) => r.user!.handle)).toEqual(['maya']);
    expect(regulars[0].count).toBe(3);
    expect(rising.map((r) => r.user!.handle)).toEqual(['sam']);
    expect(rising[0].count).toBe(2);
  });
});
