// ══ The deterministic engine (§6) ═══════════════════════════════════════════
//
// The model never does arithmetic. Deepgram transcribes, Haiku judges, and
// every number the UI prints is computed here. Ported behaviour-identical from
// the old app's `computeMetrics` (index.html §"Metrics") — same regex, same
// gap rule, same rounding, same persisted shape. This port changes no formula,
// so METRICS_VERSION stays 1.
//
// Pure and dependency-free on purpose: a speaker swap recomputes all three
// metrics from the same turns with no API call.

/**
 * One diarised turn as stored in `calls.transcript`, built by the analyze
 * route from Deepgram's utterances.
 */
export type DiarisedTurn = {
  speaker: number
  start: number
  end: number
  text?: string
}

/**
 * The persisted shape of `calls.metrics` — what PATCH /api/calls stores and
 * what lead history formats without recomputing. §6's three-number sketch is
 * the *display* contract; this is the stored one, and it is the old app's
 * verbatim.
 */
export type CallMetrics = {
  version: number
  rep_speaker: number
  talk_listen: {
    rep_seconds: number
    total_seconds: number
    /** Whole percent; null when nobody spoke. */
    rep_pct: number | null
  }
  longest_monologue_seconds: number
  fillers: {
    count: number
    /** Per minute of rep speech; null when the rep spoke 0s. */
    per_minute: number | null
  }
}

// The design's exact list. It is a plain word match, so conversational
// "so"/"like"/"right" inflate the count — the UI discloses that as a caveat
// rather than hiding it. Tightening is deferred (§12) and would mean bumping
// METRICS_VERSION, because old rows were computed with this list.
const FILLER_RE = /\b(um|uh|like|you know|so|basically|literally|right)\b/gi

/** Seconds of silence a monologue survives. A *longer* gap starts a new run. */
const MONOLOGUE_GAP = 1.5

/** Bump if the filler list or any formula changes. */
const METRICS_VERSION = 1

const round1 = (n: number) => Math.round(n * 10) / 10

// Stored turns are unvalidated JSON from the database, so the coercions the old
// app used stay: a malformed turn contributes 0s rather than NaN-poisoning
// every metric downstream of it.
const turnSeconds = (t: DiarisedTurn) =>
  Math.max(0, (Number(t.end) || 0) - (Number(t.start) || 0))

/**
 * The diarised voices on a call, ascending and deduped.
 *
 * Ported verbatim from the old app (index.html) in Phase 3, when three callers
 * finally needed it: the You/Prospect transcript labels, the swap cycle, and the
 * <2-speakers withholding rule. Non-finite speaker ids are dropped rather than
 * carried — a malformed turn must not add a phantom voice that re-enables swap
 * or unblocks metrics.
 */
export function distinctSpeakers(
  turns: DiarisedTurn[] | null | undefined,
): number[] {
  return [...new Set((turns || []).map((t) => Number(t.speaker)))]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
}

/**
 * Talk share, longest monologue and filler count for one call.
 *
 * Returns `null` when there are no turns or no confirmed rep speaker — there
 * is nothing to attribute. Note that the <2-distinct-speakers case is NOT
 * handled here: withholding metrics when diarisation collapsed to one voice is
 * the caller's decision (it also persists `metrics: null`), exactly as in the
 * old app.
 */
export function computeMetrics(
  turns: DiarisedTurn[] | null | undefined,
  repSpeaker: number | null | undefined,
): CallMetrics | null {
  if (!turns || !turns.length || repSpeaker === null || repSpeaker === undefined)
    return null

  let repSeconds = 0
  let totalSeconds = 0
  let fillerCount = 0
  let bestRun = 0
  let runStart: number | null = null
  let runEnd = 0

  turns.forEach((turn) => {
    // Both sides of the share are sums of turn durations: this is a share of
    // SPOKEN time, never of wall clock. Silence, ring and hold are not in the
    // denominator, and the label says so.
    totalSeconds += turnSeconds(turn)

    if (Number(turn.speaker) !== Number(repSpeaker)) {
      runStart = null // a prospect turn always breaks the run
      return
    }

    repSeconds += turnSeconds(turn)
    // Fillers are counted in rep turns only — this is a coaching number about
    // the rep, not a transcript statistic.
    fillerCount += (String(turn.text || "").match(FILLER_RE) || []).length

    // Consecutive rep turns extend the run; a gap over MONOLOGUE_GAP starts a
    // fresh one. Strictly greater: a gap of exactly 1.5s still merges.
    // bestRun stays current, so the prospect branch just resets.
    const start = Number(turn.start) || 0
    if (runStart === null || start - runEnd > MONOLOGUE_GAP) runStart = start
    runEnd = Math.max(start, Number(turn.end) || start)
    bestRun = Math.max(bestRun, runEnd - runStart)
  })

  const repMinutes = repSeconds / 60
  return {
    version: METRICS_VERSION,
    rep_speaker: Number(repSpeaker),
    talk_listen: {
      rep_seconds: round1(repSeconds),
      total_seconds: round1(totalSeconds),
      // Whole percent only — one mixed-mono track can't attribute overlapping
      // speech well enough to justify a decimal place.
      rep_pct: totalSeconds > 0 ? Math.round((repSeconds / totalSeconds) * 100) : null,
    },
    longest_monologue_seconds: round1(bestRun),
    fillers: {
      count: fillerCount,
      per_minute: repMinutes > 0 ? round1(fillerCount / repMinutes) : null,
    },
  }
}
