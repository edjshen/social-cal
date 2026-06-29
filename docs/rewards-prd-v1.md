# Rewards & Loyalty — Product Requirements Document (v1)

**Status:** Draft for review
**Author:** Generated from a structured product interview, 2026-06-29
**Spans:** `poisys` (organizer OS, Supabase/Postgres) ⇄ `barycal` (partygoer app, Cloudflare D1/SQLite)
**Companion copy:** this file is mirrored at `barycal/docs/rewards-prd-v1.md` — keep both in sync.

---

## 0. TL;DR

Organizers on **poisys** designate events as *rewards-eligible* and push them to **barycal** with the
new **"Send to Barycal"** action. Partygoers on **barycal** discover those events (grouped by
organizer), show up, and **self-scan a rotating event QR** at the venue to earn **points**. Points
accrue in **two spendable currencies**: a **per-organizer** balance (a loyalty card — raw points
*and* named tiers Regular → Gold → VIP) **and** a **global** balance that is both a lifetime
status/leaderboard score and spendable against a **platform-wide (barycal-run) perks catalog**.
Organizers define a **per-org perks catalog** (free entry, skip-the-line, drink, merch); the platform
runs its **own catalog** that any partygoer can redeem with global points. Both redeem via a
**one-time redemption code**: org perks are honored by the organizer's door scanner, platform perks
by the barycal fulfillment path. Check-ins, points, and redemptions **sync back to poisys** so
organizers get full attendance & loyalty analytics. The integration itself is a headline selling
point for both products.

This PRD specifies **both sides** and the **cross-app bridge** between two independent backends.

---

## 1. Background & the core constraint

The two products are today **completely separate systems** with no shared data:

| | poisys | barycal |
|---|---|---|
| Audience | Event organizers & staff | Partygoers (individuals) |
| Stack | React 19 + Vite SPA, Cloudflare Worker, **Supabase/Postgres** | Next.js 16 on Cloudflare Workers, **D1/SQLite + Drizzle** |
| Identity | `auth.users` + `organization_memberships` | `users` (iron-session cookie auth) |
| Source of truth | `organizations`, `events`, `piece_instances` | `events`, `attendance`, `connections` |
| Existing check-in primitive | **Scene Pass** (`pass_redemptions`, `check_in_redemption` RPC) | none |
| Existing loyalty concept | none | **Regulars** (co-presence engine) |

**Implication:** "points for showing up to events organizers designate" is inherently a
*cross-product* feature. A partygoer (barycal identity) must check into an organizer's event
(poisys identity) and have points credited. Neither database can see the other directly, so v1
introduces a **thin, authenticated bridge** (Section 9). There is no shared login: partygoers never
need a poisys account, and organizers never need a barycal account.

### Decisions captured in the interview (the spine of v1)

| # | Decision | Choice |
|---|---|---|
| 1 | Proof of attendance | **Partygoer self-scans a rotating event QR** at the venue |
| 2 | How events reach barycal | **poisys "Send to Barycal"** publish action (poisys = source of truth) |
| 3 | Payoff for points | **Organizer-set perks catalog** |
| 4 | Where points live | **Both** — per-organizer balances **and** a global lifetime score |
| 5 | barycal "Organizations" tab | **Organizer-focused discovery**, list sorted by orgs with upcoming events |
| 6 | Point values | **Base attendance points + configurable bonuses** |
| 7 | Tab rework destination | Discover/Plans **fold into Calendar + Organizations** |
| 8 | Perk redemption | **One-time redemption QR/code**, scanned & honored by organizer staff |
| 9 | Data back to poisys | **Full attendance + analytics return sync** |
| 10 | Anti-fraud | **Rotating (TOTP-style) QR + event time window**, one claim per user |
| 11 | Bonuses in v1 | **All four:** attendance streak/regular, early RSVP, bring-a-friend, first-time |

### Confirmed in follow-up (the remaining four)

| # | Question | Decision |
|---|---|---|
| A | poisys Rewards tab scope | **All four surfaces:** per-event rule config, perks catalog manager, attendance & redemption analytics, redemption scanner |
| B | Tiers | **Both** — named tiers per org (Regular → Gold → VIP) **and** raw point balances are surfaced together |
| C | Global points purpose | **Spendable second currency** — a substantial **platform-wide perks catalog** (barycal-run) alongside per-org perks, **plus** status/leaderboard |
| D | Join model | **Automatic** — any partygoer with a barycal account earns on check-in; **no follow required** |

> Decision C is the largest scope change from the original draft: the global score is now a real,
> spendable currency with its own catalog and fulfillment path — see §6.7, §7, §8.3, §11.

---

## 2. Goals & non-goals

### Goals
- Give organizers a one-click way to turn an event into a rewards-earning, barycal-visible event.
- Give partygoers a tangible, low-friction reason to show up and come back: points → tiers → perks.
- Make the **poisys⇄barycal integration** a demonstrable selling point for both products.
- Preserve each product's hard invariants (poisys redaction/RLS/FLTZ; barycal visibility/privacy).
- Ship a defensible anti-fraud check-in that does not require GPS permissions in v1.

