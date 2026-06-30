# Superadmin Foundation & MFA — Implementation Plan (1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-level superadmin flag (`platform_admins` registry) gated by TOTP MFA, with `requireSuperadmin()` re-checkable at every boundary — no console UI yet. Plan 2 builds the `/admin` console on top.

**Architecture:** Mirror poisys's framework on barycal's D1/Next stack. A dedicated `platform_admins` table (not a boolean), one `requireSuperadmin()` source of truth, email-keyed identity, and TOTP MFA that elevates the session to `aal2`. Testable logic is pure or mocked at the IO boundary (the `lib/mayfly/server/*.test.ts` pattern); D1 wiring and React pages are covered by `typecheck` + `lint` + the E2E gate.

**Tech Stack:** Next.js 16 (App Router) · Cloudflare Workers + D1 · drizzle-orm · iron-session · `@noble/hashes` scrypt · WebCrypto AES-GCM · `otpauth` (new) · `qrcode` (already installed) · Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-06-29-superadmin-design.md` (§3 data model, §5 auth/MFA).

**Testing philosophy (read once):** vitest runs in `node`, and `getDb()` (→ `getCloudflareContext()`) does **not** work there. So: (a) extract pure logic and test it directly; (b) for code that calls `getSession()`/`getDb()`, `vi.mock` those modules — see `lib/mayfly/server/phone-gate.test.ts:9-24` for the exact pattern; (c) React pages and real D1 reads get **no** node test — they're verified by `npm run typecheck`, `npm run lint`, and Ed's E2E sign-off (Plan 2 §F).

**Conventions to follow:** server actions are `'use server'` files in `lib/actions/` that validate via `lib/validate.ts` and read CF env like `lib/auth/session.ts:14-22` (`getCloudflareContext().env.X ?? process.env.X`). IDs use `nanoid` (already a dep). Timestamps are ISO strings (`new Date().toISOString()`), matching existing `createdAt` columns.

---

## Task 1: Schema — email column + 4 tables + migration

**Files:**

- Modify: `lib/db/schema.ts` (add `email` to `users`; append 4 tables + types)
- Create: `drizzle/0005_superadmin.sql` (generated) + `drizzle/meta/*` (regenerated)
- Modify: `scripts/gen-seed.ts` (set the dev `ed` fixture's email, if such a fixture exists)

- [ ] **Step 1: Add the column + tables to the drizzle schema**

In `lib/db/schema.ts`, add `email` to the `users` table object (after `handle`):

```ts
  email: text('email').unique(),
```

Append after the existing tables (before the `export type` block):

```ts
export const platformAdmins = sqliteTable('platform_admins', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  grantedAt: text('granted_at').notNull(),
});

export const adminAuditLog = sqliteTable(
  'admin_audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').notNull(), // append-only; no FK so the trail outlives a deleted user
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    summary: text('summary').notNull(),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byCreated: index('audit_created').on(t.createdAt),
    byActor: index('audit_actor').on(t.actorId),
  })
);

export const mfaCredentials = sqliteTable('mfa_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretEnc: text('secret_enc').notNull(),
  confirmedAt: text('confirmed_at'),
  createdAt: text('created_at').notNull(),
});

export const mfaRecoveryCodes = sqliteTable(
  'mfa_recovery_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: text('used_at'),
  },
  (t) => ({ byUser: index('recovery_user').on(t.userId) })
);
```

Add to the `export type` block at the bottom:

```ts
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type AdminAuditRow = typeof adminAuditLog.$inferSelect;
export type MfaCredential = typeof mfaCredentials.$inferSelect;
export type MfaRecoveryCode = typeof mfaRecoveryCodes.$inferSelect;
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0005_superadmin.sql` adding `email` to `users` and creating the 4 tables; `drizzle/meta/_journal.json` updated. Open the SQL and confirm it is **additive only** (an `ALTER TABLE users ADD email` + four `CREATE TABLE`/`CREATE INDEX`). No `DROP`, no data change.

- [ ] **Step 3: Apply locally + typecheck**

Run: `npm run db:migrate:local && npm run typecheck`
Expected: migration applies with no error; `tsc` exits 0.

- [ ] **Step 4: Update the dev seed (only if a local `ed` fixture exists)**

Open `scripts/gen-seed.ts`. If it seeds a local `ed` account, set its `email` to `'junting.mp3@gmail.com'` so the dev bootstrap matches prod. If there is no such fixture, skip — note it in the commit message.

- [ ] **Step 5: Run the existing suite (regression)**

Run: `npm test`
Expected: existing 35 tests still PASS (additive schema doesn't touch them).

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle/ scripts/gen-seed.ts
git commit -m "feat(db): add email + platform_admins, admin_audit_log, mfa_* tables"
```

---

## Task 2: Pure guard `assertSuperadmin` + session `aal`

**Files:**

- Create: `lib/auth/superadmin.ts`
- Modify: `lib/auth/session.ts` (add `aal` to `SessionData`)
- Test: `lib/auth/superadmin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/auth/superadmin.test.ts
import { describe, it, expect } from 'vitest';
import { assertSuperadmin } from './superadmin';

describe('assertSuperadmin — the pure privilege guard', () => {
  const ok = { userId: 'u1', aal: 'aal2' as const, isAdmin: true };

  it('passes for an aal2 platform admin', () => {
    expect(() => assertSuperadmin(ok)).not.toThrow();
  });
  it('throws FORBIDDEN when not a platform admin', () => {
    expect(() => assertSuperadmin({ ...ok, isAdmin: false })).toThrow('FORBIDDEN');
  });
  it('throws FORBIDDEN when only aal1 (MFA not satisfied)', () => {
    expect(() => assertSuperadmin({ ...ok, aal: 'aal1' })).toThrow('FORBIDDEN');
  });
  it('throws FORBIDDEN when no userId', () => {
    expect(() => assertSuperadmin({ userId: undefined, aal: 'aal2', isAdmin: true })).toThrow(
      'FORBIDDEN'
    );
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run lib/auth/superadmin.test.ts`
Expected: FAIL ("assertSuperadmin is not a function" / module not found).

- [ ] **Step 3: Implement the pure guard + constant**

```ts
// lib/auth/superadmin.ts
export const SUPERADMIN_EMAIL = 'junting.mp3@gmail.com';

export type Aal = 'aal1' | 'aal2';

// Pure, IO-free privilege decision. Throws 'FORBIDDEN' unless the caller is a
// signed-in (userId), MFA-elevated (aal2), platform admin. This is the single
// rule; the IO wrapper requireSuperadmin() (Task 3) feeds it real values.
export function assertSuperadmin(input: {
  userId: string | undefined;
  aal: Aal | undefined;
  isAdmin: boolean;
}): asserts input is { userId: string; aal: 'aal2'; isAdmin: true } {
  if (!input.userId || input.aal !== 'aal2' || !input.isAdmin) {
    throw new Error('FORBIDDEN');
  }
}
```

- [ ] **Step 4: Add `aal` to the session type**

In `lib/auth/session.ts`, extend the interface:

```ts
export interface SessionData {
  userId?: string;
  handle?: string;
  aal?: 'aal1' | 'aal2';
}
```

- [ ] **Step 5: Run test — expect PASS + typecheck**

Run: `npx vitest run lib/auth/superadmin.test.ts && npm run typecheck`
Expected: 4 PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/superadmin.ts lib/auth/superadmin.test.ts lib/auth/session.ts
git commit -m "feat(auth): assertSuperadmin pure guard + session aal level"
```

---

## Task 3: `isPlatformAdmin` + `requireSuperadmin` (IO wrappers)

**Files:**

- Modify: `lib/auth/superadmin.ts` (append the IO wrappers)
- Test: `lib/auth/superadmin.io.test.ts` (mocks the session + db boundary)

- [ ] **Step 1: Write the failing test (mock the boundary, per the mayfly pattern)**

```ts
// lib/auth/superadmin.io.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { session: {} as Record<string, unknown>, adminIds: new Set<string>() },
}));

vi.mock('./session', () => ({
  getSession: async () => state.session,
}));
// isPlatformAdmin reads the db; stub getDb so the lookup is hermetic.
vi.mock('../db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            state.adminIds.has(state.session.userId as string)
              ? [{ userId: state.session.userId }]
              : [],
        }),
      }),
    }),
  }),
}));

import { requireSuperadmin } from './superadmin';

beforeEach(() => {
  state.session = {};
  state.adminIds = new Set();
});

describe('requireSuperadmin — IO composition', () => {
  it('returns the userId for an aal2 admin', async () => {
    state.session = { userId: 'ed', aal: 'aal2' };
    state.adminIds = new Set(['ed']);
    await expect(requireSuperadmin()).resolves.toEqual({ userId: 'ed' });
  });
  it('throws FORBIDDEN for a non-admin (even at aal2)', async () => {
    state.session = { userId: 'mallory', aal: 'aal2' };
    await expect(requireSuperadmin()).rejects.toThrow('FORBIDDEN');
  });
  it('throws FORBIDDEN for an admin still at aal1 (no MFA step-up)', async () => {
    state.session = { userId: 'ed', aal: 'aal1' };
    state.adminIds = new Set(['ed']);
    await expect(requireSuperadmin()).rejects.toThrow('FORBIDDEN');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run lib/auth/superadmin.io.test.ts`
Expected: FAIL (`requireSuperadmin` not exported).

- [ ] **Step 3: Implement the wrappers**

Append to `lib/auth/superadmin.ts`:

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { platformAdmins } from '../db/schema';
import { getSession } from './session';

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ userId: platformAdmins.userId })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, userId))
    .limit(1);
  return rows.length > 0;
}

// The boundary control. Call this at the top of EVERY admin action and in the
// admin route-group layout. Never trust the layout alone (defense in depth).
export async function requireSuperadmin(): Promise<{ userId: string }> {
  const s = await getSession();
  const isAdmin = s.userId ? await isPlatformAdmin(s.userId) : false;
  assertSuperadmin({ userId: s.userId, aal: s.aal, isAdmin });
  return { userId: s.userId! };
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run lib/auth/superadmin.io.test.ts && npm run typecheck`
Expected: 3 PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/superadmin.ts lib/auth/superadmin.io.test.ts
git commit -m "feat(auth): isPlatformAdmin + requireSuperadmin boundary guard"
```

---

## Task 4: AES-GCM crypto helpers (encrypt the TOTP secret at rest)

**Files:**

- Create: `lib/auth/crypto.ts`
- Test: `lib/auth/crypto.test.ts`

- [ ] **Step 1: Write the failing test (WebCrypto works in Node 22)**

```ts
// lib/auth/crypto.test.ts
import { describe, it, expect } from 'vitest';
import { aesEncrypt, aesDecrypt } from './crypto';

const key = new Uint8Array(32).fill(7); // deterministic test key

describe('aesEncrypt/aesDecrypt — AES-GCM round trip', () => {
  it('decrypts what it encrypted', async () => {
    const enc = await aesEncrypt(key, 'JBSWY3DPEHPK3PXP');
    expect(enc).toMatch(/^[^:]+:[^:]+$/); // iv:ct, both base64
    expect(await aesDecrypt(key, enc)).toBe('JBSWY3DPEHPK3PXP');
  });
  it('produces a different ciphertext each call (random IV)', async () => {
    const a = await aesEncrypt(key, 'same');
    const b = await aesEncrypt(key, 'same');
    expect(a).not.toBe(b);
  });
  it('throws on a tampered ciphertext', async () => {
    const enc = await aesEncrypt(key, 'secret');
    const [iv, ct] = enc.split(':');
    const flipped = `${iv}:${ct.slice(0, -2)}AA`;
    await expect(aesDecrypt(key, flipped)).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run lib/auth/crypto.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement (pure key-arg fns + env wrappers)**

```ts
// lib/auth/crypto.ts
import { getCloudflareContext } from '@opennextjs/cloudflare';

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = new TextEncoder();
const dec = new TextDecoder();

async function importKey(keyBytes: Uint8Array) {
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function aesEncrypt(keyBytes: Uint8Array, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(keyBytes);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain))
  );
  return `${b64(iv)}:${b64(ct)}`;
}

export async function aesDecrypt(keyBytes: Uint8Array, stored: string): Promise<string> {
  const [ivB64, ctB64] = stored.split(':');
  const key = await importKey(keyBytes);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(ctB64));
  return dec.decode(pt);
}

// 32-byte key from the MFA_ENCRYPTION_KEY Worker secret (base64), env-read like
// SESSION_SECRET. ponytail: throws loud if unset — a silent empty key is worse.
function mfaKey(): Uint8Array {
  const e = getCloudflareContext().env as unknown as { MFA_ENCRYPTION_KEY?: string };
  const k = e.MFA_ENCRYPTION_KEY ?? process.env.MFA_ENCRYPTION_KEY;
  if (!k) throw new Error('MFA_ENCRYPTION_KEY is not set');
  return unb64(k);
}

export const encryptSecret = (plain: string) => aesEncrypt(mfaKey(), plain);
export const decryptSecret = (stored: string) => aesDecrypt(mfaKey(), stored);
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run lib/auth/crypto.test.ts && npm run typecheck`
Expected: 3 PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/crypto.ts lib/auth/crypto.test.ts
git commit -m "feat(auth): AES-GCM helpers to encrypt the TOTP secret at rest"
```

---

## Task 5: TOTP (`otpauth`) + recovery codes

**Files:**

- Modify: `package.json` (add `otpauth`)
- Create: `lib/auth/mfa.ts`
- Test: `lib/auth/mfa.test.ts`

- [ ] **Step 1: Add the dependency**

Run: `npm install otpauth@^9`
Expected: `otpauth` appears in `dependencies`. (`qrcode` is already installed — do not re-add.)

- [ ] **Step 2: Write the failing test**

```ts
// lib/auth/mfa.test.ts
import { describe, it, expect } from 'vitest';
import * as OTPAuth from 'otpauth';
import { newTotpSecret, totpAuthUri, verifyTotp, newRecoveryCodes } from './mfa';
import { hashRecoveryCode, verifyRecoveryCode } from './mfa';

describe('TOTP', () => {
  it('verifies a freshly generated code and rejects a wrong one', () => {
    const secret = newTotpSecret();
    const live = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();
    expect(verifyTotp(secret, live)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });
  it('builds an otpauth:// URI carrying the label + secret', () => {
    const uri = totpAuthUri('SECRET32', 'ed');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=SECRET32');
  });
});

describe('recovery codes', () => {
  it('generates 10 distinct codes', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });
  it('hashes + verifies a code (and rejects a wrong one)', async () => {
    const [code] = newRecoveryCodes();
    const hash = await hashRecoveryCode(code);
    expect(await verifyRecoveryCode(code, hash)).toBe(true);
    expect(await verifyRecoveryCode('nope', hash)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npx vitest run lib/auth/mfa.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

```ts
// lib/auth/mfa.ts
import * as OTPAuth from 'otpauth';
import { nanoid } from 'nanoid';
import { hashPassword, verifyPassword } from './password';

const ISSUER = 'Barycal';

export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpAuthUri(secretBase32: string, label: string): string {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  }).toString();
}

// ±1 time-step window absorbs clock drift; null from validate() = no match.
export function verifyTotp(secretBase32: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secretBase32) });
  return totp.validate({ token, window: 1 }) !== null;
}

// 10 codes, formatted xxxx-xxxx. Crockford base32 (32 chars, no i/l/o/u) so
// `byte & 31` is bias-free; CRYPTO randomness — these are a real auth credential.
export function newRecoveryCodes(n = 10): string[] {
  const A = '0123456789abcdefghjkmnpqrstvwxyz';
  const one = () => {
    const b = crypto.getRandomValues(new Uint8Array(8));
    const c = Array.from(b, (x) => A[x & 31]);
    return c.slice(0, 4).join('') + '-' + c.slice(4).join('');
  };
  return Array.from({ length: n }, one);
}

export const hashRecoveryCode = (code: string) => hashPassword(code);
export const verifyRecoveryCode = (code: string, hash: string) => verifyPassword(code, hash);
```

> Recovery codes use `crypto.getRandomValues` (not `Math.random`) — they're a backup auth factor, so they must be cryptographically random. 8 base32 chars ≈ 40 bits each.

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run lib/auth/mfa.test.ts && npm run typecheck`
Expected: 6 PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/auth/mfa.ts lib/auth/mfa.test.ts
git commit -m "feat(auth): TOTP verify + recovery codes (otpauth)"
```

---

## Task 6: Login step-up decision + audit row builder (pure helpers)

**Files:**

- Modify: `lib/auth/superadmin.ts` (add `nextAalAfterPassword`) — or co-locate in `session.ts`; keep in `superadmin.ts` for cohesion
- Create: `lib/db/audit.ts` (`buildAuditRow` pure + `writeAudit` IO)
- Test: `lib/auth/aal.test.ts`, `lib/db/audit.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/auth/aal.test.ts
import { describe, it, expect } from 'vitest';
import { nextAalAfterPassword } from './superadmin';

describe('nextAalAfterPassword', () => {
  it('stays aal1 when the account has confirmed MFA (step-up required)', () => {
    expect(nextAalAfterPassword(true)).toBe('aal1');
  });
  it('jumps to aal2 when there is no MFA (normal users unaffected)', () => {
    expect(nextAalAfterPassword(false)).toBe('aal2');
  });
});
```

```ts
// lib/db/audit.test.ts
import { describe, it, expect } from 'vitest';
import { buildAuditRow } from './audit';

describe('buildAuditRow', () => {
  it('produces a complete, id-stamped row', () => {
    const row = buildAuditRow({
      actorId: 'ed',
      action: 'user.delete',
      targetType: 'user',
      targetId: 'u9',
      summary: 'deleted @spam',
    });
    expect(row.id).toBeTruthy();
    expect(row.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(row).toMatchObject({
      actorId: 'ed',
      action: 'user.delete',
      targetType: 'user',
      targetId: 'u9',
    });
  });
});
```

- [ ] **Step 2: Run them — expect FAIL**

Run: `npx vitest run lib/auth/aal.test.ts lib/db/audit.test.ts`
Expected: FAIL (functions not found).

- [ ] **Step 3: Implement**

Append to `lib/auth/superadmin.ts`:

```ts
// After a correct password, an account WITH confirmed MFA must still clear TOTP
// (stay aal1 → step-up); everyone else is fully authenticated (aal2).
export function nextAalAfterPassword(hasConfirmedMfa: boolean): 'aal1' | 'aal2' {
  return hasConfirmedMfa ? 'aal1' : 'aal2';
}
```

Create `lib/db/audit.ts`:

```ts
import { nanoid } from 'nanoid';
import { getDb } from './index';
import { adminAuditLog } from './schema';
import type { AdminAuditRow } from './schema';

export type AuditInput = {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  meta?: Record<string, unknown>;
};

export function buildAuditRow(input: AuditInput): AdminAuditRow {
  return {
    id: nanoid(),
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    meta: input.meta ?? null,
    createdAt: new Date().toISOString(),
  };
}

// Append-only. Called inside every mutating admin action (Plan 2).
export async function writeAudit(input: AuditInput): Promise<void> {
  await getDb().insert(adminAuditLog).values(buildAuditRow(input));
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run lib/auth/aal.test.ts lib/db/audit.test.ts && npm run typecheck`
Expected: 3 PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/superadmin.ts lib/auth/aal.test.ts lib/db/audit.ts lib/db/audit.test.ts
git commit -m "feat(auth): aal step-up decision + admin audit row builder/writer"
```

---

## Task 7: MFA server actions (enroll, confirm, step-up, recovery)

**Files:**

- Create: `lib/actions/mfa.ts`
- Create: `lib/db/mfa-queries.ts` (thin reads/writes used by the actions)
- Test: `lib/actions/mfa.test.ts` (mock the boundary)

> These touch `getDb()`/`getSession()`/`getCloudflareContext()`, so the test mocks those modules and asserts behavior. The QR is rendered as an SVG **data URL** (`<img src>`-friendly, no `dangerouslySetInnerHTML`, no PNG/canvas).

- [ ] **Step 1: Write the failing test**

```ts
// lib/actions/mfa.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    session: {} as Record<string, unknown>,
    cred: null as null | { secretEnc: string; confirmedAt: string | null },
  },
}));

vi.mock('../auth/session', () => ({
  getSession: async () => ({ ...state.session, save: vi.fn(async () => {}) }),
  requireUserId: async () => {
    if (!state.session.userId) throw new Error('UNAUTHORIZED');
    return state.session.userId;
  },
}));
vi.mock('../auth/crypto', () => ({
  encryptSecret: async (s: string) => `enc(${s})`,
  decryptSecret: async (s: string) => s.replace(/^enc\(|\)$/g, ''),
}));
vi.mock('../db/mfa-queries', () => ({
  getMfaCredential: async () => state.cred,
  upsertMfaCredential: async (_u: string, secretEnc: string) => {
    state.cred = { secretEnc, confirmedAt: null };
  },
  confirmMfaCredential: async () => {
    if (state.cred) state.cred.confirmedAt = '2026-06-29T00:00:00.000Z';
  },
  replaceRecoveryCodes: vi.fn(async () => {}),
}));

import { startMfaEnrollment, confirmMfaEnrollment } from './mfa';
import * as OTPAuth from 'otpauth';

beforeEach(() => {
  state.session = { userId: 'ed' };
  state.cred = null;
});

describe('MFA enrollment', () => {
  it('startMfaEnrollment stores an encrypted secret and returns a QR data URL', async () => {
    const r = await startMfaEnrollment();
    expect(state.cred?.secretEnc).toMatch(/^enc\(/);
    expect(r.qrDataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });
  it('confirmMfaEnrollment accepts a valid code and returns 10 recovery codes', async () => {
    await startMfaEnrollment();
    const secret = state.cred!.secretEnc.replace(/^enc\(|\)$/g, '');
    const live = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();
    const r = await confirmMfaEnrollment(live);
    expect(r.recoveryCodes).toHaveLength(10);
    expect(state.cred!.confirmedAt).toBeTruthy();
  });
  it('confirmMfaEnrollment rejects a wrong code', async () => {
    await startMfaEnrollment();
    await expect(confirmMfaEnrollment('000000')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run lib/actions/mfa.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the thin queries**

```ts
// lib/db/mfa-queries.ts
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from './index';
import { mfaCredentials, mfaRecoveryCodes } from './schema';

export async function getMfaCredential(userId: string) {
  const r = await getDb()
    .select()
    .from(mfaCredentials)
    .where(eq(mfaCredentials.userId, userId))
    .limit(1);
  return r[0] ?? null;
}
export async function upsertMfaCredential(userId: string, secretEnc: string) {
  await getDb()
    .insert(mfaCredentials)
    .values({ userId, secretEnc, confirmedAt: null, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: mfaCredentials.userId, set: { secretEnc, confirmedAt: null } });
}
export async function confirmMfaCredential(userId: string) {
  await getDb()
    .update(mfaCredentials)
    .set({ confirmedAt: new Date().toISOString() })
    .where(eq(mfaCredentials.userId, userId));
}
export async function replaceRecoveryCodes(userId: string, hashes: string[]) {
  const db = getDb();
  await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  if (hashes.length)
    await db
      .insert(mfaRecoveryCodes)
      .values(hashes.map((codeHash) => ({ id: nanoid(), userId, codeHash, usedAt: null })));
}
```

- [ ] **Step 4: Implement the actions**

```ts
// lib/actions/mfa.ts
'use server';
import QRCode from 'qrcode';
import { requireUserId } from '../auth/session';
import { encryptSecret, decryptSecret } from '../auth/crypto';
import {
  newTotpSecret,
  totpAuthUri,
  verifyTotp,
  newRecoveryCodes,
  hashRecoveryCode,
} from '../auth/mfa';
import {
  getMfaCredential,
  upsertMfaCredential,
  confirmMfaCredential,
  replaceRecoveryCodes,
} from '../db/mfa-queries';

export async function startMfaEnrollment(): Promise<{ qrDataUrl: string; secret: string }> {
  const userId = await requireUserId();
  const secret = newTotpSecret();
  await upsertMfaCredential(userId, await encryptSecret(secret));
  const svg = await QRCode.toString(totpAuthUri(secret, userId), { type: 'svg' });
  const qrDataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
  return { qrDataUrl, secret }; // secret shown as manual-entry fallback
}

export async function confirmMfaEnrollment(token: string): Promise<{ recoveryCodes: string[] }> {
  const userId = await requireUserId();
  const cred = await getMfaCredential(userId);
  if (!cred) throw new Error('NO_PENDING_MFA');
  const secret = await decryptSecret(cred.secretEnc);
  if (!verifyTotp(secret, token)) throw new Error('BAD_CODE');
  await confirmMfaCredential(userId);
  const codes = newRecoveryCodes();
  await replaceRecoveryCodes(userId, await Promise.all(codes.map(hashRecoveryCode)));
  return { recoveryCodes: codes };
}
```

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run lib/actions/mfa.test.ts && npm run typecheck`
Expected: 3 PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/mfa.ts lib/db/mfa-queries.ts lib/actions/mfa.test.ts
git commit -m "feat(mfa): enrollment + confirmation server actions"
```

---

## Task 8: Login step-up — wire `aal` into auth + step-up action

**Files:**

- Modify: `lib/actions/auth.ts` (set `aal` after password; add `verifyMfaStepUp` + `useRecoveryCode`)
- Test: extend `lib/actions/mfa.test.ts` or add `lib/actions/stepup.test.ts` (mock boundary)

> Read `lib/actions/auth.ts` first to match its existing login shape (how it sets `session.userId`/`handle` and saves). Insert the `aal` decision right after a successful `verifyPassword`, using `nextAalAfterPassword(!!confirmedMfa)`.

- [ ] **Step 1: Write the failing test for the step-up action**

```ts
// lib/actions/stepup.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { session: {} as Record<string, unknown>, saved: false, secret: '' },
}));

vi.mock('../auth/session', () => ({
  getSession: async () => ({
    ...state.session,
    save: async () => {
      state.saved = true;
    },
  }),
}));
vi.mock('../auth/crypto', () => ({ decryptSecret: async (s: string) => s }));
vi.mock('../db/mfa-queries', () => ({
  getMfaCredential: async () => ({ secretEnc: state.secret, confirmedAt: 'x' }),
}));

import { verifyMfaStepUp } from './auth';
import * as OTPAuth from 'otpauth';

beforeEach(() => {
  state.session = { userId: 'ed', aal: 'aal1' };
  state.saved = false;
  state.secret = new OTPAuth.Secret({ size: 20 }).base32;
});

describe('verifyMfaStepUp', () => {
  it('elevates aal1 → aal2 on a valid code', async () => {
    const live = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(state.secret) }).generate();
    const r = await verifyMfaStepUp(live);
    expect(r.ok).toBe(true);
  });
  it('rejects a wrong code (stays aal1)', async () => {
    const r = await verifyMfaStepUp('000000');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run lib/actions/stepup.test.ts`
Expected: FAIL (`verifyMfaStepUp` not exported).

- [ ] **Step 3: Implement in `lib/actions/auth.ts`**

Add the import and actions (keep the existing login export; only augment it):

```ts
import { getMfaCredential } from '../db/mfa-queries';
import { decryptSecret } from '../auth/crypto';
import { verifyTotp, verifyRecoveryCode } from '../auth/mfa';
import { nextAalAfterPassword } from '../auth/superadmin';

// --- inside the existing login action, right after verifyPassword succeeds and
// you set session.userId/handle, BEFORE session.save(): ---
//   const mfa = await getMfaCredential(user.id);
//   session.aal = nextAalAfterPassword(!!mfa?.confirmedAt);
// (If session.aal === 'aal1', the client should route to /login/mfa.)

export async function verifyMfaStepUp(token: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session.userId) return { ok: false };
  const cred = await getMfaCredential(session.userId);
  if (!cred?.confirmedAt) return { ok: false };
  if (!verifyTotp(await decryptSecret(cred.secretEnc), token)) return { ok: false };
  session.aal = 'aal2';
  await session.save();
  return { ok: true };
}

export async function useRecoveryCode(code: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session.userId) return { ok: false };
  const { consumeRecoveryCode } = await import('../db/mfa-queries');
  const ok = await consumeRecoveryCode(session.userId, code, verifyRecoveryCode);
  if (!ok) return { ok: false };
  session.aal = 'aal2';
  await session.save();
  return { ok: true };
}
```

Add `consumeRecoveryCode` to `lib/db/mfa-queries.ts` (single-use: verify against unused hashes, mark the match `usedAt`):

```ts
import { and, isNull } from 'drizzle-orm';

export async function consumeRecoveryCode(
  userId: string,
  code: string,
  verify: (code: string, hash: string) => Promise<boolean>
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mfaRecoveryCodes)
    .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
  for (const r of rows) {
    if (await verify(code, r.codeHash)) {
      await db
        .update(mfaRecoveryCodes)
        .set({ usedAt: new Date().toISOString() })
        .where(eq(mfaRecoveryCodes.id, r.id));
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run test + full suite + typecheck**

Run: `npx vitest run lib/actions/stepup.test.ts && npm test && npm run typecheck`
Expected: step-up 2 PASS; whole suite PASS; `tsc` 0.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/auth.ts lib/db/mfa-queries.ts lib/actions/stepup.test.ts
git commit -m "feat(auth): MFA step-up + recovery-code consumption, aal on login"
```

---

## Task 9: Enrollment + step-up pages (UI — typecheck/lint/E2E, no node test)

**Files:**

- Create: `app/(app)/security/page.tsx` + `components/MfaEnroll.tsx` (client)
- Create: `app/(auth)/login/mfa/page.tsx` + `components/MfaPrompt.tsx` (client)

> No node test (React + CF runtime). Verify by `npm run typecheck`, `npm run lint`, and the E2E gate. Match the existing form/client patterns in `components/` and `app/(auth)/login`.

- [ ] **Step 1: `/security` enrollment page (server) + client enroll component**

```tsx
// app/(app)/security/page.tsx
import { getMfaCredential } from '@/lib/db/mfa-queries';
import { getSession } from '@/lib/auth/session';
import MfaEnroll from '@/components/MfaEnroll';

export default async function SecurityPage() {
  const s = await getSession();
  const cred = s.userId ? await getMfaCredential(s.userId) : null;
  return (
    <main className="main">
      <h1>Security</h1>
      {cred?.confirmedAt ? <p>Two-factor authentication is on.</p> : <MfaEnroll />}
    </main>
  );
}
```

```tsx
// components/MfaEnroll.tsx
'use client';
import { useState } from 'react';
import { startMfaEnrollment, confirmMfaEnrollment } from '@/lib/actions/mfa';

export default function MfaEnroll() {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState('');

  if (codes)
    return (
      <div>
        <h2>Save your recovery codes</h2>
        <ul>
          {codes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <p>Each works once. Store them somewhere safe.</p>
      </div>
    );

  return (
    <div>
      {!qr ? (
        <button
          onClick={async () => {
            const r = await startMfaEnrollment();
            setQr(r.qrDataUrl);
            setSecret(r.secret);
          }}
        >
          Enable two-factor
        </button>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr('');
            try {
              setCodes((await confirmMfaEnrollment(token)).recoveryCodes);
            } catch {
              setErr('That code didn’t match. Try again.');
            }
          }}
        >
          <img src={qr} alt="Scan with your authenticator app" width={200} height={200} />
          <p>
            Or enter this key manually: <code>{secret}</code>
          </p>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            inputMode="numeric"
            placeholder="123456"
          />
          <button type="submit">Confirm</button>
          {err && <p role="alert">{err}</p>}
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `/login/mfa` step-up prompt**

```tsx
// app/(auth)/login/mfa/page.tsx
import MfaPrompt from '@/components/MfaPrompt';
export default function LoginMfaPage() {
  return (
    <main className="main">
      <h1>Two-factor</h1>
      <MfaPrompt />
    </main>
  );
}
```

```tsx
// components/MfaPrompt.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyMfaStepUp, useRecoveryCode } from '@/lib/actions/auth';

export default function MfaPrompt() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr('');
        const r = recovery ? await useRecoveryCode(token) : await verifyMfaStepUp(token);
        if (r.ok) router.push('/calendar');
        else setErr('That code didn’t match.');
      }}
    >
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={recovery ? 'recovery code' : '123456'}
      />
      <button type="submit">Verify</button>
      <button type="button" onClick={() => setRecovery((v) => !v)}>
        {recovery ? 'Use authenticator code' : 'Use a recovery code'}
      </button>
      {err && <p role="alert">{err}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. (If `lint` flags the `<img>` rule, it's an authenticator QR data-URL — add an inline eslint-disable with a one-line reason, matching how the repo handles intentional exceptions.)

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/security app/\(auth\)/login/mfa components/MfaEnroll.tsx components/MfaPrompt.tsx
git commit -m "feat(mfa): enrollment (/security) + step-up (/login/mfa) pages"
```

---

## Task 10: Plan-close — full gate + branch state

- [ ] **Step 1: Run every gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green. New tests: `superadmin` (4), `superadmin.io` (3), `crypto` (3), `mfa` (6), `aal` (2), `audit` (1), `mfa actions` (3), `stepup` (2) = 24 new, plus the original 35.

- [ ] **Step 2: Confirm no secret was committed**

Run: `git log --oneline feat/superadmin-console ^main && rg -n "MFA_ENCRYPTION_KEY|SESSION_SECRET" -g'!*.md' -g'!cloudflare-env.d.ts' lib app || true`
Expected: only env-read references (no literal key values).

> **Do NOT deploy or apply the remote migration here.** Prod schema apply, the `MFA_ENCRYPTION_KEY` secret, the `ed` elevation, and `wrangler deploy` all happen in Plan 2 §F, gated behind Ed's E2E sign-off (CLAUDE.md).

---

## Self-review (author checklist — done)

- **Spec coverage:** §3 tables → Task 1; §5 `requireSuperadmin`/`aal` → Tasks 2–3; AES-GCM secret-at-rest → Task 4; TOTP + recovery → Task 5; audit infra → Task 6; enroll/confirm → Task 7; login step-up + recovery → Task 8; pages → Task 9. Console modules, admin actions, stats, bootstrap/deploy → **Plan 2** (intentional).
- **Placeholders:** none — every code/test step carries real code and an exact run command.
- **Name/type consistency:** `assertSuperadmin`/`isPlatformAdmin`/`requireSuperadmin`/`nextAalAfterPassword`/`SUPERADMIN_EMAIL` (superadmin.ts); `aesEncrypt`/`aesDecrypt`/`encryptSecret`/`decryptSecret` (crypto.ts); `newTotpSecret`/`totpAuthUri`/`verifyTotp`/`newRecoveryCodes`/`hashRecoveryCode`/`verifyRecoveryCode` (mfa.ts); `getMfaCredential`/`upsertMfaCredential`/`confirmMfaCredential`/`replaceRecoveryCodes`/`consumeRecoveryCode` (mfa-queries.ts); `startMfaEnrollment`/`confirmMfaEnrollment` (actions/mfa.ts); `verifyMfaStepUp`/`useRecoveryCode` (actions/auth.ts); `buildAuditRow`/`writeAudit` (db/audit.ts) — all referenced consistently.
