/**
 * Rooms store. A room is created entirely client-side (id + key); the relay only
 * learns the id when the host first connects. Joining saves the credential
 * instantly (even offline) and connects in the background.
 *
 * Stored shape:
 *   { id, key, mode, words, profileId, isHost,
 *     createdAt, expiresAt, lastSeqSeen, status }
 *   - id: base64url room id (the WS path + DO name)
 *   - key: Uint8Array secretbox key
 *   - mode: 'sealed' | 'open'
 *   - createdAt/expiresAt: provisional locally; reconciled from the server
 *     `welcome` (the Worker is the source of truth for expiry).
 *   - status: 'pending' (never connected) | 'active' | 'expired'
 */
import { getDb } from './db.js';
import {
  ready,
  generateRoomId,
  generateRoomKey,
  toB64,
  deriveOpenKey,
  deriveEventRoom,
} from '@/lib/mayfly/shared/crypto.js';
import { roomIdToWords, wordsToRoomId } from '@/lib/mayfly/shared/wordlist.js';
import { ROOM_TTL_MS } from '@/lib/mayfly/shared/types.js';

export async function listRooms() {
  const db = await getDb();
  const all = await db.getAll('rooms');
  // Most-recent first, expired last.
  return all.sort((a, b) => {
    const ae = a.status === 'expired' ? 1 : 0;
    const be = b.status === 'expired' ? 1 : 0;
    if (ae !== be) return ae - be;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
}

export async function getRoom(id) {
  const db = await getDb();
  return db.get('rooms', id);
}

export async function updateRoom(id, patch) {
  const db = await getDb();
  const existing = await db.get('rooms', id);
  if (!existing) throw new Error(`mayfly: room ${id} not found`);
  const next = { ...existing, ...patch, id: existing.id };
  await db.put('rooms', next);
  return next;
}

/** Host creates a sealed room: random key. Three-words is a label, not a join path. */
export async function createSealedRoom(profileId) {
  await ready();
  const idBytes = generateRoomId();
  const id = toB64(idBytes);
  const key = generateRoomKey();
  return persistNewRoom({
    id,
    key,
    mode: 'sealed',
    words: roomIdToWords(idBytes),
    profileId,
    isHost: true,
  });
}

/**
 * Host creates an open room: the room IS its three words. Anyone who hears the
 * words derives the same id + key and can join. Use for loud public circles.
 */
export async function createOpenRoom(profileId) {
  await ready();
  // Random words, then canonicalize so a joiner reconstructs the identical id.
  const seed = generateRoomId();
  const words = roomIdToWords(seed);
  const idBytes = wordsToRoomId(words);
  const id = toB64(idBytes);
  const key = deriveOpenKey(words, idBytes);
  return persistNewRoom({ id, key, mode: 'open', words, profileId, isHost: true });
}

/**
 * Save a room caught out-of-band (link / chirp / NFC / QR). The full key arrives
 * in the credential, so this works offline; we connect later. `event` marks a
 * public per-event room (open join, no phone gate); `desiredExpiresAt` is the
 * lifetime the first opener will request from the relay.
 * @param {{ idBytes: Uint8Array, key: Uint8Array, profileId?: string|null,
 *           event?: boolean, desiredExpiresAt?: number|null, eventSlug?: string|null }} input
 */
export async function saveJoinedRoom({
  idBytes,
  key,
  profileId,
  event = false,
  desiredExpiresAt = null,
  eventSlug = null,
}) {
  await ready();
  const id = toB64(idBytes);
  const db = await getDb();
  const existing = await db.get('rooms', id);
  if (existing) {
    // Already known — keep our log/cursor; just (re)assign profile if given.
    if (profileId && existing.profileId !== profileId) {
      return updateRoom(id, { profileId });
    }
    return existing;
  }
  return persistNewRoom({
    id,
    key,
    mode: event ? 'open' : 'sealed',
    words: roomIdToWords(idBytes),
    profileId: profileId ?? null,
    isHost: false,
    event,
    desiredExpiresAt,
    eventSlug,
    // Joiners don't know createdAt/expiresAt until the server welcome.
    provisionalExpiry: false,
  });
}

/**
 * Resolve (and save) the deterministic public room for an event. Everyone who
 * scans the event's button/QR derives the same id+key; the room lives until the
 * event ends (desiredExpiresAt).
 */
export async function createEventRoom({ eventSlug, expiresAt, profileId }) {
  await ready();
  const { idBytes, key } = deriveEventRoom(eventSlug);
  return saveJoinedRoom({
    idBytes,
    key,
    profileId: profileId ?? null,
    event: true,
    desiredExpiresAt: expiresAt ?? null,
    eventSlug,
  });
}

/** Mark that the server-side join/create gate (phone/log) has been satisfied,
 *  and store the relay admission token minted by that gate (null when the
 *  relay gate is inactive). The token is the room's whole-life capability;
 *  its TTL matches the room's max lifetime, so no refresh is needed. */
export async function markGateCleared(id, relayToken = null) {
  return updateRoom(id, { gateCleared: true, relayToken: relayToken ?? null });
}

/** Recreate the open-mode credential from typed three words (no key in words). */
export async function resolveOpenWords(words) {
  await ready();
  const idBytes = wordsToRoomId(words);
  const key = deriveOpenKey(words, idBytes);
  return { idBytes, key };
}

export async function setRoomProfile(id, profileId) {
  return updateRoom(id, { profileId });
}

/** Reconcile authoritative lifetime from the server `welcome`. */
export async function applyWelcome(id, { createdAt, expiresAt }) {
  return updateRoom(id, { createdAt, expiresAt, status: 'active' });
}

export async function advanceCursor(id, seq) {
  const room = await getRoom(id);
  if (!room || seq <= room.lastSeqSeen) return room;
  return updateRoom(id, { lastSeqSeen: seq });
}

/** Tombstone + wipe a room's local data when it expires. */
export async function expireRoom(id) {
  const db = await getDb();
  const tx = db.transaction(['messages', 'outbox', 'rooms'], 'readwrite');
  // Wipe messages for this room. Cursor-scan by primary key (the composite
  // [roomId, id]); avoid index ranges since 'sending' rows have a null seq and
  // wouldn't appear in the by-room-seq index.
  const msgStore = tx.objectStore('messages');
  let cursor = await msgStore.openCursor();
  while (cursor) {
    if (cursor.value.roomId === id) await cursor.delete();
    cursor = await cursor.continue();
  }
  // Wipe outbox rows for this room.
  const outStore = tx.objectStore('outbox');
  let oc = await outStore.openCursor();
  while (oc) {
    if (oc.value.roomId === id) await oc.delete();
    oc = await oc.continue();
  }
  // Leave a tombstone room row so the UI can show "this room is gone".
  const roomStore = tx.objectStore('rooms');
  const room = await roomStore.get(id);
  if (room) {
    await roomStore.put({ ...room, status: 'expired' });
  }
  await tx.done;
}

/** Fully forget a room (after the user dismisses an expired tombstone). */
export async function forgetRoom(id) {
  await expireRoom(id);
  const db = await getDb();
  await db.delete('rooms', id);
}

async function persistNewRoom(input) {
  const db = await getDb();
  const now = Date.now();
  const provisional = input.provisionalExpiry !== false && input.isHost;
  const room = {
    id: input.id,
    key: input.key,
    mode: input.mode,
    words: input.words,
    profileId: input.profileId,
    isHost: input.isHost === true,
    event: input.event === true,
    eventSlug: input.eventSlug ?? null,
    // Lifetime the first opener requests from the relay (e.g. event-end).
    desiredExpiresAt: input.desiredExpiresAt ?? null,
    // Whether the server create/join gate (phone + log) has been satisfied.
    gateCleared: false,
    relayToken: input.relayToken ?? null,
    // Host shows a provisional countdown immediately; server welcome overrides.
    createdAt: provisional ? now : null,
    expiresAt: provisional ? now + ROOM_TTL_MS : null,
    lastSeqSeen: 0,
    status: 'pending',
  };
  await db.put('rooms', room);
  return room;
}
