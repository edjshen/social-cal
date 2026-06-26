# Orbit React PWA Re-platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-platform Orbit from a vanilla-JS/Express app to a Next.js 16 + React 19 + TypeScript PWA on Cloudflare (Workers/OpenNext + D1 + Drizzle + iron-session), at feature parity with today's app and faithful to `docs/mocks/`, so the React-based Mayfly feature can be ported in cleanly in Phase 2.

**Architecture:** App Router with Server Components for reads (calling a Drizzle/D1 data layer + pure domain functions) and Server Actions + `useOptimistic` for mutations. Auth via iron-session (encrypted cookie, scrypt hashing). The bespoke dark-editorial UI is rebuilt as React components reusing the existing `orbit.css` near-verbatim. Deployed to Cloudflare Workers via OpenNext; installable PWA via Serwist.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@opennextjs/cloudflare`, Wrangler, Cloudflare D1, `drizzle-orm` + `drizzle-kit`, `iron-session`, `@noble/hashes` (scrypt), `@serwist/next`, `motion` (lazy), `@base-ui-components/react`, Vitest.

**Source reference:** the current app under `server/` and `public/` is the functional spec. Key files to port: `server/index.js` (API + visibility logic), `server/domain.js` (helpers), `server/seed.js` (demo graph), `public/orbit.css` (design system — port near-verbatim), `public/app.js` (each `renderX()` is a component blueprint), `public/view.js` (account-free pages). Design spec: `docs/superpowers/specs/2026-06-25-orbit-react-pwa-replatform-design.md`.

---

## File Structure

```
app/
  layout.tsx                 # root layout, <html>, globals.css, viewport/manifest meta
  globals.css                # ported from public/orbit.css (tokens + all component classes)
  page.tsx                   # redirect → /discover (or /login if unauthed)
  manifest.ts                # PWA manifest (Next metadata route)
  sw.ts                      # Serwist service worker
  (auth)/
    layout.tsx               # centered auth shell
    login/page.tsx           # login form (client) + login server action
    register/page.tsx        # register form (client) + register server action
  (app)/
    layout.tsx               # authed shell: <Shell> + <TabBar>, getSession guard
    discover/page.tsx        # RSC: Discover / Week / Month (segmented)
    plans/page.tsx           # RSC
    regulars/page.tsx        # RSC
    you/page.tsx             # RSC (own profile)
    circles/page.tsx         # RSC
  u/[handle]/page.tsx        # account-free profile (RSC + generateMetadata)
  e/[id]/page.tsx            # account-free event (RSC + generateMetadata)
components/
  primitives/ Avatar.tsx AvatarStack.tsx Pill.tsx Icon.tsx Segmented.tsx Sheet.tsx
  EventCard.tsx WeekGrid.tsx MonthGrid.tsx TabBar.tsx CreateButton.tsx CreateSheet.tsx
  RsvpButtons.tsx ProfileView.tsx CirclesView.tsx RegularsView.tsx
lib/
  db/ schema.ts index.ts queries.ts
  auth/ password.ts session.ts
  domain/ types.ts helpers.ts visibility.ts enrich.ts regulars.ts dates.ts
  actions/ auth.ts events.ts connections.ts profile.ts
drizzle/                     # generated migrations + seed.sql
scripts/ gen-seed.ts
middleware.ts                # redirect unauthed (app) routes → /login
next.config.ts · open-next.config.ts · wrangler.jsonc · drizzle.config.ts · tsconfig.json · vitest.config.ts
public/ icon.svg (kept) + icon-192/512.png
```

**Decomposition note:** This is one coherent deliverable (the re-platformed app) built in 7 milestones (M0–M6). Each milestone ends green and, from M3 on, runnable. Mayfly (Phase 2) is a separate spec/plan.

---

## Milestone M0 — Scaffold & deploy skeleton

### Task 0.1: Remove the old app, scaffold Next.js + TypeScript

**Files:**
- Delete: `server/`, `public/app.js`, `public/view.js`, `public/index.html`, `public/view.html`, `public/sw.js`, `public/manifest.webmanifest`, `prisma/`, `data/`
- Keep: `public/icon.svg`, `docs/`, `.git`, `.gitignore`, `README.md`
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Remove old source (keep docs, mocks, icon)**

```bash
git rm -r server public/app.js public/view.js public/index.html public/view.html public/sw.js public/manifest.webmanifest prisma 2>/dev/null
git rm -r data 2>/dev/null || true
# keep public/icon.svg, docs/, README.md
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "orbit",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "engines": { "node": "22.x" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "build:cf": "opennextjs-cloudflare build",
    "deploy:cf": "opennextjs-cloudflare deploy",
    "preview:cf": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply orbit-db --local",
    "db:migrate:remote": "wrangler d1 migrations apply orbit-db --remote",
    "db:seed:local": "tsx scripts/gen-seed.ts && wrangler d1 execute orbit-db --local --file=drizzle/seed.sql",
    "db:seed:remote": "tsx scripts/gen-seed.ts && wrangler d1 execute orbit-db --remote --file=drizzle/seed.sql"
  },
  "dependencies": {
    "next": "^16.2.9",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "drizzle-orm": "^0.44.0",
    "iron-session": "^8.0.4",
    "@noble/hashes": "^1.6.0",
    "motion": "^12.41.0",
    "@base-ui-components/react": "1.0.0-rc.0"
  },
  "devDependencies": {
    "@opennextjs/cloudflare": "^1.19.9",
    "@serwist/next": "^9.5.11",
    "serwist": "^9.5.11",
    "drizzle-kit": "^0.30.0",
    "@cloudflare/workers-types": "^4.20260601.0",
    "wrangler": "^4.103.0",
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 3: Install**

Run: `npm install`
Expected: completes; `node_modules/` populated.

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "incremental": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Write `next.config.ts`** (View Transitions on; OpenNext dev binding hook)

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { viewTransition: true },
};

export default nextConfig;

// Enable Cloudflare bindings (D1, etc.) during `next dev`.
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
```

- [ ] **Step 6: Write minimal `app/layout.tsx`, `app/page.tsx`, empty `app/globals.css`**

```tsx
// app/layout.tsx
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Orbit',
  description: 'Your social calendar is your profile.',
};
export const viewport: Viewport = {
  themeColor: '#0C0B10',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// app/page.tsx
export default function Home() {
  return <main style={{ padding: 24 }}>Orbit — scaffold OK</main>;
}
```

- [ ] **Step 7: Verify dev server boots**

Run: `npm run dev` then open `http://localhost:3000`
Expected: "Orbit — scaffold OK" renders, no console errors. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 16 + TS app, remove vanilla app"
```

### Task 0.2: Cloudflare deploy config (OpenNext + Wrangler + D1)

**Files:**
- Create: `open-next.config.ts`, `wrangler.jsonc`, `.dev.vars`
- Modify: `.gitignore`

- [ ] **Step 1: Write `open-next.config.ts`**

```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({
  // Incremental cache disabled until an R2 bucket is wired (mirrors plur-nyc).
});
```

- [ ] **Step 2: Create the D1 database**

Run: `npx wrangler d1 create orbit-db`
Expected: prints a `database_id`. Copy it for the next step.

- [ ] **Step 3: Write `wrangler.jsonc`** (replace `<DATABASE_ID>` and `<ACCOUNT_ID>` with real values; account id is the same one in `plur-nyc/wrangler.jsonc`)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "orbit",
  "account_id": "<ACCOUNT_ID>",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-05-28",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "orbit" }],
  "d1_databases": [
    { "binding": "DB", "database_name": "orbit-db", "database_id": "<DATABASE_ID>" }
  ],
  "observability": { "enabled": true }
}
```

- [ ] **Step 3b: Generate Cloudflare env types**

Add script to `package.json` scripts: `"cf-typegen": "wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts"`, then run `npm run cf-typegen`.
Expected: `cloudflare-env.d.ts` created with a `CloudflareEnv` interface exposing `DB: D1Database`.

- [ ] **Step 4: Add local secrets to `.dev.vars` and gitignore it**

```
# .dev.vars
SESSION_SECRET=dev-only-secret-at-least-32-characters-long-change-me
```

Append to `.gitignore`:
```
.dev.vars
.open-next/
.wrangler/
drizzle/seed.sql
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add OpenNext + Wrangler + D1 config"
```

---

## Milestone M1 — Data layer (D1 + Drizzle)

### Task 1.1: Drizzle schema

**Files:**
- Create: `lib/db/schema.ts`, `drizzle.config.ts`

- [ ] **Step 1: Write `lib/db/schema.ts`** (mirrors the 5 JSON collections in `server/db.js`)

```ts
import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  bio: text('bio').notNull().default(''),
  scenes: text('scenes', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  avatar: text('avatar').notNull(),
  shareId: text('share_id').notNull().unique(),
  ghost: integer('ghost', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const connections = sqliteTable('connections', {
  id: text('id').primaryKey(),
  aId: text('a_id').notNull().references(() => users.id),
  bId: text('b_id').notNull().references(() => users.id),
  status: text('status', { enum: ['pending', 'accepted'] }).notNull(),
  requestedBy: text('requested_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (t) => ({ pair: index('conn_pair').on(t.aId, t.bId) }));

export const placements = sqliteTable('placements', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  otherId: text('other_id').notNull().references(() => users.id),
  tier: text('tier', { enum: ['inner', 'orbit'] }).notNull(),
}, (t) => ({ uniq: unique('place_owner_other').on(t.ownerId, t.otherId) }));

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  creatorId: text('creator_id').notNull().references(() => users.id),
  type: text('type', { enum: ['intention', 'plan', 'event', 'scene'] }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  location: text('location').notNull().default(''),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  recurring: text('recurring', { enum: ['weekly'] }),
  visibility: text('visibility', { enum: ['inner', 'orbit', 'public'] }).notNull(),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
}, (t) => ({ byStart: index('events_start').on(t.startTime), byCreator: index('events_creator').on(t.creatorId) }));

export const attendance = sqliteTable('attendance', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id),
  userId: text('user_id').notNull().references(() => users.id),
  rsvp: text('rsvp', { enum: ['going', 'down', 'maybe', 'cant'] }).notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({ byEvent: index('attend_event').on(t.eventId) }));

export type User = typeof users.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type Placement = typeof placements.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
```

- [ ] **Step 2: Write `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './lib/db/schema.ts',
  out: './drizzle',
});
```

- [ ] **Step 3: Generate the initial migration**

Run: `npm run db:generate`
Expected: a `drizzle/0000_*.sql` migration file is created with all 5 `CREATE TABLE` statements.

- [ ] **Step 4: Apply to local D1**

Run: `npm run db:migrate:local`
Expected: "migrations applied" against the local `.wrangler` D1.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Drizzle schema + initial D1 migration"
```

### Task 1.2: DB client + seed

**Files:**
- Create: `lib/db/index.ts`, `scripts/gen-seed.ts`

- [ ] **Step 1: Write `lib/db/index.ts`** (Drizzle bound to the D1 binding via OpenNext context)

```ts
import { drizzle } from 'drizzle-orm/d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import * as schema from './schema';

export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}
export { schema };
```

- [ ] **Step 2: Write `scripts/gen-seed.ts`** (ports `server/seed.js`; emits `drizzle/seed.sql`; all demo users share password `orbit`, hashed with the same scrypt routine as the app — imports from `lib/auth/password.ts`, created in M3; until then this script will be completed in Task 3.1 Step 6). For now, write the row-building + SQL-emit scaffold:

```ts
import { writeFileSync } from 'node:fs';
import { hashPassword } from '../lib/auth/password';

