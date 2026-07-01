# barycal — "Barycenter: Luminous Bodies in Dark Space" — Elevated Visual & Motion Direction

> **Authoritative source of truth for the visual + motion design of Phases 4–6.** Extends and, where they conflict, **supersedes** the design-language sections (§2, §2.3, §10 signature slots) of the main spec [`2026-06-26-barycal-celestial-editorial-design.md`](2026-06-26-barycal-celestial-editorial-design.md). Implementation phases/tasks live in [`../plans/2026-06-26-barycal-implementation-plan.md`](../plans/2026-06-26-barycal-implementation-plan.md); each Phase 4–6 "signature slot" there resolves to a section in this doc.
>
> This document is the **reconciliation** of a multi-agent elevation synthesis with its adversarial critique. **Where the synthesis and the critique disagreed, the critique wins** — flagged inline as `[critique]`.

---

## 1. Concept & positioning

**Concept:** _Barycenter — Luminous Bodies in Dark Space._ A deep-ink celestial **instrument** where every event, person, and circle is a weighted, generatively-unique **luminous body** the user physically puppets through interruptible spring gestures — lit by warm-signal / cold-violet rim light, with heavy WebGL + glitch reserved for the lazy landing and cheap OGL / seeded-SVG fallbacks everywhere in-app.

**Positioning:** must clearly **exceed poisys** (whose flair is static CSS: aurora, grain, conic borders) by making color and distortion **real-time and GPU-reactive, summoned by gesture/scroll velocity** rather than ambient. `[critique]` Versus obys/aikawa, a faithful inventory of their techniques only _equals_ them — so the headline is **not** their borrowed signifiers (chromatic aberration / glitch) but our **ownable idea** (§3).

---

## 2. The four laws

1. **Deep-ink field.** Saturated color lives almost entirely inside reactive WebGL/shader layers and cover imagery; UI chrome stays near-monochrome on `#0A0910` so labels and data read cleanly.
2. **Light as material.** Form is revealed by light grazing it — specular gloss on controls, cinematic two-light (warm/cold) rim on covers, bloom + restrained RGB-split on generative forms — never flat fills.
3. **Everything has mass and settles.** Spring physics with overshoot and velocity-coupling, never linear easing. Objects feel weighted; gestures are interruptible puppeteering.
4. **Grid-of-unique-specimens.** A uniform celestial cell (orbit-cage / card-frame / tile) holds a per-identity-unique body — the literal thesis: _same cell, unique constellation per person._

---

## 3. The ownable signature `[critique — promoted from #4 to THE headline]`

What makes this _barycal_ and not an obys/aikawa homage: **the social graph is the literal visual, and it obeys barycenter physics.**

- **People as luminous bodies; your barycenter is computed, not decorative.** Your circles render as bodies whose **mass = interaction/co-presence weight**; they settle around the **barycenter** = the weighted center of your social world. This is _data-driven generative geometry + real barycenter math_, not an aurora. When relationships change (a new regular, a shared night), the bodies **recompose** around a shifted barycenter.
- **Time as a spatial axis.** "This week" / Plans lay events along a time-spine in space (the Gravity Spine, §7.1); proximity-in-time = proximity-in-space; busier days bow the spine wider (gravity).
- **Generative deterministic identity.** `handle → hash → seed` produces a unique faceted "sigil" (3D crystal on the landing/FULL tier; the **same** seed → a 2D SVG faceted polygon in-app / no-WebGL). Identity is _earned by data_, reproducible, and unique per person.
- **A defined settle character.** The whole system shares one motion signature: _fast, weighted slow-out with a single small overshoot, then crisp stillness_ (expo/power3/circ; spring ~stiffness 260 / damping 30). `[critique]` This consistent "settle" is the brand's kinaesthetic fingerprint — specify it once, reuse everywhere.
- **One lighting model.** `[critique]` Reconcile the references: the glossy-instrument look (960 ref) and the cinematic rim-lit portrait (2160 ref) are the **same** two-light model (warm key vs. cold rim + spec/bloom) applied to controls vs. imagery — not two unrelated styles.

Aberration/glitch survives only as **brand-tinted signal** (R/B split biased toward `#FF8A5B/#FF5E87`), triggered on events (route change, co-presence "live," hover), **never continuous**.

---

## 4. Color tokens

