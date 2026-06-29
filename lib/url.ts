// Same-origin redirect-target guard for `?next=` return URLs. Only a relative
// path beginning with a single "/" is allowed: this blocks open-redirects via
// "//evil.com" or "/\evil.com" and rejects absolute URLs with a scheme. Returns
// the path on success, or null so callers can fall back to a safe default.
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return null;
  if (raw[0] !== '/') return null;
  if (raw[1] === '/' || raw[1] === '\\') return null;
  return raw;
}

// Append a validated `next` as a query param to an auth path (/login, /register).
// Falls back to the bare path when `next` is missing or unsafe.
export function withNext(path: string, next: unknown): string {
  const safe = safeNext(next);
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}
