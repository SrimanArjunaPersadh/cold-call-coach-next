// ══ Dashboard-for-one — the arithmetic (§8) ═════════════════════════════════
//
// Pure, dependency-free, no DOM, no fetch. §6 is absolute — the model never does
// arithmetic, and neither does the component: every number §8 puts on screen is
// computed here and pinned in `dashboard.test.ts`. Same call `lib/metrics.ts`,
// `lib/board.ts` and `lib/scrape.ts` each made.
//
// Ported from the old app's `index.html`: `startOfWeek` (2834), the activity
// filter (2876), `isScored` (2843), the per-dimension mean (3081), the trend
// geometry (2995–3005) and the two hygiene definitions (3122–3139).
//
// WHAT WAS DELIBERATELY LEFT IN THE OLD FILE. The functions this math was lifted
// out of also computed an **average overall score** (3018), a **week-over-week
// delta** (2888) and a **talk-time-this-week** tile (2916), and rendered
// per-dimension bar lists and lead-name lists inside the hygiene tiles. §3 CUTs
// the first three by name; §8 says three groups and "Nothing else." The math
// came across, the features did not — do not port them back on the grounds that
// the reference implementation has them.

import { asRubricScores, DIMENSION_LABELS, type RubricScores } from "./rubric"

/**
 * One row as the dashboard's `GET /api/calls` (no `lead_id`) returns it —
 * `src/app/api/calls/route.ts:84`. That select is LEAN on purpose: no
 * `transcript`, no `metrics`, because those rows are large and the dashboard
 * never renders either. Everything below is computed from these six fields.
 */
export type DashboardCall = {
  id: string
  created_at?: string | null
  status?: string | null
  duration_seconds?: number | null
  rubric_scores?: unknown
  lead_id?: string | null
}

/**
 * Only what the hygiene counts read off a lead. `GET /api/leads` selects `*`, so
 * both timestamps are really there; `Lead` in `lib/board.ts` declares them for
 * the same reason. Narrow on purpose — this module has no business knowing about
 * stages or positions.
 */
export type DashboardLead = {
  id: string
  created_at?: string | null
  updated_at?: string | null
}

/**
 * §8: "Target is a hardcoded constant in the codebase, changeable only by commit.
 * No settings UI." Changing this line is the entire mechanism.
 */
export const WEEKLY_CALL_TARGET = 25

/**
 * §0's default ruling: below this many scored calls the trend renders the honest
 * unlock message instead of a line through noise. The weakest dimension takes the
 * SAME gate — adjudicated by the owner this phase, because §8 left it open and §1
 * rule 6 wants one number, not two, deciding when the "Am I getting better?"
 * group has enough data to speak. (The old app gated its whole skill group at ≥2;
 * this is the same idea at §0's threshold.)
 */
export const SCORED_GATE = 5

/** How many scored calls the trend line plots. The old app's last-10 window. */
export const TREND_WINDOW = 10

/** §8's hygiene threshold: "quiet for 7+ days". */
export const QUIET_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** Every dimension key the frozen schema emits, in §5.1's order. Read off
 *  `DIMENSION_LABELS` rather than retyped, so the two can never drift. */
const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS)

/**
 * ISO string → epoch ms, or `NaN`. A row that cannot say when it happened is
 * never given a timestamp it does not have — same rule as `call-history.ts`.
 */
function timeOf(iso: string | null | undefined): number {
  if (!iso) return NaN
  return new Date(iso).getTime()
}

// ── 1. Am I doing the work? ────────────────────────────────────────────────

/**
 * Midnight on the Monday of `d`'s week, in the READER'S timezone. Verbatim from
 * the old app (index.html:2834) — including `(getDay() + 6) % 7`, which is what
 * makes the week Monday-based rather than JavaScript's Sunday.
 *
 * Local time, not UTC, is deliberate and it is why the verification SQL has to
 * carry an explicit `at time zone`: the owner's Monday starts at midnight where
 * the owner is, which in SAST is 22:00 Sunday UTC.
 */
export function startOfWeek(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const dow = (x.getDay() + 6) % 7 // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow)
  return x
}

export type WeeklyActivity = {
  /** Calls made since Monday. Never a percentage — §3 CUT the delta. */
  count: number
  target: number
  /** Calls still needed to reach the target; 0 once it is met. */
  remaining: number
  /** 0–100, clamped — the progress bar's width, so the bar does no arithmetic. */
  pct: number
  /** ≥100%, which is the only thing that turns the bar `--pass` (§8). */
  atTarget: boolean
}

