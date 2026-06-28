# Barycal — Product Requirements Document

**Name:** Barycal _(formerly Orbit)_
**One-liner:** Your social calendar is your profile. Share it with the people you care about, see what your circles are up to this week, and the same faces recurring become your community.
**Doc owner:** Ed
**Status:** Draft v0.4 — key decisions locked (see §0.1)
**Platform:** PWA (MVP) → native iOS/Android (v1)

> **The product in one breath.** Barycal is a **personal social calendar** centered on **community through repeated exposure**, built on the _everyday_ texture of social life (lunches, the gym, coffee, the Tuesday hang). Three stacked layers: a future-tense **calendar-as-profile**; **discovery through your people**; and a **Regulars** engine that turns incidental co-presence into real community. Events are **created natively in Barycal** (Google Calendar is an optional seed). Availability is a quiet utility. Letting **organizations** (PLUR, SAM, clubs) push events onto members' calendars is a **paid feature**, not the core.

---

## 0. Version notes

### 0.1 Decisions locked in this version

| #   | Decision                 | Choice                                                                                        |
| --- | ------------------------ | --------------------------------------------------------------------------------------------- |
| 1   | Name                     | **Barycal**                                                                                   |
| 2   | Primary product          | **Sharing personal social calendars, peer-to-peer**                                           |
| 3   | Home screen              | **Discover** — this week, with social proof                                                   |
| 4   | Events model             | **Created natively in Barycal** (exclusive to it); Google Calendar = optional **seed/import** |
| 5   | Privacy model            | **Tiered by circle** — Inner Circle sees event content; Outer sees free/busy                  |
| 6   | Discovery scope (MVP)    | **Friends only** — no external/city import                                                    |
| 7   | Regulars visibility      | **Private to you**; nudges a **standing plan**                                                |
| 8   | Account-free depth       | **View + soft-RSVP** without an account                                                       |
| 9   | Core actions             | **Join + make plans + standing (recurring) plans**                                            |
| 10  | Availability (free/busy) | **Quiet utility** — used inside make-a-plan, not a hero                                       |
| 11  | Google Calendar          | **Optional** — seeds your calendar + availability; not required                               |
| 12  | Profile contents         | **Upcoming + bio/scenes**                                                                     |
| 13  | Org/host event-injection | **Paid B2B2C feature** (sold to groups), not the MVP engine                                   |
| 14  | Center of gravity        | **Everyday, personal calendar sharing**; orgs are a paid expansion                            |

### 0.2 What changed across versions

- **v0.1 → v0.2:** north star from _plans-that-happened_ → **recurring co-presence**; hero from _availability_ → **profile + discovery + Regulars**; privacy from free/busy-only → **content, tiered by circle**.
- **v0.3:** **everyday-first** — ordinary interactions are the fabric; brought back **Status/Intention**; kept **free/busy** as a utility.
- **v0.4 (this version):** **personal calendar sharing is the core** (not host-as-engine); **events are Barycal-native**, Google Calendar is a seed; **org event-injection is a paid tier** (§11). Cold-start re-based on peer virality + your personal graph (§10).

Inherited from v0.1 unless noted: tech architecture, OAuth scope strategy, PWA constraints. See §13 for deltas.

---

## 1. TL;DR

Instagram is a museum of the past — proof of what you already did. A calendar points the other way: a future-tense, _actionable_ record of what you're about to do. That makes it a far better social object, because "you're going to that? I'm in" turns a profile view into a plan. A photo grid can't.

Barycal is your **personal social calendar, made shareable** — a future-tense profile of what you're up to that you share with the people you care about, tier by tier. You open it to **Discover** what your circles are doing this week (everyday or out), join with a tap or spin up a low-friction plan, and over time Barycal surfaces your **Regulars** — the people you keep ending up around — and nudges them into standing plans. The substance is **everyday**: lunches, workouts, coffee, the standing Tuesday hang. Everyday recurrence is exactly the soil community grows in, and turning acquaintances into regulars is the whole job.

