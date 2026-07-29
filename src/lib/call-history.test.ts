// Phase 5's decisions-with-a-right-answer, tested without a DOM.
//
// Same call as Phases 3 and 4: no jsdom, no React Testing Library. The components
// are verified on a real phone; everything that HAS a right answer was pushed down
// into src/lib and is pinned here.
//
// The first describe block is the important one. "Stored metrics are formatted,
// never recomputed" is the rule §6's guarantee rests on, and it is exactly the
// kind of rule that a well-meaning future edit ("history has the turns right
// there, why not just compute it?") erases without breaking anything visible.

import { describe, expect, it } from "vitest"

import {
  attachPayload,
  callSummary,
  callTurns,
  sortCallsNewestFirst,
  storedMetrics,
  toScorecardData,
  type StoredCall,
} from "./call-history"
import { computeMetrics, type CallMetrics, type DiarisedTurn } from "./metrics"

const TURNS: DiarisedTurn[] = [
  { speaker: 0, start: 0, end: 6, text: "so basically um hello there" },
  { speaker: 1, start: 6, end: 9, text: "who is this" },
  { speaker: 0, start: 9, end: 14, text: "like I said" },
]

/** A real METRICS_VERSION 1 object, as `computeMetrics` writes it. */
const METRICS = computeMetrics(TURNS, 0) as CallMetrics

const call = (over: Partial<StoredCall> = {}): StoredCall => ({
  id: "c1",
  created_at: "2026-07-29T14:03:00.000Z",
  status: "scored",
  rubric_scores: { overall_score: 3, top_fix: "Ask for the meeting.", dimensions: [] },
  transcript: TURNS,
  rep_speaker: 0,
  metrics: METRICS,
  ...over,
})

describe("storedMetrics — FORMATS a stored object, never recomputes", () => {
  it("returns the stored object itself, untouched", () => {
    const stored = storedMetrics(METRICS)
    expect(stored).toBe(METRICS) // same reference: nothing was rebuilt
  })

  it("renders NOTHING for a call saved before metrics existed", () => {
    // The 15 July row on the real project is this case. Not zeros, not "—" —
    // null, so the scorecard omits the strip entirely.
    expect(storedMetrics(null)).toBeNull()
    expect(storedMetrics(undefined)).toBeNull()
  })

  it("does not fall back to computing from the turns", () => {
    // The whole point: a row with a transcript but no metrics stays empty. If
    // this ever returns an object, history and Coach can disagree about the same
    // call and §6's "JavaScript computes, once" guarantee is gone.
    const row = call({ metrics: null })
    expect(toScorecardData(row).metrics).toBeNull()
    expect(row.transcript).toHaveLength(3) // the turns WERE available
  })

  it("rejects malformed jsonb rather than crashing the scorecard", () => {
    // The scorecard reads metrics.talk_listen.rep_pct and metrics.fillers.count
    // directly, so a half-written object has to read as absent.
    expect(storedMetrics({})).toBeNull()
    expect(storedMetrics({ fillers: { count: 3, per_minute: 1 } })).toBeNull()
    expect(storedMetrics({ talk_listen: { rep_pct: 58 } })).toBeNull()
    expect(storedMetrics("not an object")).toBeNull()
    expect(storedMetrics(42)).toBeNull()
    expect(storedMetrics([METRICS])).toBeNull() // an array is not a metrics object
  })

  it("accepts a real object with both required keys", () => {
    const minimal = {
      talk_listen: { rep_seconds: 11, total_seconds: 14, rep_pct: 79 },
      fillers: { count: 4, per_minute: 21.8 },
    }
    expect(storedMetrics(minimal)).toBe(minimal)
  })
})

