"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { registerSecretPrompt } from "@/lib/secret"

/**
 * The Unlock modal (§4.4 "Unlock" row). Mounted once by the Coach panel; it
 * registers itself with `lib/secret` so `apiFetch` can await a passphrase.
 *
 * There is no cancel — the old app has none either. Every API call needs the
 * secret, so dismissing it would only mean failing the same request twice.
 */
export function SecretModal() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const resolver = useRef<((entered: string) => void) | null>(null)

  useEffect(
    () =>
      registerSecretPrompt(
        (msg) =>
          new Promise<string>((resolve) => {
            setMessage(msg)
            setValue("")
            setOpen(true)
            resolver.current = resolve
          }),
      ),
    [],
  )

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const entered = value.trim()
    if (!entered) return // an empty passphrase is not an answer
    setOpen(false)
    setValue("")
    const resolve = resolver.current
    resolver.current = null
    resolve?.(entered)
  }

  return (
    // The scrim is the only place --text is used as a background: it is the page
    // dimmed, not a surface. The panel is a floating surface, so it takes the one
    // shadow (§4.3).
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="secret-title"
        className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-md"
      >
        <form onSubmit={submit}>
          <h2 id="secret-title" className="text-section">
            Unlock
          </h2>
          <p className="mt-2 text-body text-foreground-2">
            This app is locked to you. Enter the passphrase to continue.
          </p>

          <label htmlFor="secret-input" className="eyebrow mt-8 block">
            Passphrase
          </label>
          <Input
            id="secret-input"
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            className="mt-2"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />

          {message ? (
            <p role="alert" className="mt-2 text-body text-fail">
              {message}
            </p>
          ) : null}

          <Button type="submit" className="mt-8 w-full">
            Unlock
          </Button>
        </form>
      </div>
    </div>
  )
}
