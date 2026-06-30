# E2E Fidelity Loop — Design & Build Contract

> A self-learning, twice-weekly **scheduled cloud agent** — authored once, instantiated in
> **barycal**, **plur-nyc**, and **poisys** — that measures the *fidelity* of each repo's
> Playwright user-simulation E2E suite, learns from the gaps, fixes a bounded batch
> (**trust before realism**), proves the fixes have teeth, runs a **mixture-of-experts review
> panel**, and opens a PR. It **never merges and never deploys.**

---

## 1. Agent briefing (read first — assume zero prior conversation)

**Goal.** Raise the *fidelity* of user-simulation E2E testing in three repos, automatically and
continuously, by closing two gaps in priority order:

1. **Trust gap (first).** Many specs are *soft*: they pass even when the feature is broken.
   Canonical example — `barycal/e2e/12-rsvp.spec.ts` wraps every check in `.catch(() => false)`
   and its only hard assertion is `expect(page.url()).toContain('localhost:3000')`. A green run
   there means nothing. The loop's first job is to make a green run *mean the flow works*.
2. **Realism gap (second).** Once assertions are trustworthy, make the simulated user behave
   like a real human: realistic personas/data, real navigation sequences, negative/edge/
   concurrency cases — not a robot clicking happy paths.

**Why a scorecard + mutation check.** "Self-learning" is only real if the loop has *memory* and a
*monotonic target*. The spine is a small per-repo **fidelity scorecard** (JSON). The headline
trust metric is **`mutation_kill_rate`**: the fraction of improved happy-path specs that correctly
go **RED** when their feature is deliberately broken. A spec that stays green under mutation is
worthless; driving `mutation_kill_rate → 1.0` is the machine-checkable definition of "trust first."

**Stack & environment.**
- All three use **Playwright**. Browsers resolve at `/opt/pw-browsers/chromium` (already wired for
  cloud/CI — see `barycal/playwright.config.ts`), so scheduled cloud runs are feasible.
- Harnesses differ (see §4). The shared mechanism is **harness-agnostic**, parameterized by a
  per-repo **contract file**.
- The loop is a Claude **skill** invoked by **cron routines** that spawn a fresh cloud session per
  fire (one repo per routine).

**Constraints (hard — non-negotiable).**
- **Diff surface is an explicit allowlist ONLY** — the loop **must abort the PR if the diff touches
  anything outside it**:
  - test dirs: `e2e/**`, `tests/e2e/**`, or `apps/web/e2e/**`
  - `.learned-experience/**`
  - `playwright.config.*` and dedicated e2e helper/fixture/seed files *inside the test dir*
  - the test scripts block of `package.json` (e.g. adding `test:e2e`) — value-add only, no dep adds
  - **Excluded even though "test-related":** app-root harness files such as `instrumentation.js`,
    `middleware.*`, `next.config.*`, `vite.config.*` (editing them can change app behavior). If a
    fidelity fix genuinely needs one, the loop **flags it in the PR body for a human** and does not
    edit it.
  - Hard-excluded: `app/**`, `lib/**`, `components/**`, `drizzle/**`, `supabase/migrations/**`, any
    source/db/migration code.
- **Never merge, never deploy, never push to `main`.** The PR is the terminal output. The MoE panel
  is a *pre-PR quality gate*; it does **not** authorize shipping. When the human later merges a
  fidelity PR and deploys, the user's normal deploy gate (CLAUDE.md gate-(b)) still applies.
- **Tests stay hermetic / non-prod.** Per-repo DB-safety rules in §4 are mandatory. barycal in
  particular **must** run against `--local` D1, never `--remote`.
- **Each fire is bounded** (top **3–5** gaps) so PRs stay small and reviewable.

**Definition of done (v1).**
- The shared mechanism exists and runs end-to-end in **barycal** (pilot): one manual fire produces
  a bounded, MoE-reviewed PR plus an updated scorecard + ledger, touching only allowed files.
