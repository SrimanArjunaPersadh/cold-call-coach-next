"use client"

import { useEffect, useRef, useState } from "react"

import type { ToastTone } from "@/components/toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Lead } from "@/lib/board"
import { fmtTime } from "@/lib/format"
import { errorText, leadsApi } from "@/lib/leads-api"
import {
  SA_LOCATIONS,
  SCRAPE_DEFAULTS,
  SCRAPE_FAILED,
  SCRAPE_NO_RESULTS,
  scrapeOutcome,
  scrapeRequest,
  type ScrapeRequest,
  type ScrapeResult,
} from "@/lib/scrape"
import { cn } from "@/lib/utils"

// ══ Find leads on Google Maps (Phase 6) ════════════════════════════════════
//
// THE ROUTE ALREADY EXISTS AND IS NOT TOUCHED. `POST /api/scrape` shipped in
// Phase 1 with the 25-result clamp, the phone-first dedup and the review filter
// in it, and it holds the Apify token. This is a form, a loading panel and a
// toast — the whole client side of the feature, exactly as the old app had it.
//
// Ported from index.html's `#scrape-modal` + its submit handler. Radix's Dialog
// replaces the hand-rolled overlay for the same three behaviours the lead modal
// reaches for it: Escape closes, backdrop closes, focus is trapped and restored.
//
// It stays NARROW (512px). §4.3's 1024px rule is for a modal carrying a
// scorecard; this carries four fields, and a 1024px-wide keyword input is the
// failure that rule was written against, pointing the other way.

/** Errors and empty outcomes are semantic (§4.1); nothing else here is coloured. */
type StatusTone = "warn" | "fail"
type Status = { text: string; tone: StatusTone } | null

const STATUS_TEXT: Record<StatusTone, string> = {
  warn: "text-warn",
  fail: "text-fail",
}

type ScrapeModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The inserted rows, for the board to merge. Never called with an empty run. */
  onScraped: (leads: Lead[]) => void
  toast: (text: string, tone?: ToastTone) => void
}

