// Phase 7's decisions-with-a-right-answer, tested without a DOM.
//
// Same call Phases 2–6 made: the dashboard COMPONENT is not unit-tested (no
// jsdom, no React Testing Library). Every rule that has a right answer was pushed
// down into `src/lib/dashboard.ts` and is pinned here — the Monday boundary, the
// error-row filter, what counts as scored, the per-dimension mean and its tie
// break, the trend geometry, and the two hygiene definitions.
//
// These are BOUNDARY tests. The happy path is one line of each function; the
// interesting cases are the second either side of a week boundary, the row that
// cannot say when it happened, and the score that is null rather than absent.

import { describe, expect, it } from "vitest"

import {
  buildDashboard,
  hygieneCounts,
  lastScoredCall,
  QUIET_DAYS,
  scoredCalls,
  SCORED_GATE,
  startOfWeek,
  trendPath,
  trendSeries,
  trendX,
  trendY,
  weakestDimension,
  weeklyActivity,
  WEEKLY_CALL_TARGET,
  type DashboardCall,
  type DashboardLead,
  type TrendGeometry,
} from "./dashboard"
import { DIMENSION_LABELS } from "./rubric"

const KEYS = Object.keys(DIMENSION_LABELS)
const DAY = 24 * 60 * 60 * 1000

/** A scored call. `dims` defaults to all six at the overall, which is enough for
 *  every test that is not about the dimensions themselves. */
function call(
  overrides: Partial<DashboardCall> & { at?: Date | string },
  overall?: number | null,
  dims?: { key: string; score: unknown }[],
): DashboardCall {
  const { at, ...rest } = overrides
  const created =
    at === undefined ? new Date().toISOString() : at instanceof Date ? at.toISOString() : at
  return {
    id: rest.id ?? Math.random().toString(36).slice(2),
    created_at: created,
    status: "scored",
    rubric_scores:
      overall === undefined
        ? undefined
        : {
            overall_score: overall,
            top_fix: "Ask for the meeting.",
            dimensions: dims ?? KEYS.map((key) => ({ key, score: overall, evidence: "", fix: "" })),
          },
    ...rest,
  }
}

const lead = (id: string, fields: Partial<DashboardLead> = {}): DashboardLead => ({
  id,
  created_at: new Date().toISOString(),
  ...fields,
})

// ── The Monday boundary ────────────────────────────────────────────────────

describe("startOfWeek — Monday-based, midnight, local (index.html:2834)", () => {
  it("a Wednesday walks back to its Monday at 00:00", () => {
    // 2026-07-29 is a Wednesday.
    const monday = startOfWeek(new Date(2026, 6, 29, 14, 3, 27, 500))
    expect(monday.getFullYear()).toBe(2026)
    expect(monday.getMonth()).toBe(6)
    expect(monday.getDate()).toBe(27)
    expect(monday.getHours()).toBe(0)
    expect(monday.getMinutes()).toBe(0)
    expect(monday.getSeconds()).toBe(0)
    expect(monday.getMilliseconds()).toBe(0)
  })

  it("a Monday returns its own midnight, not the week before", () => {
    expect(startOfWeek(new Date(2026, 6, 27, 0, 0, 1)).getDate()).toBe(27)
  })

  it("SUNDAY BELONGS TO THE WEEK THAT STARTED SIX DAYS AGO — the whole point of (getDay()+6)%7", () => {
    // 2026-08-02 is a Sunday. JavaScript's getDay() calls it day 0, which a
    // naive `x.getDate() - x.getDay()` would send FORWARD to the 2nd itself.
    const monday = startOfWeek(new Date(2026, 7, 2, 23, 59, 59))
    expect(monday.getMonth()).toBe(6)
    expect(monday.getDate()).toBe(27)
  })

  it("does not mutate the date it was handed", () => {
    const now = new Date(2026, 6, 29, 14, 3)
    startOfWeek(now)
    expect(now.getDate()).toBe(29)
    expect(now.getHours()).toBe(14)
  })
})

// ── Calls this week ────────────────────────────────────────────────────────

