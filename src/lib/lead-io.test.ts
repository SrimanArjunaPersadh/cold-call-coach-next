import { describe, expect, it } from "vitest"

import { parseDelimited } from "./delimited"
import {
  autoMap,
  chunk,
  draftRows,
  EXPORT_COLUMNS,
  exportFilename,
  IMPORT_LIMIT,
  importOutcome,
  isWorkbook,
  normaliseStage,
  readTable,
  toLeadCsv,
} from "./lead-io"
import type { Lead } from "./board"

// What these tests are FOR: §3 cut CSV import once already for being
// "disproportionately complex", and the complexity it meant is all in this
// file — which column is which, which row is worth keeping, and what the toast
// says afterwards. Every one of those is invisible when it is wrong: a mapping
// that points `business` at the notes column imports 200 leads whose names are
// paragraphs, and nothing on screen says so until the board is already full.

describe("autoMap", () => {
  it("matches the obvious headers", () => {
    expect(autoMap(["Business", "Phone", "Website"])).toEqual({
      business: 0,
      phone: 1,
      website: 2,
    })
  })

  it("normalises punctuation and case", () => {
    expect(autoMap(["BUSINESS_NAME", "Phone #", "Web Site"])).toEqual({
      business: 0,
      phone: 1,
      website: 2,
    })
  })

  it("matches a header written with no spaces at all", () => {
    expect(autoMap(["CompanyName", "PhoneNumber"])).toEqual({
      business: 0,
      phone: 1,
    })
  })

  it("puts the company in business and the person in name", () => {
    const mapping = autoMap(["Company Name", "Contact Person", "Tel"])
    expect(mapping).toEqual({ business: 0, name: 1, phone: 2 })
  })

  it("promotes a lone Name column to business", () => {
    // The commonest file in the world, and without this fixup every row of it
    // is skipped for having no business — a correct, useless import of zero.
    expect(autoMap(["Name", "Phone"])).toEqual({ business: 0, phone: 1 })
  })

  it("does NOT promote name when a business column already exists", () => {
    const mapping = autoMap(["Name", "Business", "Phone"])
    expect(mapping.business).toBe(1)
    expect(mapping.name).toBe(0)
  })

  it("never maps two fields to one column", () => {
    const mapping = autoMap(["Name", "Phone"])
    const used = Object.values(mapping)
    expect(new Set(used).size).toBe(used.length)
  })

  it("ignores an email column entirely (§10: no email fields)", () => {
    const mapping = autoMap(["Business", "Email", "Phone"])
    expect(mapping).toEqual({ business: 0, phone: 2 })
    expect(Object.values(mapping)).not.toContain(1)
  })

  it("leaves unrecognised headers unmapped rather than guessing", () => {
    const mapping = autoMap(["Business", "Phone", "Lead Score", "Assigned To"])
    expect(mapping).toEqual({ business: 0, phone: 1 })
  })

  it("maps nothing from an empty header row", () => {
    expect(autoMap([])).toEqual({})
  })

  it("round-trips its own export headers exactly", () => {
    const mapping = autoMap([...EXPORT_COLUMNS])
    for (const [i, column] of EXPORT_COLUMNS.entries()) {
      expect(mapping[column]).toBe(i)
    }
  })
})

describe("normaliseStage", () => {
  it("accepts the stage keys the board stores", () => {
    expect(normaliseStage("not_interested")).toBe("not_interested")
    expect(normaliseStage("no_answer")).toBe("no_answer")
  })

  it("accepts the labels the board prints", () => {
    expect(normaliseStage("Call back")).toBe("callback")
    expect(normaliseStage("Booked meeting")).toBe("booked")
    expect(normaliseStage("No answer / VM")).toBe("no_answer")
  })

  it("accepts what another CRM would have called it", () => {
    expect(normaliseStage("Lost")).toBe("not_interested")
    expect(normaliseStage("Won")).toBe("booked")
    expect(normaliseStage("Follow up")).toBe("callback")
    expect(normaliseStage("Voicemail")).toBe("no_answer")
  })

  it("is case and punctuation blind", () => {
    expect(normaliseStage("  NOT INTERESTED  ")).toBe("not_interested")
  })

  it("returns null for a word that means nothing here", () => {
    expect(normaliseStage("Nurture")).toBeNull()
    expect(normaliseStage("")).toBeNull()
  })
})

