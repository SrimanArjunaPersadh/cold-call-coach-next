// ══ §4.5's no-flash init script, executed ════════════════════════════════════
//
// This file exists for one reason, and it is not coverage. `THEME_INIT_SCRIPT`
// is a STRING. TypeScript does not check it, ESLint does not lint it, the
// bundler does not parse it — it is the only code in this app with zero static
// safety, and it runs as the first child of <body> on every page load of every
// screen, before anything paints. A typo in it is a ReferenceError in the head
// of the whole app, and nothing else in the toolchain would say so.
//
// So the tests below `new Function` the real string against a fake DOM and
// assert what it does. Bare node has no `document` and no `localStorage`, which
// is why the fakes are hand-built rather than jsdom: the surface under test is
// four calls wide, and vitest.config.mts stays bare.
//
// `toggleTheme` gets the same treatment through globalThis stubs, for the one
// property that is a decision rather than plumbing: the DOM class is the source
// of truth, so a browser that blocks storage still toggles for the tab.

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  THEME_INIT_SCRIPT,
  isDark,
  isDarkServer,
  subscribeTheme,
  toggleTheme,
} from "./theme"

/** The three DOM things the script and the toggle touch, and nothing more. */
function fakeDom({ meta = true }: { meta?: boolean } = {}) {
  const classes = new Set<string>()
  const metaEl = { content: "#ffffff", setAttribute: (_: string, v: string) => (metaEl.content = v) }
  const root = {
    classList: {
      add: (c: string) => void classes.add(c),
      remove: (c: string) => void classes.delete(c),
      contains: (c: string) => classes.has(c),
      toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)),
    },
  }
  return {
    classes,
    metaEl,
    document: {
      documentElement: root,
      querySelector: (sel: string) =>
        meta && sel === 'meta[name="theme-color"]' ? metaEl : null,
    },
    // The skin the fake stylesheet reports. The real one comes from globals.css.
    getComputedStyle: () => ({ getPropertyValue: () => "  #101A2E  " }),
  }
}

/** A localStorage that can be told to be blocked, as Safari private mode is. */
function fakeStore(initial?: string, blocked = false): Storage {
  const map = new Map<string, string>()
  if (initial !== undefined) map.set("theme", initial)
  const boom = () => {
    throw new DOMException("The operation is insecure.", "SecurityError")
  }
  return {
    getItem: (k) => (blocked ? boom() : (map.get(k) ?? null)),
    setItem: (k, v) => (blocked ? boom() : void map.set(k, String(v))),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

/** Run the real init string with the globals it reads shadowed by fakes. */
function runInit(dom: ReturnType<typeof fakeDom>, store: Storage) {
  new Function("localStorage", "document", "getComputedStyle", THEME_INIT_SCRIPT)(
    store,
    dom.document,
    dom.getComputedStyle,
  )
}

describe("THEME_INIT_SCRIPT — the string that runs before first paint", () => {
  it("APPLIES THE STORED DARK CHOICE, which is the whole point: no white flash", () => {
    const dom = fakeDom()
    runInit(dom, fakeStore("dark"))
    expect(dom.classes.has("dark")).toBe(true)
  })

  it("retints the browser chrome from --surface, trimmed, never a hardcoded hex", () => {
    const dom = fakeDom()
    runInit(dom, fakeStore("dark"))
    // Reading the live value is what keeps globals.css the single source of
    // truth for the phone's address-bar colour (§4.1: no raw hex outside it).
    expect(dom.metaEl.content).toBe("#101A2E")
  })

  it("leaves a first-ever visit on the light default", () => {
    const dom = fakeDom()
    runInit(dom, fakeStore(undefined))
    expect(dom.classes.has("dark")).toBe(false)
    expect(dom.metaEl.content).toBe("#ffffff")
  })

  it("treats anything that is not exactly \"dark\" as light", () => {
    // Any script on the origin can write this key. "Dark", "true" and junk all
    // mean light, so a bad value can never leave the app on a skin nobody chose.
    for (const stored of ["light", "Dark", "DARK", "true", "1", "{}", ""]) {
      const dom = fakeDom()
      runInit(dom, fakeStore(stored))
      expect(dom.classes.has("dark"), `stored: ${JSON.stringify(stored)}`).toBe(false)
    }
  })

  it("SURVIVES BLOCKED STORAGE instead of throwing into every page's <head>", () => {
    const dom = fakeDom()
    expect(() => runInit(dom, fakeStore("dark", true))).not.toThrow()
    expect(dom.classes.has("dark")).toBe(false)
  })

  it("survives a document with no theme-color meta", () => {
    const dom = fakeDom({ meta: false })
    expect(() => runInit(dom, fakeStore("dark"))).not.toThrow()
    expect(dom.classes.has("dark")).toBe(true)
  })

  it("NEVER CONSULTS prefers-color-scheme — §3's amendment, not a style note", () => {
    // The app follows the owner's stored choice and nothing else. An app that
    // changes skin because the phone's clock crossed sunset is a surprise, not a
    // feature. A future session "improving" this script with matchMedia trips
    // here, which is the only place that ruling is enforced rather than written.
    expect(THEME_INIT_SCRIPT).not.toMatch(/matchMedia|prefers-color-scheme/)
  })
})

describe("toggleTheme — the DOM class is the source of truth", () => {
  const stubDom = (dom: ReturnType<typeof fakeDom>) => {
    vi.stubGlobal("document", dom.document)
    vi.stubGlobal("getComputedStyle", dom.getComputedStyle)
  }
  afterEach(() => vi.unstubAllGlobals())

  it("cycles light → dark → light and persists each choice", () => {
    const dom = fakeDom()
    stubDom(dom)
    const store = fakeStore()

    expect(toggleTheme(store)).toBe("dark")
    expect(isDark()).toBe(true)
    expect(store.getItem("theme")).toBe("dark")

    expect(toggleTheme(store)).toBe("light")
    expect(isDark()).toBe(false)
    expect(store.getItem("theme")).toBe("light")
  })

  it("STILL TOGGLES WHEN STORAGE IS BLOCKED, and simply forgets on reload", () => {
    // This is why §13 gives the toggle no error state: the degraded mode is a
    // working control with a short memory, which needs no copy to explain it.
    const dom = fakeDom()
    stubDom(dom)
    expect(() => toggleTheme(fakeStore(undefined, true))).not.toThrow()
    expect(isDark()).toBe(true)
  })

  it("retints the browser chrome on the way through", () => {
    const dom = fakeDom()
    stubDom(dom)
    toggleTheme(fakeStore())
    expect(dom.metaEl.content).toBe("#101A2E")
  })

  it("notifies subscribers, and stops once they unsubscribe", () => {
    // useSyncExternalStore only re-reads when told to, so a toggle that did not
    // notify would flip the skin and leave aria-pressed lying about it.
    const dom = fakeDom()
    stubDom(dom)
    const seen: boolean[] = []
    const off = subscribeTheme(() => seen.push(isDark()))

    toggleTheme(fakeStore())
    toggleTheme(fakeStore())
    expect(seen).toEqual([true, false])

    off()
    toggleTheme(fakeStore())
    expect(seen).toEqual([true, false])
  })

  it("tells the server light, because the server cannot know the choice", () => {
    expect(isDarkServer()).toBe(false)
  })
})
