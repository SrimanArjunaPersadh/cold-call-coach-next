// ══ The scorecard (§5.2) ═══════════════════════════════════════════════════
//
// The sanctioned REFINE: Kindo's audit-table structure. Call header → TOP FIX as
// the hero line → metrics strip → six dimension rows as a strict grid → the
// transcript, collapsed.
//
// ONE component, and it only renders. It never fetches and it never computes a
// metric: `metrics` arrives already computed by `computeMetrics` (§6), so Phase
// 5's lead call history can render this exact component off a stored row without
// a second code path. The only thing derived here is `distinctSpeakers`, which
// decides what to CALL each voice — a labelling question, not arithmetic.

import { ScoreBadge } from "@/components/score-badge"
import { Button } from "@/components/ui/button"
import { transcriptLabel } from "@/lib/coach"
import { fmtCallDate, fmtTime } from "@/lib/format"
import { distinctSpeakers, type CallMetrics, type DiarisedTurn } from "@/lib/metrics"
import { DIMENSION_LABELS, type RubricScores } from "@/lib/rubric"
import { cn } from "@/lib/utils"

export type ScorecardData = {
  /** ISO timestamp of the call row. */
  createdAt: string | null
  durationSeconds: number | null
  /** The frozen brain's output, or null if scoring returned nothing usable. */
  scores: RubricScores | null
  turns: DiarisedTurn[]
  repSpeaker: number | null
  /** Already computed (Coach) or already stored (lead history). Never derived here. */
  metrics: CallMetrics | null
}

export type ScorecardProps = {
  data: ScorecardData
  /** Omit to render read-only — that is how Phase 5's history renders it. */
  onSwapSpeaker?: () => void
  /** The debounced-persist note. `null` hides the line. */
  saveNote?: { tone: "info" | "error"; text: string } | null
  /**
   * What an ABSENT `metrics` object means, which differs by caller — the one
   * branch §5.2's "single source, no forked markup" needs.
   *
   * `"message"` (default) is the Coach loop: metrics are computed here and now,
   * so their absence is a state worth naming.
   *
   * `"omit"` is Phase 5's lead history, where the strip is dropped entirely —
   * not zeros, not "—", no withheld block, no empty band. A call saved before
   * metrics existed simply has no metrics, and that is `storedMetricsHtml`'s
   * `if (!m || !m.talk_listen) return ''` (index.html:1531) carried over exactly.
   */
  metricsAbsent?: "message" | "omit"
  className?: string
}

const CAVEAT =
  "Talk share is an estimate — one mixed-mono track can't cleanly attribute " +
  "overlapping speech. Fillers are a plain word match, so conversational " +
  "“so”, “like” and “right” inflate the count."

/** Section chrome: every band of the card is separated by one 1px --border rule. */
function Band({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("border-t border-border p-4", className)}>{children}</div>
  )
}

/**
 * One metrics tile. The value uses the 24px role, not the 44px hero — the hero
 * on this card is the overall score, and two competing 44px numbers would make
 * the reader choose which one matters.
 */
function MetricTile({
  value,
  label,
  estimate = false,
  sub,
}: {
  value: string
  label: string
  estimate?: boolean
  sub: string
}) {
  return (
    <div className="min-w-0">
      <p data-numeric className="text-title">
        {value}
      </p>
      <p className="eyebrow mt-2 flex flex-wrap items-center gap-2">
        {label}
        {estimate ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
            Estimate
          </span>
        ) : null}
      </p>
      <p className="mt-2 text-label text-muted-foreground">{sub}</p>
    </div>
  )
}

/**
 * §8.1 graceful degradation, kept loud. One speaker means diarisation failed on
 * the mixed-mono track, and all three numbers need the rep separated from the
 * prospect — so they are withheld rather than shown wrong. The persisted
 * `metrics` is null to match (see `metricsForPersist`).
 */
function MetricsWithheld() {
  return (
    <div className="rounded-lg border border-warn/40 bg-warn/5 p-4">
      <p className="text-subhead text-warn">
        Diarisation returned a single speaker.
      </p>
      <p className="mt-2 max-w-prose text-body text-foreground-2">
        Talk share, longest monologue and filler rate all need your voice
        separated from the prospect&rsquo;s, so they&rsquo;re withheld for this
        call rather than shown wrong. The transcript and the call-level scores
        below are unaffected.
      </p>
    </div>
  )
}

