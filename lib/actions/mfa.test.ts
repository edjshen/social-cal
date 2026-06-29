import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    session: {} as Record<string, unknown>,
    cred: null as null | { secretEnc: string; confirmedAt: string | null },
  },
}));

vi.mock('../auth/session', () => ({
  getSession: async () => ({ ...state.session, save: vi.fn(async () => {}) }),
  requireUserId: async () => {
    if (!state.session.userId) throw new Error('UNAUTHORIZED');
    return state.session.userId;
  },
}));
vi.mock('../auth/crypto', () => ({
  encryptSecret: async (s: string) => `enc(${s})`,
  decryptSecret: async (s: string) => s.replace(/^enc\(|\)$/g, ''),
}));
vi.mock('../db/mfa-queries', () => ({
  getMfaCredential: async () => state.cred,
  upsertMfaCredential: async (_u: string, secretEnc: string) => {
    state.cred = { secretEnc, confirmedAt: null };
  },
  confirmMfaCredential: async () => {
    if (state.cred) state.cred.confirmedAt = '2026-06-29T00:00:00.000Z';
  },
  replaceRecoveryCodes: vi.fn(async () => {}),
}));

import { startMfaEnrollment, confirmMfaEnrollment } from './mfa';
import * as OTPAuth from 'otpauth';

beforeEach(() => {
  state.session = { userId: 'ed' };
  state.cred = null;
});

describe('MFA enrollment', () => {
  it('startMfaEnrollment stores an encrypted secret and returns a QR data URL', async () => {
    const r = await startMfaEnrollment();
    expect(state.cred?.secretEnc).toMatch(/^enc\(/);
    expect(r.qrDataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });
  it('confirmMfaEnrollment accepts a valid code and returns 10 recovery codes', async () => {
    await startMfaEnrollment();
    const secret = state.cred!.secretEnc.replace(/^enc\(|\)$/g, '');
    const live = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();
    const r = await confirmMfaEnrollment(live);
    expect(r.recoveryCodes).toHaveLength(10);
    expect(state.cred!.confirmedAt).toBeTruthy();
  });
  it('confirmMfaEnrollment rejects a wrong code', async () => {
    await startMfaEnrollment();
    await expect(confirmMfaEnrollment('000000')).rejects.toThrow();
  });
});
