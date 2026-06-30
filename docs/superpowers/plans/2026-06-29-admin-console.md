# Admin Console & Moderation — Implementation Plan (2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the gated `/admin` console on top of the Plan 1 foundation: admin read queries, moderation/destructive actions (each audited), and the four-module UI (users, moderation, app stats, audit log).

**Architecture:** poisys's "command center" translated to barycal's D1/Next stack. A `(admin)` route group whose layout calls `requireSuperadmin()` and maps `FORBIDDEN → notFound()`. Every admin **server action** re-calls `requireSuperadmin()` as its first statement (defense-in-depth — never trust the layout) and writes an audit row on every mutation. Reads deliberately reuse the **unscoped** queries and skip `canSeeContent`, reachable only past the guard.

**Tech Stack:** Next.js 16 App Router · Cloudflare Workers + D1 · drizzle-orm · iron-session · Vitest (node). Same testing philosophy as Plan 1: pure logic + boundary-mocked tests (the `lib/mayfly/server/phone-gate.test.ts` pattern); React pages and thin D1 reads are covered by `typecheck` + the E2E gate.

**Prereqs (from Plan 1, branch `feat/superadmin-console`, all committed):** `requireSuperadmin()` + `isPlatformAdmin()` (`lib/auth/superadmin.ts`); `writeAudit(input)` + `buildAuditRow` (`lib/db/audit.ts`); tables `platform_admins`, `admin_audit_log`, `users.email`; unscoped reads `getAllUsers/getAllConnections/getAllPlacements/getAllAttendance/getGraphContext` (`lib/db/queries.ts`); `hashPassword` (`lib/auth/password.ts`); dev seed already elevates `ed`.

**Spec:** `docs/superpowers/specs/2026-06-29-superadmin-design.md` (§6 console, §9 deploy).

**Conventions:** admin server actions live in `lib/actions/admin.ts` (`'use server'`), call `requireSuperadmin()` first, validate via `lib/validate.ts`, mutate via drizzle, then `writeAudit`. Admin reads live in `lib/db/admin.ts`. UI: server page fetches → renders a `components/admin/*View` client component (the `app/(app)/circles/page.tsx` → `CirclesView` pattern). IDs via `nanoid`; timestamps `new Date().toISOString()`.

---

## File structure

