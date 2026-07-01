// Cross-app bridge contract + crypto, shared by the barycal receive routes
// (app/api/bridge/*) and the bridge client that reports back to poisys.
//
// Two independent backends, no shared DB. Every Worker-to-Worker call is
// HMAC-signed + timestamped (replay window). The rotating event QR is a
// TOTP-style code derived from a per-event secret held server-side only.
//
// Runtime-agnostic: uses Web Crypto (`crypto.subtle`), available in the
// OpenNext/Cloudflare Workers runtime where barycal server code runs.

// ----------------------------- Projection payloads -----------------------------
// poisys -> barycal (publish). Allow-listed; never raw piece data.

export interface OrgProjection {
  id: string; // poisys organization_id
  slug: string;
  name: string;
  avatar?: string | null;
  bio?: string | null;
}

export interface PerkProjection {
  id: string;
  orgId: string;
  title: string;
  description?: string;
  pointCost: number;
  minTier?: string | null;
  totalInventory?: number | null;
  perUserLimit?: number | null;
  active: boolean;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface TierProjection {
  id: string;
  orgId: string;
  name: string;
  minPoints: number;
  sort: number;
}

export interface EventProjection {
  eventId: string; // poisys event_id
  org: OrgProjection;
  title: string;
  venueArea?: string;
  startsAt: string;
  endsAt?: string | null;
  checkinOpensAt?: string | null;
  checkinClosesAt?: string | null;
  orgBasePoints: number; // 0 => org runs no per-org program for this event
  orgBonuses: Record<string, unknown>;
  // Rotating-QR secret for this event. Stored barycal-side server-only; never
  // shipped to the partygoer client.
  rotatingSecret: string;
  stepSeconds?: number;
  perks?: PerkProjection[];
  tiers?: TierProjection[];
}

// barycal -> poisys (return sync).
export interface CheckinReport {
  eventId: string;
  barycalUserRef: string;
  displayName: string;
  pointsAwarded: number; // org-pool points (poisys analytics)
  globalAwarded: number;
  bonusBreakdown: Record<string, unknown>;
  checkedInAt: string;
}

export interface RedemptionIssueReport {
  perkId: string;
  barycalUserRef: string;
  codeHash: string;
  expiresAt: string;
}

// ------------------------------- HMAC signing -------------------------------

const enc = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Sign `${timestamp}.${body}` → hex HMAC. */
export async function signPayload(
  secret: string,
  timestamp: number,
  body: string
): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`));
  return toHex(sig);
}

/** Constant-time-ish compare of two hex strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Verify a signed body, rejecting clock skew beyond `windowSec` (default 300s). */
export async function verifyPayload(
  secret: string,
  timestamp: number,
  body: string,
  signature: string,
  nowMs: number,
  windowSec = 300
): Promise<boolean> {
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > windowSec) return false;
  const expected = await signPayload(secret, timestamp, body);
  return safeEqual(expected, signature);
}

export const BRIDGE_TS_HEADER = 'x-bridge-timestamp';
export const BRIDGE_SIG_HEADER = 'x-bridge-signature';

// --------------------------- Rotating event QR code ---------------------------
// TOTP-style: code = first 8 hex of HMAC(secret, floor(now/step)). The venue
// screen renders the current code; the partygoer scans it. Verification accepts
// ±1 step of skew so a code that just rotated mid-scan still validates. A
// screenshot is stale within `stepSeconds`.

export async function rotatingCodeAt(
  secret: string,
  stepSeconds: number,
  unixSeconds: number
): Promise<string> {
  const counter = Math.floor(unixSeconds / Math.max(1, stepSeconds));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(counter)));
  return toHex(sig).slice(0, 8);
}

/** True if `code` matches the current or an adjacent rotation step. */
export async function verifyRotatingCode(
  secret: string,
  stepSeconds: number,
  code: string,
  nowMs: number
): Promise<boolean> {
  const sec = Math.floor(nowMs / 1000);
  const step = Math.max(1, stepSeconds);
  for (const offset of [0, -1, 1]) {
    const candidate = await rotatingCodeAt(secret, step, sec + offset * step);
    if (safeEqual(candidate, code.toLowerCase())) return true;
  }
  return false;
}

/** The QR encodes `eventId.code`. Parse it back. */
export function parseEventQr(raw: string): { eventId: string; code: string } | null {
  const trimmed = raw.trim();
  const dot = trimmed.indexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) return null;
  return { eventId: trimmed.slice(0, dot), code: trimmed.slice(dot + 1) };
}

// ------------------------------- Misc crypto -------------------------------

/** SHA-256 hex of a string (used to store redemption-code hashes, never raw). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return toHex(digest);
}

/** A short, human-shareable one-time code (no ambiguous chars). */
export function randomCode(len = 8): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}
