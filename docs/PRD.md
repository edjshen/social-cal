# Social Calendar — Product Requirements Document

**Working title:** *Orbit* *(re-centered from "Kairos"; see §15 on the name)*
**One-liner:** Your calendar is your profile. The people you keep ending up around become your community — and the host gives everyone a reason to keep showing up.
**Doc owner:** Ed
**Status:** Draft v0.2 — re-centered from v0.1
**Platform:** PWA (MVP) → native iOS/Android (v1)

> **Why this rewrite.** v0.1 ("Kairos") centered on *availability* — your free/busy time, rendered calm and ambient, with event content deliberately hidden. That's a coordination utility. This version moves the center to **community through repeated exposure**: a public, future-tense *calendar-as-profile*, discovery *through* friends' calendars, and a host-seeded engine that manufactures the recurring co-presence communities are actually made of. Availability is demoted from hero to utility. Event content goes from hidden to (gradient-controlled) shared, because you cannot discover what you cannot see.

---

## 0. What changed from v0.1

1. **New north star.** From *"plans that happened"* → **recurring co-presence**: the same people ending up around each other repeatedly. The product succeeds when acquaintances become regulars.
2. **Hero unit flips.** From *Open Time* (your free windows) → **your Profile + your Regulars** (your future-tense identity, and the people you keep co-occurring with).
3. **Privacy model inverts (with a safety valve).** v0.1 was free/busy-only, *never* event content. Discovery-through-friends requires seeing *what*, not just *when* — so event **content is shareable** along a **visibility gradient** (private → circle → public). The gradient is also the safety mechanism for broadcasting future plans.
4. **The host is the engine.** Because Ed hosts events (PLUR.NYC, SAM, club nights), the app has a built-in cold-start solution and a perpetual fuel source: host events are the recurring gravity wells that create repeated exposure.

Everything in v0.1's §11 (tech architecture), §12 (privacy/security), §13 (PWA constraints) is **inherited** except where §12 below notes a delta.

---

## 1. TL;DR

Instagram is a museum of the past — proof of what you already did. A calendar is the opposite: a future-tense, actionable record of what you're *about* to do. That makes it a far better social object. "You're going to that? I'm in" turns a profile view into a plan; a photo grid can't do that.

This app makes your calendar your profile — a beautiful, public, future-tense identity surface — and routes discovery *through* the calendars of the people you know: what are my friends going to, who's going to the thing I'm eyeing, what's my scene up to this week. But discovery is not the point. The point is what discovery *produces*: **repeated exposure to the same group of people**, which is the only thing that reliably turns strangers into a community.

The unlock that makes this real instead of aspirational is the **host**. Ed runs events. A host can unilaterally give people a reason to be in the same room — no network required — which is exactly the bootstrap that kills every other social-calendar startup. Host events seed the graph; attendance populates calendars; overlapping attendance surfaces *Regulars* (the people you keep ending up around); the app gently converts those familiar faces into actual friendships and standing plans; a denser community throws and attends more events. The flywheel turns on event #1.

The beachhead is the NYC nightlife / AAPI-social graph already reachable through PLUR.NYC and SAM — dense, pre-connected, taste-driven, and already gathering at events Ed controls.

---

## 2. Thesis: community is a byproduct of repeated exposure

**The mechanism.** Sociology has known this for 70 years: proximity and repetition, not compatibility, are what create relationships (Festinger's propinquity effect; Zajonc's mere-exposure effect). You become close to the people you keep incidentally encountering — the regulars at your bar, the same faces at every show, the crew that always ends up at the afters. Friendship precipitates out of recurrence. It is almost never engineered directly.

**The failure of everyone else.** Social products try to engineer the *connection* — feeds, follower graphs, friend suggestions, matching, intros. They optimize reach and engagement and call it community. It isn't. A feed gives you a thousand weak, one-directional exposures to people you'll never be in a room with. This app inverts the target: **engineer recurrence, not connection.** Make the same real people keep showing up in each other's actual lives, and community forms on its own.

