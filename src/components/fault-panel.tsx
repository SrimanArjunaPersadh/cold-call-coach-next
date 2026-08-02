// ══ The fault panel — one treatment for every route-level dead end ═════════
//
// Phase 8. Three surfaces reach this: a render that threw (`app/error.tsx`), a
// render that threw ABOVE the shell (`app/global-error.tsx`), and a URL that
// matches nothing (`app/not-found.tsx`). §4.4 says every surface ships an error
// state that "states what happened and what to do"; before this phase those
// three shipped Next's defaults instead — no nav, no tokens, OS colour scheme,
// and "Application error: a client-side exception has occurred" as the whole
// explanation.
//
// One component for all three, like §5.2's single scorecard: the acceptance page
// and the real dead ends cannot drift apart.
//
// NOT a Container: `global-error` replaces the root layout, so it has no shell
// to sit inside and provides its own wrapper. The other two are already inside
// `<main>`. Wrapping is the caller's job; the card is this file's.

import { cn } from "@/lib/utils"

export function FaultPanel({
  eyebrow,
  title,
  children,
  actions,
  className,
}: {
  /** The 12px uppercase label above the title (§4.2). */
  eyebrow: string
  title: string
  /** What happened and what to do. Prose, so it takes a measure. */
  children: React.ReactNode
  /** Buttons. The recovery action first — it is why the reader is here. */
  actions: React.ReactNode
  className?: string
}) {
  return (
    // A resting card: border only, no shadow (§4.3). This is not floating over
    // anything — it IS the page.
    <div className={cn("rounded-lg border border-border bg-card p-8", className)}>
      <p className="eyebrow">{eyebrow}</p>
      {/* h1, because on these three surfaces this really is the page title —
          there is nothing else on screen to outrank it. */}
      <h1 className="mt-2 text-title">{title}</h1>
      <div className="mt-4 max-w-prose text-body text-foreground-2">
        {children}
      </div>
      <div className="mt-8 flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}
