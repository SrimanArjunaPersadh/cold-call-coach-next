import { describe, expect, it } from "vitest"

import {
  SA_LOCATIONS,
  SCRAPE_DEFAULTS,
  scrapeOutcome,
  scrapeRequest,
  type ScrapeResult,
} from "./scrape"

// What these tests are FOR: this feature spends real money per run, and its two
// client-side decisions are both invisible until they are wrong. A blank field
// that silently becomes 5 instead of 0 changes which businesses come back; a
// zero-added run painted green is a lie the owner acts on. Both are one-line
// mistakes and neither shows up in a type check.

const form = (over: Partial<Parameters<typeof scrapeRequest>[0]> = {}) => ({
  keyword: "dentist",
  location: SCRAPE_DEFAULTS.location,
  maxResults: "10",
  minReviews: "5",
  ...over,
})

describe("scrapeRequest", () => {
  it("sends the form as typed", () => {
    expect(scrapeRequest(form())).toEqual({
      keyword: "dentist",
      location: "Durban, South Africa",
      maxResults: 10,
      minReviews: 5,
    })
  })

  it("trims the keyword and the location", () => {
    const body = scrapeRequest(form({ keyword: "  panel beater  ", location: " Pinetown " }))
    expect(body.keyword).toBe("panel beater")
    expect(body.location).toBe("Pinetown")
  })

  it("sends a blank location as blank, for the route to default", () => {
    // Not "Durban, South Africa" filled in here — the route owns that default
    // (§9), and a client that pre-fills it is a second place to change it.
    expect(scrapeRequest(form({ location: "   " })).location).toBe("")
  })

  it("falls back to 10 results when the count is blank, zero or junk", () => {
    // `Number(x) || 10`, the old app's rule verbatim. A typed 0 reading as 10 is
    // deliberate: the field's min=1 says the same, and the route clamps anyway.
    expect(scrapeRequest(form({ maxResults: "" })).maxResults).toBe(10)
    expect(scrapeRequest(form({ maxResults: "0" })).maxResults).toBe(10)
    expect(scrapeRequest(form({ maxResults: "abc" })).maxResults).toBe(10)
  })

  it("passes a real count through, over and under the clamp", () => {
    // 40 goes as 40; clamping to 25 is the SERVER's job and stays there, so a
    // client that "helpfully" clamped would hide a broken clamp.
    expect(scrapeRequest(form({ maxResults: "25" })).maxResults).toBe(25)
    expect(scrapeRequest(form({ maxResults: "40" })).maxResults).toBe(40)
  })

  it("sends 5 for a blank review minimum", () => {
    expect(scrapeRequest(form({ minReviews: "" })).minReviews).toBe(5)
    expect(scrapeRequest(form({ minReviews: "  " })).minReviews).toBe(5)
  })

  it("sends a typed 0 as 0, which turns the review filter OFF", () => {
    // THE test in this file. `Number(x) || 5` passes every case above and fails
    // this one, turning "show me everything" back into "5+ reviews only".
    expect(scrapeRequest(form({ minReviews: "0" })).minReviews).toBe(0)
  })

  it("passes a raised review minimum through", () => {
    expect(scrapeRequest(form({ minReviews: "50" })).minReviews).toBe(50)
  })
})

describe("SA_LOCATIONS", () => {
  it("offers the field's own default, so the list never looks incomplete", () => {
    // The location input opens on "Durban, South Africa". A suggestion list that
    // does not contain the value already in the box reads as a list that has not
    // heard of Durban.
    expect(SA_LOCATIONS).toContain(SCRAPE_DEFAULTS.location)
  })

  it("has no duplicates", () => {
    // A repeated entry renders twice in the dropdown. Cheap to introduce while
    // editing 40 lines by hand, invisible until you see it on a phone.
    expect(new Set(SA_LOCATIONS).size).toBe(SA_LOCATIONS.length)
  })

  it("names a region on every entry", () => {
    // The actor geocodes the string as typed, and "Berea" alone is in both Durban
    // and Johannesburg. Every entry has to carry its region or the wrong city's
    // businesses come back looking perfectly correct.
    for (const location of SA_LOCATIONS) {
      expect(location, location).toMatch(/^[^,]+, .+$/)
    }
  })
})

describe("scrapeOutcome", () => {
  const outcome = (result: ScrapeResult) => scrapeOutcome(result)

  it("reports a productive run as ok", () => {
    expect(outcome({ added: 7, skipped: 3, scraped: 10, belowMin: 0 })).toEqual({
      text: "7 added, 3 duplicates skipped",
      tone: "ok",
    })
  })

  it("is WARN, never ok, when nothing was added", () => {
    // The whole point of the phase's "neutral zero-outcome toast": a correct run
    // that leaves the board unchanged does not get the same green as one that
    // filled it.
    expect(outcome({ added: 0, skipped: 10, scraped: 10 }).tone).toBe("warn")
    expect(outcome({ added: 0, skipped: 0, scraped: 10, belowMin: 10 }).tone).toBe("warn")
    // Every candidate filtered out — the all-filtered run Phase 6 verifies.
    expect(outcome({ added: 0, skipped: 0, scraped: 10, belowMin: 10 }).text).toBe(
      "0 added, 0 duplicates skipped, 10 below review minimum",
    )
  })

  it("says one duplicate, not one duplicates", () => {
    expect(outcome({ added: 4, skipped: 1 }).text).toBe("4 added, 1 duplicate skipped")
    expect(outcome({ added: 4, skipped: 2 }).text).toBe("4 added, 2 duplicates skipped")
  })

  it("mentions the review minimum only when it dropped something", () => {
    expect(outcome({ added: 2, skipped: 0, belowMin: 0 }).text).toBe(
      "2 added, 0 duplicates skipped",
    )
    expect(outcome({ added: 2, skipped: 0, belowMin: 6 }).text).toBe(
      "2 added, 0 duplicates skipped, 6 below review minimum",
    )
  })

  it("prints 0 rather than NaN or undefined for a missing count", () => {
    // A 200 body is always complete today. This is about what reaches the OWNER
    // if that ever stops being true: "0 added" is honest, "NaN added" is a bug
    // report they cannot act on.
    expect(outcome({})).toEqual({ text: "0 added, 0 duplicates skipped", tone: "warn" })
  })
})
