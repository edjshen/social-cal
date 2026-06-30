'use server';
// Admin moderation actions. Each re-checks requireSuperadmin() first (defense in
// depth), then mutates, then writeAudit()s.
//
// ERROR CONTRACT: these throw raw Error codes — 'FORBIDDEN' (not a superadmin /
// no MFA step-up), 'CANNOT_DELETE_SELF', 'CANNOT_DELETE_ADMIN'. The guards protect
// the DATA server-side regardless of the UI. Note: Next.js REDACTS Server Action
// error messages in production, so a client caller cannot reliably read err.message
// — the /admin UI should show a generic failure and, where possible, avoid offering
// an action that would hit CANNOT_DELETE_* (e.g. no delete button on your own row).
//
// AUDIT DURABILITY: writeAudit runs AFTER the mutation, not in the same D1 batch.
// A failed audit after a successful delete leaves the change un-audited. Accepted
// ceiling for a single-admin tool — not worth a per-action transaction wrapper.
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users, connections } from '../db/schema';
import { requireSuperadmin, isPlatformAdmin } from '../auth/superadmin';
import { writeAudit } from '../db/audit';
import { deleteUserCascade, deleteEventCascade } from '../db/admin';
import { hashPassword } from '../auth/password';

function randomPassword(): string {
  const A = '0123456789abcdefghjkmnpqrstvwxyz';
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => A[x & 31]).join('');
}

export async function adminToggleGhost(userId: string, ghost: boolean) {
  const { userId: actorId } = await requireSuperadmin();
  await getDb().update(users).set({ ghost }).where(eq(users.id, userId));
  await writeAudit({
    actorId,
    action: 'user.ghost',
    targetType: 'user',
    targetId: userId,
    summary: `${ghost ? 'ghosted' : 'unghosted'} ${userId}`,
  });
}

export async function adminForceResetPassword(userId: string): Promise<{ tempPassword: string }> {
  const { userId: actorId } = await requireSuperadmin();
  const tempPassword = randomPassword();
  // ponytail: changes passwordHash only; does NOT invalidate the target's existing
  // iron-session cookies (they're not password-bound, no session store to purge).
  // The target stays logged in on current devices. Spec asked for a reset, not a logout.
  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(tempPassword) })
    .where(eq(users.id, userId));
  await writeAudit({
    actorId,
    action: 'user.password_reset',
    targetType: 'user',
    targetId: userId,
    summary: `reset password for ${userId}`,
  });
  return { tempPassword };
}

export async function adminDeleteUser(userId: string) {
  const { userId: actorId } = await requireSuperadmin();
  if (userId === actorId) throw new Error('CANNOT_DELETE_SELF');
  if (await isPlatformAdmin(userId)) throw new Error('CANNOT_DELETE_ADMIN');
  await deleteUserCascade(userId);
  await writeAudit({
    actorId,
    action: 'user.delete',
    targetType: 'user',
    targetId: userId,
    summary: `deleted user ${userId}`,
  });
}

export async function adminDeleteEvent(eventId: string) {
  const { userId: actorId } = await requireSuperadmin();
  await deleteEventCascade(eventId);
  await writeAudit({
    actorId,
    action: 'event.delete',
    targetType: 'event',
    targetId: eventId,
    summary: `deleted event ${eventId}`,
  });
}

export async function adminRemoveConnection(connId: string) {
  const { userId: actorId } = await requireSuperadmin();
  await getDb().delete(connections).where(eq(connections.id, connId));
  await writeAudit({
    actorId,
    action: 'connection.remove',
    targetType: 'connection',
    targetId: connId,
    summary: `removed connection ${connId}`,
  });
}
