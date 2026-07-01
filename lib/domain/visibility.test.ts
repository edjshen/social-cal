import { describe, it, expect } from 'vitest';
import {
  areConnected,
  myConnectionIds,
  connectionStatus,
  canSeeContent,
  canSeeBusy,
  myOrbitIds,
  eventOrbitIds,
  sharedToViewer,
} from './visibility';
import type { Connection, OrbitMember, EventOrbit } from '../db/schema';
import type { Visibility } from './types';

const conns: Connection[] = [
  { id: 'c1', aId: 'ed', bId: 'maya', status: 'accepted', requestedBy: 'ed', createdAt: '' },
  { id: 'c2', aId: 'jordan', bId: 'ed', status: 'pending', requestedBy: 'jordan', createdAt: '' },
];
const ev = (over: Partial<{ creatorId: string; visibility: Visibility }> = {}) => ({
  creatorId: 'maya',
  visibility: 'orbit' as Visibility,
  ...over,
});

describe('visibility', () => {
  it('areConnected: only accepted, either direction', () => {
    expect(areConnected(conns, 'ed', 'maya')).toBe(true);
    expect(areConnected(conns, 'maya', 'ed')).toBe(true);
    expect(areConnected(conns, 'ed', 'jordan')).toBe(false);
  });
  it('myConnectionIds: accepted partners of me', () => {
    expect([...myConnectionIds(conns, 'ed')]).toEqual(['maya']);
  });
  it('connectionStatus: none/connected/pending_in/pending_out', () => {
    expect(connectionStatus(conns, 'ed', 'maya')).toBe('connected');
    expect(connectionStatus(conns, 'ed', 'jordan')).toBe('pending_in');
    expect(connectionStatus(conns, 'jordan', 'ed')).toBe('pending_out');
    expect(connectionStatus(conns, 'ed', 'nobody')).toBe('none');
  });

  it('canSeeContent: public to anyone, self always, one "My Orbit" tier for connections', () => {
    expect(canSeeContent('anyone', ev({ visibility: 'public' }), conns)).toBe(true);
    expect(canSeeContent('maya', ev({ creatorId: 'maya' }), conns)).toBe(true);
    // Every connection is in "My Orbit" now — both 'orbit' and legacy 'inner' show.
    expect(canSeeContent('ed', ev({ visibility: 'orbit' }), conns)).toBe(true);
    expect(canSeeContent('ed', ev({ visibility: 'inner' }), conns)).toBe(true);
    expect(canSeeContent(null, ev({ visibility: 'orbit' }), conns)).toBe(false);
    expect(canSeeContent('stranger', ev({ visibility: 'orbit' }), conns)).toBe(false);
  });
  it('canSeeContent: private is hidden from connections unless shared via an orbit', () => {
    expect(canSeeContent('ed', ev({ visibility: 'private' }), conns)).toBe(false);
    // viaOrbit grants content access even for a private event.
    expect(canSeeContent('ed', ev({ visibility: 'private' }), conns, true)).toBe(true);
  });
  it('canSeeContent: an orbit member sees a shared event even with no direct connection', () => {
    expect(canSeeContent('stranger', ev({ visibility: 'orbit' }), conns, true)).toBe(true);
    expect(canSeeContent('stranger', ev({ visibility: 'private' }), conns, true)).toBe(true);
  });
  it('canSeeBusy: connections see busy for non-private; private stays fully hidden', () => {
    // A connection sees content of non-private events, so busy is trivially true.
    expect(canSeeBusy('ed', ev({ visibility: 'orbit' }), conns)).toBe(true);
    // Private, not shared → not even busy.
    expect(canSeeBusy('ed', ev({ visibility: 'private' }), conns)).toBe(false);
    expect(canSeeBusy('stranger', ev({ visibility: 'orbit' }), conns)).toBe(false);
  });
});

describe('orbit sharing helpers', () => {
  const members: OrbitMember[] = [
    { id: 'm1', orbitId: 'o1', userId: 'ed', role: 'owner', createdAt: '' },
    { id: 'm2', orbitId: 'o1', userId: 'theo', role: 'member', createdAt: '' },
    { id: 'm3', orbitId: 'o2', userId: 'maya', role: 'owner', createdAt: '' },
  ];
  const eventOrbits: EventOrbit[] = [
    { id: 'eo1', eventId: 'e1', orbitId: 'o1' },
    { id: 'eo2', eventId: 'series', orbitId: 'o2' },
  ];

  it('myOrbitIds: the orbits a user belongs to', () => {
    expect([...myOrbitIds(members, 'ed')]).toEqual(['o1']);
    expect([...myOrbitIds(members, 'maya')]).toEqual(['o2']);
    expect(myOrbitIds(members, 'stranger').size).toBe(0);
    expect(myOrbitIds(members, null).size).toBe(0);
  });
  it('eventOrbitIds: direct shares plus inherited parent-series shares', () => {
    expect([...eventOrbitIds(eventOrbits, 'e1')]).toEqual(['o1']);
    // An exception row inherits its parent series' orbit placement.
    expect([...eventOrbitIds(eventOrbits, 'exception', 'series')]).toEqual(['o2']);
    expect(eventOrbitIds(eventOrbits, 'unknown').size).toBe(0);
  });
  it('sharedToViewer: true only when the viewer belongs to a shared orbit', () => {
    expect(sharedToViewer('theo', 'e1', null, eventOrbits, members)).toBe(true); // theo ∈ o1
    expect(sharedToViewer('maya', 'e1', null, eventOrbits, members)).toBe(false); // maya ∉ o1
    expect(sharedToViewer('maya', 'exception', 'series', eventOrbits, members)).toBe(true); // via parent
    expect(sharedToViewer(null, 'e1', null, eventOrbits, members)).toBe(false);
  });
});
