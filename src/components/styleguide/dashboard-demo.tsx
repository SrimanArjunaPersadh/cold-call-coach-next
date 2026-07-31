// The two treatments Phase 7 introduces, side by side in every state they have
// (§4: a new treatment goes on /styleguide). Both are STATE, not interaction, so
// neither takes cyan — the same ruling as the recorder's indicator and the
// board's drop highlight.
//
// This renders off fixed numbers rather than the live dashboard: the point is the
// treatment, not the data, and a styleguide that needs a network round trip to
// paint is a styleguide that stops working offline.

import { ScoreBadge } from "@/components/score-badge"
import { SCORED_GATE, TREND_GEOMETRY, trendPath, trendY } from "@/lib/dashboard"
import { scoreTone } from "@/lib/score"
import { cn } from "@/lib/utils"

const CARD = "rounded-lg border border-border bg-card p-8"

const TONE_FILL = { pass: "bg-pass", warn: "bg-warn", fail: "bg-fail" } as const

function Meter({
  pct,
  className,
}: {
  pct: number
  className: string
}) {
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-md bg-border">
      <span aria-hidden className={cn("block h-full rounded-md", className)} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** §8's `4 / 25`, under target and at it. `--text-3` on `--border`, `--pass` at ≥100%. */
function ProgressStates() {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      {[
        { count: 4, pct: 16, at: false },
        { count: 25, pct: 100, at: true },
      ].map((state) => (
        <div key={state.count} className={CARD}>
          <p className="eyebrow">Calls this week</p>
          <p data-numeric className="mt-2 text-stat">
            {state.count}
            <span className="text-muted-foreground"> / 25</span>
          </p>
          <Meter
            pct={state.pct}
            className={state.at ? "bg-pass" : "bg-muted-foreground"}
          />
          <p className="mt-4 text-label text-muted-foreground">
            {state.at ? "Weekly target met." : "21 more to hit the target."}
          </p>
        </div>
      ))}
    </div>
  )
}

/** The weakest-dimension bar: a /5 mean, so §4.1's score mapping colours it. */
function WeakestStates() {
  const mean = 2.7
  return (
    <div className={CARD}>
      <p className="eyebrow">Weakest dimension</p>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-section">
          <span className="font-semibold">Offer clarity</span> is your floor
          &mdash; drill it.
        </p>
        <ScoreBadge score={mean} />
      </div>
      <Meter pct={54} className={TONE_FILL[scoreTone(mean)]} />
      <p className="mt-4 text-label text-muted-foreground">
        Mean across <span data-numeric>7</span> scored answers on this dimension.
      </p>
    </div>
  )
}

/** §0's gate, and the line it unlocks. Navy stroke, no fill, no dots. */
function TrendStates() {
  const { width, height, padX } = TREND_GEOMETRY
  const series = [2, 3, 3, 4, 5]

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div className={CARD}>
        <p className="eyebrow">Score trend</p>
        <p className="mt-4 text-body text-muted-foreground">
          Trend unlocks at {SCORED_GATE} scored calls &middot; you have{" "}
          <span data-numeric>3</span>
        </p>
      </div>
      <div className={CARD}>
        <p className="eyebrow">Score trend</p>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Overall score across the last 5 scored calls, on a scale of 1 to 5"
          className="mt-4 w-full"
        >
          {[5, 1].map((score) => (
            <line
              key={score}
              x1={padX}
              x2={width - padX}
              y1={trendY(score, TREND_GEOMETRY)}
              y2={trendY(score, TREND_GEOMETRY)}
              className="stroke-border"
              strokeWidth={1}
            />
          ))}
          <path
            d={trendPath(series, TREND_GEOMETRY)}
            fill="none"
            className="stroke-foreground"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="mt-4 text-label text-muted-foreground">
          Overall score, last <span data-numeric>5</span> scored calls &middot;
          oldest to newest, scale 1&ndash;5.
        </p>
      </div>
    </div>
  )
}

export function DashboardDemo() {
  return (
    <div className="flex flex-col gap-8">
      <ProgressStates />
      <WeakestStates />
      <TrendStates />
    </div>
  )
}
