/**
 * Messages store — the local, ordered chat log for a room.
 *
 * Ordering: the `by-room-hlc` index keys on encodeHLC(...), whose fixed-width
 * hex prefix makes lexicographic index order match compareHLC's causal total
 * order. Dedupe: keyPath [roomId, id]; a client sees its own messages echoed
 * back as events and upgrades the existing row (match on id) rather than
 * duplicating.
 *
 * Stored shape:
 *   { roomId, id, seq, hlc, hlcEncoded, kind, profilePub, body, state, at }
 *   state: 'sending' (optimistic, no ack yet) | 'sent' (acked) | 'received'
 */
import { getDb } from './db.js';
import { encodeHLC, compareHLC } from '@/lib/mayfly/shared/hlc.js';

function rangeForRoom(roomId) {
  // All [roomId, hlcEncoded] composite keys for this room sort within these
  // bounds ('' .. U+FFFF covers every possible hlcEncoded string).
  return IDBKeyRange.bound([roomId, ''], [roomId, '\uffff']);
}

/** All messages for a room, in causal (HLC) order. */
export async function listMessages(roomId) {
  const db = await getDb();
  const rows = await db.getAllFromIndex('messages', 'by-room-hlc', rangeForRoom(roomId));
  // Index already returns hlcEncoded order; sort defensively for safety.
  return rows.sort((a, b) => compareHLC(a.hlc, b.hlc));
}

export async function getMessage(roomId, id) {
  const db = await getDb();
  return db.get('messages', [roomId, id]);
}

/** Optimistically record a locally-composed message (state 'sending'). */
export async function insertLocal({ roomId, id, hlc, kind, profilePub, body }) {
  const db = await getDb();
  const msg = {
    roomId,
    id,
    seq: null,
    hlc,
    hlcEncoded: encodeHLC(hlc),
    kind,
    profilePub,
    body,
    state: 'sending',
    at: Date.now(),
  };
  await db.put('messages', msg);
  return msg;
}

/** Promote a local 'sending' row to 'sent' on ack, recording the server seq. */
export async function markSent(roomId, id, seq) {
  const db = await getDb();
  const existing = await db.get('messages', [roomId, id]);
  if (!existing) return null;
  const next = { ...existing, seq, state: existing.state === 'received' ? 'received' : 'sent' };
  await db.put('messages', next);
  return next;
}

/**
 * Insert or upgrade an inbound (already verified + decrypted) event.
 * Idempotent: re-delivery of the same id updates seq without duplicating; our
 * own echoed message upgrades 'sending' -> 'sent'.
 * @returns {{ row: object, isNew: boolean }}
 */
export async function upsertIncoming({ roomId, event, body, fromSelf }) {
  const db = await getDb();
  const existing = await db.get('messages', [roomId, event.id]);
  if (existing) {
    const next = {
      ...existing,
      seq: event.seq,
      // Our own echo: 'sending' -> 'sent'. A peer's row stays 'received'.
      state: fromSelf ? 'sent' : existing.state,
    };
    await db.put('messages', next);
    return { row: next, isNew: false };
  }
  const row = {
    roomId,
    id: event.id,
    seq: event.seq,
    hlc: event.hlc,
    hlcEncoded: encodeHLC(event.hlc),
    kind: event.kind,
    profilePub: event.profilePub,
    body,
    state: fromSelf ? 'sent' : 'received',
    at: Date.now(),
  };
  await db.put('messages', row);
  return { row, isNew: true };
}

/** Record an authentic-but-undecryptable event as a neutral placeholder. */
export async function upsertUndecryptable({ roomId, event }) {
  return upsertIncoming({
    roomId,
    event,
    body: { kind: event.kind, undecryptable: true },
    fromSelf: false,
  });
}
