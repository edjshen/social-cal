# Barycal Superadmin + Admin Console — Design Spec

**Date:** 2026-06-29 · **Branch:** `feat/superadmin-console` · **Status:** approved design, ready to plan

---

## 1. Agent briefing (read this first)

**Goal:** Add a single platform-level **superadmin** to Barycal and a gated **`/admin` console** with four modules (user management, content moderation, app stats, audit log). The sole superadmin is the existing account **`ed`** (`users.id = 147df8bb-9ba0-4aa9-a634-6ceacd5e54eb`), keyed by the email **`junting.mp3@gmail.com`**. Access is protected by **TOTP MFA** (new in this work) and re-verified at every boundary.

**Stack (do not deviate):** Next.js 16 (App Router) + OpenNext + Cloudflare Workers + **D1 (SQLite)** via **drizzle-orm**. Auth = **iron-session** + **`@noble/hashes` scrypt** (credentials-only, no OAuth). No Vercel, no Supabase, no Postgres/RLS. Build: `npm run build:cf`. Tests: `npm test` (Vitest, 35 existing). Deploy: `wrangler deploy` + `wrangler d1 migrations apply barycal-db --remote`.

**This mirrors the `poisys` framework** (`/Users/edshen/Documents/GitHub/poisys`), translated from Postgres/RLS to D1/Next. The principles we copy verbatim:

1. A **dedicated registry table** for the top privilege (`platform_admins`) — _not_ a boolean on `users`, _not_ folded into any other role.
2. **One helper is the source of truth** (`is_platform_admin()` → our `requireSuperadmin()`).
3. **Identity = email**; the admin is flagged by a hardcoded email constant.
4. **Defense in depth:** route guard → **every admin action re-checks the privilege in its own body** → privileged queries bypass normal visibility _only after_ that check.
5. **No ambient authority.** The flag gates the console and nothing else.
6. Poisys's one gap — **no admin-action audit log** — is closed here (you asked for it).

**Definition of done:**

- `npm test` green (existing 35 + new), `npm run typecheck` clean, `npm run lint` clean.
- A non-superadmin (or logged-out) request to `/admin` or any admin server action returns 404 / `FORBIDDEN`. Verified by automated test, not just the layout.
- The superadmin, after TOTP step-up, can: list/search users, suspend (ghost) / force-reset / delete a user (cascade), view & delete any event regardless of visibility, remove a connection, view stats, and read an append-only audit log of every mutation.
- Schema migration applies cleanly to a fresh D1 and is additive (safe on prod).
- Bootstrap elevates `ed` idempotently. Prod elevation + deploy happen **only after Ed's E2E sign-off** (per CLAUDE.md gates).

**Hard constraints / non-goals:** Single superadmin only — no admin-management UI, no RBAC, no per-org tenancy. Email is **nullable** and **optional at registration** (only the superadmin needs it). Additive migration only (no destructive schema change). Keep the diff lazy: reuse `lib/auth/password.ts` scrypt, `lib/ratelimit.ts`, `lib/validate.ts`, and the existing **unscoped** queries in `lib/db/queries.ts`. No charting dependency.

---

## 2. Current state (what exists today)

- **Users** (`lib/db/schema.ts:4`): `id, handle (unique), displayName, passwordHash, bio, scenes(json), avatar, shareId(unique), ghost(bool), createdAt`. **No `email`, no role/admin concept.**
- **Other tables:** `connections (aId,bId,status,requestedBy)`, `placements (ownerId,otherId,tier)`, `events (creatorId,…,visibility,parentId,originalDate,cancelled,…)`, `attendance (eventId,userId,rsvp)`, `rateLimits (scope,k,hits,windowStart)`. All reference `users.id`.
- **Session** (`lib/auth/session.ts`): `getIronSession<SessionData>`, `SessionData = { userId?, handle? }`, cookie `barycal_session`, secret from CF env `SESSION_SECRET`. `requireUserId()` throws `'UNAUTHORIZED'`.
- **Password** (`lib/auth/password.ts`): `hashPassword`, `verifyPassword` (scrypt N=2^15). Reuse for recovery codes.
- **Auth gate pattern** (`app/(app)/layout.tsx:5-7`): server component, `const s = await getSession(); if (!s.userId) redirect('/login');`.
- **Server-action pattern** (`lib/actions/*.ts`): `'use server'`, call `requireUserId()`, validate via `lib/validate.ts`, drizzle via `getDb()`, `revalidatePath`.
- **Visibility lives in the domain layer, not queries.** `lib/db/queries.ts` returns unscoped rows (`getAllUsers`, `getAllConnections`, `getEventById`…); `lib/domain/visibility.ts#canSeeContent` filters later. → Admin god-mode = reuse unscoped queries, skip `canSeeContent`, after the guard.
- **Live prod DB:** one account, handle `ed`, display "junting", no email. (Project memory said "DB clean 2026-06-27"; `ed` was created 2026-06-27T18:17Z, after that note. Memory will be updated.)
- **Routes:** route groups `app/(app)/` (calendar, circles, discover, plans, regulars, you), `app/(auth)/` (login, register), plus `app/u/[handle]`, `app/e/[id]`, `app/rooms`. **No `middleware.ts`** — guards are in layouts/actions.