- The same mechanism is instantiated in **plur-nyc** and **poisys** (artifacts + contract + skill +
  routine), each demonstrably producing one reviewed PR from a manual fire.
- **Three cron routines** (one per repo) are live, **twice weekly**, off-hours, fresh session per
  fire.
- Acceptance criteria in §6 pass.

---

## 2. System architecture

### 2.1 Per-repo artifacts (the loop's memory)

Live under each repo's existing `.learned-experience/` directory (the convention already shared by
all three repos — reuse, don't reinvent).

| File | Role |
|---|---|
| `.learned-experience/e2e-scorecard.json` | **Quantitative spine.** Append-only array of per-cycle scorecards. Schema in §3. |
| `.learned-experience/e2e-fidelity.md` | **Qualitative ledger** in the same house style as the existing `pitfalls.md`: dated findings, root cause, "how a real user differs," what was fixed, what remains. |
| `.learned-experience/e2e-contract.md` | **Per-repo specialization.** Run command, dev-server, DB-safety rule, mutation levers, personas, and the canonical flow inventory. This is the only file that differs structurally per repo. |

### 2.2 Shared skill `e2e-fidelity-loop` (the brain) — one cycle

Six stages. Each stage's output feeds the next; the skill is the orchestrator.

1. **Measure.** Read the contract. Bring up the harness, run the suite, run the **scorecard engine**
   (§3) → write a new entry to `e2e-scorecard.json`.
2. **Learn.** Diff this scorecard against the previous entry. Write a prioritized findings block to
   `e2e-fidelity.md`. **Trust-first ordering:** soft tests + mutation survivors → coverage gaps →
   realism gaps.
