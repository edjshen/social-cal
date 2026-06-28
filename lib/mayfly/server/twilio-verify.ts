import { getCloudflareContext } from '@opennextjs/cloudflare';

// Twilio creds live on the Cloudflare env: `.dev.vars` in dev, Worker secrets in
// prod. Under `next dev` they may instead be in Node's process.env (loaded from
// `.env`), which OpenNext does NOT surface into the Cloudflare binding — so read
// the binding first and fall back to process.env (same pattern as
// lib/auth/session.ts). This lets a single `.env` work for local dev.
function v(key: string): string | undefined {
  const env = getCloudflareContext().env as unknown as Record<string, string | undefined>;
  return env[key] ?? process.env[key];
}
export function isVerifyConfigured(): boolean {
  return !!(v('TWILIO_ACCOUNT_SID') && v('TWILIO_AUTH_TOKEN') && v('TWILIO_VERIFY_SERVICE_SID'));
}
function authHeader(): string {
  return 'Basic ' + btoa(`${v('TWILIO_ACCOUNT_SID')}:${v('TWILIO_AUTH_TOKEN')}`);
}
export async function sendCode(phone: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${v('TWILIO_VERIFY_SERVICE_SID')}/Verifications`,
    {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, Channel: 'sms' }),
    }
  );
  if (!res.ok) return { ok: false, error: 'Could not send a code right now.' };
  return { ok: true };
}
export async function checkCode(
  phone: string,
  code: string
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${v('TWILIO_VERIFY_SERVICE_SID')}/VerificationCheck`,
    {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, Code: code }),
    }
  );
  const data = (await res.json().catch(() => ({}))) as { status?: string };
  if (res.ok && data.status === 'approved') return { ok: true };
  return { ok: false, error: 'That code didn’t match. Try again.', code: 'invalid' };
}
