/**
 * Mayfly shared constants + JSDoc typedefs.
 *
 * This module is imported by BOTH the Next.js client (under app/rooms) and the
 * room relay Worker (under workers/room). Keep it dependency-free and
 * environment-agnostic — no browser globals, no node:* imports.
 */

/** Current room-credential format version. Parse defensively; reject others. */
export const CREDENTIAL_VERSION = 1;

/** Room id is 16 random bytes (base64url, no padding, in the fragment). */
export const ROOM_ID_BYTES = 16;

/** Symmetric room key is a 32-byte XChaCha20-Poly1305 secretbox key. */
export const ROOM_KEY_BYTES = 32;

/** Room lifetime — a mayfly lives ~24h. The Worker is the source of truth. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/** Message kinds carried inside the encrypted body. */
export const MESSAGE_KINDS = ['text', 'reaction', 'presence'];

/** Cast modes. Sealed = random key (three-words can't join). Open = key
 *  derived from the three words, so anyone who hears them can join. */
export const ROOM_MODES = ['sealed', 'open'];

/**
 * @typedef {Object} RoomCredential
 * @property {string} id  base64url room id (no padding)
 * @property {string} k   base64url room key (no padding)
 * @property {number} v   credential format version
 */

/**
 * @typedef {Object} MessageBody  Decrypted, application-level message payload.
 * @property {'text'|'reaction'|'presence'} kind
 * @property {string} [text]      for kind=text
 * @property {string} [emoji]     for kind=reaction
 * @property {string} [targetId]  message id a reaction targets
 * @property {Object} [profile]   for kind=presence: { handle, avatar, vibe }
 */
