// First tests in this codebase (§6). They exist to freeze the arithmetic: the
// migration is only allowed to change syntax, so every expectation below is the
// old app's behaviour, including the parts that are deliberately loose.

import { describe, expect, it } from "vitest"

import { computeMetrics, type DiarisedTurn } from "./metrics"
import {
  GOLDEN_REP_SPEAKER,
  GOLDEN_STORED_METRICS,
  GOLDEN_TRANSCRIPT,
} from "./__fixtures__/golden-call"

/** Shorthand so the fixtures below read as timing, not as object literals. */
const turn = (
  speaker: number,
  start: number,
  end: number,
  text = "",
): DiarisedTurn => ({ speaker, start, end, text })

describe("computeMetrics — nothing to attribute", () => {
  it("returns null for no turns", () => {
    expect(computeMetrics([], 0)).toBeNull()
    expect(computeMetrics(null, 0)).toBeNull()
    expect(computeMetrics(undefined, 0)).toBeNull()
  })

  it("returns null when the rep speaker is unconfirmed", () => {
    const turns = [turn(0, 0, 10), turn(1, 10, 20)]
    expect(computeMetrics(turns, null)).toBeNull()
    expect(computeMetrics(turns, undefined)).toBeNull()
  })

  it("treats speaker 0 as a real rep, not a missing one", () => {
    // The falsy trap: rep_speaker 0 is the common case (whoever speaks first).
    expect(computeMetrics([turn(0, 0, 10)], 0)).not.toBeNull()
  })
})

describe("computeMetrics — monologue gap merging", () => {
  // Two rep turns, 2s then 1s, separated by a controlled gap. First turn ends
  // at 2.0, so the second turn's start sets the gap exactly.
  const withGap = (gap: number) => [turn(0, 0, 2), turn(0, 2 + gap, 3 + gap)]

  it("merges a 1.4s gap into one monologue", () => {
    // 0 → 4.4: both turns plus the silence between them.
    expect(computeMetrics(withGap(1.4), 0)?.longest_monologue_seconds).toBe(4.4)
  })

  it("merges a gap of exactly 1.5s — the rule is strictly greater", () => {
    expect(computeMetrics(withGap(1.5), 0)?.longest_monologue_seconds).toBe(4.5)
  })

  it("splits a 1.6s gap into two monologues", () => {
    // Longest surviving run is the first turn's 2s, not the merged 4.6s.
    expect(computeMetrics(withGap(1.6), 0)?.longest_monologue_seconds).toBe(2)
  })

  it("lets a prospect turn break the run however short the gap", () => {
    const turns = [turn(0, 0, 5), turn(1, 5, 5.2), turn(0, 5.2, 10)]
    // 5s then 4.8s — never the 10s the gap rule alone would have merged.
    expect(computeMetrics(turns, 0)?.longest_monologue_seconds).toBe(5)
  })
})

describe("computeMetrics — talk share is a share of spoken time", () => {
  it("divides by the sum of turn durations, not by wall clock", () => {
    // 20s of call, 3s of it silence before the first word and between turns.
    const turns = [turn(0, 3, 9), turn(1, 12, 18)]
    const m = computeMetrics(turns, 0)
    expect(m?.talk_listen).toEqual({
      rep_seconds: 6,
      total_seconds: 12, // not 15 (first word → last word), not 20 (the call)
      rep_pct: 50,
    })
  })

  it("floors a malformed turn at 0 seconds instead of going negative", () => {
    const turns = [turn(0, 0, 10), turn(1, 20, 15)]
    expect(computeMetrics(turns, 0)?.talk_listen.total_seconds).toBe(10)
  })

  it("nulls rep_pct and per_minute when nobody spoke for any time", () => {
    // Zero-duration turns: the numbers exist but the ratios do not.
    const turns = [turn(0, 5, 5, "um so basically"), turn(1, 5, 5, "hello")]
    expect(computeMetrics(turns, 0)).toEqual({
      version: 1,
      rep_speaker: 0,
      talk_listen: { rep_seconds: 0, total_seconds: 0, rep_pct: null },
      longest_monologue_seconds: 0,
      fillers: { count: 3, per_minute: null },
    })
  })
})

