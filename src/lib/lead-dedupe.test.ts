import { describe, expect, it } from "vitest"

import { dedupeKey, dedupeSet, normPhone, normText } from "./lead-dedupe"

// What these tests are FOR: this rule shipped in Phase 6 inside the scrape
// route and was never tested, because it had one caller. Phase 8c gave it a
// second — CSV import — and the failure it now guards against is the one the
// owner would feel first: a spreadsheet of Durban panelbeaters that overlaps
// last week's scrape, imported clean, producing twin cards and the same number
// called twice. Moving the rule is only safe if the rule is pinned.

describe("normPhone", () => {
  it("collapses the three ways an SA number gets written", () => {
    expect(normPhone("+27 31 764 1122")).toBe("317641122")
    expect(normPhone("031 764 1122")).toBe("317641122")
    expect(normPhone("31 764 1122")).toBe("317641122")
  })

  it("ignores punctuation and spacing entirely", () => {
    expect(normPhone("(031) 764-1122")).toBe("317641122")
  })

  it("keeps a short number as it is rather than padding it", () => {
    expect(normPhone("0860 123")).toBe("0860123")
  })

  it("is empty when there are no digits at all", () => {
    expect(normPhone("no phone")).toBe("")
    expect(normPhone(null)).toBe("")
    expect(normPhone(undefined)).toBe("")
  })
})

describe("normText", () => {
  it("lowercases and collapses punctuation to single spaces", () => {
    expect(normText("Kloof  Panel-Beaters (Pty) Ltd")).toBe(
      "kloof panel beaters pty ltd",
    )
  })

  it("is empty for nothing", () => {
    expect(normText(null)).toBe("")
  })
})

describe("dedupeKey", () => {
  it("prefers the phone", () => {
    expect(dedupeKey({ phone: "031 764 1122", business: "Kloof" })).toBe(
      "p:317641122",
    )
  })

  it("matches two rows with the same phone and different names", () => {
    const a = dedupeKey({ phone: "+27317641122", business: "Kloof Panel" })
    const b = dedupeKey({ phone: "031 764 1122", business: "KLOOF PANELBEATERS" })
    expect(a).toBe(b)
  })

  it("falls back to name plus address when there is no phone", () => {
    expect(dedupeKey({ business: "Kloof Panel", address: "12 Main Rd" })).toBe(
      "n:kloof panel|12 main rd",
    )
  })

  it("prefers name over business in the fallback", () => {
    expect(dedupeKey({ name: "Thabo", business: "Kloof", address: "12 Main" })).toBe(
      "n:thabo|12 main",
    )
  })

  it("returns an empty key for a row with no identity at all", () => {
    // "" means "cannot tell", and a caller must never treat it as a match —
    // otherwise the first anonymous row swallows every one after it.
    expect(dedupeKey({})).toBe("")
    expect(dedupeKey({ phone: "", name: "", business: "", address: "" })).toBe("")
  })

  it("does not match two different rows that both have no identity", () => {
    expect(dedupeSet([{}, {}]).size).toBe(0)
  })
})

describe("dedupeSet", () => {
  it("holds one key per distinct lead", () => {
    const seen = dedupeSet([
      { phone: "031 764 1122" },
      { phone: "+27 31 764 1122" },
      { phone: "032 266 9080" },
    ])
    expect(seen.size).toBe(2)
    expect(seen.has("p:317641122")).toBe(true)
  })

  it("is empty for an empty board", () => {
    expect(dedupeSet([]).size).toBe(0)
  })
})
