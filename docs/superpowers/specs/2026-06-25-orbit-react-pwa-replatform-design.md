# Orbit → React PWA Re-platform — Design Spec

**Date:** 2026-06-25
**Status:** Approved for planning
**Phase:** 1 of 2 (this spec). Phase 2 (Mayfly port) gets its own spec.

---

## 1. Context & motivation

**Orbit** (repo `social-cal`) is a multi-user social-calendar PWA — "your social calendar is your profile; community through repeated exposure." Today it ships as a deliberately minimal **vanilla-JS SPA + Node/Express + a JSON-file store** (4 deps, custom JWT auth). It works, but it can't host what comes next.

The driving goal is to bring the **Mayfly** feature (a production-grade ephemeral E2E-encrypted group chat, currently living in the `plur-nyc` repo) into Orbit. Mayfly is built on **Next.js + React** with a **Cloudflare Durable Object** realtime relay. Rather than down-port Mayfly's React system into Orbit's vanilla stack, we **bring Orbit up to Mayfly's stack** so the Phase-2 port is near-verbatim.

This is therefore a **two-phase** effort:

- **Phase 1 (this spec):** Re-platform Orbit as a beautiful **Next.js React PWA** at feature parity with today's app, faithful to the existing mocks plus motion polish.
- **Phase 2 (separate spec):** Port Mayfly in, reusing the already-live Durable Object relay + crypto core + React components.

## 2. Goals & non-goals

### Optimization principle (drives every implementation fork)

**Minimize ongoing overhead — both technical maintenance and cost — while delivering genuine quality and visual beauty, and keeping the Phase-2 Mayfly port clean.** Concretely: fewest vendors/dashboards/bills, generous free tiers, fewest moving parts and finicky build layers, only actively-maintained dependencies — but never at the expense of a polished product. Orbit's owner is a solo developer maintaining many projects; low cognitive/maintenance load is weighted heavily.

### Goals

- Full **feature parity** with the current app's MVP surfaces (see §6).
- **Visual fidelity** to `docs/mocks/` (dark-editorial identity) + motion polish that a React PWA unlocks.
- A stack that makes the **Phase-2 Mayfly port** a near drop-in.
- **Installable PWA** with an offline app-shell.
- Deployed on the owner's existing **Cloudflare** infrastructure pattern (mirrors `plur-nyc`).

### Non-goals (Phase 1)

- Mayfly itself (Phase 2).
- Google Calendar integration (PRD future; auth leaves a door open later).
- Row-Level Security (PRD frames it as designed-but-deferred; visibility is enforced server-side — see §5).
- Real-user data migration: the current store holds only demo/seed data, so we **re-seed**, we do not migrate rows (notably, password hashes are re-generated — see §4.3).

## 3. Finalized stack (locked)

Every choice below was validated against the optimization principle via a research review (2026 landscape, primary sources).

| Concern            | Decision                                                                                                                                     | One-line rationale                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | **Next.js 16 (App Router) + React 19**                                                                                                       | React so Mayfly drops in; App Router is the current idiom.                                                                                                                                                                                    |
| Language           | **TypeScript**                                                                                                                               | Drizzle's end-to-end type-safety (a key reason we picked it) and the typed component libs are the whole point; Next compiles TS natively (no extra config). Diverges from `plur-nyc`'s plain JS, but Mayfly's `.js` shared core imports fine. |
| Hosting            | **Cloudflare Workers via OpenNext** (`@opennextjs/cloudflare`)                                                                               | Single vendor; co-located with D1 + the Mayfly relay; mirrors `plur-nyc`.                                                                                                                                                                     |
| Database           | **Cloudflare D1** (serverless SQLite)                                                                                                        | Native Workers binding, no separate service, never auto-pauses, free tier ≫ our scale.                                                                                                                                                        |
| Data access        | **Drizzle ORM** (stable 0.4x line)                                                                                                           | First-class D1 driver, end-to-end TypeScript types, tiny/workerd-native.                                                                                                                                                                      |
| Auth               | **iron-session 8** + **`@noble/hashes`** (scrypt)                                                                                            | Stable, Web-Crypto-native on Workers (what `plur-nyc` runs); credentials-only needs ~30 lines.                                                                                                                                                |
| Styling            | **CSS Modules + CSS-variable tokens**                                                                                                        | Zero added build config, preserves the bespoke identity, matches Mayfly's `rooms.module.css`.                                                                                                                                                 |
| Motion             | **Native View Transitions API + CSS**; **`motion`** lazy-loaded only for the avatar-cluster spring                                           | Most of the motion brief is 0 KB JS; spend bundle only where spring physics add real beauty.                                                                                                                                                  |
| Data/UX            | **RSC + Server Actions + `useOptimistic`** (no SWR by default)                                                                               | No client cache to keep in sync; smooth optimistic RSVP. SWR opt-in only for a future live-polling widget.                                                                                                                                    |
| PWA                | **Serwist** (`@serwist/next` v9)                                                                                                             | Maintained successor to the abandoned `next-pwa`; build-time precache, offline shell.                                                                                                                                                         |
| Components         | **Hand-rolled visual surface**; headless lib (**Base UI**, or **Radix** as lower-risk-today fallback) only for dialog-sheet / popover / tabs | Headless a11y where hand-rolling is error-prone; full control of the bespoke look everywhere else.                                                                                                                                            |
| Realtime (Phase 2) | **Reuse the live Durable Object relay**                                                                                                      | Already deployed, origin-allowlisted, stack-agnostic; DOs free + hibernating.                                                                                                                                                                 |

