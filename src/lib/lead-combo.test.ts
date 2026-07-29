import { describe, expect, it } from "vitest"

import type { Lead } from "./board"
import {
  COMBO_LIMIT,
  filterLeads,
  leadBusinessName,
  nextActiveIndex,
} from "./lead-combo"

const lead = (over: Partial<Lead> & { id: string }): Lead => ({
  business: null,
  name: null,
  phone: null,
  ...over,
})

const LEADS: Lead[] = [
  lead({ id: "1", business: "Kloof Panel & Paint", phone: "031 764 1200" }),
  lead({ id: "2", business: "Auxiliary Plumbers", phone: "+27 82 555 0110" }),
  lead({ id: "3", business: "Westville Autobody", name: "Sipho Ndlovu", phone: "0312001234" }),
  lead({ id: "4", business: null, name: "Walk-in enquiry", phone: null }),
]

describe("filterLeads", () => {
  it("lists everything on an empty query", () => {
    // The menu opens on focus. An empty list on first tap would read as "you
    // have no leads", which is a claim about the data.
    expect(filterLeads(LEADS, "").map((l) => l.id)).toEqual(["1", "2", "3", "4"])
    expect(filterLeads(LEADS, "   ").map((l) => l.id)).toEqual(["1", "2", "3", "4"])
  })

  it("matches on business, case-insensitively, mid-string", () => {
    expect(filterLeads(LEADS, "kloof").map((l) => l.id)).toEqual(["1"])
    expect(filterLeads(LEADS, "PANEL").map((l) => l.id)).toEqual(["1"])
    expect(filterLeads(LEADS, "plumb").map((l) => l.id)).toEqual(["2"])
  })

  it("matches on phone", () => {
    expect(filterLeads(LEADS, "764").map((l) => l.id)).toEqual(["1"])
    expect(filterLeads(LEADS, "0312001234").map((l) => l.id)).toEqual(["3"])
  })

  it("matches phone as stored, not normalised", () => {
    // "+27 82 555 0110" is not found by typing the local form. Normalising is
    // the scraper's dedup trick (STATUS §1), not this control's job.
    expect(filterLeads(LEADS, "082 555").map((l) => l.id)).toEqual([])
    expect(filterLeads(LEADS, "82 555").map((l) => l.id)).toEqual(["2"])
  })

  it("matches on contact name too", () => {
    expect(filterLeads(LEADS, "sipho").map((l) => l.id)).toEqual(["3"])
    expect(filterLeads(LEADS, "walk-in").map((l) => l.id)).toEqual(["4"])
  })

  it("returns nothing when nothing matches — the 'No leads match.' state", () => {
    expect(filterLeads(LEADS, "zzzz")).toEqual([])
  })

  it("preserves board order rather than ranking relevance", () => {
    // "a" hits all four. They come back in the order the board holds them, so a
    // prefix match does not float above a mid-string one.
    expect(filterLeads(LEADS, "a").map((l) => l.id)).toEqual(["1", "2", "3", "4"])
  })

  it("ignores a null business/name/phone without throwing", () => {
    expect(filterLeads([lead({ id: "x" })], "anything")).toEqual([])
  })

  it(`caps both branches at ${COMBO_LIMIT}`, () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      lead({ id: String(i), business: `Business ${i}` }),
    )
    expect(filterLeads(many, "")).toHaveLength(COMBO_LIMIT)
    expect(filterLeads(many, "business")).toHaveLength(COMBO_LIMIT)
  })

  it("does not mutate the input", () => {
    const rows = [...LEADS]
    filterLeads(rows, "kloof")
    expect(rows.map((l) => l.id)).toEqual(["1", "2", "3", "4"])
  })
})

describe("leadBusinessName — business first, unlike the card's title", () => {
  it("prefers the business", () => {
    // board.ts's leadTitle would say "Sipho Ndlovu" here; this surface names the
    // company, which is what STATUS §4's "Linked to <business>." promises.
    expect(leadBusinessName(LEADS[2])).toBe("Westville Autobody")
  })

  it("falls back to the contact name", () => {
    expect(leadBusinessName(LEADS[3])).toBe("Walk-in enquiry")
  })

  it("never renders an empty chip", () => {
    expect(leadBusinessName(lead({ id: "x" }))).toBe("Untitled lead")
  })
})

describe("nextActiveIndex — clamps at both ends, never wraps", () => {
  it("moves down and stops at the last row", () => {
    expect(nextActiveIndex(-1, 1, 3)).toBe(0)
    expect(nextActiveIndex(0, 1, 3)).toBe(1)
    expect(nextActiveIndex(2, 1, 3)).toBe(2)
  })

  it("moves up and stops at the first row", () => {
    expect(nextActiveIndex(2, -1, 3)).toBe(1)
    expect(nextActiveIndex(0, -1, 3)).toBe(0)
  })

  it("highlights the first row on ArrowUp from nothing", () => {
    // max(-1 - 1, 0) → 0. Falls out of the old app's Math.max and is the useful
    // behaviour: either arrow key gets you into the list.
    expect(nextActiveIndex(-1, -1, 3)).toBe(0)
  })

  it("has nothing to highlight in an empty list", () => {
    expect(nextActiveIndex(-1, 1, 0)).toBe(-1)
    expect(nextActiveIndex(-1, -1, 0)).toBe(-1)
  })
})
