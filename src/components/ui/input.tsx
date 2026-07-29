import * as React from "react"

import { cn } from "@/lib/utils"

// Adapted from the shadcn input to the §4 design system:
//   · rounded-lg (8px — §4.3 puts inputs with cards and modals, not buttons)
//   · 1px --border, --surface background, no ring-offset stack
//   · h-11 (44px) so a touch target is never smaller than the finger (§10). The
//     2px --accent focus ring comes from the global :focus-visible rule.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-card px-4 text-body text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
