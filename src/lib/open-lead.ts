// ══ Dashboard hero → the lead's scorecard, across a route boundary (Phase 7) ══
//
// §8 says the last-call hero taps through to the "full scorecard". No route
// returns one call with its transcript and metrics — `GET /api/calls` with no
// `lead_id` is deliberately lean (no transcript, no metrics) and there is no
// GET-by-call-id at all, and §9's table has exactly five routes. The lean row
// does carry `lead_id`, and Phase 5 already renders the full scorecard inside the
// lead modal through `<Scorecard />`. So the tap NAVIGATES to that lead: reuse,
// not a sixth route.
//
// This is `lib/pending-call.ts` with one field instead of two, and deliberately
// so — the same problem (an intent that has to survive a route change) gets the
// same answer, rather than a second mechanism:
//
//   · sessionStorage, not the URL. `/leads?lead=<uuid>` would be a link that
//     survives bookmarking and sharing, and reopens a modal for a lead that may
//     have been deleted weeks ago. It would also pull `useSearchParams` into the
//     board, which forces the whole kanban behind a Suspense boundary for a
//     one-shot navigation.
//   · Read-and-clear, so the handoff fires exactly once. Otherwise a stored id
//     would reopen that lead's modal every time /leads is visited afterwards.

const KEY = "ccc_open_lead"

/** `sessionStorage`, or null when there isn't one (SSR, or storage blocked). */
function defaultStore(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    // Storage can throw outright when the browser blocks it. A failed handoff
    // must not take the navigation down with it — /leads still opens, just
    // without the modal, and the lead is one tap away on the board.
    return null
  }
}

/** Ask /leads to open this lead. Called as the dashboard hero navigates away. */
export function setOpenLead(
  leadId: string,
  store: Storage | null = defaultStore(),
): void {
  if (!store || !leadId) return
  try {
    store.setItem(KEY, String(leadId))
  } catch {
    /* full or blocked — the board simply opens without the modal */
  }
}

/**
 * Take the requested lead id, if there is one. Removes it on the way out, so a
 * second call — a Refresh, a re-render, a later visit — returns null.
 *
 * Rejects anything that is not a non-empty string: this reads a key any script on
 * the origin could have written, and the value goes on to select which lead's
 * details and call history are put on screen.
 */
export function takeOpenLead(store: Storage | null = defaultStore()): string | null {
  if (!store) return null
  try {
    const raw = store.getItem(KEY)
    store.removeItem(KEY)
    return typeof raw === "string" && raw ? raw : null
  } catch {
    return null
  }
}
