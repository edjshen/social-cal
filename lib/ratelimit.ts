/**
 * Generic D1-backed fixed-window rate limiter for Barycal server actions (auth
 * brute force / account-spam controls). Atomic: a single insert-or-increment
 * upsert with RETURNING, so concurrent attempts can't slip past a check-then-
 * write gap. Kept independent of the Mayfly limiter to honor the import boundary.
 */
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { rateLimits } from './db/schema';

/**
 * Caller IP from the Cloudflare edge. Trust ONLY cf-connecting-ip — it's set
 * authoritatively by CF; x-forwarded-for is client-spoofable, so we don't fall
 * back to it (off-edge requests share the 'unknown' bucket = fail-safe, not
 * bypassable).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('cf-connecting-ip') || 'unknown';
}

/**
 * Count one hit against (scope, key) within a fixed window. Returns whether the
 * caller is still under `max`. The window resets atomically inside the upsert
 * when it has elapsed.
 */
export async function consumeRateLimit({
  scope,
  key,
  max,
  windowMs,
}: {
  scope: string;
  key: string;
  max: number;
  windowMs: number;
}): Promise<{ ok: boolean; retryAfterMs?: number }> {
  const db = getDb();
  const now = Date.now();
  const resetIf = sql`${now} - ${rateLimits.windowStart} >= ${windowMs}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ id: crypto.randomUUID(), scope, k: key, hits: 1, windowStart: now })
    .onConflictDoUpdate({
      target: [rateLimits.scope, rateLimits.k],
      set: {
        hits: sql`CASE WHEN ${resetIf} THEN 1 ELSE ${rateLimits.hits} + 1 END`,
        windowStart: sql`CASE WHEN ${resetIf} THEN ${now} ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ hits: rateLimits.hits, windowStart: rateLimits.windowStart });
  if (!row) return { ok: true };
  if (row.hits <= max) return { ok: true };
  return { ok: false, retryAfterMs: windowMs - (now - row.windowStart) };
}