Events are **created in Barycal** and live there; connecting Google Calendar is an optional convenience that seeds your week and powers availability. Growth is **peer-to-peer** — shareable profiles and account-free RSVP pull your friends in — seeded by your own dense communities. Later, **organizations** (PLUR.NYC, SAM, clubs, run crews) can pay to push their events onto members' shared calendars — a distribution-and-revenue feature layered on top of a product that already works for individuals.

Beachhead: the NYC social graph already reachable through PLUR.NYC and SAM — dense, pre-connected, taste-driven.

---

## 2. Thesis: community is a byproduct of repeated exposure

**The mechanism.** Proximity and repetition, not compatibility, create relationships (Festinger's propinquity effect; Zajonc's mere-exposure effect). You grow close to the people you keep incidentally encountering — the regulars. Friendship precipitates out of recurrence; it is almost never engineered directly. **Everyday** life is where that recurrence happens, which is why Barycal is everyday-first.

**The failure of everyone else.** Social products engineer the _connection_ — feeds, follower graphs, suggestions, matching — and optimize reach and engagement. A feed gives you a thousand weak, one-way exposures to people you'll never share a room with. Barycal inverts the target: **engineer recurrence, not connection.** Make the same real people keep showing up in each other's actual lives, and community forms on its own.

**Three stacked layers:**

- **Calendar-as-profile** — your future-tense identity. What you're into, expressed by where you're going. Browseable, account-free-viewable, screenshot-worthy — the social object that replaces the IG profile, but _forward-pointing and therefore joinable_.
- **Discovery through your people** — find things to do (everyday or out) by seeing what your circles are up to this week, with social proof ("who you know is going").
- **Regulars** — Barycal makes recurring overlaps _visible_ ("you've seen Maya 3×") and _actionable_ (a standing plan), turning incidental co-presence into a named, growing community.

**Positioning, one line:** the everyday, future-tense personal social calendar that routes discovery through your people and is engineered to make the same faces recur until they're a community — where Instagram is past-tense and solitary, Partiful is episodic and amnesiac, and Howbout is a utility with no identity, discovery, or community model.

---

## 3. Competitive landscape

| Product                     | Owns                                                                | Misses                                                                                                   |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Instagram / TikTok**      | Identity, discovery, reach                                          | Past-tense; not joinable; performative; no calendar truth                                                |
| **Partiful**                | Beautiful one-off event pages; Gen-Z/NYC default; frictionless RSVP | Episodic, _amnesiac_ — no memory of who you keep seeing; no profile, no everyday, no community accretion |
| **Luma**                    | Sleek pages, ticketing, recurring                                   | Professional/cold; organizer tool, not a personal identity surface                                       |
| **Howbout**                 | Everyday friend-group availability, polls, widget                   | A utility; no identity/profile, no discovery, no community model, no design soul                         |
| **Geneva / Discord**        | Community containers, chat                                          | No calendar truth; chat-first, high-maintenance, not ambient                                             |
| **Google / Apple Calendar** | Source of truth, ubiquity                                           | Solitary, sterile, no social model                                                                       |

**White space:** a future-tense _personal calendar_ that is (1) design-forward enough to be your public face, (2) plugged into your people's calendars for everyday discovery, (3) built to maximize _repeated exposure to the same people_, and (4) cheap to seed peer-to-peer. No incumbent holds even two corners together. Partiful is closest on identity/events but amnesiac — no concept of "the people you keep seeing," which is the whole point.

**Defensibility:** the **co-presence graph** (who keeps ending up around whom — impossible to backfill, stickier each week), **identity lock-in** (your calendar becomes your social face), and a **community-seeded graph** (your dense pre-connected pockets, later widened by the paid org tier).

---

## 4. Design philosophy: "engineer recurrence, not engagement"