describe("computeMetrics — fillers", () => {
  it("counts the rep's fillers only", () => {
    const turns = [
      turn(0, 0, 60, "Um, so I was calling about your website."),
      turn(1, 60, 120, "Um, uh, like, you know, basically, literally, right."),
    ]
    expect(computeMetrics(turns, 0)?.fillers).toEqual({ count: 2, per_minute: 2 })
  })

  it("keeps the loose words that inflate the count (tightening is deferred)", () => {
    // If this ever fails, someone changed the regex — which requires a
    // METRICS_VERSION bump, because stored rows were computed with this list.
    const turns = [turn(0, 0, 60, "So it's like a five minute thing, right?")]
    expect(computeMetrics(turns, 0)?.fillers.count).toBe(3)
  })

  it("respects word boundaries and case", () => {
    const turns = [
      turn(0, 0, 60, "UM, Basically likely unlikely somersault brightly YOU KNOW"),
    ]
    // "um", "basically", "you know" — the four decoys are not fillers.
    expect(computeMetrics(turns, 0)?.fillers.count).toBe(3)
  })

  it("survives a turn with no text", () => {
    expect(computeMetrics([{ speaker: 0, start: 0, end: 60 }], 0)?.fillers).toEqual({
      count: 0,
      per_minute: 0,
    })
  })
})

describe("computeMetrics — speaker swap symmetry", () => {
  // The same call read two ways. Swapping the rep must recompute everything
  // from the same turns — never relabel a display.
  const turns = [
    turn(0, 0, 10, "So, um, I was calling about your website."),
    turn(1, 10, 14, "Uh, we already have one."),
    turn(0, 14, 20, "It's like a five minute thing, right?"),
    turn(1, 20, 34, "You know, basically we're happy with it."),
  ]

  const asSpeaker0 = computeMetrics(turns, 0)
  const asSpeaker1 = computeMetrics(turns, 1)

  it("reports the same spoken total from either side", () => {
    expect(asSpeaker0?.talk_listen.total_seconds).toBe(34)
    expect(asSpeaker1?.talk_listen.total_seconds).toBe(34)
  })

  it("splits the spoken seconds and the percentage between the two", () => {
    expect(asSpeaker0?.talk_listen.rep_seconds).toBe(16)
    expect(asSpeaker1?.talk_listen.rep_seconds).toBe(18)
    expect(asSpeaker0?.talk_listen.rep_pct).toBe(47)
    expect(asSpeaker1?.talk_listen.rep_pct).toBe(53)
  })

  it("recomputes monologue and fillers per speaker, not per label", () => {
    expect(asSpeaker0?.longest_monologue_seconds).toBe(10)
    expect(asSpeaker1?.longest_monologue_seconds).toBe(14)
    expect(asSpeaker0?.fillers).toEqual({ count: 4, per_minute: 15 })
    expect(asSpeaker1?.fillers).toEqual({ count: 3, per_minute: 10 })
  })

  it("stamps the rep it was asked about", () => {
    expect(asSpeaker0?.rep_speaker).toBe(0)
    expect(asSpeaker1?.rep_speaker).toBe(1)
  })

  it("is pure — repeated calls agree and the turns are untouched", () => {
    const before = JSON.stringify(turns)
    expect(computeMetrics(turns, 0)).toEqual(asSpeaker0)
    expect(JSON.stringify(turns)).toBe(before)
  })
})

describe("computeMetrics — single-speaker degenerate call", () => {
  // Diarisation collapsed to one voice. The function still answers; deciding to
  // withhold the numbers (and persist metrics: null) belongs to the caller.
  const turns = [
    turn(0, 0, 20, "Um, so, hi there."),
    turn(0, 21, 40, "Basically, right, that's the pitch."),
  ]

  it("returns an object rather than withholding", () => {
    expect(computeMetrics(turns, 0)).toEqual({
      version: 1,
      rep_speaker: 0,
      talk_listen: { rep_seconds: 39, total_seconds: 39, rep_pct: 100 },
      longest_monologue_seconds: 40, // the 1s gap merges both turns
      fillers: { count: 4, per_minute: 6.2 },
    })
  })

  it("returns zeroed ratios when the rep is not in the call at all", () => {
    expect(computeMetrics(turns, 1)).toEqual({
      version: 1,
      rep_speaker: 1,
      talk_listen: { rep_seconds: 0, total_seconds: 39, rep_pct: 0 },
      longest_monologue_seconds: 0,
      fillers: { count: 0, per_minute: null },
    })
  })
})

describe("computeMetrics — golden fixture", () => {
  it("reproduces the stored metrics of the one real call, exactly", () => {
    expect(computeMetrics(GOLDEN_TRANSCRIPT, GOLDEN_REP_SPEAKER)).toEqual(
      GOLDEN_STORED_METRICS,
    )
  })
})
