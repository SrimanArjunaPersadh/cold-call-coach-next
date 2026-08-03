import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Adapted from the shadcn button to the §4 design system:
//   · radius fixed at --radius-md (6px, §4.3) — never pill, never sharp
//   · 2px --accent focus ring (§4.3), replacing the preset's 3px translucent ring
//   · every size is ≥44px tall (§10 touch targets). The preset's h-6/h-7/h-8
//     sizes were REMOVED rather than resized, so no call site can reintroduce a
//     sub-44px target by passing size="sm".
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border-border bg-card text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-border aria-expanded:bg-border",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 gap-2 px-4",
        // NO type utility here, and it is load-bearing. `cn` runs tailwind-merge,
        // which does not know §4.2's scale and reads `text-body` as a text COLOUR.
        // cva emits size after variant, so `text-body` won that conflict and
        // STRIPPED `text-primary-foreground` — leaving the Record button (the
        // only `lg` in the app) inheriting --text. Navy-on-cyan in light, which
        // hid it; frost-on-cyan at 1.52:1 in dark, which does not. The size never
        // rendered at 15px either — `text-sm` from the base outranked it in the
        // stylesheet — so dropping it changes nothing on screen and gives the
        // colour back. The general fix is teaching tailwind-merge the scale; that
        // resizes inputs 16px→15px app-wide and is logged in §12, not done here.
        lg: "h-12 gap-2 px-8",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
