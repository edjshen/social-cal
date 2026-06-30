/**
 * Room sync orchestrator. Owns one room's live session: it wires the connection
 * state machine to the crypto session and the local store, implements the
 * resume cursor + outbox flush, and surfaces changes to the UI via `hooks`.
 *
 * Contract with the relay (see protocol.js):
 *  - on `connected` we send hello{ resumeFromSeq: cursor } -> server streams
 *    only events with seq > cursor, then backlog_done.
 *  - publish -> ack (our own seq); peers receive the event. On reconnect/resume
 *    the server re-streams our own messages as events too, so reconciliation is
 *    idempotent (dedupe by id, upgrade in place).
 *
 * Frame handling is serialized through a promise chain so concurrent IndexedDB
 * writes (cursor advance, upserts) can't race.
 */
import { createConnection } from './connection.js';
import { createRoomSession } from '../crypto/session.js';
import { insertLocal, markSent, upsertIncoming, upsertUndecryptable } from '../store/messages.js';
import { enqueue, removeFromOutbox, drainOutbox } from '../store/outbox.js';
import { applyWelcome, advanceCursor } from '../store/rooms.js';

const FLUSH_INTERVAL_MS = 4000;
const PRESENCE_INTERVAL_MS = 30000;
const PRESENCE_TTL_MS = 95000;