**Three pillars:**

- **Calendar-as-profile.** Your future-tense identity. What you're into is expressed by where you're going. Public (by gradient), browseable, screenshot-worthy, shareable — the social object that replaces the IG profile, with the crucial difference that it points *forward* and is therefore *joinable*.
- **Discovery through your people.** You find things to do by seeing what your friends and your scene are going to, with social proof ("5 people you know are going"). The cultural calendar of the city, finally overlaid with who-you-know.
- **Repeated exposure, hosted.** The host (Ed / communities) supplies the recurring occasions. The app makes the resulting overlaps *visible* ("you've now been to 3 things with Maya") and *actionable* (connect, make a standing plan), turning incidental co-presence into a named, growing community.

**Positioning in one line:** the consumer-personal, future-tense identity-and-discovery layer that turns a host's events into a self-densifying community — where Instagram is past-tense and solitary, Partiful is per-event and amnesiac, and Howbout is a utility with no identity or discovery.

---

## 3. Competitive landscape

| Product | What it owns | What it misses |
|---|---|---|
| **Instagram / TikTok** | Identity, discovery, reach, the profile-as-self | Past-tense; not joinable; performative not plannable; no calendar truth |
| **Partiful** | Gorgeous one-off event pages, Gen-Z/NYC default, frictionless RSVP | Per-event silo; *amnesiac* — no memory of who you keep seeing; no profile, no ongoing life, no community accretion |
| **Luma** | Sleek pages, ticketing, communities, recurring | Professional/cold; organizer tool, not a personal identity surface |
| **Howbout** | Friend-group availability, polls, widget | A utility; no design soul, no identity/profile, no discovery, no community model |
| **Geneva / Discord** | Community containers, chat | No calendar truth; chat-first not plans-first; high-maintenance, not ambient |
| **IRL (RIP) / Gas / BeReal** | Tried social-around-presence | Fad mechanics, no durable utility, no host-anchored recurrence |
| **Google / Apple Calendar** | Source of truth, ubiquity | Solitary, sterile, no social or community model |

**The white space:** a *future-tense profile* (1) that is design-forward enough to be your public face, (2) plugged into your friends' real calendars for discovery, (3) explicitly built to maximize *repeated exposure to the same people*, and (4) seeded and continuously fueled by a host's events. No incumbent occupies even two of these corners together. Partiful is closest on (1)/(4) but is amnesiac — it has no concept of "the people you keep seeing," which is the entire point.

