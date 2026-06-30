import { describe, it, expect, beforeEach, vi } from 'vitest';
import { verifyRoomToken } from '../shared/room-token.js';

const { state } = vi.hoisted(() => ({
  state: { secret: undefined as string | undefined },
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { ROOM_RELAY_SECRET: state.secret } }),
}));

// Imported after the mock so relaySecret() reads the mocked env.
import { mintRelayToken } from './relay-admission';

const ROOM = 'AbCdEf0123456789AbCdEf01';
const KEY = 'test-relay-secret-cccccccccccccccccccccccc';

beforeEach(() => {
  state.secret = undefined;
});

describe('mintRelayToken', () => {
  it('mints a token the relay accepts for this room only when the secret is set', async () => {
    state.secret = KEY;
    const token = await mintRelayToken(ROOM);
    expect(typeof token).toBe('string');
    expect(await verifyRoomToken(KEY, ROOM, token!)).toBe(true);
    expect(await verifyRoomToken(KEY, 'otherRoom', token!)).toBe(false);
  });

  it('returns null when the secret is unset (gate inactive)', async () => {
    state.secret = undefined;
    expect(await mintRelayToken(ROOM)).toBeNull();
  });
});
