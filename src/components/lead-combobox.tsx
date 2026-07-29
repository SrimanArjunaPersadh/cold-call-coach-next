"use client"

// ══ The attach-to-lead combobox (Phase 5) ═══════════════════════════════════
//
// Translated from `setupLeadCombo` (index.html:1723–1794), and built to §10's
// dropdown convention rather than to a primitive: **selection fires on
// `onmousedown` with `preventDefault()`**, so the choice lands before the input
// blurs. That one line is the whole reason this is hand-rolled. A `click`
// handler here loses the race on a phone — the input blurs, React re-renders the
// menu closed, and the tap hits nothing. Do not "simplify" it to onClick.
//
// The rest is the old app's keyboard contract, unchanged: click-outside closes,
// Enter picks the active row, Escape closes, arrows move. The filtering and the
// arrow arithmetic live in lib/lead-combo.ts, tested without a DOM.

import { useEffect, useId, useMemo, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import type { Lead } from "@/lib/board"
import { filterLeads, leadBusinessName, nextActiveIndex } from "@/lib/lead-combo"
import { cn } from "@/lib/utils"

export type LeadComboboxProps = {
  id?: string
  leads: readonly Lead[]
  /** The query text, owned by the parent so it can show the linked lead's name. */
  value: string
  onValueChange: (value: string) => void
  onSelect: (lead: Lead) => void
  disabled?: boolean
  placeholder?: string
}

export function LeadCombobox({
  id,
  leads,
  value,
  onValueChange,
  onSelect,
  disabled = false,
  placeholder = "Search business or phone",
}: LeadComboboxProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = `${useId()}-lead-options`

  const items = useMemo(() => filterLeads(leads, value), [leads, value])

  // Click-outside, on `mousedown` to match the option handler below — a listener
  // on `click` would fire after the option's mousedown had already closed and
  // reopened things, and the menu would flicker.
  useEffect(() => {
    if (!open) return
    const onDocDown = (event: MouseEvent) => {
      const node = event.target
      if (node instanceof Node && wrapRef.current?.contains(node)) return
      setOpen(false)
      setActive(-1)
    }
    document.addEventListener("mousedown", onDocDown)
    return () => document.removeEventListener("mousedown", onDocDown)
  }, [open])

  const choose = (index: number) => {
    const lead = items[index]
    if (!lead) return
    setOpen(false)
    setActive(-1)
    onSelect(lead)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(-1)
        return
      }
      setActive((i) => nextActiveIndex(i, event.key === "ArrowDown" ? 1 : -1, items.length))
      return
    }
    if (event.key === "Enter" && open && active >= 0) {
      event.preventDefault()
      choose(active)
      return
    }
    if (event.key === "Escape" && open) {
      event.preventDefault()
      // Stops the Dialog this can sit inside from closing on the same Escape —
      // the first press should close the menu, the second the modal.
      event.stopPropagation()
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        // Only while it exists — the listbox is unmounted when closed, and a
        // dangling aria-controls is a reference a screen reader cannot resolve.
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setActive(-1)
          setOpen(true)
          onValueChange(event.target.value)
        }}
        onKeyDown={onKeyDown}
      />

      {open ? (
        <div
          id={listId}
          role="listbox"
          // A floating surface, so it takes the one shadow (§4.3). max-h caps it
          // at roughly six 44px rows so the menu never covers the whole screen
          // on a phone.
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-md"
          // THE LINE THAT MATTERS (§10). mousedown fires before blur, and
          // preventDefault stops the input losing focus at all, so the selection
          // lands instead of being cancelled by the re-render.
          onMouseDown={(event) => {
            const option = (event.target as HTMLElement | null)?.closest(
              "[data-combo-option]",
            ) as HTMLElement | null
            if (!option) return
            event.preventDefault()
            choose(Number(option.dataset.comboOption))
          }}
        >
          {items.length ? (
            items.map((lead, i) => (
              <div
                key={lead.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                data-combo-option={i}
                // 44px minimum (§10) — this is verified with a thumb.
                className={cn(
                  "flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2",
                  i === active ? "bg-muted" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 truncate text-body">
                  {leadBusinessName(lead)}
                </span>
                {lead.phone ? (
                  <span
                    data-numeric
                    className="shrink-0 text-label text-muted-foreground"
                  >
                    {lead.phone}
                  </span>
                ) : null}
              </div>
            ))
          ) : (
            // §4.4 empty, and STATUS §4's copy verbatim.
            <p className="px-4 py-2 text-body text-muted-foreground">
              No leads match.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
