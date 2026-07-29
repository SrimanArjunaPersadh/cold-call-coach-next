// The three decisions the Coach panel makes ABOUT the metrics, as opposed to the
// metrics themselves (§6 / src/lib/metrics.ts).
//
// Phase 2 deliberately left these out of `computeMetrics` because they are the
// caller's calls, not the engine's: who the rep is, whether the numbers may be
// shown at all, and what to call each voice. They live here rather than inside a
// component so they can be tested without a DOM — the suite is bare Node by
// choice (no jsdom, no React Testing Library).
//
// Ported behaviour-identical from the old app's index.html: `swapRepSpeaker`,
// the withholding branch inside `persistAnalysis`, and the label ladder inside
// `transcriptHtml`.

import {
  computeMetrics,
  distinctSpeakers,
  type CallMetrics,
  type DiarisedTurn,
} from "./metrics"

/**
 * The next rep speaker in the cycle. This CYCLES the distinct voices — it is not
 * a two-way toggle, because Deepgram sometimes finds three.
 *
 * Below two speakers there is nothing to swap to, so the current value is
 * returned unchanged (the button is disabled in that state anyway). A
 * `repSpeaker` that is not one of the diarised voices lands on the first one:
 * `indexOf` returns -1, and -1 + 1 is 0. That is the old app's behaviour and it
 * is the useful one — an unknown rep resolves to a real voice on the next tap.
 */
export function nextRepSpeaker(
  turns: DiarisedTurn[] | null | undefined,
  repSpeaker: number | null | undefined,
): number | null {
  const speakers = distinctSpeakers(turns)
  if (speakers.length < 2) return repSpeaker ?? null
  const i = speakers.indexOf(Number(repSpeaker))
  return speakers[(i + 1) % speakers.length]
}

/**
 * What `PATCH /api/calls` should store in `metrics`.
 *
 * Under two distinct speakers, diarisation collapsed on the mixed-mono track and
 * every one of the three numbers needs the rep separated from the prospect. The
 * old app persisted **null** rather than noise, and so does this: a stored
 * `metrics` object is a promise that the numbers in it mean something.
 */
export function metricsForPersist(
  turns: DiarisedTurn[] | null | undefined,
  repSpeaker: number | null | undefined,
): CallMetrics | null {
  return distinctSpeakers(turns).length >= 2
    ? computeMetrics(turns, repSpeaker)
    : null
}

/**
 * The label one transcript turn carries.
 *
 * Rep-relative when we know who the rep is, but only "Prospect" when exactly two
 * voices were diarised — with three, which one is the prospect is a guess, so we
 * stay literal. `speakerCount` is `distinctSpeakers(turns).length`, passed in so
 * a long transcript computes it once.
 */
export function transcriptLabel(
  speaker: number,
  repSpeaker: number | null | undefined,
  speakerCount: number,
): string {
  const known = repSpeaker !== null && repSpeaker !== undefined
  if (!known) return `Speaker ${speaker}`
  if (Number(speaker) === Number(repSpeaker)) return "You"
  return speakerCount === 2 ? "Prospect" : `Speaker ${speaker}`
}
