// ══ One in-flight leads request, however many callers ask (Phase 5) ══════════
//
// WHY THIS EXISTS. In the old app Coach and Leads were two views of ONE
// document, so `revealAttach` could read `crm.leads` directly and `loadLeads()`
// deduplicated the Leads tab, the attach combobox and Refresh into a single GET
// (STATUS §4, "loadLeads() also de-duplicates"). Here they are two routes, and
// `LeadsBoard`'s in-flight ref is unmounted while Coach is on screen — so the
// combobox would fire a second GET for rows the board already has.
//
// A module-level cache is the closest translation: Next keeps the module registry
// alive across client-side navigation, so /leads → /coach reuses the board's
// result, exactly as `crm.leads` did. It is also what the old app's cache
// semantics were — `if (!crm.loaded) await loadLeads()`, with Refresh as the only
// invalidation.
//
// WHAT IT DELIBERATELY DOES NOT CHANGE: the board still forces a fetch on mount,
// so Phase 4's observable load behaviour (skeletons, then rows) is untouched. The
// cache is something the board PUBLISHES INTO and the combobox READS FROM.

import type { Lead } from "./board"
import { leadsApi } from "./leads-api"

type Fetcher = () => Promise<Lead[]>

export type LeadsCache = {
  /**
   * The leads, fetching only if it has to. `force` ignores the cached rows but
   * still joins an in-flight request — a second caller must never issue a
   * duplicate GET, which is the entire point of this module.
   */
  load(force?: boolean): Promise<Lead[]>
  /** Replace the cached rows after a local mutation (add / edit / delete). */
  publish(leads: readonly Lead[]): void
  /** The cached rows without triggering a fetch. Null = never loaded. */
  peek(): Lead[] | null
  /** Drop everything. Tests, and nothing else. */
  reset(): void
}

/**
 * Built as a factory over an injected fetcher so the dedup logic can be tested
 * against a counting stub, with no globals to reset between cases and no network.
 */
export function createLeadsCache(fetcher: Fetcher): LeadsCache {
  let cached: Lead[] | null = null
  let inFlight: Promise<Lead[]> | null = null

  return {
    load(force = false) {
      if (inFlight) return inFlight
      if (!force && cached) return Promise.resolve(cached)

      inFlight = fetcher()
        .then((rows) => {
          cached = rows
          return rows
        })
        .finally(() => {
          // Cleared on failure too, so a rejected load is retryable rather than
          // a permanently poisoned promise every later caller awaits.
          inFlight = null
        })
      return inFlight
    },
    publish(leads) {
      cached = [...leads]
    },
    peek() {
      return cached
    },
    reset() {
      cached = null
      inFlight = null
    },
  }
}

/** The app's one leads cache. `leadsApi` is the only door to /api/leads (§ Phase
 *  4) — this adds no second fetch wrapper, it calls that one. */
export const leadsCache = createLeadsCache(async () => {
  const data = await leadsApi<{ leads: Lead[] }>(
    "/api/leads",
    undefined,
    "Could not load leads",
  )
  return data.leads || []
})