const table = (text: string) => parseDelimited(text)

describe("draftRows", () => {
  it("builds one draft per complete row", () => {
    const parsed = table("business,phone\nKloof Panel,031 764 1122")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts).toEqual([
      { business: "Kloof Panel", phone: "031 764 1122" },
    ])
    expect(result.skipped).toBe(0)
  })

  it("trims values the parser deliberately left alone", () => {
    const parsed = table("business,phone\n  Kloof Panel  ,  031 764 1122  ")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts[0]).toEqual({
      business: "Kloof Panel",
      phone: "031 764 1122",
    })
  })

  it("skips a row with no phone, and says how many", () => {
    const parsed = table("business,phone\nKloof,031\nNo Phone Ltd,\nWestville,032")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts).toHaveLength(2)
    expect(result.skipped).toBe(1)
  })

  it("skips a row with no business and no contact name to borrow", () => {
    const parsed = table("business,name,phone\n,,031")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it("falls back to the contact name per row when business is blank", () => {
    const parsed = table("business,name,phone\n,Thabo Mchunu,031")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts[0].business).toBe("Thabo Mchunu")
    expect(result.drafts[0].name).toBe("Thabo Mchunu")
  })

  it("omits empty optional fields rather than sending empty strings", () => {
    const parsed = table("business,phone,website,notes\nKloof,031,,")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts[0]).toEqual({ business: "Kloof", phone: "031" })
  })

  it("sends a rating only when it is a number", () => {
    const parsed = table("business,phone,rating\nKloof,031,4.6\nWestville,032,N/A")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts[0].maps_rating).toBe("4.6")
    expect(result.drafts[1].maps_rating).toBeUndefined()
  })

  it("normalises a recognised stage", () => {
    const parsed = table("business,phone,status\nKloof,031,Lost")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts[0].stage).toBe("not_interested")
    expect(result.stageFallbacks).toBe(0)
  })

  it("counts an unrecognised stage instead of refusing the row", () => {
    const parsed = table("business,phone,status\nKloof,031,Nurture")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts[0].stage).toBeUndefined()
    expect(result.drafts[0].business).toBe("Kloof")
    expect(result.stageFallbacks).toBe(1)
  })

  it("reads only the columns the mapping points at", () => {
    // The owner re-pointed business at column 1. Column 0 must not leak in.
    const parsed = table("notes,company,phone\nignore me,Kloof,031")
    const result = draftRows(parsed, { business: 1, phone: 2 })
    expect(result.drafts[0]).toEqual({ business: "Kloof", phone: "031" })
  })

  it("survives a mapping that points past a short row", () => {
    const parsed = table("business,phone,notes\nKloof,031")
    const result = draftRows(parsed, { business: 0, phone: 1, notes: 9 })
    expect(result.drafts[0]).toEqual({ business: "Kloof", phone: "031" })
  })

  it("keeps the file's order, because the file's order becomes the board's", () => {
    const parsed = table("business,phone\nA,1\nB,2\nC,3")
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts.map((d) => d.business)).toEqual(["A", "B", "C"])
  })
})

describe("chunk", () => {
  it("splits at the server's cap", () => {
    const items = Array.from({ length: IMPORT_LIMIT * 2 + 3 }, (_, i) => i)
    const parts = chunk(items)
    expect(parts).toHaveLength(3)
    expect(parts[0]).toHaveLength(IMPORT_LIMIT)
    expect(parts[2]).toHaveLength(3)
  })

  it("leaves a small list as one batch", () => {
    expect(chunk([1, 2, 3])).toEqual([[1, 2, 3]])
  })

  it("returns nothing for nothing", () => {
    expect(chunk([])).toEqual([])
  })
})

describe("isWorkbook", () => {
  it("catches the extensions", () => {
    expect(isWorkbook("leads.xlsx", "")).toBe(true)
    expect(isWorkbook("LEADS.XLS", "")).toBe(true)
    expect(isWorkbook("leads.numbers", "")).toBe(true)
  })

  it("catches a workbook renamed to .csv, by its magic bytes", () => {
    expect(isWorkbook("leads.csv", "PK ")).toBe(true)
    expect(isWorkbook("old.csv", "ÐÏà")).toBe(true)
  })

  it("lets real delimited text through", () => {
    expect(isWorkbook("leads.csv", "business,phone")).toBe(false)
    expect(isWorkbook("leads.txt", "business\tphone")).toBe(false)
  })
})

