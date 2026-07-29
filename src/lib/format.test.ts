// mm:ss is quoted in the plan's copy ("0:19 of 0:33 in turns"), so it is pinned
// here rather than left to a component.

import { describe, expect, it } from "vitest"

import { fmtSize, fmtTime } from "./format"

describe("fmtTime — m:ss", () => {
  it("pads the seconds to two digits", () => {
    expect(fmtTime(0)).toBe("0:00")
    expect(fmtTime(5)).toBe("0:05")
    expect(fmtTime(19.7)).toBe("0:19")
  })

  it("rolls over at 60 seconds", () => {
    expect(fmtTime(59.9)).toBe("0:59")
    expect(fmtTime(60)).toBe("1:00")
    expect(fmtTime(61)).toBe("1:01")
    expect(fmtTime(33.8)).toBe("0:33")
  })

  it("keeps counting past an hour rather than wrapping", () => {
    // A long call reads 63:20, not 3:20 — this is a call timer, not a clock.
    expect(fmtTime(3800)).toBe("63:20")
  })

  it("floors rather than rounds, so the timer never shows time not yet elapsed", () => {
    expect(fmtTime(1.99)).toBe("0:01")
  })

  it("degrades to 0:00 on junk rather than printing NaN", () => {
    expect(fmtTime(Number.NaN)).toBe("0:00")
  })
})

describe("fmtSize", () => {
  it("uses whole KB below a megabyte", () => {
    expect(fmtSize(0)).toBe("0 KB")
    expect(fmtSize(1024)).toBe("1 KB")
    expect(fmtSize(1048575)).toBe("1024 KB")
  })

  it("switches to one-decimal MB at a megabyte", () => {
    expect(fmtSize(1048576)).toBe("1.0 MB")
    expect(fmtSize(3_500_000)).toBe("3.3 MB")
  })
})
