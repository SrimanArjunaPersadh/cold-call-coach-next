// The one door to /api/leads, on top of `apiFetch` (§ Phase 3's `lib/secret`).
// There is no second fetch wrapper in this codebase and there must not be: the
// shared-secret prompt, the 401 re-prompt and the single retry all live in
// `apiFetch`, and this only adds the JSON contract on top.

import { apiFetch } from "./secret"

/**
 * DELIBERATE DEVIATION FROM THE OLD APP — the copy, not the guard.
 *
 * The old `leadsApi` threw "API not found — run `vercel dev`, not a static
 * server (e.g. Live Server)." That failure mode was real there: `index.html`
 * opened under Live Server or `file://` had no serverless functions behind it,
 * so /api/leads 404'd with an HTML page. In Next the route handler is part of
 * the app — if the app is being served at all, so is the route. The old message
 * would send the owner to fix a thing that cannot be broken.
 *
 * The GUARD stays, because a non-JSON body still means something answered
 * instead of us: a tunnel or proxy error page, a service worker serving the
 * offline shell, a captive portal on the phone's wifi. Those are the live
 * causes now, and the message names them.
 */
const NOT_JSON =
  "The server sent a page instead of data. Reload — and if you are on a tunnel or public wifi, check that first."

/**
 * DELIBERATE DEVIATION, same reason: the old unreachable-server message also
 * said "Is `vercel dev` running?". On a phone the real cause is the phone, so
 * the copy points there. This is the message the airplane-mode drag surfaces.
 */
const UNREACHABLE = "Cannot reach the server. Check your connection and try again."

/**
 * `fetch` for /api/leads that either resolves to the parsed body or throws an
 * `Error` whose `message` is safe to put straight in front of the user — every
 * caller here renders it into a toast or the board's error state.
 */
export async function leadsApi<T = Record<string, unknown>>(
  path: string,
  options?: Parameters<typeof apiFetch>[1],
  fallbackMessage?: string,
): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, options)
  } catch {
    throw new Error(UNREACHABLE)
  }

  const contentType = res.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) throw new Error(NOT_JSON)

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || fallbackMessage || "Request failed")
  }
  return data as T
}

/** The message an unknown throw should carry. Never `[object Object]`. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}
