/**
 * Server-side Mayfly room/participant logging (D1/Drizzle). This is the ONLY
 * place identity is retained. Message content is never stored (the relay
 * forwards E2E ciphertext).
 *
 * Best-effort: callers should not fail the user's action if logging hiccups —
 * the chat itself runs entirely through the relay and IndexedDB. These helpers
 * throw on DB errors; route handlers catch and degrade.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getMayflyDb, mayflySchema } from '../db/index';
import { hashPhoneForLog } from '../shared/phone-hash.js';

const { mayflyRooms, mayflyParticipants } = mayflySchema;

/**
 * Pepper for the participation-log phone hash. Prefer a dedicated
 * MAYFLY_PHONE_PEPPER; fall back to SESSION_SECRET. The hash itself
 * domain-separates via HKDF, so SESSION_SECRET is never used as the HMAC key.
 */
function phonePepper(): string | undefined {
  try {
    const env = getCloudflareContext().env as unknown as {
      MAYFLY_PHONE_PEPPER?: string;
      SESSION_SECRET?: string;
    };
    return env.MAYFLY_PHONE_PEPPER ?? env.SESSION_SECRET ?? process.env.MAYFLY_PHONE_PEPPER;
  } catch {
    return process.env.MAYFLY_PHONE_PEPPER ?? process.env.SESSION_SECRET;
  }
}

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
  // Store a hash, not the raw number — this row must not be a dialable PII map.
  const creatorPhoneHash = await hashPhoneForLog(creatorPhone ?? null, phonePepper());
  // roomId is a random 16-byte value, so a real collision is astronomically
  // unlikely. First-writer-wins (do nothing on conflict) means even a re-issued
  // create can't rewrite an existing room's creator/mode/expiry.
  await db
    .insert(mayflyRooms)
    .values({
      roomId,
      threeWords: words ?? null,
      mode: mode ?? 'sealed',
      source: 'user',
      eventSlug: null,
      creatorPhone: creatorPhoneHash,
      createdAt: now,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    .onConflictDoNothing();
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
  // Event rooms are OPEN-join (no phone gate), and the registry row's metadata
  // (slug, words, expiry) is deterministic from the event — every honest joiner
  // sends identical values. So the first joiner establishes the row and later
  // joiners must NOT be able to rewrite it: do nothing on conflict. This stops a
  // malicious open-joiner from repointing an event room's slug/expiry.
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
    .onConflictDoNothing();
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
  // Store a hash, not the raw number — this row must not be a dialable PII map.
  const phoneHash = await hashPhoneForLog(phone ?? null, phonePepper());
  await db
    .insert(mayflyParticipants)
    .values({
      id: crypto.randomUUID(),
      roomId,
      profilePub,
      handle: handle ?? null,
      phone: phoneHash,
      joinedAt: now,
    })
    .onConflictDoUpdate({
      target: [mayflyParticipants.roomId, mayflyParticipants.profilePub],
      set: {
        handle: handle ?? null,
        phone: phoneHash,
        joinedAt: now,
      },
    });
}
