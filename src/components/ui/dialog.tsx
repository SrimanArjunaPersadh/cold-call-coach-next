"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// Adapted from the shadcn dialog to the §4 design system:
//   · rounded-lg (8px — §4.3 groups modals with cards and inputs)
//   · the scrim is --text at 20%: the page dimmed, not a surface. Same treatment
//     as Phase 3's Unlock modal, which is the reference rendering on /styleguide.
//   · the panel is a floating surface, so it takes the one shadow (§4.3)
//   · the close affordance is a 44px target (§10), not the preset's 16px icon
//
// Radix earns its place here for exactly three behaviours the lead modal is
// specified to have: Escape closes, backdrop click closes, and focus is trapped
// and restored. Hand-rolling those is how a modal ends up unusable on a phone.

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-foreground/20 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // THE PANEL ITSELF DOES NOT SCROLL — the region inside it does.
          //
          // Amended 2026-07-30. This used to be one scrolling box with the close
          // button absolutely positioned inside it, which meant the button
          // scrolled away: reading a call's score at the bottom of the lead modal
          // left no way out but scrolling all the way back up. The button is
          // positioned against this element, so as long as THIS element is the
          // one that stays put, the button stays with it.
          //
          // max-h so a long form scrolls inside the panel rather than scrolling
          // the page behind it, which on a phone strands the Save button.
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-md duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      >
        {/*
          grid-cols-1 is load-bearing, not cosmetic. An implicit grid column is
          `auto`, which sizes to its widest content — so one unbreakable child
          (a long URL, a scorecard's audit grid) made the column wider than the
          panel and the whole modal scrolled sideways. `1fr` pins the column to
          the panel's width and lets the content inside wrap or scroll on its own.

          min-h-0 because a flex child's default min-height:auto refuses to
          shrink below its content, which would push the panel past max-h and put
          the scrollbar back on the page.
        */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 overflow-y-auto p-8">
          {children}
        </div>
        <DialogPrimitive.Close
          data-slot="dialog-close"
          aria-label="Close"
          className="absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-md bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <XIcon className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // pr-16 keeps the title clear of the 44px close target.
      className={cn("flex flex-col gap-2 pr-16", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-section", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-body text-foreground-2", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
}
