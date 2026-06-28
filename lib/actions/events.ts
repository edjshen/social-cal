'use server';
import { revalidatePath } from 'next/cache';
import { eq, and, gte } from 'drizzle-orm';
import { getDb } from '../db';
import { events, attendance } from '../db/schema';
import type { BarycalEvent } from '../db/schema';
import { requireUserId } from '../auth/session';
import { getEventById, getAllConnections, getAllPlacements } from '../db/queries';
import { canSeeContent } from '../domain/visibility';
import { EVENT_TYPES } from '../domain/types';
import { clampStr, oneOf, toISOOrThrow, LIMITS } from '../validate';

const VIS = ['inner', 'orbit', 'public'] as const;
const RSVPS = ['going', 'down', 'maybe', 'cant'] as const;
const RECUR = ['daily', 'weekly', 'weekday', 'monthly', 'yearly'] as const;
type Recur = (typeof RECUR)[number];
// How a change to a recurring event applies (Google-Calendar's three choices).
type RecurScope = 'all' | 'single' | 'following';

const normRecur = (v: unknown): Recur | null =>
  typeof v === 'string' && (RECUR as readonly string[]).includes(v) ? (v as Recur) : null;
const normColor = (v: unknown): string | null =>
  typeof v === 'string' && v ? clampStr(v, 24) : null;

type EventPatch = {
  type?: string;
  title?: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string | null;
  recurring?: string | null;
  allDay?: boolean;
  color?: string | null;
  visibility?: string;
};

// A recurring occurrence's client id is `<seriesId>__<YYYY-MM-DD>`.
function splitOccurrenceId(eventId: string): { baseId: string; dateKey: string | null } {
  if (eventId.includes('__')) {
    const [b, d] = eventId.split('__');
    return { baseId: b, dateKey: d };
  }
  return { baseId: eventId, dateKey: null };
}
// The original start instant of the occurrence on `dateKey` (base time-of-day on that date).
function occurrenceStartISO(base: BarycalEvent, dateKey: string): string {
  const s = new Date(base.startTime);
  const [y, m, d] = dateKey.split('-').map(Number);
  const o = new Date(s);
  o.setFullYear(y, m - 1, d);
  return o.toISOString();
}
// Resolve event content fields from `patch` layered over `base`.
function mergeContent(base: BarycalEvent, patch: EventPatch) {
  const title =
    patch.title !== undefined
      ? clampStr(patch.title, LIMITS.title).trim() || base.title
      : base.title;
  return {
    type: patch.type !== undefined ? oneOf(patch.type, EVENT_TYPES, base.type) : base.type,
    title,
    description:
      patch.description !== undefined ? clampStr(patch.description, LIMITS.bio) : base.description,
    location:
      patch.location !== undefined ? clampStr(patch.location, LIMITS.location) : base.location,
    startTime:
      patch.startTime !== undefined ? toISOOrThrow(patch.startTime, 'start time') : base.startTime,
    endTime:
      patch.endTime !== undefined
        ? patch.endTime
          ? toISOOrThrow(patch.endTime, 'end time')
          : null
        : base.endTime,
    allDay: patch.allDay !== undefined ? !!patch.allDay : base.allDay,
    color: patch.color !== undefined ? normColor(patch.color) : base.color,
    visibility:
      patch.visibility !== undefined
        ? oneOf(patch.visibility, VIS, base.visibility)
        : base.visibility,
  };
}
const revalidateAll = () => {
  revalidatePath('/plans');
  revalidatePath('/discover');
  revalidatePath('/calendar');
};

