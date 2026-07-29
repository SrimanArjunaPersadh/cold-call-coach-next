// §4.1 score badge mapping. One place, so the Coach panel, lead call history and
// the dashboard cannot drift apart. Scores are always out of 5.
//
// This is presentation only — it decides a colour, never a number. Per §6 the
// model does no arithmetic and neither does the UI: every score rendered here was
// produced by the frozen scoring schema (§5.1) or computed in `computeMetrics`
// (Phase 2).

export type ScoreTone = "pass" | "warn" | "fail"

export const SCORE_MAX = 5

/** 1–2 → fail · 3 → warn · 4–5 → pass (§4.1). */
export function scoreTone(score: number): ScoreTone {
  if (score >= 4) return "pass"
  if (score >= 3) return "warn"
  return "fail"
}
