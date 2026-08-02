# COLD CALL COACH + CRM — MIGRATION MASTER PLAN
## Next.js Translation Spec & Design System · v1.0 · 2026-07-29

> **What this document is.** The single source of truth for migrating the Cold Call
> Coach + CRM from vanilla single-file to Next.js + TypeScript + Tailwind + shadcn/ui
> on Vercel. Claude Code reads this fresh every session. It survives context loss.
> It is a TRANSLATION SPEC of a frozen, verified feature set — not a redesign brief.
> STATUS.md in the old repo describes what exists; this document describes what it
> becomes. Where they conflict, this document wins.
>
> **What Claude Code may never do under this plan:** invent features, reopen the
> scoring schema, let the model do arithmetic, restyle beyond the design system
> below, or build ahead of the current phase.

---

## 0. TWO DEFAULT RULINGS — OVERRIDABLE

Two decisions were resolved by recommended default, not explicit adjudication.
Either can be reversed with a one-line instruction before its build phase starts.

1. **Score trend: KEEP, GATED.** Below 5 scored calls, the trend slot renders the
   honest empty state: `Trend unlocks at 5 scored calls · you have {n}`. At ≥5,
   the line renders. Rationale: a line through 3 points is noise; at 5+ it is the
   point of a coaching tool.
2. **CSV import: CUT for this migration.** Not translated. Google Maps scraper
   remains the sole lead-acquisition path. Logged in §12 as deferred re-add if a
   real external lead list ever materialises.

---

## 1. DESIGN PHILOSOPHY — RULES FOR EVERY SCREEN

These are the owner's rules, in the owner's voice. Claude Code obeys them on
every screen, every component, every empty state.

1. **Less is more.** Every element earns its place or it doesn't ship. When in
   doubt, leave it out — a missing element is a one-line follow-up; a noisy
   screen is a redesign.
2. **Data is the product.** This is a solo instrument, not a marketing surface.
   Numbers, scores, evidence, and next actions — nothing decorative.
3. **Readable by a stranger.** Someone who has never seen this tool should parse
   any screen in under ten seconds: what is this, what's the score, what do I do
   next. Kindo's scorecard passes this test; every screen here must too.
4. **Light exposes, so nothing hides.** The light palette was chosen because it
   makes sloppy spacing visible. If a layout only looks acceptable because
   spacing is ambiguous, fix the spacing.
5. **Colour is semantic or absent.** Cyan is the interaction accent, capped at
   ≤5% of any viewport. Green/red/amber mean pass/fail/warn and nothing else.
   No colour is ever decoration.
6. **One person, low volume, honest numbers.** No metric renders as signal when
   the underlying n makes it noise. Gates and empty states over fake trends.
7. **The model never does arithmetic.** Non-negotiable. See §6.

> **AMENDED 2026-08-02, before Phase 8b, by the owner.** Rule 4 stands and light
> remains the DEFAULT — but it is no longer the only skin. The owner asked for a
> dark mode ("as it stands, it's a bit bright"), toggled from the nav. What rule
> 4 actually defends survives intact: spacing and layout are still audited in
> the light skin, where ambiguity has nowhere to hide. Dark is the same §4 token
> names with §4.5's values behind them, and every other rule on this list —
> cyan ≤5%, semantic colour only, honest numbers — is graded in BOTH skins.
> §4.1's "identity break from NutriSA" is likewise unbroken: the identity is the
> navy/cyan terminal palette, not the lightness of the page behind it.

---

## 2. BUILD TARGET & STACK

