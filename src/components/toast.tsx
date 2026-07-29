"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

// The old app's toast, translated: one message at a time, 3200ms, tone classes.
// A queue was considered and rejected — the old behaviour is that a second
// toast REPLACES the first, and the actions that toast here (save, delete, a
// failed move) are one-at-a-time by nature.

export type ToastTone = "ok" | "warn" | "err"

export type ToastMessage = { text: string; tone?: ToastTone } | null

const TONE_TEXT: Record<ToastTone, string> = {
  ok: "text-pass",
  warn: "text-warn",
  err: "text-fail",
}

/**
 * Owns the message and its 3200ms timer. Returns the `toast` function and the
 * message to hand to `<Toast />` — the caller decides where that renders.
 */
export function useToast() {
  const [message, setMessage] = useState<ToastMessage>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toast = useCallback((text: string, tone?: ToastTone) => {
    setMessage({ text, tone })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 3200)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return { toast, message }
}

/**
 * A floating surface, so it takes the one shadow (§4.3). No cyan: a toast is a
 * report, not an interaction — the tone colour is the whole signal, and it is
 * semantic (§4.1) or absent.
 *
 * `aria-live` is assertive for errors and polite otherwise, so a failed move
 * interrupts the screen reader the way a red line interrupts the eye.
 */
export function Toast({ message }: { message: ToastMessage }) {
  return (
    <div
      // Always mounted, so the live region exists before the text arrives —
      // a region that appears WITH its message is often not announced at all.
      role="status"
      aria-live={message?.tone === "err" ? "assertive" : "polite"}
      className="pointer-events-none fixed inset-x-4 bottom-8 z-50 flex justify-center"
    >
      {message ? (
        <p
          className={cn(
            "max-w-md rounded-lg border border-border bg-card px-4 py-2 text-body shadow-md",
            message.tone ? TONE_TEXT[message.tone] : "text-foreground",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