**Cost:** ~**$0/mo** at this scale (Cloudflare free tier + all-OSS deps); ~$5/mo only if we outgrow Workers Free (e.g. bundle > 3 MiB gz or higher request limits). **Vendors to maintain: one (Cloudflare).**

## 4. Architecture

### 4.1 App structure

- **App Router** with route groups:
  - `(auth)` — login / register (unauthenticated).
  - `(app)` — the authenticated shell: bottom tab bar + the Discover/Week/Month/Plans/Regulars/You/Circles surfaces.
  - `u/[handle]` and `e/[id]` — **account-free public pages**, server-rendered for real SSR + OG meta on shareable links.
- **Reads:** Server Components call the data layer (Drizzle over D1) directly — no API round-trip. Client Components handle interaction (tab switches, segmented controls, sheets).
- **Mutations:** **Server Actions** (create event, RSVP, connection request/accept, tier/placement change, profile edit). RSVP uses `useOptimistic` for instant feedback.
  - **Caveat:** `useOptimistic` only auto-rolls-back if the Server Action **throws**. Mutation actions must throw on failure, not return an error object, or the optimistic state sticks.
- **Cache invalidation:** `revalidateTag` for data shown under multiple URLs (an event appears on its own page and in profiles/feeds); `revalidatePath` otherwise.
- **Auth route(s):** login/register/logout as route handlers (or actions) that set/clear the iron-session cookie.

### 4.2 Hosting / deploy (mirror `plur-nyc`)

- Build via `opennextjs-cloudflare build`, deploy via `opennextjs-cloudflare deploy`.
- Own `wrangler.jsonc` + `open-next.config.ts`; Worker name `orbit`; same Cloudflare account as `plur-nyc`; `nodejs_compat` + `global_fetch_strictly_public` compat flags as needed.
- **D1 binding** in `wrangler.jsonc` (e.g. `DB`).
- **Caveat:** gate Next.js minor upgrades on OpenNext adapter support (a known failure mode — e.g. Next 16.2.0 needed an adapter patch). A first-class Cloudflare adapter on Next 16.2's stable Adapters API is expected ~end of 2026 and should reduce this.

### 4.3 Auth (iron-session)

