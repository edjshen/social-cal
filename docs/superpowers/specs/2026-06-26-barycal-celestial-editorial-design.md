# barycal — "Celestial Editorial" Frontend Rebuild + Backend Rename — Design Spec

> **Status:** approved direction, pending spec review · **Date:** 2026-06-26 · **Supersedes:** the vanilla-JS `public/` SPA
> **Owner:** Ed · **Branch:** `claude/thirsty-ride-386429` (worktree)

---

## 0. Agent briefing (read this first — assume zero prior conversation)

**What we are building.** A full rebuild of the front end of **barycal** (the app formerly named "Orbit"; renamed 2026-06-26) — a mobile-first **social calendar**: *"your social calendar is your profile; community through repeated exposure."* The current front end is a dependency-free vanilla-JS SPA (`public/app.js` + `public/orbit.css`) talking to a Supabase edge function. We are replacing it with a modern, reactive, animation-rich React app whose visual + interaction quality must **exceed** the sibling app *poisys* (React 19 + Vite + Tailwind v4 + Framer Motion on Cloudflare). The design language is **"Celestial Editorial."**

**Why it's more than a frontend.** Auth is moving to **Supabase Auth (email + password)** to match poisys (both apps share the Supabase project `bpqtjfdiwifvrnkzldwg`). The existing edge function currently uses its *own* PBKDF2 + HMAC auth over its own users table — so it must be changed to verify Supabase JWTs and map to app users. Separately, the user has approved renaming the **live backend identifiers** `orbit → barycal` (function, schema, role, secrets, URL). These backend changes are **Phase 0** and are **gated** (test + Ed E2E verify before any prod deploy — see §9).

**Definition of done.**
1. A new React/Vite app replaces `public/`, building to `dist/`, deployed on Cloudflare Workers static assets via the existing `wrangler.jsonc` pattern.
2. Every current screen is rebuilt to the Celestial Editorial bar, plus a new public **landing page**.
3. Auth is Supabase email+password; the data API (the renamed `barycal` edge function) authenticates Supabase JWTs; all existing tier/visibility logic is preserved.
4. The `orbit → barycal` backend rename is complete and verified live.
5. All motion degrades gracefully (`prefers-reduced-motion`, no-WebGL, low-end devices); Vitest + Playwright green; perf budgets met.

**Hard constraints.**
- **Deploy = Cloudflare**, static assets, free-tier, single `wrangler deploy`. No CF Pages split.
- **Single maintainer** (Ed; React/Next background). Keep the dependency surface reasonable.
- **No prod deploy without the gate** (CLAUDE.md): run tests, run locally / preview, Ed E2E-verifies the changed flows, *then* deploy. Applies to the Phase 0 migration and the final frontend deploy.
- **Brand name is a single source of truth** (`src/brand.ts`) — a rename already happened once; the next must be a one-file change.

---

## 1. Product context

barycal is a personal social calendar built on **community through repeated exposure**. Full product thinking: [`docs/PRD.md`](../../PRD.md). Five hero screens + the core loop, all already implemented server-side and in the vanilla SPA:

| Surface | Purpose |
|---|---|
| **Discover** | This week — events + everyday openings from your people, with social proof |
| **Plans (Week / Month)** | Calendar views; type-coded; open evenings celebrated |
| **Regulars** | Private co-presence engine — the people you keep ending up around → "make it a standing plan" |
| **Profile** | Future-tense identity; visibility tiers; account-free share link |
| **Circles + tiers** | Inner (sees content) / **Circle** (sees free/busy) / Public; ghost mode |
| **Create** | Intentions, plans, standing (recurring), events |
| **Soft-RSVP** | Down / Maybe / Can't; account-free `/u/:handle`, `/e/:id` |

**Brand metaphor (drives the whole design):** celestial — orbits, satellites, **constellations**, gravity, **barycenter** (the point bodies orbit around; the name = *barycenter + calendar*). The social graph *is* a constellation; co-presence *is* orbital mechanics.

**Existing API surface (preserved; base = the renamed edge function origin):**
`POST /api/auth/{register,login}`* · `GET/PUT /api/me` · `GET /api/users` · `POST /api/connections[/:id/accept]` · `GET /api/circles` · `PUT /api/placements` · `POST /api/events` · `GET /api/events/:id` · `POST /api/events/:id/rsvp` · `GET /api/discover` · `GET /api/calendar?start=&end=` · `GET /api/profile/:handle` · `GET /api/regulars` · `GET /api/digest`
*\*auth endpoints are reworked in Phase 0 — see §6.*

---

## 2. Design language — "Celestial Editorial"

