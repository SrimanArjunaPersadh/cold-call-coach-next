"use client" // Error boundaries must be Client Components.

import Link from "next/link"
import { useEffect } from "react"

import { Container } from "@/components/app-shell"
import { FaultPanel } from "@/components/fault-panel"
import { Button } from "@/components/ui/button"

// ══ The route error boundary (§4.4, Phase 8) ═══════════════════════════════
//
// Wraps every page and nested layout below the root. Until Phase 8 this file did
// not exist, so a render-time throw anywhere in the Coach panel, the board or the
// dashboard fell through to Next's built-in error screen — which carries no nav,
// no §4 tokens, follows the OS colour scheme rather than this app's light-only
// one, and says only that an exception occurred.
//
// WHAT IS DELIBERATELY NOT ON SCREEN: `error.message` and `error.digest`. §9
// forbids stack traces and storage paths in API error bodies, and a render error
// is the same class of leak with the same reader — one person, who can open
// devtools. So the exact error goes to the console, the screen says where to find
// it, and no internal path is ever painted onto a surface. There is no error
// reporting service to send it to; Sentry is §12, deferred.
//
// `unstable_retry` (Next 16.2+) is the prop that RE-FETCHES and re-renders the
// segment. `reset` only clears the boundary's state without re-fetching, which on
// a data-driven screen renders the same failure again.

export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("[cold-call-coach] render error:", error)
  }, [error])

  return (
    <Container>
      <FaultPanel
        eyebrow="Error"
        title="This screen failed to render."
        actions={
          <>
            <Button type="button" onClick={() => unstable_retry()}>
              Try again
            </Button>
            {/* The way out, always. A screen that can only offer a retry is a
                trap when the retry keeps failing. */}
            <Button variant="outline" asChild>
              <Link href="/coach">Go to Coach</Link>
            </Button>
          </>
        }
      >
        <p>
          Nothing was lost — your calls and leads live on the server, not in this
          page. Try again first. If it fails the same way twice, the exact error
          is in the browser console.
        </p>
      </FaultPanel>
    </Container>
  )
}