const now = new Date();
const at = (days: number, h: number, m = 0) => {
  const x = new Date(now); x.setDate(x.getDate() + days); x.setHours(h, m, 0, 0);
  return x.toISOString();
};
const PALETTE = [['#FF8A5B','#FF5E87'],['#5FD3A6','#3FA7C2'],['#9B8CFF','#6C7BFF'],['#FFC178','#FF8A5B'],['#FF5E87','#9B8CFF'],['#5FD3A6','#6C7BFF'],['#FFC178','#FF5E87'],['#9B8CFF','#FF5E87']];
const hashStr = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h*31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const avatarFor = (seed: string) => PALETTE[hashStr(seed) % PALETTE.length].join(',');
const id = () => crypto.randomUUID();
const q = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);

async function main() {
  const pw = await hashPassword('orbit');
  const lines: string[] = ['DELETE FROM attendance;','DELETE FROM events;','DELETE FROM placements;','DELETE FROM connections;','DELETE FROM users;'];
  const U: Record<string, string> = {};
  const user = (handle: string, name: string, bio = '', scenes: string[] = []) => {
    const uid = id(); U[handle] = uid;
    lines.push(`INSERT INTO users (id,handle,display_name,password_hash,bio,scenes,avatar,share_id,ghost,created_at) VALUES (${q(uid)},${q(handle)},${q(name)},${q(pw)},${q(bio)},${q(JSON.stringify(scenes))},${q(avatarFor(handle))},${q(handle)},0,${q(now.toISOString())});`);
  };
  user('ed','Ed Shen','techno, climbing, natural wine. always down for lunch.',['Climbing','Techno','Natural wine','PLUR']);
  user('maya','Maya Chen','sunsets, lunch dates, bouldering.',['Climbing','Film']);
  user('dev','Dev Rao','wine, records, late dinners.',['Natural wine','Vinyl']);
  user('nina','Nina Park','run club + climbing gym regular.',['Running','Climbing']);
  user('theo','Theo Lin','always at the warehouse.',['Techno','Nightlife']);
  user('sam','Sam Ortiz','natural wine + pottery.',['Natural wine','Ceramics']);
  user('plur','PLUR.NYC','NYC underground — shows & community.',['Techno','Community']);
  user('jordan','Jordan Reyes','new in town.',[]);

  const conn = (a: string, b: string, status: string, by: string) =>
    lines.push(`INSERT INTO connections (id,a_id,b_id,status,requested_by,created_at) VALUES (${q(id())},${q(U[a])},${q(U[b])},${q(status)},${q(U[by])},${q(now.toISOString())});`);
  for (const h of ['maya','dev','nina','theo','sam','plur']) conn('ed', h, 'accepted', 'ed');
  conn('maya','nina','accepted','maya'); conn('dev','sam','accepted','dev');
  conn('jordan','ed','pending','jordan');

  const place = (o: string, x: string, tier: string) =>
    lines.push(`INSERT INTO placements (id,owner_id,other_id,tier) VALUES (${q(id())},${q(U[o])},${q(U[x])},${q(tier)});`);
  for (const h of ['maya','dev','nina']) place('ed', h, 'inner');
  for (const h of ['theo','sam','plur']) place('ed', h, 'orbit');
  for (const h of ['maya','dev','nina']) place(h, 'ed', 'inner');
  for (const h of ['theo','sam']) place(h, 'ed', 'orbit');
  place('plur','ed','orbit');

  const ev = (creator: string, type: string, title: string, location: string, start: string, end: string | null, visibility: string, recurring: string | null = null, expiresAt: string | null = null) => {
    const eid = id();
    lines.push(`INSERT INTO events (id,creator_id,type,title,description,location,start_time,end_time,recurring,visibility,expires_at,created_at) VALUES (${q(eid)},${q(U[creator])},${q(type)},${q(title)},'',${q(location)},${q(start)},${end===null?'NULL':q(end)},${recurring===null?'NULL':q(recurring)},${q(visibility)},${expiresAt===null?'NULL':q(expiresAt)},${q(now.toISOString())});`);
    lines.push(`INSERT INTO attendance (id,event_id,user_id,rsvp,created_at) VALUES (${q(id())},${q(eid)},${q(U[creator])},'going',${q(now.toISOString())});`);
    return eid;
  };
  const attend = (eid: string, h: string, rsvp: string) =>
    lines.push(`INSERT INTO attendance (id,event_id,user_id,rsvp,created_at) VALUES (${q(id())},${q(eid)},${q(U[h])},${q(rsvp)},${q(now.toISOString())});`);

  const lunch = ev('maya','intention','Lunch — anyone around?','Devoción, Williamsburg', at(0,12,30), at(0,14), 'inner', null, at(0,23,59));
  attend(lunch,'nina','down'); attend(lunch,'theo','down');
  const run = ev('ed','plan','Evening run','Brooklyn Bridge', at(0,18,30), at(0,19,30), 'orbit', 'weekly');
  attend(run,'dev','down'); attend(run,'nina','down'); attend(run,'theo','down');
  const wine = ev('dev','event','Natural wine night','Ruffian, East Village', at(1,20), at(1,23), 'orbit');
  attend(wine,'maya','down'); attend(wine,'nina','down'); attend(wine,'sam','down'); attend(wine,'theo','maybe');
  const runThu = ev('ed','plan','Evening run','Brooklyn Bridge', at(2,18,30), at(2,19,30), 'orbit', 'weekly'); attend(runThu,'dev','down');
  const warehouse = ev('plur','scene','Warehouse: SHØLT','Bushwick', at(3,23), at(4,4), 'public');
  for (const h of ['maya','dev','nina','theo','sam']) attend(warehouse, h, 'down');
  const climb = ev('ed','event','Climbing @ VITAL','Greenpoint', at(4,10), at(4,12), 'inner'); attend(climb,'nina','down'); attend(climb,'maya','down');
  const standing = ev('ed','plan','Standing lunch','rotating spot', at(6,12,30), at(6,14), 'inner', 'weekly'); attend(standing,'maya','down');
  ev('ed','event','Pottery class','Gowanus', at(8,19), at(8,21), 'public');
  const coffee = ev('maya','intention','Coffee + work','Devoción', at(-3,11), at(-3,13), 'inner'); attend(coffee,'ed','going'); attend(coffee,'sam','down');
  const climbPast = ev('nina','event','Climbing session','VITAL', at(-7,10), at(-7,12), 'inner'); attend(climbPast,'ed','going'); attend(climbPast,'maya','down');
  const winePast = ev('dev','event','Wine + records','home', at(-10,20), at(-10,23), 'orbit'); attend(winePast,'ed','going'); attend(winePast,'sam','down');
  const showPast = ev('plur','scene','Show: Nowadays','Ridgewood', at(-14,22), at(-13,3), 'public'); attend(showPast,'ed','going'); attend(showPast,'theo','down');

  writeFileSync('drizzle/seed.sql', lines.join('\n') + '\n');
  console.log(`Wrote drizzle/seed.sql (${lines.length} statements). Demo login → ed / orbit`);
}
main();
```

- [ ] **Step 3: Defer running** — `gen-seed.ts` imports `hashPassword` (built in M3). Seed is run in Task 3.1 Step 6. Commit the scaffold now.

```bash
git add lib/db/index.ts scripts/gen-seed.ts
git commit -m "feat: D1 Drizzle client + seed generator scaffold"
```

---

## Milestone M2 — Domain logic (pure, TDD)

All functions here are **pure** (no DB) so they unit-test with fixtures. The data layer (Task 2.4) fetches rows; these functions compute over them. Ports the logic in `server/index.js:36-145,378-407`.

### Task 2.1: Vitest config + types + helpers

**Files:**
- Create: `vitest.config.ts`, `lib/domain/types.ts`, `lib/domain/helpers.ts`, `lib/domain/dates.ts`
- Test: `lib/domain/helpers.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, environment: 'node' } });
```

- [ ] **Step 2: Write `lib/domain/types.ts`**

```ts
export type EventType = 'intention' | 'plan' | 'event' | 'scene';
export type Visibility = 'inner' | 'orbit' | 'public';
export type Rsvp = 'going' | 'down' | 'maybe' | 'cant';
export type Tier = 'inner' | 'orbit';
export const ATTEND: Rsvp[] = ['going', 'down', 'maybe'];
export const EVENT_TYPES: EventType[] = ['intention', 'plan', 'event', 'scene'];

export interface PublicUser { id: string; handle: string; displayName: string; avatar: string; initials: string; }
```

- [ ] **Step 3: Write the failing test `lib/domain/helpers.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { initials, avatarFor, publicUser } from './helpers';

describe('helpers', () => {
  it('initials: first two words, uppercased', () => {
    expect(initials('Ed Shen')).toBe('ES');
    expect(initials('plur')).toBe('P');
    expect(initials('')).toBe('?');
  });
  it('avatarFor: stable two-color gradient string', () => {
    expect(avatarFor('ed')).toBe(avatarFor('ed'));
    expect(avatarFor('ed').split(',').length).toBe(2);
  });
  it('publicUser: projects safe fields + initials', () => {
    const u = { id: '1', handle: 'ed', displayName: 'Ed Shen', avatar: 'a,b', passwordHash: 'x' };
    expect(publicUser(u as any)).toEqual({ id: '1', handle: 'ed', displayName: 'Ed Shen', avatar: 'a,b', initials: 'ES' });
  });
});
```

- [ ] **Step 4: Run — expect FAIL**

Run: `npm test`
Expected: FAIL ("Cannot find module './helpers'").

- [ ] **Step 5: Write `lib/domain/helpers.ts`** (ports `server/domain.js`)

```ts
import type { PublicUser } from './types';

