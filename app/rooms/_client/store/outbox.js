/**
 * Outbox — durable send queue. A frame stays here until its `ack` arrives, so a
 * message survives a mid-send socket kill, a reload, or airplane mode and is
 * delivered exactly-once (at-least-once + idempotent server dedupe). A 24h room
 * means retries can continue for the room's whole life; we cap `attempts` only
 * for telemetry, never to give up.
 */
import { getDb } from './db.js';

// Re-send the same frame at most this often while awaiting an ack (covers a
// send that the socket silently dropped). Acks remove the row well before this.
const RETRY_INTERVAL_MS = 4000;

export async function enqueue({ id, roomId, frame }) {
  const db = await getDb();
  await db.put('outbox', { id, roomId, frame, attempts: 0, nextAttemptAt: 0 });
}

export async function removeFromOutbox(id) {
  const db = await getDb();
  await db.delete('outbox', id);
}

export async function getOutbox(roomId) {
  const db = await getDb();
  const all = await db.getAll('outbox');
  const rows = roomId ? all.filter((r) => r.roomId === roomId) : all;
  // Oldest first — preserve send order.
  return rows.sort(
    (a, b) => a.nextAttemptAt - b.nextAttemptAt || (a.attempts ?? 0) - (b.attempts ?? 0)
  );
}

/**
 * Drain due frames for a room. `send(frame)` returns true if the socket accepted
 * the frame. Safe to call repeatedly and concurrently with reconnects: it never
 * deletes a row (only the ack handler does that), so nothing is lost.
 * @returns {Promise<number>} number of frames sent this pass
 */
export async function drainOutbox(roomId, send) {
  const db = await getDb();
  const now = Date.now();
  const rows = await getOutbox(roomId);
  let sent = 0;
  for (const row of rows) {
    if (row.nextAttemptAt > now) continue;
    const accepted = send(row.frame);
    if (!accepted) break; // socket not ready — stop; we'll retry on reconnect
    sent += 1;
    await db.put('outbox', {
      ...row,
      attempts: (row.attempts ?? 0) + 1,
      nextAttemptAt: now + RETRY_INTERVAL_MS,
    });
  }
  return sent;
}

export async function outboxSize(roomId) {
  return (await getOutbox(roomId)).length;
}