describe("sortCallsNewestFirst", () => {
  const at = (id: string, created_at: string | null) => call({ id, created_at })

  it("puts the newest call first", () => {
    const rows = [
      at("jul15", "2026-07-15T09:48:00.000Z"),
      at("jul29", "2026-07-29T14:03:00.000Z"),
      at("jul22", "2026-07-22T11:20:00.000Z"),
    ]
    expect(sortCallsNewestFirst(rows).map((c) => c.id)).toEqual([
      "jul29",
      "jul22",
      "jul15",
    ])
  })

  it("is stable for equal timestamps — the list never reshuffles", () => {
    const same = "2026-07-29T14:03:00.000Z"
    const rows = [at("a", same), at("b", same), at("c", same)]
    expect(sortCallsNewestFirst(rows).map((c) => c.id)).toEqual(["a", "b", "c"])
    // And again, to be explicit that it is not merely one lucky ordering.
    expect(sortCallsNewestFirst(rows).map((c) => c.id)).toEqual(["a", "b", "c"])
  })

  it("sorts a row that cannot say when it happened last", () => {
    const rows = [
      at("undated", null),
      at("jul29", "2026-07-29T14:03:00.000Z"),
      at("garbage", "not a date"),
    ]
    // Undated rows keep their relative order behind every dated one.
    expect(sortCallsNewestFirst(rows).map((c) => c.id)).toEqual([
      "jul29",
      "undated",
      "garbage",
    ])
  })

  it("does not mutate the input", () => {
    const rows = [at("a", "2026-07-15T09:48:00.000Z"), at("b", "2026-07-29T14:03:00.000Z")]
    sortCallsNewestFirst(rows)
    expect(rows.map((c) => c.id)).toEqual(["a", "b"])
  })

  it("handles the empty list", () => {
    expect(sortCallsNewestFirst([])).toEqual([])
  })
})

describe("callSummary — which statuses count as scored", () => {
  it("uses the score and the top fix when the call was scored", () => {
    expect(callSummary(call())).toEqual({
      score: 3,
      headline: "Ask for the meeting.",
    })
  })

  it("names the status when the call never got that far", () => {
    for (const status of ["recorded", "transcribing", "error"]) {
      expect(callSummary(call({ status, rubric_scores: null }))).toEqual({
        score: null,
        headline: `Not scored (${status})`,
      })
    }
  })

  it("says 'No score' when the status claims scored but the data is unusable", () => {
    expect(callSummary(call({ status: "scored", rubric_scores: null }))).toEqual({
      score: null,
      headline: "No score",
    })
  })

  it("asks the data, not the status, for the badge", () => {
    // A row still marked 'transcribing' that nonetheless carries real scores
    // shows them — the badge renders what is there.
    const summary = callSummary(
      call({
        status: "transcribing",
        rubric_scores: { overall_score: 4, top_fix: "Tie it to the problem.", dimensions: [] },
      }),
    )
    expect(summary).toEqual({ score: 4, headline: "Tie it to the problem." })
  })

  it("treats a missing overall_score as unscored while keeping the top fix", () => {
    const summary = callSummary(
      call({ rubric_scores: { top_fix: "Open cleanly.", dimensions: [] } }),
    )
    expect(summary).toEqual({ score: null, headline: "Open cleanly." })
  })
})

describe("callTurns", () => {
  it("passes an array through", () => {
    expect(callTurns(TURNS)).toBe(TURNS)
  })

  it("reads anything else as no transcript", () => {
    expect(callTurns(null)).toEqual([])
    expect(callTurns(undefined)).toEqual([])
    expect(callTurns("[]")).toEqual([])
    expect(callTurns({ turns: TURNS })).toEqual([])
  })
})

describe("toScorecardData", () => {
  it("maps a stored row onto exactly what the scorecard takes", () => {
    expect(toScorecardData(call())).toEqual({
      createdAt: "2026-07-29T14:03:00.000Z",
      durationSeconds: null,
      scores: { overall_score: 3, top_fix: "Ask for the meeting.", dimensions: [] },
      turns: TURNS,
      repSpeaker: 0,
      metrics: METRICS,
    })
  })

  it("always reports a null duration", () => {
    // The lead_id select does not include duration_seconds (STATUS §1), so the
    // header prints the date alone rather than a number under the wrong label.
    expect(toScorecardData(call()).durationSeconds).toBeNull()
  })

  it("survives a row where every optional column is null", () => {
    const bare: StoredCall = { id: "c9" }
    expect(toScorecardData(bare)).toEqual({
      createdAt: null,
      durationSeconds: null,
      scores: null,
      turns: [],
      repSpeaker: null,
      metrics: null,
    })
  })
})

describe("attachPayload", () => {
  it("links with a real lead id", () => {
    expect(attachPayload("11111111-2222-3333-4444-555555555555")).toEqual({
      lead_id: "11111111-2222-3333-4444-555555555555",
    })
  })

  it("detaches with null, never the empty string", () => {
    // The route accepts null OR "" (STATUS §1); we send null.
    expect(attachPayload(null)).toEqual({ lead_id: null })
    expect(attachPayload("")).toEqual({ lead_id: null })
  })
})
