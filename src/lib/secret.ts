// The shared-secret gate, browser side (§2 Auth · STATUS §1).
//
// The passphrase lives in **sessionStorage only** — gone when the tab closes,
// never localStorage — and rides along as `x-app-secret` on every call to our own
// /api routes. The signed Supabase upload PUT does NOT get it.
//
// To be explicit about the pre-merge checklist item "zero frontend token lines":
// there is no key in this file. The user types a passphrase into a modal and the
// browser holds it for the tab's lifetime. That is the opposite of a baked-in key.

const SECRET_KEY = "ccc_app_secret"

const hasStorage = () => typeof window !== "undefined"

export const getSecret = (): string =>
  hasStorage() ? sessionStorage.getItem(SECRET_KEY) || "" : ""

export const setSecret = (value: string): void => {
  if (hasStorage()) sessionStorage.setItem(SECRET_KEY, value)
}

export const clearSecret = (): void => {
  if (hasStorage()) sessionStorage.removeItem(SECRET_KEY)
}

/**
 * The mounted Unlock modal, registered once. A promise-returning opener keeps
 * `apiFetch` reading top to bottom exactly as it did in the old app, instead of
 * turning every caller into a state machine.
 */
type SecretPrompt = (message: string) => Promise<string>

let prompt: SecretPrompt | null = null

/**
 * The one prompt currently on screen, so concurrent callers SHARE it.
 *
 * THIS IS A DEADLOCK FIX, not an optimisation (found in Phase 7 review).
 * `<SecretModal />` keeps its resolver in a single ref, so a second `prompt()`
 * overwrites the first: the first promise then never settles, and any caller
 * awaiting it hangs for the lifetime of the tab. Nothing hit that until the
 * dashboard issued two `apiFetch` calls in one `Promise.allSettled` — a cold tab
 * opened straight on /dashboard would take the passphrase, resolve one request,
 * and sit on loading skeletons forever with no way to retry.
 *
 * The modal is a singleton and there is one passphrase, so one question is the
 * correct behaviour anyway: whoever asks first opens it, everyone else awaits the
 * same answer. Cleared as soon as it settles, so the NEXT prompt — the 401
 * re-prompt after a rotated passphrase — really does ask again.
 */
let pendingPrompt: Promise<string> | null = null

/** Called by `<SecretModal />` on mount; returns its own cleanup. */
export function registerSecretPrompt(fn: SecretPrompt): () => void {
  prompt = fn
  return () => {
    if (prompt === fn) prompt = null
  }
}

/**
 * The current passphrase, prompting once (and storing it) if we don't have one.
 * A `message` forces a re-prompt — that is the rejected-passphrase path.
 *
 * "Once" is now literal across concurrent callers, not just sequential ones —
 * see `pendingPrompt` above.
 */
export async function ensureSecret(message?: string): Promise<string> {
  const existing = getSecret()
  if (existing && !message) return existing
  if (!prompt) return existing // no modal mounted — let the request 401 honestly

  if (!pendingPrompt) {
    pendingPrompt = prompt(message || "")
      .then((entered) => {
        if (entered) setSecret(entered)
        return entered
      })
      .finally(() => {
        // Cleared on failure too, so a rejected prompt is retryable rather than
        // a permanently poisoned promise every later caller awaits — the same
        // rule `leadsCache` follows for its in-flight GET.
        pendingPrompt = null
      })
  }
  return pendingPrompt
}

type ApiFetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>
}

/**
 * `fetch` for our own API routes, with the secret attached. On 401 — a typo'd or
 * rotated passphrase — clear it, re-prompt, and retry **exactly once**. A second
 * 401 is returned to the caller rather than looping.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  let secret = await ensureSecret()
  const withSecret = (sec: string) =>
    fetch(path, {
      ...options,
      headers: { ...(options.headers || {}), "x-app-secret": sec },
    })

  let res = await withSecret(secret)
  if (res.status === 401) {
    clearSecret()
    secret = await ensureSecret("That passphrase was rejected. Try again.")
    if (secret) res = await withSecret(secret)
  }
  return res
}