**Defensibility:** the **co-presence graph** (the record of who keeps ending up around whom is impossible to backfill and gets stickier with every event), the **host relationship** (a warm, pre-connected, exactly-ICP graph incumbents can't buy), and **identity lock-in** (once your calendar is your profile, leaving means abandoning your social face).

---

## 4. Design philosophy: "engineer recurrence, not engagement"

The soul carries over from v0.1's "intentional," but sharpened and partly reversed. v0.1 refused discovery and identity to stay calm. This version *embraces* discovery and identity — because they serve repeated IRL exposure — while still refusing the engagement-bait mechanics. The dividing line is one test:

> **Does this make the same real people more likely to be in the same room again?** If yes, ship it. If it only increases time-in-app, cut it.

**Forward-tense, joinable, never performative-only.** Identity here is expressed by what you're *going to do*, and every expression is an open door ("I'm in"). The profile is a face, not a stage — no vanity counts as the goal, no reach-for-reach's-sake.

**Discovery in service of meeting, not scrolling.** There *is* a discovery surface (this is a reversal from v0.1) — but it's bounded and oriented toward action. You browse to find a thing to go to with people, then you leave. No infinite feed, no algorithmic doomscroll.

**Memory of co-presence — a deliberate, limited past tense.** v0.1 was militantly ephemeral. This thesis *requires* memory: you cannot surface "you keep seeing Maya" without remembering. So the app keeps a co-attendance memory (who, when, where) — and almost nothing else. Plan threads and statuses still fade; the *graph of repeated exposure* persists, because it is the product.

**Calm notifications.** Batched digest at a user-chosen time. The only real-time interrupts are convergence moments worth interrupting for ("4 of your regulars are all heading to the thing tonight").

**Closeness *and* density, over raw reach.** The unit is the *scene* — a dense pocket — not the dyad (too small to be a community) and not the global network (too diffuse to be one). Growth is measured by density inside a pocket, not followers.

**Soft commitment.** RSVP is a gradient (Down / Maybe / Can't), so tentative plans — most plans — form earlier and recur more easily.

**Beauty is a feature.** The profile and event pages must be screenshot-worthy; that's both the identity payoff and the growth surface. References: Partiful's warmth, Luma's dark sophistication, the editorial calm of Amie/Notion Calendar — synthesized, decluttered.

---

## 5. Core concepts & vocabulary

- **Profile** — your future-tense identity: what you're going to (by gradient), your scenes, and your *Regulars*. The shareable, account-free-viewable, screenshot-worthy "new IG profile." The home of the product.
- **Event** — a first-class, *joinable* object (not a private blob you type). Has a beautiful page, who's-going with soft-RSVP, and a visibility level. **Host/Anchor events** (Ed's) are first-class citizens and the recurring gravity wells.
- **Regulars** — *the hero magic.* The people you keep ending up around, surfaced from overlapping attendance. "You and these 6 people keep showing up at the same things." The app's most novel screen: it shows you your emergent community before you'd have noticed it, then helps you act on it.
- **The Visibility Gradient** — every event is `private` (free/busy only, nobody sees content), `circle` (your people see what it is), or `public` (on your profile, anyone with the link). The privacy model *and* the safety valve for broadcasting future plans.
- **Circles** — your social graph with closeness tiers (Inner Circle / Orbit). Determines default visibility and how richly your activity surfaces to whom.
- **Plan** — a hang you spin up (vs. an event you attend): find a time, invite, soft-RSVP, write to calendars. **Standing plans** (recurring) are first-class here, because recurrence is the whole thesis.
- **The Scene** — a host/community surface (PLUR, SAM, a run crew): its anchor events, its regulars, its calendar. The bridge to Poiesis and the densest expression of "repeated exposure."
- **On your radar** — the city's cultural calendar (shows, parties, openings) overlaid with your people's attendance.

---

## 6. The hero & information architecture

The home is no longer "The Week" (availability). It's a tab between **your Profile** (identity), **Discover** (find things to do through your people), and **Regulars** (your emergent community).

```
Profile (you — the home / identity surface)
├── What I'm going to (future-tense, visibility-gradient controlled)
├── My scenes / what I'm into
├── My Regulars (the people I keep seeing) — public-summary or private
└── Share / profile link (account-free viewable)

Discover (find things to do, through your people)
├── What my people are going to (friends' shared/public events + social proof)
├── On my radar (city cultural events, overlaid with who's going)
├── From my scenes (host/anchor events)
└── Join → soft-RSVP → lands on my calendar & profile

Regulars (the community engine, made visible)
├── Familiar faces (you've been to N things with…)
├── Nudges ("you and Maya keep overlapping — make it a standing thing?")
└── Scenes you're becoming a regular of

Plans
├── Make a plan / Standing plans (recurring)
├── Plan page (cover, who's in, soft RSVP, ephemeral thread)
└── Past (fades; co-presence memory retained)

You
├── Connected calendar (Google now; Apple/Outlook later)
├── Visibility & sharing (gradient defaults, per-event overrides, ghost mode)
├── Notification cadence
└── Theme / appearance
```

---

## 7. MVP feature specifications

Re-prioritized around identity → discovery → recurrence. Availability/free-busy is **demoted** to a coordination utility (F9) and is no longer the headline.

**F1 — Profile (calendar-as-identity).** *The new hero.* A beautiful, public, future-tense profile: what you're going to (gradient-controlled), your scenes, optionally your Regulars. Account-free viewable via link; screenshot-worthy; the primary share + growth surface.
*Acceptance:* a stranger can open your link, immediately grok who you are *by where you're going*, and either follow or join a public event — no account required.

**F2 — Events as joinable objects + Host/Anchor events.** Events are first-class: a gorgeous page, who's-going, soft-RSVP, visibility level. The host (Ed) can create anchor events that attendees discover and join; joining writes to the attendee's calendar and surfaces on their profile.
*Acceptance:* Ed creates an event; his graph sees it; joining puts it on the joiner's calendar and profile in one tap; the page is screenshot-worthy.

**F3 — Discovery through friends.** "What are my people going to?" — friends' shared/public events and on-radar city events, with social proof ("5 you know are going"). Bounded and action-oriented, not an infinite feed.
*Acceptance:* with ≥3 connections, the user can find at least one real thing to go to *and* see who they'd know there, in under 15 seconds.

**F4 — Regulars (the repeated-exposure engine).** *The novel core.* Surface the people you keep co-occurring with, from shared attendance. Gentle nudges to connect or start a standing plan. This is what converts incidental co-presence into community.
*Acceptance:* after a user shares ≥3 events with someone, that person appears as a Regular with a one-tap "make a standing plan / connect" action; the rendering feels warm, never surveillant.

**F5 — Join / soft-RSVP → write-back.** Down / Maybe / Can't on any event or plan. Confirmed attendance writes to Google Calendar and lands on the profile. (Write scope requested just-in-time at first write — inherited from v0.1 §11.4.)
*Acceptance:* "I'm in" on a friend's event puts it on my real calendar and my profile in one tap.

**F6 — Circles + the Visibility Gradient.** Social graph with Inner Circle / Orbit, and per-event `private/circle/public` control with conservative defaults and one-tap ghost mode. The privacy model and the safety valve in one.
*Acceptance:* a user understands and trusts the model in under a minute; defaults are conservative; every event's audience is obvious and changeable in one tap.

**F7 — Plans + Standing plans.** Spin up a hang (find a time, invite, soft-RSVP, write-back), and — promoted from v0.1's vision — **recurring/standing plans** that auto-propose the next slot from the group, because recurrence is the thesis.
*Acceptance:* going from "want to see these people" to a sent plan takes under a minute; a standing plan re-proposes itself without anyone re-organizing.

**F8 — Ephemeral plan thread.** Per-plan, fades after the event. Reuses the Mayfly substrate. Coordination, not an inbox.
*Acceptance:* coordination happens in context; nothing accumulates into a chat archive.

**F9 — Availability (free/busy) as a utility.** *Demoted but kept.* Used inside "make a plan" to find a time that works (free/busy intersection). Not a home screen, not the hero. Friends' availability stays free/busy-only (the v0.1 trust posture survives *here*, at the dyadic-coordination layer).
*Acceptance:* the slot suggester respects everyone's free/busy without exposing event content.

**F10 — Slow notifications.** Batched digest by default; the only real-time pushes are convergence moments ("your regulars are converging on X tonight"). Full cadence control.
*Acceptance:* at most a couple of gentle touches/day by default; tunable; no manufactured urgency.

**F11 — PWA install.** Guided, Safari-aware install path (push requires home-screen install on iOS). Honest about why installing unlocks the ambient/notification value; non-installers still get a usable experience. (Inherited from v0.1 §13.)

---

## 8. Feature scope matrix

| Feature | MVP (PWA) | v1 (native) | Vision |
|---|---|---|---|
| Profile (calendar-as-identity) | ● | ● | ● |
| Events as joinable objects + Host/Anchor events | ● | ● | ● |
| Discovery through friends | ● | ● | ● |
| **Regulars (repeated-exposure engine)** | ● | ● | ● |
| Join / soft-RSVP → write-back | ● | ● | ● |
| Circles + Visibility Gradient | ● | ● | ● |
| Plans + **Standing plans** | ● | ● | ● |
| Ephemeral plan thread | ● | ● | ● |
| Availability (free/busy) utility | ● | ● | ● |
| Slow notifications | ● (web push) | ● (native) | ● |
| PWA install | ● | n/a | n/a |
| Scene / community pages (host-facing) | ◐ (basic) | ● | ● |
| Cultural-events import (On your radar) | ◐ | ● | ● |
| Home-screen availability/Regulars widget | ○ | ● | ● |
| Serendipity ("you & Dev both free + both regulars") | ○ | ● | ● |
| AI plan concierge | ○ | ○ | ● |
| Generative event art | ○ | ○ | ● |
| The Reel (who you actually saw this year) | ○ | ○ | ● |
| Live "Tonight" layer | ○ | ○ | ● |
| Tap-to-connect (NFC/QR) at events | ○ | ○ | ● |

● in scope · ◐ partial/basic · ○ out of scope for that stage

---

## 9. North-star & metrics

The metric *is* the thesis. Get this wrong and you build Instagram.

**North-star: recurring connections formed** — the count of (person, person) pairs who have shared **≥3 events/plans** within a rolling window, i.e. relationships that crossed from acquaintance to *regular*. This directly measures "community through repeated exposure," is hard to game (you can't fake real repeated co-attendance), and is something no incumbent even tracks.

**The recurrence funnel (the core diagnostic):**
- **1st co-presence:** two people share an event via the app.
- **3rd-event conversion:** of pairs who met once, what % reach a 3rd shared event? *This is the product's central job.*
- **Standing-plan formation:** pairs/groups that convert a pattern into a recurring plan.

**Activation (first 2 weeks):** connected calendar **+** ≥3 connections **+** joined ≥1 event **+** ≥1 surfaced Regular. The "aha" is seeing a familiar face named — "oh, I *do* keep running into them."

**Community/graph health:** co-presence graph density inside a pocket (avg recurring co-attendees per active user); % of users with ≥1 recurring connection; host-event → repeat-attendee rate.

**Retention:** weekly cadence (open to see what your people are up to / what's on). The thesis prediction to validate: **users who form ≥1 recurring connection retain dramatically better** — if true, the whole flywheel is real.

**Anti-metrics (guardrails, watched with owners):**
- Time-in-app per session — kept *low*; a rise signals drift toward engagement-bait.
- Vanity reach (followers as a goal) — not optimized; density beats reach.
- Notification volume — capped.
- Discovery scrolling that *doesn't* convert to attendance — if browse-without-joining rises, the discovery surface has become a feed and must be re-bounded.

---

## 10. The flywheel & go-to-market

The host solves cold-start, which is the genre's killer. Everyone else needs the network before the product is useful. You don't: **you can give people a reason to show up on day one.**

**The community flywheel:**
```
Host throws an event (Ed / PLUR / SAM)
        ↓
Attendees join → it lands on their calendars & profiles
        ↓
Overlapping attendance accrues → Regulars surface
        ↓
App nudges familiar faces → connections + standing plans form
        ↓
Denser community → throws & attends more events → (loop)
```
Every turn raises co-presence-graph density, which is the north star and the moat.

**Phase 1 — seed one pocket.** Launch into a single dense PLUR/SAM cluster around real events Ed is already hosting. You don't need global density — just density *inside the pocket*, which the host manufactures.

**Phase 2 — profile + event-page virality.** Every profile and event page is a shareable, account-free-viewable growth surface (Partiful-style), pulling the wider graph in. Joining is the viral act: it re-publishes to the joiner's profile, exposing their graph.

**Phase 3 — wedge expansion.** Scene → adjacent scenes → other cities, same host-anchored pocket-density playbook each time.

**Phase 4 — Scenes as a product (Poiesis bridge).** Hosts/communities run member-facing Scene pages; their audiences become connected graphs. B2B2C engine and distribution loop.

---

## 11. Relationship to your other builds

- **Poiesis** is the *host/operator* surface (run the event). This app is the *attendee/personal* surface (live your calendar, become a regular). They share one graph and one notion of events; the **Scene** (§5) is the seam — a Poiesis event surfaces natively on attendees' profiles and feeds their Regulars. The host pillar of this PRD *is* the Poiesis bridge, now load-bearing rather than a side mode.
- **Mayfly** (ephemeral chat) is the substrate for plan threads (F8) and statuses.
- **PLUR.NYC / SAM** are the host-seeded pocket — the cold-start solution made of real, recurring events.
- **Stack** (Next.js, Supabase, Cloudflare DO/Yjs, Anthropic) is largely reused; the new surface area is the co-attendance graph and the profile/discovery rendering (§12).

---

## 12. Technical deltas from v0.1

v0.1 §11 (architecture), §11.4 (OAuth scopes), §13 (PWA constraints) are **inherited**. What changes:

- **Events become first-class shared objects**, not private free/busy blocks. New tables roughly: `events` (host or user owned, with `visibility ∈ {private,circle,public}`, cover, location, time), `event_attendance` (`event_id`, `user_id`, `rsvp ∈ {down,maybe,cant,none}`, source ∈ {hosted, joined, synced}). v0.1's `availability_blocks` survives for the F9 utility.
- **The co-presence graph** is the new core data structure: derive `(user_a, user_b, shared_event_count, last_shared_at)` from `event_attendance`. This powers Regulars (F4) and the north-star metric. It is the one thing the app deliberately *remembers* (see §4, §13).
- **Visibility gradient replaces free/busy-only as the default authorization question.** Postgres RLS still enforces the boundary, but now over event *content* visibility per circle, not just free/busy. This is the trickiest privacy code — get the RLS policies right (private content must be unreadable cross-circle at the DB layer).
- **Calendar sync direction:** still read the user's own calendar (`events.list` + `syncToken`, `events.watch`) to populate their profile/Week; still write joined plans back (`events.insert`). Friends' availability for the F9 utility still uses `freebusy.query` (content-free). The new bit is that *app-native* events (hosted/joined) carry shareable content the user has explicitly chosen to share — distinct from synced Google events, whose content stays private unless the user promotes it.
- **The current `social-cal` codebase** (Express + SQLite + manual event entry + public `shareId` page + `Follow` model) is a usable *prototype of the profile/share concept* but the wrong stack and shape for this. Reuse the *patterns* (shareId, account-free public page, the per-event `isPublic` flag as the gradient's seed); rebuild on the v0.1 stack. See the migration mapping (separate doc / next step).

---

## 13. Privacy & safety

Carries v0.1 §12 (data minimization for the free/busy utility, RLS as authz, JIT consent, token hygiene, conservative defaults, ghost mode) **plus** the new surface's specific risks:

- **Future-tense location is a real safety surface.** A public future calendar can broadcast *where you'll physically be, when* — a stalking vector. Instagram is past-tense partly for this reason. Mitigations: `private` is the default for synced events; location is coarsened or hidden on `public` events unless explicitly opted in; "ghost mode" one tap; and the gradient means the *public* tier is an active choice per event, never automatic.
- **Co-presence memory is sensitive.** "Who you keep seeing" is intimate. Regulars defaults to *private to you*; surfacing it on your public profile is opt-in. The memory is minimal (counts + timestamps + event refs), not a behavioral dossier.
- **Discovery must not become surveillance.** You see what people *chose* to share at the gradient level they chose. No "who viewed your profile," no location pings, nothing a user didn't publish.

---

## 14. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **It drifts into Instagram** (reach/engagement bait) | High | The §9 anti-metrics with owners; the §4 test ("same people, same room again?"); discovery stays bounded and join-oriented |
| **Future-tense location / safety** | High | Private-by-default synced events; coarsened public location; gradient is per-event opt-in; ghost mode |
| **Cold start** (genre killer) | Med (host de-risks it) | Host-seeded pocket density; account-free profile/event virality; solo value via your own profile |
| **Privacy backlash** (content sharing is sensitive) | High | Visibility gradient + RLS; conservative defaults; lead messaging with the trust + safety story |
| **Regulars feels creepy not warm** | Med | Private-by-default; gentle, opt-in nudges; counts not dossiers; rigorous copy/UX bar |
| **Google restricted-scope verification + CASA** | High | Narrowest scopes, JIT escalation, community closed beta during verification (inherited from v0.1) |
| **Scope creep** | Med | Hold the §8 matrix; MVP is F1–F11; §8 vision earns its way in post-validation |
| **Recurring-event / sync edge cases** | Med | Budget real engineering; `syncToken` incremental sync; recurrence test fixtures (inherited) |

---

## 15. Open questions

- **Name.** "Kairos" was chosen for the chronos/kairos *availability* insight — which is no longer the center. The thesis now is recurrence and orbit. **"Orbit"** (a v0.1 alternate) fits far better — the things and people you orbit, repeatedly — and is used as the working title here. Confirm or pick: Orbit / Cadence / Coterie / Regulars / Aperture.
- **Profile depth for non-users.** How much of a profile/event does an account-free visitor see before the install/sign-up wall? More open = more viral; less = more reason to join.
- **Does "Regulars" surface publicly at all in MVP, or stay private-to-you?** Public is more identity/viral; private is safer and warmer. Lean private-by-default, opt-in public summary.
- **Cultural-events import in MVP or Phase 2?** "On your radar" deepens discovery but adds integration surface (RA/Luma/Partiful).
- **One app or two modes** (host/Poiesis vs attendee/this app)? The host pillar makes the seam load-bearing — decide the data/brand boundary early.
- **How much of v0.1's calm ethos is non-negotiable** as discovery grows? Where exactly is the line between "bounded discovery" and "a feed"?

---

## 16. Roadmap & milestones

**Phase 0 — Foundation (weeks 0–2).** Google auth + calendar read + your **Profile** (F1) rendering your own future-tense calendar beautifully, with the visibility gradient (F6 core). *Milestone: your profile is something you'd actually share as your "page."*

**Phase 1 — The recurrence loop (weeks 2–8).** Joinable + host events (F2), discovery (F3), **Regulars** (F4), join/RSVP write-back (F5), plans + standing plans (F7), ephemeral threads (F8), free/busy utility (F9), slow notifications (F10), PWA install (F11). *Milestone: a closed beta in one PLUR/SAM pocket produces real repeat co-attendance — pairs reaching a 3rd shared event.*

**Phase 2 — Delight & Scenes.** Scene/community pages, cultural import, serendipity, AI concierge, generative art, the Reel, native shell + widget. *Milestone: north-star (recurring connections) growing week over week without engagement-bait.*

**Phase 3 — Full vision (native).** Live "Tonight" layer, tap-to-connect, Apple/Outlook, context integrations, E2E. *Milestone: category-defining across multiple city pockets.*

---

## 17. Appendix

**Core differentiator, one line:** *the only calendar that is your future-tense profile, routes discovery through your people, and is engineered — host-seeded — to make the same faces recur until they're a community.*

**Design references:** Partiful (warmth, shareable pages), Luma (dark sophistication), Amie/Notion Calendar (editorial calm), Locket (ambient intimacy) — synthesized, decluttered. The profile and event pages must clear the "a designer would screenshot this" bar.

**Inherited constraints:** Google Calendar API (Events, Freebusy, watch channels, syncToken) + restricted-scope verification/CASA; iOS PWA limits in 2026 (install-gated push, no background sync, no widgets, eviction). See v0.1 §11–§13.
