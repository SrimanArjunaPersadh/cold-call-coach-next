// ══ The scraper's decisions, minus the DOM (Phase 6) ═════════════════════════
//
// `POST /api/scrape` shipped in Phase 1 and is untouched here: the 25-result
// clamp, the phone-first dedup and the minReviews default all live server-side
// and this file must never re-implement any of them. What lives here is the
// three client-side decisions the old app made in its submit handler — what the
// form sends, what the zero-result run says, and what the outcome toast reads —
// as pure functions, so the copy contract is a test rather than a comment.
//
// Ported behaviour-identical from index.html's `scrapeEls.form` submit handler
// (index.html:2738–2802). The route it posts to was renamed `/api/scrape-leads`
// → `/api/scrape` in Phase 1 (§9); nothing else about the exchange changed.

import type { Lead } from "./board"

/**
 * The form's starting values, and the fallbacks for a field left blank.
 *
 * These are the OLD FORM's defaults, and they exist here as well as on the
 * server on purpose: `location` and `minReviews` blank are legal requests the
 * route fills in itself (Durban, 5), while `maxResults` blank is a number the
 * form has to pick because the route's clamp only bounds it (1–25) and would
 * otherwise read `Number(undefined) || 10` — the same 10, but decided in the
 * wrong place. The form is where "how many by default" belongs.
 */
export const SCRAPE_DEFAULTS = {
  location: "Durban, South Africa",
  maxResults: 10,
  minReviews: 5,
} as const

/**
 * Location suggestions for the form's `<datalist>` (added 2026-07-30 at the
 * owner's request, after the first Phase 6 build).
 *
 * WHY A HARDCODED LIST AND NOT AN API. Google Places Autocomplete would suggest
 * every place on earth; it also wants a second paid dependency, a new env var and
 * a route, billed per keystroke on a tool whose only other cost is one Apify run
 * per scrape. That is a §3 amendment and its own phase, not a form tweak. This
 * covers the real use — the field defaults to Durban because that is where the
 * calling happens — and the input stays FREE TEXT, so an area that is not on this
 * list is still typeable and still searchable. The list can only save keystrokes;
 * it can never block a search.
 *
 * FORMAT MATTERS: every entry carries its region, because the actor geocodes the
 * string as typed and half of these suburb names exist twice in South Africa
 * (Berea and Morningside are in both Durban and Johannesburg). KwaZulu-Natal
 * first — that is the nearest work — then the national metros.
 */
export const SA_LOCATIONS: readonly string[] = [
  "Durban, South Africa",
  "Umhlanga, KwaZulu-Natal",
  "Umdloti, KwaZulu-Natal",
  "Ballito, KwaZulu-Natal",
  "Durban North, KwaZulu-Natal",
  "Mount Edgecombe, KwaZulu-Natal",
  "Morningside, KwaZulu-Natal",
  "Berea, KwaZulu-Natal",
  "Glenwood, KwaZulu-Natal",
  "Musgrave, KwaZulu-Natal",
  "Westville, KwaZulu-Natal",
  "Pinetown, KwaZulu-Natal",
  "New Germany, KwaZulu-Natal",
  "Kloof, KwaZulu-Natal",
  "Gillitts, KwaZulu-Natal",
  "Hillcrest, KwaZulu-Natal",
  "Waterfall, KwaZulu-Natal",
  "Bluff, KwaZulu-Natal",
  "Amanzimtoti, KwaZulu-Natal",
  "Kingsburgh, KwaZulu-Natal",
  "Chatsworth, KwaZulu-Natal",
  "Phoenix, KwaZulu-Natal",
  "Verulam, KwaZulu-Natal",
  "Tongaat, KwaZulu-Natal",
  "Pietermaritzburg, South Africa",
  "Howick, KwaZulu-Natal",
  "Scottburgh, KwaZulu-Natal",
  "Port Shepstone, KwaZulu-Natal",
  "Margate, KwaZulu-Natal",
  "Richards Bay, South Africa",
  "Empangeni, KwaZulu-Natal",
  "Newcastle, KwaZulu-Natal",
  "Ladysmith, KwaZulu-Natal",
  "Johannesburg, South Africa",
  "Sandton, South Africa",
  "Midrand, South Africa",
  "Pretoria, South Africa",
  "Cape Town, South Africa",
  "Stellenbosch, South Africa",
  "Gqeberha, South Africa",
  "East London, South Africa",
  "Bloemfontein, South Africa",
  "Mbombela, South Africa",
  "Polokwane, South Africa",
]