> Elevated and (for Phases 4-6) superseded by [Barycenter — Elevated Visual & Motion Direction](2026-06-26-barycal-barycenter-elevated-direction.md). Read that as the source of truth for the visual/motion design; the sections below are the original baseline.

Keep and **amplify** barycal's existing warm, intimate, editorial identity (sans display, warm dark, coral→pink gradient) — it is distinctive and good — and elevate it into something physical, alive, generative, spatial. Stays *intimate and editorial*, **not** cold sci-fi.

### 2.1 Tokens (centralize in `src/styles/tokens.css` `@theme` + `src/brand.ts`)
- **Surfaces:** ink `#0A0910` base; a warm radial **nebula** glow top; card glass = `rgba(255,255,255,.05)` over ink, hairline `rgba(255,255,255,.10)` borders.
- **Signal gradient (primary action):** `#FF8A5B → #FF5E87` (coral→pink).
- **Semantic accents:** mint `#5FD3A6` (free), violet `#9B8CFF` (your circle), amber `#FFC178` (scenes), deep-space indigo `#241C3A` (depth contrast).
- **Type:** sans display for big future-tense statements ("Friday's wide open."); clean sans for UI. Two weights only. (Current uses Georgia + system sans; the rebuild self-hosts a refined variable grotesque sans (e.g. Geist or Mona Sans), keep it editorial.)
- **Brand name:** `export const BRAND = "barycal"` in `src/brand.ts`, imported everywhere copy/`<title>`/manifest needs it. **Never hardcode the name in components.**

### 2.2 Motion philosophy (the soul — Janum Trivedi / Wave)
Every primary interaction is **spring-physics, interruptible, gesture-grabbable** — momentum and natural settling, never canned `ease`/`duration` tweens. A single `MotionConfig` + `useReducedMotion()` gate governs the whole app.

### 2.3 The four signature techniques (from the inspiration; each maps to a screen + a library + a fallback)

| # | Technique | Where | Library | Fallback |
|---|---|---|---|---|
| 1 | **Spring-physics / interruptible motion + "wavy carousel"** (scroll-ripple, grab-mid-flight drags) | Discover cards, soft-RSVP fling, nav transitions, Create sheet | **Motion v12** (`useSpring`/`useMotionValue`, springs not tweens) | reduced-motion → near-instant transitions; ripple collapses to a plain list |
| 2 | **Plexus / constellation mesh** (points joined by proximity lines = the social graph) | ambient background; **Regulars** rendered literally as a live co-presence constellation | **custom Canvas2D** (no dep) | cap points by `deviceMemory`/`hardwareConcurrency`; pause offscreen/hidden; reduced-motion → one static frame |
| 3 | **Depth / spatial parallax via shaders** (iOS-27 "spatial framing") | Profile cover, in-app cover imagery | **OGL** (~28kb) image + displacement shader, pointer/tilt offset | no-WebGL/reduced-motion → plain `<img>`; CSS-translate parallax as a middle tier |
| 4 | **3D rendered hero with motion** (orbiting bodies around a core) | **Landing** hero only | **react-three-fiber + drei + postprocessing** (Bloom), `React.lazy` | no-WebGL → pre-rendered hero still/`<video>` poster; reduced-motion → static, no auto-rotate |

### 2.4 Degradation & accessibility (first-class, not an afterthought)
- **Detect WebGL once at boot.** If absent, R3F and OGL never mount.
- **`useReducedMotion()` → MotionConfig provider:** springs→instant, Plexus→static frame, hero→no auto-rotate, Lenis→native scroll. Respect `prefers-reduced-transparency` for glass/grain.
- **RAF loops gated** on `IntersectionObserver` + `document.hidden`.
- Keyboard + focus-visible states first-class on Create / RSVP / auth.

---

## 3. Tech stack (decided — do not re-litigate)

| Layer | Choice | Note |
|---|---|---|
| Framework | **React 19 + TypeScript** | matches poisys + every library here is React-first |
| Build | **Vite 8** | static `dist/`; trivial CF deploy |
| Router | **React Router v7** (`createBrowserRouter`) | code-split routes; heavy WebGL/3D in lazy chunks |
| Styling | **Tailwind v4** (`@tailwindcss/vite`, CSS-first `@theme`) | tokens in one `tokens.css`; brand string in `brand.ts` |
| Motion | **Motion v12** (`motion/react`) | springs/gestures/layout; the core |
| Generative | **custom Canvas2D** | Plexus/constellation; no dependency |
| 3D/shaders | **@react-three/fiber + drei + postprocessing** (landing, lazy) · **OGL** (in-app depth) | keep three.js OUT of the app-shell bundle |
| Smooth scroll | **Lenis** (`lenis/react`, landing only) | native scroll in the app shell |
| Icons | **lucide-react** + a small hand-rolled celestial SVG set | |
| Data/Auth | **@supabase/supabase-js v2** | Supabase Auth; access-token → edge function |
| Test | **Vitest** (unit) + **Playwright** (e2e) | match poisys |

