/**
 * Mayfly wire protocol — discriminated unions validated with zod on receipt.
 *
 * The relay understands only `seq`, `id`, `roomId`, and opaque
 * `ciphertext`/`sig`; it never inspects message bodies. Both the client and the
 * Worker import these schemas, so every inbound frame on both ends is validated
 * before use (security checklist §20).
 *
 * Idempotency: `publish.id` is the client-generated UUID. The server dedupes on
 * `id`; a retransmit returns the original ack with the original seq.
 * Resume: on reconnect the client sends hello.resumeFromSeq = lastSeqSeen; the
 * server streams only events with seq > resumeFromSeq, then backlog_done.
 */
import { z } from 'zod';

// Field size bounds. These cap the per-frame work/storage a single client can
// force on the relay (which never decrypts — so it can't judge content, only
// size). A text message's ciphertext is small; 16 KiB is generous headroom while
// still bounding a room's total storage to MAX_LOG_ROWS * this (see room-do.js).
const MAX_CIPHERTEXT = 16 * 1024; // base64url of the encrypted body
const MAX_SIG = 128; // Ed25519 detached sig is ~86 chars base64url
const MAX_PUBKEY = 128; // 32-byte key is ~43 chars base64url
const MAX_ID = 64; // client UUID
const MAX_NODE = 64; // HLC node id

// HLC numeric bounds. Beyond rejecting junk, these preserve encodeHLC()'s
// fixed-width hex encoding (the IndexedDB ordering index): wallMillis must fit
// 12 hex chars (< 2^48 — year ~10889, far past any real timestamp) and counter
// 4 hex chars (< 2^16). Without these, a signed frame with an out-of-range
// wallMillis/counter would overflow the pad and flip stored message order.
export const hlcSchema = z.object({
  wallMillis: z
    .number()
    .int()
    .nonnegative()
    .lt(2 ** 48),
  counter: z
    .number()
    .int()
    .nonnegative()
    .lt(2 ** 16),
  nodeId: z.string().max(MAX_NODE),
});

const kindSchema = z.enum(['text', 'reaction', 'presence']);

export const clientFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    resumeFromSeq: z.number().nullable(),
    profilePub: z.string().max(MAX_PUBKEY),
    // Optional: the first opener of a room may request a custom expiry (epoch
    // millis) — e.g. a per-event room living until the event ends. The relay
    // clamps it and only honors it on first materialization (see room-do.js).
    requestedExpiresAt: z.number().optional(),
  }),
  z.object({
    type: z.literal('publish'),
    id: z.string().max(MAX_ID),
    hlc: hlcSchema,
    kind: kindSchema,
    ciphertext: z.string().max(MAX_CIPHERTEXT),
    sig: z.string().max(MAX_SIG),
    profilePub: z.string().max(MAX_PUBKEY),
  }),
  z.object({ type: z.literal('ping') }),
]);

export const serverFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    createdAt: z.number(),
    expiresAt: z.number(),
    serverNow: z.number(),
    latestSeq: z.number(),
  }),
  z.object({
    type: z.literal('event'),
    seq: z.number(),
    id: z.string(),
    hlc: hlcSchema,
    kind: kindSchema,
    ciphertext: z.string(),
    sig: z.string(),
    profilePub: z.string(),
  }),
  z.object({ type: z.literal('ack'), id: z.string(), seq: z.number() }),
  z.object({ type: z.literal('backlog_done'), latestSeq: z.number() }),
  z.object({ type: z.literal('expired') }),
  z.object({ type: z.literal('pong'), serverNow: z.number() }),
]);

/** Parse + validate a raw string frame. Returns null on any malformed input. */
export function parseClientFrame(raw) {
  try {
    return clientFrameSchema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

export function parseServerFrame(raw) {
  try {
    return serverFrameSchema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}