export async function createEvent(input: {
  type: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime?: string | null;
  recurring?: string | null;
  allDay?: boolean;
  color?: string | null;
  visibility: string;
  expiresAt?: string | null;
}) {
  const uid = await requireUserId();
  const title = clampStr(input.title, LIMITS.title).trim();
  if (!title || !input.startTime) throw new Error('Title and start time required');
  const id = crypto.randomUUID();
  const nowISO = new Date().toISOString();
  await getDb()
    .insert(events)
    .values({
      id,
      creatorId: uid,
      type: oneOf(input.type, EVENT_TYPES, 'event'),
      title,
      description: clampStr(input.description ?? '', LIMITS.bio),
      location: clampStr(input.location, LIMITS.location),
      startTime: toISOOrThrow(input.startTime, 'start time'),
      endTime: input.endTime ? toISOOrThrow(input.endTime, 'end time') : null,
      recurring: normRecur(input.recurring),
      allDay: !!input.allDay,
      color: normColor(input.color),
      visibility: oneOf(input.visibility, VIS, 'inner'),
      expiresAt: input.expiresAt ? toISOOrThrow(input.expiresAt, 'expiry') : null,
      createdAt: nowISO,
    });
  await getDb().insert(attendance).values({
    id: crypto.randomUUID(),
    eventId: id,
    userId: uid,
    rsvp: 'going',
    createdAt: nowISO,
  });
  revalidatePath('/plans');
  revalidatePath('/discover');
  revalidatePath('/calendar');
  return { id };
}

export async function updateEvent(
  eventId: string,
  patch: EventPatch,
  opts?: { scope?: RecurScope }
) {
  const uid = await requireUserId();
  if (typeof eventId !== 'string') throw new Error('Bad request');
  const scope: RecurScope = opts?.scope ?? 'all';
  const { baseId, dateKey } = splitOccurrenceId(eventId);
  const base = await getEventById(baseId);
  if (!base || base.creatorId !== uid) throw new Error('Not allowed');
  const nowISO = new Date().toISOString();

  // Per-occurrence edit of a recurring series → create/update an override row.
  if (base.recurring && scope === 'single' && dateKey) {
    const content = mergeContent(base, patch);
    const existing = (
      await getDb()
        .select()
        .from(events)
        .where(and(eq(events.parentId, baseId), eq(events.originalDate, dateKey)))
        .limit(1)
    )[0];
    if (existing) {
      await getDb()
        .update(events)
        .set({ ...content, cancelled: false })
        .where(eq(events.id, existing.id));
      revalidateAll();
      return { id: existing.id };
    }
    const id = crypto.randomUUID();
    await getDb()
      .insert(events)
      .values({
        id,
        creatorId: uid,
        ...content,
        recurring: null,
        parentId: baseId,
        originalDate: dateKey,
        cancelled: false,
        recurUntil: null,
        expiresAt: null,
        createdAt: nowISO,
      });
    await getDb().insert(attendance).values({
      id: crypto.randomUUID(),
      eventId: id,
      userId: uid,
      rsvp: 'going',
      createdAt: nowISO,
    });
    revalidateAll();
    return { id };
  }

  // "This and following" → end the original series before this occurrence and
  // start a fresh series here carrying the edits.
  if (base.recurring && scope === 'following' && dateKey) {
    const splitISO = occurrenceStartISO(base, dateKey);
    const content = mergeContent(base, patch);
    await getDb().update(events).set({ recurUntil: splitISO }).where(eq(events.id, baseId));
    await getDb()
      .delete(events)
      .where(and(eq(events.parentId, baseId), gte(events.originalDate, dateKey)));
    const id = crypto.randomUUID();
    await getDb()
      .insert(events)
      .values({
        id,
        creatorId: uid,
        ...content,
        recurring: normRecur(patch.recurring !== undefined ? patch.recurring : base.recurring),
        parentId: null,
        originalDate: null,
        cancelled: false,
        recurUntil: null,
        expiresAt: null,
        createdAt: nowISO,
      });
    await getDb().insert(attendance).values({
      id: crypto.randomUUID(),
      eventId: id,
      userId: uid,
      rsvp: 'going',
      createdAt: nowISO,
    });
    revalidateAll();
    return { id };
  }

  // Default: edit the row itself (whole series for a base, or a single event).
  const set: Record<string, unknown> = {};
  if (patch.type !== undefined) set.type = oneOf(patch.type, EVENT_TYPES, base.type);
  if (patch.title !== undefined) {
    const t = clampStr(patch.title, LIMITS.title).trim();
    if (t) set.title = t;
  }
  if (patch.description !== undefined) set.description = clampStr(patch.description, LIMITS.bio);
  if (patch.location !== undefined) set.location = clampStr(patch.location, LIMITS.location);
  if (patch.startTime !== undefined) set.startTime = toISOOrThrow(patch.startTime, 'start time');
  if (patch.endTime !== undefined)
    set.endTime = patch.endTime ? toISOOrThrow(patch.endTime, 'end time') : null;
  if (patch.recurring !== undefined) set.recurring = normRecur(patch.recurring);
  if (patch.allDay !== undefined) set.allDay = !!patch.allDay;
  if (patch.color !== undefined) set.color = normColor(patch.color);
  if (patch.visibility !== undefined)
    set.visibility = oneOf(patch.visibility, VIS, base.visibility);
  if (Object.keys(set).length) await getDb().update(events).set(set).where(eq(events.id, baseId));
  revalidateAll();
  return { id: baseId };
}