The soul carries from v0.1's "intentional," sharpened: Barycal _embraces_ discovery and identity (they serve real-world recurrence) while refusing engagement-bait. One test governs everything:

> **Does this make the same real people more likely to be in the same room again?** If yes, ship it. If it only raises time-in-app, cut it.

- **Everyday-first, ultra-low friction.** The common case is "free for lunch, who's around?" — two taps, not an event-creation wizard. Friction is the enemy of recurrence.
- **Forward-tense and joinable.** Identity is what you're _going to do_, and every expression is an open door. A face, not a stage — no vanity counts as a goal.
- **Discovery in service of meeting, not scrolling.** There _is_ a Discover home (a reversal from v0.1), but it's bounded — "this week," finite — and oriented to action. No infinite feed.
- **Memory of co-presence — a deliberate, narrow past tense.** Barycal remembers who you've been around (to power Regulars); almost nothing else. Threads and statuses fade; the recurrence graph persists, because it _is_ the product.
- **Calm notifications.** Batched digest at a time you pick. Real-time only for convergence ("3 of your regulars are converging on lunch").
- **Density over reach.** The unit is the _circle/pocket_, not the dyad and not the global network.
- **Soft commitment.** RSVP is a gradient (Down / Maybe / Can't), so tentative everyday plans form earlier and recur more easily.
- **Beauty is a feature.** Profile and event pages must clear "a designer would screenshot this." References: Partiful's warmth, Luma's dark sophistication, Amie/Notion Calendar's editorial calm — synthesized, decluttered.

---

## 5. Core concepts & vocabulary

- **Profile** — your future-tense identity: what you're going to (by visibility tier) + a short bio + your scenes. Account-free-viewable, shareable, screenshot-worthy.
- **Discover** — the home. This week's events _and_ everyday openings from your people, chronological, with social proof.
- **Intention / Status** — the everyday on-ramp: a lightweight, expiring broadcast ("free for lunch," "gym at 6, join?") to a chosen tier. The lowest-friction way to create a hang.
- **Plan** — a concrete hang you spin up (invite, soft-RSVP, optionally write to Google). **Standing plans** (recurring) are first-class — Tuesday lunch, Sunday run.
- **Event** — a first-class, _joinable_ object you create **in Barycal**, with a page and who's-going. (Organizations can create events too — that's the paid tier, §11.)
- **Regulars** — _the hero magic._ The people you keep ending up around, surfaced privately from overlapping presence; nudges you toward a standing plan.
- **Circles & visibility tiers** — your graph in closeness tiers: **Inner Circle** sees event _content_; **Outer circle** sees _free/busy_ only. One-tap ghost mode.
- **The Scene** — an organization's surface (PLUR, SAM, a run crew) that pushes events to members. A **paid** product (§11), the Poiesis bridge.

---

## 6. Information architecture

```
Home  ·  view switcher: Discover / Week / Month
├── Discover: this week's events + everyday openings from your people, with social proof
├── Week:  your time grid (Chronos) — color-coded by type, open evenings celebrated
├── Month: overview grid — type-coded dots, days your circle converges → tap a day for its agenda
└── Join → soft-RSVP → lands on your calendar & profile

Profile (your identity surface)
├── What I'm going to (future-tense, by visibility tier)
├── Bio + my scenes
├── My Regulars (private to me)
└── Share link (account-free viewable)

Plans
├── Set an Intention / Status (everyday on-ramp)
├── Make a plan / Standing plan (recurring)
├── Plan page (who's in, soft RSVP, ephemeral thread)
└── Past (fades; co-presence memory retained)

Regulars (private)
├── Familiar faces — you've been around N times
├── Nudge → "make it a standing thing?"
└── Scenes you're becoming a regular of

You
├── Connect Google Calendar (optional — seeds week + availability)
├── Circles & visibility tiers + ghost mode
├── Notification cadence
└── Theme / appearance
```

---

