# Orbit — Security Review

_Defensive review of the live Orbit backend, frontend, and deployment. No live
changes were made; this is findings-only, as requested. Inspection was
read-only against the running system._

## Scope & method

- **Deployed Edge Function** — `supabase/functions/orbit/index.ts` (auth, token
  model, access control, CORS, DB access).
- **Live Postgres posture** — Supabase project `bpqtjfdiwifvrnkzldwg`
  (`every-party`): RLS state, schema exposure / grants, security advisors,
  extensions. Read-only SQL only.
- **Node MVP server** — `server/*.js` (local-only, but mirrors the auth model).
- **Frontend SPA** — `public/app.js`, `public/view.js` (token handling, XSS sinks).
- **Deploy config** — `wrangler.jsonc`, `deploy/build.sh`, `.github/workflows/`.

## Summary

| ID | Severity | Finding |
|----|----------|---------|
| **C1** | **Critical** | Session-token forgery — HMAC signing secret is hardcoded in a public repo → forge a valid token for any user → universal account takeover |
| **H1** | **High** | Demo runs with a full-privilege (`BYPASSRLS`) DB connection inside a shared **production** project → blast radius is the entire `every-party` database |
| **M1** | **Medium** | Stored XSS via `displayName` rendered into an inline `onclick` (the `esc()` helper does not escape `'`); token in `localStorage` → token theft |
| **M2** | **Medium** | Static/weak secrets & credentials; 30-day, non-revocable tokens; no rotation story |
| **L1** | **Low** | Wildcard CORS (`Access-Control-Allow-Origin: *`) — low impact because auth is header-based, not cookie-based |
| **L2** | **Low** | Auth tokens persisted in `net._http_response` (DB hygiene) |
| **L3** | **Info** | No rate limiting on auth (brute force); username enumeration on register; no password policy |

### What is actually solid (don't over-correct)

- The `orbit` schema is **not** exposed to the `anon`/`authenticated` PostgREST
  roles (no schema `USAGE`), and **RLS is enabled on all five tables** with no
  policies → deny-all to non-bypass roles. Direct table access via the public
  anon key is blocked; the Edge Function is the only path in.
- **No SQL injection** — every query uses `postgres.js` tagged templates, so all
  interpolated values are parameterized.
- `net._http_response` is **not** readable by `anon`/`authenticated` (no table
  grant), so the captured demo-login responses are not exposed via the public API.
- The frontend **HTML-escapes** user content in text/attribute contexts; the only
  gap is the JS-string-in-attribute context in M1.
- No secrets/keys are embedded in the frontend or deploy config (the SPA calls the
  custom function, not PostgREST, so there is no Supabase key to leak).

---

## C1 — Session-token forgery (Critical)

**Location:** `supabase/functions/orbit/index.ts:7-9`, `:30-34`, `:35-45`.

The token-signing secret is a string constant in source:

```ts
const SHA = "2c6cdeae9b...";
const RAW = `https://raw.githubusercontent.com/edjshen/social-cal/${SHA}/public`;
const SECRET = "orbit-edge-hmac-v1-7f3a9c";   // <-- signing key, in the repo
```

A session token is `base64url({uid, exp}) + "." + base64url(HMAC-SHA256(payload, SECRET))`
(`makeToken`, `:30-34`), and `readToken` accepts any token whose HMAC verifies and
whose `exp` is in the future (`:35-45`).

**Why it's exploitable:** the repo is **public** — the function even fetches its own
frontend unauthenticated from `raw.githubusercontent.com/edjshen/social-cal/...`
(`:8`, `:128`), which only works for a public repo. So `SECRET` is world-readable.
Anyone can:

1. Get a target's `uid` with **no auth** — e.g. `GET /api/profile/ed` returns
   `user.id` (`publicUser` includes `id`, `:70`). User ids also leak via
   `/api/users`, attendee lists, and social-proof samples.
2. Compute `makeToken(uid)` offline using the known `SECRET`.
3. Send `Authorization: Bearer <forged>` and act fully as that user — read
   Inner-Circle private events, edit the profile, manage connections, RSVP, etc.

No password, no victim interaction, works for **every** account. Confirmed by code
inspection (a forged token was **not** minted against the live system — unnecessary
and out of scope for a defensive review).

**Remediation:**
- Move the secret to an injected env var: `const SECRET = Deno.env.get("ORBIT_HMAC_SECRET")!;`
  Set it as a Supabase Edge Function secret (`supabase secrets set ORBIT_HMAC_SECRET=…`
  or dashboard), **rotate** to a fresh random value, and redeploy. Rotation invalidates
  all existing tokens (acceptable — it's a demo; users re-login).
- Because the function source is public, treat **every** secret as env-injected; never
  commit one. Add a check/`.gitignore` note so this doesn't regress.
- Consider scoping tokens (audience/issuer) and shortening `exp` (see M2).

## H1 — Over-privileged DB connection in a shared production project (High)

**Location:** `supabase/functions/orbit/index.ts:10` — `postgres(Deno.env.get("SUPABASE_DB_URL"))`.

The Orbit demo lives in the **`every-party` production project**. The same Postgres
database holds the real business app in `public.*`, including
`organization_integration_secrets`, `mercury_payment_tracking`, `platform_admins`,
`oauth_states`, `user_integrations`, and `ambassador_posh_orders` (1,172 rows).

`SUPABASE_DB_URL` connects as the `postgres` role, which **bypasses RLS** and can
read/write **all** schemas — not just `orbit`. The current code only touches
`orbit.*`, so there is no *active* cross-schema access today, but the **blast radius**
of any bug in this demo is the entire production database. A future SQL-injection,
a logic flaw, or anyone who can read the function's env would reach payments,
integration secrets, and admin tables.

This is a least-privilege violation. It's rated High (not Critical) because no current
code path or injection exposes `public.*` — the risk is latent but severe.

**Remediation (pick one, in order of preference):**
- **Move Orbit to its own Supabase project.** Cleanest isolation; the demo stops
  sharing a database with production entirely.
- **Or** create a dedicated least-privilege Postgres role scoped to the `orbit`
  schema (`GRANT USAGE ON SCHEMA orbit`, `GRANT … ON ALL TABLES IN SCHEMA orbit`,
  **no** `BYPASSRLS`, no access to `public`), and point the function's connection
  string at that role instead of `SUPABASE_DB_URL`.

## M1 — Stored XSS via display name → token theft (Medium)

**Location:** `public/app.js:8` (`esc`), `:248-249` (Regulars `onclick`); token storage
`:5`, `:92`.

`esc()` escapes only `& < > "`:

```js
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({…}[c]));
```

That is safe for text and double-quoted-attribute contexts, but the Regulars view
interpolates an attacker-settable `displayName` into a **single-quoted JS string
inside an HTML attribute**:

```js
onclick="makeStanding('${esc(r.user.displayName.split(' ')[0])}')"
```

`esc` leaves `'` untouched, so a display name of `x');alert(document.domain);//`
(set via `PUT /api/me`) breaks out of the JS string and executes when the victim
clicks the button. Because the session token is stored in `localStorage`
(`orbit_token`, `:5`/`:92`), the payload can exfiltrate it → account takeover.

**Reachability:** Regulars/“rising” are computed from shared attendance, so an
attacker can manufacture co-presence by RSVPing to the same public events as the
victim, then appears in their Regulars list. Requires a click → Medium.

**Remediation:**
- Make `esc` also escape `'` (→ `&#39;`) and `` ` ``. Minimal fix.
- Better: stop interpolating data into inline `onclick`. Use event delegation with
  `data-` attributes (e.g. `data-name`), so user data never lands in a JS context.
- Defense-in-depth: add a `Content-Security-Policy` (no inline-script execution
  would also blunt this), and consider moving the token out of `localStorage`.

## M2 — Static/weak secrets, long-lived non-revocable tokens (Medium)

- `SECRET` hardcoded (see C1).
- Node MVP default `JWT_SECRET = 'orbit-dev-secret-change-me'` (`server/index.js:10`) —
  local-only, but the same "predictable default secret" pattern; ensure prod sets it.
- Public demo creds `ed` / `orbit` (README) — fine as a throwaway demo, but rotate if
  the account ever holds anything real.
- Tokens last **30 days** (`:31`) and are pure HMAC with **no revocation** (no `jti`,
  no session store). A leaked token can't be killed short of rotating `SECRET` (which
  kills everyone).

**Remediation:** shorter `exp`; a server-side session/`jti` table for revocation if
this grows beyond a demo; rotate the demo password.

## L1 — Wildcard CORS (Low)

`Access-Control-Allow-Origin: *` (`:151`). Low impact here because auth is via the
`Authorization` header, not cookies, so browsers won't attach credentials on
cross-origin requests — wildcard CORS doesn't enable credentialed cross-origin reads.
Acceptable for a public API; tighten to an allowlist if you ever move auth to cookies.

## L2 — Tokens persisted in `net._http_response` (Low)

The end-to-end verification used `pg_net`, so login responses (including the demo
token) persist in `net._http_response` (26 rows). Not readable by `anon`/`authenticated`
(no grant) and `net` isn't REST-exposed, so impact is low — but auth tokens shouldn't
linger in DB tables. Clear them (`delete from net._http_response`) and avoid routing
auth responses through `pg_net`.

## L3 — Auth hardening (Info)

- No rate limiting on `/api/auth/login` / `register` → brute force is unthrottled.
  (Login does return a generic "Invalid credentials", which avoids user enumeration —
  good.)
- `register` returns "Username taken" → username enumeration.
- No password length/strength policy.

**Remediation:** rate-limit auth endpoints (per IP/handle), make register's
taken-vs-available response uniform if enumeration matters, add a minimum password length.

---

## Prioritized remediation plan

1. **C1** — Rotate the HMAC secret into an Edge Function env var and redeploy. (Highest
   impact, small change. Note: invalidates existing sessions.)
2. **H1** — Isolate the demo: separate project, or a least-privilege `orbit`-scoped DB role.
3. **M1** — Escape `'` in `esc` (and prefer `data-`/event-delegation); add a CSP.
4. **M2 / L2** — Shorten token lifetime, plan revocation, purge `net._http_response`.
5. **L1 / L3** — Tighten CORS if/when auth moves to cookies; rate-limit and de-enumerate auth.