### Non-goals (v1)
- No money/payments inside the points economy. Perks (org **and** platform) carry no cash value and
  no payouts; they are fulfilled in-kind. Mercury/ticketing integration is out of scope.
- No transfer/gifting of points between users.
- No conversion between per-org and global currencies (you can't move points between the two pools).
- No retroactive points for pre-existing barycal events that didn't originate from poisys.
- No partygoer→poisys account merge or SSO.
- No native mobile app work beyond barycal's existing PWA (QR scanning uses the web camera API).

---

## 3. Personas

- **Organizer / Editor (poisys staff).** Runs events. Wants more turnout, repeat attendance, and
  data on who actually shows. Configures rewards, perks, and reads analytics.
- **Door staff (poisys collaborator).** Operates the redemption scanner at the door. Minimal UI.
- **Partygoer (barycal user).** Attends events. Wants status, perks, and an easy "I was here."
- **Platform admin (poisys).** Monitors abuse, can void fraudulent check-ins/points.

---

## 4. End-to-end user flows

### 4.1 Organizer publishes a rewards event (poisys)
1. Organizer opens an event (status `planning`+) and the new **Rewards** tab (or a Rewards panel on
   the event).
2. Toggles **"Rewards-eligible."** Sets **base points** (default suggested), toggles **bonuses**
   (streak, early RSVP, bring-a-friend, first-time) with point values, and attaches any **perks**
   from the org catalog that apply.
3. Clicks **"Send to Barycal."** poisys publishes a public event projection (title, when, venue
   name/area, organizer identity, point rules) to barycal via the bridge (Section 9).
4. A **venue QR** is provisioned for the event (rotating secret). Organizer can open the
   **"Door QR"** screen on any device at the venue, or print a static-fallback poster (see §8).

### 4.2 Partygoer earns points (barycal)
1. In **Organizations**, the partygoer sees organizers with upcoming events; opens an org; sees its
   upcoming rewards events; taps an event for detail; optionally RSVPs (RSVP unlocks early-RSVP
   bonus and feeds organizer forecasting).
2. At the venue during the event window, the partygoer taps **"Check in"** and **scans the rotating
   event QR** displayed on the venue screen.
3. barycal validates the rotating code + time window + one-claim-per-user, records a check-in,
   credits **base + qualifying bonus points** to the partygoer's **per-org balance** and **global
   score**, and may advance their **tier** with that org.
4. barycal posts the check-in back to poisys (return sync) so the organizer sees it live.

### 4.3 Partygoer redeems a perk (barycal → poisys door)
1. In **Organizations → {org} → Perks**, partygoer sees perks and their thresholds; eligible ones
   are redeemable.
2. Tapping **Redeem** debits points and generates a **one-time redemption code/QR** (short TTL).
3. At the door, **poisys staff** opens the **Redemption Scanner**, scans the code, the bridge
   verifies it's unused and valid, marks it redeemed, and the staff honors the perk.
4. Redemption reflects in poisys analytics and in the partygoer's history.

### 4.4 Organizer reviews analytics (poisys)
Rewards tab dashboards: check-ins per event, unique attendees, points issued, bonus breakdown,
tier distribution, top regulars, perks redeemed, suspected-fraud flags.

---

## 5. Feature spec — poisys (organizer side)

### 5.1 Navigation: new "Rewards" master-menu tab
- **File:** `apps/web/src/components/AppShell.tsx` — add a `NavItem` to the global left sidebar.
- Placement: staff-visible, after **Crew**, before **Marketplace** (matches existing grouping).
- **Feature-gated** like every other tab: add a `rewards` entitlement key (follow the `promotion`/
  `marketplace` entitlement pattern, e.g. mig 0064 style) so it can be rolled out per-org.
- Icon: a trophy/sparkle (lucide `Trophy`).
- Route: `/rewards`. Staff-only (`organizer`/`editor`); door staff get a scoped child route
  `/rewards/scan` (see 5.5).

```ts
// AppShell.tsx (sketch)
if (isStaff && show("rewards"))
  items.push({ to: "/rewards", label: "Rewards",
    icon: <Trophy className="h-4 w-4" aria-hidden />, active: path.startsWith("/rewards") });
```

### 5.2 Rewards tab surfaces (assumed default A — all four)
1. **Per-event rule config.** List of the org's events with a rewards toggle and rule editor. Base
   points + bonus toggles/values + eligibility window. Reachable both here and from the event
   canvas (a Rewards panel/piece — see 5.6 for the model decision).
2. **Perks catalog manager.** CRUD perks: title, description, **point cost**, **tier requirement**
   (optional), **inventory/limit** (optional, e.g. "first 50"), **per-user limit**, **validity
   window**, fulfillment note. Perks are **org-scoped** and can be attached to any rewards event.
3. **Attendance & redemption analytics.** Per-event and per-org dashboards (see 4.4). Built on the
   return-synced check-in/redemption data. Ties into existing CRM/analytics surfaces where natural.
4. **Redemption scanner** (`/rewards/scan`). Camera-based scanner for door staff (see 5.5).

### 5.3 "Send to Barycal" action
- Available on an event once it is **rewards-eligible** and at status `confirmed`+ (do **not** gate
  on the full confirm gate beyond eligibility — but the event must have a venue + door_date so
  barycal has something to show). Re-sending updates the projection (idempotent upsert by event id).
- Publishes a **public projection only** — never raw `piece_instances`, never Financials, never
  redacted fields. The projection is an explicit, allow-listed payload (Section 9.2), not a dump.
- Surfaces publish state on the event ("Live on Barycal · 42 checked in") and an **Unpublish**
  action (hides from barycal discovery; existing points are retained).

### 5.4 Point-rule model (base + bonuses)
Per rewards event the organizer configures:
- **Base points** — awarded on a valid check-in. Sensible platform default (e.g. 100), overridable.
- **Bonuses** (each independently toggleable with its own point value):
  - **Streak / regular** — Nth consecutive or Nth-in-window attendance with this org.
  - **Early RSVP** — RSVP'd ≥ X hours before doors (X org-configurable).
  - **Bring-a-friend** — a referred friend also checks in (referral attribution, see §7.4).
  - **First-time** — partygoer's first ever check-in with this org.
- Optional **per-event cap** on total points a single user can earn.

### 5.5 Redemption scanner (`/rewards/scan`)
- Minimal full-screen camera scanner usable by `organizer`/`editor` and a new scoped door role.
- Scans a partygoer's **one-time redemption QR** → calls the bridge verify-redemption endpoint →
  shows ✅ perk + partygoer display name, or ❌ reason (already used / expired / wrong org).
- Verification is **server-authoritative** (the bridge marks redeemed atomically; the scanner UI
  never decides validity).

### 5.6 Where rewards config lives in the poisys data model
Two viable homes; **recommendation: a dedicated table, not a canvas piece.**

- **Recommended — event-level config tables** (`event_reward_configs`, `reward_perks`,
  `reward_check_ins`, `reward_redemptions`). Rewards is operational/transactional data (ledgers,
  redemptions, analytics), not collaborative canvas content. Keeping it out of `piece_instances`
  avoids touching `redact_piece`, `guard_piece_data_shape`, visibility defaults, and the Yjs doc.
- **Alternative — a `rewards` optional piece** (copy the `promotion` 8th-piece template: mig 0059).
  Only do this if organizers want the *rule config* to live on the collaborative canvas. Even then,
  ledgers/redemptions must be separate tables. Given the transactional nature, v1 uses tables.

See Section 8 for the schema.

---

## 6. Feature spec — barycal (partygoer side)

### 6.1 Tab rework: calendar · organizations · regulars · profile
- **File:** `components/TabBar.tsx` (+ the `Icon` set in `components/primitives/Icon.tsx`).
- Today: `discover`, `plans`, **`calendar` (center create-button)**, `regulars`, `you`.
- **Target:** **Calendar** (keep as the center button), **Organizations**, **Regulars**,
  **Profile** (rename of `you` → route can stay `/you` or move to `/profile` with a redirect).
- **Discover** and **Plans** routes are removed from the tab bar; their content is **folded**:
  - **Discovery** → the new **Organizations** tab, reframed as *organizer-focused* discovery.
  - **Plans** (your RSVP'd events) → surfaced on **Calendar** (already a 92-day window) and on each
    org's detail page. Keep the routes redirecting for a release to avoid dead links.

```ts
// TabBar.tsx (target shape — calendar stays the center button)
const TABS = [
  { href: '/organizations', icon: 'organizations', label: 'Organizations' },
  { href: '/regulars',      icon: 'regulars',      label: 'Regulars' },
  // center: /calendar (existing "create" treatment)
  { href: '/you',           icon: 'you',           label: 'Profile' },
];
```
> Note: target is 4 nav targets — **Organizations, Regulars, Profile + the center Calendar button**.
> If you want Calendar as a normal (non-center) tab, that's a small layout change; flagged in §13.

### 6.2 Organizations tab (`/organizations`)
The reframed discovery surface. **Organizer-focused, not loose-event-based.**
- **Index:** a list/grid of **organizations**, **sorted by those with upcoming rewards events**
  (soonest first), then by the partygoer's relationship (orgs they have points with / follow rise).
  Each row: org name/avatar, next event datetime + venue area, your **tier badge** & point balance
  with them (if any), follow button.
- **Org detail (`/organizations/[slug]`):**
  - Header: org identity, your **per-org points** + **tier** (Regular → Gold → VIP) with progress to
    next tier, follow toggle.
  - **Upcoming events** (rewards-eligible, RSVP-able) — absorbs old Discover/Plans.
  - **Perks** — the org's catalog with point costs; eligible perks show **Redeem**.
  - **Your history** with this org (check-ins, points earned, redemptions).
- **Follow** is optional and only curates feeds/notifications. Per the join model, **any partygoer
  with a barycal account earns automatically on check-in** — no follow, join, or prior relationship
  required. (A walk-up with no account must create one to earn; see §7.6 on claim windows.)

### 6.3 Check-in (event QR self-scan)
- On an event detail page, during the **event window**, a **Check in** button opens the camera and
  scans the venue's **rotating event QR**.
- barycal validates via the bridge (Section 9): correct event, code within its rotation skew, inside
  the time window, not already claimed by this user. On success: credit points, show an animated
  points/tier confirmation, write to the local ledger, post check-in back to poisys.
- Graceful failures: outside window, already checked in, bad/expired code, camera denied.
- Accessibility/fallback: a numeric short-code entry as a backup to the camera (still rotating).

### 6.4 Points wallet & tiers
- **Two spendable balances**:
  - **Per-org balance** — earned at and spent at that org. Shown with **both** the raw point number
    **and** the named tier (decision B): the Organizations tab and org detail surface both.
  - **Global balance** — sum of points earned across all orgs; spendable on the **platform perks
    catalog** (§6.7). Also drives the **leaderboard / lifetime rank** on Profile.
- **Earned vs. spendable.** Tiers (per-org) and rank (global) derive from **lifetime *earned*** points
  so spending perks never demotes you; the **spendable** balance is earned minus redemptions. Track
  both as derived sums over the ledger.
- **Tiers per org** (decision B): organizer-defined thresholds map lifetime-earned points → named
  tier; tier can gate perks and shows as a badge in Organizations and on co-presence surfaces.
- Points are an **append-only ledger** (earn/spend/void/refund rows, each scoped to an org **or** to
  `platform`) — never a mutable counter — so balances are auditable and reversible (fraud voids).

### 6.5 Redemption (one-time code) — org **and** platform perks
- From any perk (org or platform), **Redeem** debits the matching balance (ledger spend row, guarded
  against insufficient balance / per-user limit / inventory) and issues a **single-use code/QR with
  short TTL**. UI shows a countdown.
- **Org perk** → "show this at the door"; marked **redeemed** only when **poisys staff scan** it
  (server-authoritative via bridge).
- **Platform perk** → honored by the **barycal fulfillment path** (§6.7): digital perks (partner
  codes, in-app unlocks) can auto-fulfill; physical/partner perks mark redeemed via a platform
  verification step. No poisys door scan involved.
- If a code expires unused, the spend is **refunded** (void + re-credit).

### 6.6 Profile (`/you` → "Profile")
- Adds: **global points + spendable balance + rank**, **per-org tier badges** (with raw balances),
  lifetime check-in count, recent perks, entry point to the **platform perks catalog** (§6.7).
- Existing profile content (bio, scenes, upcoming, regulars stats) stays.
- Reinforces the **Regulars** tie-in: tiers and points are the "scene status" layer atop co-presence.

### 6.7 Platform perks catalog (global currency payoff)
A substantial, **barycal-operated** rewards store spendable with **global** points — the cross-scene
payoff that makes attending *any* organizer's events feel cumulative.
- **Surface:** a catalog reachable from **Profile** (the global wallet). Not tied to one org.
- **Contents (examples):** platform/partner-funded perks — merch, partner discounts, early access to
  hyped events, profile cosmetics/badges, "scene VIP" cosmetic status. Carries no cash value (§2).
- **Catalog management:** owned by a **barycal platform admin** surface (new — barycal has no admin
  UI today; see §13 open question 11). Each perk: title, point cost, inventory/per-user limits,
  validity window, fulfillment type (`auto-digital` | `partner-code` | `manual`).
- **Fulfillment:** `auto-digital` unlocks instantly on redeem; `partner-code` reveals a code and
  marks redeemed; `manual` enters a platform fulfillment queue.
- **Optional global tier** (extension, not required for v1): global lifetime-earned points can power a
  barycal-wide "scene" status tier on Profile, parallel to per-org tiers (flagged in §13).

---

## 7. Points economy

### 7.1 Currencies (two pools, both spendable, no conversion)
- **Per-org points** — earned at an org's events; spent on **that org's** perks. The loyalty card.
- **Global points** — every earned point *also* adds to the global pool. The global pool is **both**
  a lifetime status/leaderboard score (from lifetime *earned*) **and** a spendable balance against
  the **platform perks catalog** (from earned minus platform redemptions).
- **No conversion** between pools — earning credits both at once; spending one never touches the
  other. (A single check-in earns N per-org points **and** N global points; they are separate ledgers
  drawn down independently.)

> **Design note — double-credit, not split.** A check-in credits the full amount to the per-org pool
> *and* the full amount to the global pool. This is deliberate: it keeps both loyalty loops strong
> without forcing partygoers to choose where points land. Confirm this vs. a split/single-pool model
> if the economics feel too generous (§13).

### 7.2 Earning (per valid check-in)
`points = base + Σ(active qualifying bonuses)`, capped by optional per-event/per-user caps.

| Bonus | Qualifies when | Notes |
|---|---|---|
| Streak / regular | Nth consecutive/in-window attendance with the org | Reuses barycal's regular logic spirit |
| Early RSVP | RSVP'd ≥ X h before doors, then checked in | RSVP without check-in earns nothing |
| Bring-a-friend | A referred friend also checks in | Referral attribution (§7.4) |
| First-time | First-ever check-in with this org | Mutually exclusive with streak |

### 7.3 Tiers (decision B — tiers **and** raw balances)
Organizer defines ordered thresholds (e.g. Regular 0 / Gold 1,000 / VIP 5,000). Tier is derived from
**lifetime per-org earned points** (not current spendable balance) so spending perks never demotes a
partygoer. Perks may require a minimum tier. Per decision B, the UI shows the **named tier and the
raw point number together** everywhere a balance appears (not the tier alone). An **optional global
tier** from lifetime global points is an extension (§6.7, §13).

### 7.4 Bring-a-friend attribution
- A partygoer shares an event invite carrying their referral token. If the invitee checks into that
  event, the referrer gets the bring-a-friend bonus (one per friend per event; friend must be a new
  check-in). Anti-abuse: friend must be a distinct, non-fraud-flagged account; cap referrals/event.

### 7.5 Integrity rules
- One earning check-in per user per event. Idempotent credit (safe against double-scan/retries) —
  credits **both** the per-org and the global ledgers atomically.
- All point mutations are ledger rows with a reason + source ref + scope (`org:<id>` | `platform`);
  balances are derived sums per scope.
- Admin/organizer can **void** a check-in or redemption → compensating ledger entry in **both**
  affected scopes; tier/rank recomputed.

### 7.6 Account requirement & claim window (decision D)
- Earning requires a **barycal account at check-in time**. Following/joining an org is **not**
  required — any account earns automatically on a valid scan.
- A walk-up without an account can't scan-to-earn. **Optional (flag in §13):** the venue QR's
  landing can prompt sign-up and award the just-scanned event's points on account creation within a
  short post-event **claim window**, so first-timers aren't lost. v1 may ship without retroactive
  claim and simply require an account first.

---

## 8. Data model

### 8.1 poisys (Supabase / Postgres) — new migration(s)
Write the next free numbered migration(s) per the repo's collision rules (idempotent bodies; renumber
on merge collisions). Grant **both** `authenticated` and `service_role`; add RLS; run
`get_advisors security` after DDL; regenerate `database.types.ts`.

```sql
-- event_reward_configs: per-event rule config (org-scoped, staff-managed)
create table if not exists public.event_reward_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  is_eligible boolean not null default false,
  base_points int not null default 100,
  bonuses jsonb not null default '{}',          -- {streak:{on,points,window}, early_rsvp:{on,points,hours}, ...}
  per_user_cap int,                              -- nullable
  published_to_barycal_at timestamptz,
  unique (event_id)
);

-- reward_perks: org-scoped catalog
create table if not exists public.reward_perks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  point_cost int not null check (point_cost >= 0),
  min_tier text,                                 -- nullable; named tier requirement
  total_inventory int,                           -- nullable = unlimited
  per_user_limit int,                            -- nullable
  active boolean not null default true,
  valid_from timestamptz, valid_to timestamptz,
  created_at timestamptz not null default now()
);

-- reward_tiers: org-defined thresholds
create table if not exists public.reward_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,                            -- 'Regular' | 'Gold' | 'VIP' | custom
  min_points int not null,
  sort int not null default 0,
  unique (organization_id, name)
);

-- reward_check_ins: return-synced from barycal (organizer analytics)
create table if not exists public.reward_check_ins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  barycal_user_ref text not null,                -- opaque barycal identity (not an auth.users id)
  display_name text,                             -- denormalized for analytics
  points_awarded int not null default 0,
  bonus_breakdown jsonb not null default '{}',
  checked_in_at timestamptz not null,
  source text not null default 'barycal',
  unique (event_id, barycal_user_ref)            -- one earning check-in per user per event
);

-- reward_redemptions: one-time codes verified by the door scanner
create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  perk_id uuid not null references public.reward_perks(id) on delete cascade,
  barycal_user_ref text not null,
  code_hash text not null,                       -- store a hash, never the raw code
  status text not null default 'issued',         -- issued|redeemed|expired|voided
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id)
);
```
> `barycal_user_ref` is an **opaque, stable handle** for a barycal user — poisys stores enough to do
> analytics and de-dupe, but it is **not** a poisys auth identity and carries no login. PII minimized
> to display name. Subject to the privacy decision in §11.

A small **`barycal_link` / event-projection** record (or columns on `events`) tracks publish state
and the rotating-QR secret (store the **secret server-side only**, in the Worker, not the browser).

### 8.2 barycal (D1 / SQLite, Drizzle) — new tables
Add to `lib/db/schema.ts` + a `drizzle/` migration (offline-generated). SQLite types.

```ts
// organizations mirrored from poisys (read-mostly projection)
export const organizations = sqliteTable('organizations', {
  id: text().primaryKey(),                 // = poisys organization_id (or a stable mapping)
  slug: text().unique(),
  name: text().notNull(),
  avatar: text(),
  bio: text(),
  poisysOrgRef: text(),                    // bridge handle
  createdAt: text(),
});

export const orgFollows = sqliteTable('org_follows', {
  id: text().primaryKey(),
  userId: text().notNull(),
  orgId: text().notNull(),
  createdAt: text(),
});

// rewards events projected from poisys (source of truth = poisys)
export const rewardEvents = sqliteTable('reward_events', {
  id: text().primaryKey(),                 // = poisys event_id
  orgId: text().notNull(),
  title: text().notNull(),
  venueArea: text(),
  startsAt: text(), endsAt: text(),
  basePoints: integer().notNull().default(100),
  bonuses: text({ mode: 'json' }).$type<Record<string, unknown>>().default({}),
  status: text(),                          // published|unpublished
});

// append-only points ledger. Two scopes per row so per-org AND global/platform
// balances derive from the same table. A check-in writes TWO rows: scope='org:<id>'
// and scope='platform' (the global pool), each with the full points amount.
export const pointsLedger = sqliteTable('points_ledger', {
  id: text().primaryKey(),
  userId: text().notNull(),
  scope: text().notNull(),                 // 'org:<orgId>' | 'platform'
  delta: integer().notNull(),              // + earn, - spend, +/- void/refund
  kind: text().notNull(),                  // 'earned' | 'spend'  (status/tier use earned-only)
  reason: text().notNull(),                // checkin|bonus:*|redeem|void|refund
  sourceRef: text(),                       // event id / redemption id
  createdAt: text().notNull(),
});

export const checkIns = sqliteTable('check_ins', {
  id: text().primaryKey(),
  userId: text().notNull(),
  eventId: text().notNull(),
  orgId: text().notNull(),
  pointsAwarded: integer().notNull().default(0),
  bonusBreakdown: text({ mode: 'json' }).default({}),
  createdAt: text().notNull(),
  // unique (userId, eventId) enforced via index
});

// platform-run perks (barycal-owned, NOT projected from poisys). Spent with global points.
export const platformPerks = sqliteTable('platform_perks', {
  id: text().primaryKey(),
  title: text().notNull(),
  description: text(),
  pointCost: integer().notNull(),
  fulfillment: text().notNull().default('auto-digital'), // auto-digital|partner-code|manual
  totalInventory: integer(),               // nullable = unlimited
  perUserLimit: integer(),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  validFrom: text(), validTo: text(),
  createdAt: text(),
});

export const redemptions = sqliteTable('redemptions', {
  id: text().primaryKey(),
  userId: text().notNull(),
  scope: text().notNull(),                 // 'org:<orgId>' (org perk) | 'platform' (platform perk)
  perkId: text().notNull(),                // reward_perks (org) or platform_perks (platform)
  codeHash: text().notNull(),
  status: text().notNull().default('issued'), // issued|redeemed|expired|voided
  fulfillment: text(),                     // copied from the perk for the redeem flow
  issuedAt: text().notNull(),
  expiresAt: text().notNull(),
  redeemedAt: text(),
});
```
Indexes: `check_ins(userId,eventId)` unique; `points_ledger(userId,scope)`; `reward_events(orgId,startsAt)`;
`platform_perks(active,validTo)`.

> **Source of truth.** Org perks/tiers/events = **poisys**, projected into barycal for display.
> **Platform perks = barycal** (no poisys projection). The **ledger, check-ins, redemptions** are
> authored in barycal (where the partygoer acts); org-scoped ones sync back to poisys, platform-scoped
> ones stay in barycal. This keeps each write where its actor lives and avoids two-master conflicts.

### 8.3 Platform perks management & admin (new for barycal)
Platform perks need an **admin surface barycal does not have today**. v1 options, smallest first:
1. **Seed/config-driven** — manage the catalog via a config table + internal tooling (no UI). Fastest.
2. **Minimal admin route** — a gated `/admin/perks` for platform staff (new role/flag on `users`).
3. **Full admin console** — broader platform ops surface (overkill for v1).
Recommendation: ship (1) or (2) for v1; the partygoer-facing redeem flow is identical regardless.
Platform perk **redemptions are verified by barycal** (server-authoritative), never the poisys door
scanner.

---

## 9. The cross-app bridge (poisys ⇄ barycal)

Two independent backends, no shared DB. v1 uses an **authenticated server-to-server HTTP bridge**;
the **poisys Cloudflare Worker** is the natural integration point (it already brokers external
integrations and holds platform secrets via `wrangler secret`). barycal also runs on Cloudflare
Workers, so this is Worker-to-Worker with a shared signing secret.

### 9.1 Trust model
- A **shared signing secret** (per environment) held only in each Worker's `wrangler secret` store —
  never in the browser, never in either DB. Requests are HMAC-signed + timestamped (replay window).
- Browsers never call the other product directly; all cross-app calls are Worker→Worker.
- The **rotating QR secret** for an event is derived server-side (TOTP-style) and never shipped to
  the partygoer client; the client only submits the scanned code for server validation.

### 9.2 Endpoints (minimum viable surface)
**poisys → barycal (publish):**
- `POST /bridge/events.upsert` — projection payload (allow-listed): `{event_id, org{id,name,slug,
  avatar}, title, venue_area, starts_at, ends_at, base_points, bonuses, perks[], tiers[]}`. Idempotent.
- `POST /bridge/events.unpublish` — `{event_id}`.
- `POST /bridge/perks.upsert`, `POST /bridge/tiers.upsert` — catalog projections.

**barycal → poisys (return sync):**
- `POST /bridge/checkins.report` — `{event_id, barycal_user_ref, display_name, points_awarded,
  bonus_breakdown, checked_in_at}`. Idempotent on `(event_id, barycal_user_ref)`.
- `POST /bridge/redemptions.issue` — notify a code was issued `{perk_id, barycal_user_ref,
  code_hash, expires_at}` (so the poisys scanner can verify offline-of-barycal if needed).

**poisys scanner → (verify redemption):**
- `POST /bridge/redemptions.verify` — `{code}` → atomically check unused+valid, mark redeemed,
  return `{ok, perk, display_name}`. Authoritative.

**Check-in validation** can be owned either by barycal (holds the rotating secret it received) or by
a poisys `POST /bridge/checkin.validate` call. **Recommendation:** barycal validates locally against
the event's rotating secret (lower latency, works if poisys is briefly unreachable) **then** reports
back; poisys treats the report as the analytics record. The rotating secret is delivered to barycal
in the publish payload over the signed channel and stored Worker-side only.

### 9.3 Identity mapping
- `barycal_user_ref` = a stable opaque token for a barycal user, minted by barycal, shared with
  poisys only through the bridge. Poisys never gets login capability — just an analytics handle +
  display name. (Privacy posture in §11; "counts only" is a supported variant per §13.)

### 9.4 Failure handling
- All bridge writes are **idempotent + retriable** with a small outbox/queue on each side; a check-in
  must never be lost or double-credited if the network blips. Local credit happens first
  (partygoer sees success), return sync is async with retry.

---

## 10. Anti-fraud (rotating QR + time window)

- **Rotating event QR (TOTP-style).** The venue screen shows a QR that refreshes every few seconds,
  encoding `eventId + rotating code` derived from a server-side secret. A screenshotted code expires
  almost immediately, defeating share-the-QR cheating without requiring GPS.
- **Time window.** Codes only validate during the event's check-in window (organizer-set, e.g. doors
  → close + grace).
