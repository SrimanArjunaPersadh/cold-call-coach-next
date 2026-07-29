// ══ Per-lead call history — every decision with a right answer (Phase 5) ═════
//
// Pure, dependency-free, no DOM. `GET /api/calls?lead_id=` hands back
// unvalidated JSON straight out of Postgres; this module is where a row becomes
// something the scorecard can render. The ordering, the "was this scored"
// question, the payload shaping and — the one that matters most — the "stored
// metrics are FORMATTED, never recomputed" rule all live here so they can be
// tested in the bare-node Vitest suite (no jsdom, no React Testing Library —
// the same call Phases 3 and 4 made).
//
// Ported behaviour-identical from the old app's index.html: `storedMetricsHtml`
// (1530–1557), `renderLeadCalls` (1835–1867) and `attachCallToLead` (1803–1821).

import type { ScorecardData } from "@/components/scorecard"
import type { CallMetrics, DiarisedTurn } from "./metrics"
import { asRubricScores } from "./rubric"

/**
 * One row as `GET /api/calls?lead_id=` returns it (STATUS §1): `id, created_at,
 * status, rubric_scores, transcript, rep_speaker, metrics`.
 *
 * Every field but `id` is optional and `rubric_scores` / `transcript` /
 * `metrics` are `unknown`, because that is the truth: they are jsonb columns
 * written by an earlier version of this app, and one of the rows on the real
 * project predates metrics existing at all.
 *
 * Note what is NOT in the select: `duration_seconds`. The lean dashboard shape
 * carries it and this one does not, so history cannot print a duration — see
 * `toScorecardData`.
 */
export type StoredCall = {
  id: string
  created_at?: string | null
  status?: string | null
  rubric_scores?: unknown
  transcript?: unknown
  rep_speaker?: number | null
  metrics?: unknown
}

/** Sort key. An unparseable or absent timestamp sorts last — a row that cannot
 *  say when it happened must not claim to be the newest. */
function callTime(call: StoredCall): number {
  if (!call.created_at) return -Infinity
  const t = new Date(call.created_at).getTime()
  return Number.isNaN(t) ? -Infinity : t
}

/**
 * Newest first, stably.
 *
 * The route already orders `created_at.desc`, so this is belt and braces — but
 * it is cheap, it makes the list independent of the route's ORDER BY, and it is
 * the one place the ordering can be asserted without a database. Rows sharing a
 * timestamp keep the order the server sent them in (the index tiebreak), so the
 * list never reshuffles between renders.
 */
export function sortCallsNewestFirst(
  calls: readonly StoredCall[],
): StoredCall[] {
  return calls
    .map((call, i) => ({ call, i, t: callTime(call) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((entry) => entry.call)
}

/**
 * The stored `metrics` object, or null — and NOTHING ELSE. This never computes.
 *
 * THIS IS THE RULE §6 STANDS ON. The Coach panel is the only place
 * `computeMetrics` runs. If history recomputed from the stored turns, the two
 * could disagree — a filler-regex change, a gap-rule change, a
 * `METRICS_VERSION` bump — and §6's guarantee would die quietly, with both
 * numbers looking equally plausible. So a call saved before metrics existed
 * renders NO strip at all: not zeros, not "—". The absence is the honest answer.
 *
 * The gate is the old app's (`if (!m || !m.talk_listen) return ''`) plus one
 * deliberate tightening: `fillers` must be present too. The old renderer had a
 * per-field `'—'` fallback for it; our single scorecard (§5.2, one component, no
 * forked markup) reads `metrics.fillers.count` directly, and substituting a 0
 * there would be inventing a number. Every row `METRICS_VERSION` 1 ever wrote
 * carries both keys, so this rejects only genuinely malformed jsonb.
 */
export function storedMetrics(raw: unknown): CallMetrics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const m = raw as Partial<CallMetrics>
  if (!m.talk_listen || typeof m.talk_listen !== "object") return null
  if (!m.fillers || typeof m.fillers !== "object") return null
  return raw as CallMetrics
}

/** The stored transcript as turns. Not an array → no turns, never a throw. */
export function callTurns(raw: unknown): DiarisedTurn[] {
  return Array.isArray(raw) ? (raw as DiarisedTurn[]) : []
}

/** What the collapsed summary row shows. */
export type CallSummary = {
  /** The overall /5, or null when this call was never scored. */
  score: number | null
  /** The single line the row carries: the top fix, or why there isn't one. */
  headline: string
}

/**
 * Badge value + headline for one row, ported from `renderLeadCalls`.
 *
 * Which statuses count as scored: the old app did not test `status` at all for
 * the badge — it asked the DATA (`scores.overall_score != null`), because that
 * is the thing being rendered. `status` only picks the wording when there is no
 * score: a row still `recorded`/`transcribing`, or one that hit `error`, says
 * so by name; a row marked `scored` whose `rubric_scores` came back unusable
 * gets the blunter "No score". Both are true statements, which is the point.
 */
export function callSummary(call: StoredCall): CallSummary {
  const scores = asRubricScores(call.rubric_scores)
  const raw = scores?.overall_score
  const overall = raw === null || raw === undefined ? null : Number(raw)
  const score = overall !== null && Number.isFinite(overall) ? overall : null

  const status = call.status ? String(call.status) : ""
  const headline = scores?.top_fix
    ? String(scores.top_fix)
    : status && status !== "scored"
      ? `Not scored (${status})`
      : "No score"

  return { score, headline }
}

/**
 * A stored row → exactly what `<Scorecard>` takes. This is §5.2's "single
 * source, no forked markup" made mechanical: history builds the same
 * `ScorecardData` the Coach panel builds, so there is one card in two places.
 *
 * `durationSeconds` is null on purpose. The `lead_id` select does not include
 * `duration_seconds` (STATUS §1), so the call header prints the date alone —
 * rather than a duration derived from the turns, which would be a different
 * number from the one Coach showed (turn time, not wall clock) wearing the same
 * label.
 *
 * The type import is type-only and therefore erased, so this does not create a
 * runtime dependency from lib back onto a component.
 */
export function toScorecardData(call: StoredCall): ScorecardData {
  return {
    createdAt: call.created_at ?? null,
    durationSeconds: null,
    scores: asRubricScores(call.rubric_scores),
    turns: callTurns(call.transcript),
    repSpeaker: call.rep_speaker ?? null,
    metrics: storedMetrics(call.metrics),
  }
}

/**
 * The `PATCH /api/calls?id=` body for linking a call to a lead, and for
 * clearing it.
 *
 * The route accepts `null` OR `""` to detach; we send `null`, which is the
 * shape STATUS §1 documents first and the only one that survives a round trip
 * through JSON unambiguously.
 *
 * On the detach branch: no UI path sends it today. The old app's only PATCH
 * (index.html:1810) always carried a real `lead.id`, and the calling chip's ✕
 * is a pre-recording intent that clears local state without a request, because
 * at that point no call row exists yet. The branch is here because the route's
 * contract has it and shaping the body is this function's whole job — see the
 * open question in the delivery notes about whether a linked call should get an
 * explicit Unlink control.
 */
export function attachPayload(leadId: string | null): {
  lead_id: string | null
} {
  return { lead_id: leadId === null || leadId === "" ? null : String(leadId) }
}
