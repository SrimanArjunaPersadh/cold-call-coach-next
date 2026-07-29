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

### KEEP (translate as-is, behaviour identical)
| Feature | Notes |
|---|---|
| Coach loop: record → upload → Deepgram Nova-3 diarised → Claude Haiku forced-tool-use scoring → persist | The spine. Behaviour-identical translation. |
| Six Hormozi scoring dimensions + forced-tool-use JSON schema | **FROZEN.** See §5. |
| JS-computed metrics: talk share, longest monologue (1.5s gap-merge), filler count | Ported as a pure typed function **with unit tests — its first ever**. See §6. Filler count explicitly survived a cut review: it names a behaviour fixable on the next call. |
| Speaker swap (manual cycle, full metric recompute, debounced persist) | Behaviour-identical. |
| Call ↔ lead linking (`lead_id` FK, `ON DELETE SET NULL`, per-lead call history with metrics strip) | Behaviour-identical. |
| Call delete (storage-first ordering, 404-from-Storage = success, skip `pending/`, `user_id='solo'` clamp) | Behaviour-identical. `confirm()` may become a shadcn AlertDialog — sanctioned upgrade. |
| Apify Google Maps scraper (25-result server clamp, phone-first dedup, minReviews default 5, neutral zero-outcome toast) | Behaviour-identical. |
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

The four-states matrix in STATUS.md is the acceptance checklist per phase.

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
  see the second amendment note above.
- Drag-drop: optimistic move, edge autoscroll on mobile, failed persist rolls
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
- [ ] **Phase 6 — Scraper.** Apify flow + neutral zero-outcome toast.
      **Verify:** one real scrape; one all-filtered scrape shows amber toast.
- [ ] **Phase 7 — Dashboard.** §8 exactly: 4/25 hero, last-call hero + weakest
      dimension, gated trend, hygiene tile with filtered kanban tap-throughs.
      **Verify:** with <5 scored calls the gate message renders; counts match
      SQL run by hand.
- [ ] **Phase 8 — Four-states sweep & polish.** Audit every surface against
      §4.4; fix gaps; full phone pass.
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
| CSV import re-add | If a real lead list ever arrives from outside Google Maps (bought list, GHL export, collaborator's spreadsheet) |
| Funnel visualisation re-add | ~50+ leads flowing through stages |
| Multi-user, real auth, RLS, POPIA, Sentry, VoIP | The "last 20%" — when anyone else uses this |
| Custom domain | With the above |

---

*End of master plan. Claude Code: re-read §1, §6, and §10 at the start of every
session. When this document and improvisation disagree, this document wins.*
