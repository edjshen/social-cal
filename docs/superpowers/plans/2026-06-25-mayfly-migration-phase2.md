# Mayfly Migration (Phase 2) — Plan

**Goal:** Migrate Mayfly (ephemeral E2E group chat) from `plur-nyc` into `social-cal`/Orbit as the **partygoer side of Poiesis**, **internally segregated**, storing room/participant/consent data in **Orbit's D1** (replacing Supabase).

**Source:** `/Users/edshen/Documents/GitHub/plur-nyc` — `lib/mayfly/`, `app/rooms/`, `app/api/rooms/`, `workers/room/`, `public/mayfly/ggwave.js`, `supabase/migrations/019,020`.

## Segregation boundary

All Mayfly code lives in its own namespaces, sharing only the D1 binding (own tables) and the Next app shell:

```
lib/mayfly/shared/      # crypto/protocol core (copied verbatim, .js)
lib/mayfly/db/          # mayfly Drizzle schema + own client (drizzle(env.DB, {schema: mayflySchema}))
lib/mayfly/server/      # rooms-log, consent, phone-gate, twilio-verify, rate-limit (D1/TS)
app/rooms/              # routes + _components + _client (copied; top-level, NOT under (app) — account-less, no Orbit auth)
app/api/rooms/          # create/join/verify route handlers (D1-backed)
workers/room/           # relay Durable Object (copied; deployed separately)
public/mayfly/ggwave.js # vendored asset
drizzle/                # migration adding mayfly_* tables
```

Mayfly does NOT import Orbit's `lib/domain` or `lib/db`. Orbit does not import Mayfly. Only shared substrate: the D1 binding via `getCloudflareContext().env.DB`, with a separate schema.

## Decisions (made autonomously per goal)

- **Shape:** faithful standalone `/rooms` (account-less, phone-gated rooms) — matches Mayfly + "completely segregated."
- **Storage:** Orbit D1, own tables `mayfly_rooms`, `mayfly_participants`, `mayfly_consents`, `mayfly_rate_limits`. Segregated Drizzle schema.
- **Realtime:** reuse the live Durable Object relay for testing (`NEXT_PUBLIC_ROOM_API_BASE=https://mayfly-room.junting-mp3.workers.dev`; `localhost:3000` already allowlisted). Copy `workers/room/` into the repo for self-containment; Orbit deploys its own relay later + sets `ALLOWED_ORIGINS`.
- **Phone gate:** port Twilio Verify; **dev bypass** when Twilio unset (`MAYFLY_ALLOW_UNVERIFIED=true`) so it functions locally. Rate-limit state in D1.
- **Language:** shared core stays `.js` (verbatim, preserves tested crypto; allowJs is on). New server code is TS.
- **Auth:** `/rooms` is account-less (Mayfly's own IndexedDB profiles); NOT behind Orbit's `(app)` session guard.

## D1 schema (lib/mayfly/db/schema.ts) — SQLite via Drizzle

```
mayfly_rooms        (room_id TEXT PK, three_words, mode['sealed'|'open'], source['user'|'event'],
                     event_slug, creator_phone, created_at, expires_at)   idx: event_slug, created_at
mayfly_participants (id TEXT PK, room_id, profile_pub, handle, phone, joined_at)  unique(room_id, profile_pub)
mayfly_consents     (id TEXT PK, phone, consent_version, context['create'|'join'], room_id, created_at)
mayfly_rate_limits  (id TEXT PK, scope, k, hits INTEGER, window_start INTEGER)  unique(scope, k)
```

## Batches

- **M-1 — shared core + relay**: copy `lib/mayfly/shared/` (+ tests, run via `node --test` script `test:mayfly`) and `workers/room/` verbatim. Verify shared tests pass.
- **M-2 — D1 schema + server storage**: `lib/mayfly/db/{schema,index}.ts` + migration; re-implement `rooms-log`, `consent` on D1; `server/rate-limit.ts` (D1 fixed-window); `server/twilio-verify.ts` (fetch-based, dev-bypass); `server/phone-gate.ts`.
- **M-3 — API routes**: `app/api/rooms/{create,join,verify/start}/route.ts` ported, D1-backed.
- **M-4 — client + components + routes**: copy `app/rooms/_client/`, `_components/`, `page/layout/enter`, `rooms.module.css`, `public/mayfly/ggwave.js`; fix shared-core import paths; ensure `NEXT_PUBLIC_ROOM_API_BASE` wiring.
- **M-5 — integration + verify**: `.env.local` (relay URL), optional `/rooms` launcher in Orbit shell, ensure build + `build:cf` pass, browser-verify `/rooms` loads and a room can be created/joined (live relay).

## Verify

- `npm run test:mayfly` (shared core) green; `npm test` (Orbit 17) still green.
- `npm run build` + `npm run build:cf` succeed.
- Browser: `/rooms` loads; create a room → connects to relay → can post a message (E2E ciphertext via relay). Phone gate uses dev bypass locally.

## Deploy hand-off (Ed)

- Apply mayfly migration to remote D1; deploy Orbit's relay (or keep using existing) and add Orbit's prod origin to the relay `ALLOWED_ORIGINS`; set `NEXT_PUBLIC_ROOM_API_BASE`, `MAYFLY_*`/`TWILIO_*` (or leave bypass for invite-only).
