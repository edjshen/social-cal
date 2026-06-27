'use server';
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { events, attendance } from '../db/schema';
import { requireUserId } from '../auth/session';
import { getEventById, getAllConnections, getAllPlacements } from '../db/queries';
import { canSeeContent } from '../domain/visibility';
import { EVENT_TYPES } from '../domain/types';
import { clampStr, oneOf, toISOOrThrow, LIMITS } from '../validate';

const VIS = ['inner', 'orbit', 'public'] as const;
const RSVPS = ['going', 'down', 'maybe', 'cant'] as const;
const RECUR = ['daily', 'weekly', 'weekday', 'monthly', 'yearly'] as const;
type Recur = typeof RECUR[number];

const normRecur = (v: unknown): Recur | null =>
  typeof v === 'string' && (RECUR as readonly string[]).includes(v) ? (v as Recur) : null;
const normColor = (v: unknown): string | null =>
  typeof v === 'string' && v ? clampStr(v, 24) : null;

export async function createEvent(input: { type: string; title: string; description?: string; location?: string; startTime: string; endTime?: string | null; recurring?: string | null; allDay?: boolean; color?: string | null; visibility: string; expiresAt?: string | null; }) {
  const uid = await requireUserId();
  const title = clampStr(input.title, LIMITS.title).trim();
  if (!title || !input.startTime) throw new Error('Title and start time required');
  const id = crypto.randomUUID(); const nowISO = new Date().toISOString();
  await getDb().insert(events).values({
    id, creatorId: uid,
    type: oneOf(input.type, EVENT_TYPES, 'event'),
    title, description: clampStr(input.description ?? '', LIMITS.bio), location: clampStr(input.location, LIMITS.location),
    startTime: toISOOrThrow(input.startTime, 'start time'),
    endTime: input.endTime ? toISOOrThrow(input.endTime, 'end time') : null,
    recurring: normRecur(input.recurring),
    allDay: !!input.allDay,
    color: normColor(input.color),
    visibility: oneOf(input.visibility, VIS, 'inner'),
    expiresAt: input.expiresAt ? toISOOrThrow(input.expiresAt, 'expiry') : null,
    createdAt: nowISO,
  });
  await getDb().insert(attendance).values({ id: crypto.randomUUID(), eventId: id, userId: uid, rsvp: 'going', createdAt: nowISO });
  revalidatePath('/plans'); revalidatePath('/discover'); revalidatePath('/calendar'); return { id };
}

export async function updateEvent(eventId: string, patch: { type?: string; title?: string; description?: string; location?: string; startTime?: string; endTime?: string | null; recurring?: string | null; allDay?: boolean; color?: string | null; visibility?: string; }) {
  const uid = await requireUserId();
  if (typeof eventId !== 'string') throw new Error('Bad request');
  // A recurring occurrence's client id is `<seriesId>__<date>`; edits act on the series.
  const baseId = eventId.includes('__') ? eventId.split('__')[0] : eventId;
  const ev = await getEventById(baseId);
  if (!ev || ev.creatorId !== uid) throw new Error('Not allowed');
  const set: Record<string, unknown> = {};
  if (patch.type !== undefined) set.type = oneOf(patch.type, EVENT_TYPES, ev.type);
  if (patch.title !== undefined) { const t = clampStr(patch.title, LIMITS.title).trim(); if (t) set.title = t; }
  if (patch.description !== undefined) set.description = clampStr(patch.description, LIMITS.bio);
  if (patch.location !== undefined) set.location = clampStr(patch.location, LIMITS.location);
  if (patch.startTime !== undefined) set.startTime = toISOOrThrow(patch.startTime, 'start time');
  if (patch.endTime !== undefined) set.endTime = patch.endTime ? toISOOrThrow(patch.endTime, 'end time') : null;
  if (patch.recurring !== undefined) set.recurring = normRecur(patch.recurring);
  if (patch.allDay !== undefined) set.allDay = !!patch.allDay;
  if (patch.color !== undefined) set.color = normColor(patch.color);
  if (patch.visibility !== undefined) set.visibility = oneOf(patch.visibility, VIS, ev.visibility);
  if (Object.keys(set).length) await getDb().update(events).set(set).where(eq(events.id, baseId));
  revalidatePath('/plans'); revalidatePath('/discover'); revalidatePath('/calendar');
  return { id: baseId };
}

export async function setRsvp(eventId: string, rsvp: 'going' | 'down' | 'maybe' | 'cant') {
  const uid = await requireUserId();
  if (typeof eventId !== 'string' || !(RSVPS as readonly string[]).includes(rsvp)) throw new Error('Bad request');
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
  if (typeof eventId !== 'string') throw new Error('Bad request');
  const baseId = eventId.includes('__') ? eventId.split('__')[0] : eventId;
  const ev = await getEventById(baseId);
  if (!ev || ev.creatorId !== uid) throw new Error('Not allowed');
  await getDb().delete(attendance).where(eq(attendance.eventId, baseId));
  await getDb().delete(events).where(eq(events.id, baseId));
  revalidatePath('/plans'); revalidatePath('/discover'); revalidatePath('/calendar');
}
