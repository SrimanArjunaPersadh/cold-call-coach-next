"use client" // Error boundaries must be Client Components.

import { Plus_Jakarta_Sans } from "next/font/google"
import { useEffect } from "react"

import { FaultPanel } from "@/components/fault-panel"
import { Button } from "@/components/ui/button"
import { THEME_INIT_SCRIPT } from "@/lib/theme"

import "./globals.css"

// ══ The last resort (§4.4, Phase 8) ════════════════════════════════════════
//
// `app/error.tsx` wraps the pages BELOW the root layout; it cannot catch the root
// layout itself. When that throws, this file replaces the entire document — which
// is why it declares its own <html> and <body>, imports globals.css, and loads the
// font again. Nothing above it survives to provide them, the nav included.
//
// It should never render. It exists because the alternative when it does is Next's
// built-in 500 page: no tokens, no type ramp, and the OS colour scheme instead of
// the skin the owner chose (§4.5).
//
// TWO DELIBERATE DIFFERENCES FROM `error.tsx`:
//   · The escape hatch is a plain <a>, not next/link. The failure was in the root
//     layout, so client-side routing is the machinery that just broke — a hard
//     document load re-runs the whole app instead of asking the broken thing to
//     navigate.
//   · No `metadata` export: error boundaries are Client Components and Next does
//     not support `metadata` in them. React's <title> does the same job here.

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
})

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("[cold-call-coach] root layout error:", error)
  }, [error])

  return (
    // suppressHydrationWarning for the same reason as the root layout: the init
    // script below may add `.dark` before React hydrates.
    <html lang="en" className={`${jakarta.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        {/* §4.5 — this document REPLACES the root layout, so without its own
            copy of the init script the worst screen in the app would also be the
            only one that ignores the owner's skin and flashes white. There is no
            nav here either, so this screen cannot toggle — it only obeys. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <title>Error · Cold Call Coach</title>
        {/* No shell, so this provides its own measure and gutters — the same
            1152px / 16px / 32px the Container gives every other screen. */}
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
          <FaultPanel
            eyebrow="Error"
            title="The app failed to start."
            actions={
              <>
                <Button type="button" onClick={() => unstable_retry()}>
                  Try again
                </Button>
                <Button variant="outline" asChild>
                  <a href="/coach">Reload Coach</a>
                </Button>
              </>
            }
          >
            <p>
              This one is not a screen failing — it is the shell around every
              screen. Your calls and leads are untouched on the server. The exact
              error is in the browser console.
            </p>
          </FaultPanel>
        </div>
      </body>
    </html>
  )
}
