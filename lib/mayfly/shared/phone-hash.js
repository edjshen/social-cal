/**
 * One-way, correlation-preserving hash of a phone number for the participation
 * log (mayfly_participants / mayfly_rooms), so those rows are NOT a dialable PII
 * map. The append-only CONSENT record keeps the raw number (TCPA/CTIA). Pepper
 * is HKDF-derived (domain-separated) so SESSION_SECRET is never used directly.
 * Returns null when there's no phone or no pepper — callers store null, NEVER
 * plaintext.
 */
const enc = new TextEncoder();
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function deriveKey(pepper) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pepper), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: enc.encode('mayfly-phone-hash/v1'),
    },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );
}
/** @returns {Promise<string|null>} `h:<base64url>` or null (no phone / no pepper). */
export async function hashPhoneForLog(phone, pepper) {
  if (!phone || !pepper) return null;
  const key = await deriveKey(pepper);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(phone)));
  return `h:${b64url(new Uint8Array(sig))}`;
}
