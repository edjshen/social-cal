import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GLOBAL_RULES,
  PLATFORM_SCOPE,
  balanceFor,
  balancesByScope,
  checkinWindowOpen,
  computeGrant,
  orgScope,
  resolveTier,
} from './rewards';
import type {
  CheckIn,
  GlobalRewardRules,
  OrgTier,
  PointsLedgerRow,
  RewardEvent,
} from '../db/schema';

const row = (p: Partial<PointsLedgerRow>): PointsLedgerRow => ({
  id: 'l',
  userId: 'u',
  scope: PLATFORM_SCOPE,
  delta: 0,
  kind: 'earned',
  reason: 'checkin',
  sourceRef: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...p,
});

describe('balances', () => {
  it('separates earned from spendable across scopes', () => {
    const rows = [
      row({ scope: PLATFORM_SCOPE, delta: 100, kind: 'earned' }),
      row({ scope: PLATFORM_SCOPE, delta: 50, kind: 'earned' }),
      row({ scope: PLATFORM_SCOPE, delta: -40, kind: 'spend' }),
      row({ scope: orgScope('o1'), delta: 200, kind: 'earned' }),
    ];
    const platform = balanceFor(rows, PLATFORM_SCOPE);
    expect(platform.earned).toBe(150); // spending never reduces earned (tiers/rank)
    expect(platform.spendable).toBe(110); // earned − spend
    expect(balanceFor(rows, orgScope('o1')).spendable).toBe(200);
    expect(balancesByScope(rows).size).toBe(2);
  });
});

describe('tiers', () => {
  const tiers: OrgTier[] = [
    { id: 't0', orgId: 'o', name: 'Regular', minPoints: 0, sort: 0 },
    { id: 't1', orgId: 'o', name: 'Gold', minPoints: 1000, sort: 1 },
    { id: 't2', orgId: 'o', name: 'VIP', minPoints: 5000, sort: 2 },
  ];
  it('resolves the highest met threshold and progress to next', () => {
    const r = resolveTier(tiers, 1500);
    expect(r.current?.name).toBe('Gold');
    expect(r.next?.name).toBe('VIP');
    expect(r.progress).toBeCloseTo((1500 - 1000) / (5000 - 1000));
  });
  it('caps at the top tier', () => {
    const r = resolveTier(tiers, 9999);
    expect(r.current?.name).toBe('VIP');
    expect(r.next).toBeNull();
    expect(r.progress).toBe(1);
  });
});

const event = (p: Partial<RewardEvent>): RewardEvent => ({
  id: 'e1',
  orgId: 'o1',
  title: 'Night',
  venueArea: '',
  startsAt: '2026-06-01T22:00:00.000Z',
  endsAt: '2026-06-02T04:00:00.000Z',
  checkinOpensAt: null,
  checkinClosesAt: null,
  orgBasePoints: 0,
  orgBonuses: {},
  status: 'published',
  createdAt: '2026-05-01T00:00:00.000Z',
  ...p,
});

describe('computeGrant', () => {
  const globalRules: GlobalRewardRules = {
    id: 'g',
    basePoints: 100,
    bonuses: {
      sceneExplorer: { on: true, points: 50, n: 3 },
      crossOrgStreak: { on: true, points: 25, windowDays: 14 },
    },
    active: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('always grants the global base; per-org is 0 when the org opted out', () => {
    const g = computeGrant(event({ orgBasePoints: 0 }), globalRules, {
      priorCheckIns: [],
      nowMs: Date.parse('2026-06-01T23:00:00.000Z'),
    });
    expect(g.global).toBe(100);
    expect(g.org).toBe(0);
  });

  it('adds per-org base + first-time bonus when the org opted in', () => {
    const ev = event({
      orgBasePoints: 80,
      orgBonuses: { firstTime: { on: true, points: 40 }, streak: { on: true, points: 20 } },
    });
    const g = computeGrant(ev, globalRules, {
      priorCheckIns: [],
      nowMs: Date.parse('2026-06-01T23:00:00.000Z'),
    });
    expect(g.org).toBe(120); // base 80 + firstTime 40 (streak excluded on first visit)
    expect(g.breakdown.org.firstTime).toBe(40);
    expect(g.breakdown.org.streak).toBeUndefined();
  });

  it('fires the streak (not first-time) on a repeat visit to the same org', () => {
    const prior: CheckIn[] = [
      {
        id: 'c0',
        userId: 'u',
        eventId: 'e0',
        orgId: 'o1',
        globalAwarded: 100,
        orgAwarded: 80,
        bonusBreakdown: {},
        createdAt: '2026-05-20T23:00:00.000Z',
      },
    ];
    const ev = event({
      orgBasePoints: 80,
      orgBonuses: { firstTime: { on: true, points: 40 }, streak: { on: true, points: 20 } },
    });
    const g = computeGrant(ev, globalRules, {
      priorCheckIns: prior,
      nowMs: Date.parse('2026-06-01T23:00:00.000Z'),
    });
    expect(g.breakdown.org.streak).toBe(20);
    expect(g.breakdown.org.firstTime).toBeUndefined();
    // cross-org streak fired (prior check-in within 14d) but scene explorer did not (only 1 org)
    expect(g.breakdown.global.crossOrgStreak).toBe(25);
    expect(g.breakdown.global.sceneExplorer).toBeUndefined();
  });
});

describe('early-RSVP bonus + default global rules', () => {
  const evEarly = event({
    orgBasePoints: 50,
    orgBonuses: { earlyRsvp: { on: true, points: 75, param: 24 } },
    startsAt: '2026-06-01T22:00:00.000Z',
  });

  it('grants earlyRsvp when RSVP committed ≥ param hours before doors', () => {
    const g = computeGrant(evEarly, DEFAULT_GLOBAL_RULES, {
      priorCheckIns: [],
      rsvpAt: '2026-05-30T22:00:00.000Z', // 48h before doors
      nowMs: Date.parse('2026-06-01T23:00:00.000Z'),
    });
    expect(g.breakdown.org.earlyRsvp).toBe(75);
    expect(g.global).toBe(100); // DEFAULT_GLOBAL_RULES base applies out-of-the-box
  });

  it('withholds earlyRsvp for a last-minute RSVP', () => {
    const g = computeGrant(evEarly, DEFAULT_GLOBAL_RULES, {
      priorCheckIns: [],
      rsvpAt: '2026-06-01T21:00:00.000Z', // 1h before
      nowMs: Date.parse('2026-06-01T23:00:00.000Z'),
    });
    expect(g.breakdown.org.earlyRsvp).toBeUndefined();
  });

  it('withholds earlyRsvp when there is no going RSVP', () => {
    const g = computeGrant(evEarly, DEFAULT_GLOBAL_RULES, {
      priorCheckIns: [],
      rsvpAt: null,
      nowMs: Date.parse('2026-06-01T23:00:00.000Z'),
    });
    expect(g.breakdown.org.earlyRsvp).toBeUndefined();
  });
});

describe('checkinWindowOpen', () => {
  it('honors explicit window and default grace', () => {
    const ev = event({
      checkinOpensAt: '2026-06-01T22:00:00.000Z',
      checkinClosesAt: '2026-06-02T02:00:00.000Z',
    });
    expect(checkinWindowOpen(ev, Date.parse('2026-06-01T23:00:00.000Z'))).toBe(true);
    expect(checkinWindowOpen(ev, Date.parse('2026-06-02T03:00:00.000Z'))).toBe(false);
    expect(checkinWindowOpen(ev, Date.parse('2026-06-01T21:00:00.000Z'))).toBe(false);
  });
});
