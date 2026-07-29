// ══ "Call this lead" → Coach, across a route boundary (Phase 5) ══════════════
//
// In the old app `attachedLead` was a module variable and `startCallForLead`
// (index.html:1701–1706) just set it and switched view — Coach and Leads were the
// same document. Here the lead modal lives on /leads and the recorder on /coach,
// so the intent needs a carrier.
//
// sessionStorage, and READ-AND-CLEAR. Both halves are deliberate:
//
//   · sessionStorage, not localStorage, and not the URL. The tab's lifetime is the
//     right scope, matching `lib/secret.ts`'s existing pattern. A URL param would
//     put the business name in the address bar, which makes a link that can lie
//     about which lead you are calling and survives being shared or bookmarked.
//
//   · Read-and-clear, so the handoff fires exactly once. This is what keeps the
//     old app's behaviour intact: `attachedLead` was in memory and a reload lost
//     it, so a reloaded Coach records an UNLINKED call. A value that persisted
//     would be worse than the old app, not better — tap Call, get distracted, come
//     back tomorrow with the tab still open, and the next unrelated recording
//     silently attaches itself to a lead you have forgotten about.

/** The lead the next recording will link to. Just enough to link it and name it. */
export type PendingLead = { id: string; business: string }

const KEY = "ccc_pending_lead"

/** `sessionStorage`, or null when there isn't one (SSR, or storage blocked). */
function defaultStore(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    // Storage can throw outright when the browser blocks it. A failed handoff
    // must not take the modal down with it.
    return null
  }
}

/** Hand a lead to Coach. Called as the lead modal navigates away. */
export function setPendingLead(
  lead: PendingLead,
  store: Storage | null = defaultStore(),
): void {
  if (!store) return
  try {
    store.setItem(KEY, JSON.stringify({ id: lead.id, business: lead.business }))
  } catch {
    /* full or blocked — the call just records unlinked, which is recoverable
       through the attach combobox after analysis */
  }
}

/**
 * Take the pending lead, if there is one. Removes it on the way out, so a second
 * call — a re-render, a reload — returns null.
 *
 * Rejects anything that is not a `{ id, business }` pair of non-empty strings:
 * this reads a key any script on the origin could have written, and the value
 * goes on to become a `lead_id` in a PATCH body and a name in the chip.
 */
export function takePendingLead(
  store: Storage | null = defaultStore(),
): PendingLead | null {
  if (!store) return null

  let raw: string | null = null
  try {
    raw = store.getItem(KEY)
    store.removeItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    const { id, business } = parsed as Partial<PendingLead>
    if (typeof id !== "string" || !id) return null
    if (typeof business !== "string" || !business) return null
    return { id, business }
  } catch {
    return null
  }
}
