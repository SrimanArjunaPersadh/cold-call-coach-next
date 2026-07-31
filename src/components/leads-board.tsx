"use client"

// ══ The CRM kanban (Phase 4) ═══════════════════════════════════════════════
//
// Six stage columns, pointer drag with edge autoscroll, and the add/edit/delete
// modal. Translated from the old app's index.html; the behaviour is the
// reference, React is only the syntax.
//
// Phase 6 added one thing here: the Find leads button and the merge handler for
// what the scraper inserts. The board is where the toolbar lives and where the
// rows have to land, so that is all it owns of that feature — the form, the
// status line and the outcome toast are `<ScrapeModal />`.
//
// §7 AMENDED 2026-07-29: `not_interested` was specified as a collapsed
// count-chip rail. It is a full column now — see the note on STAGES in
// lib/board.ts. The rail's machinery was deleted, not disabled.
//
// Built failure-paths-first, like Phase 3: loading, error, empty and the
// rollback are what actually happen on a phone in a parking lot, and building
// them first is why they work.
//
// WHY POINTER EVENTS AND NOT HTML5 DRAG-AND-DROP — do not "modernise" this.
// Native DnD silently failed on cards containing links, could not autoscroll
// the horizontally-overflowing board, and never fires on touch at all. Pointer
// events give one code path for mouse and finger, and full control of both.
//
// The one React-specific translation: the old app REPARENTED the card element
// into the target column on every move. Mutating the DOM under React is how you
// get a crash on the next render, so the drag instead drives one piece of state
// — `over`, the slot under the pointer — and React does the moving. Every
// observable behaviour is unchanged.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { CardSkeleton, LeadCard } from "@/components/lead-card"
import { LeadModal } from "@/components/lead-modal"
import { ScrapeModal } from "@/components/scrape-modal"
import { SecretModal } from "@/components/secret-modal"
import { Toast, useToast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import {
  dropIndex,
  groupByStage,
  isNoOpMove,
  positionForDrop,
  STAGES,
  type CardRect,
  type Lead,
} from "@/lib/board"
import { errorText, leadsApi } from "@/lib/leads-api"
import { leadsCache } from "@/lib/leads-cache"
import { takeOpenLead } from "@/lib/open-lead"
import { cn } from "@/lib/utils"

/** px of movement before a press becomes a drag, so a tap still opens the editor. */
const DRAG_THRESHOLD = 5
/** px hot-zone at each edge of the board that triggers autoscroll. */
const AUTOSCROLL_EDGE = 72
/** px per rAF tick while the pointer sits in the hot zone. */
const AUTOSCROLL_STEP = 16
/** ms after a drag during which the synthesised click must not open the modal. */
const SUPPRESS_CLICK_MS = 50

/** Where the dragged card is going — and, since every column can draw it, where
 *  it is drawn. */
type Slot = { stage: string; index: number }

export function LeadsBoard() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalLead, setModalLead] = useState<Lead | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [scrapeOpen, setScrapeOpen] = useState(false)

  /** The card being dragged (null = no drag). Drives `.dragging` on the card. */
  const [dragId, setDragId] = useState<string | null>(null)
  /**
   * The slot under the pointer: both where the card is drawn and where it will
   * land. These were two states while the terminal rail existed, because a
   * collapsed rail could accept a drop it could not draw. Every stage is a full
   * column now, so there is one answer again. Null = still in its origin slot.
   */
  const [over, setOver] = useState<Slot | null>(null)

  const { toast, message } = useToast()

  const boardRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  /** The lead the dashboard asked us to open, held across a FAILED load so the
   *  retry still answers it. Cleared the moment a load succeeds. */
  const openLeadRef = useRef<string | null>(null)

  /** Read by the pointer handlers, which are created once per drag. */
  const leadsRef = useRef(leads)
  leadsRef.current = leads

  const drag = useRef({
    id: null as string | null,
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    active: false,
    over: null as Slot | null,
  })
  const listeners = useRef<{
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
  } | null>(null)
  const suppressClick = useRef(false)
  /** Autoscroll direction per axis: -1, 0 or 1. Both, since the board scrolls both. */
  const autoDir = useRef({ x: 0, y: 0 })
  const autoRAF = useRef(0)

  // ── Load ────────────────────────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Phase 7's tap-through: the dashboard's last-call hero hands over a lead id
    // and navigates here, because §8's "full scorecard" already exists inside
    // this modal and no route returns one call on its own.
    //
    // Taken from sessionStorage before the await — read-and-clear, the same
    // contract as Phase 5's Call-this-lead handoff (`lib/pending-call.ts`), so
    // it can never be answered twice.
    //
    // It then survives IN A REF until a load actually succeeds, and that is the
    // fix for a real hole: taking the key and returning down the failure path
    // below consumed the intent and dropped it. Tap the hero on a bad
    // connection, get the board's error state, hit Refresh — the rows arrive and
    // the modal never opens, with nothing on screen explaining why, and the only
    // way back is to walk to /dashboard and tap again. The ref is cleared only
    // once the request the intent belongs to has landed.
    const requested = takeOpenLead() ?? openLeadRef.current
    openLeadRef.current = requested

    let failure: unknown = null
    let rows: Lead[] = []
    try {
      // Through the shared cache (Phase 5), so the Coach attach-combobox can join
      // THIS request rather than firing a second GET — the dedup STATUS §4
      // describes, which used to come free when Coach and Leads were one
      // document. `true` forces the fetch, so the board still always reloads on
      // mount and on Refresh: Phase 4's observable behaviour is unchanged.
      rows = await leadsCache.load(true)
    } catch (err) {
      failure = err
    }
    setLoading(false)
    if (failure) {
      // The board is replaced by the message (§4.4, and the ruling for this
      // phase). The old app had to restore the header count by hand here
      // because it had just painted skeletons; ours is derived from `leads`,
      // which the failed fetch never touched, so it restores itself.
      setError(errorText(failure, "Could not load leads"))
      return
    }
    setLeads(rows)

    // Post-await, so nothing here is a synchronous state write inside the mount
    // effect. A lead that is no longer on the board SAYS SO rather than opening
    // nothing at all — deleted between the dashboard rendering it and the tap.
    openLeadRef.current = null
    if (requested) {
      const lead = rows.find((l) => String(l.id) === String(requested))
      if (lead) {
        setModalLead(lead)
        setModalOpen(true)
      } else {
        toast("That lead is no longer on the board.", "err")
      }
    }
  }, [toast])

  /**
   * One in-flight GET, however many callers ask. In the old app the callers
   * were the Leads tab, the Coach attach-combobox and Refresh; here it is mount
   * and Refresh — but a double-tapped Refresh is the same race, and the second
   * caller must await the first rather than fire a duplicate.
   */
  const inFlight = useRef<Promise<void> | null>(null)
  const loadLeads = useCallback(() => {
    if (!inFlight.current) {
      inFlight.current = fetchLeads().finally(() => {
        inFlight.current = null
      })
    }
    return inFlight.current
  }, [fetchLeads])

  useEffect(() => {
    void loadLeads()
  }, [loadLeads])

  /**
   * Keep the shared cache in step with the board.
   *
   * Without this the Coach combobox could offer a lead that was renamed or
   * deleted here minutes ago, since it reads the cache rather than re-fetching.
   * Done in an effect rather than inside the `setLeads` updaters because an
   * updater must stay a pure function of `prev` — React is free to call it twice.
   */
  useEffect(() => {
    if (!loading && !error) leadsCache.publish(leads)
  }, [leads, loading, error])

  // ── Move: optimistic, then PATCH, then roll back if it failed ───────────

  const persistMove = useCallback(
    async (
      id: string,
      stage: string,
      position: number,
      prevStage: string | null | undefined,
      prevPosition: number | null | undefined,
    ) => {
      try {
        await leadsApi(
          `/api/leads?id=${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ stage, position }),
          },
          "Move failed",
        )
      } catch (err) {
        // Revert BOTH, visibly, and say so. A silent revert is the failure mode
        // §4.4 names by name.
        setLeads((prev) =>
          prev.map((lead) =>
            String(lead.id) === String(id)
              ? { ...lead, stage: prevStage ?? null, position: prevPosition ?? null }
              : lead,
          ),
        )
        toast(errorText(err, "Could not move lead"), "err")
      }
    },
    [toast],
  )

  const commitMove = useCallback(
    (id: string, stage: string, index: number) => {
      const current = leadsRef.current
      const lead = current.find((l) => String(l.id) === String(id))
      if (!lead) return

      // Neighbours come from the DATA, not the DOM: the positions already in
      // the target column, minus this card. `index` is clamped because a drop
      // resolved against stale geometry must never index past the column.
      const neighbours = (groupByStage(current)[stage] ?? [])
        .filter((l) => String(l.id) !== String(id))
        .map((l) => Number(l.position) || 0)
      const slot = Math.min(Math.max(index, 0), neighbours.length)
      const position = positionForDrop(neighbours, slot)

      // Nothing moved → no PATCH at all.
      if (isNoOpMove(lead, stage, position)) return

      const prevStage = lead.stage
      const prevPosition = lead.position
      setLeads((prev) =>
        prev.map((l) =>
          String(l.id) === String(id) ? { ...l, stage, position } : l,
        ),
      )
      void persistMove(id, stage, position, prevStage, prevPosition)
    },
    [persistMove],
  )

  // ── Edge autoscroll ─────────────────────────────────────────────────────
  // On a rAF loop, so the board keeps scrolling while the pointer is held
  // still in the hot zone — the whole point of it on a phone.
  //
  // BOTH AXES since 2026-07-30, and that is not a feature, it is the cost of the
  // pane. While the document did the vertical scrolling, a drag could not scroll
  // it at all and every slot in a tall column was already out of reach; now the
  // board owns that scroll, so the drag can reach them — and has to, because the
  // pane's fold is closer than the page's was.

  const autoTick = useCallback(function tick() {
    const { x, y } = autoDir.current
    if (!x && !y) {
      autoRAF.current = 0
      return
    }
    const board = boardRef.current
    if (board) {
      if (x) board.scrollLeft += x * AUTOSCROLL_STEP
      if (y) board.scrollTop += y * AUTOSCROLL_STEP
    }
    autoRAF.current = requestAnimationFrame(tick)
  }, [])

  const updateAutoscroll = useCallback(
    (x: number, y: number) => {
      const board = boardRef.current
      if (!board) return
      const rect = board.getBoundingClientRect()
      autoDir.current = {
        x:
          x < rect.left + AUTOSCROLL_EDGE
            ? -1
            : x > rect.right - AUTOSCROLL_EDGE
              ? 1
              : 0,
        y:
          y < rect.top + AUTOSCROLL_EDGE
            ? -1
            : y > rect.bottom - AUTOSCROLL_EDGE
              ? 1
              : 0,
      }
      if (
        (autoDir.current.x || autoDir.current.y) &&
        !autoRAF.current
      ) {
        autoRAF.current = requestAnimationFrame(autoTick)
      }
    },
    [autoTick],
  )

  // ── The drag itself ─────────────────────────────────────────────────────

  const detachListeners = useCallback(() => {
    const l = listeners.current
    if (!l) return
    document.removeEventListener("pointermove", l.move)
    document.removeEventListener("pointerup", l.up)
    document.removeEventListener("pointercancel", l.up)
    listeners.current = null
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return // left only
      const target = event.target as HTMLElement | null
      if (!target) return
      // Let the website chip click and navigate. It is a real link.
      if (target.closest("[data-chip-link]")) return
      const card = target.closest("[data-lead-card]") as HTMLElement | null
      if (!card) return
      const id = card.dataset.id
      if (!id) return

      drag.current = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        over: null,
      }

      const move = (e: PointerEvent) => {
        const d = drag.current
        if (e.pointerId !== d.pointerId || !d.id) return

        if (!d.active) {
          // Promote to a real drag only past the threshold, so a tap is a tap.
          if (
            Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <
            DRAG_THRESHOLD
          ) {
            return
          }
          d.active = true
          setDragId(d.id)
          // The board's scroll-snap re-snaps scrollLeft to a column boundary
          // after every programmatic nudge, which stalls the edge autoscroll.
          // Off for the duration, restored on release.
          if (boardRef.current) boardRef.current.style.scrollSnapType = "none"
        }

        e.preventDefault()
        updateAutoscroll(e.clientX, e.clientY)

        // The dragged card is pointer-events:none, so this sees the column
        // underneath the finger rather than the card itself.
        const under = document.elementFromPoint(
          e.clientX,
          e.clientY,
        ) as HTMLElement | null
        const zone = under?.closest("[data-drop-stage]") as HTMLElement | null
        if (!zone) return

        const stage = zone.dataset.dropStage
        if (!stage) return

        // Exclude by id, not by the `.dragging` attribute: on the very frame
        // the drag is promoted, React has not re-rendered yet and the
        // attribute is not on the card, which would offset every index by one.
        const cards = zone.querySelectorAll<HTMLElement>(
          `[data-lead-card]:not([data-id="${d.id}"])`,
        )
        const rects: CardRect[] = Array.from(cards, (el) => {
          const r = el.getBoundingClientRect()
          return { top: r.top, height: r.height }
        })
        const index = dropIndex(rects, e.clientY)

        if (d.over && d.over.stage === stage && d.over.index === index) return
        d.over = { stage, index }
        setOver(d.over)
      }

      const up = (e: PointerEvent) => {
        const d = drag.current
        if (e.pointerId !== d.pointerId) return
        detachListeners()
        autoDir.current = { x: 0, y: 0 }
        if (boardRef.current) boardRef.current.style.scrollSnapType = "" // restore

        const { id: draggedId, active, over: target } = d
        drag.current = {
          id: null,
          pointerId: null,
          startX: 0,
          startY: 0,
          active: false,
          over: null,
        }
        setDragId(null)
        setOver(null)

        if (!active) return
        // pointerup synthesises a click; keep it from opening the editor.
        suppressClick.current = true
        setTimeout(() => {
          suppressClick.current = false
        }, SUPPRESS_CLICK_MS)

        if (draggedId && target) commitMove(draggedId, target.stage, target.index)
      }

      listeners.current = { move, up }
      document.addEventListener("pointermove", move)
      document.addEventListener("pointerup", up)
      document.addEventListener("pointercancel", up)
    },
    [commitMove, detachListeners, updateAutoscroll],
  )

  // Tear the drag down if the board unmounts mid-gesture.
  useEffect(
    () => () => {
      detachListeners()
      if (autoRAF.current) cancelAnimationFrame(autoRAF.current)
    },
    [detachListeners],
  )

  /**
   * A press on a card must never begin a text selection — otherwise dragging
   * paints the board blue, and a press on the website link becomes a selection
   * instead of a navigation. Native listener because React has no onSelectStart.
   */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onSelectStart = (e: Event) => {
      const node =
        e.target instanceof Element ? e.target : (e.target as Node)?.parentElement
      if (node instanceof Element && node.closest("[data-lead-card]")) {
        e.preventDefault()
      }
    }
    el.addEventListener("selectstart", onSelectStart)
    return () => el.removeEventListener("selectstart", onSelectStart)
  }, [])

  // ── Click → edit ────────────────────────────────────────────────────────

  const onBoardClick = useCallback((event: React.MouseEvent) => {
    if (suppressClick.current) return
    const card = (event.target as HTMLElement | null)?.closest(
      "[data-lead-card]",
    ) as HTMLElement | null
    if (!card) return
    const lead = leadsRef.current.find(
      (l) => String(l.id) === String(card.dataset.id),
    )
    if (!lead) return
    setModalLead(lead)
    setModalOpen(true)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────

  const groups = useMemo(() => groupByStage(leads), [leads])
  const dragged = dragId
    ? (leads.find((l) => String(l.id) === String(dragId)) ?? null)
    : null

  /**
   * The cards a stage draws right now: its own, with the dragged card lifted
   * out and re-inserted where the pointer is. Before the pointer has found a
   * column the card has not left its origin, so nothing moves.
   */
  const listFor = (stageKey: string): Lead[] => {
    const base = groups[stageKey] ?? []
    if (!dragged || !over) return base
    const others = base.filter((l) => String(l.id) !== String(dragged.id))
    if (over.stage !== stageKey) return others
    const at = Math.min(Math.max(over.index, 0), others.length)
    return [...others.slice(0, at), dragged, ...others.slice(at)]
  }

  const openAdd = () => {
    setModalLead(null)
    setModalOpen(true)
  }

  const onSaved = (saved: Lead) => {
    setLeads((prev) => {
      const i = prev.findIndex((l) => String(l.id) === String(saved.id))
      if (i < 0) return [...prev, saved]
      const next = [...prev]
      next[i] = saved
      return next
    })
  }

  const onDeleted = (id: string) => {
    setLeads((prev) => prev.filter((l) => String(l.id) !== String(id)))
  }

  /**
   * Scraped rows land at the end of the list (Phase 6), and `groupByStage` puts
   * them in `new` ordered by the `Date.now()`-based positions the route wrote —
   * so they arrive at the bottom of the New column, newest last. That is the old
   * app's `data.leads.forEach(l => crm.leads.push(l)); renderBoard()`.
   *
   * No refetch: the route returns the inserted rows with `return=representation`,
   * and a GET here would race nothing useful while costing a round trip on the
   * phone. The `leadsCache` publish effect above picks them up, so Coach's
   * attach-combobox can offer a lead scraped a moment ago.
   */
  const onScraped = (rows: Lead[]) => {
    if (!rows.length) return
    setLeads((prev) => {
      // Merged by id, not appended. The route only ever returns rows it just
      // inserted, so a collision needs a Refresh whose GET landed in the narrow
      // window between that insert and this response — rare, but it costs two
      // identical cards and a duplicate React key, and merging makes it a no-op.
      const known = new Set(prev.map((l) => String(l.id)))
      const fresh = rows.filter((l) => !known.has(String(l.id)))
      return fresh.length ? [...prev, ...fresh] : prev
    })
  }

  return (
    // NOT <Container>. Every other page takes the shell's 1152px measure
    // because prose and scorecards want one; a kanban is a datagrid and wants
    // width. The header keeps the same 16/32px gutters as the board so the
    // toolbar and the columns share an edge.
    //
    // A PANE, NOT A PAGE (§7's third amendment, 2026-07-30). Fixed to
    // `--board-h`, so /leads never scrolls the document: the toolbar stays put,
    // the board scrolls inside itself, and the stage headers can pin. Coach and
    // Dashboard are untouched and still scroll the page — they are reading
    // surfaces, and the shell was deliberately left alone so that Phase 5's
    // "Call this lead" scroll-to-top keeps working.
    <div className="flex h-[var(--board-h)] w-full flex-col gap-8 px-4 pb-4 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-title">Leads</h1>
          {/* `·`, never `0`: while loading the count is unknown, and "0" is a
              claim about the data that the loading state exists to avoid. */}
          <span data-numeric className="text-section text-muted-foreground">
            {loading ? "·" : leads.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-4">
          {/* All three controls refetch or mutate the board. Live during a
              fetch, each one's success handler would race the in-flight GET —
              which was issued before the insert and would land last, dropping
              it. Order and emphasis are the old toolbar's: Refresh, Find leads,
              then the one primary. (Import CSV sat between them there; §3 CUT
              it.) Find leads is `outline`, not primary — two cyan buttons side
              by side make the reader pick which one the screen is about, and at
              ≤5% of the viewport (§4.1) there is room for exactly one.

              The two MUTATING controls are also dead while the board is in its
              error state (added 2026-07-30). The error branch below replaces the
              columns with the message, so a lead added or scraped from there
              really does land in Postgres and really is invisible: the toast
              says "5 added" over a board that cannot show them, which reads as a
              broken scraper rather than a failed load. Refresh stays live — it
              is the retry. */}
          <Button variant="outline" onClick={() => void loadLeads()} disabled={loading}>
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => setScrapeOpen(true)}
            disabled={loading || !!error}
          >
            Find leads
          </Button>
          <Button onClick={openAdd} disabled={loading || !!error}>
            Add lead
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-border bg-card p-8 text-body text-fail">
          {error}
        </p>
      ) : (
        <div
          ref={wrapRef}
          // min-h-0 so this wrapper can be shorter than its content and let the
          // board inside it scroll. Without it a flex child refuses to shrink
          // below its content height and the pane grows past the viewport.
          className="flex min-h-0 flex-1 flex-col"
          onPointerDown={onPointerDown}
          // Capture phase: the website chip's click is stopped before the
          // delegated click-to-edit handler below ever sees it, so the link
          // navigates without also opening the editor.
          onClickCapture={(e) => {
            if ((e.target as HTMLElement | null)?.closest("[data-chip-link]")) {
              e.stopPropagation()
            }
          }}
          onClick={onBoardClick}
        >
          {/* ── Six columns, one row (§7 as amended twice) ─────────────────
              The row is full-bleed: a kanban is a datagrid and wants width,
              unlike Coach and Dashboard, which are reading surfaces and keep
              the shell's measure. The full-bleed width is what pays for the
              sixth column the rail used to save.

              AMENDED 2026-07-30. The flex threshold was `xl` (1280px), which
              was simply set too high: a 1920×1080 laptop at 150% Windows
              scaling reports ~1150 CSS px, so the columns never flexed, held
              272px, demanded ~1776px, and the owner had to run the browser at
              65% zoom to see all six — the exact failure the terminal rail had
              been invented to avoid, arriving through a breakpoint instead.
              `lg` (1024px) is the real floor for six columns; gap-2 rather
              than gap-4 buys back 40px of it, and 8 is on §4.3's scale.

              Below `lg` the columns hold 256px and the row scrolls, which is
              what edge autoscroll is for (§3 calls it a mobile necessity).

              AMENDED AGAIN 2026-07-30. This element now owns the VERTICAL scroll
              as well, which is what makes the pinned headers below possible.
              `overflow-x-auto` already made it a scroll container in both axes
              (CSS computes `overflow-y: visible` to `auto` when the other axis
              is not visible), so a `sticky` header inside it was always going to
              resolve against THIS box rather than the page — it just never had a
              height to scroll within, so nothing pinned and the labels rode off
              the top of the screen with everything else. Giving it the height is
              the whole fix.

              overscroll-contain so a flick at the top of the board does not
              chain to the document and trigger the phone's pull-to-refresh
              mid-drag. */}
          <div
            ref={boardRef}
            aria-busy={loading}
            className="-mx-4 min-h-0 flex-1 snap-x snap-proximity overflow-auto overscroll-contain px-4 pb-2 sm:-mx-8 sm:px-8"
          >
            {/* ── THE ROW, AND WHY IT IS NOT THE SCROLLER ──────────────────
                These were one element until 2026-07-30, and that was a bug the
                owner caught on screen: five columns ended halfway down the page,
                and scrolling one screen down made the headers, the borders and
                every empty column vanish, leaving loose cards on the background.

                `align-items: stretch` sizes items to the FLEX LINE, and in a
                fixed-height scroller the line is the scrollport — one screen. So
                each column's box was one screen tall while the New column's eight
                cards overflowed it. A sticky header is constrained to its
                containing block, so once you scrolled past that box the header
                had nothing left to pin inside and simply left.

                Splitting them fixes it at the root: the row's height is
                `max(100%, tallest column)`, and the columns stretch to the ROW.
                Every column is now as tall as the longest one — which is what
                every board the owner uses does — so the headers pin for the whole
                scroll and every column is droppable at every scroll position.

                `min-w-max` below `lg` so the row's box actually contains all six
                256px columns; without it the columns overflow the row and the
                scroller's right-hand padding is lost behind them. At `lg` the
                columns flex to fill instead, so the constraint has to come off. */}
            <div className="flex min-h-full w-full min-w-max items-stretch gap-2 lg:min-w-0">
              {STAGES.map((stage) => {
                const items = listFor(stage.key)
                return (
                  <section
                    key={stage.key}
                    // THE DROP TARGET IS THE WHOLE COLUMN, header included (moved
                    // here 2026-07-30). It used to be the card area only, so a
                    // card dragged onto a pinned header — the biggest, most
                    // obvious "put it in this stage" target on the screen, and the
                    // only part of the column always visible — landed nowhere and
                    // silently kept the previous target. A drop on the header
                    // resolves to index 0 for free, since the pointer is above
                    // every card's midpoint, which is exactly the right meaning:
                    // top of that stage.
                    data-drop-stage={stage.key}
                    className="flex w-64 shrink-0 snap-start flex-col rounded-lg border border-border bg-card lg:w-auto lg:min-w-0 lg:flex-1"
                  >
                    {/* PINNED (§7's third amendment). The stage a card is heading
                        into has to be readable at the moment you are dragging it,
                        not one scroll away — the owner's report was having to haul
                        a card from the bottom of a long column to the top of the
                        page just to read the labels. bg-muted is opaque, so cards
                        pass underneath cleanly, and z-10 keeps it that way if a
                        card ever becomes a positioned element. */}
                    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-lg border-b border-border bg-muted px-2 py-2">
                      <h2 className="eyebrow truncate">{stage.label}</h2>
                      <span
                        data-numeric
                        className="text-label text-muted-foreground"
                      >
                        {loading ? "·" : items.length}
                      </span>
                    </header>
                    <div
                      className={cn(
                        "flex min-h-32 flex-1 flex-col gap-2 p-2 transition-colors",
                        // Drop highlight is STATE, not interaction — so no cyan.
                        // Same ruling as Phase 3's recording indicator.
                        over?.stage === stage.key && "bg-muted",
                      )}
                    >
                      {loading ? (
                        <>
                          <CardSkeleton />
                          <CardSkeleton />
                        </>
                      ) : items.length ? (
                        items.map((lead) => (
                          <LeadCard
                            key={lead.id}
                            lead={lead}
                            dragging={String(lead.id) === String(dragId)}
                          />
                        ))
                      ) : (
                        <p className="rounded-lg border border-dashed border-border p-4 text-center text-label text-muted-foreground">
                          Drop leads here
                        </p>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <LeadModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        lead={modalLead}
        onSaved={onSaved}
        onDeleted={onDeleted}
        toast={toast}
      />
      <ScrapeModal
        open={scrapeOpen}
        onOpenChange={setScrapeOpen}
        onScraped={onScraped}
        toast={toast}
      />
      <Toast message={message} />
      <SecretModal />
    </div>
  )
}