- **One claim per user per event.** Enforced by unique `(userId, eventId)` and idempotent credit.
- **Static fallback poster** (optional, organizer choice): a fixed QR valid only in-window for venues
  without a screen — accepts some leakage, clearly the weaker mode.
- **Server-authoritative validation.** The client only submits the scanned code; accept/reject and
  point credit happen server-side.
- **Abuse signals & voids.** Rate-limit scans per device/IP; flag improbable patterns (same device
  many accounts, far-flung simultaneous check-ins); admin/organizer void → compensating ledger entry.
- **Bring-a-friend guards.** Referral bonus requires a distinct, established, non-flagged invitee;
  per-event referral cap.

---

## 11. Security & privacy

- **poisys invariants preserved.** No raw `piece_instances` cross the bridge; only the allow-listed
  public projection. Financials never published. Redaction/RLS untouched (rewards data is in its own
  tables with their own RLS: org staff read their org; service_role for the Worker).
- **barycal invariants preserved.** Points/tiers respect existing visibility norms; the leaderboard
  must honor `ghost` mode and not turn co-presence into a public dossier (echoes the Regulars
  privacy stance — "counts & faces, never a behavioral dossier").
- **Secrets.** Bridge signing secret + rotating-QR secret live only in Worker env
  (`wrangler secret`), never DB, never browser (mirrors poisys invariant #5).
- **Minimal cross-app PII.** Only `barycal_user_ref` + display name leave barycal. A privacy-stricter
  **"counts only"** mode (aggregate attendance, no per-user identity to poisys) is a supported config
  if desired (§13, open question 6). Platform-perk redemptions never touch poisys at all.
- **Two grants rule (poisys).** Grant new tables to **both** `authenticated` and `service_role`.
- **Auth re-verification (poisys Worker).** Continue the existing pattern: verify JWT + re-check
  membership before any organizer-side mutation.

---

## 12. Rollout & milestones

**M0 — Bridge skeleton.** Signed Worker-to-Worker channel, identity mapping, idempotent outbox. No UI.

**M1 — Publish path (poisys → barycal).** Rewards tab shell, per-event rule config, "Send to
Barycal," event projection visible in barycal Organizations tab. Tab rework lands (calendar/
organizations/regulars/profile; Discover/Plans fold in with redirects).

