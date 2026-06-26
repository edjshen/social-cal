# Pitfalls — Next.js on Cloudflare + 2026 library traps

## 2026-06-25 — discovered during Orbit stack review

**Deprecated / beta libs to avoid (verified):**
- **`next-pwa`** (shadowwalker) last published 2022 = abandoned; `@ducanh2912/next-pwa` (2024) stale (same author moved to Serwist). → use **`@serwist/next`**.
- **Auth.js v5 / NextAuth** still `5.0.0-beta.x` after ~3 years, with documented workerd friction (jose incompat, `AUTH_SECRET`/`AUTH_TRUST_HOST` surface). On Cloudflare Workers prefer **iron-session** unless you actually need OAuth. → revisit Auth.js/Better Auth only when social login is real.
- **Lucia auth** = **sunset** as a library (now a learning resource). Don't recommend it.
- **`framer-motion`** is NOT dead — it's a maintained **frozen alias** of `motion` (both at v12.41.0, published same second 2026-06-23). For new work import `motion/react`.

**Runtime gotchas:**
- **No native `bcrypt` on Workers** — use a Web-Crypto/WASM hasher (`@noble/hashes` scrypt/argon2).
- **OpenNext ↔ Next upgrades:** gate every Next minor bump on adapter support (Next 16.2.0 crashed on Workers, OpenNext issue #1157). First-class CF adapter (on Next 16.2 stable Adapters API) expected ~end of 2026.
- **Keep the Worker bundle < 3 MiB gz** to stay on Workers Free.
- **Serwist `sw.js` on Cloudflare/OpenNext:** `/public` (incl. `sw.js`) is served by Workers Static Assets and **bypasses the worker**, so `next.config` `headers` won't apply. Add `sw.js` to `run_worker_first` in the OpenNext config to control its cache headers. Registration/scope still work.

**React 19 / Next 16 gotchas:**
- **`useOptimistic` only auto-rolls-back if the Server Action THROWS.** If an action returns an error object instead of throwing, the optimistic state sticks. Make mutations throw on failure.

**Vendor coupling:**
- **Cloudflare D1's low overhead only holds when hosting on Workers.** If hosting ever flips to Vercel, D1 is the wrong DB (binding-only fast path; admin REST throttles ~4 req/s) → switch to **Neon** (HTTP driver) with Drizzle. Rule of thumb: **host=Cloudflare→D1, host=Vercel→Neon.**
- **Supabase free tier auto-pauses after 7 days idle** (needs a keep-alive cron or $25/mo Pro) — a reason it lost to D1 for a low-touch single-vendor setup.
