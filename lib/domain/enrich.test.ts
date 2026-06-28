import { describe, it, expect } from 'vitest';
import { enrich, type EnrichCtx } from './enrich';

const users = [
  { id: 'ed', handle: 'ed', displayName: 'Ed Shen', avatar: 'a,b' },
  { id: 'maya', handle: 'maya', displayName: 'Maya Chen', avatar: 'c,d' },
];
const conns = [
  { id: 'c', aId: 'ed', bId: 'maya', status: 'accepted', requestedBy: 'ed', createdAt: '' },
];
const ctx: EnrichCtx = {
  users: users as any,
  conns: conns as any,
  places: [],
  attendance: [
    { id: 'a1', eventId: 'e1', userId: 'maya', rsvp: 'going', createdAt: '' },
    { id: 'a2', eventId: 'e1', userId: 'ed', rsvp: 'down', createdAt: '' },
  ] as any,
};
const event = {
  id: 'e1',
  creatorId: 'maya',
  type: 'event',
  title: 'Wine',
  description: '',
  location: 'Ruffian',
  startTime: '2026-07-01T20:00:00Z',
  endTime: null,
  recurring: null,
  visibility: 'orbit',
  expiresAt: null,
};

describe('enrich', () => {
  it('returns busy stub when content not visible — leaks no content fields', () => {
    const out = enrich(event as any, 'stranger', { ...ctx, conns: [] as any }) as any;
    expect(out).toMatchObject({ type: 'busy', busy: true, startTime: event.startTime });
    // privacy: the busy stub must NOT carry any content/social fields
    expect(out.title).toBeUndefined();
    expect(out.creator).toBeUndefined();
    expect(out.proof).toBeUndefined();
    expect(out.location).toBeUndefined();
    expect(out.description).toBeUndefined();
    expect(out.attendeeCount).toBeUndefined();
  });
  it('excludes "cant" rsvps from proof and attendeeCount', () => {
    const ctxCant: EnrichCtx = {
      ...ctx,
      attendance: [{ id: 'a1', eventId: 'e1', userId: 'maya', rsvp: 'cant', createdAt: '' }] as any,
    };
    const out: any = enrich(event as any, 'ed', ctxCant);
    expect(out.proof.count).toBe(0);
    expect(out.attendeeCount).toBe(0);
  });
  it('returns full payload with proof (connections only) + myRsvp for a viewer who can see it', () => {
    const out: any = enrich(event as any, 'ed', ctx);
    expect(out.title).toBe('Wine');
    expect(out.creator.handle).toBe('maya');
    expect(out.proof.count).toBe(1); // maya is ed's connection & going
    expect(out.myRsvp).toBe('down');
    expect(out.attendeeCount).toBe(2);
  });
});
