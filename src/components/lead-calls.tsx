"use client"

// ══ Lead modal → Calls (Phase 5) ════════════════════════════════════════════
//
// The per-lead call history. Translated from `loadLeadCalls` (index.html:1823–
// 1833), `renderLeadCalls` (1835–1867) and the delegated delete handler (1869–
// 1892).
//
// It renders the SAME `<Scorecard>` the Coach panel renders — §5.2's "single
// source, no forked markup" — read-only, because it has no `onSwapSpeaker`.
// Swapping here would have to recompute and re-persist metrics, which would make
// a second writer for a column the Coach panel owns and is exactly the drift §6
// exists to prevent.
//
// It also never calls `computeMetrics`. The strip is FORMATTED from the stored
// object by `toScorecardData` → `storedMetrics`, and a call saved before metrics
// existed renders no strip at all.
//
// Built failure-paths-first, like Phases 3 and 4: loading, error and empty are
// what actually happen on a phone, and building them first is why they work.

import { useCallback, useEffect, useRef, useState } from "react"

import { Scorecard } from "@/components/scorecard"
import { ScoreBadge } from "@/components/score-badge"
import type { ToastTone } from "@/components/toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  callSummary,
  sortCallsNewestFirst,
  toScorecardData,
  type StoredCall,
} from "@/lib/call-history"
import { fmtCallDate } from "@/lib/format"
import { errorText, leadsApi } from "@/lib/leads-api"

/**
 * One collapsed call, and its delete.
 *
 * Split out from the fetching component below so /styleguide can render the row
 * in every state without a network round trip (§4: "new treatments go on
 * /styleguide first"). One component, so the acceptance page and the real modal
 * cannot drift apart.
 *
 * `onDelete` resolves true when the call is really gone. Owning the confirm and
 * pending state per row rather than in the list means a failed delete leaves THIS
 * row's dialog open with THIS row's button live, and touches nothing else.
 */
