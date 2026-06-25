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
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    const frame = parseClientFrame(raw);
    if (!frame) return; // drop malformed frames silently

    if (frame.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', serverNow: Date.now() }));
      return;
    }

    if (frame.type === 'hello') {
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
      const from = frame.resumeFromSeq ?? 0;
      for (const row of this.sql.exec('SELECT * FROM log WHERE seq > ? ORDER BY seq ASC', from)) {
        ws.send(JSON.stringify(this.rowToEvent(row)));
      }
      ws.send(JSON.stringify({ type: 'backlog_done', latestSeq: this.latestSeq() }));
      return;
    }

    if (frame.type === 'publish') {
      // Idempotent: a retransmit of the same id returns the original ack/seq.
      const existing = this.sql.exec('SELECT seq FROM log WHERE id = ?', frame.id).toArray();
      if (existing.length > 0) {
        ws.send(JSON.stringify({ type: 'ack', id: frame.id, seq: existing[0].seq }));
        return;
      }
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
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws) {
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
