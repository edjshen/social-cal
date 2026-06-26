import { getCloudflareContext } from '@opennextjs/cloudflare';

function env(): Record<string, string | undefined> {
  return getCloudflareContext().env as unknown as Record<string, string | undefined>;
}
export function isVerifyConfigured(): boolean {
  const e = env();
  return !!(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_VERIFY_SERVICE_SID);
}
export function isOtpBypassAllowed(): boolean {
  const e = env();
  return e.MAYFLY_ALLOW_UNVERIFIED === 'true' || e.SPIN_ALLOW_UNVERIFIED === 'true';
}
function authHeader(): string {
  const e = env();
  return 'Basic ' + btoa(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`);
}
export async function sendCode(phone: string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  const res = await fetch(`https://verify.twilio.com/v2/Services/${e.TWILIO_VERIFY_SERVICE_SID}/Verifications`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: phone, Channel: 'sms' }),
  });
  if (!res.ok) return { ok: false, error: 'Could not send a code right now.' };
  return { ok: true };
}
export async function checkCode(phone: string, code: string): Promise<{ ok: boolean; error?: string; code?: string }> {
  const e = env();
  const res = await fetch(`https://verify.twilio.com/v2/Services/${e.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: phone, Code: code }),
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string };
  if (res.ok && data.status === 'approved') return { ok: true };
  return { ok: false, error: 'That code didn’t match. Try again.', code: 'invalid' };
}
