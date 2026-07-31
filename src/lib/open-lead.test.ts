import { beforeEach, describe, expect, it } from "vitest"

import { setOpenLead, takeOpenLead } from "./open-lead"

/** The three Storage methods this module touches. Bare Node has no sessionStorage. */
function fakeStore(): Storage & { size: () => number } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
    size: () => map.size,
  }
}

const LEAD_ID = "11111111-2222-3333-4444-555555555555"

let store: ReturnType<typeof fakeStore>

beforeEach(() => {
  store = fakeStore()
})

describe("the dashboard hero → lead handoff (Phase 7)", () => {
  it("carries the lead id from the dashboard to the board", () => {
    setOpenLead(LEAD_ID, store)
    expect(takeOpenLead(store)).toBe(LEAD_ID)
  })

  it("FIRES EXACTLY ONCE — otherwise every later visit to /leads reopens that modal", () => {
    setOpenLead(LEAD_ID, store)
    expect(takeOpenLead(store)).toBe(LEAD_ID)
    expect(takeOpenLead(store)).toBeNull()
    expect(store.size()).toBe(0)
  })

  it("reads as absent when nothing was handed over", () => {
    expect(takeOpenLead(store)).toBeNull()
  })

  it("uses its own key, so it cannot collide with the Call-this-lead handoff", () => {
    setOpenLead(LEAD_ID, store)
    expect(store.getItem("ccc_open_lead")).toBe(LEAD_ID)
    expect(store.getItem("ccc_pending_lead")).toBeNull()
  })

  it("rejects an empty id on the way in — there is nothing to open", () => {
    setOpenLead("", store)
    expect(store.size()).toBe(0)
  })

  it("rejects an empty stored value, and still clears it", () => {
    // Any script on the origin could have written this key, and the value decides
    // which lead's details and call history go on screen.
    store.setItem("ccc_open_lead", "")
    expect(takeOpenLead(store)).toBeNull()
    expect(store.size()).toBe(0)
  })

  it("does nothing at all without a store (SSR, or storage blocked)", () => {
    expect(() => setOpenLead(LEAD_ID, null)).not.toThrow()
    expect(takeOpenLead(null)).toBeNull()
  })

  it("survives a store that throws on write — /leads still opens, just without the modal", () => {
    const hostile = {
      ...fakeStore(),
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(() => setOpenLead(LEAD_ID, hostile as Storage)).not.toThrow()
  })

  it("survives a store that throws on read", () => {
    const hostile = {
      ...fakeStore(),
      getItem: () => {
        throw new Error("blocked")
      },
    }
    expect(takeOpenLead(hostile as Storage)).toBeNull()
  })
})
