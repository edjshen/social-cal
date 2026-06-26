'use server';
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { events, attendance } from '../db/schema';
import { requireUserId } from '../auth/session';
import { getEventById, getAllConnections, getAllPlacements } from '../db/queries';
import { canSeeContent } from '../domain/visibility';
import { EVENT_TYPES } from '../domain/types';

export async function createEvent(input: { type: string; title: string; location?: string; startTime: string; endTime?: string | null; recurring?: 'weekly' | null; visibility: string; expiresAt?: string | null; }) {
  const uid = await requireUserId();
  if (!input.title || !input.startTime) throw new Error('Title and start time required');
  const id = crypto.randomUUID(); const nowISO = new Date().toISOString();
  await getDb().insert(events).values({
    id, creatorId: uid,
    type: (EVENT_TYPES as string[]).includes(input.type) ? (input.type as any) : 'event',
    title: input.title, description: '', location: input.location || '',
    startTime: new Date(input.startTime).toISOString(),
    endTime: input.endTime ? new Date(input.endTime).toISOString() : null,
    recurring: input.recurring || null,
    visibility: (['inner','orbit','public'].includes(input.visibility) ? input.visibility : 'inner') as any,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null, createdAt: nowISO,
  });
  await getDb().insert(attendance).values({ id: crypto.randomUUID(), eventId: id, userId: uid, rsvp: 'going', createdAt: nowISO });
  revalidatePath('/plans'); revalidatePath('/discover'); return { id };
}

export async function setRsvp(eventId: string, rsvp: 'going' | 'down' | 'maybe' | 'cant') {
  const uid = await requireUserId();
  const ev = await getEventById(eventId);
  if (!ev) throw new Error('Not found');
  const [conns, places] = [await getAllConnections(), await getAllPlacements()];
  if (!canSeeContent(uid, ev, conns, places)) throw new Error('Private');
  const existing = (await getDb().select().from(attendance).where(and(eq(attendance.eventId, eventId), eq(attendance.userId, uid))).limit(1))[0];
  if (existing) await getDb().update(attendance).set({ rsvp }).where(eq(attendance.id, existing.id));
  else await getDb().insert(attendance).values({ id: crypto.randomUUID(), eventId, userId: uid, rsvp, createdAt: new Date().toISOString() });
  revalidatePath('/discover'); revalidatePath('/plans');
}

export async function deleteEvent(eventId: string) {
  const uid = await requireUserId();
  const ev = await getEventById(eventId);
  if (!ev || ev.creatorId !== uid) throw new Error('Not allowed');
  await getDb().delete(attendance).where(eq(attendance.eventId, eventId));
  await getDb().delete(events).where(eq(events.id, eventId));
  revalidatePath('/plans');
}
