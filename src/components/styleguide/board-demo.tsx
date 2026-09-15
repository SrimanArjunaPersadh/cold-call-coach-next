"use client"

// The Phase 4 treatments on /styleguide, so the card and the column are on the
// acceptance page before they are anywhere else (§4 "new treatments go on
// /styleguide first").
//
// Static — no drag, no fetch. The point is to check the four states and the
// cyan audit on a real phone without needing leads in Supabase.

import { useState } from "react"

import { CardSkeleton, LeadCard } from "@/components/lead-card"
import { Toast } from "@/components/toast"
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
import { cn } from "@/lib/utils"
import type { Lead } from "@/lib/board"

const FULL: Lead = {
  id: "1",
  name: "Thabo Mchunu",
  business: "Kloof Panelbeaters",
  phone: "031 764 1122",
  website: "https://kloofpanelbeaters.co.za/",
  maps_rating: 4.6,
  stage: "new",
  position: 1000,
}

/** The common case today: hand-added, no rating, no site. */
const SPARSE: Lead = {
  id: "2",
  business: "Highway Auto Glass",
  phone: "082 551 9080",
  stage: "new",
  position: 2000,
}

/** What the scraper writes — name === business, so it prints once. */
const SCRAPED: Lead = {
  id: "3",
  name: "Westville Roofing",
  business: "Westville Roofing",
  phone: "031 266 4410",
  website: "westvilleroofing.co.za",
  maps_rating: 3.9,
  stage: "new",
  position: 3000,
}

function Column({
  label,
  count,
  over = false,
  selectable = false,
  onSelectAll,
  children,
}: {
  label: string
  count: string
  over?: boolean
  /** Select mode: the count becomes the select-all-in-this-column control. */
  selectable?: boolean
  onSelectAll?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="flex w-68 shrink-0 flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-2 rounded-t-lg border-b border-border bg-muted px-2 py-2">
        <h3 className="eyebrow truncate">{label}</h3>
        {selectable ? (
          <button
            type="button"
            onClick={onSelectAll}
            aria-label={`Select all in ${label}`}
            data-numeric
            className="rounded-sm px-1 text-label text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {count}
          </button>
        ) : (
          <span data-numeric className="text-label text-muted-foreground">
            {count}
          </span>
        )}
      </header>
      <div
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 p-2",
          over && "bg-muted",
        )}
      >
        {children}
      </div>
    </section>
  )
}

