// ══ The attach-to-lead combobox, minus the DOM (Phase 5) ═════════════════════
//
// The searchable dropdown's decisions — what matches, how far the list runs, and
// where the arrow keys land — as pure functions. The component next door owns the
// blur-before-click semantics and the click-outside listener, which need a real
// document; everything here is testable in bare Node.
//
// Ported behaviour-identical from `setupLeadCombo` (index.html:1723–1794).

import type { Lead } from "./board"

/**
 * The old app's `.slice(0, 50)`, on both the filtered and the unfiltered branch.
 *
 * It matters more than it looks: `GET /api/leads` is unbounded (STATUS §7,
 * inherited knowingly), so this is the only thing standing between a grown board
 * and a dropdown that renders every row it owns. Fine at solo scale either way.
 */
export const COMBO_LIMIT = 50

/**
 * The name THIS feature calls a lead: business first.
 *
 * Deliberately NOT `board.ts`'s `leadTitle`, which is name-first because §7's
 * card face wants the contact you are about to ask for. This is the old app's own
 * `leadTitle` (index.html:1689), and it is what STATUS §4's acceptance copy
 * promises: "Linked to <business>." On scraped rows the two agree — the scraper
 * sets `name === business` — so they only diverge on a hand-added lead with a
 * distinct contact name, and there the linked-call chip should name the company.
 */
export function leadBusinessName(lead: Lead): string {
  return lead.business || lead.name || "Untitled lead"
}

/**
 * The leads a query matches, in board order.
 *
 * Filter, not rank — and the name says so. The old app preserved `crm.leads`
 * order (`stage.asc, position.asc, created_at.asc` as the API sent it) and did
 * not score relevance, so a prefix match does not float above a mid-string one.
 * Carried over as-is: with a handful of leads, board order is the order the owner
 * already has in their head, and a relevance sort would move rows for no gain.
 *
 * An empty query lists everything (capped) rather than nothing, because the
 * control opens on focus — an empty menu on first tap reads as "no leads",
 * which is a claim about the data.
 *
 * Matches `business`, `name` or `phone`, case-insensitively, as a substring.
 * Phone is matched raw, so the digits have to be typed the way they are stored;
 * normalising them is the scraper's dedup trick (STATUS §1) and is not this
 * control's job.
 */
export function filterLeads(
  leads: readonly Lead[],
  query: string,
): Lead[] {
  const q = String(query ?? "").trim().toLowerCase()
  if (!q) return leads.slice(0, COMBO_LIMIT)
  return leads
    .filter((lead) =>
      [lead.business, lead.name, lead.phone].some(
        (value) => value && String(value).toLowerCase().includes(q),
      ),
    )
    .slice(0, COMBO_LIMIT)
}

/**
 * Where the active row goes on an arrow key. `active` is -1 for "nothing
 * highlighted", which is the state the menu opens in and returns to on every
 * keystroke.
 *
 * Both ends CLAMP rather than wrap — the old app's `Math.min` / `Math.max`. Note
 * the asymmetry that falls out of it, which is deliberate and useful: ArrowUp
 * from -1 is `max(-2, 0)` → 0, so the first press of either arrow highlights the
 * first row. An empty list has nothing to highlight and stays at -1.
 */
export function nextActiveIndex(
  active: number,
  direction: 1 | -1,
  count: number,
): number {
  if (count <= 0) return -1
  return direction === 1
    ? Math.min(active + 1, count - 1)
    : Math.max(active - 1, 0)
}