/**
 * §8's `Calls this week: 4 / 25`.
 *
 * `status !== 'error'` is the old app's filter and its reason is worth keeping:
 * an errored upload is not a call, and a retry after one would otherwise count
 * the same conversation twice.
 *
 * A row whose `created_at` will not parse is not counted. `NaN >= start` is
 * false, so this falls out of the comparison rather than needing a branch — but
 * it is tested, because it is a decision and not an accident.
 */
export function weeklyActivity(
  calls: readonly DashboardCall[],
  now: Date,
): WeeklyActivity {
  const start = startOfWeek(now).getTime()

  let count = 0
  for (const call of calls) {
    if (call.status === "error") continue
    if (!(timeOf(call.created_at) >= start)) continue
    count++
  }

  return {
    count,
    target: WEEKLY_CALL_TARGET,
    remaining: Math.max(0, WEEKLY_CALL_TARGET - count),
    pct: Math.min(100, Math.max(0, Math.round((count / WEEKLY_CALL_TARGET) * 100))),
    atTarget: count >= WEEKLY_CALL_TARGET,
  }
}

// ── 2. Am I getting better? ────────────────────────────────────────────────

/** A call that really carries a score, with the score already extracted. */
export type ScoredCall = {
  call: DashboardCall
  scores: RubricScores
  /** `rubric_scores.overall_score`, as a finite number. */
  overall: number
}

/**
 * Every scored call, OLDEST FIRST — the order the trend line reads left to
 * right, and the old app's `sort((a, b) => new Date(a) - new Date(b))`.
 *
 * TWO DELIBERATE DEVIATIONS FROM `isScored` (index.html:2843), and they exist for
 * one reason: the dashboard and the lead history must never disagree about the
 * same row. `callSummary` in `lib/call-history.ts` already made both calls, and a
 * row that reads "No score" in a lead's history must not read `0/5` here.
 *
 *   · A `null` overall is NOT scored. The old test was
 *     `Number.isFinite(Number(overall_score))`, and `Number(null)` is `0` — a
 *     finite number — so a null overall scored zero out of five and dragged a
 *     trend line to the floor with a number nothing ever produced.
 *   · `rubric_scores` must narrow through `asRubricScores`, which requires a
 *     `dimensions` array. Under the frozen schema (§5.1) a payload without one
 *     cannot exist; if a hand-edited row has one, it is malformed rather than
 *     scored, and this is the same narrowing the scorecard renders through.
 *
 * A row with no usable timestamp sorts oldest rather than newest, so it can never
 * become the "most recent scored call" hero. Ties keep input order (the route's
 * `created_at.desc`), so nothing reshuffles between renders.
 */