**M2 — Earning loop.** Rotating event QR (+ Door QR screen in poisys), barycal self-scan check-in,
points ledger, per-org balances + global score, return sync to poisys, basic organizer analytics.

**M3 — Tiers + org perks + redemption.** Per-org tier thresholds (with raw balances), org perks
catalog manager, barycal redemption codes, poisys door redemption scanner, redemption analytics.

**M4 — Platform perks + global wallet.** Platform perks catalog + admin surface (§8.3), global
spendable balance on Profile, platform redemption/fulfillment flow, leaderboard.

**M5 — Bonuses + hardening.** All four bonuses, bring-a-friend referrals, abuse signals/voids,
static-fallback mode, accessibility/short-code path, optional global tier + claim-window.

> Each milestone is independently demoable; the integration story is showable at M1. M4 (platform
> perks) is now first-class scope, not a stretch — sequence it before the leaderboard so the global
> currency has a payoff the moment it's visible.

---

## 13. Open questions / assumptions to confirm

**Resolved in the interview** (A–D, now baked in): Rewards tab = all four surfaces; tiers **and** raw
balances; global points spendable on a **platform-wide perks catalog**; earn automatically with any
barycal account. The remaining items:

1. **Double-credit economics (§7.1):** a check-in credits the full amount to **both** the per-org and
   the global pool. Confirm this generosity vs. a split or single-pool model.