3. **Improve (bounded, top 3–5).** Fix in priority order:
   - *Trust:* replace swallow-and-log with web-first assertions on the actual user-visible outcome;
     delete conditional-skips; replace `waitForTimeout`-for-state with `expect.poll`/web-first waits.
   - *Realism (only after a flow's trust is fixed):* realistic personas/data, real navigation,
     negative + edge + concurrency cases drawn from the contract's flow inventory.
4. **Mutation-prove.** For each improved happy-path spec, apply the contract's **mutation lever** to
   break that flow's surface and confirm the spec goes **RED**; restore. Record `mutation_kill_rate`.
5. **Re-measure & gate.** Recompute the scorecard. Require **monotonic improvement** (no metric
   regresses; at least one trust metric improves). Revert any change that didn't move a metric or
   added flake.
6. **Panel + PR.** Run the MoE review panel (§2.3) on the diff; embed verdicts. Open the PR (§2.4).

### 2.3 Mixture-of-experts review panel

Spawned via the `Workflow` tool (adversarial-verify pattern) or parallel `Agent` calls. Four
distinct lenses, each instructed to **try to refute** the change:

| Expert | Refutation prompt |
|---|---|
| **Assertion skeptic** | "Would this spec pass if the feature were broken? Audit the mutation evidence — is the kill real?" |
| **Realism / UX** | "Is this a real user, or a robot clicking happy paths? What real behavior is still unmodeled?" |
| **Determinism / flake** | "Timing races? shared-state collisions? order-dependence? non-hermetic outbound calls?" |
| **Safety / scope** | "Does the diff stay in test + learning files? Any app/lib/db edit? Any merge/deploy/push-main?" |

**Consensus rule (mirrors CLAUDE.md gate-(b)):** each change needs **≥2 experts to concur** it is
real/sound. Reject → the skill iterates within the same fire (bounded retries, default 2), else the
change is dropped and the PR is marked `needs-work` with the panel's notes. Verdicts are written
into the PR body.

### 2.4 PR

- Branch `e2e-fidelity/<repo>-<YYYY-MM-DD>`; base = repo default branch; **never `main` directly**.
- Body (templated): scorecard **delta table**, ledger excerpt, **mutation evidence**, MoE panel
  verdicts, and the explicit line *"Auto-generated by e2e-fidelity-loop. Not authorized to merge or
  deploy — human review + standard deploy gate required."*
- Opened with `gh pr create`. **No auto-merge, no auto-deploy.**

### 2.5 Scheduler

- **Three cron routines**, one per repo, **twice weekly**, off-hours (default **Wed + Sun 07:00 UTC
  ≈ 03:00 ET**), each spawning a **fresh cloud session** scoped to that repo that runs the skill
  **once** (one bounded increment → one reviewed PR).
- Mechanism: `create_trigger` with `create_new_session_on_fire=true` + a 5-field cron expression
  (e.g. `0 7 * * 3,0`), or the equivalent `schedule` skill / `CronCreate`. The firing prompt is a
  standalone instruction: *"Run the e2e-fidelity-loop for <repo> per its `.learned-experience/
  e2e-contract.md`; open one reviewed PR; never merge or deploy."*
- The routine's environment **must** satisfy the repo harness (Docker for plur-nyc).

### 2.6 Safety rails (summary)

Diff-scope enforcement (Stage 6 aborts on app-code edits) · never merge/deploy/push-main · hermetic
non-prod DB per §4 · bounded fire · PR-only terminal output.

---

## 3. Scorecard schema & metric definitions (machine-checkable)

`.learned-experience/e2e-scorecard.json` is a JSON **array**; each fire appends one object:

```json
{
  "repo": "barycal",
  "cycle": 7,
  "timestamp": "2026-06-30T07:00:00Z",
  "commit": "f18cc1e",
  "metrics": {
    "soft_tests": 12,
    "flows_total": 18,
    "flows_asserted": 9,
    "negative_edge_cases": 4,
    "flake_rate": 0.06,
    "mutation_kill_rate": 0.82,
    "telemetry_signal": null
  },
  "delta_vs_prev": { "soft_tests": -3, "flows_asserted": +2, "mutation_kill_rate": +0.10 },
  "notes_ref": ".learned-experience/e2e-fidelity.md#2026-06-30"
}
```

**Metric definitions (all derivable by a static/dynamic scan — no human judgment):**

- **`soft_tests`** — count of `test(...)` blocks matching ANY anti-pattern rule (lower = better):
  1. sole assertion targets only the URL (`expect(...url/page.url()...).toContain|toMatch`).
  2. sole assertion is existence/length of `body` text (`toBeTruthy`, `length > N`).
  3. the only check is guarded by `.catch(() => false)`.
  4. conditional-skip: `if (visible) {…} else { console.log/return }` with **no** `expect` in the else.
  5. `waitForTimeout(...)` used to gate app state (heuristic: a `waitForTimeout` with no
     surrounding web-first assertion).
  6. zero `expect(` calls on a user-visible outcome (title/text/role/value), counting URL/body as
     non-outcome.
- **`flows_total`** — number of canonical flows enumerated in the repo's `e2e-contract.md`.
- **`flows_asserted`** — flows whose spec has ≥1 real outcome assertion (rules above excluded).
- **`negative_edge_cases`** — count of specs/blocks tagged negative/edge/concurrency (by title regex
  `/(invalid|wrong|error|race|concurrent|edge|empty|expired|rate.?limit)/i` + a real assertion).
- **`flake_rate`** — `failures / (specs × repeat_runs)` over `repeat_runs` (default 3) repeats of the
  suite in a single fire.
- **`mutation_kill_rate`** — of the happy-path specs improved **this fire**, the fraction that go
  RED when the contract's mutation lever breaks their flow. Target → **1.0**. (If zero specs were
  improved this fire, carry forward the previous value and note it.)
- **`telemetry_signal`** — reserved `null` slot; future telemetry-grounded realism plugs in here
  without a schema change.

The **scorecard engine** is a single script (Node/TS, no new deps beyond what Playwright already
pulls) that produces this object given `{ repoPath, contract, playwrightResultsJson }`.

---

## 4. Per-repo contracts (concrete)

Each repo's `e2e-contract.md` MUST specify: **run command · dev-server + DB-safety · mutation
lever · personas · canonical flow inventory.** Seed values below; the loop refines the flow
inventory over time.

### 4.1 barycal — Next.js 16 + OpenNext + Cloudflare D1
- **Run:** `npx playwright test` (no `test:e2e` script exists today — the loop should add one as an
  early trust fix). Config: `playwright.config.ts`, `baseURL http://localhost:3000`, projects
  `chromium` + `mobile`, browser `/opt/pw-browsers/chromium`.
- **Dev-server + DB-safety (MANDATORY):** `npm run db:migrate:local && npm run db:seed:local`
  (`wrangler d1 … --local`, miniflare SQLite — `scripts/gen-seed.ts` → `drizzle/seed.sql`), then
  `npm run dev`. **Never `db:*:remote`.** Real login is `ed` / `barycal` against the **seeded local
  DB only**.
- **Mutation lever:** point the flow's API/server-action at a forced-error path (e.g. Playwright
  `page.route` abort of the mutation endpoint, or a known-broken fixture row) and assert the spec
  fails. No app-code edits.
- **Personas:** `ed` (the single owner-user; barycal is single-user per CLAUDE.md).
- **Seed flow inventory:** landing/auth, navigation, discover, calendar, create-event, circles,
  regulars, profile, plans, public pages, RSVP, event-detail, mobile-ux, error-states (from the 15
  existing `e2e/0x–15` specs — most are currently *soft* and need trust fixes first).

### 4.2 plur-nyc — Next.js 16 + local Supabase + MSW (hermetic)
- **Run:** `npm run test:e2e` (prepares Supabase + schema + `.env.test.local`, then `playwright
  test`). `npm run e2e:prepare` is idempotent. **Requires Docker** in the environment.
- **DB-safety:** real **local** Supabase (`supabase start`, `SUPABASE_URL=http://127.0.0.1:54321`);
  external services mocked server-side via **MSW**; browser third-party aborted via `page.route`.
  Already hermetic by design.
- **Mutation lever:** flip an MSW handler to an error response, or seed a broken DB row, then assert
  the spec fails.
- **Personas / flow inventory:** **adopt plur-nyc's existing E2E design doc verbatim** as the
  contract source — `docs/superpowers/specs/2026-06-30-e2e-playwright-suite-design.md` (chunks
  A–G: public/nav, spin, validator, festival-planner, festival-groups, DJ-Sets-Wrapped). That doc
  already encodes determinism rules, session endpoints, and per-flow ≥2-subagent verification.
- **Note:** plur-nyc's suite is *mid-build*; here the loop both finishes coverage and raises fidelity.

### 4.3 poisys — Vite SPA monorepo (pnpm)
- **Run:** `pnpm --filter @app/web test:e2e` (→ `playwright test` in `apps/web`). Dev-server
  `pnpm --filter @app/web dev` (Vite). Specs live at `apps/web/e2e/**`.
- **DB-safety:** Supabase-backed (`poisys/supabase/`); confirm the test config targets a **local/
  branch** Supabase, never prod. (Verify during build — open item §7.)
- **Mutation lever:** break the API/Supabase call for the flow (route abort or broken seed), assert
  failure.
- **Personas:** multi-tenant (poisys is multi-workspace per `TENANCY.md`) — collaborator, workspace
  member, platform-admin. Real-user realism here includes multiplayer/concurrency.
- **Seed flow inventory:** smoke, prod-smoke, collaborator-submission, workspaces, multiplayer (from
  existing `apps/web/e2e/*.spec.ts`).

---

## 5. Where the shared code lives ("build once")

- **Canonical authoring** happens in **barycal** (this repo) under `.claude/skills/e2e-fidelity-loop/`
  (skill) + `scripts/e2e-fidelity/` (scorecard engine, mutation harness, panel workflow).
- **Rollout** copies the identical skill + scripts into `plur-nyc/.claude/skills/…` and
  `poisys/.claude/skills/…` (committed in-repo so the **cloud session** that the cron spawns always
  has them — user-level `~/.claude` may not be mounted in cloud).
- Only the three `e2e-contract.md` files differ per repo.
- *ponytail ceiling:* three committed copies can drift. Acceptable for v1; if drift bites, promote
  the shared code to a single plugin/submodule consumed by all three.

---

## 6. Work decomposition (independently-actionable units)

Each unit has a clear interface and a machine-checkable acceptance check. **Pilot all of U1–U7 in
barycal first, then U8 propagates** — this *is* "build once, then instantiate," consistent with the
chosen rollout.

| Unit | What | Depends on | Acceptance check (machine-verifiable) |
|---|---|---|---|
| **U1 Scorecard engine** | Script: `{repoPath, contract, resultsJson}` → appends valid scorecard object | — | Run on barycal as-is → emits schema-valid JSON with `soft_tests > 0` (the existing soft specs are detected) |
| **U2 Schemas + contracts** | Ledger/scorecard templates + the 3 `e2e-contract.md` files | — | Each contract has run cmd + DB-safety rule + mutation lever + flow inventory; barycal contract forbids `--remote` |
| **U3 Loop skill** | `e2e-fidelity-loop` skill orchestrating the 6 stages | U1, U2 | Dry-run on barycal → bounded diff (≤5 specs) + new scorecard entry + ledger block; **0 app-code files touched** |
| **U4 MoE panel** | Workflow/agent-team, 4 lenses, ≥2-concur consensus | — | Feed a known-soft spec → assertion-skeptic flags it; feed a diff touching `app/` → safety reviewer rejects |
| **U5 Mutation-prover** | Per-repo break-and-check harness keyed off contract levers | U2 | On a barycal happy-path spec: applying the lever makes the spec go RED; restoring makes it GREEN |
| **U6 PR + safety gate** | Diff-scope enforcement + templated `gh pr create` | U1, U4 | Diff touching `lib/` aborts with a clear error; a clean diff opens a PR whose body has the delta table + verdicts |
| **U7 Cron routine (barycal)** | One twice-weekly fresh-session trigger | U3–U6 | Trigger config validates (`0 7 * * 3,0`, fresh session); a manual fire runs the loop end-to-end → one reviewed PR |
| **U8 Rollout** | Instantiate artifacts + skill copy + routine in plur-nyc & poisys | U1–U7 | Each repo: has all 3 artifacts + skill + routine; a manual fire produces one reviewed PR touching only allowed files |

---

## 7. Sequencing & open items

**Sequence.** `U1, U2, U4` start in parallel → `U3` (needs U1+U2) and `U5` (needs U2) in parallel →
`U6` (needs U1+U4) → `U7` (needs U3+U5+U6, barycal pilot) → `U8` (rollout to plur-nyc + poisys).

**Open items to resolve during the build (not blockers now):**
1. **poisys test-DB target** — confirm `apps/web` E2E points at local/branch Supabase, never prod
   (§4.3). If it currently can hit prod, fixing that is the first trust task there.
2. **Cloud env capabilities** — confirm the cron's cloud environment provides Docker (plur-nyc) and
   the `/opt/pw-browsers/chromium` browser; otherwise pin an environment that does.
3. **barycal `e2e:prepare`** — barycal lacks a one-command prepare (migrate+seed+serve+test like
   plur-nyc's). Adding it is an in-scope early trust fix (test-harness file, allowed).
4. **Cron exact times** — default Wed+Sun 07:00 UTC; adjustable.

---

## 8. Existing patterns to match (pointers)

- **Learning files:** mirror the voice/structure of `*/.learned-experience/pitfalls.md`.
- **Hermetic harness gold standard:** `plur-nyc/docs/superpowers/specs/2026-06-30-e2e-playwright-suite-design.md` (MSW + local Supabase + determinism rules + ≥2-subagent verification).
- **Verification gate:** CLAUDE.md gate-(b) (≥2 independent subagents concur per flow) — the MoE
  panel implements this for the PR.
- **Soft-test anti-patterns to detect & kill:** `barycal/e2e/12-rsvp.spec.ts`,
  `barycal/e2e/01-landing-auth.spec.ts`.
