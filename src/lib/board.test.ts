// Phase 4's decisions-with-a-right-answer, tested without a DOM.
//
// Same call as Phase 3: the board component is not unit-tested (no jsdom, no
// React Testing Library — deliberately not taken as a rider on this phase
// either). Every rule that HAS a right answer was pushed down into
// `src/lib/board.ts` and is pinned here: the midpoint arithmetic, the no-op
// guard, the grouping and sort, the stage list, and drop-index resolution over
// geometry.

import { describe, expect, it } from "vitest"

import {
  cleanUrl,
  dropIndex,
  fmtRating,
  groupByStage,
  isNoOpMove,
  leadSub,
  leadTitle,
  normalizeHref,
  positionForDrop,
  stageOf,
  STAGES,
  type CardRect,
  type Lead,
} from "./board"

const lead = (id: string, stage: string, position: number | null): Lead => ({
  id,
  stage,
  position,
})

// ── The midpoint rule ──────────────────────────────────────────────────────

describe("positionForDrop — midpoint of the neighbours, so one row is written", () => {
  it("alone in the column → 1000", () => {
    expect(positionForDrop([], 0)).toBe(1000)
  })

  it("dropped at the top → next − 1000", () => {
    expect(positionForDrop([5000, 6000], 0)).toBe(4000)
  })

  it("dropped at the bottom → prev + 1000", () => {
    expect(positionForDrop([5000, 6000], 2)).toBe(7000)
  })

  it("dropped in the middle → the midpoint", () => {
    expect(positionForDrop([1000, 2000, 3000], 1)).toBe(1500)
    expect(positionForDrop([1000, 2000, 3000], 2)).toBe(2500)
  })

  it("depends on the two neighbours and nothing else", () => {
    // Same neighbours either side of the slot, wildly different everywhere
    // else: the answer cannot move, or a reorder would have to renumber the
    // whole column instead of writing one row.
    expect(positionForDrop([10, 200, 300, 40], 2)).toBe(250)
    expect(positionForDrop([99999, 200, 300, -7], 2)).toBe(250)
    expect(positionForDrop([200, 300], 1)).toBe(250)
  })

  it("survives the gaps closing — a midpoint of adjacent integers is fractional", () => {
    // `position` is a float column, so this is a legal position and the next
    // drop between them just halves again. Nothing renumbers.
    expect(positionForDrop([1000, 1001], 1)).toBe(1000.5)
  })

  it("handles negatives, which repeated top-drops produce", () => {
    expect(positionForDrop([-500], 0)).toBe(-1500)
  })
})

// ── The no-op rule ─────────────────────────────────────────────────────────

describe("isNoOpMove — same stage and same position ⇒ no PATCH", () => {
  it("is a no-op when neither changed", () => {
    expect(isNoOpMove(lead("a", "new", 1000), "new", 1000)).toBe(true)
  })

  it("is a move when the stage changed", () => {
    expect(isNoOpMove(lead("a", "new", 1000), "booked", 1000)).toBe(false)
  })

  it("is a move when the position changed", () => {
    expect(isNoOpMove(lead("a", "new", 1000), "new", 1500)).toBe(false)
  })

  it("is a move when both changed", () => {
    expect(isNoOpMove(lead("a", "new", 1000), "callback", 500)).toBe(false)
  })

  it("treats a never-positioned lead as moved once it lands somewhere", () => {
    expect(isNoOpMove(lead("a", "new", null), "new", 1000)).toBe(false)
  })
})

// ── Grouping and sort ──────────────────────────────────────────────────────

