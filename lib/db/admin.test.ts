import { describe, it, expect, beforeEach, vi } from 'vitest';

const { rec } = vi.hoisted(() => ({ rec: { tables: [] as unknown[] } }));
// Recorder getDb: captures delete(table) order by REFERENCE. The select chain
// returns a minimal SQLWrapper ({ getSQL }) so drizzle's inArray(col, subquery)
// builds the condition WITHOUT executing; batch is a no-op.
vi.mock('./index', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ getSQL: () => ({}) }) }) }),
    delete: (t: unknown) => {
      rec.tables.push(t);
      return { where: () => ({}) };
    },
    batch: async () => {},
  }),
}));

import { deleteUserCascade, deleteEventCascade } from './admin';
import { users, events, attendance, connections, platformAdmins } from './schema';

beforeEach(() => {
  rec.tables = [];
});

describe('deleteUserCascade — FK-safe order', () => {
  it('9 statements, children before parents, users LAST', async () => {
    await deleteUserCascade('u9');
    expect(rec.tables).toHaveLength(9);
    expect(rec.tables[rec.tables.length - 1]).toBe(users);
    expect(rec.tables.indexOf(events)).toBeGreaterThan(rec.tables.indexOf(attendance));
    expect(rec.tables.indexOf(users)).toBeGreaterThan(rec.tables.indexOf(connections));
    expect(rec.tables).toContain(platformAdmins);
  });
});

describe('deleteEventCascade — order', () => {
  it('3 statements: attendance first, event last', async () => {
    await deleteEventCascade('e1');
    expect(rec.tables).toHaveLength(3);
    expect(rec.tables[0]).toBe(attendance);
    expect(rec.tables[rec.tables.length - 1]).toBe(events);
  });
});