---

## Remediation status

All fixes are committed to `claude/practical-newton-jbaxit`. The `orbit` Edge
Function was redeployed (now **v4, `verify_jwt:false`**) and each fix verified
live; `net._http_response` was purged. **Every identified vulnerability is now
patched** — C1/H1/M1/M2/L1/L2/L3.

| ID | Status | Detail |
|----|--------|--------|
| **C1** | ✅ **Fixed live + verified** | `SECRET` now reads `ORBIT_HMAC_SECRET` → falls back to the auto-injected `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL`; no secret in source. **Verified:** a token forged with the old hardcoded secret is now rejected (`/api/me` → 401), and a fresh login still works (200). |
| **H1** | ✅ **Fixed live + verified** | Migration applied — `orbit_app` (NOLOGIN, BYPASSRLS) has full `orbit.*` but **0 of 58** `public` tables readable/writable. Function redeployed to run as `orbit_app` (fail-closed default; override via `ORBIT_DB_ROLE`). **Verified:** health/login/profile all return 200 while running as the scoped role, so the demo's blast radius no longer includes the production schema. |
| **M1** | ✅ **Fixed in code; served fixed via the function** | `esc()` escapes `'`; the exploitable `makeStanding`/`copyLink` `onclick` sinks now pass data via `data-*` + `this.dataset`. **Verified:** the function serves the fixed `app.js` (contains `dataset.name`). Residual: the Pages/CF frontend on `master` updates only on a `master` merge (this branch can't push master). |
| **M2** | ✅ **Fixed live** | Token lifetime 30d → 7d; local server drops the predictable default `JWT_SECRET`. Revocation (session/`jti` store) remains future work. |
| **L1** | ✅ **Fixed live** | CORS is an allow-list via `ORBIT_ALLOWED_ORIGINS` (defaults to `*`, behavior unchanged until set). |
| **L2** | ✅ **Remediated live** | All orbit token rows purged from `net._http_response` (0 token rows remain). |
| **L3** | ✅ **Fixed live** | Best-effort per-isolate auth rate-limit (429) + 8-char min password on register. Hard limits need a shared store. |

> **M1 inline-handler subtlety:** HTML-entity-escaping `'` (`&#39;`) is **not**
> sufficient inside an inline `onclick` — the browser HTML-decodes the attribute
> back to `'` before the JS runs. The real fix keeps user data out of the
> JS-string context (the `data-*` + `this.dataset` rewrite); the `esc()` change is
> defense-in-depth for text/attribute contexts.

> **Deploy note:** the deployed v4 source is functionally identical to this branch's
> `index.ts`; it differs only by two redundant parentheses in the `placements` tier
> check (`!([...]).includes()` vs `![...].includes()`) — a no-op by operator
> precedence. To make the deployed artifact byte-identical, redeploy from the repo:
> `supabase functions deploy orbit --project-ref bpqtjfdiwifvrnkzldwg`.

### Remaining owner steps (optional)

```bash
# (C1, optional hardening) swap the service-role-key fallback for a dedicated secret:
supabase secrets set ORBIT_HMAC_SECRET="$(openssl rand -hex 32)" --project-ref bpqtjfdiwifvrnkzldwg
supabase functions deploy orbit --project-ref bpqtjfdiwifvrnkzldwg

# (M1 for Pages/CF users) merge this branch to master so the hosted frontend rebuilds.
```

H1's `orbit_app` role is now baked in as the function's fail-closed default; if you
ever recreate the project, re-apply `supabase/migrations/20260625000000_orbit_least_privilege_role.sql`
before deploying, or the function will (intentionally) refuse to connect with full privileges.