---

## 3. Data model & migrations

New/changed drizzle tables in `lib/db/schema.ts`, one generated migration `drizzle/0005_superadmin.sql` (+ regenerate `drizzle/meta`). Dev `drizzle/seed.sql` updated so the local `ed` account has the email.

```ts
// users: add one column
email: text('email').unique(),            // nullable; stored lowercased; many NULLs OK in SQLite

// poisys platform_admins, translated
export const platformAdmins = sqliteTable('platform_admins', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  grantedAt: text('granted_at').notNull(),
});

// admin-action audit (closes poisys's gap) — append-only
export const adminAuditLog = sqliteTable('admin_audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').notNull(),              // append-only; no FK so the trail outlives a deleted user
  action: text('action').notNull(),                 // e.g. 'user.delete', 'event.delete', 'user.ghost'
  targetType: text('target_type').notNull(),        // 'user' | 'event' | 'connection'
  targetId: text('target_id').notNull(),
  summary: text('summary').notNull(),               // human-readable one-liner
  meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').notNull(),
}, (t) => ({ byCreated: index('audit_created').on(t.createdAt), byActor: index('audit_actor').on(t.actorId) }));

// TOTP secret, encrypted at rest
export const mfaCredentials = sqliteTable('mfa_credentials', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  secretEnc: text('secret_enc').notNull(),          // AES-GCM(base64 iv:ct) of the TOTP secret
  confirmedAt: text('confirmed_at'),                // null until first valid code
  createdAt: text('created_at').notNull(),
});

// one-time recovery codes, scrypt-hashed
export const mfaRecoveryCodes = sqliteTable('mfa_recovery_codes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),            // hashPassword(code)
  usedAt: text('used_at'),
}, (t) => ({ byUser: index('recovery_user').on(t.userId) }));
```

**Encryption key:** new Worker secret `MFA_ENCRYPTION_KEY` (32 random bytes, base64). Read from CF env like `SESSION_SECRET`. AES-GCM via WebCrypto (`crypto.subtle`), available on Workers. Helper `lib/auth/crypto.ts`: `encryptSecret(plain): string` / `decryptSecret(enc): string`.

**Migration is schema-only and additive** (new tables + nullable column) → safe to apply to prod with data present.

---

## 4. Identity & bootstrap

Single source of truth: `export const SUPERADMIN_EMAIL = 'junting.mp3@gmail.com'` in `lib/auth/superadmin.ts` (poisys hardcodes the admin email too).

**Idempotent bootstrap** (poisys-style email match). Prod sequence (gated — see §9):

```sql
UPDATE users SET email = 'junting.mp3@gmail.com'
  WHERE handle = 'ed' AND email IS NULL;
INSERT INTO platform_admins (user_id, granted_at)
  SELECT id, '<ISO ts>' FROM users WHERE lower(email) = 'junting.mp3@gmail.com'
  ON CONFLICT (user_id) DO NOTHING;
```

Elevates the **existing** `ed` account — no new account, no password handling. Dev seed mirrors this. No chicken-and-egg: before MFA is enrolled, login yields `aal2` directly, so `ed` can reach `/admin` to enroll; the enroll page lives under `(app)`, not `(admin)`.

---

## 5. Auth, gating & MFA

**Session assurance level** (`lib/auth/session.ts`): extend `SessionData` with `aal?: 'aal1' | 'aal2'`.

- Password success → `aal1`.
- If a _confirmed_ `mfa_credentials` row exists → must clear TOTP to reach `aal2`.
- No MFA on the account → set `aal2` immediately (normal users unaffected).

**`lib/auth/superadmin.ts`:**

