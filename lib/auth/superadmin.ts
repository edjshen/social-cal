import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { platformAdmins } from '../db/schema';
import { getSession } from './session';

// Bootstrap reference only (used by the seed/elevation SQL to find the account).
// The LIVE gate is the platform_admins DB row — NOT an email match. Do not add
// an email check to requireSuperadmin/isPlatformAdmin.
export const SUPERADMIN_EMAIL = 'junting.mp3@gmail.com';

export type Aal = 'aal1' | 'aal2';

// Pure, IO-free privilege decision. Throws 'FORBIDDEN' unless the caller is a
// signed-in (userId), MFA-elevated (aal2), platform admin. This is the single
// rule; the IO wrapper requireSuperadmin() (Task 3) feeds it real values.
export function assertSuperadmin(input: {
  userId: string | undefined;
  aal: Aal | undefined;
  isAdmin: boolean;
}): asserts input is { userId: string; aal: 'aal2'; isAdmin: true } {
  if (!input.userId || input.aal !== 'aal2' || !input.isAdmin) {
    throw new Error('FORBIDDEN');
  }
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ userId: platformAdmins.userId })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, userId))
    .limit(1);
  return rows.length > 0;
}

// The boundary control. Call this at the top of EVERY admin action and in the
// admin route-group layout. Never trust the layout alone (defense in depth).
export async function requireSuperadmin(): Promise<{ userId: string }> {
  const s = await getSession();
  const isAdmin = s.userId ? await isPlatformAdmin(s.userId) : false;
  assertSuperadmin({ userId: s.userId, aal: s.aal, isAdmin });
  // assertSuperadmin narrowed input.userId to string; s.userId is that same value.
  return { userId: s.userId! };
}

// After a correct password, an account WITH confirmed MFA must still clear TOTP
// (stay aal1 → step-up); everyone else is fully authenticated (aal2).
export function nextAalAfterPassword(hasConfirmedMfa: boolean): 'aal1' | 'aal2' {
  return hasConfirmedMfa ? 'aal1' : 'aal2';
}