describe("groupByStage — buckets by stage, ordered by position ascending", () => {
  it("sorts each bucket ascending, independently", () => {
    const groups = groupByStage([
      lead("c", "new", 3000),
      lead("a", "new", 1000),
      lead("z", "booked", 90),
      lead("b", "new", 2000),
    ])
    expect(groups.new.map((l) => l.id)).toEqual(["a", "b", "c"])
    expect(groups.booked.map((l) => l.id)).toEqual(["z"])
  })

  it("is stable — equal positions keep the order the API sent", () => {
    // GET /api/leads orders `position.asc, created_at.asc`, so ties are already
    // oldest-first when they arrive. An unstable sort would shuffle them on
    // every render, which reads as the board rearranging itself at random.
    const groups = groupByStage([
      lead("first", "new", 1000),
      lead("second", "new", 1000),
      lead("third", "new", 1000),
    ])
    expect(groups.new.map((l) => l.id)).toEqual(["first", "second", "third"])
  })

  it("returns a bucket for every stage, empty ones included", () => {
    const groups = groupByStage([])
    expect(Object.keys(groups).sort()).toEqual(STAGES.map((s) => s.key).sort())
    for (const stage of STAGES) expect(groups[stage.key]).toEqual([])
  })

  it("treats a blank stage as `new` and a missing position as 0", () => {
    const groups = groupByStage([
      lead("positioned", "", 500),
      { id: "bare" },
      lead("null-pos", "new", null),
    ])
    // Both zero-position rows sort ahead of 500, in arrival order.
    expect(groups.new.map((l) => l.id)).toEqual(["bare", "null-pos", "positioned"])
  })

  it("drops a lead whose stage is not a real stage, as the old board did", () => {
    const groups = groupByStage([lead("ghost", "archived", 1000)])
    for (const stage of STAGES) expect(groups[stage.key]).toEqual([])
  })

  it("does not mutate the array it was given", () => {
    const leads = [lead("b", "new", 2000), lead("a", "new", 1000)]
    groupByStage(leads)
    expect(leads.map((l) => l.id)).toEqual(["b", "a"])
  })
})

describe("stageOf", () => {
  it("defaults a blank stage to new", () => {
    expect(stageOf({ id: "x" })).toBe("new")
    expect(stageOf({ id: "x", stage: null })).toBe("new")
    expect(stageOf({ id: "x", stage: "" })).toBe("new")
  })

  it("passes a real stage through", () => {
    expect(stageOf({ id: "x", stage: "not_interested" })).toBe("not_interested")
  })
})

// ── The columns (§7 as amended) ────────────────────────────────────────────

describe("STAGES — six full columns, no terminal rail", () => {
  it("is the old app's six stages, in the old app's order", () => {
    // These keys are a data contract with `/api/leads`, which drops any stage
    // it does not recognise. Reordering is cosmetic; renaming is a migration.
    expect(STAGES.map((s) => s.key)).toEqual([
      "new",
      "no_answer",
      "callback",
      "interested",
      "booked",
      "not_interested",
    ])
  })

  it("puts not_interested last, as a column like any other", () => {
    // §7 amended 2026-07-29: it was a collapsed count-chip rail; every
    // professional CRM shows its lost stage as a permanent column, so it is
    // one. If a `terminal` flag ever reappears here, the rail came back with
    // it — that is a spec change, not a styling one.
    const last = STAGES[STAGES.length - 1]
    expect(last.key).toBe("not_interested")
    expect(last.label).toBe("Not interested")
    expect(Object.keys(last).sort()).toEqual(["key", "label"])
  })

  it("gives every stage a label to print", () => {
    for (const stage of STAGES) expect(stage.label.trim()).not.toBe("")
  })

  it("has no duplicate keys, so no lead can land in two columns", () => {
    expect(new Set(STAGES.map((s) => s.key)).size).toBe(STAGES.length)
  })
})

// ── Drop-index resolution, pure over geometry ──────────────────────────────

describe("dropIndex — insertion slot from the card rects and the pointer y", () => {
  // Three 100px cards stacked from y=0, so the midpoints are 50, 150, 250.
  const rects: CardRect[] = [
    { top: 0, height: 100 },
    { top: 100, height: 100 },
    { top: 200, height: 100 },
  ]

  it("goes first above the first midpoint", () => {
    expect(dropIndex(rects, 0)).toBe(0)
    expect(dropIndex(rects, 49)).toBe(0)
  })

  it("goes last below the last midpoint", () => {
    expect(dropIndex(rects, 251)).toBe(3)
    expect(dropIndex(rects, 10_000)).toBe(3)
  })

  it("lands between the cards whose midpoints straddle the pointer", () => {
    expect(dropIndex(rects, 51)).toBe(1)
    expect(dropIndex(rects, 149)).toBe(1)
    expect(dropIndex(rects, 151)).toBe(2)
  })

  it("puts the pointer exactly on a midpoint below that card", () => {
    // offset === 0 is not < 0, so the card does not claim the slot. Carried
    // over verbatim from getDragAfterElement — an inclusive test here would
    // make a card at rest under the pointer swap places with itself.
    expect(dropIndex(rects, 50)).toBe(1)
    expect(dropIndex(rects, 150)).toBe(2)
  })

  it("returns 0 for an empty column — the only slot there is", () => {
    expect(dropIndex([], 500)).toBe(0)
    expect(dropIndex([], -500)).toBe(0)
  })

  it("is unfazed by cards of different heights", () => {
    // A card with a sub-line and three chips is taller than a bare one; the
    // rule is midpoint-based, not height-based.
    const mixed: CardRect[] = [
      { top: 0, height: 40 },
      { top: 40, height: 160 },
    ]
    expect(dropIndex(mixed, 19)).toBe(0)
    expect(dropIndex(mixed, 21)).toBe(1)
    expect(dropIndex(mixed, 119)).toBe(1)
    expect(dropIndex(mixed, 121)).toBe(2)
  })

  it("ignores rects above the pointer once one below it is found", () => {
    // Guards the reduce's "least-negative offset wins" comparison: a card far
    // below must not out-rank the one directly below the pointer.
    expect(dropIndex([{ top: 0, height: 10 }, { top: 900, height: 10 }], 100)).toBe(1)
  })
})

