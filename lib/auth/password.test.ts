import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const h = await hashPassword('orbit');
    expect(h).toContain('$'); // salt$hash format
    expect(await verifyPassword('orbit', h)).toBe(true);
    expect(await verifyPassword('nope', h)).toBe(false);
  });
  it('produces a different salt (and thus hash) each call', async () => {
    expect(await hashPassword('orbit')).not.toBe(await hashPassword('orbit'));
  });
});