describe("weeklyActivity — §8's 4 / 25", () => {
  const now = new Date(2026, 6, 29, 14, 0) // Wednesday
  const monday = startOfWeek(now)

  it("counts from Monday 00:00 inclusive, and the millisecond before is last week", () => {
    const activity = weeklyActivity(
      [
        call({ at: monday }), // exactly the boundary → counts
        call({ at: new Date(monday.getTime() - 1) }), // 1ms earlier → does not
      ],
      now,
    )
    expect(activity.count).toBe(1)
  })

  it("EXCLUDES status 'error' — an errored upload is not a call, and a retry would double-count it", () => {
    const activity = weeklyActivity(
      [call({ at: now, status: "error" }), call({ at: now, status: "recorded" })],
      now,
    )
    expect(activity.count).toBe(1)
  })

  it("counts a row with no status at all — only 'error' is excluded", () => {
    expect(weeklyActivity([call({ at: now, status: null })], now).count).toBe(1)
  })

  it("does not count a row whose created_at will not parse, or is absent", () => {
    const activity = weeklyActivity(
      [call({ at: "not a date" }), call({ created_at: null })],
      now,
    )
    expect(activity.count).toBe(0)
  })

  it("zero calls is 0 / 25 at 0%, not a division artefact", () => {
    expect(weeklyActivity([], now)).toEqual({
      count: 0,
      target: WEEKLY_CALL_TARGET,
      remaining: WEEKLY_CALL_TARGET,
      pct: 0,
      atTarget: false,
    })
  })

  it("the bar clamps at 100% and stays there past the target", () => {
    const many = Array.from({ length: WEEKLY_CALL_TARGET + 7 }, () => call({ at: now }))
    const activity = weeklyActivity(many, now)
    expect(activity.count).toBe(WEEKLY_CALL_TARGET + 7)
    expect(activity.pct).toBe(100)
    expect(activity.remaining).toBe(0)
    expect(activity.atTarget).toBe(true)
  })

  it("atTarget flips exactly AT the target, not one past it", () => {
    const at = Array.from({ length: WEEKLY_CALL_TARGET }, () => call({ at: now }))
    expect(weeklyActivity(at, now).atTarget).toBe(true)
    expect(weeklyActivity(at.slice(1), now).atTarget).toBe(false)
    expect(weeklyActivity(at.slice(1), now).remaining).toBe(1)
  })
})

// ── What counts as scored ──────────────────────────────────────────────────

describe("scoredCalls — the two deviations from index.html:2843", () => {
  it("A NULL overall is NOT a score of zero. Number(null) === 0 is the old bug", () => {
    expect(scoredCalls([call({}, null)])).toHaveLength(0)
  })

  it("rubric_scores without a dimensions array is malformed, not scored", () => {
    expect(
      scoredCalls([{ id: "x", created_at: new Date().toISOString(), rubric_scores: { overall_score: 4 } }]),
    ).toHaveLength(0)
  })

  it("no rubric_scores at all, or a non-numeric overall, is not scored", () => {
    expect(scoredCalls([call({}), call({}, Number.NaN)])).toHaveLength(0)
    expect(scoredCalls([{ id: "y", rubric_scores: "nonsense" }])).toHaveLength(0)
  })

  it("a numeric string overall still scores — Number('4') is finite, as in the old app", () => {
    const scored = scoredCalls([call({}, "4" as unknown as number)])
    expect(scored).toHaveLength(1)
    expect(scored[0].overall).toBe(4)
  })

  it("returns OLDEST FIRST regardless of the order the route sent (created_at.desc)", () => {
    const scored = scoredCalls([
      call({ id: "new", at: new Date(2026, 6, 29) }, 5),
      call({ id: "old", at: new Date(2026, 6, 20) }, 3),
      call({ id: "mid", at: new Date(2026, 6, 25) }, 4),
    ])
    expect(scored.map((s) => s.call.id)).toEqual(["old", "mid", "new"])
  })

  it("a row with no usable timestamp sorts oldest, so it can never become the hero", () => {
    const scored = scoredCalls([
      call({ id: "dated", at: new Date(2026, 0, 1) }, 2),
      call({ id: "undated", created_at: null }, 5),
    ])
    expect(scored.map((s) => s.call.id)).toEqual(["undated", "dated"])
    expect(lastScoredCall(scored)?.call.id).toBe("dated")
  })

  it("ties keep the order the server sent them in", () => {
    const at = new Date(2026, 6, 29, 9, 0)
    const scored = scoredCalls([call({ id: "a", at }, 3), call({ id: "b", at }, 4)])
    expect(scored.map((s) => s.call.id)).toEqual(["a", "b"])
  })

  it("lastScoredCall is null on an empty list", () => {
    expect(lastScoredCall([])).toBeNull()
  })
})

