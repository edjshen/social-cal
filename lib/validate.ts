/**
 * Server-side input clamping/validation for Server Actions.
 *
 * Server Actions are directly invocable HTTP endpoints — a caller can craft any
 * payload regardless of what the client form sends, and TypeScript types are
 * erased at runtime. So every action validates and bounds its inputs here rather
 * than trusting the shape. React escapes rendered output (so these are not the
 * XSS boundary); the goal is integrity + storage-abuse/DoS bounds.
 */

export const LIMITS = {
  title: 200,
  location: 200,
  displayName: 80,
  bio: 500,
  handle: 32,
  password: 200,
  sceneItems: 12,
  sceneLen: 40,
} as const;

/** Coerce to string and hard-cap length. Non-strings become ''. */
export function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** Like clampStr but preserves `undefined` (for optional patch fields). */
export function clampOptStr(v: unknown, max: number): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** Normalize a scenes array: strings only, trimmed, capped in count and length. */
export function clampScenes(
  v: unknown,
  maxItems = LIMITS.sceneItems,
  maxLen = LIMITS.sceneLen
): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .slice(0, maxItems)
    .map((s) => s.slice(0, maxLen).trim())
    .filter(Boolean);
}

/** Return `v` only if it's one of `allowed`, else `fallback`. */
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Parse an ISO/Date-ish input to a normalized ISO string, or throw. */
export function toISOOrThrow(v: unknown, label: string): string {
  const d = new Date(v as string);
  if (isNaN(d.getTime())) throw new Error(`Invalid ${label}`);
  return d.toISOString();
}
