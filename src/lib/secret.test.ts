// The shared-secret gate's ONE decision with a right answer: concurrent callers
// share a single prompt.
//
// Added in Phase 7, for a deadlock rather than for coverage. `<SecretModal />`
// holds its resolver in a single ref, so a second `prompt()` overwrites the
// first and that first promise never settles. Sequential callers never noticed;
// the dashboard's two-request `Promise.allSettled` would have hung on a cold tab
// forever, showing loading skeletons with no way to retry.
//
// Bare node: there is no `window`, so `getSecret` always reads "" and
// `setSecret` is a no-op. That is exactly the cold-tab state under test.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiFetch, ensureSecret, registerSecretPrompt } from "./secret"

let unregister: (() => void) | null = null

beforeEach(() => {
  unregister?.()
  unregister = null
  vi.restoreAllMocks()
})

/** A prompt that counts its calls and hands back its resolver, like the modal. */
function countingPrompt() {
  const resolvers: ((entered: string) => void)[] = []
  const fn = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        resolvers.push(resolve)
      }),
  )
  unregister = registerSecretPrompt(fn)
  return { fn, resolvers }
}

describe("ensureSecret — one question, however many callers ask", () => {
  it("TWO CONCURRENT CALLERS SHARE ONE PROMPT, and both resolve from one answer", async () => {
    const { fn, resolvers } = countingPrompt()

    const first = ensureSecret()
    const second = ensureSecret()
    await Promise.resolve() // let both reach the prompt

    // The modal can only hold one resolver. Asking twice is the deadlock.
    expect(fn).toHaveBeenCalledTimes(1)
    expect(resolvers).toHaveLength(1)

    resolvers[0]("hunter2")
    await expect(first).resolves.toBe("hunter2")
    await expect(second).resolves.toBe("hunter2")
  })

  it("the dashboard's two parallel requests both settle — the Phase 7 deadlock, pinned", async () => {
    const { resolvers } = countingPrompt()
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }))

    const both = Promise.allSettled([apiFetch("/api/calls"), apiFetch("/api/leads")])
    await Promise.resolve()
    resolvers[0]("hunter2")

    // Before the fix this never resolved: the first apiFetch awaited a promise
    // the second had orphaned, so allSettled hung and the page never left its
    // loading state.
    const settled = await both
    expect(settled.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"])
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    for (const call of fetchSpy.mock.calls) {
      expect(
        (call[1] as { headers: Record<string, string> }).headers["x-app-secret"],
      ).toBe("hunter2")
    }
  })

  it("a settled prompt is not reused — the 401 re-prompt really does ask again", async () => {
    const { fn, resolvers } = countingPrompt()

    const first = ensureSecret()
    await Promise.resolve()
    resolvers[0]("wrong")
    await first

    // Rejected passphrase → forced re-prompt. Sharing the OLD promise here would
    // silently hand back the passphrase that was just refused.
    const second = ensureSecret("That passphrase was rejected. Try again.")
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(2)
    resolvers[1]("right")
    await expect(second).resolves.toBe("right")
  })

  it("a prompt that rejects is retryable, not a permanently poisoned promise", async () => {
    const failing = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("modal unmounted"))
      .mockResolvedValueOnce("hunter2")
    unregister = registerSecretPrompt(failing)

    await expect(ensureSecret()).rejects.toThrow("modal unmounted")
    await expect(ensureSecret()).resolves.toBe("hunter2")
  })

  it("without a mounted modal it returns empty and lets the request 401 honestly", async () => {
    await expect(ensureSecret()).resolves.toBe("")
  })
})
