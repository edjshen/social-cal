import { describe, it, expect } from 'vitest';
import { buildAuditRow } from './audit';

describe('buildAuditRow', () => {
  it('produces a complete, id-stamped row', () => {
    const row = buildAuditRow({
      actorId: 'ed',
      action: 'user.delete',
      targetType: 'user',
      targetId: 'u9',
      summary: 'deleted @spam',
    });
    expect(row.id).toBeTruthy();
    expect(row.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(row).toMatchObject({
      actorId: 'ed',
      action: 'user.delete',
      targetType: 'user',
      targetId: 'u9',
    });
  });
});