2. **Platform perks ownership & funding:** who funds/curates the platform catalog (barycal ops,
   partners)? And the admin surface level (§8.3 — config-only, minimal `/admin/perks`, or full
   console)? PRD recommends config or minimal route for v1.
3. **Platform perk fulfillment mix:** which of `auto-digital` / `partner-code` / `manual` ship in v1?
   PRD assumes at least `auto-digital` + `partner-code`.
4. **Optional global tier:** should lifetime global points drive a barycal-wide "scene" status tier
   on Profile (parallel to per-org tiers), or is the leaderboard rank enough for v1?
5. **Claim window (§7.6):** ship retroactive points-on-signup for walk-ups, or require an account
   first with no retroactive claim in v1?
6. **Privacy posture:** full per-user attendance to poisys (richest analytics) vs. **counts-only**
   (no per-user identity crosses the bridge). PRD assumes full + `barycal_user_ref`; easy to switch.
7. **Org provisioning in barycal:** auto-create `organizations` from the poisys projection (PRD
   assumption, organizer can enrich) vs. organizer explicitly claims/curates the barycal presence.
8. **Calendar as center button vs. normal tab** in the reworked TabBar (cosmetic; PRD keeps center).
9. **Profile route:** keep `/you` (label "Profile") or migrate to `/profile` with a redirect.
10. **Rotating-QR display device:** assumes a venue screen/phone shows the Door QR; confirm every
    target venue can show a live screen, else lean on the static fallback.
