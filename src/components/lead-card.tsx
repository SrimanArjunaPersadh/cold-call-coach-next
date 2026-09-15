"use client"

import { CheckIcon } from "lucide-react"

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
//
// PHASE 8C ADDS ONE THING, AND ONLY IN A MODE. Select mode puts a checkbox on
// the card and makes the card itself the control. §7's card face is NOT reopened
// by this: outside select mode `selectable` is false, nothing extra renders, and
// the card is byte-identical to Phase 4's. A permanent checkbox WAS considered
// and rejected for exactly that reason — it would be a fifth thing on the face
// §7 closed at four, and a second 44px target beside the drag on every card,
// forever, to serve an action taken once a month.

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

/**
 * The select-mode box. Presentational on purpose — `aria-hidden`, no input, no
 * tab stop — because the CARD carries `role="checkbox"` and `aria-checked`.
 *
 * A real `<input>` in here would be a second control inside the first: the tap
 * that toggles the card would also toggle the input, and a screen reader would
 * read two checkboxes where the eye sees one. §10's 44px rule is satisfied by
 * the card, which is the whole target.
 *
 * Cyan when checked, and that is the ONE place §4.1's accent belongs here:
 * a ticked box is direct interaction, not state, unlike the drop highlight.
 * The audit is on /styleguide — a full column of selected cards is ~0.8% of a
 * laptop viewport, well inside the 5% cap.
 */
function SelectBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card",
      )}
    >
      {checked ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
    </span>
  )
}

export function LeadCard({
  lead,
  dragging = false,
  selectable = false,
  selected = false,
}: {
  lead: Lead
  /** The drag ghost: the one shadow (§4.3), and transparent to elementFromPoint. */
  dragging?: boolean
  /** Select mode is on: the card is a checkbox and the drag is off. */
  selectable?: boolean
  /** Only meaningful while `selectable`. */
  selected?: boolean
}) {
  const sub = leadSub(lead)
  const rating = fmtRating(lead.maps_rating)

  return (
    <div
      {...{ [CARD_ATTR]: "" }}
      data-id={lead.id}
      data-dragging={dragging ? "true" : undefined}
      data-selected={selectable && selected ? "true" : undefined}
      // The card IS the checkbox in select mode — one control, one target, one
      // announcement. Outside it, none of these attributes exist and the card
      // is the plain div Phase 4 shipped.
      role={selectable ? "checkbox" : undefined}
      aria-checked={selectable ? selected : undefined}
      tabIndex={selectable ? 0 : undefined}
      className={cn(
        "rounded-lg border bg-card p-2 select-none",
        selectable
          ? // No grab cursor: in select mode the card does not move, and a
            // cursor promising a drag that will not happen is a small lie.
            //
            // AND NO `touch-none`. That class exists to stop the browser
            // scrolling instead of dragging, and in select mode there is no
            // drag to protect — leaving it on would mean a finger on a card
            // could not scroll the column, which on a phone is most of the
            // board. The mode gives the gesture back to the browser.
            "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          : "cursor-grab touch-none",
        selected ? "border-primary" : "border-border",
        dragging
          ? // pointer-events-none so document.elementFromPoint sees the column
            // underneath the card the finger is holding. Without it the drag
            // can only ever find itself.
            "pointer-events-none cursor-grabbing shadow-md"
          : !selected && "hover:border-muted-foreground/40",
      )}
    >
      {selectable ? (
        <div className="flex items-start gap-2">
          <SelectBox checked={selected} />
          <p className="min-w-0 flex-1 truncate text-subhead">{leadTitle(lead)}</p>
        </div>
      ) : (
        <p className="truncate text-subhead">{leadTitle(lead)}</p>
      )}
      {/* Indented past the box in select mode so the card reads as one column
          of content with a control beside it, rather than a tick floating above
          a paragraph. 28px = the 20px box + the 8px gap, both on §4.3's scale. */}
      <div className={cn(selectable && "pl-7")}>
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