function MetricsStrip({
  metrics,
  singleSpeaker,
}: {
  metrics: CallMetrics | null
  singleSpeaker: boolean
}) {
  if (singleSpeaker) return <MetricsWithheld />
  if (!metrics) {
    return <p className="text-body text-muted-foreground">No metrics yet.</p>
  }

  const pct = metrics.talk_listen.rep_pct
  const perMinute = metrics.fillers.per_minute

  return (
    <>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        <MetricTile
          value={pct === null ? "—" : `~${pct}%`}
          label="Talk share"
          estimate
          sub={`of spoken time — ${fmtTime(metrics.talk_listen.rep_seconds)} of ${fmtTime(
            metrics.talk_listen.total_seconds,
          )} in turns, not call length.`}
        />
        <MetricTile
          value={fmtTime(metrics.longest_monologue_seconds)}
          label="Longest monologue"
          sub="Your longest unbroken stretch."
        />
        <MetricTile
          value={String(metrics.fillers.count)}
          label="Filler words"
          sub={
            perMinute === null
              ? "Rate unavailable."
              : `${perMinute} per minute of your speech.`
          }
        />
      </div>
      {/* The disclosure IS the feature — it is what makes the estimate honest. */}
      <p className="mt-4 max-w-prose text-label text-muted-foreground">{CAVEAT}</p>
    </>
  )
}

/** One audit row: badge column · name column · evidence-and-fix column. */
function DimensionRow({
  label,
  score,
  evidence,
  fix,
}: {
  label: string
  score: number
  evidence: string
  fix: string
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 border-t border-border p-4 sm:grid-cols-[auto_10rem_1fr]">
      <ScoreBadge score={score} />
      <p className="text-subhead">{label}</p>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        {evidence ? (
          <p className="text-body text-foreground-2">&ldquo;{evidence}&rdquo;</p>
        ) : (
          <p className="text-body text-muted-foreground">
            No moment in the transcript matched this dimension.
          </p>
        )}
        {/* The fix is the emphasised line — it is the actionable thing. */}
        <p className="mt-2 text-subhead">{fix}</p>
      </div>
    </div>
  )
}

function TranscriptTurns({
  turns,
  repSpeaker,
}: {
  turns: DiarisedTurn[]
  repSpeaker: number | null
}) {
  if (!turns.length) {
    return <p className="text-body text-muted-foreground">No transcript returned.</p>
  }

  const speakerCount = distinctSpeakers(turns).length

  return (
    <div className="flex flex-col gap-4">
      {turns.map((turn, i) => {
        const isRep =
          repSpeaker !== null && Number(turn.speaker) === Number(repSpeaker)
        return (
          <div
            key={i}
            data-speaker={turn.speaker}
            data-rep={isRep ? 1 : 0}
            // Rep-relative weight, not rep-relative colour: cyan is interaction
            // only, and pass/warn/fail mean scores. Who is talking is neither.
            className={cn(
              "border-l-2 pl-4",
              isRep ? "border-foreground/30" : "border-border",
            )}
          >
            <div className="flex flex-wrap items-baseline gap-x-4">
              <span className="text-subhead">
                {transcriptLabel(turn.speaker, repSpeaker, speakerCount)}
              </span>
              <span data-numeric className="text-label text-muted-foreground">
                {fmtTime(turn.start)}&ndash;{fmtTime(turn.end)}
              </span>
            </div>
            <p className="mt-2 text-body text-foreground-2">{turn.text}</p>
          </div>
        )
      })}
    </div>
  )
}

