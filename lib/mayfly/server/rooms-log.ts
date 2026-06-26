/**
 * Server-side Mayfly room/participant logging (D1/Drizzle). This is the ONLY
 * place identity is retained. Message content is never stored (the relay
 * forwards E2E ciphertext).
 *
 * Best-effort: callers should not fail the user's action if logging hiccups —
 * the chat itself runs entirely through the relay and IndexedDB. These helpers
 * throw on DB errors; route handlers catch and degrade.
 */
import { getMayflyDb, mayflySchema } from '../db/index';

const { mayflyRooms, mayflyParticipants } = mayflySchema;

/** Record a user-created room (creator phone verified upstream). */
export async function logRoomCreated({
  roomId,
  words,
  mode,
  creatorPhone,
  expiresAt,
}: {
  roomId: string;
  words?: string | null;
  mode?: 'sealed' | 'open';
  creatorPhone?: string | null;
  expiresAt?: string | number | null;
}) {
  const db = getMayflyDb();
  const now = new Date().toISOString();
  await db
    .insert(mayflyRooms)
    .values({
      roomId,
      threeWords: words ?? null,
      mode: mode ?? 'sealed',
      source: 'user',
      eventSlug: null,
      creatorPhone: creatorPhone ?? null,
      createdAt: now,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    .onConflictDoUpdate({
      target: mayflyRooms.roomId,
      set: {
        threeWords: words ?? null,
        mode: mode ?? 'sealed',
        creatorPhone: creatorPhone ?? null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      },
    });
}

/** Upsert metadata for a public per-event room on first join (no creator). */
export async function upsertEventRoom({
  roomId,
  words,
  eventSlug,
  expiresAt,
}: {
  roomId: string;
  words?: string | null;
  eventSlug?: string | null;
  expiresAt?: string | number | null;
}) {
  const db = getMayflyDb();
  const now = new Date().toISOString();
  await db
    .insert(mayflyRooms)
    .values({
      roomId,
      threeWords: words ?? null,
      mode: 'open',
      source: 'event',
      eventSlug: eventSlug ?? null,
      creatorPhone: null,
      createdAt: now,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    .onConflictDoUpdate({
      target: mayflyRooms.roomId,
      set: {
        threeWords: words ?? null,
        eventSlug: eventSlug ?? null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      },
    });
}

/** Log a participant joining a room (one row per profile per room). */
export async function logParticipantJoined({
  roomId,
  profilePub,
  handle,
  phone,
}: {
  roomId: string;
  profilePub: string;
  handle?: string | null;
  phone?: string | null;
}) {
  const db = getMayflyDb();
  const now = new Date().toISOString();
  await db
    .insert(mayflyParticipants)
    .values({
      id: crypto.randomUUID(),
      roomId,
      profilePub,
      handle: handle ?? null,
      phone: phone ?? null,
      joinedAt: now,
    })
    .onConflictDoUpdate({
      target: [mayflyParticipants.roomId, mayflyParticipants.profilePub],
      set: {
        handle: handle ?? null,
        phone: phone ?? null,
        joinedAt: now,
      },
    });
}
