/**
 * Mayfly crypto primitives. Message confidentiality uses NaCl secretbox
 * (XSalsa20-Poly1305); profile authenticity uses Ed25519 detached signatures so
 * the relay or another member cannot spoof a profile's messages within a room.
 *
 * Implemented on tweetnacl — pure JS, no WASM — so the exact same module runs in
 * the browser, under SSR guards, and in node:test, with no async init or broken
 * ESM packaging to work around. The relay Worker never imports this; it only
 * forwards opaque base64url ciphertext + sig strings.
 *
 * `ready()` is retained (and is a no-op) so call sites can stay async-init
 * friendly if the primitive ever changes again.
 */
import nacl from 'tweetnacl';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** No async init needed for tweetnacl; resolves immediately. */
export function ready() {
  return Promise.resolve();
}

/* ── base64url (no padding) — URL/fragment safe ───────────────── */

export function toB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin =
    typeof atob === 'function'
      ? atob(b64 + pad)
      : Buffer.from(b64 + pad, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ── room id + key ────────────────────────────────────────────── */

export function generateRoomId() {
  return nacl.randomBytes(16);
}

export function generateRoomKey() {
  return nacl.randomBytes(nacl.secretbox.keyLength); // 32 bytes
}

export function keyToFragment(key) {
  return toB64(key);
}

export function keyFromFragment(fragment) {
  return fromB64(fragment);
}

/* ── secretbox encrypt/decrypt (output: base64url(nonce || cipher)) ── */

export function encrypt(plaintext, key) {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const cipher = nacl.secretbox(plaintext, nonce, key);
  const combined = new Uint8Array(nonce.length + cipher.length);
  combined.set(nonce);
  combined.set(cipher, nonce.length);
  return toB64(combined);
}

/** Throws on auth failure (returns null from nacl -> we raise). */
export function decrypt(payload, key) {
  const combined = fromB64(payload);
  const nonce = combined.slice(0, nacl.secretbox.nonceLength);
  const cipher = combined.slice(nacl.secretbox.nonceLength);
  const pt = nacl.secretbox.open(cipher, nonce, key);
  if (!pt) throw new Error('mayfly: secretbox auth failed');
  return pt;
}

export function encryptString(text, key) {
  return encrypt(enc.encode(text), key);
}

export function decryptString(payload, key) {
  return dec.decode(decrypt(payload, key));
}

/* ── Ed25519 profile signatures ───────────────────────────────── */

export function generateProfileKeypair() {
  const kp = nacl.sign.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function sign(bytes, secretKey) {
  return nacl.sign.detached(bytes, secretKey);
}

export function verify(sig, bytes, publicKey) {
  return nacl.sign.detached.verify(bytes, sig, publicKey);
}

/**
 * Open-mode key derivation: anyone who hears the three words (plus the public
 * room id) derives the same 32-byte key. Uses SHA-512(words || roomId) truncated
 * to 32 bytes. NOTE: this is intentionally a plain hash, not a memory-hard KDF —
 * open mode is for loud public circles where privacy is explicitly not the
 * point (see docs/mayfly-handoff.md §5). Sealed rooms use a random key instead.
 */
export function deriveOpenKey(words, roomId) {
  const w = enc.encode(words);
  const combined = new Uint8Array(w.length + roomId.length);
  combined.set(w);
  combined.set(roomId, w.length);
  return nacl.hash(combined).slice(0, nacl.secretbox.keyLength);
}

/**
 * Deterministic credential for a PUBLIC per-event room. Everyone who knows the
 * event key (its public slug) derives the SAME room id + key, so a button/QR on
 * the event page opens one shared room. No secret involved — that's intended;
 * event rooms are open. Domain-separated hashes keep id and key independent.
 *
 * @param {string} eventKey  a stable public identifier for the event (slug)
 * @returns {{ idBytes: Uint8Array, key: Uint8Array }}
 */
export function deriveEventRoom(eventKey) {
  const idBytes = nacl.hash(enc.encode(`mayfly-event-id:${eventKey}`)).slice(0, 16);
  const key = nacl
    .hash(enc.encode(`mayfly-event-key:${eventKey}`))
    .slice(0, nacl.secretbox.keyLength);
  return { idBytes, key };
}

/**
 * Canonical bytes that get signed for a published frame. The signature covers
 * the ciphertext PLUS routing metadata (roomId, sender pubkey, hlc, kind) so
 * order and origin are tamper-evident. Both signer and verifier must build this
 * identically — do not reorder fields.
 */
export function envelopeBytes(env) {
  const canonical = JSON.stringify([
    env.roomId,
    env.profilePub,
    env.hlc.wallMillis,
    env.hlc.counter,
    env.hlc.nodeId,
    env.kind,
    env.ciphertext,
  ]);
  return enc.encode(canonical);
}
