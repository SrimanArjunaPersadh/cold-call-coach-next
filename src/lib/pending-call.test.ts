import { beforeEach, describe, expect, it } from "vitest"

import { setPendingLead, takePendingLead } from "./pending-call"

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

const LEAD = { id: "11111111-2222-3333-4444-555555555555", business: "Kloof Panel & Paint" }

let store: ReturnType<typeof fakeStore>

beforeEach(() => {
  store = fakeStore()
})

describe("the Call-this-lead handoff", () => {
  it("carries the lead from the modal to Coach", () => {
    setPendingLead(LEAD, store)
    expect(takePendingLead(store)).toEqual(LEAD)
  })

  it("fires exactly once — a reloaded Coach records an UNLINKED call", () => {
    // This is the old app's behaviour preserved on purpose: `attachedLead` was a
    // module variable, so a reload lost it. A value that survived would be worse
    // than the old app — tap Call, come back tomorrow with the tab still open,
    // and the next unrelated recording attaches itself to a forgotten lead.
    setPendingLead(LEAD, store)
    expect(takePendingLead(store)).toEqual(LEAD)
    expect(takePendingLead(store)).toBeNull()
    expect(store.size()).toBe(0)
  })

  it("reads as absent when nothing was handed over", () => {
    expect(takePendingLead(store)).toBeNull()
  })

  it("stores only the two fields it needs", () => {
    setPendingLead(
      { ...LEAD, phone: "031 764 1200", notes: "secret" } as never,
      store,
    )
    expect(JSON.parse(store.getItem("ccc_pending_lead") as string)).toEqual(LEAD)
  })

  it("rejects anything malformed, and still clears it", () => {
    // The value goes on to become a lead_id in a PATCH body and a name in the
    // chip, and any script on the origin could have written this key.
    for (const raw of [
      "not json",
      "null",
      "[]",
      '"a string"',
      "{}",
      '{"id":"abc"}',
      '{"business":"Kloof"}',
      '{"id":"","business":"Kloof"}',
      '{"id":"abc","business":""}',
      '{"id":123,"business":"Kloof"}',
      '{"id":"abc","business":{"toString":1}}',
    ]) {
      store.setItem("ccc_pending_lead", raw)
      expect(takePendingLead(store), raw).toBeNull()
      expect(store.size(), `${raw} should have been cleared`).toBe(0)
    }
  })

  it("does nothing at all without a store (SSR, or storage blocked)", () => {
    expect(() => setPendingLead(LEAD, null)).not.toThrow()
    expect(takePendingLead(null)).toBeNull()
  })

  it("survives a store that throws on write", () => {
    const hostile = { ...fakeStore(), setItem: () => { throw new Error("blocked") } }
    // A failed handoff must not take the modal down with it — the call just
    // records unlinked, which the attach combobox can still fix afterwards.
    expect(() => setPendingLead(LEAD, hostile as Storage)).not.toThrow()
  })

  it("survives a store that throws on read", () => {
    const hostile = { ...fakeStore(), getItem: () => { throw new Error("blocked") } }
    expect(takePendingLead(hostile as Storage)).toBeNull()
  })
})