const PALETTE = [['#FF8A5B','#FF5E87'],['#5FD3A6','#3FA7C2'],['#9B8CFF','#6C7BFF'],['#FFC178','#FF8A5B'],['#FF5E87','#9B8CFF'],['#5FD3A6','#6C7BFF'],['#FFC178','#FF5E87'],['#9B8CFF','#FF5E87']];
function hash(s: string) { let h = 0; const str = String(s); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
export function avatarFor(seed: string) { return PALETTE[hash(seed) % PALETTE.length].join(','); }
export function initials(name: string) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}
export function publicUser<T extends { id: string; handle: string; displayName: string; avatar: string }>(u: T | null): PublicUser | null {
  if (!u) return null;
  return { id: u.id, handle: u.handle, displayName: u.displayName, avatar: u.avatar, initials: initials(u.displayName) };
}
```

- [ ] **Step 6: Write `lib/domain/dates.ts`** (ports the date-window helpers in `server/index.js:148-155`)

```ts
export function startOfToday(now = new Date()) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
export function startOfDay(iso: string | Date) { const d = new Date(iso); d.setHours(0, 0, 0, 0); return d; }
export function notExpired(ev: { expiresAt: string | null }, now = new Date()) { return !ev.expiresAt || new Date(ev.expiresAt) > now; }
```

- [ ] **Step 7: Run — expect PASS, then commit**

Run: `npm test`
Expected: PASS.
```bash
git add -A && git commit -m "feat: domain types + helpers (TDD)"
```

### Task 2.2: Visibility logic (the security core)

**Files:**
- Create: `lib/domain/visibility.ts`
- Test: `lib/domain/visibility.test.ts`

- [ ] **Step 1: Write the failing test `lib/domain/visibility.test.ts`** (encodes the rules in `server/index.js:44-91`)

```ts
import { describe, it, expect } from 'vitest';
import { areConnected, myConnectionIds, connectionStatus, tierOf, canSeeContent, canSeeBusy } from './visibility';
import type { Connection, Placement } from '../db/schema';

const conns: Connection[] = [
  { id: 'c1', aId: 'ed', bId: 'maya', status: 'accepted', requestedBy: 'ed', createdAt: '' },
  { id: 'c2', aId: 'jordan', bId: 'ed', status: 'pending', requestedBy: 'jordan', createdAt: '' },
];
const places: Placement[] = [{ id: 'p1', ownerId: 'ed', otherId: 'maya', tier: 'inner' }];
const ev = (over: Partial<any> = {}) => ({ creatorId: 'maya', visibility: 'inner', ...over });

