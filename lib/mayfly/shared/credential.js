/**
 * Room credential <-> URL fragment. The credential (room id + key) lives in the
 * URL fragment (`#...`), which browsers never transmit to servers — so the
 * relay never sees the key. Sound / NFC / link / three-words / QR all carry the
 * same fragment payload string.
 *
 *   https://orbit.junting-mp3.workers.dev/rooms#i=<roomIdB64url>&k=<keyB64url>&v=1
 *
 * Optional fields (still v=1, parsed defensively, ignored by older clients):
 *   e=1            this is a PUBLIC event room — joining is open (no phone gate)
 *   x=<ms>         desired expiry (epoch millis); the first opener passes it to
 *                  the relay as the room's lifetime (clamped server-side)
 *
 * Pure string/encoding logic only — no crypto, no browser globals — so it can
 * be unit-tested and reused on both ends. Parse defensively; reject unknown
 * versions (security checklist §20).
 */
import { CREDENTIAL_VERSION } from './types.js';

/**
 * Build the fragment string (without the leading '#') from base64url id + key.
 * @param {string} idB64
 * @param {string} keyB64
 * @param {{ event?: boolean, expiresAt?: number|null }} [opts]
 * @returns {string} e.g. "i=AAAA&k=BBBB&v=1" (+ "&e=1&x=...")
 */
export function buildFragment(idB64, keyB64, opts = {}) {
  const params = new URLSearchParams();
  params.set('i', idB64);
  params.set('k', keyB64);
  params.set('v', String(CREDENTIAL_VERSION));
  if (opts.event) params.set('e', '1');
  if (opts.expiresAt != null && Number.isFinite(opts.expiresAt)) {
    params.set('x', String(Math.floor(opts.expiresAt)));
  }
  return params.toString();
}

/** Build a full shareable URL for a room. */
export function buildRoomUrl(idB64, keyB64, origin, opts = {}) {
  const base = (origin || 'https://orbit.junting-mp3.workers.dev').replace(/\/$/, '');
  return `${base}/rooms#${buildFragment(idB64, keyB64, opts)}`;
}

/**
 * Parse a fragment payload into a credential. Accepts a raw fragment string
 * with or without a leading '#', or a full URL. Returns null on anything
 * malformed or an unknown version.
 *
 * @returns {{ id: string, k: string, v: number, event: boolean, expiresAt: number|null } | null}
 */
export function parseFragment(input) {
  if (typeof input !== 'string' || input.length === 0) return null;

  let frag = input;
  // Full URL? Take everything after the first '#'.
  const hashAt = frag.indexOf('#');
  if (hashAt >= 0) frag = frag.slice(hashAt + 1);
  if (frag.startsWith('#')) frag = frag.slice(1);
  if (!frag) return null;

  let params;
  try {
    params = new URLSearchParams(frag);
  } catch {
    return null;
  }

  const id = params.get('i');
  const k = params.get('k');
  const vRaw = params.get('v');
  const v = Number(vRaw);

  if (!id || !k || !vRaw || !Number.isInteger(v)) return null;
  if (v !== CREDENTIAL_VERSION) return null; // reject unknown versions
  // base64url sanity: id is 16 bytes (~22 chars), key 32 bytes (~43 chars).
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !/^[A-Za-z0-9_-]+$/.test(k)) return null;

  const event = params.get('e') === '1';
  const xRaw = params.get('x');
  let expiresAt = null;
  if (xRaw != null) {
    const x = Number(xRaw);
    if (Number.isFinite(x) && x > 0) expiresAt = Math.floor(x);
  }

  return { id, k, v, event, expiresAt };
}
