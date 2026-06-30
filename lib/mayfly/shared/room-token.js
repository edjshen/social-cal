/**
 * Mayfly relay admission token — HMAC capability minted by the room API gate
 * (after the phone/consent check) and verified by the relay on WS upgrade.
 * Bound to roomId + an expiry; Web Crypto only, so it runs in any Worker and in
 * the Next server runtime. When ROOM_RELAY_SECRET is unset on either side the
 * caller skips this entirely (see relay-admission.ts / worker.js), so enforcement
 * is fail-open-until-configured.
 *
 * Token format: `<expMs>.<base64url(HMAC-SHA256(secret, "<roomId>.<expMs>"))>`.
 */
const enc = new TextEncoder();
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function hmacBytes(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return new Uint8Array(sig);
}
// TTL covers a room's whole life (relay clamps rooms to <= 7 days), so a token
// minted at create/join never needs a mid-session refresh.
export const ROOM_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export async function mintRoomToken(secret, roomId, ttlMs = ROOM_TOKEN_TTL_MS, nowMs = Date.now()) {
  if (!secret) throw new Error('[room-token] secret required');
  const exp = nowMs + ttlMs;
  const sig = await hmacBytes(secret, `${roomId}.${exp}`);
  return `${exp}.${b64url(sig)}`;
}
function timingSafeStrEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function verifyRoomToken(secret, roomId, token, nowMs = Date.now()) {
  if (!secret || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp <= nowMs) return false;
  const expected = b64url(await hmacBytes(secret, `${roomId}.${exp}`));
  return timingSafeStrEqual(expected, sig);
}
