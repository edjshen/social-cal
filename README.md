# Orbit

**Your social calendar is your profile.** See when the people you care about are free, discover what your circles are up to this week, and let the same faces recurring become your community.

Orbit is a personal social calendar built around **community through repeated exposure** — full product thinking in [`docs/PRD.md`](docs/PRD.md), screen designs in [`docs/mocks/`](docs/mocks).

## Run it

```bash
npm install
npm run seed     # creates a demo graph (Ed, Maya, Dev, Nina, Theo, Sam, PLUR)
npm start        # http://localhost:3000
```

Demo login → **username `ed` · password `orbit`**

## What's built (MVP)

The five hero screens and the core loop, wired end to end:

| Screen / feature | Status |
|---|---|
| **Discover** — this week, social proof, everyday + events | ✅ |
| **Week / Month** — Chronos views, type-coded, open-time celebrated | ✅ |
| **Profile** — future-tense identity, visibility tiers, share link | ✅ |
| **Regulars** — private co-presence engine, "make it a standing plan" | ✅ |
| **Circles + tiers** — Inner (content) / Orbit (free-busy), ghost mode | ✅ |
| **Create** — intentions, plans, standing (recurring), events | ✅ |
| **Soft-RSVP** (Down / Maybe / Can't) + account-free `/u/:handle`, `/e/:id` | ✅ |
| **PWA** — installable, offline shell, service worker | ✅ |
| Google Calendar connect / web push | stubbed — need cloud creds (see below) |

Maps to features **F1–F13** in the PRD.

## Architecture

- **Backend** — Node + Express (`server/`). A zero-dependency JSON-file store (`server/db.js`) keeps the MVP runnable anywhere with no native binaries or cloud services. Visibility is enforced server-side: Inner Circle sees event content, Orbit sees free/busy only, public is open.
- **Frontend** — a dependency-free mobile-first SPA (`public/app.js` + `public/orbit.css`) in the dark/editorial design language from the mocks. Account-free pages render via `public/view.js`.
- **The co-presence graph** — Regulars and the north-star metric are derived from shared attendance (`/api/regulars`).

### Production deltas (per PRD §13)

This repo is the runnable MVP. For production the PRD calls for **Postgres + Row-Level Security** (swap `server/db.js`), **Google OAuth + Calendar sync** as an *optional* seed (events are Orbit-native here, so the core loop needs no Google), and **web push**. These need credentials/cloud not available in a sandbox, so they're stubbed.

## API sketch

`POST /api/auth/{register,login}` · `GET/PUT /api/me` · `GET /api/users` · `POST /api/connections[/:id/accept]` · `GET /api/circles` · `PUT /api/placements` · `POST /api/events` · `GET /api/events/:id` · `POST /api/events/:id/rsvp` · `GET /api/discover` · `GET /api/calendar?start=&end=` · `GET /api/profile/:handle` · `GET /api/regulars` · `GET /api/digest`