export function Scorecard({
  data,
  onSwapSpeaker,
  saveNote,
  metricsAbsent = "message",
  className,
}: ScorecardProps) {
  const { createdAt, durationSeconds, scores, turns, repSpeaker, metrics } = data

  const speakers = distinctSpeakers(turns)
  const singleSpeaker = turns.length > 0 && speakers.length < 2
  // "Swap speakers" is meaningless with three voices — the control cycles then,
  // and says so.
  const swapLabel = speakers.length > 2 ? "Next speaker" : "Swap speakers"

  // No metrics AND nothing to say about it → the band does not render at all.
  // Checked here rather than inside MetricsStrip because a Band that returned
  // null content would still draw its own border and padding: visible chrome
  // announcing an absence, which is the opposite of the intent.
  const showMetrics =
    metrics !== null || metricsAbsent === "message" || saveNote != null

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {/* ── Call header ────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start gap-4 p-4">
        {scores ? (
          <ScoreBadge score={scores.overall_score} size="hero" />
        ) : (
          <span className="rounded-md bg-muted px-4 py-2 text-stat text-muted-foreground">
            —
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p data-numeric className="eyebrow">
            {fmtCallDate(createdAt)}
            {durationSeconds !== null && durationSeconds !== undefined
              ? ` · ${fmtTime(durationSeconds)}`
              : ""}
          </p>
          {scores ? (
            <>
              <p className="eyebrow mt-4">Top fix</p>
              <p className="mt-2 text-section">{scores.top_fix}</p>
            </>
          ) : (
            <p className="mt-4 text-body text-muted-foreground">
              No scores returned.
            </p>
          )}
        </div>
      </header>

      {/* ── Metrics strip ──────────────────────────────────────────────── */}
      {showMetrics ? (
        <Band>
          <MetricsStrip metrics={metrics} singleSpeaker={singleSpeaker} />
          {saveNote ? (
            <p
              role="status"
              className={cn(
                "mt-4 text-label",
                saveNote.tone === "error" ? "text-fail" : "text-muted-foreground",
              )}
            >
              {saveNote.text}
            </p>
          ) : null}
        </Band>
      ) : null}

      {/* ── Review audit ───────────────────────────────────────────────── */}
      {scores ? (
        <section>
          <div className="hidden border-t border-border bg-muted px-4 py-2 sm:grid sm:grid-cols-[auto_10rem_1fr] sm:gap-x-4">
            <span className="eyebrow">Score</span>
            <span className="eyebrow">Criterion</span>
            <span className="eyebrow">Evidence · Fix</span>
          </div>
          {scores.dimensions.map((d) => (
            <DimensionRow
              key={d.key}
              label={DIMENSION_LABELS[d.key] || d.key}
              score={d.score}
              evidence={d.evidence}
              fix={d.fix}
            />
          ))}
        </section>
      ) : null}

      {/* ── Transcript, collapsed by default ───────────────────────────── */}
      <details className="border-t border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 marker:content-none hover:bg-muted [&::-webkit-details-marker]:hidden">
          <span className="text-subhead">Transcript</span>
          <span data-numeric className="text-label text-muted-foreground">
            {turns.length} turns
          </span>
        </summary>

        <div className="border-t border-border p-4">
          {turns.length ? (
            <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg bg-muted p-4">
              <span className="text-label text-foreground-2">
                {repSpeaker === null
                  ? "Speaker unknown"
                  : `You = Speaker ${repSpeaker}`}
              </span>
              {onSwapSpeaker ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onSwapSpeaker}
                  disabled={speakers.length < 2}
                >
                  {swapLabel}
                </Button>
              ) : null}
              <span className="text-label text-muted-foreground">
                {speakers.length >= 2
                  ? "Labelled wrong? Swap — metrics recompute instantly."
                  : "Only one speaker detected — nothing to swap."}
              </span>
            </div>
          ) : null}

          <TranscriptTurns turns={turns} repSpeaker={repSpeaker} />
        </div>
      </details>
    </article>
  )
}

/** A skeleton bar in --surface-2 (§4.4 loading). */
function Bar({ className }: { className?: string }) {
  return <span className={cn("block h-4 rounded-md bg-muted", className)} />
}

/**
 * The loading state, while create-upload → PUT → analyze runs. This closes the
 * old app's known gap (STATUS §4): the transcript had no skeleton, only a
 * borrowed status line. Every band the finished card will have is stubbed here,
 * so the layout does not jump when the real one arrives.
 */
export function ScorecardSkeleton() {
  return (
    <article
      aria-busy
      aria-label="Transcribing and scoring"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <header className="flex flex-wrap items-start gap-4 p-4">
        <span className="block size-16 rounded-md bg-muted" />
        <div className="min-w-0 flex-1">
          <Bar className="w-40" />
          <Bar className="mt-4 w-full max-w-md" />
          <Bar className="mt-2 w-2/3 max-w-sm" />
        </div>
      </header>

      <Band>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Bar className="h-8 w-24" />
              <Bar className="mt-2 w-32" />
              <Bar className="mt-2 w-full" />
            </div>
          ))}
        </div>
      </Band>

      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 border-t border-border p-4 sm:grid-cols-[auto_10rem_1fr]"
        >
          <Bar className="h-6 w-12" />
          <Bar className="w-32" />
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <Bar className="w-full" />
            <Bar className="mt-2 w-3/4" />
          </div>
        </div>
      ))}

      <div className="border-t border-border p-4">
        <Bar className="w-32" />
        <div className="mt-4 flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border-l-2 border-border pl-4">
              <Bar className="w-24" />
              <Bar className="mt-2 w-full" />
              <Bar className="mt-2 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

/**
 * §4.4 empty: an invitation to act, in interface voice. One surface now, so one
 * empty state — the old app's three ("No transcript yet." / "No metrics yet." /
 * "Not scored yet.") described three panels that §5.2 merged into this card.
 */
export function ScorecardEmpty() {
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <p className="text-subhead">No call scored yet.</p>
      <p className="mt-2 max-w-prose text-body text-foreground-2">
        Record a call and press Analyze. The transcript, your talk share and the
        six-dimension scorecard land here.
      </p>
    </div>
  )
}
