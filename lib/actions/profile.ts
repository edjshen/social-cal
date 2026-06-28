'use server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../db/schema';
import { requireUserId } from '../auth/session';
import { clampStr, clampScenes, LIMITS } from '../validate';

export async function updateProfile(input: {
  displayName?: string;
  bio?: string;
  scenes?: string[];
  ghost?: boolean;
}) {
  const uid = await requireUserId();
  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) {
    const dn = clampStr(input.displayName, LIMITS.displayName).trim();
    if (dn) patch.displayName = dn; // ignore empty/whitespace name (would break initials)
  }
  if (input.bio !== undefined) patch.bio = clampStr(input.bio, LIMITS.bio);
  if (input.scenes !== undefined) patch.scenes = clampScenes(input.scenes);
  if (input.ghost !== undefined) patch.ghost = !!input.ghost;
  if (Object.keys(patch).length) await getDb().update(users).set(patch).where(eq(users.id, uid));
  revalidatePath('/you');
}
