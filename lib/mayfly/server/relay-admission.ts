/**
 * Mints the relay admission token (see lib/mayfly/shared/room-token.js) after a
 * room API gate passes. Returns null (and logs a one-time warning) when
 * ROOM_RELAY_SECRET is unset, so the relay gate stays inactive until the secret
 * is provisioned on BOTH this app worker and the room relay worker:
 *   wrangler secret put ROOM_RELAY_SECRET   (run for the app worker AND workers/room)
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { mintRoomToken } from '../shared/room-token.js';

let warnedNoSecret = false;

function relaySecret(): string | undefined {
  let fromEnv: string | undefined;
  try {
    fromEnv = (getCloudflareContext().env as unknown as { ROOM_RELAY_SECRET?: string })
      .ROOM_RELAY_SECRET;
  } catch {
    fromEnv = undefined;
  }
  return fromEnv ?? process.env.ROOM_RELAY_SECRET;
}

/** Mint a relay admission token for roomId, or null when the gate is inactive. */
export async function mintRelayToken(roomId: string): Promise<string | null> {
  const secret = relaySecret();
  if (!secret) {
    if (!warnedNoSecret) {
      console.warn('[rooms] ROOM_RELAY_SECRET unset — relay admission gate inactive');
      warnedNoSecret = true;
    }
    return null;
  }
  return mintRoomToken(secret, roomId);
}
