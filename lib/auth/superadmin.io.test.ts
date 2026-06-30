import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { session: {} as Record<string, unknown>, adminIds: new Set<string>() },
}));

vi.mock('./session', () => ({
  getSession: async () => state.session,
}));
// isPlatformAdmin reads the db; stub getDb so the lookup is hermetic.
vi.mock('../db', () => ({
  // ponytail: stub mirrors the current isPlatformAdmin query chain; update if the builder steps change.
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            state.adminIds.has(state.session.userId as string)
              ? [{ userId: state.session.userId }]
              : [],
        }),
      }),
    }),
  }),
}));

import { requireSuperadmin } from './superadmin';

beforeEach(() => {
  state.session = {};
  state.adminIds = new Set();
});

describe('requireSuperadmin — IO composition', () => {
  it('returns the userId for an aal2 admin', async () => {
    state.session = { userId: 'ed', aal: 'aal2' };
    state.adminIds = new Set(['ed']);
    await expect(requireSuperadmin()).resolves.toEqual({ userId: 'ed' });
  });
  it('throws FORBIDDEN for a non-admin (even at aal2)', async () => {
    state.session = { userId: 'mallory', aal: 'aal2' };
    await expect(requireSuperadmin()).rejects.toThrow('FORBIDDEN');
  });
  it('throws FORBIDDEN for an admin still at aal1 (no MFA step-up)', async () => {
    state.session = { userId: 'ed', aal: 'aal1' };
    state.adminIds = new Set(['ed']);
    await expect(requireSuperadmin()).rejects.toThrow('FORBIDDEN');
  });
  it('throws FORBIDDEN when the session has no userId (malformed cookie)', async () => {
    state.session = { aal: 'aal2' };
    await expect(requireSuperadmin()).rejects.toThrow('FORBIDDEN');
  });
});
