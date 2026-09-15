"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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
import { Select } from "@/components/ui/select"
import type { Lead } from "@/lib/board"
import { errorText, leadsApi } from "@/lib/leads-api"
import {
  autoMap,
  chunk,
  draftRows,
  importOutcome,
  isWorkbook,
  MAPPABLE,
  NOT_A_TABLE,
  readTable,
  WORKBOOK_HELP,
  type ImportField,
  type ImportResponse,
  type ImportTally,
  type Mapping,
} from "@/lib/lead-io"
import type { ParsedTable } from "@/lib/delimited"
import { cn } from "@/lib/utils"

// ══ Import leads from a spreadsheet (Phase 8c) ═════════════════════════════
//
// THE ROUTE ALREADY EXISTED AND GAINED ONE RULE. `POST /api/leads` has carried
// the bulk `{ leads: [...] }` branch since Phase 1 — it was translated with the
// rest of the route and then had no caller for seven phases, because §3 CUT the
// UI that fed it. This is that UI, rebuilt. The only server change is dedupe
// (see the branch's own comment); §9's five routes are still five routes.
//
// §0's ruling 2 CUT csv import and said either default "can be reversed with a
// one-line instruction". The owner gave it on 2026-09-15 — a real lead list
// arrived from outside Google Maps, which is precisely §12's logged trigger.
//
// THE SHAPE IS THE SCRAPE MODAL'S, deliberately: a form, a live panel while it
// runs, an always-mounted status region, and a neutral-amber toast when a
// correct run adds nothing. Two ways of acquiring leads that report their
// outcomes differently would be two things to learn instead of one.
//
// WHAT IS NOT HERE: the old app's garbage-file guard. There is no heuristic
// deciding a file is not really a lead list. The preview below shows what will
// land, and a preview that reads wrong IS the guard — it needs no threshold to
// argue with, and it cannot refuse a file that is actually fine.

/** Errors and empty outcomes are semantic (§4.1); nothing else here is coloured. */
type StatusTone = "warn" | "fail"
type Status = { text: string; tone: StatusTone } | null

const STATUS_TEXT: Record<StatusTone, string> = {
  warn: "text-warn",
  fail: "text-fail",
}

/** How much of the file to sniff for the workbook magic bytes. */
const HEAD_BYTES = 8

/** Rows of the preview. Three is enough to see a mapping is wrong. */
const PREVIEW_ROWS = 3

type Loaded = { fileName: string; table: ParsedTable }

type ImportModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The inserted rows, for the board to merge. Never called with none. */
  onImported: (leads: Lead[]) => void
  toast: (text: string, tone?: ToastTone) => void
}

