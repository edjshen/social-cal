# Rewards & Loyalty — Product Requirements Document (v1)

**Status:** Draft for review
**Author:** Generated from a structured product interview, 2026-06-29
**Spans:** `poisys` (organizer OS, Supabase/Postgres) ⇄ `barycal` (partygoer app, Cloudflare D1/SQLite)
**Companion copy:** this file is mirrored at `barycal/docs/rewards-prd-v1.md` — keep both in sync.

---

## 0. TL;DR

Organizers on **poisys** designate events as _rewards-eligible_ and push them to **barycal** with the
new **"Send to Barycal"** action. Partygoers on **barycal** discover those events (grouped by
organizer), show up, and **self-scan a rotating event QR** at the venue to earn **points**. Points
accrue in **two independently-governed pools**:

- **Global points** — the **default, platform-governed** currency. Every valid check-in earns a
  barycal-set base plus barycal-set bonuses (e.g. cross-org streaks). Spendable on a **first-party
  platform perks catalog** (cosmetics, badges, giveaways) and the lifetime status/leaderboard score.
- **Per-org points** — **opt-in, set by the org admin**. An organizer chooses whether their events
  grant per-org points and how much (base + the four attendance bonuses). Spendable on **that org's**
  perks; drives that org's named tiers Regular → Gold → VIP. An org that runs no program simply
  grants 0 per-org points while its events still feed the global pool.

A check-in therefore writes a global grant **always**, and a per-org grant **only if the org opted
in** — not a mirrored double-credit. Org perks redeem via a **one-time redemption code** honored by
the organizer's door scanner; platform perks
by the barycal fulfillment path. Check-ins, points, and redemptions **sync back to poisys** so
organizers get full attendance & loyalty analytics. The integration itself is a headline selling
point for both products.

This PRD specifies **both sides** and the **cross-app bridge** between two independent backends.

---

## 1. Background & the core constraint

The two products are today **completely separate systems** with no shared data:

|                             | poisys                                                         | barycal                                                   |
| --------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| Audience                    | Event organizers & staff                                       | Partygoers (individuals)                                  |
| Stack                       | React 19 + Vite SPA, Cloudflare Worker, **Supabase/Postgres**  | Next.js 16 on Cloudflare Workers, **D1/SQLite + Drizzle** |
| Identity                    | `auth.users` + `organization_memberships`                      | `users` (iron-session cookie auth)                        |
| Source of truth             | `organizations`, `events`, `piece_instances`                   | `events`, `attendance`, `connections`                     |
| Existing check-in primitive | **Scene Pass** (`pass_redemptions`, `check_in_redemption` RPC) | none                                                      |
| Existing loyalty concept    | none                                                           | **Regulars** (co-presence engine)                         |

**Implication:** "points for showing up to events organizers designate" is inherently a
_cross-product_ feature. A partygoer (barycal identity) must check into an organizer's event
(poisys identity) and have points credited. Neither database can see the other directly, so v1
introduces a **thin, authenticated bridge** (Section 9). There is no shared login: partygoers never
need a poisys account, and organizers never need a barycal account.

### Decisions captured in the interview (the spine of v1)

| #   | Decision                    | Choice                                                                          |
| --- | --------------------------- | ------------------------------------------------------------------------------- |
| 1   | Proof of attendance         | **Partygoer self-scans a rotating event QR** at the venue                       |
| 2   | How events reach barycal    | **poisys "Send to Barycal"** publish action (poisys = source of truth)          |
| 3   | Payoff for points           | **Organizer-set perks catalog**                                                 |
| 4   | Where points live           | **Both** — per-organizer balances **and** a global lifetime score               |
| 5   | barycal "Organizations" tab | **Organizer-focused discovery**, list sorted by orgs with upcoming events       |
| 6   | Point values                | **Base attendance points + configurable bonuses**                               |
| 7   | Tab rework destination      | Discover/Plans **fold into Calendar + Organizations**                           |
| 8   | Perk redemption             | **One-time redemption QR/code**, scanned & honored by organizer staff           |
| 9   | Data back to poisys         | **Full attendance + analytics return sync**                                     |
| 10  | Anti-fraud                  | **Rotating (TOTP-style) QR + event time window**, one claim per user            |
| 11  | Bonuses in v1               | **All four:** attendance streak/regular, early RSVP, bring-a-friend, first-time |

### Confirmed in follow-up (the remaining four)

