import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Controllable Cloudflare env. Mutated per-test; the mock reads it live.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | undefined>,
}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: mockEnv }),
}));

import { isVerifyConfigured, sendCode, checkCode } from './twilio-verify';

const FULL = {
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'tok_test',
  TWILIO_VERIFY_SERVICE_SID: 'VA_test',
};

function setEnv(obj: Record<string, string | undefined>) {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  Object.assign(mockEnv, obj);
}

const TWILIO_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'];
function clearProcessEnv() {
  for (const k of TWILIO_KEYS) delete process.env[k];
}

// Reset BOTH sources before each test: the mocked Cloudflare env and process.env
// (the new fallback reads process.env, so leakage would make tests non-hermetic).
beforeEach(() => {
  setEnv({});
  clearProcessEnv();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearProcessEnv();
});

describe('isVerifyConfigured', () => {
  it('is true only when all three Twilio vars are present', () => {
    setEnv(FULL);
    expect(isVerifyConfigured()).toBe(true);
  });

  // This is the project's CURRENT .env state: account SID + auth token, but no
  // Verify Service SID. The gate must treat this as "not configured".
  it('is false when the Verify Service SID is missing (current .env state)', () => {
    setEnv({ TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 'tok' });
    expect(isVerifyConfigured()).toBe(false);
  });

  it('is false when the account SID is missing', () => {
    setEnv({ TWILIO_AUTH_TOKEN: 'tok', TWILIO_VERIFY_SERVICE_SID: 'VA' });
    expect(isVerifyConfigured()).toBe(false);
  });

  it('is false when the auth token is missing', () => {
    setEnv({ TWILIO_ACCOUNT_SID: 'AC', TWILIO_VERIFY_SERVICE_SID: 'VA' });
    expect(isVerifyConfigured()).toBe(false);
  });

  it('is false with an empty environment', () => {
    expect(isVerifyConfigured()).toBe(false);
  });
});

describe('sendCode', () => {
  it('POSTs an SMS verification to the Verify service with Basic auth', async () => {
    setEnv(FULL);
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await sendCode('+15551234567');
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://verify.twilio.com/v2/Services/VA_test/Verifications');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Basic ' + btoa('AC_test:tok_test')
    );
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get('To')).toBe('+15551234567');
    expect(body.get('Channel')).toBe('sms');
  });

  it('reports an error when Twilio returns non-2xx', async () => {
    setEnv(FULL);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 400 })));
    const r = await sendCode('+15551234567');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe('checkCode', () => {
  it('approves only when Twilio returns status "approved"', async () => {
    setEnv(FULL);
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ status: 'approved' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const r = await checkCode('+15551234567', '123456');
    expect(r.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://verify.twilio.com/v2/Services/VA_test/VerificationCheck');
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get('To')).toBe('+15551234567');
    expect(body.get('Code')).toBe('123456');
  });

  it('rejects when the code is pending / not approved', async () => {
    setEnv(FULL);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'pending' }), { status: 200 }))
    );
    const r = await checkCode('+15551234567', '000000');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid');
  });

  it('rejects when Twilio returns a non-2xx response', async () => {
    setEnv(FULL);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 404 })));
    const r = await checkCode('+15551234567', '123456');
    expect(r.ok).toBe(false);
  });
});

describe('process.env fallback (lets a single .env work under next dev)', () => {
  it('isVerifyConfigured() reads from process.env when the CF binding is empty', () => {
    setEnv({}); // no .dev.vars / Worker secrets
    process.env.TWILIO_ACCOUNT_SID = 'AC_env';
    process.env.TWILIO_AUTH_TOKEN = 'tok_env';
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VA_env';
    expect(isVerifyConfigured()).toBe(true);
  });

  it('stays false if process.env is also missing the Verify Service SID', () => {
    setEnv({});
    process.env.TWILIO_ACCOUNT_SID = 'AC_env';
    process.env.TWILIO_AUTH_TOKEN = 'tok_env';
    expect(isVerifyConfigured()).toBe(false);
  });

  it('the Cloudflare binding takes precedence over process.env', async () => {
    setEnv(FULL); // CF binding has VA_test
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VA_env_should_lose';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendCode('+15551234567');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/Services/VA_test/'); // binding wins, not process.env
  });
});
