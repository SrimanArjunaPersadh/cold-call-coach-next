import { describe, expect, it } from "vitest"

import {
  detectDelimiter,
  parseDelimited,
  readField,
  stripBom,
  toDelimited,
  writeField,
} from "./delimited"

// What these tests are FOR: this parser is the only thing standing between a
// file somebody else made and rows in Postgres. Every failure mode it has is
// silent — a quoted comma splits a business in half, a CRLF doubles the row
// count, a BOM makes the first header match nothing and the whole file imports
// with no business column at all. None of that throws, and none of it shows up
// in a type check; it shows up as a wrong board, days later.

describe("stripBom", () => {
  it("takes off the mark Excel writes", () => {
    expect(stripBom("﻿business,phone")).toBe("business,phone")
  })

  it("leaves a normal file alone", () => {
    expect(stripBom("business,phone")).toBe("business,phone")
  })
})

describe("detectDelimiter", () => {
  it("defaults to a comma", () => {
    expect(detectDelimiter("business,phone\nKloof,031")).toBe(",")
  })

  it("finds semicolons — the European Excel default", () => {
    expect(detectDelimiter("business;phone;notes\nKloof;031;x")).toBe(";")
  })

  it("finds tabs — what a paste out of Sheets writes", () => {
    expect(detectDelimiter("business\tphone\nKloof\t031")).toBe("\t")
  })

  it("ignores delimiters INSIDE quotes", () => {
    // Three commas, all inside one quoted header, against two real semicolons.
    // Counting naively picks comma here and shreds every row in the file.
    const header = '"business, trading, legal";phone;notes'
    expect(detectDelimiter(header)).toBe(";")
  })

  it("decides on the header line only", () => {
    // Body rows are full of commas inside quoted addresses; the header is tabs.
    const text = 'business\tphone\n"12 Main Rd, Kloof, KZN"\t031'
    expect(detectDelimiter(text)).toBe("\t")
  })

  it("reads a single-column file as a comma file", () => {
    expect(detectDelimiter("business\nKloof")).toBe(",")
  })
})

describe("parseDelimited", () => {
  it("reads headers and rows", () => {
    const table = parseDelimited("business,phone\nKloof Panel,031 764 1122")
    expect(table.headers).toEqual(["business", "phone"])
    expect(table.rows).toEqual([["Kloof Panel", "031 764 1122"]])
  })

  it("trims headers but never values", () => {
    // A header is a label and " Phone " means Phone. A value is data: a phone
    // stored with a trailing space is still that phone, and it is the mapper's
    // job to trim it, not the parser's.
    const table = parseDelimited(" business , phone \nKloof , 031 ")
    expect(table.headers).toEqual(["business", "phone"])
    expect(table.rows[0]).toEqual(["Kloof ", " 031 "])
  })

  it("keeps a quoted delimiter as data", () => {
    const table = parseDelimited('business,address\nKloof,"12 Main Rd, Kloof"')
    expect(table.rows[0]).toEqual(["Kloof", "12 Main Rd, Kloof"])
  })

  it("unescapes a doubled quote", () => {
    const table = parseDelimited('business\n"The ""Real"" Deal"')
    expect(table.rows[0]).toEqual(['The "Real" Deal'])
  })

  it("keeps a newline inside quotes inside the field", () => {
    const table = parseDelimited('business,notes\nKloof,"line one\nline two"')
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0][1]).toBe("line one\nline two")
  })

  it("ends a row on CRLF, LF or a lone CR", () => {
    expect(parseDelimited("a\r\n1\r\n2").rows).toEqual([["1"], ["2"]])
    expect(parseDelimited("a\n1\n2").rows).toEqual([["1"], ["2"]])
    expect(parseDelimited("a\r1\r2").rows).toEqual([["1"], ["2"]])
  })

  it("drops blank rows, including the trailing newline", () => {
    const table = parseDelimited("business,phone\nKloof,031\n\n\nWestville,032\n")
    expect(table.rows).toEqual([
      ["Kloof", "031"],
      ["Westville", "032"],
    ])
  })

  it("does NOT drop a row that is merely mostly empty", () => {
    const table = parseDelimited("business,phone\n,031")
    expect(table.rows).toEqual([["", "031"]])
  })

  it("pads a short row to the header width", () => {
    const table = parseDelimited("business,phone,notes\nKloof,031")
    expect(table.rows[0]).toEqual(["Kloof", "031", ""])
  })

  it("keeps a long row whole", () => {
    // Dropping the overflow would lose a column the owner can still point a
    // dropdown at — and a ragged file is usually ragged because of the header.
    const table = parseDelimited("business,phone\nKloof,031,extra")
    expect(table.rows[0]).toEqual(["Kloof", "031", "extra"])
  })

  it("reads the last row when the file has no trailing newline", () => {
    expect(parseDelimited("a,b\n1,2").rows).toEqual([["1", "2"]])
  })

  it("strips the BOM before matching headers", () => {
    expect(parseDelimited("﻿business,phone\nKloof,031").headers[0]).toBe(
      "business",
    )
  })

  it("honours an explicit delimiter over detection", () => {
    const table = parseDelimited("a;b\n1;2", ",")
    expect(table.headers).toEqual(["a;b"])
  })

  it("survives an empty file", () => {
    expect(parseDelimited("")).toEqual({ headers: [], rows: [], delimiter: "," })
  })
})

