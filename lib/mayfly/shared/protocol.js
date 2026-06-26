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

export const hlcSchema = z.object({
  wallMillis: z.number(),
  counter: z.number(),
  nodeId: z.string(),
});

const kindSchema = z.enum(['text', 'reaction', 'presence']);

export const clientFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    resumeFromSeq: z.number().nullable(),
    profilePub: z.string(),
    // Optional: the first opener of a room may request a custom expiry (epoch
    // millis) — e.g. a per-event room living until the event ends. The relay
    // clamps it and only honors it on first materialization (see room-do.js).
    requestedExpiresAt: z.number().optional(),
  }),
  z.object({
    type: z.literal('publish'),
    id: z.string(),
    hlc: hlcSchema,
    kind: kindSchema,
    ciphertext: z.string(),
    sig: z.string(),
    profilePub: z.string(),
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