describe('visibility', () => {
  it('areConnected: only accepted, either direction', () => {
    expect(areConnected(conns, 'ed', 'maya')).toBe(true);
    expect(areConnected(conns, 'maya', 'ed')).toBe(true);
    expect(areConnected(conns, 'ed', 'jordan')).toBe(false);
  });
  it('myConnectionIds: accepted partners of me', () => {
    expect([...myConnectionIds(conns, 'ed')]).toEqual(['maya']);
  });
  it('connectionStatus: none/connected/pending_in/pending_out', () => {
    expect(connectionStatus(conns, 'ed', 'maya')).toBe('connected');
    expect(connectionStatus(conns, 'ed', 'jordan')).toBe('pending_in');
    expect(connectionStatus(conns, 'jordan', 'ed')).toBe('pending_out');
    expect(connectionStatus(conns, 'ed', 'nobody')).toBe('none');
  });
  it('tierOf: owner→other placement or null', () => {
    expect(tierOf(places, 'ed', 'maya')).toBe('inner');
    expect(tierOf(places, 'maya', 'ed')).toBe(null);
  });
  it('canSeeContent: public always; self always; inner needs inner tier; orbit ok for any connection', () => {
    expect(canSeeContent('anyone', ev({ visibility: 'public' }), conns, places)).toBe(true);
    expect(canSeeContent('maya', ev({ creatorId: 'maya' }), conns, places)).toBe(true);
    expect(canSeeContent('ed', ev({ visibility: 'inner' }), conns, places)).toBe(true); // ed is inner of maya
    expect(canSeeContent('ed', ev({ visibility: 'orbit' }), conns, places)).toBe(true);
    expect(canSeeContent(null, ev({ visibility: 'inner' }), conns, places)).toBe(false);
    expect(canSeeContent('stranger', ev({ visibility: 'inner' }), conns, places)).toBe(false);
  });
  it('canSeeContent: inner event hidden from a connection placed only in orbit', () => {
    const orbitOnly: Placement[] = [{ id: 'p', ownerId: 'maya', otherId: 'theo', tier: 'orbit' }];
    const c: Connection[] = [{ id: 'c', aId: 'maya', bId: 'theo', status: 'accepted', requestedBy: 'maya', createdAt: '' }];
    expect(canSeeContent('theo', ev({ visibility: 'inner' }), c, orbitOnly)).toBe(false);
    expect(canSeeContent('theo', ev({ visibility: 'orbit' }), c, orbitOnly)).toBe(true);
  });
  it('canSeeBusy: content-visible OR connected', () => {
    expect(canSeeBusy('ed', ev({ visibility: 'inner' }), conns, places)).toBe(true);
    expect(canSeeBusy('stranger', ev({ visibility: 'inner' }), conns, places)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `lib/domain/visibility.ts`** (faithful port of `server/index.js:44-91`, parameterized over rows)

```ts
import type { Connection, Placement } from '../db/schema';
import type { Tier, Visibility } from './types';

type Ev = { creatorId: string; visibility: Visibility };

export function areConnected(conns: Connection[], a: string, b: string) {
  return conns.some((c) => c.status === 'accepted' && ((c.aId === a && c.bId === b) || (c.aId === b && c.bId === a)));
}
export function myConnectionIds(conns: Connection[], me: string) {
  const ids = new Set<string>();
  for (const c of conns) if (c.status === 'accepted' && (c.aId === me || c.bId === me)) ids.add(c.aId === me ? c.bId : c.aId);
  return ids;
}
export function connectionStatus(conns: Connection[], me: string, other: string) {
  const c = conns.find((c) => (c.aId === me && c.bId === other) || (c.aId === other && c.bId === me));
  if (!c) return 'none' as const;
  if (c.status === 'accepted') return 'connected' as const;
  return c.requestedBy === me ? ('pending_out' as const) : ('pending_in' as const);
}
export function tierOf(places: Placement[], owner: string, other: string): Tier | null {
  const p = places.find((p) => p.ownerId === owner && p.otherId === other);
  return p ? p.tier : null;
}
export function canSeeContent(viewer: string | null, ev: Ev, conns: Connection[], places: Placement[]) {
  if (ev.visibility === 'public') return true;
  if (!viewer) return false;
  if (ev.creatorId === viewer) return true;
  if (!areConnected(conns, ev.creatorId, viewer)) return false;
  const tier = tierOf(places, ev.creatorId, viewer) || 'orbit';
  if (ev.visibility === 'orbit') return true;
  if (ev.visibility === 'inner') return tier === 'inner';
  return false;
}
export function canSeeBusy(viewer: string | null, ev: Ev, conns: Connection[], places: Placement[]) {
  if (canSeeContent(viewer, ev, conns, places)) return true;
  if (!viewer) return false;
  return areConnected(conns, ev.creatorId, viewer);
}
```

- [ ] **Step 4: Run — expect PASS, then commit**

Run: `npm test`
Expected: PASS (all visibility cases).
```bash
git add -A && git commit -m "feat: visibility logic with full test coverage (TDD)"
```

### Task 2.3: Enrich + social proof + regulars

**Files:**
- Create: `lib/domain/enrich.ts`, `lib/domain/regulars.ts`
- Test: `lib/domain/enrich.test.ts`, `lib/domain/regulars.test.ts`

- [ ] **Step 1: Write failing test `lib/domain/enrich.test.ts`** (ports `server/index.js:101-145`)

```ts
import { describe, it, expect } from 'vitest';
import { enrich, type EnrichCtx } from './enrich';

const users = [
  { id: 'ed', handle: 'ed', displayName: 'Ed Shen', avatar: 'a,b' },
  { id: 'maya', handle: 'maya', displayName: 'Maya Chen', avatar: 'c,d' },
];
const conns = [{ id: 'c', aId: 'ed', bId: 'maya', status: 'accepted', requestedBy: 'ed', createdAt: '' }];
const ctx: EnrichCtx = { users: users as any, conns: conns as any, places: [], attendance: [
  { id: 'a1', eventId: 'e1', userId: 'maya', rsvp: 'going', createdAt: '' },
  { id: 'a2', eventId: 'e1', userId: 'ed', rsvp: 'down', createdAt: '' },
] as any };
const event = { id: 'e1', creatorId: 'maya', type: 'event', title: 'Wine', description: '', location: 'Ruffian', startTime: '2026-07-01T20:00:00Z', endTime: null, recurring: null, visibility: 'orbit', expiresAt: null };

describe('enrich', () => {
  it('returns busy stub when content not visible', () => {
    const out = enrich(event as any, 'stranger', { ...ctx, conns: [] as any });
    expect(out).toMatchObject({ type: 'busy', busy: true, startTime: event.startTime });
    expect((out as any).title).toBeUndefined();
  });
  it('returns full payload with proof (connections only) + myRsvp for a viewer who can see it', () => {
    const out: any = enrich(event as any, 'ed', ctx);
    expect(out.title).toBe('Wine');
    expect(out.creator.handle).toBe('maya');
    expect(out.proof.count).toBe(1); // maya is ed's connection & going
    expect(out.myRsvp).toBe('down');
    expect(out.attendeeCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test` → FAIL.

- [ ] **Step 3: Write `lib/domain/enrich.ts`**

```ts
import type { Connection, Placement, Attendance, User, Event } from '../db/schema';
import { ATTEND, type PublicUser } from './types';
import { publicUser } from './helpers';
import { canSeeContent, myConnectionIds } from './visibility';

export interface EnrichCtx { users: User[]; conns: Connection[]; places: Placement[]; attendance: Attendance[]; }

const byId = (users: User[], id: string) => users.find((u) => u.id === id) || null;

export function enrich(ev: Event, viewer: string | null, ctx: EnrichCtx, opts: { detail?: boolean } = {}) {
  if (!canSeeContent(viewer, ev, ctx.conns, ctx.places)) {
    return { id: ev.id, type: 'busy' as const, busy: true, startTime: ev.startTime, endTime: ev.endTime, visibility: ev.visibility };
  }
  const att = ctx.attendance.filter((a) => a.eventId === ev.id);
  const mineIds = viewer ? myConnectionIds(ctx.conns, viewer) : new Set<string>();
  const going = att.filter((a) => ATTEND.includes(a.rsvp) && mineIds.has(a.userId));
  const out: any = {
    id: ev.id, type: ev.type, title: ev.title, description: ev.description || '', location: ev.location || '',
    startTime: ev.startTime, endTime: ev.endTime || null, recurring: ev.recurring || null, visibility: ev.visibility,
    creator: publicUser(byId(ctx.users, ev.creatorId)),
    proof: { count: going.length, sample: going.slice(0, 3).map((a) => publicUser(byId(ctx.users, a.userId))).filter(Boolean) as PublicUser[] },
    myRsvp: viewer ? (att.find((a) => a.userId === viewer)?.rsvp ?? null) : null,
    attendeeCount: att.filter((a) => ATTEND.includes(a.rsvp)).length,
  };
  if (opts.detail) out.attendees = att.filter((a) => ATTEND.includes(a.rsvp)).map((a) => ({ ...publicUser(byId(ctx.users, a.userId)), rsvp: a.rsvp }));
  return out;
}
export type EnrichedEvent = ReturnType<typeof enrich>;
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test` → PASS.

- [ ] **Step 5: Write failing test `lib/domain/regulars.test.ts`** (ports `server/index.js:378-407`: regulars ≥3×, rising ==2×)

```ts
import { describe, it, expect } from 'vitest';
import { computeRegulars } from './regulars';

const users = [
  { id: 'ed', handle: 'ed', displayName: 'Ed Shen', avatar: 'a,b' },
  { id: 'maya', handle: 'maya', displayName: 'Maya Chen', avatar: 'c,d' },
  { id: 'sam', handle: 'sam', displayName: 'Sam Ortiz', avatar: 'e,f' },
];
// ed co-attended 3 events with maya, 2 with sam
const events = [1,2,3].map((n) => ({ id: 'e'+n, creatorId: 'maya', type: 'event', title: 'Climb '+n, location: 'VITAL', startTime: `2026-0${n}-01T10:00:00Z` }))
  .concat([4,5].map((n) => ({ id: 'e'+n, creatorId: 'sam', type: 'event', title: 'Wine '+n, location: 'home', startTime: `2026-0${n}-02T20:00:00Z` })));
const attendance: any[] = [];
for (const n of [1,2,3]) { attendance.push({ eventId: 'e'+n, userId: 'ed', rsvp: 'going' }, { eventId: 'e'+n, userId: 'maya', rsvp: 'going' }); }
for (const n of [4,5]) { attendance.push({ eventId: 'e'+n, userId: 'ed', rsvp: 'going' }, { eventId: 'e'+n, userId: 'sam', rsvp: 'down' }); }

describe('computeRegulars', () => {
  it('splits regulars (>=3x) and rising (==2x), sorted by count', () => {
    const { regulars, rising } = computeRegulars('ed', events as any, attendance as any, users as any);
    expect(regulars.map((r) => r.user!.handle)).toEqual(['maya']);
    expect(regulars[0].count).toBe(3);
    expect(rising.map((r) => r.user!.handle)).toEqual(['sam']);
    expect(rising[0].count).toBe(2);
  });
});
```

- [ ] **Step 6: Run — expect FAIL.** Run: `npm test` → FAIL.

- [ ] **Step 7: Write `lib/domain/regulars.ts`**

```ts
import type { Attendance, Event, User } from '../db/schema';
import { ATTEND } from './types';
import { publicUser } from './helpers';

export function computeRegulars(me: string, events: Event[], attendance: Attendance[], users: User[]) {
  const myEventIds = attendance.filter((a) => a.userId === me && ATTEND.includes(a.rsvp)).map((a) => a.eventId);
  const tally = new Map<string, { count: number; last: string | null; contexts: Set<string> }>();
  for (const eid of myEventIds) {
    const ev = events.find((e) => e.id === eid);
    if (!ev) continue;
    for (const a of attendance.filter((x) => x.eventId === eid)) {
      if (a.userId === me || !ATTEND.includes(a.rsvp)) continue;
      const t = tally.get(a.userId) || { count: 0, last: null as string | null, contexts: new Set<string>() };
      t.count += 1;
      if (!t.last || new Date(ev.startTime) > new Date(t.last)) t.last = ev.startTime;
      if (ev.location || ev.title) t.contexts.add((ev.type === 'intention' ? 'lunch' : ev.title.split(' ')[0]).toLowerCase());
      tally.set(a.userId, t);
    }
  }
  const rows = [...tally.entries()].map(([id, t]) => ({
    user: publicUser(users.find((u) => u.id === id) || null), count: t.count, last: t.last, contexts: [...t.contexts].slice(0, 3),
  })).filter((r) => r.user).sort((a, b) => b.count - a.count || (new Date(b.last!).getTime() - new Date(a.last!).getTime()));
  return { regulars: rows.filter((r) => r.count >= 3), rising: rows.filter((r) => r.count === 2) };
}
```

- [ ] **Step 8: Run — expect PASS, then commit**

Run: `npm test`
Expected: PASS (all domain suites green).
```bash
git add -A && git commit -m "feat: enrich + regulars domain logic (TDD)"
```

### Task 2.4: Query layer (Drizzle reads/writes)

**Files:**
- Create: `lib/db/queries.ts`

- [ ] **Step 1: Write `lib/db/queries.ts`** — thin Drizzle helpers the RSC/actions use, returning rows the pure domain functions consume. No tests (integration-tested manually against local D1).

```ts
import { and, eq, gte, lt, or } from 'drizzle-orm';
import { getDb } from './index';
import { users, connections, placements, events, attendance } from './schema';

export async function getUserById(id: string) { return (await getDb().select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null; }
export async function getUserByHandle(handle: string) {
  return (await getDb().select().from(users).where(or(eq(users.handle, handle), eq(users.shareId, handle))).limit(1))[0] ?? null;
}
export async function getAllUsers() { return getDb().select().from(users); }
export async function getAllConnections() { return getDb().select().from(connections); }
export async function getAllPlacements() { return getDb().select().from(placements); }
export async function getAllAttendance() { return getDb().select().from(attendance); }
export async function getEventsBetween(startISO: string, endISO: string) {
  return getDb().select().from(events).where(and(gte(events.startTime, startISO), lt(events.startTime, endISO)));
}
export async function getEventById(id: string) { return (await getDb().select().from(events).where(eq(events.id, id)).limit(1))[0] ?? null; }
export async function getEventsByCreator(creatorId: string) { return getDb().select().from(events).where(eq(events.creatorId, creatorId)); }

// A bundle the domain layer needs for visibility/enrich across a set of events.
export async function getGraphContext() {
  const [u, c, p, a] = await Promise.all([getAllUsers(), getAllConnections(), getAllPlacements(), getAllAttendance()]);
  return { users: u, conns: c, places: p, attendance: a };
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: Drizzle query layer"
```

---

## Milestone M3 — Auth (iron-session + scrypt)

### Task 3.1: Password hashing (TDD) + run the seed

**Files:**
- Create: `lib/auth/password.ts`
- Test: `lib/auth/password.test.ts`

- [ ] **Step 1: Write failing test `lib/auth/password.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const h = await hashPassword('orbit');
    expect(h).toContain('$'); // salt$hash format
    expect(await verifyPassword('orbit', h)).toBe(true);
    expect(await verifyPassword('nope', h)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test` → FAIL.

- [ ] **Step 3: Write `lib/auth/password.ts`** (scrypt via @noble/hashes; Workers-safe; format `saltB64$hashB64`)

```ts
import { scrypt } from '@noble/hashes/scrypt';
import { randomBytes } from '@noble/hashes/utils';

const N = 2 ** 15, r = 8, p = 1, dkLen = 32;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = (s: string) => new TextEncoder().encode(s);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = scrypt(enc(password), salt, { N, r, p, dkLen });
  return `${b64(salt)}$${b64(hash)}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split('$');
  if (!saltB64 || !hashB64) return false;
  const hash = scrypt(enc(password), unb64(saltB64), { N, r, p, dkLen });
  const a = b64(hash), b = hashB64;
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: scrypt password hashing (TDD)"
```

- [ ] **Step 6: Now run the seed** (gen-seed.ts can resolve `hashPassword`)

Run: `npm run db:seed:local`
Expected: "Wrote drizzle/seed.sql …" then wrangler reports rows inserted (8 users, ~12 events, etc.).

### Task 3.2: Session + middleware + auth actions

**Files:**
- Create: `lib/auth/session.ts`, `middleware.ts`, `lib/actions/auth.ts`

- [ ] **Step 1: Write `lib/auth/session.ts`**

```ts
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData { userId?: string; handle?: string; }

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: 'orbit_session',
    cookieOptions: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax' },
  });
}
export async function requireUserId(): Promise<string> {
  const s = await getSession();
  if (!s.userId) throw new Error('UNAUTHORIZED');
  return s.userId;
}
```

- [ ] **Step 2: Write `middleware.ts`** (redirect unauthed `(app)` routes to `/login`; the cookie presence is a cheap gate — full verify happens in the layout)

```ts
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/discover', '/plans', '/regulars', '/you', '/circles'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has('orbit_session');
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/')) && !hasSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if ((pathname === '/login' || pathname === '/register') && hasSession) {
    return NextResponse.redirect(new URL('/discover', req.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ['/discover/:path*', '/plans/:path*', '/regulars/:path*', '/you/:path*', '/circles/:path*', '/login', '/register'] };
```

- [ ] **Step 3: Write `lib/actions/auth.ts`** (server actions; ports `server/index.js:160-198`)

```ts
'use server';
import { redirect } from 'next/navigation';
import { eq, or } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from '../auth/password';
import { getSession } from '../auth/session';
import { avatarFor } from '../domain/helpers';

function toHandle(s: string) { return String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, ''); }

export async function login(_prev: unknown, form: FormData) {
  const handle = toHandle(String(form.get('username')));
  const password = String(form.get('password') || '');
  const u = (await getDb().select().from(users).where(eq(users.handle, handle)).limit(1))[0];
  if (!u || !(await verifyPassword(password, u.passwordHash))) return { error: 'Invalid credentials' };
  const s = await getSession(); s.userId = u.id; s.handle = u.handle; await s.save();
  redirect('/discover');
}

export async function register(_prev: unknown, form: FormData) {
  const handle = toHandle(String(form.get('username')));
  const password = String(form.get('password') || '');
  const displayName = String(form.get('displayName') || '') || handle;
  if (!handle || !password) return { error: 'Username and password required' };
  const exists = (await getDb().select().from(users).where(eq(users.handle, handle)).limit(1))[0];
  if (exists) return { error: 'Username taken' };
  const id = crypto.randomUUID();
  await getDb().insert(users).values({
    id, handle, displayName, passwordHash: await hashPassword(password), bio: '', scenes: [],
    avatar: avatarFor(handle), shareId: crypto.randomUUID().slice(0, 8), ghost: false, createdAt: new Date().toISOString(),
  });
  const s = await getSession(); s.userId = id; s.handle = handle; await s.save();
  redirect('/discover');
}

export async function logout() {
  const s = await getSession(); s.destroy();
  redirect('/login');
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: iron-session sessions, middleware guard, auth actions"
```

### Task 3.3: Auth screens

**Files:**
- Create: `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `components/AuthForm.tsx`
- Modify: `app/page.tsx` (redirect based on session)

- [ ] **Step 1: Write `app/page.tsx`** (route root → discover or login)

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
export default async function Home() {
  const s = await getSession();
  redirect(s.userId ? '/discover' : '/login');
}
```

- [ ] **Step 2: Write `app/(auth)/layout.tsx`** (uses the `.auth` classes from globals.css)

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth">{children}</div>;
}
```

- [ ] **Step 3: Write `components/AuthForm.tsx`** (client; uses `useActionState`; mirrors `renderAuth()` in `public/app.js:72-85`)

```tsx
'use client';
import { useActionState } from 'react';
import Link from 'next/link';

type Action = (prev: unknown, form: FormData) => Promise<{ error?: string } | void>;

export default function AuthForm({ mode, action }: { mode: 'login' | 'register'; action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  const reg = mode === 'register';
  return (
    <form action={formAction}>
      <div className="logo"><span className="mark" /> Orbit</div>
      <p className="tag">Your social calendar is your profile.</p>
      <div className="field"><label>Username</label><input name="username" type="text" autoCapitalize="off" placeholder="ed" /></div>
      {reg && <div className="field"><label>Display name</label><input name="displayName" type="text" placeholder="Ed Shen" /></div>}
      <div className="field"><label>Password</label><input name="password" type="password" placeholder="••••••••" /></div>
      <button className="btn solid block" disabled={pending}>{reg ? 'Create account' : 'Log in'}</button>
      {state?.error && <div className="error">{state.error}</div>}
      <div className="toggle-link">
        {reg ? <>Have an account? <Link href="/login"><b>Log in</b></Link></> : <>New here? <Link href="/register"><b>Create account</b></Link></>}
      </div>
      {!reg && <div className="toggle-link faint" style={{ marginTop: 22 }}>demo · <b>ed</b> / <b>orbit</b></div>}
    </form>
  );
}
```

- [ ] **Step 4: Write the two pages**

```tsx
// app/(auth)/login/page.tsx
import AuthForm from '@/components/AuthForm';
import { login } from '@/lib/actions/auth';
export default function LoginPage() { return <AuthForm mode="login" action={login} />; }
```
```tsx
// app/(auth)/register/page.tsx
import AuthForm from '@/components/AuthForm';
import { register } from '@/lib/actions/auth';
export default function RegisterPage() { return <AuthForm mode="register" action={register} />; }
```

- [ ] **Step 5: Verify login end-to-end** (requires globals.css from M4 for full styling, but flow works now)

Run: `npm run dev`, go to `/login`, log in with `ed` / `orbit`.
Expected: redirects to `/discover` (404 until M5, but the session cookie is set — confirm via DevTools → Application → Cookies → `orbit_session`). Logging in with a wrong password shows "Invalid credentials".

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: login/register screens wired to auth actions"
```

---

## Milestone M4 — Design system + app shell

### Task 4.1: Port the design system to globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Copy `public/orbit.css` content into `app/globals.css` verbatim**, then apply these adaptations:
  - Keep all `:root` tokens, `body` background, and every component class (`.shell .main .nav .card .pill .av .stack .seg .btn .field .chip .banner .pf-* .up .vis .statline .priv .insight .reg .sub-h .footnote .cal-h .wk-* .ev .mo-* .cell .dots .dot .ag .scrim .sheet .auth .toggle-link` …) exactly as-is — the React components below reuse these class names.
  - Remove `.hidden` (no longer used).
  - Add a View Transitions default at the end:

```css
/* smooth cross-screen + theme transitions */
@view-transition { navigation: auto; }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: .22s; }
@media (prefers-reduced-motion: reduce) { ::view-transition-old(root), ::view-transition-new(root) { animation: none; } }
```

- [ ] **Step 2: Verify the auth screen now renders styled**

Run: `npm run dev`, open `/login`.
Expected: dark editorial styling matches the mock (serif logo, gradient button, demo hint).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: port Orbit design system to globals.css"
```

### Task 4.2: Primitive components

**Files:**
- Create: `components/primitives/Icon.tsx`, `Avatar.tsx`, `AvatarStack.tsx`, `Pill.tsx`, `Segmented.tsx`, `Sheet.tsx`

- [ ] **Step 1: Write `components/primitives/Icon.tsx`** — port the `I` SVG map from `public/app.js:26-40` into a typed component.

```tsx
const PATHS: Record<string, React.ReactNode> = {
  discover: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor" stroke="none" /></>,
  plans: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  create: <path d="M12 5v14M5 12h14" />,
  regulars: <><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /><ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-22 12 12)" /><circle cx="20" cy="8.5" r="1.6" fill="currentColor" stroke="none" /></>,
  you: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  free: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  standing: <><path d="M17 3l3 3-3 3" /><path d="M20 6H8a4 4 0 0 0-4 4" /><path d="M7 21l-3-3 3-3" /><path d="M4 18h12a4 4 0 0 0 4-4" /></>,
  event: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  scene: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="4.5" /></>,
  inner: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  orbit: <><circle cx="9" cy="8" r="3" /><path d="M3 19a6 6 0 0 1 12 0" /><path d="M16 6.5a3 3 0 0 1 0 5.5M21 19a6 6 0 0 0-4-5.6" /></>,
  public: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
};
export type IconName = keyof typeof PATHS;
export default function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24">{PATHS[name]}</svg>;
}
```

- [ ] **Step 2: Write `Avatar.tsx` + `AvatarStack.tsx`** (port `avatar()` from `public/app.js:15`)

```tsx
// components/primitives/Avatar.tsx
import type { PublicUser } from '@/lib/domain/types';
export default function Avatar({ user, size = 'sm', className = '' }: { user: PublicUser; size?: 'sm' | 'lg' | 'xl'; className?: string }) {
  return <span className={`av ${size} ${className}`} style={{ background: `linear-gradient(135deg,${user.avatar})` }}>{user.initials}</span>;
}
```
```tsx
// components/primitives/AvatarStack.tsx
import type { PublicUser } from '@/lib/domain/types';
import Avatar from './Avatar';
export default function AvatarStack({ users }: { users: PublicUser[] }) {
  return <div className="stack">{users.map((u) => <Avatar key={u.id} user={u} />)}</div>;
}
```

- [ ] **Step 3: Write `Pill.tsx`** (maps event type → color class + label, per `PILL`/`VIS` in `public/app.js:41-42`)

```tsx
import Icon, { type IconName } from './Icon';
const PILL: Record<string, [IconName, string]> = { intention: ['free', 'Free'], plan: ['standing', 'Plan'], event: ['event', 'Event'], scene: ['scene', 'Scene'], busy: ['event', 'Busy'] };
export function typeClass(t: string) { return ({ intention: 'free', plan: 'standing', event: 'event', scene: 'scene', busy: 'busy' } as Record<string, string>)[t] || 'event'; }
export default function Pill({ type, recurring }: { type: string; recurring?: boolean }) {
  const [icon, label] = PILL[type] || PILL.event;
  return <span className={`pill ${typeClass(type)}`}><Icon name={icon} /> {label}{recurring ? ' ·↻' : ''}</span>;
}
```

- [ ] **Step 4: Write `Segmented.tsx`** (the `.seg` control)

```tsx
'use client';
export default function Segmented({ options, value, onChange, width }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; width?: number }) {
  return (
    <div className="seg" style={width ? { margin: 0, width } : undefined}>
      {options.map((o) => <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
```

- [ ] **Step 5: Write `Sheet.tsx`** (Base UI Dialog styled as the `.scrim`/`.sheet` bottom sheet — gives focus-trap + a11y for free)

```tsx
'use client';
import { Dialog } from '@base-ui-components/react/dialog';
export default function Sheet({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="scrim" />
        <Dialog.Popup className="sheet"><div className="grab" />{children}</Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: primitive components (Icon, Avatar, Pill, Segmented, Sheet)"
```

### Task 4.3: App shell + tab bar

**Files:**
- Create: `app/(app)/layout.tsx`, `components/TabBar.tsx`, `components/CreateButton.tsx`

- [ ] **Step 1: Write `components/TabBar.tsx`** (client; ports `navHTML()` `public/app.js:45-48`; highlights active route)

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from './primitives/Icon';
import CreateButton from './CreateButton';

const TABS: { href: string; icon: IconName; label: string }[] = [
  { href: '/discover', icon: 'discover', label: 'Discover' },
  { href: '/plans', icon: 'plans', label: 'Plans' },
  { href: '/regulars', icon: 'regulars', label: 'Regulars' },
  { href: '/you', icon: 'you', label: 'You' },
];
export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="nav">
      {TABS.slice(0, 2).map((t) => <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'on' : ''}><Icon name={t.icon} />{t.label}</Link>)}
      <CreateButton />
      {TABS.slice(2).map((t) => <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'on' : ''}><Icon name={t.icon} />{t.label}</Link>)}
    </nav>
  );
}
```
(Note: `<Link>` renders an anchor; `.nav button` styles also apply to `.nav a` — add `a` to those selectors in globals.css: change `.nav button` → `.nav button,.nav a`.)

- [ ] **Step 2: Write `components/CreateButton.tsx`** (opens the CreateSheet built in Task 5.7; stub `onClick` until then)

```tsx
'use client';
import { useState } from 'react';
import Icon from './primitives/Icon';
import CreateSheet from './CreateSheet';
export default function CreateButton() {
  const [open, setOpen] = useState(false);
  return (<><button onClick={() => setOpen(true)}><span className="create"><Icon name="create" /></span></button><CreateSheet open={open} onOpenChange={setOpen} /></>);
}
```

- [ ] **Step 3: Write `app/(app)/layout.tsx`** (server; verifies session, renders shell + tab bar)

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import TabBar from '@/components/TabBar';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s.userId) redirect('/login');
  return (<><div className="shell"><div className="main">{children}</div></div><TabBar /></>);
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: authed app shell + bottom tab bar"
```