// ── Card face helpers (§7) ─────────────────────────────────────────────────

describe("leadTitle / leadSub — one name, never printed twice", () => {
  it("prefers the contact name", () => {
    expect(leadTitle({ id: "1", name: "Thabo", business: "Kloof Panel" })).toBe("Thabo")
    expect(leadSub({ id: "1", name: "Thabo", business: "Kloof Panel" })).toBe("Kloof Panel")
  })

  it("falls back to the business when there is no contact name", () => {
    expect(leadTitle({ id: "1", business: "Kloof Panel" })).toBe("Kloof Panel")
    expect(leadSub({ id: "1", business: "Kloof Panel" })).toBe("")
  })

  it("does not repeat itself when the scraper set name === business", () => {
    const scraped = { id: "1", name: "Kloof Panel", business: "Kloof Panel" }
    expect(leadTitle(scraped)).toBe("Kloof Panel")
    expect(leadSub(scraped)).toBe("")
  })

  it("never renders a nameless card as blank", () => {
    expect(leadTitle({ id: "1" })).toBe("Untitled lead")
  })
})

describe("cleanUrl / normalizeHref — display text and href diverge on purpose", () => {
  it("strips the scheme and a trailing slash for display", () => {
    expect(cleanUrl("https://kloofpanel.co.za/")).toBe("kloofpanel.co.za")
    expect(cleanUrl("http://kloofpanel.co.za")).toBe("kloofpanel.co.za")
    expect(cleanUrl("kloofpanel.co.za/shop")).toBe("kloofpanel.co.za/shop")
  })

  it("adds a scheme to the href only — a schemeless one resolves against us", () => {
    expect(normalizeHref("kloofpanel.co.za")).toBe("https://kloofpanel.co.za")
    expect(normalizeHref("  kloofpanel.co.za  ")).toBe("https://kloofpanel.co.za")
  })

  it("leaves an absolute url alone, whatever the case of the scheme", () => {
    expect(normalizeHref("https://kloofpanel.co.za")).toBe("https://kloofpanel.co.za")
    expect(normalizeHref("HTTP://kloofpanel.co.za")).toBe("HTTP://kloofpanel.co.za")
  })

  it("leaves the stored text untouched — only the two views differ", () => {
    const stored = "kloofpanel.co.za/"
    expect(cleanUrl(stored)).toBe("kloofpanel.co.za")
    expect(normalizeHref(stored)).toBe("https://kloofpanel.co.za/")
  })
})

describe("fmtRating — the number §7 put on the card", () => {
  it("prints one decimal place", () => {
    expect(fmtRating(4.6)).toBe("4.6")
    expect(fmtRating(5)).toBe("5.0")
    expect(fmtRating("4.25")).toBe("4.3")
  })

  it("prints nothing when there is no rating, so no chip renders", () => {
    expect(fmtRating(null)).toBeNull()
    expect(fmtRating(undefined)).toBeNull()
    expect(fmtRating("")).toBeNull()
    expect(fmtRating("unrated")).toBeNull()
  })

  it("keeps a real zero — 0.0 is a rating, not a missing one", () => {
    expect(fmtRating(0)).toBe("0.0")
  })
})