export function BoardDemo() {
  const [toastTone, setToastTone] = useState<"ok" | "err">("ok")
  const [deleting, setDeleting] = useState(false)
  /** Live, so the cyan audit is done on a REAL number of ticked cards. */
  const [picked, setPicked] = useState<Set<string>>(new Set(["1", "3"]))

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow mb-2">
          Card — §7&rsquo;s four things: name, phone, ★ rating, website link
        </p>
        <div className="flex max-w-68 flex-col gap-2">
          <LeadCard lead={FULL} />
          <LeadCard lead={SPARSE} />
          <LeadCard lead={SCRAPED} />
          <LeadCard lead={{ id: "4" }} />
        </div>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          Top card: contact name headlines, business is the sub-line. Second:
          no rating and no site, so those chips simply are not there. Third: the
          scraper set name === business, so it prints once. Fourth: a lead with
          nothing on it still says something.
        </p>
      </div>

      <div>
        <p className="eyebrow mb-2">Card — the drag ghost takes the one shadow</p>
        <div className="max-w-68">
          <LeadCard lead={FULL} dragging />
        </div>
      </div>

      <div>
        <p className="eyebrow mb-2">
          Column — happy, empty, loading, drop-target
        </p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          <Column label="New" count="3">
            <LeadCard lead={FULL} />
            <LeadCard lead={SPARSE} />
            <LeadCard lead={SCRAPED} />
          </Column>
          <Column label="No answer / VM" count="0">
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-label text-muted-foreground">
              Drop leads here
            </p>
          </Column>
          <Column label="Call back" count="·">
            <CardSkeleton />
            <CardSkeleton />
          </Column>
          <Column label="Interested" count="1" over>
            <LeadCard lead={SCRAPED} />
          </Column>
          <Column label="Not interested" count="12">
            <LeadCard lead={SPARSE} />
          </Column>
        </div>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          The loading column keeps its place and prints{" "}
          <code className="font-mono text-label">·</code> rather than{" "}
          <code className="font-mono text-label">0</code> — a spinner over a
          blank board is indistinguishable from &ldquo;you have no leads&rdquo;.
          The drop target is <em>state</em>, so it is{" "}
          <code className="font-mono text-label">--surface-2</code>, not cyan.
          On the real board the columns flex to fill the viewport above 1280px;
          here they are pinned at 272px so the states line up for comparison.
        </p>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          <strong className="font-semibold">§7 amended 2026-07-29.</strong>{" "}
          <code className="font-mono text-label">not_interested</code> was a
          collapsed count-chip rail. It is now a full column like the other
          five, because that is what HubSpot, Pipedrive and GoHighLevel all do
          with their lost stage — the rail was the one place this board asked
          its owner to learn something their existing tools do not do. The
          board&rsquo;s full-bleed width is what pays for the sixth column.
        </p>
      </div>

      {/* ── Phase 8c ─────────────────────────────────────────────────── */}
      <div>
        <p className="eyebrow mb-2">
          Select mode (Phase 8c) — the card becomes a checkbox
        </p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          <Column label="New" count="3" selectable onSelectAll={() => {}}>
            {[FULL, SPARSE, SCRAPED].map((lead) => (
              <div key={lead.id} onClick={() => toggle(String(lead.id))}>
                <LeadCard
                  lead={lead}
                  selectable
                  selected={picked.has(String(lead.id))}
                />
              </div>
            ))}
          </Column>
          <Column label="Not interested" count="0" selectable onSelectAll={() => {}}>
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-label text-muted-foreground">
              Drop leads here
            </p>
          </Column>
        </div>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          Tap the cards above — this demo is live, so the{" "}
          <strong className="font-semibold">
            cyan audit is done on a real number of ticked boxes
          </strong>
          . A ticked box is the one thing here that <em>is</em> cyan, and
          deliberately: selecting is direct interaction, unlike a drop target,
          which is state. A full column of selected cards measures about 0.8% of
          a laptop viewport — inside §4.1&rsquo;s 5% cap with room to spare. The
          stage count in the header turns into a button in this mode (it selects
          the whole column) rather than growing a second control beside it: at
          ~174px there is no width to give.
        </p>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          Outside select mode the card is byte-identical to Phase 4&rsquo;s —
          compare with the first block on this page. §7 closed the card face at
          four things, and this adds a fifth only while a mode is on. It is also
          why the drag is off here and{" "}
          <code className="font-mono text-label">touch-none</code> comes off the
          card with it: there is no drag to protect, and leaving it on would stop
          a finger scrolling the column.
        </p>
      </div>

      <div>
        <p className="eyebrow mb-2">Selection bar — inline, never floating</p>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted px-4 py-2">
          <p className="text-body">
            <span data-numeric className="font-medium">
              {picked.size}
            </span>{" "}
            selected
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="ghost">Select all</Button>
            <Button variant="outline" disabled={!picked.size}>
              Export selected
            </Button>
            <Button variant="destructive" disabled={!picked.size}>
              Delete
            </Button>
          </div>
        </div>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          It sits under the toolbar rather than floating over the board, and that
          is not a preference: the toast is fixed to the bottom of the viewport
          and reports the result of every action in this bar. A floating bar
          would cover the answer with the question. Nothing here is cyan —
          Delete is <code className="font-mono text-label">destructive</code>,
          which is semantic (§4.1), and this screen&rsquo;s one accent is already
          spent on Add lead.
        </p>
      </div>

      <div>
        <p className="eyebrow mb-2">
          Import preview — the only table treatment in the app
        </p>
        <div className="max-w-lg overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="eyebrow px-2 py-2 text-left">Business</th>
                <th className="eyebrow px-2 py-2 text-left">Phone</th>
                <th className="eyebrow px-2 py-2 text-left">Stage</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Kloof Panelbeaters", "031 764 1122", "new"],
                ["Westville Auto Body", "031 266 9080", "callback"],
                ["Hillcrest Spray", "072 433 1901", "new"],
              ].map((row) => (
                <tr key={row[0]} className="border-b border-border last:border-0">
                  <td className="max-w-48 truncate px-2 py-2">{row[0]}</td>
                  <td data-numeric className="px-2 py-2">
                    {row[1]}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          Three rows, because three is enough to see that a mapping is wrong —
          and seeing that is the whole job. §3 cut the old app&rsquo;s
          garbage-file guard, and this preview is what replaces it: a heuristic
          deciding a file &ldquo;is not really a lead list&rdquo; can refuse a
          file that is fine, and a preview cannot. The header takes the kanban
          column header&rsquo;s own treatment (
          <code className="font-mono text-label">bg-muted</code>, one border, an
          eyebrow), so no new surface enters §4.
        </p>
      </div>

      <div>
        <p className="eyebrow mb-2">
          Destructive confirm — the sanctioned upgrade from{" "}
          <code className="font-mono">confirm()</code>
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete lead</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. Any calls linked to this lead are kept —
                they lose the link, not the recording.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  // Demo only: shows the pending state for two seconds and
                  // deletes nothing.
                  event.preventDefault()
                  setDeleting(true)
                  setTimeout(() => setDeleting(false), 2000)
                }}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete lead"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          STATUS §4 logs the old app&rsquo;s delete as a gap: a bare{" "}
          <code className="font-mono text-label">confirm()</code> is unstyled,
          unreadable on a phone, and synchronous, so it has nowhere to put a
          pending state. Tap Delete lead above and watch the button — it says
          what it is doing, and Cancel holds focus, not the destructive action.
        </p>
      </div>

      <div>
        <p className="eyebrow mb-2">Toast — 3200ms, semantic tone or none</p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => setToastTone("ok")}
            className="h-11 rounded-md border border-border bg-card px-4 text-body hover:bg-muted"
          >
            Success tone
          </button>
          <button
            type="button"
            onClick={() => setToastTone("err")}
            className="h-11 rounded-md border border-border bg-card px-4 text-body hover:bg-muted"
          >
            Error tone
          </button>
        </div>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          The live toast is fixed to the bottom of the viewport — scroll down to
          see it. It is a floating surface, so it takes the one shadow.
        </p>
        <Toast
          message={
            toastTone === "ok"
              ? { text: "Lead updated", tone: "ok" }
              : {
                  text: "Cannot reach the server. Check your connection and try again.",
                  tone: "err",
                }
          }
        />
      </div>
    </div>
  )
}