## 7. MVP feature specifications

**F1 — Profile (calendar-as-identity).** Public-by-link, future-tense profile: upcoming (by visibility tier) + bio + scenes. Account-free viewable; screenshot-worthy; the primary share/growth surface.
_Acceptance:_ a stranger opens your link, grasps who you are _by where you're going_, and can follow or join a public event with no account.

**F2 — Discover (home) + Week/Month views.** This week's events _and_ everyday openings from your people, chronological, each with social proof ("who you know is going / who's free"). Bounded, not an infinite feed. The home toggles between three views: **Discover** (the social default), **Week** (a Chronos time grid that celebrates open evenings), and **Month** (an overview grid that flags the days your circle is converging).
_Acceptance:_ with ≥3 connections, the user finds one real thing to do _and_ sees who they'd know there, in under 15 seconds.

**F3 — Create events (Barycal-native) + Google seed/import.** Anyone can create an event in Barycal in under a minute (title, when, where, cover, visibility) — events live in Barycal and are the shareable social layer. Connecting Google **imports** existing commitments to seed your week and availability; it is not the source of truth for social events.
_Acceptance:_ a user creates a Barycal event fast; if they connect Google, their existing commitments appear without manual entry; created events never silently leak to Google unless the user writes them back (F8).

**F4 — Intention / Status.** Two-tap everyday broadcast ("free for lunch," "gym at 6, join?") to a chosen tier; auto-expires. The lowest-friction path into a hang; shows up ambiently on friends' Discover.
_Acceptance:_ setting an intention takes two taps; friends see it this-week; it disappears on its own.

**F5 — Plans + standing plans.** Spin up a hang (invite, soft-RSVP) — and **recurring/standing plans** that auto-propose the next slot from the group.
_Acceptance:_ "want to see these people" → sent plan in under a minute; a standing plan re-proposes itself with no re-organizing.

**F6 — Regulars (repeated-exposure engine).** _Private to you._ Surfaces the people you keep co-occurring with (everyday + events) and nudges a standing plan. Warm, never surveillant.
_Acceptance:_ after sharing ≥3 occasions with someone, they appear as a Regular with a one-tap "make it a standing thing"; visible only to you.

**F7 — Circles + tiered visibility.** Inner Circle (sees content) / Outer (sees free/busy); conservative defaults; one-tap ghost mode.
_Acceptance:_ a user trusts the model in under a minute; every item's audience is obvious and changeable in one tap.

**F8 — Soft-RSVP + account-free RSVP + optional write-back.** Down / Maybe / Can't on any event/plan; non-users can view and soft-RSVP via link (install nudge after). If Google is connected, the user may write a confirmed plan to their Google Calendar.
_Acceptance:_ a non-user RSVPs from a shared link with no account; a connected user can opt to mirror a plan into Google.

**F9 — Google Calendar (optional connect).** Barycal is fully usable standalone. Connecting Google **seeds** your week from existing commitments and enables the **free/busy availability utility** (F10). Scopes requested just-in-time.
_Acceptance:_ a user is fully functional without connecting; connecting visibly enriches Discover and plan-making within seconds.

**F10 — Availability utility (free/busy).** _Quiet utility, not a screen._ Used inside make-a-plan to suggest times that work, and to power the Outer-tier "free/busy" visibility. No availability home screen.
_Acceptance:_ the slot suggester respects everyone's free/busy without exposing Inner-Circle-only content to the Outer tier.

**F11 — Ephemeral plan thread** (Mayfly substrate; fades after the event) · **F12 — Slow notifications** (batched; real-time only for convergence) · **F13 — PWA install** (guided, Safari-aware).

---

## 8. Feature scope matrix

