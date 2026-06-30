/**
 * RoomDO — one Durable Object per room. The single source of truth for a room's
 * lifespan and its append-only ciphertext log.
 *
 * - WebSocket Hibernation API: idle rooms cost nothing and survive eviction.
 * - SQLite storage: the append-only log + a meta table (createdAt/expiresAt).
 * - Alarm at createdAt + 24h: self-destruct (wipe storage, close sockets).
 *
 * Single-threaded execution per DO serializes all writes to the log, so the
 * AUTOINCREMENT sequence counter needs no locks. The DO only ever sees opaque
 * ciphertext + signatures — it never holds the key or decrypts.
 *
 * Shared protocol validation (zod) is imported by relative path; wrangler's
 * esbuild bundles it directly (no separate publish). zod is declared in this
 * worker's own package.json.
 */
import { DurableObject } from 'cloudflare:workers';
import { parseClientFrame } from '../../../lib/mayfly/shared/protocol.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// A room's first opener may request a custom expiry (e.g. a per-event room that
// should live until the event ends). Clamp it so a hostile client can't make a
// room immortal or instantly dead.
const MIN_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_TTL_MS = 7 * DAY_MS; // 7 days

// Abuse caps. The relay never decrypts, so it bounds floods by rate + count, not
// content. A client that learns a roomId could otherwise spam the append-only
// log (growing DO storage + fanning out to every peer) until the 24h self-
// destruct. These two layers bound that: an in-memory per-socket rate limit
// (holds while the DO is resident during an active flood) plus a durable cap on
// total stored rows (survives hibernation). Both are well above real chat use.
const MAX_LOG_ROWS = 20000; // durable per-room storage backstop
const MAX_FRAME_BYTES = 20 * 1024; // 16 KiB ciphertext cap + envelope headroom
const FLOOD_WINDOW_MS = 10 * 1000; // per-socket publish window
const FLOOD_MAX = 40; // max publishes per socket per window
// Concurrent sockets per room. The per-socket flood budget is multiplied by the
// socket count, and every publish fans out to all sockets (O(sockets) on a
// single-threaded DO), so an unbounded socket count is itself a DoS vector.
const MAX_SOCKETS = 128;
// hello triggers a full backlog replay; cap replays per socket per window so it
// can't be spammed into an egress/CPU amplifier.
const HELLO_MAX = 6;

// Durable (SQLite-backed) per-ROOM rate caps. The in-memory per-socket caps above
// reset when the DO hibernates (~10s idle) and don't span sockets, so a paced or
// reconnecting attacker could evade them. These live in the meta table: they
// survive hibernation and are shared across all of the room's sockets. All are
// far above real chat use, so legitimate clients never hit them.
const RATE_WINDOW_MS = 60 * 1000;
const PUB_MAX_PER_MIN = 600; // new messages stored per room per minute
// Backlog-replay egress is bounded by ROWS streamed per room per minute (not just
// replay count): each hello can stream up to the whole log, so a reconnecting
// attacker re-requesting seq>0 is the real amplifier. Generous vs. real joins.
const REPLAY_ROWS_PER_MIN = 120000;
const PING_MAX_PER_MIN = 1200; // pings answered per room per minute

export class RoomDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // blockConcurrencyWhile guarantees schema + meta are initialized before any
    // request (fetch/webSocketMessage/alarm) is served.
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER)');
      this.sql.exec(
        'CREATE TABLE IF NOT EXISTS log (' +
          'seq INTEGER PRIMARY KEY AUTOINCREMENT, ' +
          'id TEXT UNIQUE, hlc TEXT, kind TEXT, ciphertext TEXT, sig TEXT, profile_pub TEXT)'
      );
      if (this.getMeta('createdAt') === null) {
        // createdAt/expiresAt are stamped exactly once, on first materialization,
        // and echoed in every welcome — the single source of truth for expiry.
        const now = Date.now();
        this.setMeta('createdAt', now);
        this.setMeta('expiresAt', now + DAY_MS);
        await ctx.storage.setAlarm(now + DAY_MS);
      }
    });
  }

  getMeta(k) {
    // .toArray() (not .one(), which throws on zero rows) so a missing key reads
    // cleanly as null.
    const rows = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray();
    return rows.length ? rows[0].v : null;
  }

  setMeta(k, v) {
    this.sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', k, v);
  }

  /**
   * Durable fixed-window rate gate keyed by `name` (meta rows `<name>_t`/`_n`).
   * Survives hibernation and is shared across the room's sockets; the single-
   * threaded DO serializes access, so the read-modify-write is atomic. Returns
   * false once `max` is exceeded within `windowMs`.
   */
  durableConsume(name, amount, max, windowMs) {
    const now = Date.now();
    const t = this.getMeta(name + '_t');
    if (t === null || now - t >= windowMs) {
      this.setMeta(name + '_t', now);
      this.setMeta(name + '_n', amount);
      return amount <= max;
    }
    const n = (this.getMeta(name + '_n') || 0) + amount;
    this.setMeta(name + '_n', n);
    return n <= max;
  }
  durableAllow(name, max, windowMs) {
    return this.durableConsume(name, 1, max, windowMs);
  }

  latestSeq() {
    const row = this.sql.exec('SELECT MAX(seq) AS m FROM log').one();
    return row && row.m != null ? row.m : 0;
  }

  /**
   * Honor a first-opener's requested expiry, ONCE, before the room has any
   * activity. Ignored if already customized or if any message exists (the room
   * is live and its lifetime is settled). Clamped to [now+1h, now+7d].
   * @returns {boolean} whether expiry was (re)set
   */
  applyRequestedExpiry(requestedExpiresAt) {
    if (typeof requestedExpiresAt !== 'number' || !Number.isFinite(requestedExpiresAt)) {
      return false;
    }
    if (this.getMeta('expiryCustomized')) return false;
    if (this.latestSeq() > 0) {
      // Room already has messages — lock the existing lifetime.
      this.setMeta('expiryCustomized', 1);
      return false;
    }
    const now = Date.now();
    const clamped = Math.max(now + MIN_TTL_MS, Math.min(requestedExpiresAt, now + MAX_TTL_MS));
    this.setMeta('expiresAt', clamped);
    this.setMeta('expiryCustomized', 1);
    this.ctx.storage.setAlarm(clamped);
    return true;
  }

  rowToEvent(row) {
    return {
      type: 'event',
      seq: row.seq,
      id: row.id,
      hlc: JSON.parse(row.hlc),
      kind: row.kind,
      ciphertext: row.ciphertext,
      sig: row.sig,
      profilePub: row.profile_pub,
    };
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    // A client connecting after self-destruct gets 410; the client treats this
    // identically to an `expired` frame.
    if (Date.now() >= (this.getMeta('expiresAt') ?? 0)) {
      return new Response('expired', { status: 410 });
    }
    // Cap concurrent sockets per room: bounds fan-out amplification and the
    // aggregate write rate (sockets × per-socket flood budget).
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return new Response('room is full', { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    // M-1: bound pre-parse work. A valid publish is ciphertext(<=16KiB) + a small
    // envelope; anything materially larger is hostile. Drop before JSON.parse so a
    // giant frame can't tie up the single-threaded DO.
    if (raw.length > MAX_FRAME_BYTES) return;
    const frame = parseClientFrame(raw);
    if (!frame) return; // drop malformed frames silently

    if (frame.type === 'ping') {
      // Even pings cost a JSON.stringify+send on the single-threaded DO; cap them
      // durably so a resident socket can't spam them as a CPU/duration DoS.
      if (!this.durableAllow('pingrate', PING_MAX_PER_MIN, RATE_WINDOW_MS)) return;
      ws.send(JSON.stringify({ type: 'pong', serverNow: Date.now() }));
      return;
    }

    if (frame.type === 'hello') {
      // Throttle hello (each triggers a full backlog replay) per socket so it
      // can't be spammed into an egress/CPU amplifier. A legit client sends one
      // per connection; a reconnect is a new socket with a fresh budget.
      if (!this.hellos) this.hellos = new Map();
      const hnow = Date.now();
      let hb = this.hellos.get(ws);
      if (!hb || hnow - hb.windowStart >= FLOOD_WINDOW_MS) {
        hb = { count: 0, windowStart: hnow };
        this.hellos.set(ws, hb);
      }
      if (++hb.count > HELLO_MAX) return; // ignore excess hello spam

      // M-7: bind this socket to the pubkey it announces, so it can't later
      // publish/presence under a different identity (roster sybil). Survives
      // hibernation via the attachment. First hello wins.
      if (frame.profilePub) {
        try {
          const bound = ws.deserializeAttachment();
          if (!bound || !bound.pub) ws.serializeAttachment({ pub: frame.profilePub });
        } catch {
          /* attachment unavailable; skip binding */
        }
      }

      // First opener may set a custom lifetime (e.g. event room ends with the
      // event). Only honored once, before any messages exist.
      if (frame.requestedExpiresAt != null) {
        this.applyRequestedExpiry(frame.requestedExpiresAt);
      }
      const createdAt = this.getMeta('createdAt');
      const expiresAt = this.getMeta('expiresAt');
      ws.send(
        JSON.stringify({
          type: 'welcome',
          createdAt,
          expiresAt,
          serverNow: Date.now(),
          latestSeq: this.latestSeq(),
        })
      );
      // Durably bound backlog-replay EGRESS by ROWS streamed per room (not just
      // replay count). seq is dense (no deletes until self-destruct), so
      // latestSeq-from is the exact pending row count. On exceed, skip the replay
      // but still send backlog_done so a legit client isn't wedged — one hello per
      // socket never approaches the budget.
      const from = frame.resumeFromSeq ?? 0;
      const pending = Math.max(0, this.latestSeq() - from);
      if (
        pending > 0 &&
        this.durableConsume('replayrows', pending, REPLAY_ROWS_PER_MIN, RATE_WINDOW_MS)
      ) {
        for (const row of this.sql.exec('SELECT * FROM log WHERE seq > ? ORDER BY seq ASC', from)) {
          ws.send(JSON.stringify(this.rowToEvent(row)));
        }
      }
      ws.send(JSON.stringify({ type: 'backlog_done', latestSeq: this.latestSeq() }));
      return;
    }

    if (frame.type === 'publish') {
      // Per-connection flood control (best-effort; the DO is single-threaded and
      // stays resident during an active flood). The durable row cap below is the
      // backstop that survives hibernation.
      if (!this.floods) this.floods = new Map();
      const fnow = Date.now();
      let fb = this.floods.get(ws);
      if (!fb || fnow - fb.windowStart >= FLOOD_WINDOW_MS) {
        fb = { count: 0, windowStart: fnow };
        this.floods.set(ws, fb);
      }
      if (++fb.count > FLOOD_MAX) return; // drop silently; client backs off

      // Idempotent: a retransmit of the same id returns the original ack/seq.
      const existing = this.sql.exec('SELECT seq FROM log WHERE id = ?', frame.id).toArray();
      if (existing.length > 0) {
        ws.send(JSON.stringify({ type: 'ack', id: frame.id, seq: existing[0].seq }));
        return;
      }
      // M-7: a socket may only publish under the pubkey it bound at hello time.
      // If it skipped hello, pin identity on this FIRST publish too, so a socket
      // can't dodge the bind by never saying hello and still rotate pubkeys.
      let bound = null;
      try {
        bound = ws.deserializeAttachment();
      } catch {
        bound = null;
      }
      if (bound && bound.pub) {
        if (frame.profilePub !== bound.pub) return; // identity mismatch — drop
      } else if (frame.profilePub) {
        try {
          ws.serializeAttachment({ pub: frame.profilePub });
        } catch {
          /* attachment unavailable; skip binding */
        }
      }
      // Durable per-room publish rate — survives hibernation/reconnects, unlike
      // the per-socket flood counter above, so a paced attacker can't fill the
      // log or sustain fan-out by reconnecting.
      if (!this.durableAllow('pubrate', PUB_MAX_PER_MIN, RATE_WINDOW_MS)) return;
      // Durable backstop: refuse new writes once the room is at capacity so a
      // flood can't grow storage without bound before self-destruct.
      const stored = this.sql.exec('SELECT COUNT(*) AS c FROM log').one().c;
      if (stored >= MAX_LOG_ROWS) return;

      this.sql.exec(
        'INSERT INTO log (id, hlc, kind, ciphertext, sig, profile_pub) VALUES (?, ?, ?, ?, ?, ?)',
        frame.id,
        JSON.stringify(frame.hlc),
        frame.kind,
        frame.ciphertext,
        frame.sig,
        frame.profilePub
      );
      const seq = this.latestSeq();
      ws.send(JSON.stringify({ type: 'ack', id: frame.id, seq }));

      const payload = JSON.stringify({
        type: 'event',
        seq,
        id: frame.id,
        hlc: frame.hlc,
        kind: frame.kind,
        ciphertext: frame.ciphertext,
        sig: frame.sig,
        profilePub: frame.profilePub,
      });
      // Fan out to every other connected (including hibernated) socket.
      for (const peer of this.ctx.getWebSockets()) {
        if (peer !== ws) {
          try {
            peer.send(payload);
          } catch {
            /* peer is going away; ignore */
          }
        }
      }
    }
  }

  async webSocketClose(ws) {
    this.floods?.delete(ws);
    this.hellos?.delete(ws);
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws) {
    this.floods?.delete(ws);
    this.hellos?.delete(ws);
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }

  async alarm() {
    const payload = JSON.stringify({ type: 'expired' });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
        ws.close(1000, 'expired');
      } catch {
        /* socket gone */
      }
    }
    // Ephemerality is an authority: wipe everything. The room is gone.
    await this.ctx.storage.deleteAll();
  }
}
