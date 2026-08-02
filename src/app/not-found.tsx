import Link from "next/link"

import { Container } from "@/components/app-shell"
import { FaultPanel } from "@/components/fault-panel"
import { Button } from "@/components/ui/button"

// ══ 404 (§4.4, Phase 8) ════════════════════════════════════════════════════
//
// The ROOT not-found handles every unmatched URL in the app, not just an explicit
// `notFound()` call, and it renders inside the root layout — so the nav is still
// there and you are one tap from anywhere. That is the whole reason this is a
// root `not-found.tsx` and not the experimental `global-not-found.js`: the latter
// bypasses the layout and would need its own copy of the styles, the font and the
// shell to say the same thing (§1 — less is more).
//
// Four destinations exist in this app. Listing them beats "go home" — the reader
// mistyped a URL, so the useful answer is the set of URLs that are real.
//
// NO `metadata` EXPORT, though every other route in this app has one. Next
// supports `metadata` in `layout.js` and `page.js` only — a `not-found.js` export
// is silently ignored, so it would have been dead code claiming to set a title it
// never set. The tab keeps the root layout's "Cold Call Coach", which is honest
// for a URL that matched nothing.

export default function NotFound() {
  return (
    <Container>
      <FaultPanel
        eyebrow="404"
        title="That page doesn't exist."
        actions={
          <>
            <Button asChild>
              <Link href="/coach">Coach</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/leads">Leads</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </>
        }
      >
        <p>
          This app has three screens — record and score a call, work the board, or
          check the week. Pick one.
        </p>
      </FaultPanel>
    </Container>
  )
}