| Feature                                       | MVP (PWA)    | v1 (native) | Vision |
| --------------------------------------------- | ------------ | ----------- | ------ |
| Profile (calendar-as-identity)                | ●            | ●           | ●      |
| Discover (home, social proof)                 | ●            | ●           | ●      |
| Week & Month calendar views                   | ●            | ●           | ●      |
| Create Barycal-native events                  | ●            | ●           | ●      |
| Intention / Status (everyday)                 | ●            | ●           | ●      |
| Plans + standing plans                        | ●            | ●           | ●      |
| **Regulars (private engine)**                 | ●            | ●           | ●      |
| Circles + tiered visibility                   | ●            | ●           | ●      |
| Soft-RSVP + account-free RSVP                 | ●            | ●           | ●      |
| Google Calendar seed + free/busy utility      | ●            | ●           | ●      |
| Ephemeral plan thread                         | ●            | ●           | ●      |
| Slow notifications                            | ● (web push) | ● (native)  | ●      |
| PWA install                                   | ●            | n/a         | n/a    |
| **Org event-injection + Scene pages (PAID)**  | ○            | ◐           | ●      |
| Cultural-events import (city)                 | ○            | ◐           | ●      |
| Home-screen Regulars/availability widget      | ○            | ●           | ●      |
| Serendipity ("both free + both regulars")     | ○            | ●           | ●      |
| AI plan concierge · generative art · the Reel | ○            | ○           | ●      |
| Live "Tonight" layer · tap-to-connect         | ○            | ○           | ●      |
| Apple / Outlook calendars                     | ○            | ◐           | ●      |

● in scope · ◐ partial · ○ out of scope for that stage

---

## 9. North-star & metrics

The metric _is_ the thesis. Get it wrong and you build Instagram.

**North-star: recurring connections formed** — person-pairs who share **≥3 occasions** (events, plans, or everyday hangs) within a rolling window: relationships that crossed from acquaintance to _regular_. Hard to game, directly encodes "community through repeated exposure," tracked by no incumbent.

**The recurrence funnel (core diagnostic):** 1st co-presence → **3rd-occasion conversion** (the central job) → standing-plan formation.

**Activation (first 2 weeks):** ≥3 connections **+** joined/created ≥1 thing **+** ≥1 surfaced Regular. The "aha" is seeing a familiar face _named_.

**Community/graph health:** co-presence density inside a pocket; % of users with ≥1 recurring connection; invite K-factor (profile/event share → install → reciprocated connection).

**Retention:** weekly cadence (open to see what your people are up to). Thesis to validate: **users who form ≥1 recurring connection retain dramatically better.**

**Anti-metrics (guardrails):** time-in-app kept _low_; vanity reach not optimized; notification volume capped; _discovery scrolling that doesn't convert to attendance_ — if it rises, Discover has become a feed and must be re-bounded.

---

## 10. Cold-start & go-to-market

Cold-start is the genre's killer, and with the host demoted from "engine" to a paid feature, the MVP must stand on **peer-to-peer virality + solo value + a pre-connected seed graph**:

- **Solo value.** Your profile/calendar is worth maintaining alone — a curated, future-tense social identity — so early users stay while their friends arrive.
- **Peer virality.** Every profile and event page is shareable and account-free-viewable; soft-RSVP without an account (the Partiful loop) pulls the wider graph in. Joining re-publishes to the joiner's profile, exposing _their_ graph.
- **Seed the pocket.** Launch into one dense, pre-connected cluster from your own communities (PLUR/SAM social graphs) as _individuals and friend-groups_ — density inside a pocket is enough; you don't need global scale.
- **Your personal hosting helps.** Events you personally host still give your friends reasons to show up — that's just you using the core product well, not a separate engine.

**Then, monetize distribution (§11):** once the consumer loop works in a pocket, sell **organizations** the ability to push their events onto members' shared calendars — turning their audiences into connected Barycal graphs. That's both revenue and a distribution flywheel, layered on a product that already works without it.

---

## 11. Monetization

No ads — incompatible with the ethos and the trust story. Three compatible streams:

