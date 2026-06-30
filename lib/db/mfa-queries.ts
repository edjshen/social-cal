import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from './index';
import { mfaCredentials, mfaRecoveryCodes } from './schema';
import type { MfaCredential } from './schema';

export async function getMfaCredential(userId: string): Promise<MfaCredential | null> {
  const r = await getDb()
    .select()
    .from(mfaCredentials)
    .where(eq(mfaCredentials.userId, userId))
    .limit(1);
  return r[0] ?? null;
}

// Re-enrolling overwrites secretEnc and resets confirmedAt=null. Old recovery
// codes are intentionally NOT cleared here — they're the only way back in if a
// re-enroll is started but never confirmed. INVARIANT: TOTP step-up must require
// confirmedAt!==null (an unconfirmed secret can't authenticate); recovery codes
// stay valid by existence. Confirm replaces them (see replaceRecoveryCodes).
export async function upsertMfaCredential(userId: string, secretEnc: string) {
  await getDb()
    .insert(mfaCredentials)
    .values({ userId, secretEnc, confirmedAt: null, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: mfaCredentials.userId, set: { secretEnc, confirmedAt: null } });
}

export async function confirmMfaCredential(userId: string) {
  await getDb()
    .update(mfaCredentials)
    .set({ confirmedAt: new Date().toISOString() })
    .where(eq(mfaCredentials.userId, userId));
}

export async function replaceRecoveryCodes(userId: string, hashes: string[]) {
  const db = getDb();
  if (!hashes.length) {
    await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    return;
  }
  // db.batch runs delete+insert atomically in one D1 round-trip — never leave a
  // user with their old codes wiped but new ones not yet written.
  await db.batch([
    db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId)),
    db
      .insert(mfaRecoveryCodes)
      .values(hashes.map((codeHash) => ({ id: nanoid(), userId, codeHash, usedAt: null }))),
  ]);
}

export async function consumeRecoveryCode(
  userId: string,
  code: string,
  verify: (code: string, hash: string) => Promise<boolean>
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mfaRecoveryCodes)
    .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
  for (const r of rows) {
    if (await verify(code, r.codeHash)) {
      // Atomic single-use: claim the code only if it's STILL unused. The
      // `usedAt IS NULL` predicate (not just id) + RETURNING is the real guard —
      // D1/SQLite serializes writes, so two concurrent requests submitting the
      // same code can't both claim it (only one UPDATE matches → one row returned).
      const claimed = await db
        .update(mfaRecoveryCodes)
        .set({ usedAt: new Date().toISOString() })
        .where(and(eq(mfaRecoveryCodes.id, r.id), isNull(mfaRecoveryCodes.usedAt)))
        .returning({ id: mfaRecoveryCodes.id });
      if (claimed.length === 1) return true; // won the race
      // lost the race: code was already consumed by a concurrent request — fall through
    }
  }
  return false;
}