/** What the modal posts. Every field is bounded again by the route. */
export type ScrapeRequest = {
  keyword: string
  location: string
  maxResults: number
  minReviews: number
}

/** `POST /api/scrape`'s 200 body. Counts only — never a total the client sums. */
export type ScrapeResult = {
  leads?: Lead[] | null
  /** Rows actually inserted. 0 is the neutral outcome, not a success. */
  added?: number
  /** Candidates already on the board (phone-first dedup, server-side). */
  skipped?: number
  /** Raw places the actor returned. 0 means the SEARCH found nothing. */
  scraped?: number
  /** Candidates dropped under the review minimum. */
  belowMin?: number
}

/**
 * `scraped === 0` — the actor ran and Maps had nothing. Verbatim from the old
 * app. This is the EMPTY state (§4.4) and it is deliberately not the zero-added
 * toast: nothing was searched successfully, so the modal stays open with the
 * keyword still in it and the next attempt is an edit, not a re-entry.
 */
export const SCRAPE_NO_RESULTS =
  "No businesses found. Try different words or another location."

/** The generic failure, for a body that carried no `error` of its own. */
export const SCRAPE_FAILED = "Search failed. Please try again."

/**
 * Form strings → the request body.
 *
 * Three rules, all the old app's, all preserved verbatim:
 *   · `keyword` and `location` are trimmed; a blank location lets the ROUTE
 *     apply its own default, which is where that default belongs.
 *   · `Number(maxResults) || 10` — so 0, blank and non-numeric all read as 10.
 *     Yes, this means a typed 0 becomes 10 rather than an error; the field's
 *     `min=1` says the same thing, and the route clamps to 1–25 regardless.
 *   · a blank `minReviews` sends 5, but a typed **0** sends 0 and DISABLES the
 *     filter. `Number(x) || 5` would have quietly turned that 0 back into 5,
 *     which is why the blank check is a string check and not a falsy check.
 */
export function scrapeRequest(fields: {
  keyword: string
  location: string
  maxResults: string
  minReviews: string
}): ScrapeRequest {
  return {
    keyword: fields.keyword.trim(),
    location: fields.location.trim(),
    maxResults: Number(fields.maxResults) || SCRAPE_DEFAULTS.maxResults,
    minReviews:
      fields.minReviews.trim() === ""
        ? SCRAPE_DEFAULTS.minReviews
        : Number(fields.minReviews),
  }
}

/**
 * The outcome toast — the "neutral zero-outcome toast" §3 names as part of this
 * feature, and the reason this function exists as a tested unit at all.
 *
 * **A run that added nothing is not a success, whatever the filters did.** Two
 * duplicates skipped and five below the review minimum is a perfectly correct
 * run that leaves the board exactly as it was, and dressing that in the same
 * green as a run that produced leads teaches the owner to stop reading toasts.
 * So: `--warn` at `added === 0`, `--pass` above it (§4.1 — warn is "neutral
 * outcome", and this is the case it was reserved for).
 *
 * The counts are the SERVER's (§6: the model does no arithmetic and neither does
 * this — nothing here sums or derives a figure, it only reads and prints).
 */
export function scrapeOutcome(result: ScrapeResult): {
  text: string
  tone: "ok" | "warn"
} {
  const added = Number(result.added) || 0
  const skipped = Number(result.skipped) || 0
  const belowMin = Number(result.belowMin) || 0
  return {
    text:
      `${added} added, ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` +
      (belowMin ? `, ${belowMin} below review minimum` : ""),
    tone: added === 0 ? "warn" : "ok",
  }
}