- **Consumer core — free.** Personal calendar sharing, circles, Discover, plans, standing plans, Regulars. The whole loop is genuinely useful for free; this is the graph-builder.
- **Org / Scene tier — paid B2B2C (the feature you sell).** Organizations (PLUR.NYC, SAM, clubs, run crews) pay to **broadcast events onto members' shared calendars**, with a branded **Scene page**, member analytics, and recurring-event tools. This is the explicit monetization the product is designed around: individuals get a free personal calendar; _groups_ pay to reach everyone's calendar at once. It is also the Poiesis bridge (§12) and a distribution loop.
- **Barycal+ — consumer subscription (later, ~$4–6/mo).** Power/delight only — more circles, generative event art, AI plan concierge, premium themes, the Reel/year-in-review. Never gates the core loop.

The dividing line: **free for a person, paid for an organization.** A user sharing their own social calendar never pays; an org that wants to put events in front of a whole community does.

---

## 12. Relationship to your other builds

- **Poiesis** = the _organizer/operator_ surface (run the event). **Barycal** = the _personal_ surface (your social calendar, your people). The **Org/Scene tier (§11) is the seam** — a Poiesis-run event surfaces natively on members' Barycal calendars. This is now explicitly the _paid_ connective tissue, not the consumer engine.
- **Mayfly** (ephemeral chat) → plan threads (F11) and statuses (F4).
- **PLUR.NYC / SAM** → the pre-connected seed pocket (consumer cold-start) _and_ the first buyers of the Org tier.
- **Stack** (Next.js, Supabase, Cloudflare DO/Yjs, Anthropic) is largely reused; new surface area is the co-attendance graph and the Discover/Profile rendering.

---

## 13. Technical deltas from v0.1

Inherited: v0.1 architecture, OAuth scope strategy, PWA constraints. Changes:

- **Barycal-native events are first-class and the source of truth for the social layer.** Tables ≈ `events` (creator: user or org; `visibility ∈ {inner, orbit, public}`; cover, location, time; `recurring` flag), `event_attendance` (`rsvp ∈ {down,maybe,cant,none}`, `source ∈ {created, joined, intention}`), `intentions` (text, vibe, tier, `expires_at`). Google-imported items are stored as **seed/availability data**, flagged distinctly from Barycal-native events.
- **Co-presence graph** is the core structure: derive `(user_a, user_b, shared_count, last_shared_at)` from attendance + standing plans. Powers Regulars (F6) and the north star.
- **Tiered-circle visibility** via Postgres RLS: Inner reads content; Outer reads free/busy; cross-tier content reads refused at the DB layer.
- **Google Calendar is optional and import-only by default.** Connecting **reads** to seed the week + free/busy (`events.list` + `syncToken`, `freebusy.query`); **writing** Barycal plans into Google (`events.insert`) is an explicit opt-in per plan (F8). Optionality **defers Google restricted-scope verification** until the feature is switched on broadly.
- **Org tier** introduces `orgs`, `org_members`, and org-authored `events` with a fan-out to members' calendars — gated behind billing. Out of MVP scope; schema designed so it slots in.
- **Reuse from the current `social-cal` prototype:** the shareId + account-free public-page pattern, and the per-event `isPublic` flag (the seed of the visibility tiers). The existing manual event-CRUD is essentially F3 in embryo. Rebuild on the v0.1 stack.

---

## 14. Privacy & safety

Carries v0.1 §12 (data minimization for free/busy, RLS as authz, JIT consent, token hygiene, conservative defaults, ghost mode) **plus**:

