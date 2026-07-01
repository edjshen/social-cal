# Barycenter design direction — salvaged reference (2026-06-26)

**Status: archival design reference — NOT a current implementation contract.**

These files were salvaged on 2026-07-01 from the abandoned `thirsty-ride` branch —
a Vite + React 19 SPA prototype built in a single session on 2026-06-26 and never
shipped. `main` runs **Next.js** (OpenNext → Cloudflare Workers), so none of the
prototype's code was kept. What survives here is the _visual + motion design
thinking_, which is stack-agnostic and worth drawing on if barycal's UI is ever
pushed toward its "elevated" direction.

## Files

- `2026-06-26-barycal-barycenter-elevated-direction.md` — the authoritative
  visual/motion vision ("Barycenter: Luminous Bodies in Dark Space"): four design
  laws, the ownable barycenter-physics signature (the social graph _is_ the
  visual), WebGL-with-cheap-fallbacks, capability-tiered motion. **Start here.**
- `2026-06-26-barycal-celestial-editorial-design.md` — the base design-language
  spec that the elevated-direction doc extends and, where they conflict, supersedes.
- `2026-06-26-barycal-tokens.css` — the concrete design tokens from the prototype.

## Caveats for an implementing agent

- The elevated-direction doc links to a Vite-specific implementation plan
  (`../plans/2026-06-26-barycal-implementation-plan.md`) that was **not** carried
  over — that link is dead. Treat any phase/task references as historical.
- The prototype's auth was **Supabase**; `main` uses **D1 + session cookies**.
  Ignore the prototype's auth assumptions.
- The prototype's `src/motion/` capability-tier hooks (`useWebGL`,
  `useCapabilityTier`, `springs`, `WavyList`) were React/Vite code and are **not**
  included. Reimplement the _pattern_ for Next.js if wanted.