- **Ground:** `#0A0910` (universal stage) · **raised surface:** `#14121C` · **hairline strokes:** `rgba(255,255,255,.06–.10)`.
- **Signal gradient (gravitational warmth):** `#FF8A5B → #FF5E87` — reclassified as a **velocity-triggered shader/flood token**, _not_ an ambient CSS gradient. (This is the explicit way we exceed poisys's static aurora.)
- **Cold counter-light (rim separation):** violet `#9B8CFF`, electric blue `#5B7CFF` — used opposite the warm signal in two-light rim + plexus depth.
- **State-only accents:** mint `#5FD3A6` (presence / co-presence "live"), amber `#FFC178` (this-week heat / soft alert).
- **Text:** primary `#F4F0F2`; muted meta `#9A94A4` — `[critique]` only at ≥16px; for smaller/critical text use a lighter muted that holds **≥4.5:1** on `#0A0910`.
- **Restraint rule:** saturated color appears almost exclusively inside the WebGL/cover layer and at motion peaks; chrome stays near-monochrome.

---

## 5. Typography (kinetic, with guardrails)

- **Display:** a variable grotesque sans (Geist — recommended — or Mona Sans) for the wordmark + big future-tense statements; animate `wght`/`opsz`/`slnt` via CSS `font-variation-settings` driven by scroll/drag velocity + cursor proximity (the obys "motion channel"). `[critique]` Variable-axis animation on the **hero + short headings only** (re-rasterization cost) — **`wght` only**, never on titles carrying critical info, never on body/event data.
- **Body + UI:** a neutral grotesque sans — small, calm, static, selectable.
- **Meta-labels:** wide-tracked uppercase mono as celestial graphic elements — coordinates, `BARYCENTER`, timestamps, index numerals (`01 02 03`), the preloader `0→100%`.
- **Kinetic reveals:** GSAP `SplitText` line-mask + per-char stagger (landing); on-mount staggers (in-app). **Troika MSDF GPU text reserved for the single hero wordmark only** — all real headings/labels/event data stay selectable, screen-reader DOM.
- **Guardrails:** subset the VF (used axes + Latin, ~30–80kb woff2), preload, `font-display:swap` with `size-adjust` fallback metrics → CLS ≈ 0. Easing vocabulary: expo / power3 / circ — slow-out, weighted, never linear, never cartoon-bounce.

---

## 6. Motion system

**Two engines, strict non-overlapping division of labor — never both on one DOM node.**

- **Motion v12** (`motion/react`, `LazyMotion` + `m` + `domMax`) owns the **app shell**: stateful, interruptible, gesture-driven UI — the Gravity Spine card-fan with drag momentum, shared-layout `layoutId` "orbit-into-detail" route transitions, list reorder, drawers, `AnimatePresence`.
- **GSAP + ScrollTrigger + SplitText** (lazy, **landing-only**) owns **scripted editorial scenes**: pinned/scrubbed scroll choreography, char-split kinetic headlines, the preloader number tween + GPU reveal, color floods.

**The velocity bridge `[critique — make this concrete]`:** a single `velocityRef` updated in **one rAF loop** (from drag delta on touch, native scroll delta on mobile, Lenis on desktop) is read directly by **both** the OGL shader uniforms (`uVelocity`) and Motion values — **zero `setState` in the hot path**; ScrollTrigger writes go straight to `element.style`/`clipPath`, never React state. Transitions are driven by a single GSAP-tweened `0→1` `uProgress` uniform (obys stateless-shader discipline).

**Defaults:** spring `stiffness ~260 / damping ~30`; neighbor cards lag the dragged one (index-staggered phase) to make the wave. Global `MotionConfig reducedMotion="user"`. rAF idle-guard suspends loops after ~90 input-free frames; pause on `document.hidden` and offscreen (`IntersectionObserver`).

---

## 7. Signature experiences (reconciled + ordered)

> Build order `[critique]`: ship the **app shell + static tier first**, then layer FULL-tier WebGL. Each maps to a plan "signature slot."

### 7.1 The Gravity Spine — wavy card-fan list · _Plans (Week/Month), Discover "this week," reused for Regulars_

One `useMotionValue(dragY)` drives the parent; each card reads it via `useTransform` with an index-staggered phase so card[i] lags card[i-1] (the wave), laid along an S-spine (`x = amplitude·sin(indexPhase + dragPhase)`). Motion drag + `dragElastic` + spring; `onDragEnd` → `animate()` velocity fling + rubber-band overshoot. Busier days bow the spine wider. **`[critique]` Week view is NOT virtualized** (virtualization breaks `layoutId`); cap week length instead.
**Fallback:** reduced-motion / low-end → plain stacked list, opacity/translate fades, 3-card stagger cap, no `dragElastic`. Fully scrollable & functional.

### 7.2 Velocity-Smear Covers — luminous rim-lit bodies · _Discover cards, Profile hero, `/u` + `/e` covers_

A lightweight OGL textured plane; shared `<DistortionImage>` fragment shader: curl/simplex displacement + brand-tinted chromatic aberration, intensity from `uVelocity`, springing back to crisp at rest. Two-light warm/cold rim + bloom auto-renders any uploaded photo into the cinematic mood. **`[critique]` ONE shared OGL program for the focused/hero cover only; all other covers use the CSS/SVG fallback** (alpha OGL across many surfaces is too risky/heavy). Paused during drag and offscreen.
**Fallback:** no-WebGL → static **duotone CSS** cover (gradient-mask + warm/cold box-shadow glow), no ripple. Aberration capped so captions/dates never blur.

### 7.3 Depth Floating Covers — parallax volume · _Profile hero, Discover feed, `/e` covers_

2–3 parallax depth layers (subject / glow / bg) offset by **pointer on desktop**; Motion perspective container with per-card `rotateX/rotateY` from `useTransform(scrollY)`; spring "lift" (`translateZ` + shadow) on tap. **`[critique]` Drop DeviceOrientation gyro** (iOS permission friction + jank) — use scroll/pointer parallax only.
**Fallback:** reduced-motion / coarse-pointer → locked parallax, keep static duotone + glow + soft float shadow.

### 7.4 Seeded Constellation Sigils — generative identity · _Landing showpiece, Circles grid, avatars (Profile, `/u`)_

`handle-hash → seed`. **Landing (FULL, lazy):** drei `<Instances>` grid of wireframe orbit-cells + per-instance seeded crystals; Glitch/ChromaticAberration/Noise postprocessing bound to hover/scroll/co-presence. **`[critique]` FULL-tier only; seed as a per-instance attribute on one shared geometry; dpr ≤ 1.5; pre-rendered poster otherwise.**
**Fallback (in-app / no-WebGL):** a seeded **2D SVG** faceted polygon from the **same seed algorithm** + CSS RGB-split text-shadow — unique per identity, zero WebGL. reduced-motion → one frozen frame.

### 7.5 Glossy Instrument Toggles — state-as-physical-pose · _visibility tiers, Regulars on/off, Circles join, Create controls_

OGL low-poly lever, matcap/env-map glossy black, pointer-driven specular highlight, cheap faked reflection; Motion spring overshoot-then-settle + short haptic. Many toggles = **one** OGL scene, instanced matcap quads.
**`[critique]` Privacy/visibility state must ALSO be a real ARIA `switch`/`radiogroup` with word labels + a one-line consequence ("Circle sees when you're free")** — never communicated by gloss alone.
**Fallback:** no-WebGL → CSS conic/linear "glossy" toggle + box-shadow reflection + spring knob. reduced-motion → instant state swap, keep gloss, drop the sweep.

### 7.6 Barycenter Launch + Preloader · _Landing → app entry (landing ONLY)_

Sans `Barycenter` wordmark + live `0→100%` counter bound to real three.js asset load; coordinated GPU reveal (clip-path / `uMix`, expo). Orbiting-satellites barycenter hero. Landing→app = GSAP barycenter-zoom + grain dissolve handing to the shell.
**Hard rule:** **never** gates the app shell or any `/u`/`/e` share page. reduced-motion → instant crossfade; no-WebGL → static hero poster.

### 7.7 Orbit-Into-Detail route transitions · _in-app navigation_

Motion shared-layout (`layoutId`) so a focused event/avatar "orbits" into its detail with a spring; directional tab transitions. View Transitions API as progressive enhancement (Chromium) behind a capability flag; Motion springs are the cross-browser baseline; **interruptible — no locked overlays.**
**Fallback:** reduced-motion → instant crossfade; router underneath degrades to a plain DOM swap.

### 7.8 Velocity Color Floods + Kinetic Type · _landing editorial scenes + section titles_

Signal/mint/violet/amber bloom as velocity-triggered shader tints + scroll-floods over `#0A0910` (obys color-as-flood). Display type squash/stretch via variable `wght` from scroll velocity; GSAP SplitText reveals + clip-path wipes.
**Fallback:** reduced-motion → static target axes + single static tint; native scroll on mobile.

### 7.9 Pointer-Gravity Cursor + Magnetic CTAs · _`[critique]` LANDING + `pointer:fine` ONLY_

Custom cursor + magnetic buttons via Motion `useSpring` with a lerped "gravity" pull toward interactive elements; mouse velocity ripples the hero shader. **Never instantiated on touch** (mobile = tap-ripple at touch point). Real `:focus-visible` always underneath.

---

## 8. Library additions (beyond the current React 19 / Vite / Tailwind v4 / Motion / supabase-js base)

| Library                                                                              | Pin                                                 | Role                                                                                                                           | Notes                                                                                                                                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gsap` + `@gsap/react` (ScrollTrigger, SplitText)                                    | `^3.13` / `^2`                                      | **landing-only** scripted scenes, kinetic headlines, preloader, color floods                                                   | free since Apr 2025; register only imported plugins; **CI fails if GSAP appears in the app-shell chunk**; no ScrollSmoother on mobile                                             |
| `ogl`                                                                                | **pin `0.0.42`**                                    | in-app shader layer — the **one** shared `<DistortionImage>` cover + glossy toggles + faint plexus glow + in-app crystal sigil | ~10–13kb; still alpha → wrap in a thin adapter so a breaking release is a one-file fix; one shared context, IntersectionObserver-paused                                           |
| `three` + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing` | `^0.17x` / `^9.5` / **pin** `^9.116` / **pin** `^3` | **landing route ONLY, lazy** — barycenter hero + instanced wireframe-crystal grid                                              | R3F v9 = React 19 compat; ~220–260kb gz chunk, acceptable only because dynamic-imported after first paint; **CI fails if three/R3F leaks into the shell**; import drei à-la-carte |
| `lenis` (`lenis/react`)                                                              | `^1.3.23`                                           | smooth-scroll backbone + per-frame velocity source (desktop/`pointer:fine` only)                                               | sync to one GSAP ticker; mobile → native scroll (preserve iOS momentum); disabled under reduced-motion                                                                            |
| variable display sans — Geist or Mona Sans (self-hosted woff2)                       | —                                                   | kinetic "motion channel" at ~0 JS                                                                                              | subset + preload + fallback metrics                                                                                                                                               |
| `troika-three-text`                                                                  | landing, lazy                                       | MSDF GPU text for the **single** hero wordmark                                                                                 | not app-wide                                                                                                                                                                      |
| custom `useCapabilityTier()` (~50 lines; optional `detect-gpu`)                      | —                                                   | the degradation spine                                                                                                          | probes reduced-motion, WebGL, cores, memory, Save-Data, `pointer:fine`; resolves `{full \| lite \| static}` once at boot; heavy imports gated behind it                           |
| Web Vibration API + WebAudio                                                         | —                                                   | haptic settle on toggles; optional landing sound garnish                                                                       | no shipped assets; off by default; gated by toggle + reduced-motion + device mute; never on share pages / core actions                                                            |

---

## 9. Performance budget `[critique — re-baselined]`

- **App-shell JS:** target **~170–190kb gz** (Motion `domMax` is realistically **~17–20kb**, _not_ 4.6kb; + router + supabase-js + OGL ~10–13kb + app code). The synthesis's 120–150kb was optimistic.
- **CI bundle-analyzer gate:** **fails the build** if `three`/`@react-three/*`/`postprocessing`/`troika`/`gsap` appear in the app-shell chunk.
- **Landing chunk** (three + R3F + drei + postprocessing + troika + GSAP) ~220–260kb gz — acceptable **only** dynamic-imported after first paint on the landing route.
- **Targets:** landing LCP ≤ 1.5s mid-mobile (build-time blur-data + preloaded subset VF + poster under the gate); app-shell route LCP ≤ 1.3s; `/u` + `/e` instant. 60fps on the Gravity-Spine drag on a 3-yr-old phone (compositor-only transforms/opacity).
- **WebGL runtime:** dpr `min(devicePixelRatio, 1.5)`; **one** persistent context max; rAF paused offscreen + on `document.hidden` + after ~90 idle frames; **`[critique]` the in-app OGL program is paused during drag**; postprocessing merged to fewest passes; glitch event-triggered, not continuous. `[critique]` **Film grain = a static noise tile, not a full-viewport `mix-blend` layer** (which tanks mobile fps).

---

## 10. Degradation tiers (one `useCapabilityTier()` resolved at boot; heavy code dynamic-imported behind the tier)

- **FULL** (capable, fine-pointer/motion-ok/WebGL): landing R3F showpiece + postprocessing; OGL hero cover + pointer parallax + glossy toggles + plexus glow; Lenis + pointer-gravity cursor; kinetic variable type; full spring gestures.
- **LITE** (no/limited WebGL, low cores/memory, or Save-Data): OGL dropped to the single cheapest use or skipped; landing crystal grid → pre-rendered looping poster; covers → static duotone CSS + glow; sigils → seeded 2D SVG; grain → static texture; Motion gestures keep working (3-card stagger cap, no `dragElastic`); native scroll, no Lenis/cursor FX.
- **STATIC / reduced-motion `[critique — first-class, not an afterthought]`:** a calm, crisp, fully-functional **duotone-on-ink** app — no distortion, no fan, frozen crystals/glyphs, instant crossfades, gloss kept but spec-sweep dropped, color floods → single static tints, sound off. **This tier must be designed and reviewed as a real deliverable, not a stripped husk.**

**Cross-cutting (all tiers):** real selectable DOM text + correct focus order + untouched tap targets; WCAG AA contrast; aberration capped so captions/dates never blur; privacy as real ARIA controls with word labels; `/u` + `/e` always instant; one shared WebGL context with offscreen/hidden/idle pause; `ogl`/`drei`/`postprocessing` version-pinned with the thin OGL adapter.

---

## 11. Accessibility guarantees

- Effects ride **imagery only**; event data is locked-metric, selectable, screen-reader DOM.
- Text never animated on critical content; variable-axis = `wght` on hero/headings only.
- Contrast ≥ 4.5:1 for all text < ~18px; focus order mirrors visual flow; tap targets ≥ 44px and never displaced by distortion.
- Visibility/privacy = real `switch`/`radiogroup` + word label + one-line consequence; gloss is decoration on top.
- `prefers-reduced-motion` and the STATIC tier are first-class and CI-tested (Playwright reduced-motion + no-WebGL paths).

---

## 12. Build order & must-fix corrections (from the critique)

1. **`/u` and `/e` "SSR-fast" is FALSE on a static SPA** (`not_found_handling=single-page-application`, no SSR). **Decision needed (§13):** add a **Worker edge-render** for share pages (the `barycal` edge function already serves HTML — extend it to render server HTML + OG tags + a blurred cover, then hydrate), **or** drop the "SSR-fast" wording and accept a fast client render with skeletons. Share pages must never be gated behind a preloader or heavy WebGL either way.
2. **Build the app shell + static tier FIRST**, then layer FULL-tier WebGL (the landing R3F/troika/GSAP comes after the usable app exists — matches plan Phase order 1–4 before 5).
3. **Cut ~40% of the WebGL surface:** ONE OGL cover (focused/hero), everything else CSS/SVG; instrument toggles share one OGL scene; in-app sigils are SVG.
4. **Re-baseline the bundle budget** to ~170–190kb shell + the CI WebGL-leak gate (§9).
5. **Drop gyro; magnetic cursor + Lenis are landing/desktop-only;** mobile velocity comes from native-scroll + drag deltas.
6. **Protect text + privacy semantics** (§11); make the **STATIC tier first-class**.
7. **Specify the `velocityRef` bridge + the single "settle" character** once and reuse (§3, §6).
8. **Lead with the ownable signature** (§3: social-graph-as-visual + barycenter physics + time-as-axis), not with aberration/glitch.

---

## 13. Open decisions for Ed

- **D1 — Share-page rendering:** Worker edge-render `/u` + `/e` (best for OG previews + cold-open speed; reuses the edge function) **or** fast client render with skeletons (simpler)? Affects plan Tasks 4.7/4.8.
- **D2 — Ambition vs. scope:** the FULL tier (R3F landing showpiece + OGL covers + instrument toggles) is a lot for one maintainer. Ship order suggestion: static+lite tiers + Gravity Spine + one OGL cover + SVG sigils **first** (already exceeds poisys), then the R3F landing as a fast-follow. Confirm.
- **D3 — Font:** RESOLVED → a variable grotesque **sans**. Recommended: **Geist** (Sans + Geist Mono for the mono meta-labels — free, variable, technical), or **Mona Sans** (more expressive, has a width axis for squash/stretch). Both free/open, self-hosted.
