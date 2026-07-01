# Rewards bridge — environment setup (barycal side)

The rewards feature talks to poisys over a signed Worker-to-Worker bridge. Three
values drive it. Secrets are set with `wrangler secret put <NAME>` (prod) or in
`.dev.vars` (local, gitignored); the non-secret URL lives in `wrangler.jsonc`.

| Name                | Kind             | Where                               | Purpose                                                                                                            |
| ------------------- | ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POISYS_BRIDGE_URL` | var (non-secret) | `wrangler.jsonc` → `vars`           | Base URL of the poisys Worker's `/bridge` router. barycal POSTs check-in + redemption-issued reports here.         |
| `BRIDGE_SECRET`     | secret           | `wrangler secret put` / `.dev.vars` | HMAC-SHA256 signing key. **Must be byte-identical** to poisys's `BRIDGE_SECRET`. Signs/verifies every bridge call. |
| `SESSION_SECRET`    | secret           | already in use                      | iron-session cookie key (unchanged by this feature).                                                               |

## How the two sides line up

- **poisys → barycal (publish):** poisys POSTs `EventProjection` to
  `{your barycal origin}/api/bridge/events` (and `/events/unpublish`,
  `/redemptions/redeemed`). These routes verify the signature with `BRIDGE_SECRET`.
- **barycal → poisys (return sync):** barycal POSTs to `${POISYS_BRIDGE_URL}/checkins.report`
  and `${POISYS_BRIDGE_URL}/redemptions.issue`, signed with the same key.

Signature scheme (see `lib/rewards/bridge.ts`): `x-bridge-signature` =
`hex(HMAC_SHA256(BRIDGE_SECRET, "<unixSeconds>.<rawBody>"))`, with
`x-bridge-timestamp` = `<unixSeconds>`; receivers reject a skew over 300s.

If `BRIDGE_SECRET` / `POISYS_BRIDGE_URL` are unset, barycal still runs: return-sync
is silently skipped (check-ins/redemptions are credited locally regardless), and
inbound bridge routes answer `503` until configured.

## Rotating event QR

Each published event carries a server-only `rotatingSecret` (stored in
`reward_event_secrets`, never sent to the browser). The venue screen renders the
TOTP-style code; `verifyRotatingCode` accepts ±1 step of skew. A screenshot is
stale within `stepSeconds` (default 30).

## Migrations

`drizzle/0007_futuristic_mojo.sql` adds the rewards tables — including `reward_rsvps`
(reward-event RSVP, which drives the early-RSVP bonus). (It was regenerated on top of main's
`0005`/`0006` when this branch merged main in.) Apply with `npm run db:migrate:local` (local D1) or
`npm run db:migrate:remote` (remote D1).

## Admin access

The rewards admin lives under the hardened **`/superadmin/rewards`** console (perks, global rules,
analytics, moderation, fulfillment). Access requires a `platform_admins` grant **and** an MFA
step-up (`requireSuperadmin`) — same gate as the rest of `/superadmin`. There is no separate
`/admin` surface or `platform_role` flag.

## Economy defaults (v1 baseline)

Points flow out of the box even before a platform admin configures anything: when no
`global_reward_rules` row is active, check-ins fall back to `DEFAULT_GLOBAL_RULES`
(`lib/domain/rewards.ts`) — **100** base per check-in, **+50** cross-org streak (a prior check-in
within 14 days), **+150** scene-explorer (3+ distinct orgs). Override these in
`/superadmin/rewards/rules`.

Per-org programs are opt-in and organizer-set in poisys; the suggested starting numbers
(`REWARD_DEFAULTS` in poisys `packages/shared/src/rewards.ts`) are base **100** + bonuses
firstTime **200** / streak **50** / earlyRsvp **75** (≥24h) / bringFriend **100**, with suggested
tiers Regular 0 / Gold 1,000 / VIP 5,000.