11. **Entitlement/billing:** is Rewards a paid poisys entitlement (like marketplace/promotion) or on
    by default? PRD assumes feature-gated, rollout-controlled.

---

## 14. Success metrics
- **Activation:** % of confirmed events sent to barycal; orgs with ≥1 rewards event.
- **Earning loop:** check-ins per rewards event; check-in rate vs. RSVPs; repeat check-in rate.
- **Loyalty:** tier progression; share of attendees who are returning (regulars) per org.
- **Payoff:** org perks redeemed; **platform perks redeemed** & global-points spend rate;
  redemption→reattendance lift.
- **Integration pull:** orgs citing barycal reach as a reason to adopt; barycal MAU lift from org
  audiences; cross-org attendance (partygoers earning global points across ≥2 orgs).
- **Integrity:** fraud-void rate; suspected-abuse flags per 1k check-ins.

---

## 15. Touch-point index (for implementers)

**poisys**
- `apps/web/src/components/AppShell.tsx` — add Rewards nav item (entitlement-gated).
- `apps/web/src/` — new `/rewards` routes (config, perks, analytics, `/rewards/scan`).
- Event canvas — "Send to Barycal" + rewards rule panel (table-backed, not a piece).
- `apps/workers/` — bridge endpoints, rotating-QR secret, return-sync ingest, redemption verify.
- `supabase/migrations/00NN_*` — reward tables (§8.1) + RLS + grants; regenerate `database.types.ts`;
  run `get_advisors security`.

**barycal**
- `components/TabBar.tsx` + `components/primitives/Icon.tsx` — tab rework + `organizations` icon.
- `app/(app)/organizations/` — index (org-sorted-by-upcoming) + `[slug]` detail (events/perks/history).
- `app/(app)/you/` — global wallet (spendable + rank), per-org tier badges + raw balances, entry to
  platform perks (label → "Profile").
- `app/(app)/organizations/[slug]/` — org perks redeem UI; check-in scanner UI (camera) on event detail.
- **Platform perks**: partygoer catalog under Profile + admin surface (§8.3) + fulfillment flow.
- `lib/db/schema.ts` + `drizzle/` migration — reward tables incl. `platform_perks`, scoped ledger (§8.2).
- `workers/` — bridge client (signed), check-in validate + dual-scope credit, org+platform redemption
  issue/verify, return-sync push.
- Fold `discover`/`plans` content; keep redirecting routes for one release.
