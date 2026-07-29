import { cn } from "@/lib/utils"
import { SCORE_MAX, scoreTone } from "@/lib/score"

const TONE_CLASS = {
  pass: "tint-pass",
  warn: "tint-warn",
  fail: "tint-fail",
} as const

/**
 * The /5 score badge, §4.1. Every score in the app renders through this — Coach
 * panel, lead call history, dashboard — so the treatment is identical everywhere.
 *
 * `hero` is the 44px overall-score badge in the scorecard call header (§5.2);
 * `default` is the per-dimension badge in the audit rows.
 */
export function ScoreBadge({
  score,
  size = "default",
  className,
}: {
  score: number
  size?: "default" | "hero"
  className?: string
}) {
  const tone = scoreTone(score)

  return (
    <span
      data-numeric
      data-tone={tone}
      className={cn(
        "inline-flex w-fit shrink-0 items-center justify-center rounded-md tabular-nums",
        TONE_CLASS[tone],
        size === "hero"
          ? "text-stat px-4 py-2"
          : "text-label px-2 py-0.5 font-medium",
        className
      )}
    >
      {score}/{SCORE_MAX}
    </span>
  )
}