// ── The weakest dimension ──────────────────────────────────────────────────

describe("weakestDimension — the per-dimension mean (index.html:3081)", () => {
  const dims = (scores: Record<string, unknown>) =>
    Object.entries(scores).map(([key, score]) => ({ key, score }))

  it("names the lowest MEAN, not the lowest single score", () => {
    const scored = scoredCalls([
      call({ at: new Date(2026, 6, 1) }, 3, dims({ [KEYS[0]]: 1, [KEYS[1]]: 2 })),
      call({ at: new Date(2026, 6, 2) }, 3, dims({ [KEYS[0]]: 5, [KEYS[1]]: 3 })),
    ])
    const weakest = weakestDimension(scored)
    // KEYS[0] holds the single lowest score in the set (a 1) and means 3.0;
    // KEYS[1] never scores below 2 and means 2.5. The FLOOR is KEYS[1].
    expect(weakest?.key).toBe(KEYS[1])
    expect(weakest?.mean).toBe(2.5)
    expect(weakest?.n).toBe(2)
  })

  it("rounds the mean to one decimal but takes the bar width from the unrounded value", () => {
    const scored = scoredCalls([
      call({ at: new Date(2026, 6, 1) }, 3, dims({ [KEYS[0]]: 2, [KEYS[1]]: 5 })),
      call({ at: new Date(2026, 6, 2) }, 3, dims({ [KEYS[0]]: 3, [KEYS[1]]: 5 })),
      call({ at: new Date(2026, 6, 3) }, 3, dims({ [KEYS[0]]: 3, [KEYS[1]]: 5 })),
    ])
    const weakest = weakestDimension(scored)
    expect(weakest?.mean).toBe(2.7) // 8/3 = 2.666…
    expect(weakest?.pct).toBe(53) // round(2.666…/5*100), not round(2.7/5*100) = 54
  })

  it("TIES GO TO THE FIRST KEY IN §5.1's ORDER, not to input order", () => {
    const scored = scoredCalls([
      call({ at: new Date(2026, 6, 1) }, 3, [
        { key: KEYS[3], score: 2 },
        { key: KEYS[1], score: 2 },
      ]),
    ])
    expect(weakestDimension(scored)?.key).toBe(KEYS[1])
  })

  it("ignores a key that is not one of the six", () => {
    const scored = scoredCalls([
      call({ at: new Date(2026, 6, 1) }, 3, [
        { key: "invented_dimension", score: 1 },
        { key: KEYS[0], score: 4 },
      ]),
    ])
    expect(weakestDimension(scored)?.key).toBe(KEYS[0])
    expect(weakestDimension(scored)?.mean).toBe(4)
  })

  it("A PROTOTYPE KEY IS NOT A DIMENSION — the reason this uses a Map", () => {
    const scored = scoredCalls([
      call({ at: new Date(2026, 6, 1) }, 3, [
        { key: "toString", score: 0 },
        { key: "constructor", score: 0 },
        { key: KEYS[2], score: 4 },
      ]),
    ])
    expect(weakestDimension(scored)?.key).toBe(KEYS[2])
  })

  it("skips a non-numeric score rather than counting it as zero", () => {
    const scored = scoredCalls([
      call({ at: new Date(2026, 6, 1) }, 3, [{ key: KEYS[0], score: "n/a" }, { key: KEYS[1], score: 4 }]),
      call({ at: new Date(2026, 6, 2) }, 3, [{ key: KEYS[0], score: 5 }, { key: KEYS[1], score: 4 }]),
    ])
    const weakest = weakestDimension(scored)
    expect(weakest?.key).toBe(KEYS[1])
    expect(weakest?.n).toBe(2)
  })

  it("null when nothing is scored, and null when no dimension carries a usable score", () => {
    expect(weakestDimension([])).toBeNull()
    const scored = scoredCalls([call({ at: new Date(2026, 6, 1) }, 3, [{ key: "nope", score: 1 }])])
    expect(weakestDimension(scored)).toBeNull()
  })
})