```ts
export const SUPERADMIN_EMAIL = 'junting.mp3@gmail.com';
export async function isPlatformAdmin(userId: string): Promise<boolean>; // SELECT 1 FROM platform_admins
export async function requireSuperadmin(): Promise<{ userId: string }>;
//   getSession → require userId → require aal === 'aal2' → require isPlatformAdmin → else throw 'FORBIDDEN'
```

**Defense-in-depth gating (the poisys rule):**

1. Route group `app/(admin)/` with `app/(admin)/layout.tsx` calling `requireSuperadmin()`; on failure `notFound()` (404 — don't reveal the route exists).
2. **Every admin server action calls `requireSuperadmin()` as its first statement.** Never trust the layout/client.
3. Admin queries skip `canSeeContent` — only reachable past the guard.
4. Rate-limit MFA + admin login via `lib/ratelimit.ts`, new scopes `auth.mfa.verify`, `auth.mfa.ip`.

**MFA / TOTP** (`lib/auth/mfa.ts` + actions; deps `otpauth`, `qrcode` — approved):

- **Enroll** (`/security` page under `(app)`, reachable at `aal1`): action `startMfaEnrollment()` → generate secret (`otpauth`), store encrypted with `confirmedAt = null`, return the `otpauth://` URI + a QR. (Generate the QR as an **SVG string** via `qrcode.toString(uri, { type: 'svg' })` — pure-JS, Workers-safe; avoid `qrcode`'s PNG/canvas path. `otpauth` uses WebCrypto, also Workers-safe.) User scans, submits a code → `confirmMfaEnrollment(code)` verifies (±1 step window), sets `confirmedAt`, generates **10 recovery codes** (scrypt-hashed, returned once for display).
- **Login step-up** (`lib/actions/auth.ts` + `app/(auth)/login/mfa/page.tsx`): after password, if confirmed MFA → stay `aal1`, redirect to TOTP prompt → `verifyTotp(code)` _or_ `consumeRecoveryCode(code)` → set `aal2`.
- **Recovery / break-glass:** single-use recovery code restores `aal2`, then re-enroll. Last resort: gated `wrangler d1 execute` clears `mfa_credentials` for `ed`.

Net effect: even with `ed`'s password, no `/admin` and no admin action without a live TOTP (poisys-style AAL2, enforced server-side everywhere).

---

## 6. Admin console & modules

Console under `app/(admin)/` (Server Components read via new admin queries; mutations via `lib/actions/admin.ts`). `AdminNav` component for section nav. Data: `lib/db/admin.ts` (unscoped reads + aggregates). Every mutating action: `requireSuperadmin()` → do work in a `db.batch` transaction → `writeAudit(...)`.

1. **User management** `/admin/users` — list/search all users (handle, email, displayName, ghost, createdAt, + connection/event counts); detail view (their events, graph, RSVPs). Actions: **toggle ghost** (soft suspend); **force password reset** (set a random password, hashed via `hashPassword`, shown once); **delete user** `U` — FK-safe cascade in one `db.batch` (children before parents):
   1. `attendance` where `userId = U` (U's RSVPs)
   2. `attendance` where `eventId IN (events.id where creatorId = U)` (RSVPs on U's events)
   3. `events` where `parentId IN (…U's events…)` (recurrence-exception rows), then `events` where `creatorId = U`
   4. `placements` where `ownerId = U OR otherId = U`
   5. `connections` where `aId = U OR bId = U OR requestedBy = U`
   6. `mfa_credentials` / `mfa_recovery_codes` where `userId = U`
   7. `users` where `id = U`

   `admin_audit_log` rows are **retained** (the trail outlives the user): `targetId` is plain text, and `actorId` only ever points at the superadmin — normal users are never actors, so no FK conflict. Guardrails: refuse if `U` is a `platform_admins` member or is self.

2. **Content moderation** `/admin/moderation` — view/search **any** event regardless of `visibility` (no `canSeeContent`); **delete any event** (cascade its `attendance` + recurrence exception rows where `parentId = id`); list & **force-remove connections**. All audited.
3. **App stats** `/admin` (overview landing) — read-only `COUNT` aggregates: total users + signups in last 7/30d, events by `type`, total RSVPs, total connections, ghosted count. No chart lib.
4. **Audit log** `/admin/audit` — reverse-chron, filter by `action`/`actor`, paginated. `writeAudit(actorId, action, targetType, targetId, summary, meta?)`. Append-only; no edit/delete in UI.

---

## 7. Work-unit decomposition (for parallel agents)

Sequence: **A → B → (C ∥ D) → E → F**. C and D are independent once B lands.

| Unit                                    | Scope                                                                                        | Files (new/changed)                                                                                                                                  | Depends | Acceptance (machine-checkable)                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| **A. Schema & migration**               | `email` col + 4 tables; `0005_superadmin.sql`; seed update                                   | `lib/db/schema.ts`, `drizzle/0005_*.sql`, `drizzle/meta/*`, `drizzle/seed.sql`                                                                       | —       | Migration applies on fresh D1; `npm run typecheck` clean; existing 35 tests green         |
| **B. Superadmin helpers + gating core** | `SUPERADMIN_EMAIL`, `isPlatformAdmin`, `requireSuperadmin`, `aal` in session                 | `lib/auth/superadmin.ts`, `lib/auth/session.ts`                                                                                                      | A       | Unit tests: admin→ok, non-admin→FORBIDDEN, admin+aal1→FORBIDDEN                           |
| **C. MFA subsystem**                    | TOTP enroll/verify, AES-GCM crypto, recovery codes, login step-up, `/security`, `/login/mfa` | `lib/auth/mfa.ts`, `lib/auth/crypto.ts`, `lib/actions/auth.ts`, `lib/actions/mfa.ts`, `app/(app)/security/page.tsx`, `app/(auth)/login/mfa/page.tsx` | A, B    | TOTP valid/expired/replay; encrypt round-trip; recovery single-use; step-up password→aal2 |
| **D. Admin queries + actions**          | unscoped reads/aggregates, mutations, `writeAudit`                                           | `lib/db/admin.ts`, `lib/actions/admin.ts`                                                                                                            | A, B    | Each action rejects non-admin & aal1; cascade FK order; audit row written                 |
| **E. Console UI**                       | route group guard + nav + 4 module pages/components                                          | `app/(admin)/layout.tsx`, `app/(admin)/admin/page.tsx`, `…/users/`, `…/moderation/`, `…/audit/`, `components/admin/*`                                | B, D    | `/admin` → 404 for non-admin/logged-out; renders for admin; module smoke tests            |
| **F. Bootstrap & deploy**               | constant, gated SQL, secret, migrate, deploy, E2E                                            | bootstrap doc/script, `wrangler` steps                                                                                                               | A–E     | Prod E2E sign-off (Ed)                                                                    |

---

## 8. Testing strategy

Extends the Vitest suite (`vitest.config.ts`; `npm test`). Gates: `npm test` + `npm run typecheck` + `npm run lint` all green.

- **Unit:** `requireSuperadmin` (3 cases above); TOTP verify (valid / outside window / replay); recovery code single-use (second use fails); AES-GCM encrypt→decrypt round-trip; cascade-delete removes dependents in FK-safe order; `writeAudit` row shape.
- **Integration / security regression:** every `lib/actions/admin.ts` export rejects a non-admin **and** an `aal1` admin (proves the per-action re-check, not just the layout); admin event query returns rows `canSeeContent` would hide; login step-up sets `aal2` only after a valid code; MFA rate-limit fires after N failures.
- **Route guard:** `/admin` → `notFound()`/redirect for logged-out and non-admin sessions.

---

## 9. Bootstrap & deploy (CLAUDE.md gates)

1. `npm test` green + `npm run build:cf`.
2. `wrangler d1 migrations apply barycal-db --remote` (additive).
3. `wrangler secret put MFA_ENCRYPTION_KEY`.
4. `wrangler deploy`.
5. **Gated prod bootstrap** (Ed's explicit OK): run §4 SQL to set `ed`'s email + `platform_admins` membership.
6. **STOP for Ed's E2E sign-off:** log in as `ed` → `/admin` loads → enroll MFA on `/security` → re-login now requires TOTP → confirm a logged-out/non-admin request to `/admin` → 404. Only then is the feature "done".

---

## 10. Security notes

- Default-deny; privilege re-verified at every boundary (poisys principle). The route guard is convenience; the **action-level re-check is the real control**.
- TOTP secret never stored plaintext (AES-GCM); recovery codes never stored plaintext (scrypt). `MFA_ENCRYPTION_KEY` is a Worker secret, never committed.
- Cross-check against `BARYCALSECURITYHANDOFF.md` before deploy; run `/security-review` on the branch diff.
- Rate-limit MFA verification to blunt brute force; reuse the existing limiter.

---

## 11. Out of scope (future / fast-follow)

- Admin-management UI (grant/revoke superadmin) — stays bootstrap-only SQL.
- Read/view auditing (we log mutations only).
- Email required at registration / email verification / password-reset-by-email.
- RBAC, per-org tenancy, multiple admins.
