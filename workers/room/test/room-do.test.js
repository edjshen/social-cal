import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

// End-to-end relay tests against a live RoomDO in a workerd isolate. Mirrors the
// manual `wrangler dev` roundtrip, now runnable in CI. The relay is a dumb
// encrypted forwarder, so ciphertext/sig are arbitrary opaque strings here.

const ORIGIN = 'http://localhost:3000';
const hlc = (counter) => ({ wallMillis: Date.now(), counter, nodeId: 'nodeA' });

let roomCounter = 0;
function uniqueRoom() {
  // base64url-ish id segment; unique per test for isolated DO state.
  return `e2eroom${Date.now()}x${roomCounter++}`;
}

async function openSocket(roomId, origin = ORIGIN) {
  const res = await SELF.fetch(`https://relay.test/room/${roomId}`, {
    headers: { Upgrade: 'websocket', Origin: origin },
  });
  if (res.status !== 101) {
    throw new Error(`expected 101 upgrade, got ${res.status}`);
  }
  const ws = res.webSocket;
  ws.accept();
  const frames = [];
  ws.addEventListener('message', (e) => {
    frames.push(JSON.parse(typeof e.data === 'string' ? e.data : ''));
  });
  return {
    ws,
    frames,
    send: (f) => ws.send(JSON.stringify(f)),
    clear: () => (frames.length = 0),
    async waitFor(type, ms = 2000) {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const f = frames.find((x) => x.type === type);
        if (f) return f;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`timeout waiting for ${type}; got [${frames.map((f) => f.type).join(',')}]`);
    },
  };
}