describe("writeField / readField", () => {
  it("leaves a plain value alone", () => {
    expect(writeField("Kloof Panel")).toBe("Kloof Panel")
  })

  it("quotes a value containing the delimiter, a quote or a newline", () => {
    expect(writeField("12 Main Rd, Kloof")).toBe('"12 Main Rd, Kloof"')
    expect(writeField('The "Real" Deal')).toBe('"The ""Real"" Deal"')
    expect(writeField("line one\nline two")).toBe('"line one\nline two"')
  })

  it("quotes a value with edge whitespace, which a reader would otherwise eat", () => {
    expect(writeField(" 031 ")).toBe('" 031 "')
  })

  it("guards a value Excel would run as a formula", () => {
    // The values in an export come from Google Maps via Apify — a third party —
    // into a file the owner opens in a spreadsheet.
    expect(writeField("=1+1")).toBe("'=1+1")
    expect(writeField("+27 31 764 1122")).toBe("'+27 31 764 1122")
    expect(writeField("-Panel")).toBe("'-Panel")
    expect(writeField("@home")).toBe("'@home")
  })

  it("round-trips the guard, so export → import changes nothing", () => {
    for (const value of ["=1+1", "+27 31 764 1122", "@home", "-Panel"]) {
      expect(readField(writeField(value))).toBe(value)
    }
  })

  it("round-trips a value that ALREADY starts with an apostrophe", () => {
    // Without the recursive guard this comes back as "=Kloof": the reader
    // cannot tell an apostrophe the exporter added from one the data had.
    expect(readField(writeField("'=Kloof"))).toBe("'=Kloof")
    expect(readField(writeField("'plain"))).toBe("'plain")
  })

  it("leaves an ordinary apostrophe value alone", () => {
    expect(writeField("'tis")).toBe("'tis")
    expect(readField("'tis")).toBe("'tis")
  })
})

describe("toDelimited", () => {
  it("writes CRLF rows, as RFC 4180 and Excel both expect", () => {
    expect(toDelimited([["a", "b"], ["1", "2"]])).toBe("a,b\r\n1,2")
  })

  it("round-trips through the parser", () => {
    const rows = [
      ["business", "address", "notes"],
      ["Kloof Panel", "12 Main Rd, Kloof", 'He said "call back"'],
      ["Westville Auto", "", "line one\nline two"],
    ]
    const table = parseDelimited(toDelimited(rows))
    expect(table.headers).toEqual(rows[0])
    expect(table.rows).toEqual(rows.slice(1))
  })
})
