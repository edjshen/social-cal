# Tools / library statuses — verified 2026-06

Verified against npm dist-tags + official docs while choosing the Orbit re-platform stack. Reusable across Next.js + Cloudflare projects.

## 2026-06-25 — Orbit React PWA stack selection

**Goal:** lowest maintenance + cost, single vendor, while keeping quality/beauty.

**Picks (all OSS, ~$0/mo on Cloudflare free tier):**
- **Hosting:** Next.js 16 → Cloudflare Workers via `@opennextjs/cloudflare` (mirrors plur-nyc).
- **DB:** **Cloudflare D1** (serverless SQLite) — GA, native Workers binding, **never auto-pauses**, free tier 5M row-reads/day · 100k writes/day · 5 GB (dwarfs personal-scale). Single-region writes; read replication still beta (irrelevant at this scale).
- **ORM:** **Drizzle** — first-class official D1 driver, workerd-native, tiny, end-to-end TS types. Install the **stable 0.4x line, not v1 (still RC)**.
- **Auth:** **iron-session 8** + **`@noble/hashes`** (scrypt) — Web-Crypto-native, runs on Workers with no friction. Credentials-only = ~30 lines.
- **Styling:** CSS Modules + CSS-var tokens — built into Next 16, works under default Turbopack, zero added deps.
- **Motion:** native **View Transitions** (`viewTransition: true` + React 19.2 `<ViewTransition>`, 0 KB) + CSS; add **`motion`** lazily (`LazyMotion`+`m` → ~4.6 KB vs ~34 KB full) only where spring physics matter.
- **Data fetching:** RSC + Server Actions + `useOptimistic` (no SWR/React Query by default).
- **PWA:** **`@serwist/next` v9** (v9.5.11, May 2026 — maintained).
- **Components:** hand-roll bespoke UI; headless lib only for dialog/popover/tabs a11y — **Base UI** (`@base-ui-components/react` 1.0.0-rc.0, MUI team) forward pick; **Radix** (`radix-ui` unified import) lower-risk-today fallback.
- **Realtime (Cloudflare):** Durable Objects — **free on Workers plan since Apr 2025**, Hibernation GA (idle = ~$0). Beats Ably/Pusher/Supabase Realtime (free tiers cap ~100–200 conns, then $25–49/mo).

**Key tool:** `npm view <pkg> dist-tags` / `time` to verify a package is actually maintained (publish recency) rather than trusting memory.

**Research note:** the Tavily MCP key was rate-limited (HTTP 432) during this work — fell back to Cloudflare/Supabase docs MCP + WebSearch/WebFetch + Context7 + npm. Worth topping up the Tavily key.