// ── The trend line ─────────────────────────────────────────────────────────

describe("trendSeries / trendPath — §8's minimal line", () => {
  const geo: TrendGeometry = { width: 320, height: 96, padX: 8, padY: 8 }

  it("plots at most the last 10 scored calls, oldest first", () => {
    const scored = scoredCalls(
      Array.from({ length: 14 }, (_, i) => call({ id: `c${i}`, at: new Date(2026, 6, i + 1) }, (i % 5) + 1)),
    )
    const series = trendSeries(scored)
    expect(series).toHaveLength(10)
    expect(series[series.length - 1]).toBe(scored[scored.length - 1].overall)
  })

  it("5 sits at the top of the box and 1 at the bottom", () => {
    expect(trendY(5, geo)).toBe(geo.padY)
    expect(trendY(1, geo)).toBe(geo.height - geo.padY)
    expect(trendY(3, geo)).toBe(geo.height / 2)
  })

  it("clamps a score outside 1–5 to the edge rather than drawing outside the viewBox", () => {
    expect(trendY(9, geo)).toBe(trendY(5, geo))
    expect(trendY(-4, geo)).toBe(trendY(1, geo))
  })

  it("the first and last points sit exactly on the padding, and a lone point is centred", () => {
    expect(trendX(0, 5, geo)).toBe(geo.padX)
    expect(trendX(4, 5, geo)).toBe(geo.width - geo.padX)
    expect(trendX(0, 1, geo)).toBe(geo.width / 2)
  })

  it("builds one M and the rest L, at one decimal", () => {
    expect(trendPath([1, 5], geo)).toBe("M8.0 88.0 L312.0 8.0")
  })

  it("empty in, empty out — a path with no data draws nothing rather than throwing", () => {
    expect(trendPath([], geo)).toBe("")
  })
})

// ── Hygiene ────────────────────────────────────────────────────────────────

