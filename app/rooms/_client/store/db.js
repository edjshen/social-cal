/**
 * Mayfly IndexedDB — the local source of truth. Every user action completes here
 * first and syncs opportunistically; nothing blocks on the network.
 *
 * SSR-safety: `getDb()` opens lazily on first call and only in the browser.
 * (The handoff spec's top-level `openDB(...)` would run during Next's
 * server render of the "use client" module, where `indexedDB` is undefined.)
 *
 * Object stores:
 *   device   — one row: { id, nodeId, createdAt }
 *   profiles — { id, handle, avatar, vibe, publicKey, secretKey, createdAt }
 *   rooms    — { id, key, mode, profileId, createdAt, expiresAt, lastSeqSeen, status }
 *   messages — keyPath [roomId, id]; indexes by-room-seq, by-room-hlc
 *   outbox   — { id, roomId, frame, attempts, nextAttemptAt }
 */
import { openDB } from 'idb';

const DB_NAME = 'mayfly';
const DB_VERSION = 1;

let _dbPromise = null;

export function getDb() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('mayfly: IndexedDB unavailable (called outside the browser)');
  }
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('device', { keyPath: 'id' });
        db.createObjectStore('profiles', { keyPath: 'id' });
        db.createObjectStore('rooms', { keyPath: 'id' });
        const msgs = db.createObjectStore('messages', { keyPath: ['roomId', 'id'] });
        msgs.createIndex('by-room-seq', ['roomId', 'seq']);
        msgs.createIndex('by-room-hlc', ['roomId', 'hlcEncoded']);
        db.createObjectStore('outbox', { keyPath: 'id' });
      },
    });
  }
  return _dbPromise;
}

/** True when persistence is usable in this context. */
export function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}