---

## Milestone M5 — Screens

Each screen is a Server Component that loads data via `lib/db/queries` + domain functions, then renders components reusing the ported CSS. Mutations are Server Actions. **Pattern (established in Task 5.1, reused after):** RSC fetches `getGraphContext()` + window events → filters/enriches with domain fns → passes plain data to a client component for interactivity.

### Task 5.1: Events server actions + RsvpButtons

**Files:**
- Create: `lib/actions/events.ts`, `components/RsvpButtons.tsx`

- [ ] **Step 1: Write `lib/actions/events.ts`** (ports create/rsvp/delete `server/index.js:262-308`; **throws on failure** so `useOptimistic` rolls back)

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { events, attendance } from '../db/schema';
import { requireUserId } from '../auth/session';
import { getEventById, getAllConnections, getAllPlacements } from '../db/queries';
import { canSeeContent } from '../domain/visibility';
import { EVENT_TYPES } from '../domain/types';

export async function createEvent(input: { type: string; title: string; location?: string; startTime: string; endTime?: string | null; recurring?: 'weekly' | null; visibility: string; expiresAt?: string | null; }) {
  const uid = await requireUserId();
  if (!input.title || !input.startTime) throw new Error('Title and start time required');
  const id = crypto.randomUUID(); const nowISO = new Date().toISOString();
  await getDb().insert(events).values({
    id, creatorId: uid,
    type: (EVENT_TYPES as string[]).includes(input.type) ? (input.type as any) : 'event',
    title: input.title, description: '', location: input.location || '',
    startTime: new Date(input.startTime).toISOString(),
    endTime: input.endTime ? new Date(input.endTime).toISOString() : null,
    recurring: input.recurring || null,
    visibility: (['inner','orbit','public'].includes(input.visibility) ? input.visibility : 'inner') as any,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null, createdAt: nowISO,
  });
  await getDb().insert(attendance).values({ id: crypto.randomUUID(), eventId: id, userId: uid, rsvp: 'going', createdAt: nowISO });
  revalidatePath('/plans'); revalidatePath('/discover'); return { id };
}

