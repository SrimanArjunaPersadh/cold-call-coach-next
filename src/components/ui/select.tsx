import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A NATIVE `<select>`, wearing the Input's §4 treatment. Deliberately not
 * Radix's Select, and this is the reasoning, because it will look like an
 * omission otherwise:
 *
 * §10 asks for `onmousedown` + `preventDefault` semantics on dropdowns "or
 * shadcn primitives that handle blur-before-click correctly". A native select
 * has no blur-before-click problem to handle — the options are not DOM, they
 * are the platform's. On a phone that also means the OS wheel picker, which is
 * a bigger, better touch target than any list we could draw, and it needs no
 * portal, no focus trap, and no scroll-lock inside an already-open modal.
 *
 * The one thing to keep an eye on: `appearance-none` plus our own chevron, so
 * the control matches Input rather than the browser's default chrome.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "h-11 w-full appearance-none rounded-lg border border-input bg-card px-4 pr-11 text-body text-foreground outline-none transition-colors hover:border-muted-foreground/40 disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { Select }
