# E2E Fidelity Ledger — barycal

Maintained by the `e2e-fidelity-loop` skill. Each cycle appends a dated block:
findings (prioritized: soft tests → coverage gaps → realism), root cause,
"how a real user differs," what was fixed, what remains. Scorecard numbers live
in `e2e-scorecard.json`; this file holds the *why*.

## Cycle 0 — baseline (2026-06-30)
- **soft_tests: 90 / 93 tests soft** across the 15-file suite (`e2e/01-landing-auth`
  … `e2e/15-error-states`). Scanned from the current barycal suite; the loop's own
  worktree branch predates `e2e/`, so the baseline was measured against the live
  suite (from the main checkout) and the specs land here when the branch is synced.
- **Root cause / disease:** most specs assert only `page.url()` or `body` length and
  swallow checks with `.catch(() => false)` (see `12-rsvp.spec.ts`,
  `01-landing-auth.spec.ts`). They pass even when the feature is broken — a green run
  means nothing. This is the trust gap the loop closes first.
- **How a real user differs:** a real user actually sees the RSVP toggle change state,
  the event appear on the calendar, the error message render — outcomes the current
  specs never assert.
- **Plan:** trust fixes (web-first outcome assertions + mutation-proof) precede any
  realism work. Note: the soft-test heuristic is intentionally aggressive; the
  meaningful signal is the *downward trend* across cycles, not the absolute count.