| #   | Question                 | Decision                                                                                                                                                                                                                             |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | poisys Rewards tab scope | **All four surfaces:** per-event rule config, perks catalog manager, attendance & redemption analytics, redemption scanner                                                                                                           |
| B   | Tiers                    | **Both** — named tiers per org (Regular → Gold → VIP) **and** raw point balances are surfaced together                                                                                                                               |
| C   | Two-pool economy         | **Global** = default, platform-governed (base + platform bonuses), spendable on a **first-party platform perks catalog**. **Per-org** = opt-in, org-admin-set (base + 4 bonuses), spendable on org perks. No mirrored double-credit. |
| D   | Join model               | **Automatic** — any partygoer with a barycal account earns on check-in; **no follow required**                                                                                                                                       |

**Platform-perks specifics (interview):** sources = **first-party (barycal) only** in v1 (model built
sponsorship-ready for later); catalog managed via a **full admin console**; **global** issuance is a
**platform base + platform-defined bonuses** (e.g. cross-org streak, attend-N-different-orgs),
independent of any organizer; sponsored placement is **designed-for but not billed** in v1.

> Decision C is the largest shift from the first draft: the economy is now **two independent issuance
> engines** — a platform-run global currency and an opt-in per-org currency — each with its own rules,
> catalog, and admin. See §5.4, §6.7, §7, §8.2–8.3, §11.

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

### 5.2 Rewards tab surfaces (confirmed — all four)

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

### 5.4 Point-rule model — **per-org only** (base + bonuses)

This config governs **only the org's own per-org pool** — it is opt-in. The **global** pool is
governed entirely by the platform (§7.2) and the organizer cannot change it. Per rewards event the
organizer configures:

- **Run a per-org program?** — off by default. If off, the event still feeds the global pool but
  grants 0 per-org points.
- **Base points** — awarded to the **per-org** balance on a valid check-in. Suggested default,
  overridable; may be set high or low at the org's discretion.
- **Bonuses** (each independently toggleable with its own point value, **per-org only**):
  - **Streak / regular** — Nth consecutive or Nth-in-window attendance with this org.
  - **Early RSVP** — RSVP'd ≥ X hours before doors (X org-configurable).
  - **Bring-a-friend** — a referred friend also checks in (referral attribution, see §7.4).
  - **First-time** — partygoer's first ever check-in with this org.
- Optional **per-event cap** on total per-org points a single user can earn.

