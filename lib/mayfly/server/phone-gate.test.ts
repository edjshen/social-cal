import { describe, it, expect, beforeEach, vi } from 'vitest';

// Control the Twilio layer directly: whether Verify is configured and whether a
// submitted code is accepted. Lets us test the gate logic without real Twilio.
const { state } = vi.hoisted(() => ({
  state: { configured: true, approve: true } as { configured: boolean; approve: boolean },
}));

vi.mock('./twilio-verify', () => ({
  isVerifyConfigured: () => state.configured,
  checkCode: async () =>
    state.approve
      ? { ok: true }
      : { ok: false, error: 'That code didn’t match. Try again.', code: 'invalid' },
}));

// verifyOtpOrReject never touches rate limiting, but phone-gate.ts imports the
// module at load time — stub it so the import is hermetic (no D1 / CF context).
vi.mock('./rate-limit', () => ({
  consumeServerRateLimit: vi.fn(),
  clientIpKey: vi.fn(),
  hashedRateLimitKey: vi.fn(),
  rateLimitResponse: vi.fn(),
}));

import { verifyOtpOrReject } from './phone-gate';

const PHONE = '+15551234567';

beforeEach(() => {
  state.configured = true;
  state.approve = true;
});

describe('verifyOtpOrReject — the SMS gate', () => {
  it('ALLOWS through (returns null) when configured and the code is correct', async () => {
    state.configured = true;
    state.approve = true;
    const r = await verifyOtpOrReject(PHONE, '123456');
    expect(r).toBeNull();
  });

  it('BLOCKS (400) when configured but no code was submitted', async () => {
    state.configured = true;
    const r = await verifyOtpOrReject(PHONE, undefined);
    expect(r).not.toBeNull();
    expect(r!.status).toBe(400);
  });

  it('BLOCKS (400) when configured and the code is wrong', async () => {
    state.configured = true;
    state.approve = false;
    const r = await verifyOtpOrReject(PHONE, '000000');
    expect(r).not.toBeNull();
    expect(r!.status).toBe(400);
    const body = (await r!.json()) as { code?: string };
    expect(body.code).toBe('invalid');
  });

  // The whole point of removing MAYFLY_ALLOW_UNVERIFIED: when Twilio is not
  // fully configured there is no longer any bypass — the gate fails CLOSED.
  it('FAILS CLOSED (503) when Twilio is not configured — no dev bypass', async () => {
    state.configured = false;
    const r = await verifyOtpOrReject(PHONE, '123456');
    expect(r).not.toBeNull();
    expect(r!.status).toBe(503);
  });

  it('fails closed (503) when unconfigured even with no code', async () => {
    state.configured = false;
    const r = await verifyOtpOrReject(PHONE, undefined);
    expect(r).not.toBeNull();
    expect(r!.status).toBe(503);
  });
});
