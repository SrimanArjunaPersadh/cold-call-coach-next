// The frozen brain's output, as the UI sees it (§5.1 — FROZEN, copied verbatim).
//
// `DIMENSION_LABELS` is the old app's map (index.html), unchanged: same six keys,
// same order, same human names down to the slashes and the ampersand. The keys
// are the analyze route's `DIMENSION_KEYS`; renaming either side would silently
// fall back to printing the raw key.

/** One scored dimension as `score_cold_call` returns it. */
export type RubricDimension = {
  key: string
  score: number
  evidence: string
  fix: string
}

/** The whole tool-use payload, stored as `calls.rubric_scores`. */
export type RubricScores = {
  overall_score: number
  top_fix: string
  dimensions: RubricDimension[]
}

/** Human labels for the six fixed Hormozi dimensions. */
export const DIMENSION_LABELS: Record<string, string> = {
  opener_pattern_interrupt: "Opener / pattern interrupt",
  offer_clarity: "Offer clarity",
  problem_tie: "Problem tie",
  objection_handling: "Objection handling",
  close_or_cta: "Close / CTA",
  permission_and_framing: "Permission & framing",
}

/**
 * Narrows an unknown JSON blob to `RubricScores`. The route returns whatever
 * Claude's forced tool use produced and the database stores it unvalidated, so
 * the panel checks the one thing every renderer depends on: a dimensions array.
 */
export function asRubricScores(value: unknown): RubricScores | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<RubricScores>
  if (!Array.isArray(candidate.dimensions)) return null
  return candidate as RubricScores
}
