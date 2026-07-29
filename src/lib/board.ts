// ══ Kanban board — every decision with a right answer (§7) ═════════════════
//
// Pure, dependency-free, no DOM. The board component below is a renderer and an
// event handler; the arithmetic, the ordering, the partition and the drop-index
// resolution all live here so they can be tested in the bare-node Vitest suite
// (no jsdom, no React Testing Library — the same call Phase 3 made).
//
// Ported behaviour-identical from the old app's index.html: `STAGES`,
// `renderBoard`'s filter+sort, `getDragAfterElement`, `positionWithin`, the
// no-op guard inside `onPointerUp`, `cardHtml`'s title/sub rule, `cleanUrl` and
// `normalizeHref`.

export type StageKey =
  | "new"
  | "no_answer"
  | "callback"
  | "interested"
  | "booked"
  | "not_interested"

export type Stage = { key: StageKey; label: string }

/**
 * The six pipeline stages, in the old app's order. Same keys, same order.
 *
 * §7 AMENDED 2026-07-29 by the owner. §7 originally collapsed `not_interested`
 * into a count-chip rail to reclaim a column for the five live stages. Every
 * professional CRM — HubSpot, Pipedrive, GoHighLevel — shows its lost/dead
 * stage as a permanent full column, and the rail was the one place this board
 * asked the owner to learn something the tools they already use do not do.
 * All six stages are columns now, and the width the board got back in the same
 * pass is what pays for the sixth.
 *
 * The terminal-rail machinery (a `terminal` flag, `partitionStages`, the
 * collapsed drop zone, the remembered open/closed state) was DELETED rather
 * than left switched off. Nothing sets it, so nothing should carry it.
 */
export const STAGES: readonly Stage[] = [
  { key: "new", label: "New" },
  { key: "no_answer", label: "No answer / VM" },
  { key: "callback", label: "Call back requested" },
  { key: "interested", label: "Interested" },
  { key: "booked", label: "Booked meeting" },
  { key: "not_interested", label: "Not interested" },
]

/**
 * A lead row as `/api/leads` returns it. Every field but `id` is optional —
 * `name` lost its NOT NULL when the scraper landed (STATUS §6.6), and a
 * hand-added lead fills in almost nothing.
 */
export type Lead = {
  id: string
  name?: string | null
  business?: string | null
  phone?: string | null
  website?: string | null
  industry?: string | null
  notes?: string | null
  stage?: string | null
  address?: string | null
  maps_rating?: number | string | null
  maps_url?: string | null
  position?: number | null
}

/**
 * Which column a lead belongs to. A blank stage reads as `new` — that is the
 * old board's `(l.stage || 'new')`.
 *
 * A lead carrying an *unrecognised* stage is in no column and therefore does
 * not render. That is also the old behaviour, and it is inherited knowingly:
 * `/api/leads` drops unknown stages on write, so the only way to reach this is
 * editing Postgres by hand.
 */
export function stageOf(lead: Lead): string {
  return lead.stage || "new"
}

/**
 * Leads bucketed by stage, each bucket ordered by `position` ascending.
 *
 * The sort is stable (ES2019 guarantees it), so equal positions keep the order
 * the API sent — which is `position.asc, created_at.asc`, i.e. oldest first.
 * A missing or non-numeric position sorts as 0, exactly as the old board did.
 */
export function groupByStage(leads: readonly Lead[]): Record<string, Lead[]> {
  const groups: Record<string, Lead[]> = {}
  for (const stage of STAGES) groups[stage.key] = []
  for (const lead of leads) {
    const bucket = groups[stageOf(lead)]
    if (bucket) bucket.push(lead)
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
  }
  return groups
}

/**
 * The midpoint rule. `neighbours` is the ordered `position` list of the OTHER
 * cards in the target column; `index` is the slot the dragged card lands in.
 *
 * alone → 1000 · top → next−1000 · bottom → prev+1000 · otherwise the midpoint.
 * Only the moved row is ever written — that is the whole point of leaving
 * `Date.now()`-sized gaps between positions at insert time.
 */
export function positionForDrop(
  neighbours: readonly number[],
  index: number,
): number {
  const prev = index > 0 ? neighbours[index - 1] : undefined
  const next = index < neighbours.length ? neighbours[index] : undefined
  if (prev === undefined && next === undefined) return 1000
  if (prev === undefined) return (next as number) - 1000
  if (next === undefined) return prev + 1000
  return (prev + next) / 2
}

/**
 * Skip the PATCH when nothing actually changed — a press that turned into a
 * 6px drag and came back to the same slot is not a move.
 *
 * Note what this does NOT claim: dropping a lead back into a column where it is
 * the only card yields position 1000, which almost never equals the stored
 * `Date.now()` position, so that case does write. The old app behaves the same
 * way and the write is harmless (one row, same slot).
 */
export function isNoOpMove(
  lead: Pick<Lead, "stage" | "position">,
  stage: string,
  position: number,
): boolean {
  return lead.stage === stage && lead.position === position
}

/** A card's vertical geometry — the only thing drop resolution needs. */
export type CardRect = { top: number; height: number }

/**
 * Where the dragged card slots in, given the on-screen rects of the other cards
 * in the target column (in render order) and the pointer's y.
 *
 * This is `getDragAfterElement` with the DOM taken out: find the first card
 * whose midpoint the pointer has NOT yet passed and go above it; past every
 * midpoint, go last. Written against geometry rather than elements so it can be
 * tested without a browser, and so the rail and the columns share one rule.
 */
export function dropIndex(rects: readonly CardRect[], y: number): number {
  let closest = -Infinity
  let index = rects.length // past every midpoint → append
  rects.forEach((rect, i) => {
    const offset = y - rect.top - rect.height / 2
    if (offset < 0 && offset > closest) {
      closest = offset
      index = i
    }
  })
  return index
}

// ── Card face (§7: business name, phone, maps rating, website link) ─────────

/** The card's headline. Scraped rows set name === business, so prefer name. */
export function leadTitle(lead: Lead): string {
  return lead.name || lead.business || "Untitled lead"
}

/** The sub-line — only when the contact name and the business really differ. */
export function leadSub(lead: Lead): string {
  return lead.name && lead.business && lead.name !== lead.business
    ? lead.business
    : ""
}

/** Display form of a website: scheme and trailing slash stripped. */
export function cleanUrl(url: string): string {
  return String(url)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
}

/**
 * Href form of a website. The stored text is never rewritten — a lead typed in
 * as `kloofpanel.co.za` stays that on the card and gets a scheme only in the
 * link, because a schemeless href resolves against our own origin.
 */
export function normalizeHref(url: string): string {
  const value = String(url).trim()
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/**
 * Google Maps rating → one decimal place, or null when there isn't one.
 *
 * §7 puts the rating on the card where the old app had a Maps *link*. Null is
 * the common case today (the scraper is Phase 6; every lead is hand-added), so
 * "no rating" prints no chip rather than an empty one.
 */
export function fmtRating(rating: number | string | null | undefined): string | null {
  if (rating === null || rating === undefined || rating === "") return null
  const value = Number(rating)
  return Number.isFinite(value) ? value.toFixed(1) : null
}