- **Tiered content is the model:** Inner sees what; Outer sees when. New connections default conservative until placed in a tier.
- **Future-tense location is a safety surface.** Mitigations: Google-imported items default private; location coarsened/hidden on public events unless opted in; ghost mode one tap; the _public_ tier is always an explicit per-item choice.
- **Co-presence memory is sensitive and private.** Regulars is private-to-you (decision #7); minimal data (counts + timestamps + refs), never a behavioral dossier.
- **Discovery ≠ surveillance.** You only see what someone chose to share at the tier they chose. No "who viewed you," no location pings.

---

## 15. Risks & mitigations

| Risk                                       | Severity       | Mitigation                                                                                              |
| ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------- |
| Cold start (host no longer the engine)     | High           | Solo value; peer virality (account-free RSVP); seed one dense pocket; your personal hosting still helps |
| Drifts into Instagram (engagement bait)    | High           | §9 anti-metrics with owners; the §4 test; Discover stays bounded/join-oriented                          |
| Future-tense location / safety             | High           | Imported items private by default; coarsened public location; per-item public opt-in; ghost mode        |
| Privacy backlash (content is sensitive)    | High           | Tiered visibility + RLS; conservative defaults; lead with trust + safety                                |
| Org tier cannibalizes the calm ethos       | Med            | Org events respect members' visibility & notification settings; opt-in to a Scene; no spam              |
| Everyday friction too high → no recurrence | Med            | Two-tap Intentions; standing plans; ruthless friction budget on the core loop                           |
| Google verification + CASA                 | Med (deferred) | GCal optional/import → verification needed only when shipped broadly; narrowest scopes, JIT             |
| Scope creep                                | Med            | Hold the §8 matrix; MVP is F1–F13; org tier is post-MVP                                                 |

---

## 16. Open questions

_(Resolved by interview: name, primary product, home screen, events model, privacy model, discovery scope, Regulars visibility + action, account-free depth, core actions, availability role, Google requirement, profile contents, org-tier-as-paid.)_

Still open:

- **Discover ranking** beyond chronological-with-social-proof — weighting without becoming a popularity feed.
- **Standing-plan mechanics** — how aggressively to auto-propose the next slot; opt-in vs default.
- **Org tier shape** — pricing, and how much Scene tooling lives in Barycal vs Poiesis.
- **One app or two** (Barycal ↔ Poiesis) data/brand boundary.
- **Where "bounded discovery" ends and "a feed" begins** as usage grows.

---

## 17. Roadmap & milestones

**Phase 0 — Foundation (weeks 0–2).** Auth, the **Profile** (F1) + **Discover** shell (F2), create Barycal-native events (F3), Circles + tiered visibility (F7), optional Google seed (F9). _Milestone: your profile is something you'd actually share, and Discover shows something real._

**Phase 1 — The everyday recurrence loop (weeks 2–8).** Intentions (F4), Plans + standing plans (F5), Regulars (F6), soft/account-free RSVP + optional write-back (F8), availability utility (F10), threads (F11), slow notifications (F12), PWA install (F13). _Milestone: a closed beta in one pocket produces real repeat co-presence — pairs reaching a 3rd shared occasion._

**Phase 2 — Monetize + delight.** **Org/Scene tier** (§11), serendipity, AI concierge, generative art, the Reel, native shell + widget. _Milestone: first paying org; north-star growing week over week without engagement-bait._

**Phase 3 — Full vision (native).** Live "Tonight" layer, tap-to-connect, Apple/Outlook, context integrations, E2E. _Milestone: category-defining across multiple city pockets._

---

## 18. Appendix

**Core differentiator, one line:** _the only personal calendar that is your future-tense profile, routes everyday discovery through your people, and is engineered to make the same faces recur until they're a community — free for people, paid for the orgs that want to reach them._

**Design references:** Partiful (warmth, shareable pages), Luma (dark sophistication), Amie/Notion Calendar (editorial calm), Locket (ambient intimacy) — synthesized, decluttered. Profile and event pages must clear "a designer would screenshot this."

**Inherited constraints:** Google Calendar API (Events, Freebusy, watch channels, syncToken) + restricted-scope verification/CASA (deferred by optional/import-only connect); iOS PWA limits in 2026 (install-gated push, no background sync, no widgets, eviction).