export async function setRsvp(eventId: string, rsvp: 'going' | 'down' | 'maybe' | 'cant') {
  const uid = await requireUserId();
  const ev = await getEventById(eventId);
  if (!ev) throw new Error('Not found');
  const [conns, places] = [await getAllConnections(), await getAllPlacements()];
  if (!canSeeContent(uid, ev, conns, places)) throw new Error('Private');
  const existing = (await getDb().select().from(attendance).where(and(eq(attendance.eventId, eventId), eq(attendance.userId, uid))).limit(1))[0];
  if (existing) await getDb().update(attendance).set({ rsvp }).where(eq(attendance.id, existing.id));
  else await getDb().insert(attendance).values({ id: crypto.randomUUID(), eventId, userId: uid, rsvp, createdAt: new Date().toISOString() });
  revalidatePath('/discover'); revalidatePath('/plans');
}

export async function deleteEvent(eventId: string) {
  const uid = await requireUserId();
  const ev = await getEventById(eventId);
  if (!ev || ev.creatorId !== uid) throw new Error('Not allowed');
  await getDb().delete(attendance).where(eq(attendance.eventId, eventId));
  await getDb().delete(events).where(eq(events.id, eventId));
  revalidatePath('/plans');
}
```

- [ ] **Step 2: Write `components/RsvpButtons.tsx`** (client; optimistic; ports the down/maybe/cant buttons in `eventCard()` `public/app.js:108-111`)

```tsx
'use client';
import { useOptimistic, useTransition } from 'react';
import { setRsvp } from '@/lib/actions/events';
const OPTS: { v: 'down' | 'maybe' | 'cant'; label: string }[] = [{ v: 'down', label: "I'm down" }, { v: 'maybe', label: 'Maybe' }, { v: 'cant', label: "Can't" }];
export default function RsvpButtons({ eventId, myRsvp }: { eventId: string; myRsvp: string | null }) {
  const [optimistic, setOptimistic] = useOptimistic(myRsvp);
  const [, startTransition] = useTransition();
  return (
    <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
      {OPTS.map(({ v, label }) => (
        <button key={v} className={`btn sm ${optimistic === v ? (v === 'cant' ? '' : 'in') : ''}`}
          onClick={() => startTransition(async () => { setOptimistic(v); await setRsvp(eventId, v); })}>{label}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: event actions + optimistic RSVP buttons"
```

### Task 5.2: EventCard + Discover screen

**Files:**
- Create: `components/EventCard.tsx`, `lib/format.ts`, `app/(app)/discover/page.tsx`, `components/DiscoverClient.tsx`

- [ ] **Step 1: Write `lib/format.ts`** (ports `timeLabel`/`dayLabel`/`relTime` from `public/app.js:17-24,252-255`)

```ts
export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export function dayLabel(iso: string) {
  const day = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
  const diff = Math.round((day(new Date(iso)) - day(new Date())) / 864e5);
  const wd = new Date(iso).toLocaleDateString('en-US', { weekday: 'short' });
  if (diff === 0) return 'Today · ' + wd;
  if (diff === 1) return 'Tomorrow · ' + wd;
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });
}
export function relTime(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 14) return days + 'd ago'; return Math.round(days / 7) + 'w ago';
}
```

- [ ] **Step 2: Write `components/EventCard.tsx`** (ports `eventCard()` `public/app.js:100-118`; `meId` decides Hosting vs RSVP)

```tsx
import type { EnrichedEvent } from '@/lib/domain/enrich';
import { timeLabel } from '@/lib/format';
import Pill from './primitives/Pill';
import Avatar from './primitives/Avatar';
import RsvpButtons from './RsvpButtons';

export default function EventCard({ ev, meId }: { ev: any; meId: string }) {
  if (ev.busy) return (
    <div className="card"><div className="row between"><Pill type="busy" /><span className="meta">{timeLabel(ev.startTime)}</span></div>
      <div className="ev-title faint" style={{ marginBottom: 0 }}>A friend is busy</div></div>
  );
  const proof = ev.proof?.count
    ? <div className="proof"><div className="stack">{ev.proof.sample.map((u: any) => <Avatar key={u.id} user={u} />)}</div><span>{ev.proof.count} going</span></div>
    : <div className="proof"><span className="faint">be the first in</span></div>;
  return (
    <div className="card">
      <div className="row between"><Pill type={ev.type} recurring={!!ev.recurring} /><span className="meta">{timeLabel(ev.startTime)}</span></div>
      <div className="ev-title">{ev.title}</div>
      <div className="meta">{ev.creator.displayName}{ev.location && <><span className="dot" />{ev.location}</>}</div>
      <div className="row between" style={{ marginTop: 12 }}>{proof}
        {ev.creator.id === meId ? <span className="btn sm in">Hosting</span> : <RsvpButtons eventId={ev.id} myRsvp={ev.myRsvp} />}</div>
    </div>
  );
}
```

- [ ] **Step 3: Write `app/(app)/discover/page.tsx`** (RSC; ports `/api/discover` `server/index.js:311-327`)

```tsx
import { getSession } from '@/lib/auth/session';
import { getGraphContext, getEventsBetween } from '@/lib/db/queries';
import { canSeeContent, myConnectionIds } from '@/lib/domain/visibility';
import { enrich } from '@/lib/domain/enrich';
import { startOfToday, notExpired } from '@/lib/domain/dates';
import DiscoverClient from '@/components/DiscoverClient';

export default async function DiscoverPage() {
  const meId = (await getSession()).userId!;
  const ctx = await getGraphContext();
  const from = startOfToday(); const to = new Date(from); to.setDate(to.getDate() + 7);
  const conns = myConnectionIds(ctx.conns, meId);
  const all = await getEventsBetween(from.toISOString(), to.toISOString());
  const events = all
    .filter((ev) => notExpired(ev) && (ev.creatorId === meId || conns.has(ev.creatorId) || ev.visibility === 'public') && canSeeContent(meId, ev, ctx.conns, ctx.places))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map((ev) => enrich(ev, meId, ctx));
  return <DiscoverClient events={events} meId={meId} />;
}
```

- [ ] **Step 4: Write `components/DiscoverClient.tsx`** (client; segmented control + day-grouped cards; ports `renderHome()` `public/app.js:119-134`; Week/Month mounted in Task 5.3)

```tsx
'use client';
import { useState } from 'react';
import Segmented from './primitives/Segmented';
import EventCard from './EventCard';
import WeekGrid from './WeekGrid';
import MonthGrid from './MonthGrid';
import { dayLabel } from '@/lib/format';

export default function DiscoverClient({ events, meId, week, month }: { events: any[]; meId: string; week?: any; month?: any }) {
  const [view, setView] = useState('discover');
  const seg = <Segmented options={[{ value: 'discover', label: 'Discover' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} value={view} onChange={setView} />;
  if (view === 'week') return <>{seg}<WeekGrid {...week} /></>;
  if (view === 'month') return <>{seg}<MonthGrid {...month} /></>;
  let last = '';
  return (
    <>
      <div className="topbar"><div><div className="kicker">Discover</div><div className="h-title">This week</div></div></div>
      {seg}
      {events.length === 0 && <div className="empty">Nothing on the radar this week.<br />Tap ＋ to start something.</div>}
      {events.map((ev) => { const dl = dayLabel(ev.startTime); const head = dl !== last ? <div className="daylabel" key={'d' + ev.id}>{dl}</div> : null; last = dl; return <div key={ev.id}>{head}<EventCard ev={ev} meId={meId} /></div>; })}
      {events.length > 0 && <div className="footnote">— that's your week —</div>}
    </>
  );
}
```

- [ ] **Step 5: Verify Discover renders with seeded data**

Run: `npm run dev`, log in as `ed`/`orbit`, view `/discover`.
Expected: day-grouped cards (Lunch, Evening run, Natural wine night…), avatar clusters, RSVP buttons; clicking "I'm down" updates instantly. Compare to `docs/mocks/app-live-discover.png`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Discover screen (EventCard, optimistic RSVP, day grouping)"
```

### Task 5.3: Week + Month grids + calendar data

**Files:**
- Create: `components/WeekGrid.tsx`, `components/MonthGrid.tsx`, `lib/calendar.ts`
- Modify: `app/(app)/discover/page.tsx` (also load calendar windows for week/month)

- [ ] **Step 1: Write `lib/calendar.ts`** — a shared RSC helper that ports `/api/calendar` (`server/index.js:330-346`) returning enriched events for a window with busy/free redaction.

```ts
import { getGraphContext, getEventsBetween } from './db/queries';
import { canSeeBusy, myConnectionIds } from './domain/visibility';
import { enrich } from './domain/enrich';

export async function calendarWindow(meId: string, startISO: string, endISO: string) {
  const ctx = await getGraphContext();
  const conns = myConnectionIds(ctx.conns, meId);
  const all = await getEventsBetween(startISO, endISO);
  return all
    .filter((ev) => ev.creatorId === meId || ev.visibility === 'public' || (conns.has(ev.creatorId) && canSeeBusy(meId, ev, ctx.conns, ctx.places)))
    .map((ev) => enrich(ev, meId, ctx))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}
```

- [ ] **Step 2: Write `components/WeekGrid.tsx`** — port `renderWeek()` `public/app.js:140-175` (same geometry: `PXH=29`, `BASE=8`, time labels, open-evenings note). Takes `events: any[]`. Translate the string-building to JSX, preserving `.cal-h .wk-days .wk-grid .wk-times .wk-line .wk-cols .wk-col .ev` classes and inline `top/height` styles.

- [ ] **Step 3: Write `components/MonthGrid.tsx`** — port `renderMonth()` `public/app.js:178-217` (6-week grid, type dots, `hot` when `proof.count>=3`, selected-day agenda). Client component holding `selDay` state; preserves `.mo-wd .wkrow .cell .n .dots .dot .mo-agenda .ag` classes.

- [ ] **Step 4: Update `discover/page.tsx`** to also compute the week + month windows and pass to `DiscoverClient`:

```ts
// add near the top of DiscoverPage, after meId:
import { calendarWindow } from '@/lib/calendar';
const mondayOf = (d: Date) => { const x = startOfToday(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; };
const ws = mondayOf(new Date()); const we = new Date(ws); we.setDate(we.getDate() + 7);
const now = new Date(); const mFirst = new Date(now.getFullYear(), now.getMonth(), 1); const mNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const week = { events: await calendarWindow(meId, ws.toISOString(), we.toISOString()), weekStartISO: ws.toISOString() };
const month = { events: await calendarWindow(meId, mFirst.toISOString(), mNext.toISOString()), monthISO: mFirst.toISOString() };
// pass: <DiscoverClient events={events} meId={meId} week={week} month={month} />
```

- [ ] **Step 5: Verify** Week shows color-coded blocks + open-evening count; Month shows dotted grid with the "hot" day and a tappable agenda. Compare to `docs/mocks/orbit-calendar-views.png`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Week + Month calendar views"
```

### Task 5.4: Plans screen

**Files:**
- Create: `app/(app)/plans/page.tsx`, `components/PlansClient.tsx`

- [ ] **Step 1: Write `app/(app)/plans/page.tsx`** — 60-day window via `calendarWindow`, filter to `!busy && (creator===me || myRsvp)`. Port `renderPlans()` `public/app.js:220-236`.

```tsx
import { getSession } from '@/lib/auth/session';
import { calendarWindow } from '@/lib/calendar';
import { startOfToday } from '@/lib/domain/dates';
import PlansClient from '@/components/PlansClient';
export default async function PlansPage() {
  const meId = (await getSession()).userId!;
  const from = startOfToday(); const to = new Date(from); to.setDate(to.getDate() + 60);
  const all = await calendarWindow(meId, from.toISOString(), to.toISOString());
  const mine = all.filter((e: any) => !e.busy && (e.creator?.id === meId || e.myRsvp));
  return <PlansClient events={mine} meId={meId} />;
}
```

- [ ] **Step 2: Write `components/PlansClient.tsx`** — day-grouped cards with Hosting/You're-in badge + Cancel (calls `deleteEvent`), per `public/app.js:226-234`. Header "What you're in" + "＋ New" opening the CreateSheet.

- [ ] **Step 3: Verify + commit**

Run: `npm run dev` → `/plans` shows Ed's hosted + joined events with Cancel on hosted ones.
```bash
git add -A && git commit -m "feat: Plans screen"
```

### Task 5.5: Regulars screen

**Files:**
- Create: `app/(app)/regulars/page.tsx`, `components/RegularsView.tsx`, `lib/actions/standing.ts` (optional helper to prefill create)

- [ ] **Step 1: Write `app/(app)/regulars/page.tsx`** — load all events+attendance+users, call `computeRegulars(meId, …)`.

```tsx
import { getSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { events as E, attendance as A, users as U } from '@/lib/db/schema';
import { computeRegulars } from '@/lib/domain/regulars';
import RegularsView from '@/components/RegularsView';
export default async function RegularsPage() {
  const meId = (await getSession()).userId!;
  const db = getDb();
  const [events, attendance, users] = await Promise.all([db.select().from(E), db.select().from(A), db.select().from(U)]);
  const { regulars, rising } = computeRegulars(meId, events, attendance, users);
  return <RegularsView regulars={regulars} rising={rising} />;
}
```

- [ ] **Step 2: Write `components/RegularsView.tsx`** — port `renderRegulars()` `public/app.js:240-251`: header + "Only you can see this" priv chip, the insight card for the top regular, regular rows, "Becoming regulars" rising rows, privacy footnote. "Standing plan"/"Say hi" buttons open the CreateSheet prefilled (`type:'plan', recurring:true, title:'Standing plan with <Name>'`).

- [ ] **Step 3: Verify + commit**

Run: `/regulars` → Maya surfaces as a regular (co-presence ≥3), insight card present. Compare `docs/mocks/app-live-regulars.png`.
```bash
git add -A && git commit -m "feat: Regulars screen"
```

### Task 5.6: You (profile) + Circles + profile/connection actions

**Files:**
- Create: `app/(app)/you/page.tsx`, `app/(app)/circles/page.tsx`, `components/ProfileView.tsx`, `components/CirclesView.tsx`, `lib/actions/profile.ts`, `lib/actions/connections.ts`, `lib/db/profile.ts`

- [ ] **Step 1: Write `lib/db/profile.ts`** — a `getProfileData(handleOrShareId, viewerId|null)` helper porting `/api/profile/:handle` (`server/index.js:349-375`): resolves user (404 if ghost & not self), upcoming visible events (≤12), and self-only `stats` (regulars/plans/scenes).

- [ ] **Step 2: Write `lib/actions/profile.ts`** — `updateProfile({displayName,bio,scenes,ghost})` porting `PUT /api/me` (`server/index.js:202-210`), `revalidatePath('/you')`.

- [ ] **Step 3: Write `lib/actions/connections.ts`** — `addPerson(toId)`, `acceptRequest(connId)`, `setTier(otherId,tier)` porting `server/index.js:222-259`; each `revalidatePath('/circles')`.

- [ ] **Step 4: Write `components/ProfileView.tsx`** — port `renderProfile()` `public/app.js:259-283`: banner, xl avatar, name/handle/bio, scene chips, share-link row (copy button), Edit/Circles/Log out row, "What I'm going to" upcoming list with visibility tags, statline. Edit opens a Sheet with the form calling `updateProfile`. Log out calls the `logout` action.

- [ ] **Step 5: Write `app/(app)/you/page.tsx`** — `getProfileData(session.handle, meId)` → `<ProfileView … isSelf />`.

- [ ] **Step 6: Write `components/CirclesView.tsx` + `app/(app)/circles/page.tsx`** — port `renderCircles()` `public/app.js:302-318`: requests (Accept), Inner/Orbit tier rows with the inline `.seg` tier toggle (`setTier`), Add people (`addPerson`), Requested (pending). Page loads circles via queries (`getGraphContext` + `connectionStatus`/`tierOf`/`myConnectionIds`).

- [ ] **Step 7: Verify + commit**

Run: `/you` (profile matches `docs/mocks/app-live-you.png`; edit + share work) and `/circles` (Jordan's request is acceptable; tier toggles persist; add/remove people works).
```bash
git add -A && git commit -m "feat: Profile (You) + Circles screens and actions"
```

### Task 5.7: Create sheet

**Files:**
- Create: `components/CreateSheet.tsx`

- [ ] **Step 1: Write `components/CreateSheet.tsx`** (client) — port `openCreate()`/`submitCreate()` `public/app.js:325-351`. A `Sheet` with: type chips (intention/plan/event), title, location, start/end datetime-local, "repeats weekly" checkbox, visibility chips (inner/orbit/public). On submit, compute `expiresAt` for intentions (same-day 23:59) and call `createEvent`, then close + navigate to `/plans`. Accepts optional `prefill` (used by Regulars). Reuse `.field .chips .chip.pick` classes.

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from './primitives/Sheet';
import { createEvent } from '@/lib/actions/events';

const TYPES = [['intention', 'Free / intention'], ['plan', 'Plan'], ['event', 'Event']] as const;
const VIS = [['inner', 'Inner'], ['orbit', 'Orbit'], ['public', 'Public']] as const;
const defaultStart = () => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export default function CreateSheet({ open, onOpenChange, prefill }: { open: boolean; onOpenChange: (o: boolean) => void; prefill?: { type?: string; title?: string; recurring?: boolean } }) {
  const router = useRouter();
  const [type, setType] = useState(prefill?.type || 'event');
  const [vis, setVis] = useState('inner');
  const [pending, setPending] = useState(false);
  async function submit(form: FormData) {
    const title = String(form.get('title') || ''); if (!title) return;
    const start = String(form.get('start'));
    const expiresAt = type === 'intention' ? (() => { const d = new Date(start); d.setHours(23, 59, 0, 0); return d.toISOString(); })() : null;
    setPending(true);
    await createEvent({ type, title, location: String(form.get('location') || ''), startTime: start, endTime: String(form.get('end') || '') || null, recurring: form.get('rec') ? 'weekly' : null, visibility: vis, expiresAt });
    setPending(false); onOpenChange(false); router.push('/plans');
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <h3>Make something</h3>
      <form action={submit}>
        <div className="field"><label>Type</label><div className="chips">{TYPES.map(([v, l]) => <span key={v} className={`chip pick ${type === v ? 'on' : ''}`} onClick={() => setType(v)}>{l}</span>)}</div></div>
        <div className="field"><label>Title</label><input name="title" type="text" defaultValue={prefill?.title || ''} placeholder="Natural wine night" /></div>
        <div className="field"><label>Where</label><input name="location" type="text" placeholder="Ruffian, East Village" /></div>
        <div className="row" style={{ gap: 10 }}><div className="field" style={{ flex: 1 }}><label>Start</label><input name="start" type="datetime-local" defaultValue={defaultStart()} /></div><div className="field" style={{ flex: 1 }}><label>End</label><input name="end" type="datetime-local" /></div></div>
        <label className="row" style={{ gap: 9, margin: '0 0 14px' }}><input name="rec" type="checkbox" defaultChecked={!!prefill?.recurring} style={{ width: 'auto' }} /> <span className="muted">Repeats weekly (standing)</span></label>
        <div className="field"><label>Who can see it</label><div className="chips">{VIS.map(([v, l]) => <span key={v} className={`chip pick ${vis === v ? 'on' : ''}`} onClick={() => setVis(v)}>{l}</span>)}</div></div>
        <button className="btn solid block" disabled={pending}>Add to my calendar</button>
      </form>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: tap ＋ → create an event → lands in Plans. Intentions expire same day (disappear from Discover after 23:59).
```bash
git add -A && git commit -m "feat: Create sheet (intentions/plans/events)"
```

---

## Milestone M6 — Account-free pages, PWA, motion polish, verify

### Task 6.1: Account-free public pages

**Files:**
- Create: `app/u/[handle]/page.tsx`, `app/e/[id]/page.tsx`, `components/PublicCta.tsx`

- [ ] **Step 1: Write `app/u/[handle]/page.tsx`** (RSC + `generateMetadata` for OG) — port `view.js renderProfile()`. Uses `getProfileData(handle, viewerId)` with `viewerId` from session if present (else null). Renders banner + profile + "Going to" list + CTA. 404 via `notFound()` when missing/ghost.

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { getProfileData } from '@/lib/db/profile';
import Avatar from '@/components/primitives/Avatar';
import PublicCta from '@/components/PublicCta';
import { timeLabel } from '@/lib/format';

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params; const data = await getProfileData(handle, null);
  if (!data) return { title: 'Orbit' };
  return { title: `${data.user.displayName} · Orbit`, description: data.user.bio || 'on Orbit', openGraph: { title: data.user.displayName } };
}
export default async function PublicProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewerId = (await getSession()).userId ?? null;
  const data = await getProfileData(handle, viewerId);
  if (!data) notFound();
  const u = data.user;
  return (
    <div className="shell"><div className="main">
      <div className="banner" />
      <div className="pf-head">
        <Avatar user={{ ...u, initials: u.initials }} size="xl" className="pf-av" />
        <div className="pf-name">{u.displayName}</div><div className="pf-handle">@{u.handle}</div>
        {u.bio && <div className="pf-bio">{u.bio}</div>}
        {u.scenes?.length > 0 && <div className="chips" style={{ marginTop: 13 }}>{u.scenes.map((s: string) => <span key={s} className="chip">{s}</span>)}</div>}
        <div className="kicker" style={{ margin: '22px 0 6px' }}>Going to</div>
        {data.upcoming.length ? data.upcoming.map((e: any) => (
          <div className="up" key={e.id}><div className="when"><b>{new Date(e.startTime).getDate()}</b><span>{new Date(e.startTime).toLocaleDateString('en-US', { weekday: 'short' })}</span></div>
            <div className="body"><div className="t">{e.title}</div><div className="s">{timeLabel(e.startTime)}{e.location && ' · ' + e.location}</div></div></div>
        )) : <div className="empty" style={{ padding: 20 }}>Nothing public right now.</div>}
        <PublicCta label={`Follow ${u.displayName.split(' ')[0]} on Orbit`} />
      </div>
    </div></div>
  );
}
```

- [ ] **Step 2: Write `app/e/[id]/page.tsx`** (RSC + `generateMetadata`) — port `view.js renderEvent()`: load event via `getEventById`, enrich with `detail:true`, 404/`notFound()` if not content-visible to the viewer (session or null). Render the event card + attendee avatars + CTA.

- [ ] **Step 3: Write `components/PublicCta.tsx`** — the `cta()` block from `view.js:8-9` (link to `/`).

- [ ] **Step 4: Verify + commit**

Run: open `/u/ed` and `/e/<id>` while logged out — public content shows, private 404s. View source → OG title present.
```bash
git add -A && git commit -m "feat: account-free public profile + event pages (SSR + OG)"
```

### Task 6.2: PWA (Serwist)

**Files:**
- Create: `app/sw.ts`, `app/manifest.ts`, `public/icon-192.png`, `public/icon-512.png`
- Modify: `next.config.ts`

- [ ] **Step 1: Add Serwist to `next.config.ts`**

```ts
import withSerwistInit from '@serwist/next';
const withSerwist = withSerwistInit({ swSrc: 'app/sw.ts', swDest: 'public/sw.js' });
// wrap the existing config:
export default withSerwist(nextConfig);
```

- [ ] **Step 2: Write `app/sw.ts`**

```ts
import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';
declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: any };
const serwist = new Serwist({ precacheEntries: self.__SW_MANIFEST, skipWaiting: true, clientsClaim: true, navigationPreload: true, runtimeCaching: defaultCache });
serwist.addEventListeners();
```

- [ ] **Step 3: Write `app/manifest.ts`** (Next metadata route; ports the old webmanifest intent)

```ts
import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Orbit', short_name: 'Orbit', start_url: '/', display: 'standalone',
    background_color: '#0C0B10', theme_color: '#0C0B10',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 4: Generate PNG icons from `public/icon.svg`** (any rasterizer; e.g. `npx @resvg/resvg-js-cli public/icon.svg public/icon-512.png -w 512 -h 512` then 192). If tooling unavailable, export from the SVG manually. Confirm both files exist.

- [ ] **Step 5: Add the Cloudflare cache-header note** — append a comment to `wrangler.jsonc` reminding that to control `sw.js` cache headers under OpenNext, add `"run_worker_first": ["/sw.js"]` (Static Assets bypass the worker otherwise). Registration works without it.

- [ ] **Step 6: Verify + commit**

Run: `npm run build` then `npm run dev`; Chrome DevTools → Application → Manifest shows Orbit installable; service worker registers.
```bash
git add -A && git commit -m "feat: installable PWA via Serwist (manifest + offline shell)"
```

### Task 6.3: Motion polish

**Files:**
- Create: `components/MotionAvatarStack.tsx`
- Modify: `app/(app)/layout.tsx` (View Transitions already global via globals.css)

- [ ] **Step 1: Write `components/MotionAvatarStack.tsx`** — wrap `AvatarStack` with a lazy `motion` spring (stagger the overlapping avatars on mount) using `LazyMotion` + `m` to keep the bundle ~4.6 KB.

```tsx
'use client';
import { LazyMotion, domAnimation, m } from 'motion/react';
import type { PublicUser } from '@/lib/domain/types';
export default function MotionAvatarStack({ users }: { users: PublicUser[] }) {
  return (
    <LazyMotion features={domAnimation}>
      <div className="stack">
        {users.map((u, i) => (
          <m.span key={u.id} className="av sm" style={{ background: `linear-gradient(135deg,${u.avatar})`, marginLeft: i === 0 ? 0 : -8 }}
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 28, delay: i * 0.04 }}>{u.initials}</m.span>
        ))}
      </div>
    </LazyMotion>
  );
}
```

- [ ] **Step 2: Use `MotionAvatarStack` in `EventCard` proof cluster** (replace the static `.stack`). Leave View Transitions to handle route/tab changes (already enabled).

- [ ] **Step 3: Verify + commit**

Run: navigate between tabs (smooth cross-fade), open Discover (avatar clusters spring in). Honor reduced-motion.
```bash
git add -A && git commit -m "feat: motion polish (View Transitions + avatar-cluster spring)"
```

### Task 6.4: Final verification + deploy prep

- [ ] **Step 1: Full test + build**

Run: `npm test && npm run build`
Expected: all domain suites pass; production build succeeds with no type errors.

- [ ] **Step 2: Cloudflare preview build**

Run: `npm run preview:cf`
Expected: OpenNext builds the worker and serves locally; smoke-test login + Discover against it.

- [ ] **Step 3: Remote D1 migrate + seed (staging data)**

Run: `npm run db:migrate:remote && npm run db:seed:remote`
Expected: remote `orbit-db` has the demo graph.

- [ ] **Step 4: STOP — hand to Ed for E2E verification before any prod deploy** (per the project deploy rules). Provide the click-through list: log in (`ed`/`orbit`), Discover→Week→Month, RSVP, create an event → Plans, Regulars insight, Profile edit + share link, Circles accept/tier, `/u/ed` + `/e/<id>` logged out, install PWA. Set `SESSION_SECRET` as a Worker secret (`wrangler secret put SESSION_SECRET`) before deploy.

- [ ] **Step 5: Commit any fixes from verification**

```bash
git add -A && git commit -m "chore: pre-deploy verification fixes"
```

---

## Self-Review

**1. Spec coverage** — every spec §6 surface has a task: Auth (3.3), Discover (5.2), Week/Month (5.3), Plans (5.4), Regulars (5.5), You (5.6), Circles (5.6), Create (5.7), account-free `/u` + `/e` (6.1). Stack (spec §3): Next.js+TS+OpenNext (M0), D1+Drizzle (M1), iron-session+scrypt (M3), CSS Modules→globals.css ported (4.1), View Transitions+motion (6.3), Serwist (6.2), Base UI Sheet (4.2). Data model (spec §5) = schema.ts (1.1). Domain logic (spec §5) ported + unit-tested (M2). Testing (spec §11) = Vitest domain suites + manual E2E (6.4). Deploy rules honored (6.4 Step 4 stop-gate).

**2. Placeholder scan** — UI tasks 5.3/5.5/5.6 describe ports by exact `public/app.js` line ranges + the classes/props to preserve rather than re-pasting every line; this is concrete because the verbatim source is in the repo and the shared components (EventCard, Avatar, Pill, Sheet, Segmented) are fully specified in earlier tasks. No "TBD"/"add error handling"/"similar to" hand-waves.

**3. Type consistency** — `enrich()` returns `EnrichedEvent` consumed by `EventCard`/grids; `PublicUser` shape (id/handle/displayName/avatar/initials) is consistent across `helpers.ts`, `Avatar`, `EventCard`. `setRsvp(eventId, rsvp)`, `createEvent(input)`, `deleteEvent(id)` signatures match their callers (`RsvpButtons`, `CreateSheet`, `PlansClient`). `getSession().userId` used consistently. `CloudflareEnv.DB` (1.0 Step 3b) matches `getDb()` (1.2).

**Known intentional deferral:** `getProfileData` (5.6 Step 1), `WeekGrid`/`MonthGrid` (5.3), `PlansClient`/`RegularsView`/`CirclesView`/`ProfileView` (5.4–5.6) are specified as ports-with-contract rather than full pasted JSX, to keep the plan readable; each names its exact source render function, the data it receives, the CSS classes to reuse, and its acceptance check. The executor has the verbatim blueprints in `public/app.js`/`public/view.js`.