export function ScrapeModal({
  open,
  onOpenChange,
  onScraped,
  toast,
}: ScrapeModalProps) {
  /**
   * The search in flight, or null. It doubles as the busy flag because the
   * loading panel has to name what it is waiting for — "searching" without the
   * query is the greyed-out screen this state was rebuilt to replace.
   */
  const [running, setRunning] = useState<ScrapeRequest | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [elapsed, setElapsed] = useState(0)

  /**
   * `running` mirrored into a ref, written only from the submit handler below.
   *
   * The reset effect has to read "is a search going?" WITHOUT depending on it.
   * On a failed search `setStatus(error)` and `setRunning(null)` land in the same
   * commit, so an effect that listed `running` as a dependency would fire right
   * after and wipe the error it was put there to show.
   */
  const runningRef = useRef<ScrapeRequest | null>(null)
  const markRunning = (value: ScrapeRequest | null) => {
    runningRef.current = value
    setRunning(value)
  }

  /**
   * The old app's `openScrapeModal` reset the form, the status and the button on
   * every open. The fields reset themselves here — Radix unmounts the panel on
   * close, so `defaultValue` re-applies — which leaves the status line.
   *
   * ONE DELIBERATE DEVIATION, and it is a money one. The old reset also re-enabled
   * the run button unconditionally, so closing the modal mid-search and reopening
   * it bought a second Apify run for the same query. The disabled button existed
   * "against double-spend" (old STATUS §four-states); honouring that intent means
   * a reopened panel shows the search still going — with its query and its clock —
   * rather than an empty form offering to pay for the same answer twice.
   */
  useEffect(() => {
    if (open && !runningRef.current) setStatus(null)
  }, [open])

  /**
   * The clock on the loading panel. Measured from a wall-clock start rather than
   * counted in ticks, so a phone that throttles a background tab reports the real
   * elapsed time when you come back to it instead of a number that fell behind.
   */
  useEffect(() => {
    if (!running) return
    const startedAt = Date.now()
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    )
    return () => clearInterval(id)
  }, [running])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (key: string) => String(form.get(key) ?? "")

    const body = scrapeRequest({
      keyword: value("keyword"),
      location: value("location"),
      maxResults: value("maxResults"),
      minReviews: value("minReviews"),
    })

    // `required` on the input catches empty; this catches whitespace, which
    // `required` does not. A toast rather than the status line, as in the old
    // app: nothing has been attempted yet, so there is no progress to report.
    if (!body.keyword) {
      toast("Enter what you want to search for", "err")
      return
    }

    // Before the await, and it takes the form off screen with it — this call
    // spends Apify credits and there is nothing to fill in for the next minute.
    // The clock is zeroed HERE rather than in the effect that ticks it: a
    // setState in an effect body is a cascading render, and the search starting
    // is an event, which is where state changes belong.
    setElapsed(0)
    markRunning(body)
    setStatus(null)

    try {
      const data = await leadsApi<ScrapeResult>(
        "/api/scrape",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
        SCRAPE_FAILED,
      )

      // The actor ran and Maps had nothing: the EMPTY state, in the modal, with
      // the keyword still in the field. Not a toast — the next move is to edit
      // the words, and closing the modal to say so would throw them away.
      if (!data.scraped) {
        setStatus({ text: SCRAPE_NO_RESULTS, tone: "warn" })
        return
      }

      onScraped(data.leads || [])
      onOpenChange(false)
      const outcome = scrapeOutcome(data)
      toast(outcome.text, outcome.tone)
    } catch (err) {
      // `leadsApi` throws the ROUTE's message, which is already per-code copy —
      // "Lead search isn't configured (missing Apify token)", "Search timed out.
      // Try a narrower search or fewer results", "Google Maps search failed."
      // The old app kept its own `code` → copy table and duplicated all three;
      // one source of truth for the wording is the better translation.
      setStatus({ text: errorText(err, SCRAPE_FAILED), tone: "fail" })
    } finally {
      markRunning(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No `onOpenAutoFocus` override, unlike the lead modal. Radix focuses the
          first tabbable child and selects its text — which is the footgun there
          (an edit form opens with the contact name highlighted) and the right
          behaviour here: the keyword field is empty, so there is nothing to
          select and nothing to lose, and you opened this to type. That is the
          old app's `setTimeout(() => keyword.focus(), 30)`. */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Find leads on Google Maps</DialogTitle>
          <DialogDescription>
            Search Google Maps for businesses and add them straight to your
            board. Phone, website, address and rating come in automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {/* HIDDEN, not unmounted, while a search runs.
              The inputs are uncontrolled, so unmounting them would drop what was
              typed — and the failure path is specified to leave the modal open
              with everything still in it, so that pressing Search again is a
              retry rather than a re-entry (§4.4). `hidden` keeps the values and
              takes the fields out of the tab order at the same time. */}
          <div className={cn("flex flex-col gap-4", running && "hidden")}>
            <div>
              <label htmlFor="scrape-keyword" className="eyebrow mb-2 block">
                What are you looking for? *
              </label>
              <Input
                id="scrape-keyword"
                name="keyword"
                type="text"
                placeholder="e.g. dentist, plumber, gym"
                required
              />
            </div>

            <div>
              <label htmlFor="scrape-location" className="eyebrow mb-2 block">
                Location
              </label>
              {/* Suggestions, not a picker (added 2026-07-30 at the owner's
                  request). `list` keeps the input FREE TEXT — the dropdown
                  narrows as you type and an area that is not on the list is
                  still typeable, so this can only ever save keystrokes.

                  Native `<datalist>` rather than a second combobox: the browser
                  supplies the filtering, the keyboard handling and, on a phone,
                  the OS picker — none of which can drift from §4 or §10 because
                  none of it is ours. If the phone renders it too thinly to use,
                  the fallback is the combobox pattern lead-combobox.tsx already
                  owns, and that is a swap of this one attribute.

                  autoComplete="off" so the browser's own form history does not
                  cover the suggestion list with what was typed last week. */}
              <Input
                id="scrape-location"
                name="location"
                type="text"
                list="scrape-locations"
                autoComplete="off"
                defaultValue={SCRAPE_DEFAULTS.location}
              />
              <datalist id="scrape-locations">
                {SA_LOCATIONS.map((location) => (
                  <option key={location} value={location} />
                ))}
              </datalist>
            </div>

            {/* The two numbers pair up. Both are three characters wide, and a
                modal-width input for "10" is the §4.3 complaint about letterboxed
                content wearing the other shoe. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="scrape-max" className="eyebrow mb-2 block">
                  How many? (max 25)
                </label>
                <Input
                  id="scrape-max"
                  name="maxResults"
                  type="number"
                  min={1}
                  max={25}
                  defaultValue={SCRAPE_DEFAULTS.maxResults}
                  data-numeric
                />
              </div>
              <div>
                <label
                  htmlFor="scrape-min-reviews"
                  className="eyebrow mb-2 block"
                >
                  Min reviews
                </label>
                <Input
                  id="scrape-min-reviews"
                  name="minReviews"
                  type="number"
                  min={0}
                  defaultValue={SCRAPE_DEFAULTS.minReviews}
                  data-numeric
                />
              </div>
            </div>
          </div>

          {/* ── The loading state (§4.4) ──────────────────────────────────
              Not a greyed-out form. A disabled form says "you can't", never
              "something is happening" — and for 30–90 seconds of silence that
              reads as broken, which is exactly what it was called on screen.

              This is the RECORDING INDICATOR from the Coach panel, reused rather
              than reinvented: `bg-muted` inset, a 2px pulsing dot, an eyebrow and
              a live `fmtTime` clock. Both treatments are already on /styleguide,
              so nothing new is introduced here (§4's restyle rule) — and the two
              signals it carries are the two the owner has no other way to get:
              WHAT is being searched, and HOW LONG it has been going.

              No skeleton rows, deliberately, though §4.4's loading state names
              them: a skeleton stands in for content about to appear IN ITS PLACE,
              and no lead ever appears in this modal. They land on the board
              behind it. Three grey bars here would point at the wrong screen.

              State, not interaction — so, like the recording indicator and the
              board's drop highlight, no cyan. */}
          {running ? (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-4">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  className="size-2 shrink-0 animate-pulse rounded-md bg-foreground"
                />
                <span className="eyebrow">Searching Google Maps</span>
                <span
                  data-numeric
                  role="timer"
                  aria-live="off"
                  className="text-subhead"
                >
                  {fmtTime(elapsed)}
                </span>
              </div>
              {/* What is actually being searched. The location is only named
                  when one was typed — a blank field means the ROUTE picks the
                  default, and printing it here would be this screen claiming to
                  know a decision it does not make. */}
              <p className="text-body">
                {[running.keyword, running.location].filter(Boolean).join(" · ")}
              </p>
              <p className="text-label text-muted-foreground">
                Usually 30–90 seconds. Closing this panel is fine — the leads
                land on the board when the search finishes. Leaving the Leads tab
                means you will need Refresh to see them.
              </p>
            </div>
          ) : null}

          {/*
            The live region is ALWAYS mounted and only its text is conditional —
            the lesson `<Toast />` carries in its own comment: a region that
            appears together with its message is often never announced at all.
            It sits OUTSIDE the wrapper that hides during a search for the same
            reason; a region revealed with its text is a region that stays quiet.
          */}
          <p
            role="status"
            aria-live="polite"
            className={cn(
              "text-body",
              status ? STATUS_TEXT[status.tone] : undefined,
            )}
          >
            {status?.text ?? ""}
          </p>

          <DialogFooter>
            {running ? (
              // "Close", not "Cancel": this does not stop the run. The credits
              // are spent the moment the actor starts, the route inserts before
              // it answers, and aborting here would only throw away the rows we
              // already paid for. One honest button beats a lying one.
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Close
                </Button>
              </DialogClose>
            ) : (
              <>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit">Search Google Maps</Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