describe("toLeadCsv", () => {
  const LEAD: Lead = {
    // A distinctive id, so "never writes an id" cannot pass or fail by
    // accident: "1" is a substring of every phone number in this file.
    id: "a7f3c9e2-lead-id",
    business: "Kloof Panel",
    name: "Thabo Mchunu",
    phone: "031 764 1122",
    website: "kloofpanel.co.za",
    address: "12 Main Rd, Kloof",
    stage: "callback",
    maps_rating: 4.6,
    notes: 'He said "call back"',
  }

  it("writes the header row first", () => {
    expect(toLeadCsv([]).split("\r\n")[0]).toBe(EXPORT_COLUMNS.join(","))
  })

  it("never writes an id — an export is a list, not a backup", () => {
    expect(toLeadCsv([LEAD])).not.toContain(LEAD.id)
    expect(EXPORT_COLUMNS).not.toContain("id" as never)
  })

  it("never writes an email column (§10)", () => {
    expect(EXPORT_COLUMNS).not.toContain("email" as never)
  })

  it("prints a missing field as empty, not as null", () => {
    const row = toLeadCsv([{ id: "2", business: "X", phone: "1" }]).split("\r\n")[1]
    expect(row).not.toContain("null")
    expect(row).not.toContain("undefined")
  })

  it("round-trips a board back into the same drafts", () => {
    // The point of matching EXPORT_COLUMNS to the importer's field keys:
    // export → edit in Excel → import has to land the same values.
    const parsed = readTable(toLeadCsv([LEAD]))
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.skipped).toBe(0)
    expect(result.drafts[0]).toEqual({
      business: "Kloof Panel",
      name: "Thabo Mchunu",
      phone: "031 764 1122",
      website: "kloofpanel.co.za",
      address: "12 Main Rd, Kloof",
      stage: "callback",
      maps_rating: "4.6",
      notes: 'He said "call back"',
    })
  })

  it("round-trips a phone written in +27 form through the formula guard", () => {
    const parsed = readTable(
      toLeadCsv([{ id: "3", business: "Kloof", phone: "+27 31 764 1122" }]),
    )
    const result = draftRows(parsed, autoMap(parsed.headers))
    expect(result.drafts[0].phone).toBe("+27 31 764 1122")
  })
})

describe("exportFilename", () => {
  it("stamps the LOCAL date", () => {
    // 2026-01-04T01:00 local. An ISO-UTC slice in SAST would name this the 3rd.
    expect(exportFilename(new Date(2026, 0, 4, 1, 0))).toBe("leads-2026-01-04.csv")
  })

  it("pads single digits", () => {
    expect(exportFilename(new Date(2026, 8, 5, 12))).toBe("leads-2026-09-05.csv")
  })
})

describe("importOutcome", () => {
  const tally = (over: Partial<Parameters<typeof importOutcome>[0]> = {}) => ({
    imported: 0,
    duplicates: 0,
    skipped: 0,
    stageFallbacks: 0,
    ...over,
  })

  it("is a success only when something was actually added", () => {
    expect(importOutcome(tally({ imported: 12 })).tone).toBe("ok")
  })

  it("is NEUTRAL when a correct run added nothing", () => {
    // A file of 200 leads you already have is a correct import that changes
    // nothing. Green here teaches the owner to stop reading toasts.
    expect(importOutcome(tally({ duplicates: 200 })).tone).toBe("warn")
  })

  it("reports every count it was given", () => {
    const outcome = importOutcome(
      tally({ imported: 140, duplicates: 2, skipped: 3, stageFallbacks: 1 }),
    )
    expect(outcome.text).toBe(
      "140 leads added, 2 duplicates skipped, 3 rows incomplete, 1 into New",
    )
  })

  it("stays quiet about the counts that are zero", () => {
    expect(importOutcome(tally({ imported: 1 })).text).toBe("1 lead added")
  })

  it("gets its plurals right", () => {
    expect(importOutcome(tally({ imported: 1, duplicates: 1, skipped: 1 })).text).toBe(
      "1 lead added, 1 duplicate skipped, 1 row incomplete",
    )
  })
})