- Encrypted-cookie sessions via **iron-session 8** (Web-Crypto, runs natively on Workers). Session secret in an env var/secret.
- Session shape: `{ userId, handle }`. A server helper `getSession()` reads it in Server Components / actions; middleware guards `(app)` routes and redirects unauthenticated users to `(auth)`.
- **Password hashing:** **`@noble/hashes` scrypt** (WASM/Web-Crypto) — **not** native `bcrypt`, which won't run on Workers. Seed users are hashed fresh; existing JSON `bcryptjs` hashes are **not** carried over (re-seed).
- Credentials-only for now. If Google sign-in is needed later (PRD's Calendar feature), revisit Auth.js v5 / Better Auth then — iron-session doesn't preclude it.

### 4.4 Data layer (D1 + Drizzle)

- Drizzle schema in `lib/db/schema.ts`; client in `lib/db/index.ts` bound to the D1 `DB` binding.
- Migrations via `drizzle-kit` (SQL files in `drizzle/`), applied with `wrangler d1 migrations apply` (local + remote).
- **Visibility is enforced server-side** in the data layer (porting today's `canSeeContent` / `canSeeBusy` / tier logic verbatim). RLS deferred.
- **Co-presence / Regulars stays computed**, not stored.

## 5. Data model

SQLite (D1) via Drizzle. UUID text PKs; ISO-8601 text timestamps (matching today). `scenes` stored as JSON-encoded text (SQLite has no array type). Enum-like columns use text with a checked set.

```
users        (id, handle UNIQUE, display_name, password_hash, bio,
              scenes TEXT/json, avatar, share_id UNIQUE, ghost INTEGER/bool, created_at)
connections  (id, a_id → users, b_id → users, status['pending'|'accepted'],
              requested_by → users, created_at)
placements   (id, owner_id → users, other_id → users, tier['inner'|'orbit'])
              -- what owner sees of other
events       (id, creator_id → users, type['intention'|'plan'|'event'|'scene'],
              title, description, location, start_time, end_time,
              recurring['weekly'|null], visibility['inner'|'orbit'|'public'],
              expires_at, created_at)
attendance   (id, event_id → events, user_id → users,
              rsvp['going'|'down'|'maybe'|'cant'], created_at)
```

Indices: `users.handle`, `users.share_id`, `events.start_time`, `events.creator_id`, `attendance.event_id`, `connections.(a_id,b_id)`, `placements.(owner_id,other_id)`.

**Domain logic to port (as pure, unit-tested functions):** connection lookup, tier resolution, `canSeeContent` / `canSeeBusy` visibility, event `enrich` (redaction + social proof + my-RSVP), `computeRegulars` (co-presence tally → regulars ≥3× / rising 2×).

## 6. Feature inventory (parity targets)

Each is a screen/surface to rebuild to mock fidelity:

1. **Auth** — login / register (email/handle + password).
2. **Discover** (home) — this week's events + intentions from your people, with social proof; segmented control → Week / Month.
3. **Week** — 7-day time-grid (8 AM–12 AM), color-coded by type, open-evening counter.
4. **Month** — dot-typed calendar grid, "hot day" indicator (≥3 going), tap day → agenda.
5. **Plans** — your created + joined events (hosting / you're-in), ~60-day window.
6. **Regulars** (private) — co-presence tally (≥3× = Regular), Rising (2×), "make it a standing plan" nudge.
7. **You / Profile** — future-tense identity (upcoming by visibility tier), bio, Scenes, stats, share link.
8. **Circles** — Inner / Orbit tiers (segmented), pending requests (accept/ignore), add people.
9. **Create** sheet — type (intention/plan/event), visibility (inner/orbit/public), soft-RSVP gradient.
10. **Account-free pages** — `/u/:handle` (public upcoming + bio), `/e/:id` (event card + attendees), SSR + OG meta.

## 7. Design system

- **Tokens:** CSS custom properties carried over from today (`--bg`, `--bg2`, `--card`, `--ink`, `--dim`, `--faint`, `--accent`, `--accent2`, `--free`, `--violet`, `--amber`, …) in a single `:root` sheet.
- **Type:** serif display face for headlines over a clean sans body.
- **Color semantics:** green = free/intention, violet = plan, coral = event, amber = scene — consistent across cards, calendar blocks, month dots.
- **Signature components:** event card (type pill + proof + RSVP), **avatar cluster** (overlapping, animated), Week time-grid, Month dot-grid, bottom tab bar (Discover · Plans · Create · Regulars · You), bottom-sheet/modal.
- **Motion strategy:** View Transitions for route/tab changes + calendar reveals (0 KB JS, graceful degradation); CSS transitions for hovers/press/RSVP feedback; `motion` (lazy, via `LazyMotion`/`m`) **only** for the avatar-cluster spring.

## 8. PWA

- **Serwist** (`@serwist/next` v9): wrap `next.config`, ~15-line `app/sw.ts`, build-time precache manifest (no manual cache-busting).
- Web app **manifest** + maskable icon (carry over `public/icon.svg`), installable, offline app-shell.
- **Cloudflare caveat:** `/public` (incl. `sw.js`) is served by Workers Static Assets and bypasses the worker, so `next.config` `headers` won't apply to `sw.js`. If we need to control its cache headers, add `sw.js` to `run_worker_first` in the OpenNext config. Registration/scope still work as-is.

## 9. Component strategy

Hand-roll the entire bespoke visual surface (cards, grids, buttons, RSVP control, nav, profile). Pull a **maintained headless lib for only the hard-a11y interactive primitives** — dialog/sheet, popover, tabs — to get focus-trap, ARIA, keyboard nav, scroll-lock correct. **Base UI** (`@base-ui-components/react`, MUI team) is the forward pick (note: `1.0.0-rc.0` — release-candidate, stable API); **Radix** (`radix-ui`) is the lower-risk-today fallback for the same primitives. Do **not** adopt shadcn/ui wholesale (its defaults are deliberately generic; at most use as a one-off scaffold reference).

## 10. Project structure

```
app/
  (auth)/login, (auth)/register
  (app)/                # tab shell + screens (discover, plans, regulars, you, circles)
  u/[handle]/           # account-free profile (RSC)
  e/[id]/               # account-free event (RSC)
  api/                  # auth route handlers (+ Mayfly's /api/rooms/* in Phase 2)
  sw.ts                 # Serwist service worker
  layout.tsx, globals.css (tokens)
components/             # EventCard, AvatarCluster, WeekGrid, MonthGrid, CreateSheet, TabBar, …
lib/
  db/ (schema.ts, index.ts)     # Drizzle + D1
  auth/ (session.ts, password.ts)
  domain/ (visibility.ts, enrich.ts, regulars.ts, types.ts)  # pure, unit-tested
  actions/             # Server Actions (events, rsvp, connections, profile)
drizzle/               # migrations
public/                # manifest, icons
docs/                  # PRD + mocks (kept)
wrangler.jsonc · open-next.config.ts · next.config.ts · drizzle.config.ts
```

## 11. Testing

- **Domain logic** (visibility tiers, enrich/redaction, co-presence) as pure functions with **unit tests** (node:test, matching `plur-nyc`'s `test:hygiene` convention). These encode the security-relevant visibility rules — highest test priority.
- **Smoke tests** for auth + a couple of Server Actions.
- **Manual E2E pass** of the changed user flows before any prod deploy (per the owner's deploy rules: tests green → local/preview verify → owner confirms → deploy).

## 12. Implementation sequencing (high-level)

Detailed task breakdown comes from the implementation plan; the natural order:

1. Scaffold Next.js 16 + TS + OpenNext/wrangler + D1 binding; "hello world" deploy path.
2. Drizzle schema + migrations + seed (port `seed.js` data; scrypt hashes).
3. Domain logic ported + unit-tested.
4. Auth (iron-session, password hash/verify, middleware, login/register).
5. Design-system tokens + base components (card, avatar cluster, tab bar, sheet).
6. Screens, in parity order: Discover → Week → Month → Plans → Regulars → You → Circles → Create.
7. Account-free public pages (`/u`, `/e`) + OG meta.
8. PWA (Serwist, manifest, offline shell).
9. Motion polish pass (View Transitions, cluster spring, optimistic RSVP).
10. Verify + deploy (per deploy rules).

## 13. Phase 2 preview & open items

- **Mayfly port (Phase 2, separate spec):** copy `lib/mayfly/shared/` crypto/protocol core verbatim; bring over React components + IndexedDB client store; re-home the 3 API routes + middleware gate; point the client at the live relay and **add Orbit's origin to the relay's `ALLOWED_ORIGINS`**; log rooms/participants/consent to D1 (new tables) instead of plur-nyc's Supabase. Decide integration shape (standalone `/rooms` vs ephemeral threads attached to events — PRD F10).
- **"Move" semantics:** whether `plur-nyc`'s `/rooms` is removed after the port is a Phase-2 decision; **do not touch `plur-nyc` without explicit confirmation**.
- **Deferred:** RLS hardening; Google Calendar sign-in.

## 14. Risks / watch-items

- **OpenNext ↔ Next upgrades** — pin/verify adapter support before bumping Next (§4.2).
- **Workers runtime constraints** — no native `bcrypt` (use scrypt); keep the Worker bundle < 3 MiB gz to stay on Free.
- **`useOptimistic` rollback** — actions must throw on failure (§4.1).
- **Base UI RC** — release-candidate; Radix is the fallback if RC churn bites (§9).
