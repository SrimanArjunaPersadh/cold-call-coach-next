// ══ §4.5 dark skin — the switch, both halves of it ═══════════════════════════
//
// Light is the default; dark is opt-in and remembered in localStorage("theme").
// Two pieces of code apply the choice, and they live in one file so they cannot
// drift apart:
//
//   · THEME_INIT_SCRIPT — vanilla JS, inlined by layout.tsx as the FIRST child
//     of <body>. A parser-inserted script waits for the stylesheets above it, so
//     by the time it runs the .dark tokens exist and getComputedStyle is real —
//     and it runs before anything paints, which is what prevents the white flash
//     on every load of a dark-mode tab. It cannot import from this module (it is
//     a string in the HTML), so its logic is duplicated from the functions below
//     on purpose; change one, change both.
//
//   · toggleTheme — what the nav control calls. The DOM class is the source of
//     truth, NOT storage: when the browser blocks storage the toggle still works
//     for the life of the tab and simply forgets on reload, which needs no error
//     state (§13).
//
// The theme-color meta follows the skin by reading --surface off the live
// styles. Components never carry a hex (§4.1), and this module is no exception —
// if globals.css changes, the browser chrome tint follows by construction.

export type Theme = "light" | "dark"

const KEY = "theme"

/** `localStorage`, or null when there isn't one (SSR, or storage blocked). */
function defaultStore(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    // Storage can throw outright when the browser blocks it. The toggle then
    // degrades to per-tab, which is fine; it must not throw into the nav.
    return null
  }
}

/**
 * Keep the browser-chrome tint (meta theme-color) on the current --surface.
 *
 * Exported because it has to run on NAVIGATION as well as on toggle. Next owns
 * that meta tag — it comes from the `viewport` export — and re-renders it on
 * every client-side route change, which overwrites this mutation and resets the
 * tint to light's `#ffffff` while the page stays dark. Verified in Chrome, not
 * assumed: /styleguide → /dashboard put `theme-color` back to `#ffffff` with
 * `.dark` still on <html>. It is invisible on a laptop and obvious on a phone,
 * where the address bar is the thing that flashes white.
 */
export function syncThemeColor(): void {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  const surface = getComputedStyle(document.documentElement)
    .getPropertyValue("--surface")
    .trim()
  if (surface) meta.setAttribute("content", surface)
}

/** Flip the skin, persist the choice, return what it became. */
export function toggleTheme(store: Storage | null = defaultStore()): Theme {
  const next: Theme = document.documentElement.classList.contains("dark")
    ? "light"
    : "dark"
  document.documentElement.classList.toggle("dark", next === "dark")
  syncThemeColor()
  try {
    store?.setItem(KEY, next)
  } catch {
    /* full or blocked — the choice holds for this tab and forgets on reload */
  }
  for (const fn of listeners) fn()
  return next
}

// ── The React-facing half ────────────────────────────────────────────────────
//
// The class on <html> is the source of truth, and React does not own it — the
// init script above writes it before React exists. That makes the skin external
// state, so the toggle reads it with useSyncExternalStore rather than mirroring
// it into a useState the server would have to guess at. Hence a subscription:
// toggleTheme is the only writer, so it is also the only notifier.

const listeners = new Set<() => void>()

/** Subscribe to skin changes. Returns the unsubscribe, as the hook expects. */
export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/** True when the current document is on the dark skin. Client only. */
export function isDark(): boolean {
  return document.documentElement.classList.contains("dark")
}

/**
 * What the SERVER and the hydration pass see. Always false, and that is honest
 * rather than a guess: light is the default (§4.5) and the server cannot know
 * this browser's stored choice. The init script has already corrected the real
 * document by the time anyone looks; only `aria-pressed` is briefly behind.
 */
export function isDarkServer(): boolean {
  return false
}

// Only "dark" opts in; any other stored value — absent, "light", garbage another
// script wrote — is the light default. Mirrors toggleTheme + syncThemeColor.
export const THEME_INIT_SCRIPT = `(function () {
  try {
    if (localStorage.getItem(${JSON.stringify(KEY)}) !== "dark") return;
    var root = document.documentElement;
    root.classList.add("dark");
    var meta = document.querySelector('meta[name="theme-color"]');
    var surface = getComputedStyle(root).getPropertyValue("--surface").trim();
    if (meta && surface) meta.setAttribute("content", surface);
  } catch (e) {}
})();`
