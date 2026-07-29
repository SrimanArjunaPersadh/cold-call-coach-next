// Phase 3's decisions-with-a-right-answer, tested without a DOM.
//
// The Coach panel itself is not unit-tested (no jsdom, no React Testing Library
// — a real decision, deliberately not taken as a rider on this phase). Instead
// every rule that HAS a right answer was pushed down into `src/lib` and is
// pinned here: the swap cycle, the withholding rule, and the transcript labels.

import { describe, expect, it } from "vitest"

import { metricsForPersist, nextRepSpeaker, transcriptLabel } from "./coach"
import { computeMetrics, type DiarisedTurn } from "./metrics"

const turn = (
  speaker: number,
  start: number,
  end: number,
  text = "",
): DiarisedTurn => ({ speaker, start, end, text })

/** Two voices, alternating. */
const TWO: DiarisedTurn[] = [turn(0, 0, 5, "hello"), turn(1, 5, 9, "hi")]

/** Three voices — Deepgram does this on a speakerphone call. */
const THREE: DiarisedTurn[] = [
  turn(0, 0, 5, "hello"),
  turn(1, 5, 9, "hi"),
  turn(2, 9, 12, "who is this"),
]

describe("nextRepSpeaker — the swap CYCLES, it does not toggle", () => {
  it("alternates with exactly two speakers", () => {
    expect(nextRepSpeaker(TWO, 0)).toBe(1)
    expect(nextRepSpeaker(TWO, 1)).toBe(0)
  })

  it("cycles 0 → 1 → 2 → 0 with three speakers", () => {
    expect(nextRepSpeaker(THREE, 0)).toBe(1)
    expect(nextRepSpeaker(THREE, 1)).toBe(2)
    expect(nextRepSpeaker(THREE, 2)).toBe(0)
  })

  it("cycles by position, not by id — gaps in the ids do not skip a voice", () => {
    // Deepgram numbers from 0, but a re-diarised call can arrive as 1 and 4.
    const gapped = [turn(4, 0, 5), turn(1, 5, 9)]
    expect(nextRepSpeaker(gapped, 1)).toBe(4)
    expect(nextRepSpeaker(gapped, 4)).toBe(1)
  })

  it("lands on the first voice when the rep is not one of the speakers", () => {
    expect(nextRepSpeaker(TWO, 7)).toBe(0)
    expect(nextRepSpeaker(THREE, 7)).toBe(0)
  })

  it("is a no-op below two speakers", () => {
    const single = [turn(0, 0, 5), turn(0, 6, 9)]
    expect(nextRepSpeaker(single, 0)).toBe(0)
    expect(nextRepSpeaker([], 0)).toBe(0)
    expect(nextRepSpeaker([], null)).toBeNull()
    expect(nextRepSpeaker(null, null)).toBeNull()
  })
})

describe("metricsForPersist — the withholding rule", () => {
  it("persists null below two distinct speakers, not noise", () => {
    const single = [turn(0, 0, 5, "um so like yeah"), turn(0, 6, 20, "right")]
    // computeMetrics would happily return numbers here; the caller withholds.
    expect(computeMetrics(single, 0)).not.toBeNull()
    expect(metricsForPersist(single, 0)).toBeNull()
  })

  it("persists null for an empty transcript", () => {
    expect(metricsForPersist([], 0)).toBeNull()
    expect(metricsForPersist(null, 0)).toBeNull()
  })

  it("persists computeMetrics output at two or more speakers", () => {
    expect(metricsForPersist(TWO, 0)).toEqual(computeMetrics(TWO, 0))
    expect(metricsForPersist(THREE, 1)).toEqual(computeMetrics(THREE, 1))
  })

  it("still persists null when the rep is unconfirmed", () => {
    expect(metricsForPersist(TWO, null)).toBeNull()
  })

  it("follows the swap — the persisted payload is the new rep's numbers", () => {
    const swapped = nextRepSpeaker(TWO, 0)
    expect(metricsForPersist(TWO, swapped)?.rep_speaker).toBe(1)
    expect(metricsForPersist(TWO, swapped)?.talk_listen.rep_pct).toBe(44)
  })
})

describe("transcriptLabel — rep-relative, but only when it can be", () => {
  it("labels You / Prospect when the rep is known and there are two voices", () => {
    expect(transcriptLabel(0, 0, 2)).toBe("You")
    expect(transcriptLabel(1, 0, 2)).toBe("Prospect")
  })

  it("stays literal for the other voices when three were diarised", () => {
    expect(transcriptLabel(0, 0, 3)).toBe("You")
    expect(transcriptLabel(1, 0, 3)).toBe("Speaker 1")
    expect(transcriptLabel(2, 0, 3)).toBe("Speaker 2")
  })

  it("uses raw diarizer indices when the rep is unknown", () => {
    expect(transcriptLabel(0, null, 2)).toBe("Speaker 0")
    expect(transcriptLabel(1, undefined, 2)).toBe("Speaker 1")
  })

  it("treats rep speaker 0 as known, not as missing", () => {
    // The falsy trap: 0 is the common rep id, since the rep usually speaks first.
    expect(transcriptLabel(0, 0, 2)).toBe("You")
  })
})