| Concern | Decision |
|---|---|
| Framework | Next.js (App Router) + TypeScript, strict mode |
| Styling | Tailwind CSS + shadcn/ui primitives, themed by the tokens in §4 |
| Repo | **New GitHub repo**, new Vercel project. Not a branch of the old repo — `create-next-app` owns the root and collides with the existing `index.html` + `api/` tree, and the Phase 9 side-by-side cutover only works cleanly as two real deployments. |
| Hosting | Vercel, new project, same env vars re-added once |
| API | Next.js Route Handlers translating the existing serverless functions 1:1 (§9) |
| Runtime | Node runtime, NOT Edge — deliberate, carried over from the old app |
| Data | Same Supabase project: Postgres + private Storage bucket. No schema changes. |
| Env vars | Identical set: `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, `SUPABASE_RECORDINGS_BUCKET`, Apify token. Optional, with code defaults: `ANTHROPIC_MODEL` (→ `claude-haiku-4-5`), `PHASE1_USER_ID` (→ `solo`). **The `APIFY_TOKEN` (spec) vs `APIFY_API_TOKEN` (code) naming inconsistency is KNOWN and PRESERVED — do not fix.** *Corrected 2026-07-29: this row previously read `SUPABASE_ANON_KEY`, which no code path uses — `api/_supabase.js` reads `SUPABASE_SERVICE_ROLE_KEY`, and §9's private-bucket access and server-side clamps require service-role. Verified live against the project. The anon key is not used by this app and must not be added.* |
| Auth | Shared-secret `x-app-secret` gate, fail-closed, `requireSecret` first line of every handler. Real auth belongs to the multi-user phase, not this one. |
| Old app | Stays live and untouched until the cutover checklist (§11, Phase 10) passes. |

---

## 3. FEATURE INVENTORY — KEEP / REFINE / CUT

Adjudicated 2026-07-29. This table is closed. Nothing may be added to it.

> **AMENDED 2026-07-30, during Phase 6, by the owner.** One addition, and it is
> logged here precisely because this table is closed: the scraper's **location
> field gained a suggestion list** (`SA_LOCATIONS` in `lib/scrape.ts`, rendered
> as a native `<datalist>`). The owner asked for it after the first Phase 6
> build — typing "Durban, South Africa" in full every run, with a mistyped area
> costing a real Apify run before it announces itself. **A future session must
> not strip this as an invented feature.** Three things bound it: the input stays
> free text, so the list can only save keystrokes and can never refuse a search;
> the list is hardcoded, so no new dependency, env var or per-keystroke cost
> enters the app; and every entry carries its region, because the actor geocodes
> the string as typed and Berea and Morningside each exist in both Durban and
> Johannesburg. **Google Places Autocomplete was considered and rejected** for
> this migration — it wants a second paid dependency, a `GOOGLE_PLACES_KEY`, a
> new §9 route and per-keystroke billing on a tool whose only other cost is one
> Apify run. Logged in §12 as the re-add if the calling ever leaves KwaZulu-Natal.

> **AMENDED AGAIN 2026-08-02, before Phase 8b, by the owner.** Second addition:
> **dark mode** — a light/dark toggle in the nav. Logged here because this table
> is closed and an unrecorded control is a control a future session strips as
> invented. Three things bound it: **light stays the default** (§1.4 chose it
> deliberately; dark is opt-in and remembered in `localStorage`, and the app
> never follows `prefers-color-scheme` — an app that flips skin because the
> phone's clock crossed sunset is a surprise, not a feature); **it is one
> control in the nav, not a settings screen** (this app has no settings surface
> and does not grow one for a toggle); and **it is tokens only** — components
> are untouched, the dark values live behind §4's existing token names (§4.5),
> so no screen can drift dark-only or light-only. Built as Phase 8b (§11).

### KEEP (translate as-is, behaviour identical)
| Feature | Notes |
|---|---|
| Coach loop: record → upload → Deepgram Nova-3 diarised → Claude Haiku forced-tool-use scoring → persist | The spine. Behaviour-identical translation. |
| Six Hormozi scoring dimensions + forced-tool-use JSON schema | **FROZEN.** See §5. |
| JS-computed metrics: talk share, longest monologue (1.5s gap-merge), filler count | Ported as a pure typed function **with unit tests — its first ever**. See §6. Filler count explicitly survived a cut review: it names a behaviour fixable on the next call. |
| Speaker swap (manual cycle, full metric recompute, debounced persist) | Behaviour-identical. |
| Call ↔ lead linking (`lead_id` FK, `ON DELETE SET NULL`, per-lead call history with metrics strip) | Behaviour-identical. |
| Call delete (storage-first ordering, 404-from-Storage = success, skip `pending/`, `user_id='solo'` clamp) | Behaviour-identical. `confirm()` may become a shadcn AlertDialog — sanctioned upgrade. |
| Apify Google Maps scraper (25-result server clamp, phone-first dedup, minReviews default 5, neutral zero-outcome toast) | Behaviour-identical, **plus the location suggestion list added 2026-07-30 — see the amendment above.** |
| Lead add/edit/delete modal | shadcn Dialog + Form. |
| Drag-drop with edge autoscroll | Mobile necessity. Library choice free (dnd-kit suggested); behaviour must match. |
| Stale-leads hygiene counts (never called / quiet 7+ days) | The one dashboard element that improves at low volume. Dashboard tile — see §8. |

### REFINE (layout/presentation changes only — data model untouched)
| Feature | Refinement |
|---|---|
| Scorecard display | Adopt Kindo's `category → criteria → score → evidence` layout. §5. |
| Kanban terminal stage(s) | ~~Collapse `not_interested` into a count-chip / collapsed rail, expand on tap.~~ **REVERSED 2026-07-29 during Phase 4 — see §7.** All six stages are full columns; the board takes the full viewport instead of the shell's 1152px measure, and that is what reclaims the room. Layout only, either way. |
| Score trend | Gated at 5 scored calls (default ruling, §0). |
| Talk metric label | `Talk share — X% of spoken time` (already fixed in old app; carry forward). |

### CUT (do not translate; log in §12)
| Feature | Reason |
|---|---|
| Funnel visualisation | Conversion rates need volume; at 6 leads every segment is an anecdote the owner knows by name. Cheap to cut, cheap to re-add later inside component architecture, expensive only to keep. |
| Week-over-week delta | Percentage deltas on single-digit denominators are noise wearing a suit. Raw weekly count survives inside `4 / 25` (§8). |
| Average overall score | A manager's number. The practitioner's numbers are the last call and the weakest dimension. |
| CSV import (incl. garbage-file guard, auto-mapper, mapping UI) | Struck 2026-07-29. Scraper is the real acquisition path; CSV was disproportionately complex to translate for a rarely-used surface. Deferred, not deleted from history — see §12. |

### NEVER BUILD (ruled out permanently for this product)
- AI roleplay / training mode, or anything resembling it.
- Teams, multi-user, team benchmarks, seat management, org hierarchy — enterprise
  surface this solo tool does not sell to.

---

## 4. DESIGN SYSTEM — LIGHT TERMINAL

The target mood: **premium developer instrument / financial terminal.** Clinical
clarity, professional density, technical precision. The Kindo screenshots are the
taste reference for restraint and hierarchy. The navy/cyan "Neural Core" mockup
is the **anti-reference** — if any screen starts resembling it (glowing accents,
sci-fi labels, decoration posing as data), stop and strip.

> **AMENDED 2026-08-02, before Phase 8b, by the owner.** "Light Terminal" is now
> the default skin rather than the whole system: §4.5 adds an opt-in dark skin
> behind the same token names. Everything else in this section — type, geometry,
> the one-shadow rule, the four states — is skin-independent and unchanged. The
> anti-reference warning above applies with MORE force in dark, not less: dark
> ground plus glowing cyan is precisely the Neural Core failure mode, which is
> why dark's cyan budget is the same ≤5% and why nothing else in the dark
> palette saturates.

### 4.1 Palette
Deliberate identity break from the owner's dark-themed NutriSA — separate
instrument, separate skin. Define as CSS variables / Tailwind theme tokens; shadcn
components consume these, never raw hex in components.

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#F7F9FC` | App background (light frost) |
| `--surface` | `#FFFFFF` | Cards, panels, modals |
| `--surface-2` | `#EFF3F9` | Insets, table header rows, collapsed rail |
| `--border` | `#E2E8F0` | All borders, 1px, no exceptions |
| `--text` | `#0A1128` | Primary text (midnight navy) |
| `--text-2` | `#3E4C66` | Secondary text |
| `--text-3` | `#64748B` | Muted / labels / timestamps (slate) |
| `--accent` | `#0891B2` | Cyan, disciplined. Interactive states ONLY: focus rings, active nav, primary buttons, links. **≤5% of any viewport. Never backgrounds, never headings, never charts-as-decoration.** |
| `--pass` | `#16A34A` | Pass / success / score ≥4 |
| `--warn` | `#D97706` | Warnings / neutral-outcome toasts / score 3 |
| `--fail` | `#DC2626` | Miss / errors / destructive / score ≤2 |

Score badge mapping (everywhere a /5 score renders): 1–2 → `--fail`, 3 → `--warn`,
4–5 → `--pass`. Badge = tinted background (10% opacity of the semantic colour) +
solid semantic text. Identical treatment in Coach panel, lead history, dashboard.

### 4.2 Typography
**Plus Jakarta Sans** for everything (via `next/font`, self-hosted). Replaces
Barlow for this app only. Numbers in data contexts always get `font-variant-numeric:
tabular-nums` so columns of scores and durations align.

App-scale type ramp (the brief's 72px hero is marketing-site scale; in-app, the
largest element is a stat):

| Role | Spec |
|---|---|
| Hero stat (dashboard numbers, overall score) | 44px / 700 / -0.02em / tabular-nums |
| Page title | 24px / 600 / -0.01em |
| Section header | 18px / 600 |
| Card header / criterion name | 15px / 600 |
| Body / evidence text | 15px / 400 / 1.6 line-height |
| Label / meta / eyebrow | 12px / 500 / +0.04em / uppercase / `--text-3` |

### 4.3 Geometry & elevation
- Spacing scale: **8 / 16 / 32 / 64 only.** No 12s, no 20s, no eyeballed values.
  (4px permitted solely for icon-to-text gaps.)
- Border-radius: **8px** cards/modals/inputs, **6px** buttons/badges/chips.
  Never pill-rounded, never 0px-sharp.
- Shadow, one and only: `box-shadow: 0 4px 20px -2px rgba(10,17,40,0.05)` on
  floating surfaces (modals, popovers, drag ghosts). Resting cards use border
  only — no shadow. No other shadow values exist.
- Datagrids over decoration: structured grids, 1px `--border` lines, generous
  whitespace, crisp type. No zebra striping, no icon soup, no illustration.
- Every interactive element: visible hover state + 2px `--accent` focus ring.
  Keyboard focus always visible.
- **Modals — sized to their contents, and the shell never scrolls.** *Added
  2026-07-30 during Phase 5; this section previously said nothing about modal
  width, and the default 512px was inherited from shadcn rather than chosen.*
  A modal that carries only a form stays narrow (512px). A modal that carries a
  **scorecard** takes 1024px — at 512px the audit grid, metrics strip and
  transcript could only be read sideways, through a letterbox, which is how the
  lead modal shipped in Phase 5 and was rejected on sight. Two structural rules
  come with it, and both are behaviour, not decoration:
  - **The panel does not scroll; a region inside it does.** The close control is
    positioned against the panel, so if the panel is the scrolling box the close
    control scrolls away — and reading a call's score at the bottom of a lead
    leaves no way out but scrolling back to the top. Wrong, and fixed.
  - **The content column is `1fr`, never `auto`.** An auto-sized column takes the
    width of its widest child, so a single long URL or a wide grid makes the
    whole modal scroll horizontally instead of the content wrapping inside it.

