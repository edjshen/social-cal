'use server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { connections } from '../db/schema';
import { requireUserId } from '../auth/session';
import { getGraphContext, getUserById } from '../db/queries';
import { connectionStatus } from '../domain/visibility';

export async function addPerson(toId: string) {
  const uid = await requireUserId();
  if (typeof toId !== 'string' || toId === uid) throw new Error('Invalid user');
  // Verify the target exists (don't rely solely on the FK) before inserting.
  if (!(await getUserById(toId))) throw new Error('Invalid user');
  const ctx = await getGraphContext();
  if (connectionStatus(ctx.conns, uid, toId) !== 'none') return;
  await getDb().insert(connections).values({
    id: crypto.randomUUID(),
    aId: uid,
    bId: toId,
    status: 'pending',
    requestedBy: uid,
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/circles');
}
export async function acceptRequest(connId: string) {
  const uid = await requireUserId();
  const c = (
    await getDb().select().from(connections).where(eq(connections.id, connId)).limit(1)
  )[0];
  if (!c || c.bId !== uid || c.status !== 'pending') throw new Error('Nothing to accept');
  await getDb().update(connections).set({ status: 'accepted' }).where(eq(connections.id, connId));
  revalidatePath('/circles');
}
