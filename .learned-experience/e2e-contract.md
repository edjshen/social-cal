# barycal — E2E Fidelity Contract

flows_total: 14

## Run
- Command: `npx playwright test` (config `playwright.config.ts`, baseURL `http://localhost:3000`, projects `chromium` + `mobile`, browser `/opt/pw-browsers/chromium`).
- The loop should add a `test:e2e` npm script (scripts block only) as an early trust fix.

## Dev-server + DB safety (MANDATORY)
- `npm run db:migrate:local && npm run db:seed:local` (wrangler D1 **--local**, miniflare SQLite; `scripts/gen-seed.ts` → `drizzle/seed.sql`), then `npm run dev`.
- **NEVER** `db:migrate:remote` / `db:seed:remote`. The loop must only ever target `--local`.
- Real login: username `ed`, password `barycal`, against the **seeded local DB only**.

## Mutation lever
- Break the flow's API by route-aborting it on a throwaway copy of the spec (see `scripts/e2e-fidelity/mutate.mjs`). Default glob `**/api/**`; narrow per flow where known (e.g. RSVP → the RSVP mutation endpoint). No app-code edits.

## Personas
- `ed` — the single owner-user (barycal is single-user).

## Canonical flow inventory (14)
1. landing-auth  2. navigation  3. discover  4. calendar  5. create-event
6. circles  7. regulars  8. profile  9. plans  10. public-pages
11. rsvp  12. event-detail  13. mobile-ux  14. error-states

(Most of the existing `e2e/0x–15` specs are currently SOFT — trust fixes come before realism.)