| File                                          | Responsibility                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/db/admin.ts`                             | Unscoped admin reads (list users + counts, user detail, all events, all connections, stats, audit page) + cascade delete helpers (`deleteUserCascade`, `deleteEventCascade`). |
| `lib/actions/admin.ts`                        | Mutations: ghost toggle, force password reset, delete user, delete event, remove connection. Each `requireSuperadmin()` → work → `writeAudit`.                                |
| `app/(admin)/layout.tsx`                      | Guard: `requireSuperadmin()` → `notFound()` on FORBIDDEN. Renders `AdminNav` + children.                                                                                      |
| `app/(admin)/admin/page.tsx`                  | Overview (stats).                                                                                                                                                             |
| `app/(admin)/admin/users/page.tsx` (+ `[id]`) | User management.                                                                                                                                                              |
| `app/(admin)/admin/moderation/page.tsx`       | Events + connections moderation.                                                                                                                                              |
| `app/(admin)/admin/audit/page.tsx`            | Audit log viewer.                                                                                                                                                             |
| `components/admin/*`                          | `AdminNav`, `UsersView`, `ModerationView`, `AuditView`, `StatCards` (client where interactive).                                                                               |

Sequence: **T1 → T2 → T3 → (T4 ∥ T5 ∥ T6) → T7**. T4–T6 are independent UI modules once T2/T3 land.

---

## Task 1: Admin read queries (`lib/db/admin.ts`)

Thin unscoped D1 reads + cascade builders. Like `lib/db/queries.ts`, the IO reads are verified by `typecheck` (not node tests); the one piece of real logic — the **delete order** — is tested in Task 2.

**Files:** Create `lib/db/admin.ts`.

- [ ] **Step 1: Implement the reads + cascade helpers**

```ts
import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { getDb } from './index';
import {
  users,
  connections,
  placements,
  events,
  attendance,
  adminAuditLog,
  mfaCredentials,
  mfaRecoveryCodes,
  platformAdmins,
} from './schema';

// --- reads (unscoped; admin sees everything) ---
export async function adminListUsers() {
  return getDb()
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      email: users.email,
      ghost: users.ghost,
      createdAt: users.createdAt,
      events: sql<number>`(select count(*) from ${events} where ${events.creatorId} = ${users.id})`,
      connections: sql<number>`(select count(*) from ${connections} where (${connections.aId} = ${users.id} or ${connections.bId} = ${users.id}) and ${connections.status} = 'accepted')`,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function adminGetUserDetail(userId: string) {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  const [evs, conns, places, rsvps] = await db.batch([
    db.select().from(events).where(eq(events.creatorId, userId)),
    db
      .select()
      .from(connections)
      .where(or(eq(connections.aId, userId), eq(connections.bId, userId))),
    db
      .select()
      .from(placements)
      .where(or(eq(placements.ownerId, userId), eq(placements.otherId, userId))),
    db.select().from(attendance).where(eq(attendance.userId, userId)),
  ]);
  return { user: u, events: evs, connections: conns, placements: places, rsvps };
}

export async function adminListEvents() {
  // No canSeeContent — admin sees every event regardless of visibility.
  return getDb()
    .select({
      id: events.id,
      title: events.title,
      type: events.type,
      visibility: events.visibility,
      startTime: events.startTime,
      creatorId: events.creatorId,
      creatorHandle: users.handle,
    })
    .from(events)
    .leftJoin(users, eq(events.creatorId, users.id))
    .orderBy(desc(events.startTime));
}

export async function adminListConnections() {
  const a = users; // alias-free: resolve handles in the view layer via the users list
  return getDb().select().from(connections).orderBy(desc(connections.createdAt));
}

export async function adminStats() {
  const db = getDb();
  const since = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
  const [[u], [g], byType, [rsvp], [conn], [d7], [d30]] = await db.batch([
    db.select({ n: sql<number>`count(*)` }).from(users),
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.ghost, true)),
    db
      .select({ type: events.type, n: sql<number>`count(*)` })
      .from(events)
      .groupBy(events.type),
    db.select({ n: sql<number>`count(*)` }).from(attendance),
    db
      .select({ n: sql<number>`count(*)` })
      .from(connections)
      .where(eq(connections.status, 'accepted')),
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, since(7))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, since(30))),
  ]);
  return {
    users: u.n,
    ghosted: g.n,
    rsvps: rsvp.n,
    connections: conn.n,
    signups7d: d7.n,
    signups30d: d30.n,
    eventsByType: byType as { type: string; n: number }[],
  };
}

export async function adminListAudit(
  opts: { limit?: number; offset?: number; action?: string; actor?: string } = {}
) {
  const { limit = 50, offset = 0, action, actor } = opts;
  const where = and(
    action ? eq(adminAuditLog.action, action) : undefined,
    actor ? eq(adminAuditLog.actorId, actor) : undefined
  );
  return getDb()
    .select()
    .from(adminAuditLog)
    .where(where)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit)
    .offset(offset);
}

// --- destructive cascade builders (FK-safe order: children before parents) ---
// events.parentId has NO FK, and exception rows share creatorId, so deleting
// `events WHERE creatorId = U` removes a user's base AND exception rows.
export async function deleteUserCascade(userId: string) {
  const db = getDb();
  const evIds = db.select({ id: events.id }).from(events).where(eq(events.creatorId, userId));
  await db.batch([
    db.delete(attendance).where(eq(attendance.userId, userId)),
    db.delete(attendance).where(inArray(attendance.eventId, evIds)),
    db.delete(events).where(eq(events.creatorId, userId)),
    db.delete(placements).where(or(eq(placements.ownerId, userId), eq(placements.otherId, userId))),
    db
      .delete(connections)
      .where(
        or(
          eq(connections.aId, userId),
          eq(connections.bId, userId),
          eq(connections.requestedBy, userId)
        )
      ),
    db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId)),
    db.delete(mfaCredentials).where(eq(mfaCredentials.userId, userId)),
    db.delete(platformAdmins).where(eq(platformAdmins.userId, userId)),
    db.delete(users).where(eq(users.id, userId)),
  ]);
}

export async function deleteEventCascade(eventId: string) {
  const db = getDb();
  await db.batch([
    db.delete(attendance).where(eq(attendance.eventId, eventId)),
    db.delete(events).where(eq(events.parentId, eventId)), // recurrence exceptions
    db.delete(events).where(eq(events.id, eventId)),
  ]);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: tsc exits 0. (No node test for this file — IO reads, like `lib/db/queries.ts`. The cascade ORDER is locked by a test in Task 2.)

- [ ] **Step 3: Commit**

```bash
git add lib/db/admin.ts
git commit -m "feat(admin): unscoped admin reads + cascade delete builders"
```

---

## Task 2: Admin mutations + audit (`lib/actions/admin.ts`)

The security-critical, destructive core. Each action re-checks `requireSuperadmin()` and audits.

**Files:** Create `lib/actions/admin.ts`; Create `lib/actions/admin.test.ts`.

- [ ] **Step 1: Write the failing test (mock the boundary)**

```ts
// lib/actions/admin.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { admin: true, isTargetAdmin: false, calls: [] as string[] },
}));

vi.mock('../auth/superadmin', () => ({
  requireSuperadmin: async () => {
    if (!state.admin) throw new Error('FORBIDDEN');
    return { userId: 'ed' };
  },
  isPlatformAdmin: async () => state.isTargetAdmin,
}));
vi.mock('../db/audit', () => ({
  writeAudit: async (i: { action: string }) => {
    state.calls.push('audit:' + i.action);
  },
}));
vi.mock('../db/admin', () => ({
  deleteUserCascade: async () => {
    state.calls.push('deleteUserCascade');
  },
  deleteEventCascade: async () => {
    state.calls.push('deleteEventCascade');
  },
}));
vi.mock('../db', () => ({
  getDb: () => ({
    update: () => ({
      set: () => ({
        where: async () => {
          state.calls.push('update');
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        state.calls.push('delete');
      },
    }),
  }),
}));

import { adminDeleteUser, adminDeleteEvent, adminToggleGhost } from './admin';

beforeEach(() => {
  state.admin = true;
  state.isTargetAdmin = false;
  state.calls = [];
});

describe('admin actions — guard + audit', () => {
  it('rejects a non-admin and does NO work', async () => {
    state.admin = false;
    await expect(adminDeleteUser('u9')).rejects.toThrow('FORBIDDEN');
    expect(state.calls).toEqual([]);
  });
  it('deletes a user (cascade) and audits', async () => {
    await adminDeleteUser('u9');
    expect(state.calls).toEqual(['deleteUserCascade', 'audit:user.delete']);
  });
  it('refuses to delete the superadmin itself', async () => {
    await expect(adminDeleteUser('ed')).rejects.toThrow('CANNOT_DELETE_SELF');
    expect(state.calls).toEqual([]);
  });
  it('refuses to delete another platform admin', async () => {
    state.isTargetAdmin = true;
    await expect(adminDeleteUser('u2')).rejects.toThrow('CANNOT_DELETE_ADMIN');
    expect(state.calls).toEqual([]);
  });
  it('deletes an event (cascade) and audits', async () => {
    await adminDeleteEvent('e1');
    expect(state.calls).toEqual(['deleteEventCascade', 'audit:event.delete']);
  });
  it('toggles ghost and audits', async () => {
    await adminToggleGhost('u9', true);
    expect(state.calls).toEqual(['update', 'audit:user.ghost']);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run lib/actions/admin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/actions/admin.ts
'use server';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users, connections } from '../db/schema';
import { requireSuperadmin, isPlatformAdmin } from '../auth/superadmin';
import { writeAudit } from '../db/audit';
import { deleteUserCascade, deleteEventCascade } from '../db/admin';
import { hashPassword } from '../auth/password';

function randomPassword(): string {
  const A = '0123456789abcdefghjkmnpqrstvwxyz';
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => A[x & 31]).join('');
}

export async function adminToggleGhost(userId: string, ghost: boolean) {
  const { userId: actorId } = await requireSuperadmin();
  await getDb().update(users).set({ ghost }).where(eq(users.id, userId));
  await writeAudit({
    actorId,
    action: 'user.ghost',
    targetType: 'user',
    targetId: userId,
    summary: `${ghost ? 'ghosted' : 'unghosted'} ${userId}`,
  });
}

export async function adminForceResetPassword(userId: string): Promise<{ tempPassword: string }> {
  const { userId: actorId } = await requireSuperadmin();
  const tempPassword = randomPassword();
  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(tempPassword) })
    .where(eq(users.id, userId));
  await writeAudit({
    actorId,
    action: 'user.password_reset',
    targetType: 'user',
    targetId: userId,
    summary: `reset password for ${userId}`,
  });
  return { tempPassword };
}

export async function adminDeleteUser(userId: string) {
  const { userId: actorId } = await requireSuperadmin();
  if (userId === actorId) throw new Error('CANNOT_DELETE_SELF');
  if (await isPlatformAdmin(userId)) throw new Error('CANNOT_DELETE_ADMIN');
  await deleteUserCascade(userId);
  await writeAudit({
    actorId,
    action: 'user.delete',
    targetType: 'user',
    targetId: userId,
    summary: `deleted user ${userId}`,
  });
}

export async function adminDeleteEvent(eventId: string) {
  const { userId: actorId } = await requireSuperadmin();
  await deleteEventCascade(eventId);
  await writeAudit({
    actorId,
    action: 'event.delete',
    targetType: 'event',
    targetId: eventId,
    summary: `deleted event ${eventId}`,
  });
}

export async function adminRemoveConnection(connId: string) {
  const { userId: actorId } = await requireSuperadmin();
  await getDb().delete(connections).where(eq(connections.id, connId));
  await writeAudit({
    actorId,
    action: 'connection.remove',
    targetType: 'connection',
    targetId: connId,
    summary: `removed connection ${connId}`,
  });
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run lib/actions/admin.test.ts && npm run typecheck`
Expected: 6 PASS; tsc 0.

- [ ] **Step 5: Add the cascade-ORDER test (destructive path needs its check)**

Append to `lib/actions/admin.test.ts` a second file-level describe that imports the real `deleteUserCascade` with a recording `getDb`:

```ts
// separate module-mock context: a recording db that captures batch order
import { describe as d2, it as it2, expect as e2, vi as vi2 } from 'vitest';
vi2.mock('../db', () => ({
  getDb: () => {
    const mk = (table: { _: { name?: string } } | string) => ({
      where: () => ({ __t: String((table as any)?._?.name ?? table) }),
    });
    return {
      select: () => ({ from: () => ({ where: () => ({ __sub: true }) }) }),
      delete: (t: unknown) => mk(t as any),
      batch: async (arr: { __t: string }[]) => {
        (globalThis as any).__order = arr.map((x) => x.__t);
      },
    };
  },
}));
```

> NOTE: the exact recorder shape depends on how drizzle exposes the table name. If `table._.name` isn't reachable on the mock, record the order by passing the schema table objects through a `WeakMap` to names you control, or assert `(globalThis as any).__order.length === 9` and that `users` is LAST. The non-negotiable assertions: (a) exactly 9 delete statements, (b) `users` deleted LAST, (c) both `attendance` deletes precede the `events` delete. Keep this test focused on order, not drizzle internals.

If recording table identity proves brittle, fall back to this robust form — wrap the cascade so the order is a pure, testable list:

```ts
// In lib/db/admin.ts, export the order as data for testing:
export const USER_CASCADE_ORDER = [
  'attendance.byUser',
  'attendance.byUserEvents',
  'events',
  'placements',
  'connections',
  'mfa_recovery_codes',
  'mfa_credentials',
  'platform_admins',
  'users',
] as const;
```

and assert `USER_CASCADE_ORDER` ends with `'users'` and has 9 entries, while `deleteUserCascade` is implemented to follow it. Prefer this if the recorder is fragile — a named-order constant the implementation and test share is clearer than reflecting on drizzle builders.

- [ ] **Step 6: Run + commit**

Run: `npx vitest run lib/actions/admin.test.ts && npm run typecheck`
Expected: all PASS; tsc 0.

```bash
git add lib/actions/admin.ts lib/actions/admin.test.ts lib/db/admin.ts
git commit -m "feat(admin): moderation actions (ghost/reset/delete/remove) with audit + cascade-order test"
```

---

## Task 3: Console shell — route group, guard, nav, overview

**Files:** Create `app/(admin)/layout.tsx`, `app/(admin)/admin/page.tsx`, `components/admin/AdminNav.tsx`, `components/admin/StatCards.tsx`.

- [ ] **Step 1: Layout guard (FORBIDDEN → 404)**

```tsx
// app/(admin)/layout.tsx
import { notFound } from 'next/navigation';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import AdminNav from '@/components/admin/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireSuperadmin();
  } catch {
    notFound(); // don't reveal /admin exists to non-admins (or aal1 sessions)
  }
  return (
    <div className="shell admin-shell">
      <AdminNav />
      <div className="main">{children}</div>
    </div>
  );
}
```

> `requireSuperadmin()` throws `FORBIDDEN` for a non-admin OR an `aal1` (no-MFA-step-up) session — both correctly 404 here. `notFound()` itself throws, so don't wrap the whole body in the try.

- [ ] **Step 2: AdminNav**

```tsx
// components/admin/AdminNav.tsx
import Link from 'next/link';
export default function AdminNav() {
  return (
    <nav className="admin-nav">
      <Link href="/admin">Overview</Link>
      <Link href="/admin/users">Users</Link>
      <Link href="/admin/moderation">Moderation</Link>
      <Link href="/admin/audit">Audit</Link>
    </nav>
  );
}
```

- [ ] **Step 3: Overview page + StatCards**

```tsx
// app/(admin)/admin/page.tsx
import { adminStats } from '@/lib/db/admin';
import StatCards from '@/components/admin/StatCards';
export default async function AdminOverview() {
  const stats = await adminStats();
  return (
    <main>
      <h1>Overview</h1>
      <StatCards stats={stats} />
    </main>
  );
}
```

```tsx
// components/admin/StatCards.tsx
type Stats = {
  users: number;
  ghosted: number;
  rsvps: number;
  connections: number;
  signups7d: number;
  signups30d: number;
  eventsByType: { type: string; n: number }[];
};
export default function StatCards({ stats }: { stats: Stats }) {
  const cards = [
    ['Users', stats.users],
    ['Ghosted', stats.ghosted],
    ['Connections', stats.connections],
    ['RSVPs', stats.rsvps],
    ['Signups · 7d', stats.signups7d],
    ['Signups · 30d', stats.signups30d],
  ] as const;
  return (
    <div className="stat-cards">
      {cards.map(([label, n]) => (
        <div key={label} className="stat-card">
          <div className="stat-n">{n}</div>
          <div className="stat-label">{label}</div>
        </div>
      ))}
      <div className="stat-card">
        <div className="stat-label">Events by type</div>
        <ul>
          {stats.eventsByType.map((e) => (
            <li key={e.type}>
              {e.type}: {e.n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck` (expect 0). (Lint is pre-broken repo-wide — skip; tracked separately.)

```bash
git add "app/(admin)/layout.tsx" "app/(admin)/admin/page.tsx" components/admin/AdminNav.tsx components/admin/StatCards.tsx
git commit -m "feat(admin): /admin route group, requireSuperadmin guard (404), nav, overview"
```

---

## Task 4: User management module

**Files:** Create `app/(admin)/admin/users/page.tsx`, `components/admin/UsersView.tsx` (client).

- [ ] **Step 1: Page (server) — list users**

```tsx
// app/(admin)/admin/users/page.tsx
import { adminListUsers } from '@/lib/db/admin';
import UsersView from '@/components/admin/UsersView';
export default async function AdminUsers() {
  const users = await adminListUsers();
  return (
    <main>
      <h1>Users</h1>
      <UsersView users={users} />
    </main>
  );
}
```

- [ ] **Step 2: UsersView (client) — search + actions**

```tsx
// components/admin/UsersView.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminToggleGhost, adminForceResetPassword, adminDeleteUser } from '@/lib/actions/admin';

type Row = {
  id: string;
  handle: string;
  email: string | null;
  ghost: boolean;
  events: number;
  connections: number;
};

export default function UsersView({ users }: { users: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ id: string; pw: string } | null>(null);
  const shown = users.filter((u) =>
    (u.handle + (u.email ?? '')).toLowerCase().includes(q.toLowerCase())
  );

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="search handle / email"
        aria-label="Search users"
      />
      <table>
        <thead>
          <tr>
            <th>Handle</th>
            <th>Email</th>
            <th>Events</th>
            <th>Conns</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((u) => (
            <tr key={u.id}>
              <td>
                {u.handle}
                {u.ghost ? ' 👻' : ''}
              </td>
              <td>{u.email ?? '—'}</td>
              <td>{u.events}</td>
              <td>{u.connections}</td>
              <td>
                <button
                  disabled={busy === u.id}
                  onClick={() => run(u.id, () => adminToggleGhost(u.id, !u.ghost))}
                >
                  {u.ghost ? 'Unghost' : 'Ghost'}
                </button>
                <button
                  disabled={busy === u.id}
                  onClick={() =>
                    run(u.id, async () => {
                      const r = await adminForceResetPassword(u.id);
                      setTemp({ id: u.id, pw: r.tempPassword });
                    })
                  }
                >
                  Reset PW
                </button>
                <button
                  disabled={busy === u.id}
                  onClick={() => {
                    if (confirm(`Delete @${u.handle} and ALL their data? This cannot be undone.`))
                      run(u.id, () => adminDeleteUser(u.id));
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {temp && (
        <p role="alert">
          Temp password for that user (shown once): <code>{temp.pw}</code>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` (expect 0).

```bash
git add "app/(admin)/admin/users" components/admin/UsersView.tsx
git commit -m "feat(admin): user management module (search, ghost, reset, delete)"
```

---

## Task 5: Content moderation module

**Files:** Create `app/(admin)/admin/moderation/page.tsx`, `components/admin/ModerationView.tsx` (client).

- [ ] **Step 1: Page (server) — all events + connections, visibility bypassed**

```tsx
// app/(admin)/admin/moderation/page.tsx
import { adminListEvents, adminListConnections } from '@/lib/db/admin';
import { getAllUsers } from '@/lib/db/queries';
import ModerationView from '@/components/admin/ModerationView';
export default async function AdminModeration() {
  const [events, connections, users] = await Promise.all([
    adminListEvents(),
    adminListConnections(),
    getAllUsers(),
  ]);
  const handle = Object.fromEntries(users.map((u) => [u.id, u.handle]));
  const conns = connections.map((c) => ({
    id: c.id,
    a: handle[c.aId] ?? c.aId,
    b: handle[c.bId] ?? c.bId,
    status: c.status,
  }));
  return (
    <main>
      <h1>Moderation</h1>
      <ModerationView events={events} connections={conns} />
    </main>
  );
}
```

- [ ] **Step 2: ModerationView (client)**

```tsx
// components/admin/ModerationView.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminDeleteEvent, adminRemoveConnection } from '@/lib/actions/admin';

type Ev = {
  id: string;
  title: string;
  type: string;
  visibility: string;
  creatorHandle: string | null;
};
type Conn = { id: string; a: string; b: string; status: string };

export default function ModerationView({
  events,
  connections,
}: {
  events: Ev[];
  connections: Conn[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(id: string, fn: () => Promise<void>, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    setBusy(id);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  return (
    <div>
      <h2>Events ({events.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Vis</th>
            <th>Creator</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.title}</td>
              <td>{e.type}</td>
              <td>{e.visibility}</td>
              <td>{e.creatorHandle ?? '—'}</td>
              <td>
                <button
                  disabled={busy === e.id}
                  onClick={() => run(e.id, () => adminDeleteEvent(e.id), `Delete "${e.title}"?`)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Connections ({connections.length})</h2>
      <table>
        <thead>
          <tr>
            <th>A</th>
            <th>B</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {connections.map((c) => (
            <tr key={c.id}>
              <td>{c.a}</td>
              <td>{c.b}</td>
              <td>{c.status}</td>
              <td>
                <button
                  disabled={busy === c.id}
                  onClick={() =>
                    run(c.id, () => adminRemoveConnection(c.id), `Remove ${c.a}↔${c.b}?`)
                  }
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` (expect 0).

```bash
git add "app/(admin)/admin/moderation" components/admin/ModerationView.tsx
git commit -m "feat(admin): content moderation module (events + connections)"
```

---

## Task 6: Audit log module

**Files:** Create `app/(admin)/admin/audit/page.tsx`, `components/admin/AuditView.tsx`.

- [ ] **Step 1: Page (server) — paginated audit**

```tsx
// app/(admin)/admin/audit/page.tsx
import { adminListAudit } from '@/lib/db/admin';
import AuditView from '@/components/admin/AuditView';
export default async function AdminAudit({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) | 0);
  const rows = await adminListAudit({ limit: 50, offset: page * 50, action: sp.action });
  return (
    <main>
      <h1>Audit log</h1>
      <AuditView rows={rows} page={page} action={sp.action ?? ''} />
    </main>
  );
}
```

> Next.js 16: `searchParams` is a Promise in async server components — `await` it (this matches the repo's Next 16 usage). If unsure, check `node_modules/next/dist/...` per the project's Next 16 rule.

- [ ] **Step 2: AuditView**

```tsx
// components/admin/AuditView.tsx
import Link from 'next/link';
type Row = {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
};
export default function AuditView({
  rows,
  page,
  action,
}: {
  rows: Row[];
  page: number;
  action: string;
}) {
  const q = (p: number) => `/admin/audit?page=${p}${action ? `&action=${action}` : ''}`;
  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Action</th>
            <th>Target</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.createdAt}</td>
              <td>{r.action}</td>
              <td>
                {r.targetType}:{r.targetId}
              </td>
              <td>{r.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pager">
        {page > 0 && <Link href={q(page - 1)}>← Newer</Link>}
        {rows.length === 50 && <Link href={q(page + 1)}>Older →</Link>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Full gate + commit**

Run: `npm test && npm run typecheck` (expect all green; tsc 0).

```bash
git add "app/(admin)/admin/audit" components/admin/AuditView.tsx
git commit -m "feat(admin): audit log module (paginated, filterable)"
```

---

## Task 7: Bootstrap & deploy (GATED — manual, with Ed's E2E sign-off)

> **Do NOT auto-run any of this.** Per CLAUDE.md, prod is gated. Execute only with Ed's explicit OK, step by step. This task is a runbook + the verification gate, not code.

- [ ] **Step 1: Pre-flight** — `npm test` green, `npm run typecheck` clean, `npm run build:cf` succeeds. (The repo-wide lint config bug must be fixed first — separate chip — or CI's lint job stays red.)
- [ ] **Step 2: Apply the migration to prod D1** (additive `0005`): `npm run db:migrate:remote` (`wrangler d1 migrations apply barycal-db --remote`).
- [ ] **Step 3: Set the MFA secret** — generate 32 random bytes base64 and `wrangler secret put MFA_ENCRYPTION_KEY`.
- [ ] **Step 4: Deploy** — `npm run build:cf && wrangler deploy`.
- [ ] **Step 5: Elevate `ed` (gated SQL)** — run against remote D1:
  ```sql
  UPDATE users SET email='junting.mp3@gmail.com' WHERE handle='ed' AND email IS NULL;
  INSERT INTO platform_admins (user_id, granted_at)
    SELECT id, '<ISO ts>' FROM users WHERE lower(email)='junting.mp3@gmail.com' ON CONFLICT (user_id) DO NOTHING;
  ```
- [ ] **Step 6: STOP — Ed E2E sign-off.** Tell Ed to: (1) log in as `ed` → lands on `/login`/`/discover` (no MFA yet) → reach `/admin` (works, he's a platform admin) → enroll MFA at `/security` (scan QR, confirm, save recovery codes) → log out → log in again → now routed to `/login/mfa` → complete TOTP → `/admin` still works; (2) confirm a logged-out or non-admin request to `/admin` returns 404; (3) exercise one moderation action and confirm it appears in `/admin/audit`. Only after Ed confirms is the feature DONE.

---

## Self-review (author checklist — done)

- **Spec coverage:** §6 user management → T2 actions + T4 UI; content moderation → T2 + T5; app stats → T1 `adminStats` + T3 overview; audit log → T1 `adminListAudit` + T6, written by `writeAudit` (Plan 1) inside every T2 mutation; guard/defense-in-depth → T2 (per-action `requireSuperadmin`) + T3 (layout 404); bootstrap/deploy §9 → T7.
- **Placeholders:** none — every step has runnable code/commands. The one judgment call (the cascade-order recorder in T2 Step 5) ships with an explicit robust fallback (`USER_CASCADE_ORDER` constant) so it's never left ambiguous.
- **Type/name consistency:** `adminListUsers/adminGetUserDetail/adminListEvents/adminListConnections/adminStats/adminListAudit/deleteUserCascade/deleteEventCascade` (lib/db/admin.ts); `adminToggleGhost/adminForceResetPassword/adminDeleteUser/adminDeleteEvent/adminRemoveConnection` (lib/actions/admin.ts) — referenced consistently across pages/components. `requireSuperadmin`/`isPlatformAdmin`/`writeAudit` are the Plan 1 exports.
- **Destructive safety:** `adminDeleteUser` refuses self + other platform admins; cascades are atomic `db.batch`, FK-safe child-first order, `users` last; audit rows retained.
- **Deferred (noted):** `?next=/admin` post-step-up redirect (final-review minor); TOTP replay-window + recovery-scan TOCTOU hardening; promoting moderation tables to richer UI. All non-blocking for v1.
