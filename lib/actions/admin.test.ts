import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { admin: true, isTargetAdmin: false, calls: [] as string[] },
}));

vi.mock('../auth/superadmin', () => ({
  requireSuperadmin: async () => {
    if (!state.admin) throw new Error('FORBIDDEN');
    return { userId: 'ed' };
  },
  isPlatformAdmin: async () => state.isTargetAdmin,
}));
vi.mock('../db/audit', () => ({
  writeAudit: async (i: { action: string }) => {
    state.calls.push('audit:' + i.action);
  },
}));
vi.mock('../db/admin', () => ({
  deleteUserCascade: async () => {
    state.calls.push('deleteUserCascade');
  },
  deleteEventCascade: async () => {
    state.calls.push('deleteEventCascade');
  },
}));
vi.mock('../db', () => ({
  getDb: () => ({
    update: () => ({
      set: () => ({
        where: async () => {
          state.calls.push('update');
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        state.calls.push('delete');
      },
    }),
  }),
}));

import {
  adminDeleteUser,
  adminDeleteEvent,
  adminToggleGhost,
  adminForceResetPassword,
  adminRemoveConnection,
} from './admin';

beforeEach(() => {
  state.admin = true;
  state.isTargetAdmin = false;
  state.calls = [];
});

describe('admin actions — guard + audit', () => {
  it('rejects a non-admin and does NO work', async () => {
    state.admin = false;
    await expect(adminDeleteUser('u9')).rejects.toThrow('FORBIDDEN');
    expect(state.calls).toEqual([]);
  });
  it('deletes a user (cascade) and audits', async () => {
    await adminDeleteUser('u9');
    expect(state.calls).toEqual(['deleteUserCascade', 'audit:user.delete']);
  });
  it('refuses to delete the superadmin itself', async () => {
    await expect(adminDeleteUser('ed')).rejects.toThrow('CANNOT_DELETE_SELF');
    expect(state.calls).toEqual([]);
  });
  it('refuses to delete another platform admin', async () => {
    state.isTargetAdmin = true;
    await expect(adminDeleteUser('u2')).rejects.toThrow('CANNOT_DELETE_ADMIN');
    expect(state.calls).toEqual([]);
  });
  it('deletes an event (cascade) and audits', async () => {
    await adminDeleteEvent('e1');
    expect(state.calls).toEqual(['deleteEventCascade', 'audit:event.delete']);
  });
  it('toggles ghost and audits', async () => {
    await adminToggleGhost('u9', true);
    expect(state.calls).toEqual(['update', 'audit:user.ghost']);
  });
  it('force-resets a password (returns it once) and audits', async () => {
    const r = await adminForceResetPassword('u9');
    expect(r.tempPassword).toHaveLength(16);
    expect(state.calls).toEqual(['update', 'audit:user.password_reset']);
  });
  it('removes a connection and audits', async () => {
    await adminRemoveConnection('c1');
    expect(state.calls).toEqual(['delete', 'audit:connection.remove']);
  });
});