> The organizer dial that matters: "do full points to the global _and_ my per-org pool, a little, or
> none?" Global is fixed by the platform; the org chooses how generous its own loyalty layer is.

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
  Only do this if organizers want the _rule config_ to live on the collaborative canvas. Even then,
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
  - **Discovery** → the new **Organizations** tab, reframed as _organizer-focused_ discovery.
  - **Plans** (your RSVP'd events) → surfaced on **Calendar** (already a 92-day window) and on each
    org's detail page. Keep the routes redirecting for a release to avoid dead links.

```ts
// TabBar.tsx (target shape — calendar stays the center button)
const TABS = [
  { href: '/organizations', icon: 'organizations', label: 'Organizations' },
  { href: '/regulars', icon: 'regulars', label: 'Regulars' },
  // center: /calendar (existing "create" treatment)
  { href: '/you', icon: 'you', label: 'Profile' },
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

- **Two balances from two engines**:
  - **Global balance** (always present) — accrues on every check-in from the **platform** rules;
    spendable on the **platform perks catalog** (§6.7); drives the **leaderboard / lifetime rank**.
  - **Per-org balance** (only where the org opted in) — accrues from that **org's** rules; spendable
    on that org's perks. Shown with **both** the raw point number **and** the named tier (decision B).
- **Earned vs. spendable.** Tiers (per-org) and rank (global) derive from **lifetime _earned_** points
  so spending perks never demotes you; the **spendable** balance is earned minus redemptions. Track
  both as derived sums over the ledger.
- **Tiers per org** (decision B): organizer-defined thresholds map lifetime-earned per-org points →
  named tier; tier can gate perks and shows as a badge in Organizations and on co-presence surfaces.
- Points are an **append-only ledger** (earn/spend/void/refund rows, each scoped to `org:<id>` **or**
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
payoff that makes attending _any_ organizer's events feel cumulative.

- **Surface:** a catalog reachable from **Profile** (the global wallet). Not tied to one org.
- **Sources (v1 = first-party only):** barycal-funded perks — profile cosmetics/badges, "scene VIP"
  flair, in-app status, occasional platform giveaways. Carries no cash value (§2). The schema is
  built **sponsorship-ready** (a `sponsor`/`source` field + placement slots) so partner-supplied and
  sponsored perks can be added later **without migration churn** — but no partner submission, billing,
  or org-contributed inventory ships in v1.
- **Catalog management — full admin console.** A first-class **barycal platform-admin** surface (new;
  barycal has no admin UI today — §8.3). Capabilities: perk CRUD; point cost; inventory & per-user
  limits; **scheduling** (validity windows, drops); **segmentation/targeting** (who sees a perk);
  fulfillment-type config; and **catalog analytics** (redemptions, point-sink volume, conversion).
- **Fulfillment types:** `auto-digital` unlocks instantly on redeem (cosmetics/badges — the v1
  workhorse); `partner-code` reveals a single-use code and marks redeemed (ready for later partner
  perks); `manual` enters a platform fulfillment queue (physical goods).
- **Global issuance is platform-defined** (§7.2): a platform base per check-in **plus platform
  bonuses** (e.g. cross-org streak, attend-N-different-orgs) — organizers have no control over it.
- **Optional global tier** (extension): global lifetime-earned points can power a barycal-wide "scene"
  status tier on Profile, parallel to per-org tiers (flagged in §13).

---

## 7. Points economy

### 7.1 Two pools, two engines, no conversion

- **Global points (default).** Governed entirely by the **platform**. Every valid check-in to any
  rewards event earns them. Spendable on the **platform perks catalog**; also the lifetime
  status/leaderboard score. Organizers cannot change the global grant.
- **Per-org points (opt-in).** Governed by the **org admin**. Earned only at that org's events, and
  only if the org runs a program. Spendable on that org's perks; drives its tiers.
- **No conversion** between pools, and **no mirrored double-credit**: a check-in writes a global grant
  (platform-sized) **always**, and a per-org grant (org-sized, possibly 0) **only if the org opted
  in**. The two are independent ledgers (`scope = 'platform'` vs `'org:<id>'`) drawn down separately.

> **Why this shape (decision #1).** The platform owns a baseline loyalty loop that works even for
> orgs that do nothing; organizers layer their _own_ loyalty program on top at whatever generosity
> they choose. "Full points to both pools" happens only when an org admin deliberately matches the
> platform grant — it is never automatic.

### 7.2 Earning (per valid check-in) — two independent grants

**Global grant (platform-defined):** `global = platform_base + Σ(platform bonuses)`.

| Global bonus (platform-set) | Qualifies when                                                   |
| --------------------------- | ---------------------------------------------------------------- |
| Cross-org streak            | Nth check-in across _any_ orgs within a window                   |
| Scene explorer              | Checked into N _different_ orgs                                  |
| (extensible)                | Platform can add global-only bonus rules without org involvement |

**Per-org grant (org-defined, only if the org opted in):**
`perOrg = org_base + Σ(active org bonuses)`, capped by optional per-event/per-user caps.

| Per-org bonus (org-set) | Qualifies when                                         | Notes                                 |
| ----------------------- | ------------------------------------------------------ | ------------------------------------- |
| Streak / regular        | Nth consecutive/in-window attendance with **this org** | Reuses barycal's regular logic spirit |
| Early RSVP              | RSVP'd ≥ X h before doors, then checked in             | RSVP without check-in earns nothing   |
| Bring-a-friend          | A referred friend also checks in                       | Referral attribution (§7.4)           |
| First-time              | First-ever check-in with **this org**                  | Mutually exclusive with streak        |

A single scan resolves **both** grants atomically and writes the matching ledger rows.

### 7.3 Tiers (decision B — tiers **and** raw balances)

Organizer defines ordered thresholds (e.g. Regular 0 / Gold 1,000 / VIP 5,000). Tier is derived from
**lifetime per-org earned points** (not current spendable balance) so spending perks never demotes a
partygoer. Perks may require a minimum tier. Per decision B, the UI shows the **named tier and the
raw point number together** everywhere a balance appears (not the tier alone). An **optional global
tier** from lifetime global points is an extension (§6.7, §13).

### 7.4 Bring-a-friend attribution

- A **per-org** bonus (only when the org enables it). A partygoer shares an event invite carrying
  their referral token. If the invitee checks into that event, the referrer gets the bring-a-friend
  bonus (one per friend per event; friend must be a new check-in). Anti-abuse: friend must be a
  distinct, non-fraud-flagged account; cap referrals/event.

### 7.5 Integrity rules

- One earning check-in per user per event. Idempotent credit (safe against double-scan/retries) —
  resolves the global grant **and** the per-org grant (if the org opted in) **atomically**.
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
  id: text().primaryKey(), // = poisys organization_id (or a stable mapping)
  slug: text().unique(),
  name: text().notNull(),
  avatar: text(),
  bio: text(),
  poisysOrgRef: text(), // bridge handle
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
  id: text().primaryKey(), // = poisys event_id
  orgId: text().notNull(),
  title: text().notNull(),
  venueArea: text(),
  startsAt: text(),
  endsAt: text(),
  basePoints: integer().notNull().default(100),
  bonuses: text({ mode: 'json' }).$type<Record<string, unknown>>().default({}),
  status: text(), // published|unpublished
});

// append-only points ledger. Two scopes per row so per-org AND global/platform
// balances derive from the same table. A check-in writes TWO rows: scope='org:<id>'
// and scope='platform' (the global pool), each with the full points amount.
export const pointsLedger = sqliteTable('points_ledger', {
  id: text().primaryKey(),
  userId: text().notNull(),
  scope: text().notNull(), // 'org:<orgId>' | 'platform'
  delta: integer().notNull(), // + earn, - spend, +/- void/refund
  kind: text().notNull(), // 'earned' | 'spend'  (status/tier use earned-only)
  reason: text().notNull(), // checkin|bonus:*|redeem|void|refund
  sourceRef: text(), // event id / redemption id
  createdAt: text().notNull(),
});

export const checkIns = sqliteTable('check_ins', {
  id: text().primaryKey(),
  userId: text().notNull(),
  eventId: text().notNull(),
  orgId: text().notNull(),
  globalAwarded: integer().notNull().default(0), // platform grant (always)
  orgAwarded: integer().notNull().default(0), // per-org grant (0 if org didn't opt in)
  bonusBreakdown: text({ mode: 'json' }).default({}), // {global:{...}, org:{...}}
  createdAt: text().notNull(),
  // unique (userId, eventId) enforced via index
});

// platform issuance rules (barycal-set global engine). Single active row + history.
export const globalRewardRules = sqliteTable('global_reward_rules', {
  id: text().primaryKey(),
  basePoints: integer().notNull().default(100), // per valid check-in
  bonuses: text({ mode: 'json' }).$type<Record<string, unknown>>().default({}), // cross-org streak, scene explorer, ...
  active: integer({ mode: 'boolean' }).notNull().default(true),
  updatedAt: text(),
});

// platform-run perks (barycal-owned, NOT projected from poisys). Spent with global points.
// v1 = first-party only; schema is sponsorship-ready (source/sponsor + placement) for later.
export const platformPerks = sqliteTable('platform_perks', {
  id: text().primaryKey(),
  title: text().notNull(),
  description: text(),
  pointCost: integer().notNull(),
  fulfillment: text().notNull().default('auto-digital'), // auto-digital|partner-code|manual
  source: text().notNull().default('first-party'), // first-party|sponsor|partner|org  (v1: first-party)
  sponsorId: text(), // nullable; reserved for sponsored placement (no billing v1)
  placement: integer().default(0), // ordering/feature slot, reserved for sponsorship
  segment: text({ mode: 'json' }).default({}), // targeting rules (who sees it)
  totalInventory: integer(), // nullable = unlimited
  perUserLimit: integer(),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  validFrom: text(),
  validTo: text(), // scheduling / drops
  createdAt: text(),
});

export const redemptions = sqliteTable('redemptions', {
  id: text().primaryKey(),
  userId: text().notNull(),
  scope: text().notNull(), // 'org:<orgId>' (org perk) | 'platform' (platform perk)
  perkId: text().notNull(), // reward_perks (org) or platform_perks (platform)
  codeHash: text().notNull(),
  status: text().notNull().default('issued'), // issued|redeemed|expired|voided
  fulfillment: text(), // copied from the perk for the redeem flow
  issuedAt: text().notNull(),
  expiresAt: text().notNull(),
  redeemedAt: text(),
});
```

Indexes: `check_ins(userId,eventId)` unique; `points_ledger(userId,scope)`; `reward_events(orgId,startsAt)`;
`platform_perks(active,validTo)`; `platform_perks(source,placement)`.

> **Source of truth.** Org perks/tiers/events = **poisys**, projected into barycal for display.
> **Platform perks + global reward rules = barycal** (no poisys projection). The **ledger, check-ins,
> redemptions** are authored in barycal (where the partygoer acts); org-scoped ones sync back to
> poisys, platform-scoped ones stay in barycal. Each write lives where its actor acts — no two-master.

### 8.3 Platform admin console (new for barycal — decision: full console)

Per the interview, v1 builds a **full platform-admin console**, not a config stub. barycal has **no
admin surface today**, so this is net-new:

- **Auth/role:** a new platform-staff role/flag (e.g. `users.platformRole`) gating an `/admin/*` area;
  iron-session checks server-side on every admin route + action.
- **Catalog management:** perk CRUD; point cost; inventory & per-user limits; **scheduling** (validity
  windows / timed drops); **segmentation/targeting** (`segment` rules — who sees a perk);
  fulfillment-type config; `source`/`sponsor`/`placement` fields (sponsorship-ready, unbilled in v1).
- **Global economy controls:** edit `global_reward_rules` (base + platform bonuses); preview impact.
- **Catalog analytics:** redemptions, point-sink volume, conversion, inventory burn-down.
- **Moderation/ops:** void fraudulent check-ins/redemptions; inspect a user's ledger.
- **Fulfillment queue:** work `manual` redemptions; reveal/rotate `partner-code` stock (for later).

Platform-perk **redemptions are verified by barycal** (server-authoritative), never the poisys door
scanner. The partygoer-facing redeem flow is identical regardless of admin depth.

> **Scope flag (§13):** the full console is the single largest net-new build on the barycal side. If
> timeline pressures, a phased path is config-table → minimal `/admin/perks` → full console, with the
> partygoer flow unchanged throughout.

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

**M1 — Publish path (poisys → barycal).** Rewards tab shell, mark **rewards-eligible** + "Send to
Barycal," event projection visible in barycal Organizations tab. (Eligible events feed the global
pool by default; the per-org rule editor lands in M3.) Tab rework lands (calendar/organizations/
regulars/profile; Discover/Plans fold in with redirects).