describe('relay HTTP surface', () => {
  it('serves CORS /health for an allowed origin', async () => {
    const res = await SELF.fetch('https://relay.test/health', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers OPTIONS preflight with 204 + CORS', async () => {
    const res = await SELF.fetch('https://relay.test/health', {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('404s unknown paths', async () => {
    const res = await SELF.fetch('https://relay.test/nope');
    expect(res.status).toBe(404);
  });

  it('rejects a WS upgrade from a disallowed origin with 403', async () => {
    const res = await SELF.fetch(`https://relay.test/room/${uniqueRoom()}`, {
      headers: { Upgrade: 'websocket', Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects a WS upgrade with no origin (non-browser client) with 403', async () => {
    const res = await SELF.fetch(`https://relay.test/room/${uniqueRoom()}`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(res.status).toBe(403);
  });

  it('426s a non-websocket request to a room', async () => {
    const res = await SELF.fetch(`https://relay.test/room/${uniqueRoom()}`, {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(426);
  });

  it('admits a tokenless upgrade when ROOM_RELAY_SECRET is unset (gate inactive)', async () => {
    // This default config injects no secret, so the H-2 admission gate is OFF
    // and a valid-origin upgrade with NO `?t=` must still succeed (101) — the
    // explicit fail-open-until-configured assertion (admission.test.js covers
    // the enforcing path under the secret-set config).
    const res = await SELF.fetch(`https://relay.test/room/${uniqueRoom()}`, {
      headers: { Upgrade: 'websocket', Origin: ORIGIN },
    });
    expect(res.status).toBe(101);
    res.webSocket?.accept();
    res.webSocket?.close();
  });
});

describe('relay protocol', () => {
  it('welcome stamps a 24h expiry and serverNow', async () => {
    const a = await openSocket(uniqueRoom());
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA' });
    const welcome = await a.waitFor('welcome');
    expect(welcome.createdAt).toBeGreaterThan(0);
    expect(welcome.expiresAt).toBe(welcome.createdAt + 24 * 60 * 60 * 1000);
    expect(typeof welcome.serverNow).toBe('number');
    expect(welcome.latestSeq).toBe(0);
    await a.waitFor('backlog_done');
    a.ws.close();
  });

  it('publish -> ack assigns a monotonic seq; resend is idempotent', async () => {
    const a = await openSocket(uniqueRoom());
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA' });
    await a.waitFor('backlog_done');

    a.send({
      type: 'publish',
      id: 'm1',
      hlc: hlc(0),
      kind: 'text',
      ciphertext: 'CT1',
      sig: 'S1',
      profilePub: 'pubA',
    });
    const ack1 = await a.waitFor('ack');
    expect(ack1).toMatchObject({ id: 'm1', seq: 1 });

    // Idempotent resend of the same id -> original seq, no new row.
    a.clear();
    a.send({
      type: 'publish',
      id: 'm1',
      hlc: hlc(0),
      kind: 'text',
      ciphertext: 'CT1',
      sig: 'S1',
      profilePub: 'pubA',
    });
    const ackDup = await a.waitFor('ack');
    expect(ackDup).toMatchObject({ id: 'm1', seq: 1 });

    // A distinct message gets the next seq.
    a.clear();
    a.send({
      type: 'publish',
      id: 'm2',
      hlc: hlc(1),
      kind: 'text',
      ciphertext: 'CT2',
      sig: 'S2',
      profilePub: 'pubA',
    });
    const ack2 = await a.waitFor('ack');
    expect(ack2).toMatchObject({ id: 'm2', seq: 2 });
    a.ws.close();
  });

  it('resume(0) streams the backlog, then backlog_done', async () => {
    const room = uniqueRoom();
    const a = await openSocket(room);
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA' });
    await a.waitFor('backlog_done');
    a.send({
      type: 'publish',
      id: 'x1',
      hlc: hlc(0),
      kind: 'text',
      ciphertext: 'C1',
      sig: 'S',
      profilePub: 'pubA',
    });
    await a.waitFor('ack');

    const b = await openSocket(room);
    b.send({ type: 'hello', resumeFromSeq: 0, profilePub: 'pubB' });
    await b.waitFor('welcome');
    await b.waitFor('backlog_done');
    const events = b.frames.filter((f) => f.type === 'event');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'x1', seq: 1, ciphertext: 'C1' });
    a.ws.close();
    b.ws.close();
  });

  it('broadcasts a publish to peers but not back to the sender', async () => {
    const room = uniqueRoom();
    const a = await openSocket(room);
    const b = await openSocket(room);
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA' });
    b.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubB' });
    await a.waitFor('backlog_done');
    await b.waitFor('backlog_done');

    a.clear();
    b.clear();
    a.send({
      type: 'publish',
      id: 'live1',
      hlc: hlc(0),
      kind: 'text',
      ciphertext: 'LIVE',
      sig: 'S',
      profilePub: 'pubA',
    });

    const bEvent = await b.waitFor('event');
    expect(bEvent).toMatchObject({ id: 'live1', seq: 1, ciphertext: 'LIVE' });
    await a.waitFor('ack');
    // Sender must NOT receive its own echo live.
    await new Promise((r) => setTimeout(r, 150));
    expect(a.frames.find((f) => f.type === 'event' && f.id === 'live1')).toBeUndefined();
    a.ws.close();
    b.ws.close();
  });

  it('honors a clamped custom expiry from the first opener', async () => {
    // ~3h out — within the [1h, 7d] clamp, so honored as-is.
    const want = Date.now() + 3 * 60 * 60 * 1000;
    const a = await openSocket(uniqueRoom());
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA', requestedExpiresAt: want });
    const welcome = await a.waitFor('welcome');
    expect(Math.abs(welcome.expiresAt - want)).toBeLessThan(5000);
    a.ws.close();
  });

  it('clamps an over-long requested expiry to 7 days', async () => {
    const tooFar = Date.now() + 90 * 24 * 60 * 60 * 1000; // 90 days
    const a = await openSocket(uniqueRoom());
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA', requestedExpiresAt: tooFar });
    const welcome = await a.waitFor('welcome');
    const sevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(welcome.expiresAt).toBeLessThanOrEqual(sevenDays + 5000);
    expect(welcome.expiresAt).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    a.ws.close();
  });

  it('ignores a custom expiry once the room has messages', async () => {
    const room = uniqueRoom();
    const a = await openSocket(room);
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA' });
    const w1 = await a.waitFor('welcome');
    const original = w1.expiresAt;
    a.send({
      type: 'publish',
      id: 'm1',
      hlc: hlc(0),
      kind: 'text',
      ciphertext: 'C',
      sig: 'S',
      profilePub: 'pubA',
    });
    await a.waitFor('ack');
    // A second opener tries to extend the room — must be ignored.
    const b = await openSocket(room);
    b.send({
      type: 'hello',
      resumeFromSeq: null,
      profilePub: 'pubB',
      requestedExpiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
    });
    const w2 = await b.waitFor('welcome');
    expect(Math.abs(w2.expiresAt - original)).toBeLessThan(2000);
    a.ws.close();
    b.ws.close();
  });

  it('answers ping with pong and survives malformed frames', async () => {
    const a = await openSocket(uniqueRoom());
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA' });
    await a.waitFor('backlog_done');

    a.send({ type: 'ping' });
    const pong = await a.waitFor('pong');
    expect(typeof pong.serverNow).toBe('number');

    // Garbage frames are dropped, socket stays alive.
    a.ws.send('not json');
    a.ws.send(JSON.stringify({ type: 'bogus' }));
    a.clear();
    a.send({ type: 'ping' });
    await a.waitFor('pong');
    a.ws.close();
  });
});

describe('relay identity + size guards', () => {
  it('drops a publish under a pubkey the socket did not bind at hello (sybil)', async () => {
    const room = uniqueRoom();
    const a = await openSocket(room);
    const b = await openSocket(room);
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA' });
    b.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubB' });
    await a.waitFor('backlog_done');
    await b.waitFor('backlog_done');

    a.clear();
    b.clear();
    // a bound 'pubA' at hello; publishing as 'pubB' must be dropped (no ack, no fan-out).
    a.send({
      type: 'publish',
      id: 'sybil1',
      hlc: hlc(0),
      kind: 'text',
      ciphertext: 'CT',
      sig: 'S',
      profilePub: 'pubB',
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(a.frames.find((f) => f.type === 'ack' && f.id === 'sybil1')).toBeUndefined();
    expect(b.frames.find((f) => f.type === 'event' && f.id === 'sybil1')).toBeUndefined();
    a.ws.close();
    b.ws.close();
  });

  it('allows a publish under the same pubkey the socket bound at hello', async () => {
    const room = uniqueRoom();
    const a = await openSocket(room);
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA' });
    await a.waitFor('backlog_done');

    a.clear();
    a.send({
      type: 'publish',
      id: 'own1',
      hlc: hlc(0),
      kind: 'text',
      ciphertext: 'CT',
      sig: 'S',
      profilePub: 'pubA',
    });
    const ack = await a.waitFor('ack');
    expect(ack).toMatchObject({ id: 'own1' });
    a.ws.close();
  });

  it('drops an oversized frame before parse without wedging the socket', async () => {
    const a = await openSocket(uniqueRoom());
    a.send({ type: 'hello', resumeFromSeq: null, profilePub: 'pubA' });
    await a.waitFor('backlog_done');

    // A publish-shaped frame far past the 20 KiB pre-parse cap — must be dropped.
    const bigString = JSON.stringify({
      type: 'publish',
      id: 'big1',
      hlc: hlc(0),
      kind: 'text',
      ciphertext: 'x'.repeat(25000),
      sig: 'S',
      profilePub: 'pubA',
    });
    expect(bigString.length).toBeGreaterThan(20 * 1024);
    a.ws.send(bigString);

    // Socket isn't wedged: a subsequent ping still answers pong.
    a.clear();
    a.send({ type: 'ping' });
    const pong = await a.waitFor('pong');
    expect(typeof pong.serverNow).toBe('number');
    a.ws.close();
  });
});