export function createRoomSync({ room, profile, nodeId, hooks }) {
  const roomId = room.id;
  const session = createRoomSession({ roomId, key: room.key, profile, nodeId });
  const selfPub = session.profilePub;

  let cursor = room.lastSeqSeen ?? 0;
  let serverOffset = 0;
  let expiresAt = room.expiresAt ?? null;
  let createdAt = room.createdAt ?? null;
  let expired = false;
  let flushTimer = null;
  let presenceTimer = null;
  let chain = Promise.resolve();

  // Roster — profilePub -> { handle, avatar, vibe, pub, lastSeen, isSelf }.
  const presence = new Map();
  presence.set(selfPub, {
    pub: selfPub,
    handle: profile.handle,
    avatar: profile.avatar,
    vibe: profile.vibe,
    lastSeen: Date.now(),
    isSelf: true,
  });

  const conn = createConnection(roomId, { onState, onFrame, token: room.relayToken ?? null });

  function emitChange() {
    hooks.onChange?.();
  }

  function serialize(task) {
    chain = chain.then(task).catch((err) => {
      console.error('[mayfly sync] frame handling error:', err);
    });
    return chain;
  }

  function flush() {
    if (!conn.isOpen()) return;
    drainOutbox(roomId, conn.send).catch((err) =>
      console.error('[mayfly sync] outbox flush error:', err)
    );
  }

  function prunePresence() {
    const now = Date.now();
    let changed = false;
    for (const [pub, p] of presence) {
      if (p.isSelf) continue;
      if (now - p.lastSeen > PRESENCE_TTL_MS) {
        presence.delete(pub);
        changed = true;
      }
    }
    if (changed) emitChange();
  }

  function onState(state) {
    if (expired) return;
    hooks.onState?.(state);
    if (state === 'connected') {
      // Resume from our cursor; server replies welcome + delta + backlog_done.
      // First opener may request a custom lifetime (e.g. event room ends with
      // the event); the relay clamps + honors it only on first materialization.
      const hello = { type: 'hello', resumeFromSeq: cursor, profilePub: selfPub };
      if (room.desiredExpiresAt) hello.requestedExpiresAt = room.desiredExpiresAt;
      conn.send(hello);
    } else if (state === 'expired') {
      handleExpired();
    }
  }

  function onFrame(frame) {
    serialize(() => handleFrame(frame));
  }

  async function handleFrame(frame) {
    switch (frame.type) {
      case 'welcome': {
        serverOffset = frame.serverNow - Date.now();
        createdAt = frame.createdAt;
        expiresAt = frame.expiresAt;
        await applyWelcome(roomId, { createdAt, expiresAt });
        hooks.onServerTime?.({ offset: serverOffset, createdAt, expiresAt });
        break;
      }
      case 'event': {
        await applyEvent(frame);
        break;
      }
      case 'ack': {
        await markSent(roomId, frame.id, frame.seq);
        await removeFromOutbox(frame.id);
        await bumpCursor(frame.seq);
        emitChange();
        flush();
        break;
      }
      case 'backlog_done': {
        // We're caught up: make ourselves visible and push anything queued.
        announcePresence();
        flush();
        emitChange();
        break;
      }
      case 'expired': {
        handleExpired();
        break;
      }
      default:
        break;
    }
  }

  async function applyEvent(event) {
    const fromSelf = event.profilePub === selfPub;
    const res = session.verifyAndDecrypt(event);
    if (res.ok) {
      if (res.body && res.body.kind === 'presence' && res.body.profile) {
        // Presence frames update the roster but aren't stored as chat lines.
        presence.set(event.profilePub, {
          pub: event.profilePub,
          handle: res.body.profile.handle,
          avatar: res.body.profile.avatar,
          vibe: res.body.profile.vibe,
          lastSeen: Date.now(),
          isSelf: fromSelf,
        });
      } else {
        await upsertIncoming({ roomId, event, body: res.body, fromSelf });
      }
    } else if (res.reason === 'undecryptable') {
      await upsertUndecryptable({ roomId, event });
    }
    // bad-sig / bad-pubkey: drop silently, but still consume the seq.
    await bumpCursor(event.seq);
    emitChange();
  }

  async function bumpCursor(seq) {
    if (seq > cursor) {
      cursor = seq;
      await advanceCursor(roomId, seq);
    }
  }

  async function publish(body) {
    if (expired) return;
    const { id, hlc, frame } = session.buildPublish(body);
    if (body.kind !== 'presence') {
      await insertLocal({ roomId, id, hlc, kind: body.kind, profilePub: selfPub, body });
      emitChange();
    }
    await enqueue({ id, roomId, frame });
    flush();
  }

  function announcePresence() {
    presence.set(selfPub, { ...presence.get(selfPub), lastSeen: Date.now() });
    publish({
      kind: 'presence',
      profile: { handle: profile.handle, avatar: profile.avatar, vibe: profile.vibe },
    });
  }

  function handleExpired() {
    if (expired) return;
    expired = true;
    stopTimers();
    conn.close();
    hooks.onState?.('expired');
    // Local tombstone + wipe is driven by the caller via store.expireRoom; we
    // just signal so the UI can react and trigger it.
    hooks.onExpired?.();
  }

  function stopTimers() {
    if (flushTimer) clearInterval(flushTimer);
    if (presenceTimer) clearInterval(presenceTimer);
    flushTimer = null;
    presenceTimer = null;
  }

  return {
    start() {
      conn.start();
      // Backstop flusher (covers acks that didn't immediately drain) + presence
      // refresh + roster pruning.
      flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
      presenceTimer = setInterval(() => {
        if (conn.isOpen()) announcePresence();
        prunePresence();
      }, PRESENCE_INTERVAL_MS);
    },
    sendText(text) {
      const trimmed = String(text).slice(0, 4000);
      if (!trimmed.trim()) return Promise.resolve();
      return publish({ kind: 'text', text: trimmed });
    },
    sendReaction(emoji, targetId) {
      return publish({ kind: 'reaction', emoji, targetId });
    },
    announcePresence,
    presenceList() {
      return Array.from(presence.values()).sort((a, b) => b.lastSeen - a.lastSeen);
    },
    serverNow() {
      return Date.now() + serverOffset;
    },
    getExpiresAt() {
      return expiresAt;
    },
    getCreatedAt() {
      return createdAt;
    },
    isExpired() {
      return expired;
    },
    close() {
      stopTimers();
      conn.close();
    },
  };
}