export function ImportModal({
  open,
  onOpenChange,
  onImported,
  toast,
}: ImportModalProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [status, setStatus] = useState<Status>(null)
  const [dragOver, setDragOver] = useState(false)
  /** `null` = idle. Otherwise the rows sent so far, out of the total. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  )

  const fileRef = useRef<HTMLInputElement>(null)
  /** Read by the reset effect without making the run a dependency of it. */
  const runningRef = useRef(false)

  /**
   * Reset on open — the scrape modal's rule, for the same reason. Radix unmounts
   * the panel on close, but this state lives in the component ABOVE the panel,
   * so it survives and would otherwise show last week's file.
   *
   * Guarded on a run in flight: closing the panel mid-import and reopening it
   * must show the import still going, not an empty drop zone offering to do it
   * again. Unlike the scraper this costs no money, but it would cost a double
   * import — and the dedupe would hide the damage rather than prevent it, since
   * the second pass reads a board the first pass has already written to.
   */
  useEffect(() => {
    if (!open || runningRef.current) return
    setLoaded(null)
    setMapping({})
    setStatus(null)
    setProgress(null)
    setDragOver(false)
    if (fileRef.current) fileRef.current.value = ""
  }, [open])

  // ── Reading the file ────────────────────────────────────────────────────

  const readFile = useCallback(async (file: File) => {
    setStatus(null)
    setLoaded(null)
    setMapping({})

    let text: string
    try {
      text = await file.text()
    } catch {
      setStatus({ text: "That file could not be read. Try choosing it again.", tone: "fail" })
      return
    }

    // The workbook check reads the CONTENT as well as the name, so a .xlsx
    // renamed to .csv is still caught — and is told what to do about it.
    if (isWorkbook(file.name, text.slice(0, HEAD_BYTES))) {
      setStatus({ text: WORKBOOK_HELP, tone: "warn" })
      return
    }

    const table = readTable(text)
    if (!table.headers.length) {
      setStatus({ text: NOT_A_TABLE, tone: "warn" })
      return
    }
    if (!table.rows.length) {
      setStatus({
        text: `"${file.name}" has a header row and nothing under it.`,
        tone: "warn",
      })
      return
    }

    setLoaded({ fileName: file.name, table })
    setMapping(autoMap(table.headers))
  }, [])

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void readFile(file)
  }

  /**
   * Files dropped on the panel. HTML5 drag events, which §7 bans for CARDS and
   * which are the only option here: a file coming from the OS is not a pointer
   * gesture this app can see any other way.
   */
  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    if (progress) return
    const file = event.dataTransfer.files?.[0]
    if (file) void readFile(file)
  }

  // ── The mapping ─────────────────────────────────────────────────────────

  /**
   * Re-pointing a field takes the column off whichever field held it.
   *
   * Two fields reading one column is legal in the data model and almost always
   * a mistake in the file — and the preview would show both columns identical
   * with nothing explaining why. Moving it is the behaviour that matches what
   * the click looks like it means.
   */
  const repoint = (field: ImportField, value: string) => {
    setMapping((prev) => {
      const next: Mapping = { ...prev }
      if (value === "") {
        delete next[field]
        return next
      }
      const index = Number(value)
      for (const key of Object.keys(next) as ImportField[]) {
        if (next[key] === index) delete next[key]
      }
      next[field] = index
      return next
    })
  }

  /** Recomputed on every mapping change — this IS the preview. */
  const result = useMemo(
    () => (loaded ? draftRows(loaded.table, mapping) : null),
    [loaded, mapping],
  )

  // ── The import ──────────────────────────────────────────────────────────

  async function onImport() {
    if (!loaded || !result || !result.drafts.length) return

    const batches = chunk(result.drafts)
    const tally: ImportTally = {
      imported: 0,
      duplicates: 0,
      skipped: result.skipped,
      stageFallbacks: result.stageFallbacks,
    }
    const inserted: Lead[] = []

    runningRef.current = true
    setStatus(null)
    setProgress({ done: 0, total: result.drafts.length })

    try {
      for (const batch of batches) {
        const data = await leadsApi<ImportResponse>(
          "/api/leads",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ leads: batch }),
          },
          "Import failed",
        )
        tally.imported += Number(data.imported) || 0
        tally.duplicates += Number(data.duplicates) || 0
        // The route counts `skipped` again server-side, and it must not be
        // added to the count this file already made — they are the same rows
        // seen twice. `draftRows` is the one that can name WHY, so it wins.
        inserted.push(...(data.leads || []))
        setProgress((prev) =>
          prev ? { ...prev, done: prev.done + batch.length } : prev,
        )
      }

      if (inserted.length) onImported(inserted)
      onOpenChange(false)
      const outcome = importOutcome(tally)
      toast(outcome.text, outcome.tone)
    } catch (err) {
      // PARTIAL IMPORTS ARE REAL and must be reported as such. A 1,240-row file
      // is three requests; if the second one fails, 500 leads are already in
      // Postgres. Saying only "Import failed" would send the owner to re-import
      // the whole file, and the dedupe would save them — but they would not
      // know that, and a tool you have to trust blindly is one you stop using.
      if (inserted.length) onImported(inserted)
      setStatus({
        text: tally.imported
          ? `${importOutcome(tally).text} — then it stopped: ${errorText(err, "Import failed")}`
          : errorText(err, "Import failed"),
        tone: "fail",
      })
    } finally {
      runningRef.current = false
      setProgress(null)
    }
  }

  const headers = loaded?.table.headers ?? []
  const previewRows = result?.drafts.slice(0, PREVIEW_ROWS) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider than the scrape modal's 512px and narrower than §4.3's 1024px
          scorecard: this carries a two-column mapping list and a preview table,
          which are the two things a 512px panel turns into a staircase. */}
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import leads from a file</DialogTitle>
          <DialogDescription>
            A CSV or tab-separated file with a header row. Leads already on the
            board are skipped — matched on phone number, the same way the Google
            Maps search does it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-8">
          {/* ── Choose a file ───────────────────────────────────────────── */}
          {progress ? null : (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center gap-4 rounded-lg border border-dashed p-8 text-center transition-colors",
                dragOver ? "border-primary bg-muted" : "border-border",
              )}
            >
              <p className="text-body text-foreground-2">
                {loaded ? (
                  <>
                    <span className="font-medium text-foreground">
                      {loaded.fileName}
                    </span>{" "}
                    — {loaded.table.rows.length} row
                    {loaded.table.rows.length === 1 ? "" : "s"},{" "}
                    {headers.length} column
                    {headers.length === 1 ? "" : "s"}
                  </>
                ) : (
                  "Drop a .csv here, or choose one."
                )}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
                onChange={onPick}
                className="sr-only"
                id="import-file"
              />
              {/* A label rather than a button wrapping the input: the native
                  file picker is the only control that can open the OS dialog,
                  and a click forwarded from a button is blocked on some phones.
                  Sized to §10's 44px by hand, since this is not a <Button>. */}
              <label
                htmlFor="import-file"
                className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
              >
                {loaded ? "Choose a different file" : "Choose a file"}
              </label>
            </div>
          )}

          {/* ── The mapping, and the preview that checks it ─────────────── */}
          {loaded && result && !progress ? (
            <div className="flex flex-col gap-8">
              <div>
                <p className="eyebrow mb-2">
                  Which column is which
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {MAPPABLE.map((field) => (
                    <label key={field.key} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-label text-muted-foreground">
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <Select
                        value={
                          mapping[field.key] === undefined
                            ? ""
                            : String(mapping[field.key])
                        }
                        onChange={(e) => repoint(field.key, e.target.value)}
                        className="min-w-0 flex-1"
                      >
                        <option value="">— ignore —</option>
                        {headers.map((header, index) => (
                          <option key={index} value={index}>
                            {header || `Column ${index + 1}`}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-label text-muted-foreground">
                  Business and phone are required — a row missing either is
                  skipped. A row with no business borrows its contact name.
                  Email is never imported.
                </p>
              </div>

              <div>
                <p className="eyebrow mb-2">
                  What will land — first {Math.min(PREVIEW_ROWS, previewRows.length)} of{" "}
                  {result.drafts.length}
                </p>
                {previewRows.length ? (
                  // The only horizontal scroller in the app besides the board,
                  // and for the same reason: a table is a datagrid, and a
                  // preview that wraps is a preview you cannot read.
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-body">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className="eyebrow px-2 py-2 text-left">Business</th>
                          <th className="eyebrow px-2 py-2 text-left">Phone</th>
                          <th className="eyebrow px-2 py-2 text-left">Stage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((draft, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="max-w-48 truncate px-2 py-2">
                              {draft.business}
                            </td>
                            <td data-numeric className="px-2 py-2">
                              {draft.phone}
                            </td>
                            <td className="px-2 py-2 text-muted-foreground">
                              {draft.stage ?? "new"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  // The EMPTY state (§4.4), and it is the one that matters:
                  // nothing will land, and the sentence says which dropdown
                  // above fixes it rather than just reporting zero.
                  <p className="rounded-lg border border-dashed border-border p-4 text-body text-warn">
                    No rows can be imported — every one of them is missing a
                    business or a phone. Check the two dropdowns above are
                    pointing at the right columns.
                  </p>
                )}

                <p className="mt-2 text-body text-foreground-2">
                  <span data-numeric className="font-medium text-foreground">
                    {result.drafts.length}
                  </span>{" "}
                  to import
                  {result.skipped ? (
                    <>
                      {" · "}
                      <span data-numeric>{result.skipped}</span> skipped (no
                      business or phone)
                    </>
                  ) : null}
                  {result.stageFallbacks ? (
                    <>
                      {" · "}
                      <span data-numeric>{result.stageFallbacks}</span> with an
                      unknown stage, landing in New
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          ) : null}

          {/* ── The loading state (§4.4) ────────────────────────────────── */}
          {progress ? (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-4">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  className="size-2 shrink-0 animate-pulse rounded-md bg-foreground"
                />
                <span className="eyebrow">Importing</span>
                <span data-numeric className="text-subhead">
                  {progress.done} / {progress.total}
                </span>
              </div>
              <p className="text-label text-muted-foreground">
                {progress.total > 500
                  ? "Sent in batches of 500. Closing this panel is fine — the leads land on the board as each batch finishes."
                  : "Closing this panel is fine — the leads land on the board when it finishes."}
              </p>
            </div>
          ) : null}

          {/* Always mounted, only its text conditional — the rule toast.tsx and
              scrape-modal.tsx both carry: a live region that appears TOGETHER
              with its message is often never announced at all. */}
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
        </div>

        <DialogFooter>
          {progress ? (
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
              <Button
                type="button"
                onClick={() => void onImport()}
                disabled={!result || !result.drafts.length}
              >
                {result?.drafts.length
                  ? `Import ${result.drafts.length} lead${result.drafts.length === 1 ? "" : "s"}`
                  : "Import"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
