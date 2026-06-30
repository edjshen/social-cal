import { describe, it, expect } from 'vitest';
import { assertSuperadmin } from './superadmin';

describe('assertSuperadmin — the pure privilege guard', () => {
  const ok = { userId: 'u1', aal: 'aal2' as const, isAdmin: true };

  it('passes for an aal2 platform admin', () => {
    expect(() => assertSuperadmin(ok)).not.toThrow();
  });
  it('throws FORBIDDEN when not a platform admin', () => {
    expect(() => assertSuperadmin({ ...ok, isAdmin: false })).toThrow('FORBIDDEN');
  });
  it('throws FORBIDDEN when only aal1 (MFA not satisfied)', () => {
    expect(() => assertSuperadmin({ ...ok, aal: 'aal1' })).toThrow('FORBIDDEN');
  });
  it('throws FORBIDDEN when no userId', () => {
    expect(() => assertSuperadmin({ userId: undefined, aal: 'aal2', isAdmin: true })).toThrow(
      'FORBIDDEN'
    );
  });
  it('throws FORBIDDEN when aal is undefined (pre-MFA session)', () => {
    expect(() => assertSuperadmin({ userId: 'u1', aal: undefined, isAdmin: true })).toThrow(
      'FORBIDDEN'
    );
  });
});
