import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { mintRoomToken } from '../../../lib/mayfly/shared/room-token.js';

// Admission gate ACTIVE: vitest.admission.config.js injects ROOM_RELAY_SECRET,
// so the relay verifies a `?t=` admission token on every WS upgrade. The secret
// constant here MUST equal the one in that config.
const SHARED = 'test-admission-secret-aaaaaaaaaaaaaaaaaaaa';
const ORIGIN = 'http://localhost:3000'; // allowed by wrangler.toml ALLOWED_ORIGINS

let n = 0;
const uniqueRoom = () => `admitroom${Date.now()}x${n++}`;

async function upgrade(roomId, { token, origin = ORIGIN } = {}) {
  const qs = token === undefined ? '' : `?t=${encodeURIComponent(token)}`;
  return SELF.fetch(`https://relay.test/room/${roomId}${qs}`, {
    headers: { Upgrade: 'websocket', Origin: origin },
  });
}

describe('relay admission gate (secret set)', () => {
  it('accepts a valid token for this room (101)', async () => {
    const room = uniqueRoom();
    const res = await upgrade(room, { token: await mintRoomToken(SHARED, room) });
    expect(res.status).toBe(101);
    // workerd requires accept() before any op (incl. close) on the client socket.
    res.webSocket?.accept();
    res.webSocket?.close();
  });

  it('rejects an upgrade with no token (403)', async () => {
    const res = await upgrade(uniqueRoom());
    expect(res.status).toBe(403);
  });

  it('rejects a garbage token (403)', async () => {
    const res = await upgrade(uniqueRoom(), { token: 'nonsense' });
    expect(res.status).toBe(403);
  });

  it('rejects a token minted for a different room (403)', async () => {
    const token = await mintRoomToken(SHARED, uniqueRoom());
    const res = await upgrade(uniqueRoom(), { token });
    expect(res.status).toBe(403);
  });

  it('still requires an allowed origin — disallowed origin 403s despite a valid token', async () => {
    const room = uniqueRoom();
    const res = await upgrade(room, {
      token: await mintRoomToken(SHARED, room),
      origin: 'https://evil.example',
    });
    expect(res.status).toBe(403);
  });
});
