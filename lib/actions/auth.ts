'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from '../auth/password';
import { getSession } from '../auth/session';
import { avatarFor } from '../domain/helpers';
import { consumeRateLimit, clientIp } from '../ratelimit';
import { LIMITS } from '../validate';
import { getMfaCredential, consumeRecoveryCode } from '../db/mfa-queries';
import { decryptSecret } from '../auth/crypto';
import { verifyTotp, verifyRecoveryCode } from '../auth/mfa';
import { nextAalAfterPassword } from '../auth/superadmin';
import { safeNext } from '../url';

function toHandle(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

export type AuthState = { error?: string } | null;

const TOO_MANY = 'Too many attempts. Please wait a few minutes.';

// Computed once, then reused: lets the user-not-found branch of login run one
// scrypt too, so response time doesn't reveal whether a handle exists. The value
// is irrelevant — it only needs to be a valid hash so verifyPassword does work.
const DUMMY_HASH = hashPassword('orbit-timing-equalizer-not-a-real-secret');

// Fail OPEN if the limiter errors (e.g. the rate_limits table isn't migrated yet
// on a fresh deploy, or a transient D1 hiccup): availability of login beats the
// defense-in-depth throttle, and scrypt is itself a per-attempt cost.
async function underLimit(
  scope: string,
  key: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  try {
    return (await consumeRateLimit({ scope, key, max, windowMs })).ok;
  } catch (e) {
    console.warn('[auth] rate limit unavailable, allowing:', (e as Error)?.message);
    return true;
  }
}

const TEN_MIN = 10 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const handle = toHandle(String(form.get('username'))).slice(0, LIMITS.handle);
  const password = String(form.get('password') || '').slice(0, LIMITS.password);
  const ip = await clientIp();

  // Throttle by source IP and by targeted handle before any expensive work.
  if (!(await underLimit('auth.login.ip', ip, 20, TEN_MIN))) return { error: TOO_MANY };
  if (handle && !(await underLimit('auth.login.handle', handle, 10, TEN_MIN)))
    return { error: TOO_MANY };

  const u = handle
    ? (await getDb().select().from(users).where(eq(users.handle, handle)).limit(1))[0]
    : undefined;
  if (!u) {
    // Equalize timing: one scrypt against a constant hash, then a generic error.
    await verifyPassword(password, await DUMMY_HASH);
    return { error: 'Invalid credentials' };
  }
  if (!(await verifyPassword(password, u.passwordHash))) return { error: 'Invalid credentials' };
  const s = await getSession();
  s.userId = u.id;
  s.handle = u.handle;
  const mfa = await getMfaCredential(u.id);
  s.aal = nextAalAfterPassword(!!mfa?.confirmedAt);
  await s.save();
  // MFA gate wins first: an aal1 (step-up-required) session must clear TOTP before
  // we honor any return URL. Otherwise return to the validated `next` (e.g. a
  // private event link that sent them to log in), falling back to the app home.
  redirect(s.aal === 'aal1' ? '/login/mfa' : (safeNext(form.get('next')) ?? '/discover'));
}

export async function register(_prev: AuthState, form: FormData): Promise<AuthState> {
  const handle = toHandle(String(form.get('username'))).slice(0, LIMITS.handle);
  const password = String(form.get('password') || '');
  const displayName = (String(form.get('displayName') || '') || handle).slice(
    0,
    LIMITS.displayName
  );
  if (!handle || !password) return { error: 'Username and password required' };
  if (password.length > LIMITS.password)
    return { error: `Password must be at most ${LIMITS.password} characters` };

  const ip = await clientIp();
  if (!(await underLimit('auth.register.ip', ip, 5, ONE_HOUR))) return { error: TOO_MANY };

  const exists = (await getDb().select().from(users).where(eq(users.handle, handle)).limit(1))[0];
  if (exists) return { error: 'Username taken' };
  const id = crypto.randomUUID();
  await getDb()
    .insert(users)
    .values({
      id,
      handle,
      displayName,
      passwordHash: await hashPassword(password),
      bio: '',
      scenes: [],
      avatar: avatarFor(handle),
      shareId: crypto.randomUUID().slice(0, 8),
      ghost: false,
      createdAt: new Date().toISOString(),
    });
  const s = await getSession();
  s.userId = id;
  s.handle = handle;
  s.aal = 'aal2';
  await s.save();
  // Same as login: honor a validated return URL so a new signup that started
  // from a shared event/profile link lands back there to RSVP or follow.
  redirect(safeNext(form.get('next')) ?? '/discover');
}

export async function logout() {
  const s = await getSession();
  s.destroy();
  redirect('/login');
}

export async function verifyMfaStepUp(token: string): Promise<{ ok: boolean }> {
  const s = await getSession();
  if (!s.userId) return { ok: false };
  const ip = await clientIp();
  if (!(await underLimit('auth.mfa.verify', s.userId, 5, TEN_MIN))) return { ok: false };
  if (!(await underLimit('auth.mfa.ip', ip, 15, TEN_MIN))) return { ok: false };
  const cred = await getMfaCredential(s.userId);
  if (!cred?.confirmedAt) return { ok: false }; // INVARIANT: TOTP only against a CONFIRMED secret
  let secret: string;
  try {
    secret = await decryptSecret(cred.secretEnc);
  } catch {
    return { ok: false }; // corrupt/undecryptable secret at rest → reject, never 500
  }
  if (!verifyTotp(secret, token)) return { ok: false };
  s.aal = 'aal2';
  await s.save();
  return { ok: true };
}

export async function redeemRecoveryCode(code: string): Promise<{ ok: boolean }> {
  const s = await getSession();
  if (!s.userId) return { ok: false };
  const ip = await clientIp();
  if (!(await underLimit('auth.mfa.verify', s.userId, 5, TEN_MIN))) return { ok: false };
  if (!(await underLimit('auth.mfa.ip', ip, 15, TEN_MIN))) return { ok: false };
  const ok = await consumeRecoveryCode(s.userId, code, verifyRecoveryCode);
  if (!ok) return { ok: false };
  s.aal = 'aal2';
  await s.save();
  return { ok: true };
}