export async function setRsvp(eventId: string, rsvp: 'going' | 'down' | 'maybe' | 'cant') {
  const uid = await requireUserId();
  if (typeof eventId !== 'string' || !(RSVPS as readonly string[]).includes(rsvp))
    throw new Error('Bad request');
  const ev = await getEventById(eventId);
  if (!ev) throw new Error('Not found');
  const [conns, places] = [await getAllConnections(), await getAllPlacements()];
  if (!canSeeContent(uid, ev, conns, places)) throw new Error('Private');
  const existing = (
    await getDb()
      .select()
      .from(attendance)
      .where(and(eq(attendance.eventId, eventId), eq(attendance.userId, uid)))
      .limit(1)
  )[0];
  if (existing)
    await getDb().update(attendance).set({ rsvp }).where(eq(attendance.id, existing.id));
  else
    await getDb().insert(attendance).values({
      id: crypto.randomUUID(),
      eventId,
      userId: uid,
      rsvp,
      createdAt: new Date().toISOString(),
    });
  revalidatePath('/discover');
  revalidatePath('/plans');
}

export async function deleteEvent(eventId: string, opts?: { scope?: RecurScope }) {
  const uid = await requireUserId();
  if (typeof eventId !== 'string') throw new Error('Bad request');
  const scope: RecurScope = opts?.scope ?? 'all';
  const { baseId, dateKey } = splitOccurrenceId(eventId);
  const base = await getEventById(baseId);
  if (!base || base.creatorId !== uid) throw new Error('Not allowed');
  const nowISO = new Date().toISOString();

  // Deleting an existing override row → turn it into a cancellation.
  if (!dateKey && base.parentId) {
    await getDb().update(events).set({ cancelled: true }).where(eq(events.id, base.id));
    revalidateAll();
    return;
  }

  // "This and following" → just stop the series at this occurrence.
  if (base.recurring && scope === 'following' && dateKey) {
    await getDb()
      .update(events)
      .set({ recurUntil: occurrenceStartISO(base, dateKey) })
      .where(eq(events.id, baseId));
    await getDb()
      .delete(events)
      .where(and(eq(events.parentId, baseId), gte(events.originalDate, dateKey)));
    revalidateAll();
    return;
  }

  // Delete just this occurrence → write a cancellation exception (or flag an
  // existing override as cancelled).
  if (base.recurring && scope === 'single' && dateKey) {
    const existing = (
      await getDb()
        .select()
        .from(events)
        .where(and(eq(events.parentId, baseId), eq(events.originalDate, dateKey)))
        .limit(1)
    )[0];
    if (existing)
      await getDb().update(events).set({ cancelled: true }).where(eq(events.id, existing.id));
    else
      await getDb()
        .insert(events)
        .values({
          id: crypto.randomUUID(),
          creatorId: uid,
          type: base.type,
          title: base.title,
          description: '',
          location: '',
          startTime: occurrenceStartISO(base, dateKey),
          endTime: null,
          recurring: null,
          allDay: base.allDay,
          color: base.color,
          parentId: baseId,
          originalDate: dateKey,
          cancelled: true,
          recurUntil: null,
          visibility: base.visibility,
          expiresAt: null,
          createdAt: nowISO,
        });
    revalidateAll();
    return;
  }

  // Whole series (or a plain event): remove it plus any exception rows.
  const children = await getDb()
    .select({ id: events.id })
    .from(events)
    .where(eq(events.parentId, baseId));
  for (const c of children) await getDb().delete(attendance).where(eq(attendance.eventId, c.id));
  await getDb().delete(events).where(eq(events.parentId, baseId));
  await getDb().delete(attendance).where(eq(attendance.eventId, baseId));
  await getDb().delete(events).where(eq(events.id, baseId));
  revalidateAll();
}