describe("hygieneCounts — §8's call queue (index.html:3122)", () => {
  const now = new Date(2026, 6, 29, 12, 0)
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY)

  it("never called = no call carries that lead_id, whatever the dates say", () => {
    const counts = hygieneCounts(
      [lead("a", { updated_at: now.toISOString() }), lead("b", { updated_at: now.toISOString() })],
      [call({ at: now, lead_id: "a" })],
      now,
    )
    expect(counts.neverCalled).toBe(1)
    expect(counts.leads).toBe(2)
  })

  it("a call with no lead_id links nothing", () => {
    const counts = hygieneCounts(
      [lead("a", { updated_at: now.toISOString() })],
      [call({ at: now, lead_id: null })],
      now,
    )
    expect(counts.neverCalled).toBe(1)
  })

  it("QUIET IS NOT SIMPLY 'LAST CALL' — a recent edit on an old call keeps a lead current", () => {
    const counts = hygieneCounts(
      [lead("a", { updated_at: daysAgo(1).toISOString() })],
      [call({ at: daysAgo(30), lead_id: "a" })],
      now,
    )
    expect(counts.quiet).toBe(0)
  })

  it("…and equally, a recent CALL keeps a long-unedited lead current", () => {
    const counts = hygieneCounts(
      [lead("a", { created_at: daysAgo(90).toISOString(), updated_at: daysAgo(90).toISOString() })],
      [call({ at: daysAgo(2), lead_id: "a" })],
      now,
    )
    expect(counts.quiet).toBe(0)
  })

  it("exactly 7 days IS quiet; a minute under is not", () => {
    const exactly = hygieneCounts([lead("a", { updated_at: daysAgo(QUIET_DAYS).toISOString() })], [], now)
    expect(exactly.quiet).toBe(1)
    const justUnder = hygieneCounts(
      [lead("a", { updated_at: new Date(now.getTime() - QUIET_DAYS * DAY + 60_000).toISOString() })],
      [],
      now,
    )
    expect(justUnder.quiet).toBe(0)
  })

  it("falls back to created_at when there is no updated_at", () => {
    expect(
      hygieneCounts([{ id: "a", created_at: daysAgo(10).toISOString() }], [], now).quiet,
    ).toBe(1)
  })

  it("a lead with NO usable timestamp is excluded from quiet, not counted as infinitely stale", () => {
    const counts = hygieneCounts(
      [{ id: "a" }, { id: "b", updated_at: "not a date" }, { id: "c", created_at: null }],
      [],
      now,
    )
    expect(counts.quiet).toBe(0)
    expect(counts.neverCalled).toBe(3) // never-called does not care about dates
  })

  it("takes the NEWEST call per lead, not the first one it sees", () => {
    const counts = hygieneCounts(
      [lead("a", { updated_at: daysAgo(60).toISOString() })],
      [
        call({ at: daysAgo(40), lead_id: "a" }),
        call({ at: daysAgo(1), lead_id: "a" }),
        call({ at: daysAgo(20), lead_id: "a" }),
      ],
      now,
    )
    expect(counts.quiet).toBe(0)
  })

  it("THE TWO COUNTS OVERLAP BY DESIGN: a lead scraped 9 days ago and never called is in both", () => {
    const counts = hygieneCounts(
      [lead("a", { created_at: daysAgo(9).toISOString(), updated_at: daysAgo(9).toISOString() })],
      [],
      now,
    )
    expect(counts).toEqual({ neverCalled: 1, quiet: 1, leads: 1 })
  })

  it("no leads at all is zero of each, and says so", () => {
    expect(hygieneCounts([], [call({ at: now })], now)).toEqual({
      neverCalled: 0,
      quiet: 0,
      leads: 0,
    })
  })
})

// ── The gate ───────────────────────────────────────────────────────────────

describe("buildDashboard — the §0 gate holds the trend AND the weakest dimension", () => {
  const now = new Date(2026, 6, 29, 12, 0)
  const scoredCall = (i: number) => call({ id: `c${i}`, at: new Date(2026, 6, 20 + i) }, 3)

  it("under 5 scored calls, both hold — and scoredCount is what the message prints", () => {
    const dash = buildDashboard(
      Array.from({ length: SCORED_GATE - 1 }, (_, i) => scoredCall(i)),
      [],
      now,
    )
    expect(dash.scoredCount).toBe(SCORED_GATE - 1)
    expect(dash.gated).toBe(true)
    expect(dash.trend).toEqual([])
    expect(dash.weakest).toBeNull()
    // The hero is NOT gated — one scored call is one real, actionable top fix.
    expect(dash.lastScored?.call.id).toBe(`c${SCORED_GATE - 2}`)
  })

  it("at exactly 5 both unlock", () => {
    const dash = buildDashboard(
      Array.from({ length: SCORED_GATE }, (_, i) => scoredCall(i)),
      [],
      now,
    )
    expect(dash.gated).toBe(false)
    expect(dash.trend).toHaveLength(SCORED_GATE)
    expect(dash.weakest).not.toBeNull()
  })

  it("UNSCORED CALLS DO NOT COUNT TOWARD THE GATE, but they do count toward the week", () => {
    const week = Array.from({ length: 6 }, (_, i) => call({ id: `u${i}`, at: now }))
    const dash = buildDashboard(week, [], now)
    expect(dash.activity.count).toBe(6)
    expect(dash.scoredCount).toBe(0)
    expect(dash.gated).toBe(true)
    expect(dash.lastScored).toBeNull()
  })

  it("the empty dashboard is all zeros and gates, never a throw", () => {
    const dash = buildDashboard([], [], now)
    expect(dash.activity.count).toBe(0)
    expect(dash.scoredCount).toBe(0)
    expect(dash.gated).toBe(true)
    expect(dash.lastScored).toBeNull()
    expect(dash.weakest).toBeNull()
    expect(dash.hygiene).toEqual({ neverCalled: 0, quiet: 0, leads: 0 })
  })
})