**M2 — Earning loop (global pool).** Rotating event QR (+ Door QR screen in poisys), barycal
self-scan check-in, the **global** issuance engine (`global_reward_rules`) + scoped ledger, global
balance on Profile, return sync to poisys, basic organizer analytics. (Per-org grants can be 0 here.)

**M3 — Per-org pool: tiers, perks, redemption.** Org opt-in rule config + 4 bonuses, per-org tier
thresholds (with raw balances), org perks catalog manager, barycal redemption codes, poisys door
redemption scanner, redemption analytics.

**M4 — Platform perks + admin console.** First-party platform perks catalog, the **full barycal
platform-admin console** (§8.3 — catalog, scheduling, segmentation, global-economy controls,
analytics, moderation), platform redemption/fulfillment (`auto-digital` first), leaderboard.

**M5 — Bonuses + hardening + sponsorship-ready.** Platform global bonuses (cross-org streak, scene
explorer) + per-org bring-a-friend referrals, abuse signals/voids, static-fallback mode,
accessibility/short-code path, optional global tier, claim-window, `partner-code`/`manual`
fulfillment paths wired (still unbilled).

> Each milestone is independently demoable; the integration story is showable at M1. Note the global
> pool (M2/M4) is the **default** loyalty loop and ships before the org-configured per-org pool (M3)
> matters — an org doing nothing still produces global points and a platform-perk payoff. The full
> admin console (M4) is the largest net-new barycal build; phase it if needed (§8.3).

