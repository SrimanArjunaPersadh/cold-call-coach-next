"use client"

import {
  cleanUrl,
  fmtRating,
  leadSub,
  leadTitle,
  normalizeHref,
  type Lead,
} from "@/lib/board"
import { cn } from "@/lib/utils"

// ══ The card face — §7, and only §7 ════════════════════════════════════════
//
// "Card face: business name, phone, maps rating, website link. Nothing else."
//
// The old app's card rendered seven things. Adjudicated 2026-07-29 in favour of
// §7: the Maps LINK chip is replaced by the maps RATING (§7 says rating), and
// the "No website" flag, the industry chip, the notes flag and the Call button
// are gone. The Call button is Phase 5 (call↔lead linking) and does not exist
// yet — it is not hidden here, it is unbuilt.

/**
 * `data-lead-card` is what the board's pointerdown handler keys off. It is on
 * the real card and NOWHERE else — in particular not on the loading skeleton,
 * which is the bug STATUS §4 warns about: a skeleton wearing this attribute
 * starts a drag with an undefined lead id.
 */
export const CARD_ATTR = "data-lead-card"

/** Display-only chip. Not interactive, so the 44px rule does not reach it. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      data-numeric
      className="inline-flex h-8 max-w-full items-center gap-1 truncate rounded-md bg-muted px-2 text-label font-medium text-foreground-2"
    >
      {children}
    </span>
  )
}

export function LeadCard({
  lead,
  dragging = false,
}: {
  lead: Lead
  /** The drag ghost: the one shadow (§4.3), and transparent to elementFromPoint. */
  dragging?: boolean
}) {
  const sub = leadSub(lead)
  const rating = fmtRating(lead.maps_rating)

  return (
    <div
      {...{ [CARD_ATTR]: "" }}
      data-id={lead.id}
      data-dragging={dragging ? "true" : undefined}
      className={cn(
        "cursor-grab touch-none rounded-lg border border-border bg-card p-2 select-none",
        dragging
          ? // pointer-events-none so document.elementFromPoint sees the column
            // underneath the card the finger is holding. Without it the drag
            // can only ever find itself.
            "pointer-events-none cursor-grabbing shadow-md"
          : "hover:border-muted-foreground/40",
      )}
    >
      <p className="truncate text-subhead">{leadTitle(lead)}</p>
      {sub ? (
        <p className="truncate text-label text-muted-foreground">{sub}</p>
      ) : null}

      {lead.phone || rating || lead.website ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {lead.phone ? <Chip>{lead.phone}</Chip> : null}

          {/* §7's one substitution: the rating, not a Maps link. No chip at all
              when there is no rating — today that is every hand-added lead. */}
          {rating ? (
            <Chip>
              <span aria-hidden>★</span>
              <span className="sr-only">Google rating</span>
              {rating}
            </Chip>
          ) : null}

          {lead.website ? (
            // A real link: it navigates. `data-chip-link` exempts it from the
            // drag (pointerdown returns early) and from click-to-edit (the
            // board stops its click in the CAPTURE phase, before the delegated
            // handler runs). draggable={false} kills the browser's own native
            // image/link drag, which would fight the pointer drag.
            //
            // The ::after is an invisible 44px-tall hit area (§10) centred on a
            // 32px chip. It deliberately wins over the card's edit target in the
            // few px it overlaps — a tap aimed at the link should open the link.
            <a
              data-chip-link=""
              href={normalizeHref(lead.website)}
              target="_blank"
              rel="noopener noreferrer"
              draggable={false}
              className="relative inline-flex h-8 max-w-full items-center truncate rounded-md bg-muted px-2 text-label font-medium text-primary underline-offset-4 hover:underline after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
            >
              {cleanUrl(lead.website)}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Two per column while the board loads (§4.4, STATUS §4). Reads as "a list is
 * coming" without towering over the real cards that replace it — and carries
 * NONE of the card's attributes, so a press on one does nothing at all.
 */
export function CardSkeleton() {
  return <div aria-hidden className="h-16 rounded-lg bg-muted" />
}
