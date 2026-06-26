import { and, eq } from 'drizzle-orm';
import { getMayflyDb } from '../db';
import { mayflyRateLimits } from '../db/schema';

export function clientIpKey(request: Request): string {
  const ip = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
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
export async function checkServerRateLimit({ scope, key, max, windowMs }: RLArgs): Promise<{ ok: boolean; retryAfterMs?: number }> {
  const db = getMayflyDb();
  const row = (await db.select().from(mayflyRateLimits).where(and(eq(mayflyRateLimits.scope, scope), eq(mayflyRateLimits.k, key))).limit(1))[0];
  const now = Date.now();
  if (!row) return { ok: true };
  if (now - row.windowStart >= windowMs) return { ok: true };
  if (row.hits >= max) return { ok: false, retryAfterMs: windowMs - (now - row.windowStart) };
  return { ok: true };
}
export async function recordServerRateLimitHit({ scope, key, max, windowMs }: RLArgs): Promise<{ ok: boolean; retryAfterMs?: number }> {
  const db = getMayflyDb();
  const now = Date.now();
  const row = (await db.select().from(mayflyRateLimits).where(and(eq(mayflyRateLimits.scope, scope), eq(mayflyRateLimits.k, key))).limit(1))[0];
  if (!row) {
    await db.insert(mayflyRateLimits).values({ id: crypto.randomUUID(), scope, k: key, hits: 1, windowStart: now })
      .onConflictDoUpdate({ target: [mayflyRateLimits.scope, mayflyRateLimits.k], set: { hits: 1, windowStart: now } });
    return { ok: true };
  }
  if (now - row.windowStart >= windowMs) {
    await db.update(mayflyRateLimits).set({ hits: 1, windowStart: now }).where(eq(mayflyRateLimits.id, row.id));
    return { ok: true };
  }
  if (row.hits >= max) return { ok: false, retryAfterMs: windowMs - (now - row.windowStart) };
  await db.update(mayflyRateLimits).set({ hits: row.hits + 1 }).where(eq(mayflyRateLimits.id, row.id));
  return { ok: true };
}