---

## 13. Open questions / assumptions to confirm

**Resolved in the interview** (now baked in): Rewards tab = all four surfaces; tiers **and** raw
balances; **two-pool economy** — global is the default platform-governed currency (base + platform
bonuses) on a **first-party platform perks catalog**, per-org is opt-in and org-admin-set; platform
catalog managed via a **full admin console**, built **sponsorship-ready but unbilled**; earn
automatically with any barycal account. The remaining items:

1. **Global issuance values:** the actual numbers — platform base per check-in, and which global
   bonuses (cross-org streak, scene explorer) ship in v1 and at what weights. Needs an economy pass.
2. **Sponsorship timing:** v1 is first-party-only with a sponsorship-ready schema. When do partner/
   sponsored perks (and any billing) actually turn on — and does org-contributed inventory ever join?
3. **Admin console phasing:** full console is the largest barycal build. Ship full in v1, or phase
   config → minimal `/admin/perks` → full (§8.3) to unblock the earning loop sooner?
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
- **Platform perks**: first-party catalog under Profile + redeem/fulfillment flow.
- **`app/admin/*` — NET-NEW full platform-admin console** (§8.3): perk CRUD, scheduling, segmentation,
  `global_reward_rules` editor, catalog analytics, moderation, fulfillment queue. New platform-staff
  role/flag + server-side session gating (barycal has no admin surface today).
- `lib/db/schema.ts` + `drizzle/` migration — reward tables incl. `platform_perks` (sponsorship-ready
  fields), `global_reward_rules`, scoped `points_ledger` (§8.2).
- `workers/` — bridge client (signed), check-in validate + **dual-grant** credit (global always,
  per-org if opted in), org+platform redemption issue/verify, return-sync push.
- Fold `discover`/`plans` content; keep redirecting routes for one release.
