import * as React from "react"

import { cn } from "@/lib/utils"

// Adapted from the shadcn textarea to the §4 design system — the Input's
// treatment, with a min-height instead of a fixed 44px, since notes are the one
// field on the board that is meant to hold a paragraph.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-lg border border-input bg-card px-4 py-2 text-body text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
