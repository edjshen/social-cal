import { sql } from 'drizzle-orm';
import { getMayflyDb } from '../db';
import { mayflyRateLimits } from '../db/schema';

export function clientIpKey(request: Request): string {
  // Trust ONLY cf-connecting-ip (set authoritatively by the Cloudflare edge).
  // x-forwarded-for is client-controllable, so falling back to it off the CF
  // edge would let an attacker rotate the key freely and defeat IP limits.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  return `ip:${ip}`;
}
export async function hashedRateLimitKey(prefix: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}:${hex.slice(0, 32)}`;
}
export function rateLimitResponse(message: string, info?: { retryAfterMs?: number }) {
  const headers: Record<string, string> = {};
  if (info?.retryAfterMs) headers['Retry-After'] = String(Math.ceil(info.retryAfterMs / 1000));
  return Response.json({ error: message }, { status: 429, headers });
}
type RLArgs = { scope: string; key: string; max: number; windowMs: number };

/**
 * Atomically count one hit against a fixed window and report whether the caller
 * is now over the limit.
 *
 * This is a SINGLE upsert (insert-or-increment with RETURNING), so concurrent
 * requests can't slip past a check-then-write gap (the old two-phase version had
 * a TOCTOU race that let a burst exceed the limit — relevant for SMS-send abuse).
 * SQLite/D1 executes the statement atomically; the window resets in the same
 * statement when it has elapsed.
 */
export async function consumeServerRateLimit({
  scope,
  key,
  max,
  windowMs,
}: RLArgs): Promise<{ ok: boolean; retryAfterMs?: number }> {
  const db = getMayflyDb();
  const now = Date.now();
  const resetIf = sql`${now} - ${mayflyRateLimits.windowStart} >= ${windowMs}`;
  const [row] = await db
    .insert(mayflyRateLimits)
    .values({ id: crypto.randomUUID(), scope, k: key, hits: 1, windowStart: now })
    .onConflictDoUpdate({
      target: [mayflyRateLimits.scope, mayflyRateLimits.k],
      set: {
        hits: sql`CASE WHEN ${resetIf} THEN 1 ELSE ${mayflyRateLimits.hits} + 1 END`,
        windowStart: sql`CASE WHEN ${resetIf} THEN ${now} ELSE ${mayflyRateLimits.windowStart} END`,
      },
    })
    .returning({ hits: mayflyRateLimits.hits, windowStart: mayflyRateLimits.windowStart });
  // The upsert+RETURNING should always yield a row; if it somehow doesn't, fail
  // CLOSED — this gates SMS sends / room abuse, where denying is the safe default
  // (the caller in phone-gate also fails closed on a thrown error).
  if (!row) return { ok: false, retryAfterMs: windowMs };
  if (row.hits <= max) return { ok: true };
  return { ok: false, retryAfterMs: windowMs - (now - row.windowStart) };
}