### 4.4 The four states — acceptance rule
Every surface ships all four states or it does not ship:
- **Empty** — an invitation to act, in interface voice (`No calls yet. Record
  your first call to see it scored here.`). Never a blank void.
- **Loading** — skeleton in `--surface-2`, no spinners-as-personality.
- **Error** — states what happened and what to do. Never apologises, never vague,
  never a silent revert. Failed optimistic updates roll back visibly + toast.
- **Happy** — the spec'd layout.

~~The four-states matrix in STATUS.md is the acceptance checklist per phase.~~
**The four-states matrix in §13 is the acceptance checklist per phase.** *Moved
2026-08-02 during Phase 8: the matrix was in the OLD repo's STATUS.md, which
Phase 9 archives, so the checklist this migration is graded against would have
been switched off with the thing it grades. §13 is that matrix rewritten for what
this app renders; the old one stays where it is as the record of what was
translated from.*

### 4.5 Dark skin — added 2026-08-02, Phase 8b

Same token names, different values, behind a `.dark` class on `<html>`. Light is
the default; dark is opt-in from the nav toggle and remembered in
`localStorage("theme")`. An inline script — first child of `<body>`, so it runs
before anything paints — re-applies the stored choice, which is what prevents a
white flash on every load of a dark-mode tab. The app never reads
`prefers-color-scheme`; §3's second amendment records why.

| Token | Dark hex | Note |
|---|---|---|
| `--bg` | `#0B1220` | Near-black navy — same family as light's `--text`, not grey |
| `--surface` | `#101A2E` | Cards, panels, modals. Also the `theme-color` meta in dark. |
| `--surface-2` | `#18233A` | Insets, table headers, skeletons |
| `--border` | `#263248` | Still 1px, no exceptions |
| `--text` | `#E7ECF5` | |
| `--text-2` | `#AEBACE` | |
| `--text-3` | `#7E8CA6` | |
| `--accent` | `#22D3EE` | Brighter cyan — `#0891B2` silts into a dark ground. Same ≤5% cap, same interaction-only rule. |
| `--pass` | `#22C55E` | One step brighter than light's, for contrast on dark surfaces |
| `--warn` | `#F59E0B` | 〃 |
| `--fail` | `#F87171` | Two steps. Red is the darkest of the three hues at equal nominal lightness, so it needs the extra lift — see the measurements below. |

**These values were measured, not eyeballed** (WCAG relative luminance; the
script is throwaway but the numbers are in the commit message). The score badge
is the app's core output and its treatment is a 10% tint of the semantic colour
carrying solid semantic text, so that pairing is the one that had to clear the
bar:

| Badge tint, text on 10%-over-`--surface` | Light | Dark |
|---|---|---|
| pass | 2.95 | **6.49** |
| warn | 2.86 | **6.92** |
| fail | 4.14 | **5.52** (at `#EF4444` it was only 4.25) |

Five things change that are not §4.1 tokens, each recorded so a future session
does not "fix" one:

- **Solid semantic backgrounds take NAVY text on the dark skin.** One rule,
  applied twice: `--primary-foreground` and `--destructive-foreground` both flip
  to `#0A1128`. White on the brighter cyan is **1.81:1** and white on the
  brighter red is **2.77:1** — both unreadable; navy is **10.34:1** and
  **6.76:1**. This is why `#0A1128` appears in a dark palette at all.
- **`--destructive-foreground` is a new token.** The destructive button
  hardcoded `text-white`, which is correct on light (4.83:1) and fails on dark.
  A hardcoded colour cannot have two skins, so it became a token — the same
  reason §4.1 bans raw hex in components.
- **The scrim became a token.** Modal overlays were `--text` at 20%, which in
  dark mode is a WHITE fog over a dark page. `--scrim` now exists in its own
  right (`rgba(10,17,40,0.2)` light / `rgba(0,0,0,0.5)` dark) and the overlays
  use `bg-scrim`. Dimming means darker in both skins.
- **The one shadow gets a dark value** — same geometry, `rgba(0,0,0,0.5)`. A 5%
  navy shadow is invisible on `#0B1220`. Still exactly one shadow.
- **`color-scheme: dark`** on `.dark`, so UA widgets (scrollbars, native form
  controls) follow the skin.

Chrome separation is at parity with light or slightly better — `--surface`
against `--bg` is 1.08 dark vs 1.05 light, and `--border` on `--surface` is 1.35
dark vs 1.23 light. Cards read as raised and borders stay visible without
becoming lines that shout.

**A finding this phase surfaced and deliberately did NOT fix.** Sweeping every
rendered text node on `/styleguide` in Chrome against its composited background:
**light fails on 108 of them, dark on none.** The light failures are almost
entirely the score badges — `tint-warn` at 2.41:1 and `tint-pass` at 2.50:1 on
the table's `--surface-2` rows — plus the primary button's white-on-cyan at
3.68:1. That is pre-existing, shipped since Phase 0, and fixing it means
reopening §4.1's palette, which is a different decision from the one that was
asked for. It is logged in §12. The dark skin is not permitted to inherit the
problem, which is why its numbers above clear the bar; but this phase does not
quietly restyle the light app while adding a dark one. **Light is unchanged by
this phase** — `--scrim` in light is `rgba(10,17,40,0.2)`, the exact value
`bg-foreground/20` already computed to, and the `lg` button's fix moved it from
inheriting `--text` to the navy it was always meant to have.

Score badge mapping, the 10% tint treatment, the type ramp, radii and spacing
are untouched — they are skin-independent. `/styleguide` prints BOTH hexes per
token, and the toggle is the acceptance test: flip it and every swatch must
match its dark column, or the file has drifted from this table.

---

## 5. SCORECARD SPEC

### 5.1 The frozen brain
The six Hormozi-derived dimensions, the Claude Haiku forced-tool-use JSON schema,
the scoring prompt, and every field it returns (per-dimension score /5 + evidence
quote + fix, overall score, top_fix) are **FROZEN. Copy them verbatim from the
old app. Zero changes — not "improvements," not renames, not reorderings.**
A scoring-logic change is its own future planning pass with its own test calls.

### 5.2 The new layout (this is the REFINE)
Adopt Kindo's audit-table structure — readable by someone who has never seen the
tool:

```
┌─ Call header ────────────────────────────────────────────────┐
│  [overall badge 44px]   date · duration · linked lead        │
│  TOP FIX: {top_fix}                        ← the hero line   │
├─ Metrics strip ──────────────────────────────────────────────┤
│  Talk share        Longest monologue        Fillers          │
│  58% of spoken time      42s                  14             │
│  (disclosed-estimates note, 12px, --text-3)                  │
├─ Review audit ───────────────────────────────────────────────┤
│  STATUS   CRITERION            SCORE    EVIDENCE · FIX       │
│  [3/5]    Dimension name       3/5      "verbatim quote…"    │
│                                         Fix: {fix text}      │
│  … × 6 dimensions                                            │
├─ Transcript (collapsed by default) ──────────────────────────┤
│  Diarised turns, rep-relative labels, speaker-swap control   │
└──────────────────────────────────────────────────────────────┘
```

Rules: evidence is a verbatim quote in `--text-2`; the fix is the emphasised
line (the actionable thing); dimension rows are a strict grid — badge column,
name column, evidence/fix column; identical component renders in the Coach
panel and in lead call history (single source, no forked markup).

