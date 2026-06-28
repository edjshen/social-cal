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
  await s.save();
  redirect('/discover');
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
  await s.save();
  redirect('/discover');
}

export async function logout() {
  const s = await getSession();
  s.destroy();
  redirect('/login');
}