export function scoredCalls(calls: readonly DashboardCall[]): ScoredCall[] {
  return calls
    .map((call, i) => {
      const scores = asRubricScores(call.rubric_scores)
      const raw = scores?.overall_score
      if (!scores || raw === null || raw === undefined) return null
      const overall = Number(raw)
      if (!Number.isFinite(overall)) return null
      const t = timeOf(call.created_at)
      return { entry: { call, scores, overall }, i, t: Number.isNaN(t) ? -Infinity : t }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((row) => row.entry)
}

/** §8's hero: the most recent scored call. Null when nothing is scored yet. */
export function lastScoredCall(scored: readonly ScoredCall[]): ScoredCall | null {
  return scored.length ? scored[scored.length - 1] : null
}

export type WeakestDimension = {
  key: string
  label: string
  /** The mean across every scored call, to one decimal — what the badge shows. */
  mean: number
  /** 0–100 from the UNROUNDED mean — the bar's width. */
  pct: number
  /** How many dimension scores went into the mean. */
  n: number
}

/**
 * §8's "weakest dimension across all scored calls — lowest mean dimension".
 * The old app's per-dimension mean (index.html:3081), with §3's per-dimension bar
 * list left behind: this returns the floor and nothing else.
 *
 * A `Map` rather than an object literal because the keys come out of stored
 * jsonb: `{}["constructor"]` is not `undefined`, and a row carrying a dimension
 * called `toString` would otherwise be added to a function. (The old app used
 * `Object.create(null)` for the same reason, and said so.)
 *
 * Ties go to the first key in §5.1's order — the old app's `reduce` with a strict
 * `<`, preserved so the named floor is stable rather than dependent on row order.
 */
export function weakestDimension(
  scored: readonly ScoredCall[],
): WeakestDimension | null {
  const totals = new Map<string, { sum: number; n: number }>()
  for (const key of DIMENSION_KEYS) totals.set(key, { sum: 0, n: 0 })

  for (const { scores } of scored) {
    for (const dimension of scores.dimensions || []) {
      const bucket = totals.get(String(dimension?.key))
      if (!bucket) continue // an unrecognised key is not one of the six
      const score = Number(dimension.score)
      if (!Number.isFinite(score)) continue
      bucket.sum += score
      bucket.n += 1
    }
  }

  let weakest: { key: string; mean: number; n: number } | null = null
  for (const key of DIMENSION_KEYS) {
    const bucket = totals.get(key)
    if (!bucket || !bucket.n) continue
    const mean = bucket.sum / bucket.n
    if (weakest && !(mean < weakest.mean)) continue
    weakest = { key, mean, n: bucket.n }
  }
  if (!weakest) return null

  return {
    key: weakest.key,
    label: DIMENSION_LABELS[weakest.key] || weakest.key,
    mean: Math.round(weakest.mean * 10) / 10,
    pct: Math.min(100, Math.max(0, Math.round((weakest.mean / 5) * 100))),
    n: weakest.n,
  }
}

/** The overall scores the trend plots: the last {@link TREND_WINDOW}, oldest first. */
export function trendSeries(scored: readonly ScoredCall[]): number[] {
  return scored.slice(-TREND_WINDOW).map((s) => s.overall)
}

/** The SVG box the trend is drawn in. Padding keeps a 2px stroke inside it. */
export type TrendGeometry = {
  width: number
  height: number
  padX: number
  padY: number
}

/**
 * The box §8's line is drawn in. Here rather than in the component because the
 * gridlines, the path and the aria label all have to be computed against the
 * SAME box — a second copy of these four numbers is how a rule at "5" ends up
 * one pixel off the highest point.
 *
 * A viewBox, so the SVG scales to whatever width the tile gets; the padding is
 * half the 2px stroke plus room for the round cap, which is what keeps the line
 * inside the box at the top and bottom of the scale.
 */
export const TREND_GEOMETRY: TrendGeometry = {
  width: 320,
  height: 96,
  padX: 8,
  padY: 8,
}

/**
 * Where a score sits vertically: 5 at the top, 1 at the bottom. The old app's
 * `y(v)` (index.html:2999), which is why the gridlines and the line agree by
 * construction rather than by two hand-tuned numbers.
 *
 * Clamped to 1–5. The frozen schema cannot emit anything else, so this only ever
 * fires on a hand-edited row — and a point drawn outside the viewBox would be
 * invisible while still shifting the line, which is worse than a point pinned to
 * the edge. The score itself is never rounded or altered; only its y is.
 */
export function trendY(score: number, geo: TrendGeometry): number {
  const v = Math.min(5, Math.max(1, Number(score) || 1))
  return geo.padY + (geo.height - 2 * geo.padY) * (1 - (v - 1) / 4)
}

/** Where the i-th of n points sits horizontally. A lone point is centred. */
export function trendX(i: number, n: number, geo: TrendGeometry): number {
  return geo.padX + (geo.width - 2 * geo.padX) * (n === 1 ? 0.5 : i / (n - 1))
}

/**
 * The `d` attribute of §8's minimal line — no gradient fill, no dots per point,
 * and the component supplies only a stroke colour. Empty in, empty out, so a
 * `<path>` with no data draws nothing rather than throwing.
 *
 * Coordinates are fixed to one decimal, exactly as the old app did: it keeps the
 * attribute short and keeps the string stable between renders.
 */
export function trendPath(
  scores: readonly number[],
  geo: TrendGeometry,
): string {
  if (!scores.length) return ""
  return scores
    .map(
      (score, i) =>
        `${i ? "L" : "M"}${trendX(i, scores.length, geo).toFixed(1)} ${trendY(
          score,
          geo,
        ).toFixed(1)}`,
    )
    .join(" ")
}

// ── 3. Who do I call next? ─────────────────────────────────────────────────

export type Hygiene = {
  /** Leads no call carries the `lead_id` of. */
  neverCalled: number
  /** Leads whose last activity — call OR edit — is {@link QUIET_DAYS}+ days old. */
  quiet: number
  /** How many leads were considered, so the tile can tell 0 from "no leads". */
  leads: number
}

/**
 * §8's call queue, ported from index.html:3122–3139.
 *
 * The two definitions are NOT the same question, and the second is not simply
 * "last call":
 *   · **Never called** — no call row carries this lead's id. Nothing to do with
 *     dates.
 *   · **Quiet 7+ days** — the newest of (last linked call, the lead's own
 *     `updated_at` falling back to `created_at`) is at least seven days old. A
 *     lead with no usable timestamp at all is excluded rather than counted as
 *     infinitely stale, which is the old app's `x.t > 0` filter.
 *
 * THE TWO OVERLAP, BY DESIGN AND IN THE OLD APP: a lead scraped nine days ago and
 * never called is in both counts. They are two answers to "who do I call next",
 * not a partition of the list — the verification SQL is written the same way.
 *
 * KNOWN, INHERITED, AND WORTH A DECISION LATER: `PATCH /api/leads` stamps
 * `updated_at` on every write, and a kanban drag is a write (`{stage, position}`)
 * — so DRAGGING A CARD RESETS ITS QUIET CLOCK. That is the old app's behaviour
 * exactly, in the same two places, and §3 lists these counts as a KEEP
 * ("behaviour identical"), so it is not silently changed here. It is arguable
 * either way — a stage move is triage, which is a kind of working the lead — and
 * the tile's copy says "no edit or board move" rather than implying it tracks
 * contact. Narrowing "activity" to content-only edits means a route change and
 * belongs to its own pass, not to this one.
 */
export function hygieneCounts(
  leads: readonly DashboardLead[],
  calls: readonly DashboardCall[],
  now: Date,
): Hygiene {
  const called = new Set<string>()
  const lastCall = new Map<string, number>()

  for (const call of calls) {
    if (!call.lead_id) continue
    const key = String(call.lead_id)
    called.add(key)
    const t = timeOf(call.created_at)
    if (Number.isNaN(t)) continue
    const previous = lastCall.get(key)
    if (previous === undefined || t > previous) lastCall.set(key, t)
  }

  const nowMs = now.getTime()
  const quietAfter = QUIET_DAYS * DAY_MS

  let neverCalled = 0
  let quiet = 0
  for (const lead of leads) {
    const key = String(lead.id)
    if (!called.has(key)) neverCalled++

    // `updated_at` wins when present, even if it will not parse — the old app
    // does not fall back to `created_at` in that case, and an unparseable
    // timestamp is not evidence the lead was touched earlier.
    const editedRaw = lead.updated_at
      ? timeOf(lead.updated_at)
      : lead.created_at
        ? timeOf(lead.created_at)
        : 0
    const edited = Number.isFinite(editedRaw) ? editedRaw : 0
    const touched = Math.max(lastCall.get(key) ?? 0, edited)
    if (touched > 0 && nowMs - touched >= quietAfter) quiet++
  }

  return { neverCalled, quiet, leads: leads.length }
}

// ── The whole screen, in one call ──────────────────────────────────────────

export type Dashboard = {
  activity: WeeklyActivity
  /** How many calls carry a usable score — the number both gate messages print. */
  scoredCount: number
  /** True below {@link SCORED_GATE}: the trend AND the weakest dimension hold. */
  gated: boolean
  lastScored: ScoredCall | null
  weakest: WeakestDimension | null
  /** Overall scores, oldest first. Empty while gated — nothing to draw. */
  trend: number[]
  /**
   * How many points the line plots — the number its caption and aria label
   * print. Here rather than as `trend.length` at the call site so the
   * component's "no arithmetic, not even a `.length`" rule (§6) stays literally
   * true and greppable, instead of true-in-spirit with two exceptions.
   */
  trendCount: number
  hygiene: Hygiene
}

/**
 * Every number §8 renders, computed once. The component takes this and prints
 * it: no `.length`, no `%`, no division anywhere in the JSX, which is the only
 * way §6's guarantee stays checkable by reading one file.
 *
 * `now` is a parameter rather than a `new Date()` inside, so the week boundary
 * and the seven-day window are testable without mocking the clock — and so one
 * render cannot straddle midnight between two of these functions.
 */
export function buildDashboard(
  calls: readonly DashboardCall[],
  leads: readonly DashboardLead[],
  now: Date,
): Dashboard {
  const scored = scoredCalls(calls)
  const gated = scored.length < SCORED_GATE
  const trend = gated ? [] : trendSeries(scored)

  return {
    activity: weeklyActivity(calls, now),
    scoredCount: scored.length,
    gated,
    lastScored: lastScoredCall(scored),
    weakest: gated ? null : weakestDimension(scored),
    trend,
    trendCount: trend.length,
    hygiene: hygieneCounts(leads, calls, now),
  }
}