**Repo/build layout** (mirror poisys's `apps/web` ergonomics, but single-package is fine here):
```
src/            React app (routes, components, lib, styles, brand.ts)
public/         static assets kept as-is (icon.svg, etc.); app HTML now generated by Vite
dist/           Vite build output  ← wrangler assets.directory points here
wrangler.jsonc  assets.directory: "dist"  (was "public"); keep not_found_handling: "single-page-application"
supabase/       edge function + migrations (Phase 0 changes live here)
server/         local Node/Express dev mirror (kept; low priority to modernize)
```
**Vite manual chunks:** `vendor-three` (landing only), `vendor-motion`, route-level splits. **CI budget:** app-shell initial chunk < ~200 kb gz; treat any `three` import outside the landing chunk as a build failure.

---

## 4. Information architecture & routes

| Route | Screen | Notes |
|---|---|---|
| `/` | **Landing** (new, public) | 3D hero, Lenis, lazy `vendor-three` |
| `/app` | **Discover** (home, authed) | wavy carousel + soft-RSVP |
| `/plans` | Week / Month | |
| `/regulars` | Regulars (live constellation) | |
| `/you` | Profile | spatial-depth cover |
| `/circles` | Circles + tiers | |
| `/create` | Create (spring sheet; may be modal over `/app`) | |
| `/login`, `/signup` | Auth | Supabase email+password+handle |
| `/u/:handle` | account-free profile | OGL depth on cover |
| `/e/:id` | account-free event | |

CF `not_found_handling: "single-page-application"` already serves `index.html` for unknown paths → `/u/...`, `/e/...` resolve client-side (verify with `wrangler dev`).

---

## 5. Component architecture (units + interfaces)

Keep units small, single-purpose, independently testable. Suggested structure:

- `src/brand.ts` — `BRAND`, taglines, share-domain constants (single source of truth).
- `src/lib/supabase.ts` — singleton client (`persistSession`, `autoRefreshToken`); `storageKey: "barycal-auth"`.
- `src/lib/api.ts` — fetch wrapper; injects `Authorization: Bearer ${session.access_token}`; base = `VITE_BARYCAL_API`.
- `src/auth/AuthProvider.tsx` — session context (mirror poisys's pattern: `getSession` + `onAuthStateChange`); `useAuth()`.
- `src/motion/` — `MotionProvider` (reduced-motion gate), spring presets, `useWavyList` hook, `useWebGL()` detector.
- `src/ambient/Plexus.tsx` — Canvas2D constellation; props: `density`, `interactive`, `paused`.
- `src/three/Hero.tsx` (lazy) — R3F orbiting-bodies scene + Bloom + WebGL/poster fallback.
- `src/shaders/DepthImage.tsx` — OGL depth-parallax image; falls back to `<img>`.
- `src/ui/` — `Card`, `Pill`, `Button` (signal-gradient + ghost), `Avatar`/`AvatarStack`, `SegTabs`, `BottomNav` (central gravity-well "create" FAB), `Sheet` (spring, grab-to-dismiss), `SoftRsvp` (Down/Maybe/Can't fling).
- `src/screens/` — `Discover`, `Plans`, `Regulars`, `Profile`, `Circles`, `Create`, `Landing`, `Auth`.
- `src/share/` — `PublicProfile` (`/u`), `PublicEvent` (`/e`).
- Types: a shared `src/types.ts` mirroring the API shapes (user, event, circle, regular, discover item).

Each screen consumes `api.ts` + `useAuth()` and renders with the shared `ui/` + `motion/` primitives. No screen owns its own data-fetch transport.

---

## 6. Data + auth architecture

**Client:** `supabase.auth.signUp` / `signInWithPassword` (email + password); session persisted; `access_token` sent as `Authorization: Bearer` to the **`barycal` edge function** (`VITE_BARYCAL_API`). Password policy mirrors poisys (≥12 chars, mixed case, number, symbol).

**Edge function change (replaces PBKDF2/HMAC):**
- Replace `readToken()` (HMAC verify) with **Supabase JWT verification** — verify the bearer token (project JWT secret / JWKS, or `supabase.auth.getUser(jwt)` server-side), extract `sub` = `auth.users.id`.
- **User mapping:** add `auth_user_id uuid unique` to the app users table (renamed `barycal.users`, see §7). On first authenticated request, **upsert** a `barycal.users` row linked to `auth_user_id` (handle chosen at signup, display_name, avatar palette, share_id). Drop `password_hash`-based login.
- **Keep everything else:** tier/visibility enforcement (`canSeeContent`, `areConnected`), Regulars co-presence engine, CORS allow-list, rate-limit, least-privilege DB role.

**Signup UX change:** username/handle + password → **email + password + handle**. The demo account `ed` needs a corresponding `auth.users` row (email, e.g. a placeholder) seeded as part of Phase 0.

**Decision (locked by advisor):** keep the edge function as the data API; **do not** migrate to direct `supabase.from()` + RLS — that would mean re-encoding all tier rules as RLS policies (large, risky). Re-evaluate only if Realtime-from-DB is wanted later.

---

## 7. Backend rename `orbit → barycal` (Phase 0 — GATED)

The brand rename already covered docs/UI; the **live infrastructure** rename is approved to do now, as a coordinated, gated change. Surfaces:

| Identifier (now) | Becomes | Where |
|---|---|---|
| edge function `orbit` + URL `/functions/v1/orbit` | `barycal` + `/functions/v1/barycal` | Supabase function; all frontend `VITE_BARYCAL_API` |
| Postgres schema `orbit.*` | `barycal.*` | DB migration + every `sql\`...orbit.x\`` in the function |
| role `orbit_app` | `barycal_app` | DB migration + function connection role |
| secrets `ORBIT_HMAC_SECRET`/`ORBIT_DB_ROLE`/`ORBIT_ALLOWED_ORIGINS`/`ORBIT_ASSET_REF` | `BARYCAL_*` (HMAC secret retired once Supabase-JWT auth lands) | Supabase function secrets + function `Deno.env.get` |
| frontend globals `window.ORBIT_API/BASE`, `localStorage('orbit_token')`, `orbit.css` | replaced by the Vite app (`VITE_BARYCAL_API`, Supabase session storage, Tailwind build) | dies with the vanilla SPA |

**Migration outline** (`supabase/migrations/<ts>_orbit_to_barycal.sql`):
`ALTER SCHEMA orbit RENAME TO barycal;` · recreate/rename role → `barycal_app` with the same grants on `barycal` · `ALTER TABLE barycal.users ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id);` · seed `auth.users` + link for demo `ed`. Blast radius is contained to barycal's own schema (the shared `public.*` business app is untouched), but it is a **live shared-prod** change → gated.

**Sequencing:** Phase 0 lands first (it unblocks the frontend's auth/data). It can be developed alongside the Vite scaffold but must be **deployed + Ed-verified before** the new frontend points at it.

---

## 8. Deployment (Cloudflare Workers static assets)

1. `wrangler.jsonc`: `assets.directory` `"public"` → `"dist"`; keep `html_handling: "none"`, `not_found_handling: "single-page-application"`, `nodejs_compat`.
2. Scripts: `"build": "vite build"`, `"deploy": "vite build && wrangler deploy"`, `"preview": "vite build && wrangler dev"`.
3. Env (build-time Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_*` only — never service key), `VITE_BARYCAL_API`.
4. PWA via `vite-plugin-pwa` (Workbox) generating SW + precache against `dist` (replaces the hand-rolled `sw.js`); keep iOS-PWA caveats (install-gated push, no bg sync).
5. Verify deep links (`/u/:handle`, `/e/:id`) hard-refresh to the app, not 404.

---

## 9. Testing & verification (gates)

- **Unit (Vitest):** motion reduced-motion gate; `useWebGL` branching; Plexus density scaling; api token injection; tier/visibility helpers.
- **E2E (Playwright):** auth (signup/login/logout); Discover loads + soft-RSVP; create event; Regulars renders; account-free `/u` + `/e`; reduced-motion + no-WebGL render paths.
- **Perf:** app-shell initial chunk < ~200 kb gz (CI budget); landing Lighthouse ≥ target on mid-mobile; 60fps spring check on a mid iPhone.
- **GATES (CLAUDE.md — mandatory, no skipping without explicit say-so):**
  - **Phase 0 deploy:** run function/db tests green → apply migration to a branch/preview if possible → **Ed E2E-verifies** auth + a data read live → only then prod.
  - **Frontend deploy:** Vitest + Playwright green → `wrangler dev` / preview URL → **Ed E2E-verifies** the changed user flows → only then `wrangler deploy` prod.

---

## 10. Work breakdown (phases, dependencies, acceptance criteria)

> Detailed task plan comes from the writing-plans step; this is the phase contract. Units inside a phase marked ∥ can run in parallel.

- **Phase 0 — Backend rename + Supabase-Auth (GATED).** Migration (`orbit→barycal` schema/role + `auth_user_id`); edge function → `barycal`, Supabase-JWT verify + user mapping, tier logic preserved; secrets `BARYCAL_*`; deploy under gate.
  *Done when:* `barycal` function live; a Supabase-authed request to `/api/me` returns the mapped user; tier/visibility unchanged; Ed-verified.
- **Phase 1 — Scaffold.** Vite+React+TS+Tailwind v4+Router; `brand.ts`; `tokens.css`; `supabase.ts`; `api.ts`; wrangler→`dist`; CI chunk budget.
  *Done when:* app builds to `dist`, deploys to a CF preview, renders a themed shell; `BRAND` drives `<title>`.
- **Phase 2 — Design system + motion foundation.** Tokens; `MotionProvider`+reduced-motion; `useWebGL`; `Plexus`; spring presets; `ui/` primitives; nav with gravity-well FAB.
  *Done when:* primitives render in both motion modes; Plexus pauses offscreen + static under reduced-motion; unit tests green.
- **Phase 3 — Auth UI.** `/login`, `/signup` (email+password+handle), `AuthProvider`, route guards.
  *Done when:* signup→session→`/app`; logout; guarded routes redirect; Playwright auth passes.
- **Phase 4 — Core screens (∥).** Discover (wavy carousel + soft-RSVP fling) ∥ Plans (Week/Month) ∥ Regulars (live constellation) ∥ Profile (depth cover) ∥ Circles ∥ Create (spring sheet) ∥ account-free `/u` + `/e`.
  *Done when:* each screen matches the design bar, consumes `api.ts`, has its signature motion + fallback, and a Playwright happy-path.
- **Phase 5 — Landing.** R3F orbiting hero (lazy) + WebGL/poster fallback; Lenis; shimmer headline; constellation; depth-parallax features; CTAs to `/signup`.
  *Done when:* landing hits Lighthouse target, hero lazy-loads, no-WebGL shows poster, reduced-motion static.
- **Phase 6 — PWA + perf + a11y.** `vite-plugin-pwa`; manifest from `brand.ts`; perf budgets; reduced-motion/no-WebGL/low-end passes; full Playwright + a11y checks.
  *Done when:* installable PWA; budgets met; all gates green.
- **Phase 7 — Prod deploy (GATED).** Build → `wrangler dev`/preview → Ed E2E verify → `wrangler deploy`.

**Dependency graph:** 0 → (unblocks data/auth) ; 1 → all FE ; 2 → 3,4,5 ; 4 units ∥ ; 5 after 2 ; 6 after 4,5 ; 7 last.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Mobile jank from canvas/3D/springs | landing-only R3F/Lenis (lazy); app-shell = Motion + Canvas2D only; RAF gated on visibility; profile on mid iPhone before merge |
| Bundle bloat (three.js ~500kb) | landing-only + lazy; OGL for in-app depth; manual chunks; CI budget fails the build if `three` leaks into the shell |
| WebGL absent / low-end | detect once at boot; never mount R3F/OGL without it; scale Plexus by device; everything usable with zero WebGL |
| a11y / reduced-motion regressions | single `MotionConfig` gate; Playwright reduced-motion + no-WebGL paths; focus-visible on key flows |
| **Phase 0 live-prod migration on a shared project** | contained to `barycal.*` schema; test first; gated deploy + Ed verify; reversible rename (`ALTER SCHEMA … RENAME`) |
| Auth migration (handle→email) breaks demo login | seed `auth.users` for `ed` in Phase 0; document the new signup flow |

---

## 12. Out of scope (this milestone)

Google Calendar connect/sync, web push, the paid Org/Scene tier, native shell, AI concierge/generative art (PRD §8 later stages). The vanilla `public/*` SPA is removed once the rebuild ships. The local `server/` Express mirror is kept as-is (not modernized) unless it blocks dev.

---

## Appendix — design reference

Approved visual direction shown in-session as the "Celestial Editorial" style frame (palette, sans type, a live Discover card with the soft-RSVP "fling," and the motion vocabulary: spring physics · interruptible gestures · spatial depth · constellation). Inspiration: Janum Trivedi (fluid spring interfaces / Wave), @PERFECTL00P (Plexus), @azhassan_ (shader depth), @reijowrites (3D). Bar to exceed: poisys (mostly-static CSS flair).