export function CallRow({
  call,
  onDelete,
}: {
  call: StoredCall
  onDelete: (callId: string) => Promise<boolean>
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { score, headline } = callSummary(call)

  async function confirmDelete() {
    setDeleting(true)
    const deleted = await onDelete(call.id)
    // On success the list re-reads and this row unmounts, so these are no-ops.
    // On failure they are the whole point: the dialog stays open and the button
    // comes back, because the row survived and retry is one tap away.
    setDeleting(false)
    if (deleted) setConfirmOpen(false)
  }

  return (
    // Every call collapsed, newest first — the old app's behaviour. A lead with
    // four calls stays scannable, and the modal's own Save/Delete controls stay
    // reachable without scrolling past an expanded scorecard.
    <details className="group/call overflow-hidden rounded-lg border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 p-2 marker:content-none hover:bg-muted [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="text-label text-muted-foreground transition-transform group-open/call:rotate-90"
        >
          ▶
        </span>
        {score !== null ? (
          <ScoreBadge score={score} />
        ) : (
          <span
            data-numeric
            className="rounded-md bg-muted px-2 py-0.5 text-label font-medium text-muted-foreground"
          >
            —
          </span>
        )}
        <span data-numeric className="shrink-0 text-label text-muted-foreground">
          {fmtCallDate(call.created_at)}
        </span>
        {/* Full width of its own below the meta on a phone, inline once there
            is room. */}
        <span className="min-w-0 basis-full truncate text-body text-foreground-2 sm:basis-0 sm:flex-1">
          {headline}
        </span>
      </summary>

      <div className="border-t border-border p-2">
        {/* ONE scorecard component, in both places (§5.2). No swap control, so
            it renders read-only; and no metrics strip at all when the stored
            object is absent. */}
        <Scorecard
          data={toScorecardData(call)}
          metricsAbsent="omit"
          className="rounded-none border-0"
        />

        <div className="mt-2 flex justify-end">
          {/* Closes STATUS §4's ⚠ gap. The old app disabled the button and showed
              no text; this is the AlertDialog + pending-state pattern Phase 4
              built for lead delete. */}
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" disabled={deleting}>
                {deleting ? "Deleting…" : "Delete call"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this call?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes the call and its recording, and cannot be undone.
                  The transcript and scores go with it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  // Not `onSelect` — the default closes the dialog on click, and
                  // the pending state has to outlive the tap so a slow Storage
                  // delete is visible rather than silent.
                  onClick={(event) => {
                    event.preventDefault()
                    void confirmDelete()
                  }}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Delete call"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </details>
  )
}

export function LeadCalls({
  leadId,
  toast,
}: {
  leadId: string
  toast: (text: string, tone?: ToastTone) => void
}) {
  const [calls, setCalls] = useState<StoredCall[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * One load path, used by the mount effect and by the post-delete re-read.
   *
   * The old app guarded with `if (crm.editingId !== leadId) return` — the modal
   * having moved to another lead mid-fetch. This modal is keyed by lead id so it
   * remounts instead, but a request still outlives a close, so the same guard is
   * needed: every run takes a token, and only the newest run may write state.
   */
  const runRef = useRef(0)

  /**
   * Note what is NOT here: a leading `setLoading(true)`. `loading` already starts
   * true, and every write below happens after the `await` — which keeps the mount
   * effect free of synchronous state updates (react-hooks/set-state-in-effect)
   * without splitting this into two copies of the same fetch. The re-read after a
   * delete raises the flag itself, from an event handler, where it belongs.
   */
  const load = useCallback(async (): Promise<void> => {
    const run = ++runRef.current
    const fresh = () => run === runRef.current

    try {
      const data = await leadsApi<{ calls: StoredCall[] }>(
        `/api/calls?lead_id=${encodeURIComponent(leadId)}`,
        undefined,
        "Could not load calls",
      )
      if (fresh()) {
        setCalls(sortCallsNewestFirst(data.calls || []))
        setError(null) // a successful re-read clears a previous failure
      }
    } catch (err) {
      // §4.4 error: the placeholder carries what happened, and the list is not
      // silently emptied — `calls` keeps whatever it already had.
      if (fresh()) setError(errorText(err, "Could not load calls"))
    } finally {
      if (fresh()) setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    // Fetch-on-mount. `set-state-in-effect` traces one level into `load` and sees
    // its state writes, even though every one of them happens after the `await`
    // and none is synchronous with this effect. The rule is aimed at cascading
    // renders; loading a lead's calls when the modal opens is the data fetch React
    // still has no better primitive for here. Phase 4's board does the same thing
    // and escapes the rule only because its setState sits one hop further down —
    // which is a difference in what the analyser can see, not in behaviour.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; every write in `load` is post-await
    void load()
    // Bumping the token invalidates whatever is in flight, so a response that
    // lands after the modal closed writes nothing.
    return () => {
      runRef.current += 1
    }
  }, [load])

  async function onDelete(callId: string): Promise<boolean> {
    try {
      // The storage-first ordering is SERVER side and shipped in Phase 1: the
      // object goes before the row, a Storage 404 counts as success, `pending/`
      // is skipped, and a real Storage failure returns 500 with the row intact.
      // The client's whole job is to ask, report, and re-read.
      await leadsApi(
        `/api/calls?id=${encodeURIComponent(callId)}`,
        { method: "DELETE" },
        "Could not delete call",
      )
      toast("Call deleted", "ok")
      // Only now, and deliberately not before the DELETE: raising it earlier
      // would replace the list — and the open confirm dialog — with "Loading
      // calls…", and a FAILED delete never reaches `load()`, so the flag would
      // never come back down. `load` lowers it in its own finally.
      setLoading(true)
      await load()
      return true
    } catch (err) {
      // The row SURVIVES a failed storage cleanup, so the screen should still say
      // so. Reporting false keeps the row's dialog open and its button live.
      toast(errorText(err, "Could not delete call"), "err")
      return false
    }
  }

  return (
    <section className="border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="eyebrow">Calls</h3>
        {!loading && !error ? (
          <span data-numeric className="text-label text-muted-foreground">
            {calls.length}
          </span>
        ) : null}
      </div>

      <div className="mt-2">
        {loading ? (
          <p className="text-body text-muted-foreground">Loading calls…</p>
        ) : error ? (
          <p className="text-body text-fail">{error}</p>
        ) : !calls.length ? (
          // §4.4 empty, in interface voice — an invitation, not a void.
          <p className="text-body text-muted-foreground">
            No calls yet. Record one from Coach and link it here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {calls.map((call) => (
              <CallRow key={call.id} call={call} onDelete={onDelete} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
