// The dedup rule from STATUS §4: "loadLeads() also de-duplicates: opening the
// Leads tab, the Coach attach-combobox and the Refresh button share one in-flight
// request." Two routes in Next instead of two views of one document, so the
// sharing has to be built rather than inherited — and therefore tested.

import { describe, expect, it } from "vitest"

import type { Lead } from "./board"
import { createLeadsCache } from "./leads-cache"

const ROWS: Lead[] = [{ id: "1", business: "Kloof Panel & Paint" }]

/** A fetcher that counts its calls and only resolves when told to. */
function deferredFetcher(rows: Lead[] = ROWS) {
  let calls = 0
  let release: (() => void) | null = null
  const fetcher = () => {
    calls += 1
    return new Promise<Lead[]>((resolve) => {
      release = () => resolve(rows)
    })
  }
  return {
    fetcher,
    get calls() {
      return calls
    },
    release: () => release?.(),
  }
}

describe("createLeadsCache", () => {
  it("fetches once, then serves the cache with no second GET", async () => {
    const stub = deferredFetcher()
    const cache = createLeadsCache(stub.fetcher)

    const first = cache.load()
    stub.release()
    expect(await first).toEqual(ROWS)
    expect(stub.calls).toBe(1)

    // This is the combobox arriving after the board already loaded.
    expect(await cache.load()).toEqual(ROWS)
    expect(stub.calls).toBe(1)
  })

  it("joins an in-flight request instead of issuing a duplicate", async () => {
    const stub = deferredFetcher()
    const cache = createLeadsCache(stub.fetcher)

    // The board's mount fetch is still running when the combobox asks.
    const board = cache.load(true)
    const combo = cache.load()
    expect(stub.calls).toBe(1)

    stub.release()
    expect(await board).toEqual(ROWS)
    expect(await combo).toEqual(ROWS)
    expect(stub.calls).toBe(1)
  })

  it("joins an in-flight request even when forced", async () => {
    // A double-tapped Refresh is the same race the old app deduplicated.
    const stub = deferredFetcher()
    const cache = createLeadsCache(stub.fetcher)

    const a = cache.load(true)
    const b = cache.load(true)
    expect(stub.calls).toBe(1)

    stub.release()
    await Promise.all([a, b])
    expect(stub.calls).toBe(1)
  })

  it("refetches on force once nothing is in flight", async () => {
    const stub = deferredFetcher()
    const cache = createLeadsCache(stub.fetcher)

    const first = cache.load()
    stub.release()
    await first

    const refresh = cache.load(true)
    stub.release()
    await refresh
    expect(stub.calls).toBe(2)
  })

  it("stays retryable after a failure", async () => {
    let calls = 0
    const cache = createLeadsCache(async () => {
      calls += 1
      if (calls === 1) throw new Error("Cannot reach the server.")
      return ROWS
    })

    await expect(cache.load()).rejects.toThrow("Cannot reach the server.")
    // The in-flight promise was cleared, so the next caller really re-fetches
    // rather than awaiting a permanently rejected promise.
    expect(await cache.load()).toEqual(ROWS)
    expect(calls).toBe(2)
  })

  it("caches nothing on failure", async () => {
    const cache = createLeadsCache(async () => {
      throw new Error("nope")
    })
    await expect(cache.load()).rejects.toThrow()
    expect(cache.peek()).toBeNull()
  })

  it("peek never triggers a fetch", () => {
    const stub = deferredFetcher()
    const cache = createLeadsCache(stub.fetcher)
    expect(cache.peek()).toBeNull()
    expect(stub.calls).toBe(0)
  })

  it("serves rows the board published without fetching at all", async () => {
    // The board adds, edits or deletes a lead; the combobox must not show the
    // stale row, and must not pay for a GET to find out.
    const stub = deferredFetcher()
    const cache = createLeadsCache(stub.fetcher)

    cache.publish(ROWS)
    expect(await cache.load()).toEqual(ROWS)
    expect(stub.calls).toBe(0)
  })

  it("copies published rows, so a later board mutation cannot alias the cache", () => {
    const stub = deferredFetcher()
    const cache = createLeadsCache(stub.fetcher)
    const rows = [...ROWS]

    cache.publish(rows)
    rows.push({ id: "2", business: "Added after publishing" })
    expect(cache.peek()).toHaveLength(1)
  })

  it("reset drops the cache", async () => {
    const stub = deferredFetcher()
    const cache = createLeadsCache(stub.fetcher)

    cache.publish(ROWS)
    cache.reset()
    expect(cache.peek()).toBeNull()

    const load = cache.load()
    stub.release()
    await load
    expect(stub.calls).toBe(1)
  })
})
