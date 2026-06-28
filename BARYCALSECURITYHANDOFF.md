# Mayfly / Rooms — Security Hardening Handoff (for barycal)

**Origin:** A cybersecurity review of `edjshen/plur-nyc` (2026-06-26). The Mayfly
ephemeral-chat (`/rooms`) feature was migrated out of plur-nyc to **barycal** mid-review
(plur-nyc PR #182), so the Mayfly-specific findings were _not_ applied in plur-nyc — they
belong here. The non-Mayfly fixes already shipped in plur-nyc PR #183.

**Your job:** port the seven findings below into barycal, adapting to barycal's
architecture (D1 + its own relay Worker), then verify and open a PR. Do **not** assume
barycal's file layout matches plur-nyc — **Step 0 is to map it.**

---

## Step 0 — Map barycal first (do this before touching code)

Find and read these, and note the equivalents:

1. **The relay** — the Worker + Durable Object (or D1/WebSocket layer) that accepts room
   WebSocket connections. In plur-nyc it was `workers/room/src/worker.js` (router +
   Origin/token check) and `room-do.js` (the per-room DO with the append-only log). Find
   barycal's equivalent: where does a client WS upgrade land, and where are messages
   persisted/fanned out?
2. **The room access gate** — the route(s) a client calls before connecting (phone
   verify / consent / event join). plur-nyc: `app/api/rooms/{create,join,verify/start}`.
3. **The client connection layer** — where the browser opens the WS to the relay.
   plur-nyc: `app/rooms/_client/net/connection.js` (URL build) and `sync.js`.
4. **The data store** — barycal is **D1**, not Supabase. This matters for H-1 (below).
5. **Rate limiting** — how barycal throttles the verify/SMS path.

Confirm whether the relay is a Cloudflare **Durable Object with WebSocket Hibernation**
(plur-nyc was). If the transport differs, the _concepts_ below still apply but the API
calls (`serializeAttachment`, `ctx.storage.sql`) will differ.

---

## The findings (priority order)

### H-2 — Relay accepts any connection with a spoofable Origin (CRITICAL) ⭐ most important

**Problem:** In plur-nyc the relay's only access control was an `Origin` allowlist. `Origin`
is trivially set by any non-browser client, and the gate routes (`/api/rooms/*`) minted no
capability — they just logged consent and returned `{ok:true}`. So **anyone who learned a
room id could connect directly to the relay**, read the entire encrypted backlog, observe
traffic, and inject signed frames. The phone gate was advisory, not enforced.

**Fix:** an HMAC **admission token**. The gate route mints it after the phone/consent check;
the relay verifies it on the WS upgrade before accepting the socket. Keyed by a shared
secret `ROOM_RELAY_SECRET` set on **both** the app and the relay Worker.

- Token format: `<expMs>.<base64url(HMAC-SHA256(secret, "<roomId>.<expMs>"))>`.
- Bound to `roomId` (a token for room A can't admit to room B) and time-limited.
- TTL = 7 days (covers a room's whole life → no mid-session refresh needed).
- **Rollout safety:** when the secret is unset the relay logs a warning and _allows_
  connections (gate inactive); enforcement turns on the moment the secret is set on both
  sides. Ends fail-closed-when-configured.

**Reusable module (drop in verbatim — Web Crypto only, runs in any Worker):** see
Appendix A `room-token.js`.

Wiring:

1. **Gate route** mints after the gate passes and returns it:
   `const relayToken = await mintRoomToken(env.ROOM_RELAY_SECRET, roomId); return {ok:true, relayToken};`
   (plur-nyc wrapped this in `relay-admission.js`, Appendix B, which returns `null` +
   warns when the secret is unset.)
2. **Client** stores the token with the room and appends it to the WS URL:
   `wss://<relay>/room/<id>?t=<token>`. plur-nyc threaded it store → sync → connection:
   `const q = relayToken ? '?t=' + encodeURIComponent(relayToken) : ''`.
3. **Relay** verifies before accepting — see Appendix C (`worker.js` diff). The key hunk:
   ```js
   const secret = env.ROOM_RELAY_SECRET;
   if (secret) {
     const token = url.searchParams.get('t');
     if (!(await verifyRoomToken(secret, roomId, token))) {
       return new Response('forbidden', { status: 403 });
     }
   } else if (!warnedNoSecret) {
     console.warn('[relay] ROOM_RELAY_SECRET unset — gate inactive');
     warnedNoSecret = true;
   }
   ```

**barycal adaptation:** if event rooms are open-join (no phone), the gate route still mints a
token for them — the token just attests "went through our API," which for sealed rooms also
means "phone-verified." Generous TTL means reconnects within the room's life don't need a
refresh; for >7-day rooms, re-call the join route to re-mint.

**Provisioning:** generate `openssl rand -hex 32`, set the SAME value on both the app worker
and the relay worker (`wrangler secret put ROOM_RELAY_SECRET`).

---

### M-1 — Relay has no message size / rate / row caps (DoS)

**Problem:** the relay never sees plaintext, so the client's 4000-char limit doesn't bind it.
A single hostile socket could flood multi-MB ciphertext frames (each persisted up to the
room's life and fanned out to every peer = amplification), spam unlimited messages, or grow
the per-room log unboundedly.

**Fix (in the DO / message handler):** see Appendix C (`room-do.js` diff).

- **Frame size:** drop frames where `raw.length > 16 KB` _before_ parse/persist/fan-out.
- **Per-socket publish rate limit:** token bucket (cap 30, refill 5/s) keyed by the live
  socket. In-memory `Map` is fine (resets on DO eviction, acceptable for a flood guard).
  Check it _after_ the idempotent-retransmit short-circuit so legit retransmits are free.
- **Per-room log ceiling:** reject new publishes once the log hits 20 000 rows. plur-nyc used
  the monotonic `AUTOINCREMENT` seq as a row-count proxy (no extra COUNT).
- Clean up the bucket entry in `webSocketClose`/`webSocketError`.

**barycal adaptation:** tune the numbers to barycal's expected room sizes. If the relay isn't
a hibernating DO, keep per-connection state wherever connection objects live.

---

### M-7 — One socket can impersonate many identities (roster sybil)

**Problem:** the relay persisted whatever `profilePub` each `publish` frame carried. Message
_content_ spoofing is already blocked (peers verify Ed25519 sigs client-side), but one socket
could publish `presence` frames under many different pubkeys to flood/forge the roster.

**Fix:** bind each socket to the `profilePub` it announces in its `hello`, and reject any
later `publish` from that socket under a different pubkey. plur-nyc used the DO's
`ws.serializeAttachment({pub})` (survives hibernation) / `ws.deserializeAttachment()`. See
Appendix C.

**Note:** handles remain unauthenticated (only the pubkey is signed) — two _different_
pubkeys can still both claim handle "alice". Consider showing a short pubkey fingerprint
next to handles in the UI. plur-nyc left this as a display-only follow-up.

---

### H-3 — Open/event rooms claim privacy they don't have (copy)

**Problem:** open rooms and per-event rooms derive their key from **public data** (the three
words / the event slug), so anyone who guesses the slug derives the key and decrypts all
traffic. The UI's blanket "end-to-end encrypted, the key never leaves your link" line was
false for those room types.

**Fix:** scope the E2E claim to **sealed** rooms; label open/event rooms public. plur-nyc:

- Home footer reworded: sealed = E2E (key only in the link); open + per-event = public.
- In-room banner for `mode==='open' || event`: _"public room — anyone with the
  {event link / three words} can read along. not private."_
- Don't reuse the E2E assurance string on open/event flows.

**barycal adaptation:** wherever barycal shows the privacy messaging, differentiate by room
type. Pure copy/UX change.

---

### Phone hashing — minimize PII in the participation log

**Problem:** the participation log stored raw E.164 phone numbers joined to room id / handle /
pubkey — a deanonymizing map, even though chat is E2E and ephemeral.

**Fix:** store an **HMAC hash** of the phone in the participation log (creator/participant
rows); keep the **raw** number only in the append-only **consent** record (TCPA/CTIA needs a
real auditable number). Nothing reads the log phone back as dialable (the conflict keys are
room/pubkey, not phone), and the same phone still maps to the same hash if correlation is
ever needed. Pepper = `MAYFLY_PHONE_PEPPER`, or `SESSION_SECRET` via HKDF domain separation
when unset (no new required env; never the literal session key). If no secret is available,
store `null` — never silently persist plaintext. Module: Appendix D `phone-hash.js`.

**barycal adaptation:** apply when writing participant/creator rows to D1. Keep the consent
table raw.

---

### M-3 — SMS rate limiter TOCTOU (only if barycal reuses the pattern)

**Problem:** plur-nyc's limiter did a read-only "check all keys" pass and _then_ a "record"
pass. The two are non-atomic, so a concurrent burst could all pass the check before any hit
landed and exceed the SMS cap (real Twilio cost-amplification).

**Fix:** drop the read-only pre-check; rely solely on a record-then-recount call (INSERT then
count, authoritative). plur-nyc applied this to the verify/start SMS path.

**barycal adaptation:** only relevant if barycal's verify route uses the same check-then-record
shape. If it uses an atomic counter (e.g. a D1 `INSERT ... RETURNING` + count, or a DO
counter), it may already be safe — confirm.

---

### H-1 — RLS on the PII tables (likely N/A on D1 — confirm)

**Problem in plur-nyc:** Supabase's publishable/anon key could read tables that lacked RLS.
The Mayfly tables stored phone numbers without RLS.

**On barycal:** **D1 has no public anon key** — it's reachable only through Worker bindings,
not a public auto-generated API. So this specific finding is **probably moot** on barycal.
**Action:** confirm barycal exposes D1 only via server-side Worker code (no public REST
surface), then close this as N/A. The phone-hashing fix above is the portable PII reduction.

---

## Verification & rollout

1. **Unit test the token module** (Appendix E is a ready node:test suite): round-trip,
   wrong-room rejected, expired rejected, tampered sig/exp rejected, wrong/empty secret
   rejected, malformed inputs don't throw. Adapt to barycal's test runner (vitest, etc.).
2. **Manual smoke** (the one thing plur-nyc couldn't fully exercise headlessly): create a
   room → confirm the relay accepts the connection with a valid `?t=` and **rejects** a
   connection with a missing/garbage token (once the secret is set on both sides). Confirm a
   second socket can't publish under another pubkey, and an oversized frame is dropped.
3. **Rollout order to avoid an outage:** deploy the relay (verify code) and the app (mint
   code) first while the secret is still UNSET (gate inactive, behavior unchanged), then set
   `ROOM_RELAY_SECRET` to the same value on both — that flips enforcement on atomically from
   the clients' perspective.
4. Open a PR; don't merge over a red CI.

---

## Appendix A — `room-token.js` (verbatim, Web Crypto, reusable)

```js
const enc = new TextEncoder();
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function hmacBytes(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return new Uint8Array(sig);
}
export const ROOM_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export async function mintRoomToken(secret, roomId, ttlMs = ROOM_TOKEN_TTL_MS, nowMs = Date.now()) {
  if (!secret) throw new Error('[room-token] secret required');
  const exp = nowMs + ttlMs;
  const sig = await hmacBytes(secret, `${roomId}.${exp}`);
  return `${exp}.${b64url(sig)}`;
}
function timingSafeStrEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function verifyRoomToken(secret, roomId, token, nowMs = Date.now()) {
  if (!secret || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp <= nowMs) return false;
  const expected = b64url(await hmacBytes(secret, `${roomId}.${exp}`));
  return timingSafeStrEqual(expected, sig);
}
```

## Appendix B — server minter (returns null + warns when secret unset)

```js
import { mintRoomToken } from './shared/room-token.js';
let warnedAboutSecret = false;
export async function mintRelayToken(roomId) {
  const secret = process.env.ROOM_RELAY_SECRET; // or env.ROOM_RELAY_SECRET in a Worker
  if (!secret) {
    if (!warnedAboutSecret) {
      console.warn('[rooms] ROOM_RELAY_SECRET unset — gate inactive');
      warnedAboutSecret = true;
    }
    return null;
  }
  return mintRoomToken(secret, roomId);
}
```

## Appendix C — relay diffs (worker verify + DO caps/binding)

> Apply the concepts to barycal's relay. Full diffs from plur-nyc:

**worker.js (verify on upgrade):**

```js
import { verifyRoomToken } from '../../../lib/mayfly/shared/room-token.js';
let warnedNoSecret = false;
// ... inside the /room/:id upgrade branch, AFTER the Origin check:
const roomId = match[1];
const secret = env.ROOM_RELAY_SECRET;
if (secret) {
  const token = url.searchParams.get('t');
  if (!(await verifyRoomToken(secret, roomId, token)))
    return new Response('forbidden', { status: 403 });
} else if (!warnedNoSecret) {
  console.warn('[room-relay] ROOM_RELAY_SECRET unset — gate inactive');
  warnedNoSecret = true;
}
```

**room-do.js (caps + identity binding):**

```js
const MAX_FRAME_BYTES = 16 * 1024;
const MAX_LOG_ROWS = 20000;
const PUBLISH_BUCKET_CAP = 30;
const PUBLISH_REFILL_PER_SEC = 5;
// constructor: this.buckets = new Map();

takePublishToken(ws) {
  const now = Date.now();
  let b = this.buckets.get(ws);
  if (!b) { b = { tokens: PUBLISH_BUCKET_CAP, last: now }; this.buckets.set(ws, b); }
  const elapsedSec = (now - b.last) / 1000;
  b.tokens = Math.min(PUBLISH_BUCKET_CAP, b.tokens + elapsedSec * PUBLISH_REFILL_PER_SEC);
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1; return true;
}

// webSocketMessage, top:
if (raw.length > MAX_FRAME_BYTES) return;             // size cap

// in the 'hello' branch:
if (frame.profilePub) { try { ws.serializeAttachment({ pub: frame.profilePub }); } catch {} }

// in the 'publish' branch, BEFORE inserting:
let bound = null; try { bound = ws.deserializeAttachment(); } catch {}
if (bound && bound.pub && frame.profilePub !== bound.pub) return;   // M-7 identity bind
// (idempotent-retransmit short-circuit stays here, returns early/free)
if (!this.takePublishToken(ws)) return;               // M-1 rate
if (this.latestSeq() >= MAX_LOG_ROWS) return;         // M-1 row ceiling

// webSocketClose / webSocketError: this.buckets.delete(ws);
```

## Appendix D — `phone-hash.js` (verbatim)

```js
const enc = new TextEncoder();
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function pepperKey() {
  const secret = process.env.MAYFLY_PHONE_PEPPER || process.env.SESSION_SECRET;
  if (!secret) return null;
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: enc.encode('mayfly-phone-hash/v1'),
    },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );
}
export async function hashPhoneForLog(phone) {
  if (!phone) return null;
  const key = await pepperKey();
  if (!key) return null;
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(phone)));
  return `h:${b64url(new Uint8Array(sig))}`;
}
```

## Appendix E — token tests (adapt to barycal's runner)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintRoomToken, verifyRoomToken } from './room-token.js';
const SECRET = 'test-relay-secret-aaaaaaaaaaaaaaaaaaaaaaaa';
const ROOM = 'AbCdEf0123456789AbCdEf01';

test('round-trips for the same room', async () => {
  assert.equal(await verifyRoomToken(SECRET, ROOM, await mintRoomToken(SECRET, ROOM)), true);
});
test('does not admit to another room', async () => {
  assert.equal(
    await verifyRoomToken(SECRET, 'OtherRoom0123456789xyz', await mintRoomToken(SECRET, ROOM)),
    false
  );
});
test('expired token rejected', async () => {
  assert.equal(
    await verifyRoomToken(SECRET, ROOM, await mintRoomToken(SECRET, ROOM, -1000)),
    false
  );
});
test('rejected after its expiry instant', async () => {
  const now = 1_000_000_000_000;
  const t = await mintRoomToken(SECRET, ROOM, 1000, now);
  assert.equal(await verifyRoomToken(SECRET, ROOM, t, now + 500), true);
  assert.equal(await verifyRoomToken(SECRET, ROOM, t, now + 2000), false);
});
test('wrong secret rejected', async () => {
  assert.equal(
    await verifyRoomToken('different-secret', ROOM, await mintRoomToken(SECRET, ROOM)),
    false
  );
});
test('tampered signature rejected', async () => {
  const [exp, sig] = (await mintRoomToken(SECRET, ROOM)).split('.');
  const flipped = sig[0] === 'A' ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
  assert.equal(await verifyRoomToken(SECRET, ROOM, `${exp}.${flipped}`), false);
});
test('tampered expiry rejected (exp is signed)', async () => {
  const [, sig] = (await mintRoomToken(SECRET, ROOM, 1000)).split('.');
  assert.equal(await verifyRoomToken(SECRET, ROOM, `${Date.now() + 600000}.${sig}`), false);
});
test('malformed tokens rejected, not thrown', async () => {
  for (const bad of [null, undefined, '', 'nodot', '.', 'abc.', '.abc', 123])
    assert.equal(await verifyRoomToken(SECRET, ROOM, bad), false);
});
test('empty secret never verifies', async () => {
  assert.equal(await verifyRoomToken('', ROOM, await mintRoomToken(SECRET, ROOM)), false);
});
```

---

## Checklist for the barycal agent

- [ ] Step 0: map relay / gate routes / client connection / D1 store / rate limiter
- [ ] H-2: add `room-token.js`; mint in the gate route; verify in the relay; thread `?t=` through the client; provision `ROOM_RELAY_SECRET` on both workers
- [ ] M-1: frame-size + per-socket rate + per-room row caps in the relay
- [ ] M-7: bind socket→pubkey; reject mismatched publishes
- [ ] H-3: scope E2E copy to sealed rooms; label open/event rooms public
- [ ] Phone hashing: hash log phones; keep consent raw
- [ ] M-3: confirm/await-fix the SMS limiter is atomic
- [ ] H-1: confirm D1 has no public surface → close as N/A
- [ ] Tests (Appendix E) + manual smoke (valid token accepted, bad/missing rejected, sybil rejected, oversized dropped)
- [ ] PR; green CI; rollout order (deploy with secret unset → set secret on both)