### 5.3 Deferred, named, out of scope: required-miss semantics
Kindo's strongest structural idea — binary criteria with pass/miss status and
`Required` flags, surfacing `Required misses: 1`. **Explicitly deferred.**
One-line placeholder spec for the future pass: *extend the tool-use schema with
an optional array of hard pass/fail criteria (e.g. "confirmed prospect's web
presence before claiming they lack one"), each flagged required or optional,
rendered as a status column above the scored dimensions.* Touches the frozen
brain → needs its own planning pass + its own test call. Not a rider on this
migration.

---

## 6. DETERMINISTIC ENGINE CONTRACT

**The model never does arithmetic. JavaScript computes; the model transcribes
(Deepgram) and judges (Haiku scoring). Any figure displayed as a number was
computed in code.**

Port `computeMetrics` as a pure, typed, dependency-free function:

```
computeMetrics(turns: DiarisedTurn[], repSpeaker: number): {
  talkSharePct: number      // rep turn-duration ÷ Σ all turn-durations.
                            // Share of SPOKEN time, not wall clock — the label
                            // must say "of spoken time".
  longestMonologueS: number // longest merged rep span; gaps <1.5s merge.
  fillerCount: number       // regex estimate incl. so|like|right — disclosed
                            // in UI as estimate. Tightening deferred (§12).
}
```

- **First unit tests in this codebase land here** (Vitest): known-turns fixtures
  covering gap-merge boundaries (1.4s merges / 1.6s doesn't), swap symmetry
  (metrics for speaker A + B are consistent), single-speaker degenerate case,
  empty turns.
- Speaker swap recomputes all three from reassigned turns and persists
  (debounced PATCH) — never a display relabel.
- Scoring returns judgments and quotes only. If any prompt change would make the
  model return a computed number, that change is forbidden.

---

## 7. KANBAN SPEC

> **AMENDED 2026-07-29, during Phase 4, by the owner.** This section originally
> specified five live columns plus a collapsed count-chip rail for
> `not_interested`. The rail was built, reviewed on screen, and rejected: every
> CRM the owner actually uses — HubSpot, Pipedrive, GoHighLevel — shows its
> lost/dead stage as a permanent full column, and the rail was the one place
> this board asked its owner to learn a control their existing tools do not
> have. **All six stages are full columns.** The width that pays for the sixth
> came out of the same review and is now a rule of its own, below. The rail's
> implementation — a `terminal` flag, `partitionStages`, the collapsed drop
> zone, the remembered open/closed state — was **deleted, not disabled**, so
> nothing carries machinery for a mode that no longer exists. Superseded text is
> struck through. The idea is captured in §12 in case the stage list ever grows.

> **AMENDED AGAIN 2026-07-30, during Phase 5, by the owner.** The width rule
> below said the columns flex above **1280px** and hold 272px under it. That
> threshold was wrong in practice and the reason is worth writing down: a
> 1920×1080 laptop at Windows' default 150% display scaling reports about
> **1150 CSS px**, so the breakpoint never fired, the columns stayed at 272px,
> the row demanded ~1776px, and the owner had to run the browser at **65% zoom
> to see all six columns.** That is precisely the failure the terminal rail was
> invented to prevent — two stages effectively hidden — arriving through a
> media query instead of a container. **The threshold is now `lg` (1024px)**,
> which is the real floor for six readable columns, and the inter-column gap
> drops from 16px to 8px (both on §4.3's scale) to buy back 40px of it. Below
> 1024px the columns hold 256px and the row scrolls, which is the phone case
> edge autoscroll exists for. Lesson recorded, not just the fix: **CSS pixels
> are not hardware pixels, and a breakpoint chosen against a spec sheet will be
> wrong on the machine the tool is actually used on.**
>
> One label changed with it. At ~174px, `Call back requested` was the only column
> header that truncated, so it is now **`Call back`**; the other five fit. Shorter
> is also the better header — a kanban column names the state its cards are in,
> and "Call back" is that state. **Stage keys are untouched** (`callback`), so
> this is a display change only and no stored row is affected.

> **AMENDED A THIRD TIME 2026-07-30, during Phase 6, by the owner.** The stage
> headers are **pinned**, and the board is a **pane rather than a page**. The
> report: with a long column, moving a card at the bottom of it meant dragging
> that card all the way up to the top of the page just to read which stage was
> which — the labels had scrolled away, so the one thing a drag needs to know was
> the one thing not on screen. Three changes, and the first is the only one that
> is really a decision:
> - **The board owns its vertical scroll.** `/leads` no longer scrolls the
>   document; the board scrolls inside a viewport-height pane (`--board-h` =
>   `100dvh` − nav − `<main>`'s padding, in `globals.css` where those numbers
>   meet exactly once). This was not a preference: `overflow-x: auto` already
>   made the board a scroll container in **both** axes — CSS computes
>   `overflow-y: visible` to `auto` when the other axis is not `visible` — so a
>   `sticky` header inside it could only ever pin against the board's own
>   scrollport. It had no height to scroll within, so nothing pinned. **A pinned
>   header is not available without this.** The app shell is deliberately NOT
>   touched: Coach and Dashboard are reading surfaces, still scroll the document,
>   and Phase 5's `router.push` scroll-to-top keeps working because of it.
> - **Edge autoscroll gained the vertical axis**, which is the cost of the pane,
>   not a new feature. The drag could never scroll the document, so a slot below
>   the fold was already unreachable; now that the board scrolls, the drag has to
>   be able to scroll it — and the pane's fold is closer than the page's was.
> - **The drop target is the whole column, header included.** It was the card area
>   only, so a card dropped on a pinned header — the largest and now the only
>   always-visible part of a column — landed nowhere and silently kept the
>   previous target. Dropping on a header resolves to index 0 with no special
>   case, because the pointer is above every card's midpoint, and "top of that
>   stage" is the right meaning anyway.
>
> **The first cut of this shipped two bugs, both caught on screen by the owner
> within minutes, and the lesson is worth more than the fix.** Five columns ended
> halfway down the board and, one screen further down, the headers, the borders
> and every empty column vanished, leaving loose cards on the page background.
> Cause: `align-items: stretch` sizes items to the **flex line**, and in a
> fixed-height scroller the line is the scrollport — one screen. So each column's
> box was one screen tall while the longest column's cards overflowed it, and a
> sticky header is constrained to its **containing block**, so once you scrolled
> past that box the header had nothing left to pin inside. The scroller and the
> flex row are now two elements: the row is `min-h-full`, so its height is
> `max(one screen, tallest column)` and the columns stretch to the ROW. Second
> bug, same session: the nav is `4rem` **plus a 1px border**, so the pane was 1px
> too tall, the document grew a scrollbar it should never have had, and scrolling
> that 1px took the pinned headers off screen with it. `--nav-h` now sits on the
> `<header>` so the border is inside the number. **The lesson, and it rhymes with
> the second amendment's: a pane layout is only as correct as the box you measured
> against. `stretch` measures the scrollport, `sticky` measures its containing
> block, and a border you forgot measures itself.**
>
> Not on `/styleguide`, and that is not an omission: the header's rendering is
> byte-identical (same `bg-muted`, same border, same eyebrow). What changed is
> scroll behaviour, which a short static gallery cannot show and which §4 does not
> govern.

- **Six columns**, one per stage, in this order: `new · no_answer · callback ·
  interested · booked · not_interested`. ~~Five live columns at full width; the
  terminal stage collapses to a count-chip rail — `Not interested (12)` —
  expanding on tap to a simple list, not a full column.~~ Data model untouched
  either way: same stage values, same rows, and `/api/leads` is unaware of how
  the board lays them out.
- **Board width — the kanban does NOT take the app shell's measure.** It is a
  datagrid and spans the full viewport; Coach and Dashboard keep the 1152px cap
  because they are reading surfaces and prose wants a measure. This is not
  cosmetic: six columns need more width than the shell has, so a capped
  container silently hid two of them, which is exactly what the rail had been
  invented to avoid. ~~Above 1280px the columns flex to fill the viewport; below
  it they hold 272px and the row scrolls horizontally — which is what edge
  autoscroll is for.~~ **Above 1024px (`lg`) the columns flex to fill the
  viewport, at an 8px gap; below it they hold 256px and the row scrolls
  horizontally — which is what edge autoscroll is for.** Corrected 2026-07-30,
  see the second amendment note above. **The board is also a fixed-height pane
  that owns its own vertical scroll, and the stage headers pin to its top** —
  third amendment, same date.
- Drag-drop: optimistic move, edge autoscroll on mobile **in both axes** (§7's
  third amendment), failed persist rolls
  back position AND stage visibly + error toast (behaviour identical to old
  app's verified offline handling). **Pointer events, never HTML5 drag-and-drop**
  — native DnD failed on link-bearing cards, could not autoscroll the
  overflowing board, and never fires on touch.
- Card face: business name, phone, maps rating, website link
  (`stopPropagation` behaviour preserved). Nothing else. The maps rating is the
  **number** (tabular-nums, one decimal, no chip when null), where the old card
  carried a Maps *link*. The old card's "No website" flag, industry chip, notes
  flag and Call button are all cut; the Call button is Phase 5, not hidden.
- Empty column state: `Drop leads here`.
- Deferred (§12): stale-indicator on cards + never-called sort/filter.

---

## 8. DASHBOARD-FOR-ONE SPEC

The screen answers exactly three questions for one person. Three groups, top to
bottom. Nothing else.

**1 — Am I doing the work?**
`Calls this week: 4 / 25` — hero stat vs target. Target is a **hardcoded
constant** (`WEEKLY_CALL_TARGET = 25`) in the codebase, changeable only by
commit. No settings UI. Subtle progress bar beneath (bar `--text-3`-tinted;
`--pass` at ≥100%; **not** cyan — progress is state, not interaction). No
week-over-week comparison exists.

**2 — Am I getting better?**
- **Hero: most recent scored call** — its overall badge + its `top_fix`, tap →
  full scorecard. The single most actionable datum for a solo practitioner.
- **Secondary: weakest dimension across all scored calls** — lowest mean
  dimension as a labelled bar: `Discovery is your floor — drill it.` (computed
  in JS, per §6).
- **Trend: gated per §0** — under 5 scored calls, the unlock message; at ≥5, a
  minimal line (navy stroke, no gradient fill, no dots-per-point decoration).
  *"Navy" here means `--text`, not the literal hex.* The line is
  `stroke-foreground`, so on §4.5's dark skin it inverts to frost (measured at
  14.65:1) instead of disappearing into the ground. A future session must not
  "correct" it to a hardcoded navy — that would make the trend invisible in dark
  and put a raw hex in a component, which §4.1 bans.
- No average overall score anywhere.

**3 — Who do I call next?**
Hygiene tile: `5 leads never called · 6 quiet for 7+ days`, each count tapping
through to the kanban filtered accordingly. This is the call queue. (Kanban-side
integration deferred, §12.)

---

## 9. API TRANSLATION CONTRACT

Each existing serverless function becomes a Next.js Route Handler.
**Semantics are behaviour-identical; only module syntax changes.**

| Route | Methods | Preserved semantics |
|---|---|---|
| `/api/calls` | GET, PATCH, DELETE | GET by `lead_id` includes `metrics` in select. PATCH persists analysis + metrics + rep_speaker (save-analysis stays folded in — no separate route). DELETE: `?id=` → fetch scoped `id AND user_id='solo'` → Storage object first (skip `pending/`, 404 = success, other Storage error = 500 with row intact = retryable) → then row → `{deleted, storage: 'deleted'|'skipped'|'missing'}`. |
| `/api/create-upload` | POST | Row creation + signed direct-PUT to private Storage. |
| `/api/analyze` | POST | Deepgram Nova-3 diarised → Claude Haiku forced-tool-use vs frozen schema. Returns turns + scores; **client** computes metrics. |
| `/api/leads` | GET, POST, PATCH, DELETE | CRUD, stage moves. Server clamps preserved. |
| `/api/scrape` | POST | Apify Maps: 25-result server clamp, phone-first dedup, minReviews default 5. |

**Universal handler rules:** `requireSecret` is line one, fail-closed (503),
every route. `user_id='solo'` clamp on every query. No email fields. No stack
traces or storage paths in error bodies. Service-role client exists server-side
only; zero frontend lines carry any token.

---

## 10. HOW THE OWNER WORKS — BAKE INTO EVERY SESSION

- One phase per branch. Fresh Claude Code session per phase. Plan approved in
  Claude.ai before build.
- Gates: `/office-hours` to plan · `/review` before every commit · manual git
  only · never `/ship`.
- Code-delivery standard, every change: (a) the change, (b) exact test/verify
  steps, (c) exact git commands (`git add .` / `git commit -m "…"` / `git push`).
- Pre-merge checklist: `requireSecret` line one ✓ · no email fields ✓ ·
  server-side clamps ✓ · zero frontend token lines ✓ · four states present ✓ ·
  cyan ≤5% ✓.
- Live Server / `vercel dev` + real-phone verification is the OWNER'S job.
  Claude Code cannot reach the local server and must always state exactly what
  to verify.
- Dropdown/menu items: `onmousedown` + `preventDefault` semantics (or shadcn
  primitives that handle blur-before-click correctly). Touch targets ≥44px.

### 10.1 The git loop — the exact commands, every time

*Added 2026-07-30 at the owner's request, so this stops being re-derived every
session. Claude Code: these are the commands to hand over; do not invent
variations, and do not chain them with `&&`.*

**The shell is PowerShell 5.1.** It has no `&&` — `A && B` is a parser error, not
a chain. Every block below is one command per line for that reason. Paste the
whole block; PowerShell runs the lines in order. (`git` itself is identical on
Windows; only the chaining differs.)

**Repo facts:** remote is `origin`
(`github.com/SrimanArjunaPersadh/cold-call-coach-next`), `main` tracks
`origin/main`, `gh` is installed and authenticated.

**① Start a phase** — one phase, one branch (§10). Uncommitted work follows you
onto the new branch, so this is also the recovery when you started on `main` by
mistake.

```
git checkout main
git pull --ff-only
git checkout -b phase-N-shortname
```

**② Commit** — after the gates pass and after `/review`. Never before.

```
npm test
npx tsc --noEmit
npm run lint
npm run build
git add .
git commit -m "Phase N: what it does"
git push -u origin phase-N-shortname
```

`-u` only on the first push of a branch; plain `git push` after that.

**③ Land it on `main`** — the default is a fast-forward, which is how Phase 5
landed.

```
git checkout main
git pull --ff-only
git merge --ff-only phase-N-shortname
git push
git branch -d phase-N-shortname
git push origin --delete phase-N-shortname
```

`--ff-only` on both is deliberate: it **fails loudly** rather than silently
inventing a merge commit. If `git merge --ff-only` refuses, `main` has moved since
the branch started. Rebase the branch onto it and land again:

```
git checkout phase-N-shortname
git fetch origin
git rebase origin/main
git push --force-with-lease
git checkout main
git merge --ff-only phase-N-shortname
git push
```

`--force-with-lease`, never plain `--force`: it refuses if the remote moved under
you instead of overwriting whatever is there.

**③b Land it as a PR instead** — when the diff is worth reading on GitHub, which
is how Phase 4 landed (PR #4). Same ① and ②, then:

```
gh pr create --fill
gh pr view --web
gh pr merge --merge --delete-branch
git checkout main
git pull --ff-only
```

This one DOES create a merge commit; that is the trade for the reviewable diff.

**③c Land it as a SQUASH instead** — one commit on `main` per phase, with the
reviewable diff on GitHub. This is how Phase 8 landed (`bbde089`, PR #5). *Added
2026-08-02, after Phase 8, because this variant breaks the housekeeping command
below and nothing said so.*

```
gh pr create --fill
gh pr view --web
gh pr merge --squash --delete-branch
git checkout main
git pull --ff-only
```

**The catch, and it is the whole reason this variant is written down.** A squash
writes a NEW commit containing your branch's changes; your branch's own commit is
not an ancestor of it. Git therefore does not know the branch was merged, and
`git branch -d` **refuses** — the exact check the housekeeping note calls "the
check you want" reports a false alarm here, on a branch that is fully landed.

Do NOT reach straight for `-D`. Prove the content landed first, then override:

```
git checkout main
git pull --ff-only
git diff main phase-N-shortname --stat
git branch -D phase-N-shortname
git push origin --delete phase-N-shortname
```

**The `git diff` line must print nothing.** Empty means every byte of the branch
is already on `main` and there is nothing to lose. `-D` deletes unmerged work
without asking, so that empty diff is doing the job `-d` normally does for you.
If it prints anything at all, STOP — something did not land, and deleting the
branch destroys the only copy.

Also note `--delete-branch` above only removes the REMOTE branch. The local one
survives on this machine either way, which is how `phase-1-api` and
`phase-2-metrics` outlived their merges.

**④ Start of any session, or after landing anything** — get level before you
touch code:

```
git checkout main
git pull --ff-only
git status
```

**⑤ Record the phase in §11.** A phase is not done when it merges, it is done when
§11 says what actually got verified. State plainly which phone gates ran and which
did not — three phases already carry unrun gates because that note was honest.

```
git add MIGRATION-MASTER-PLAN.md
git commit -m "docs: record Phase N merged, gates run/unrun"
git push
```

**Housekeeping.** `phase-1-api` and `phase-2-metrics` are still on this machine
long after merging. Delete a merged local branch with `git branch -d <name>` —
lowercase `-d` refuses if it is not merged, which is the check you want. **That
check only works after ③ or ③b.** After a squash (③c) it refuses on branches that
ARE merged, and the diff-then-`-D` sequence in ③c is the replacement. Know which
way the phase landed before you delete its branch.

---

## 11. PHASED BUILD CHECKLIST

One phase = one branch = one fresh session = independently verifiable. Old app
stays live throughout. Do not start a phase until the previous one is merged.

- [ ] **Phase 0 — New repo, scaffold & tokens.** Create a new GitHub repo
      (e.g. `cold-call-coach-next`) and a new Vercel project pointed at it —
      the old repo and its `main` are untouched. Same Supabase project, same
      env vars re-added in the new Vercel project. `create-next-app` (TS
      strict) + Tailwind + shadcn/ui. Encode §4 completely: theme tokens, Plus Jakarta Sans via
      `next/font`, type ramp, radius, the one shadow. Build a `/styleguide`
      route rendering every token, type role, badge colour, and button state —
      the visual acceptance test for the whole system. App shell: top nav
      (Coach · Leads · Dashboard — horizontal, left-to-right). Env vars into
      Vercel. **Verify:** styleguide matches §4 on laptop + phone; cyan audit
      passes.
- [ ] **Phase 1 — API translation.** All Route Handlers per §9 against the SAME
      Supabase project. **Verify:** curl each route with/without `x-app-secret`
      (fail-closed), diff GET responses against the old app's byte-for-byte on
      the real data.
- [ ] **Phase 2 — Metrics engine + first tests.** `computeMetrics` as pure typed
      function + Vitest suite per §6. **Verify:** tests green; function output
      for the surviving 69s call matches the old app's stored metrics exactly.
- [ ] **Phase 3 — Coach loop.** Record → upload → analyze → scorecard (§5.2
      layout) → speaker swap → debounced persist. **Verify:** one real 30s+
      recording end-to-end on the phone; swap recomputes all three metrics and
      persists; four states (mic denied = error state).
- [ ] **Phase 4 — CRM kanban.** Six stage columns (§7 as amended), drag-drop +
      autoscroll, lead modal. **Verify:** phone drag with autoscroll;
      airplane-mode drag rolls back + toasts; empty column state.
      *Merged 2026-07-29 as PR #4 (`89e27ba`). The phone verification above was
      NOT run before merge — it remains outstanding, alongside Phase 3's.*
- [ ] **Phase 5 — Linking & history.** Call↔lead linking UI, per-lead history
      (same scorecard component as Coach), metrics strip, call delete with
      AlertDialog. **Verify:** link → history renders identically to Coach
      panel; delete removes row + Storage object; retry-safety test (bad bucket
      env → 500, row survives).
      *Merged 2026-07-30 straight into `main` (`694ea86`), fast-forward, no PR.
      The verification above was NOT run before merge — it is outstanding,
      alongside Phase 3's and Phase 4's. Three phases now carry unrun phone
      gates; §8's four-states sweep is the last place they can be cleared
      before the Phase 9 cutover.*
      **The trap in this phase's verification, recorded so it is not forgotten:**
      the only call with real stored metrics is the 15 July row, and it was
      written by the OLD app. Phase 5's history renders that row correctly even
      if the NEW persist path is broken — so "history looks right" proves
      nothing. The gate is a **fresh ~40s two-voice recording** whose metrics
      strip in the lead history matches what the Coach panel showed. Until that
      specific check runs, call↔lead linking is unproven, not verified.
      Static checks that DID pass on `694ea86`: 148 Vitest tests, `tsc`,
      `eslint`, `next build`. None of them touch a microphone, Supabase Storage,
      or a phone.
- [x] **Phase 6 — Scraper.** Apify flow + neutral zero-outcome toast.
      **Verify:** one real scrape; one all-filtered scrape shows amber toast.
      *Merged 2026-07-30 into `main` (`d8a739e`), fast-forward, no PR.*
      **The box is ticked because the gate actually ran** — the owner scraped for
      real and verified on a real phone, and reported it working. That is the
      convention from here: a ticked box means the phase's own Verify line
      happened on the owner's device. Phases 3, 4 and 5 stay unticked for exactly
      that reason and **this phase does not clear them** — their gates are still
      outstanding, and §8's four-states sweep is the last place to clear them
      before the Phase 9 cutover.
      **Three things landed with this phase that its Verify line never mentioned,
      because the owner asked for them mid-phase.** Recorded so the scope is
      honest rather than tidy:
      - **A loading panel** for the search, reusing the Coach recording indicator
        (live dot, the query being run, an elapsed clock). The greyed-out
        disabled form it replaced said "you can't", never "something is
        happening", and for 30–90 seconds of silence that reads as broken.
      - **A location suggestion list** — §3 amended, since that table is closed
        and the addition had to be recorded or a future session would strip it.
        Google Places was considered and logged in §12 instead.
      - **Pinned stage headers**, which is §7's third amendment and the largest
        of the three: the board became a fixed-height pane that owns its vertical
        scroll, edge autoscroll gained the vertical axis, and the whole column
        became the drop target. Its first cut shipped two layout bugs the owner
        caught on screen; both are recorded in §7 with their causes.
      The pinned-header change is the part worth one deliberate pass if it has
      not had one: **drop a card onto another column's pinned header** (it should
      land at the top of that stage), **hold a dragged card at the board's bottom
      edge** (it should autoscroll), and **scroll to the very bottom** (all six
      columns still bordered and headed, exactly one scrollbar on the page).
      Static checks that passed on `d8a739e`: 164 Vitest tests, `tsc`, `eslint`,
      `next build`.
- [ ] **Phase 7 — Dashboard.** §8 exactly: 4/25 hero, last-call hero + weakest
      dimension, gated trend, hygiene tile with filtered kanban tap-throughs.
      **Verify:** with <5 scored calls the gate message renders; counts match
      SQL run by hand.
      *Merged 2026-07-31 into `main` (`f124d97`), fast-forward, no PR.*
      **The box is unticked because the Verify line has not run on the owner's
      device** — neither the gate message below 5 scored calls nor the hygiene
      counts against hand-run SQL. Phases 3, 4 and 5 stay unticked for their own
      reasons and this phase does not clear them; §8's four-states sweep remains
      the last place all four can be cleared before the Phase 9 cutover.
      **One deliberate divergence from §8, and it is a decision rather than a
      gap.** §8 says the hygiene counts tap through to a filtered kanban. **They
      do not tap through**, because §12 defers the kanban-side filter: a link
      that lands on an unfiltered board reads as "show me those 5" and shows all
      of them, which is the silent wrong answer §4.4 exists to prevent. The
      tap-through arrives with the filter or not at all. The comment carrying
      this sits on `HygieneTile` in `dashboard-view.tsx` so a future session does
      not "finish" it by adding the link alone.
      **The last-call hero DOES tap through, and it reuses rather than adds.**
      No route returns one call with its transcript and metrics — `GET
      /api/calls` without `lead_id` is deliberately lean and there is no
      GET-by-call-id, and §9's table has exactly five routes. Phase 5 already
      renders the full scorecard inside the lead modal, so the tap navigates to
      that lead: a one-field `sessionStorage` handoff (`lib/open-lead.ts`), the
      same read-and-clear contract as Phase 5's `lib/pending-call.ts`, not a
      sixth route and not a `?lead=` URL that would outlive the lead and pull
      `useSearchParams` into the board.
      **Three things landed that the Verify line never mentioned.** Recorded so
      the scope is honest rather than tidy:
      - **A concurrency deadlock in `ensureSecret`, found in `/review` and
        fixed.** `<SecretModal />` keeps one resolver in one ref, so a second
        `prompt()` overwrote the first and its promise never settled. Nothing hit
        it until the dashboard issued two `apiFetch` calls in one
        `Promise.allSettled`: a cold tab opened straight on `/dashboard` would
        take the passphrase, resolve one request, and sit on loading skeletons
        for the lifetime of the tab with no way to retry. Concurrent callers now
        share one prompt, cleared on failure too so the 401 re-prompt still asks.
      - **The tap-through intent survives a failed load.** Taking the key and
        returning down the board's error path consumed it: tap the hero on a bad
        connection, hit Refresh, and the rows arrive with no modal and nothing on
        screen explaining why. It is held in a ref until a load actually lands.
      - **`Lead.created_at` / `updated_at` declared** in `lib/board.ts`. Both are
        `timestamptz not null` and `GET /api/leads` selects `*`, so both were
        always there; nothing before §8's "quiet for 7+ days" read them. Type-only
        — no route, no query, no board behaviour.
      **On `/styleguide` before shipping, per AGENTS.md**: the progress bar and
      the trend line are new treatments, so they went up as `DashboardDemo`
      (§8 · §0 · §4.1). Neither is cyan — progress is state, not interaction, so
      the fill is `--text-3` and turns `--pass` only at 100%; the
      weakest-dimension bar takes §4.1's existing badge mapping because a
      dimension mean is a /5 score, not a new colour.
      Static checks that passed on `f124d97`: 224 Vitest tests, `tsc`, `eslint`,
      `next build`.
- [ ] **Phase 8 — Four-states sweep & polish.** Audit every surface against
      §4.4; fix gaps; full phone pass.
- [ ] **Phase 8b — Dark mode.** Owner-requested addition, 2026-08-02, on branch
      `phase-8b-dark-mode` (§1, §3 and §4 amended the same day; §4.5 is the
      spec). `.dark` token block in `globals.css`; nav toggle (sun/moon, ≥44px,
      ghost variant); no-flash inline script as `<body>`'s first child;
      `theme-color` meta follows the skin by reading `--surface` off the live
      styles, never a hex in a component; `--scrim` token replaces the
      `--text`-at-20% overlays in dialog, alert-dialog and the secret modal;
      `/styleguide` prints light + dark hex per token.
      **Two bugs this phase found rather than caused, both recorded because
      neither is in the Verify line.**
      - **The `theme-color` meta reset on every client-side navigation.** Next
        owns that tag through the `viewport` export and re-renders it per route,
        so the tint went back to light's white while the page stayed dark —
        invisible on a laptop, and on a phone the address bar flashing white on
        every screen change. `ThemeToggle` re-applies it on `usePathname()`
        change. Found in Chrome, not by reading: `/styleguide` → `/dashboard`
        put it back to `#ffffff` with `.dark` still on `<html>`.
      - **The Record button had no text colour, in either skin.** `cn` runs
        `tailwind-merge`, which reads §4.2's `text-body` as a text COLOUR; cva
        emits the size class after the variant, so `text-body` won and stripped
        `text-primary-foreground`. The button then inherited `--text` — navy on
        cyan in light, which is legible by luck, and **frost on cyan at 1.52:1
        in dark**, which is not. `size="lg"` has exactly one call site and it is
        Record, the app's primary action. The `lg` size no longer carries a type
        utility; it never rendered at 15px anyway, since the base `text-sm`
        outranked it. The systemic fix is in §12 — it would resize every input
        below iOS's 16px zoom threshold and needs a phone pass this phase did
        not have.
      **Verify:** on
      `/styleguide`, flip the toggle — every swatch matches its dark hex, the
      flattened modal demo dims rather than fogs, and the cyan audit passes in
      dark; reload — the choice holds with no white flash; phone — browser
      chrome tint follows the skin; airplane-mode-style storage check is not
      needed (blocked storage degrades to per-tab toggle, §13 note).
- [ ] **Phase 9 — Cutover.** Side-by-side week: same Supabase, both apps live.
      Then: point primary usage at the new app; old app archived (repo kept,
      deployment paused) only after one full week of real use with zero
      regressions. **Verify:** one complete real workflow — scrape → call →
      score → link → dashboard reflects it — done entirely in the new app.

---

## 12. DEFERRED LOG — CAPTURED, NOT IN SCOPE

| Item | Trigger to revisit |
|---|---|
| Required-miss scorecard semantics (§5.3) | Own planning pass + own test call, post-migration |
| Filler regex tightening (`so\|like\|right` inflate) | Any scoring-quality pass |
| Kanban stale-indicators + never-called sort/filter | If the dashboard hygiene tile proves insufficient in use |
| Collapsible kanban columns (the §7 rail, reversed) | If the stage list ever grows past what a viewport fits. The pattern is real — Trello, Jira and Linear all collapse a column to a vertical strip — it was simply the wrong trade at six columns on a full-width board. Re-add as a per-column toggle the owner controls, remembered across visits, NOT hardcoded to one stage. |
| Google Places Autocomplete for the scraper's location field (§3 amendment, 2026-07-30) | If the calling ever leaves KwaZulu-Natal, or a hand-typed area wastes a real Apify run twice. Costs a `GOOGLE_PLACES_KEY`, a §9 route and per-keystroke billing; the hardcoded `SA_LOCATIONS` list is the standing answer until then. |
| CSV import re-add | If a real lead list ever arrives from outside Google Maps (bought list, GHL export, collaborator's spreadsheet) |
| Funnel visualisation re-add | ~50+ leads flowing through stages |
| **Teach `tailwind-merge` §4.2's type scale** (Phase 8b's finding, 2026-08-02) | `cn` runs `twMerge`, which does not know `text-stat/title/section/subhead/body/label` are font sizes and classifies them as text COLOURS. Wherever a component writes `text-body` before a colour class — input, textarea, select, card, and the three dialog descriptions — the *font size* is silently dropped and the element inherits 16px instead of §4.2's 15px. Phase 8b fixed only the one case where the casualty was the colour instead (the `lg` button; see §11). The general fix is `extendTailwindMerge` registering the scale as `font-size`. **It is deferred because it drops every input from 16px to 15px, and under 16px iOS Safari zooms the page on focus** — a phone-first tool cannot take that change without a real phone pass. Revisit with one. |
| **Light-skin contrast pass** (§4.5's finding, 2026-08-02) | The light palette's badge tints measure 2.86–4.14:1 and its primary button 3.68:1, all under WCAG AA's 4.5. Phase 8b measured this while choosing dark values and left light alone — fixing it reopens §4.1, which is its own decision with its own on-screen review. Revisit if the app is ever read on a phone in sunlight and a score badge is the thing that cannot be read, or if anyone but the owner uses it. |
| Multi-user, real auth, RLS, POPIA, Sentry, VoIP | The "last 20%" — when anyone else uses this |
| Custom domain | With the above |

---

## 13. FOUR-STATES MATRIX — THE ACCEPTANCE CHECKLIST

*Added 2026-08-02 during Phase 8. §4.4 has always named "the four-states matrix
in STATUS.md" as the acceptance checklist per phase — but that file lives in the
OLD repo, which Phase 9 archives. The checklist this migration is graded against
cannot live in the deployment being switched off, so it moves here, rewritten for
what the new app actually renders. The old §4 matrix stays where it is as the
record of what was translated FROM.*

**"Verified" means read in the source on this branch** — the states exist in
code. Runtime confirmation is the owner's (dev server in Chrome + a real phone);
Claude Code cannot reach that server. A row's file reference is where to look.

| Surface | Empty | Loading | Error | Happy |
|---|---|---|---|---|
| Mic / Record `coach-panel` | "No recording yet." | `checking`, Record disabled | `insecure` / `unsupported` / `denied` (3-step fix list) / `no-device`, + Retry | `prompt` / `granted`, Record enabled |
| Recorder `coach-panel` | hidden when idle | pulsing dot, mm:ss, RMS meter | `onerror` → "Recorder error — try again." | playback + meta + Analyze enabled |
| Upload / Analyze `coach-panel` | region mounted, text empty | "Creating upload slot…" → "Uploading audio to private storage…" → "Transcribing & scoring… (10–60s)" | `--fail` status, local blob kept so Analyze retries | "Transcript and coaching scores ready" |
| Scorecard `scorecard` | `ScorecardEmpty` — one card, not the old app's three panels | `ScorecardSkeleton`, `aria-busy` — **closes the old app's ⚠ transcript gap** | "No transcript returned." / "No scores returned." | §5.2 layout: header, metrics strip, six dimension rows, collapsed transcript |
| Metrics strip `scorecard` | "No metrics yet.", or omitted entirely in lead history | save note "Saving speaker & metrics…" | single-speaker warn block; save-note error variant | 3 tiles + estimate disclosure |
| Attach-to-lead `coach-panel` · `lead-combobox` | "No leads match."; hint text when idle | "Linking…" | `--fail` status carrying the server message | "Linked to {business}." |
| Leads board `leads-board` | per-column "Drop leads here" | six columns × 2 `CardSkeleton`, counts render `·` not `0`, `aria-busy`, **all four toolbar buttons disabled** | board replaced by the message; **Refresh stays live — it is the retry**, the two mutating controls do not | six stage columns with counts |
| Lead modal `lead-modal` | Add mode — empty form, "Business and phone are required." | "Saving…" / "Deleting…" on the pending button | toast; **modal stays open with everything typed still in it** | Edit mode with Delete + "Call this lead" |
| Lead modal → Calls `lead-calls` | "No calls yet. Record one from Coach and link it here." | "Loading calls…" | placeholder carries the message, list not cleared | collapsed per-call rows: score, metrics, transcript, Delete |
| Delete call `lead-calls` | — | AlertDialog + "Deleting…" — **closes the old app's ⚠ no-text gap** | toast; row's dialog stays open, button live, row survives | "Call deleted" toast, list re-reads |
| Find leads (Apify) `scrape-modal` | zero-outcome **amber** toast, never green | live-dot panel: query being run + elapsed clock, not a greyed form | distinct copy per `code`: `no_token`, `timeout`, generic | toast "N added, M duplicates skipped…" |
| Dashboard `dashboard-view` | per-tile: "No calls logged this week yet." · "No call scored yet." · "No dimension scores available yet." · "No leads yet." · §0's trend gate | per-tile skeleton bars in `--surface-2` | per-tile `Failed` + "Try again" — **never a silent zero**, since 0 and "could not load" look identical | §8's three groups: 4/25, last-call hero + floor + trend, hygiene counts |
| Unlock `secret-modal` | modal on first API call | — | "That passphrase was rejected. Try again." | stored in `sessionStorage`, request retried once |
| Route error `app/error.tsx` | — | — | §4-styled panel, Try again (`unstable_retry`) + Go to Coach; message and digest to the console, never to the screen | — |
| Global error `app/global-error.tsx` | — | — | same panel, own `<html>`/`<body>`/font; escape is a plain `<a>`, since client routing is what broke | — |
| 404 `app/not-found.tsx` | — | — | "That page doesn't exist." + the three real destinations | — |

**No ⚠ rows.** The old app carried three; two are closed above and the third was
CSV import, which §3 CUT. Nothing in this app ships happy-path-only.

**One row does not exist, deliberately: the theme toggle (Phase 8b).** It is a
control, not a data surface — it has nothing to load, nothing to be empty of,
and its only failure (storage blocked) degrades to a toggle that works for the
tab and forgets on reload, which needs no copy.

**The three route-level rows are Phase 8's own finding.** Before it, none of the
three files existed: a render throw fell through to Next's built-in screen and an
unmatched URL to its 404 — no nav, no §4 tokens, and the OS colour scheme on an
app §4 declares light-only. Six phases of component work never surfaced it
because every one of them was inside a component. The lesson worth keeping: **a
four-states audit that only walks components will pass an app whose routes have
no states at all.**

**Two live regions were fixed in the same sweep** (`coach-panel`, both). Each
mounted `role="status"` together with its message, and the attach status swapped
between a live paragraph and a plain one. A region that appears with its text is
often never announced — the rule `toast.tsx` and `scrape-modal.tsx` already
carried in comments, from Phases 4 and 6. Phase 3 predates it. The upload ladder
is the longest blind wait in the app, so it was the worst place to be silent.

---

*End of master plan. Claude Code: re-read §1, §6, and §10 at the start of every
session. When this document and improvisation disagree, this document wins.*
