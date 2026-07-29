"use client"

// ══ The CRM kanban (Phase 4) ═══════════════════════════════════════════════
//
// Six stage columns, pointer drag with edge autoscroll, and the add/edit/delete
// modal. Translated from the old app's index.html; the behaviour is the
// reference, React is only the syntax.
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
  const autoDir = useRef(0)
  const autoRAF = useRef(0)

  // ── Load ────────────────────────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    setError(null)
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
  }, [])

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

  const autoTick = useCallback(function tick() {
    if (!autoDir.current) {
      autoRAF.current = 0
      return
    }
    if (boardRef.current) {
      boardRef.current.scrollLeft += autoDir.current * AUTOSCROLL_STEP
    }
    autoRAF.current = requestAnimationFrame(tick)
  }, [])

  const updateAutoscroll = useCallback(
    (x: number) => {
      const board = boardRef.current
      if (!board) return
      const rect = board.getBoundingClientRect()
      autoDir.current =
        x < rect.left + AUTOSCROLL_EDGE
          ? -1
          : x > rect.right - AUTOSCROLL_EDGE
            ? 1
            : 0
      if (autoDir.current && !autoRAF.current) {
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
        updateAutoscroll(e.clientX)

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
        autoDir.current = 0
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

  return (
    // NOT <Container>. Every other page takes the shell's 1152px measure
    // because prose and scorecards want one; a kanban is a datagrid and wants
    // width. The header keeps the same 16/32px gutters as the board so the
    // toolbar and the columns share an edge.
    <div className="flex w-full flex-col gap-8 px-4 pb-16 sm:px-8">
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
          {/* Both controls refetch or mutate the board. Live during a fetch,
              each one's success handler would race the in-flight GET — which
              was issued before the insert and would land last, dropping it. */}
          <Button variant="outline" onClick={() => void loadLeads()} disabled={loading}>
            Refresh
          </Button>
          <Button onClick={openAdd} disabled={loading}>
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
              what edge autoscroll is for (§3 calls it a mobile necessity). */}
          <div
            ref={boardRef}
            aria-busy={loading}
            className="-mx-4 flex snap-x snap-proximity items-stretch gap-2 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8"
          >
            {STAGES.map((stage) => {
              const items = listFor(stage.key)
              return (
                <section
                  key={stage.key}
                  className="flex w-64 shrink-0 snap-start flex-col rounded-lg border border-border bg-card lg:w-auto lg:min-w-0 lg:flex-1"
                >
                  <header className="flex items-center justify-between gap-2 rounded-t-lg border-b border-border bg-muted px-2 py-2">
                    <h2 className="eyebrow truncate">{stage.label}</h2>
                    <span data-numeric className="text-label text-muted-foreground">
                      {loading ? "·" : items.length}
                    </span>
                  </header>
                  <div
                    data-drop-stage={stage.key}
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
      )}

      <LeadModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        lead={modalLead}
        onSaved={onSaved}
        onDeleted={onDeleted}
        toast={toast}
      />
      <Toast message={message} />
      <SecretModal />
    </div>
  )
}
