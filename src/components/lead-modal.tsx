"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import { LeadCalls } from "@/components/lead-calls"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { STAGES, type Lead } from "@/lib/board"
import { leadBusinessName } from "@/lib/lead-combo"
import { errorText, leadsApi } from "@/lib/leads-api"
import { setPendingLead } from "@/lib/pending-call"

// ══ Add / edit / delete a lead ═════════════════════════════════════════════
//
// Translated from the old app's lead modal. Escape and a backdrop click close
// it — Radix's Dialog, not hand-rolled, because those two plus the focus trap
// are the whole reason to reach for a primitive here.
//
// NO EMAIL FIELD. The old form had one, to feed the CSV import mapper that §3
// CUT. `/api/leads` does not whitelist `email` any more (Phase 1), so a field
// here would silently discard what the owner typed. The column still exists in
// Supabase and stays null; re-adding it is a POPIA decision, not a form tweak.

/** The text fields, in the old app's order, minus email. */
const FIELDS = [
  { key: "name", label: "Contact name", type: "text", required: false },
  { key: "business", label: "Business", type: "text", required: true },
  { key: "phone", label: "Phone", type: "tel", required: true },
  { key: "website", label: "Website URL", type: "url", required: false },
  { key: "industry", label: "Industry", type: "text", required: false },
] as const

type LeadModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = add. A lead = edit, and the Delete action appears. */
  lead: Lead | null
  onSaved: (lead: Lead) => void
  onDeleted: (id: string) => void
  toast: (text: string, tone?: ToastTone) => void
}

export function LeadModal({
  open,
  onOpenChange,
  lead,
  onSaved,
  onDeleted,
  toast,
}: LeadModalProps) {
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const editing = lead !== null

  /**
   * "Call this lead" — the §7-compliant home for the entry point the old app put
   * on the card face.
   *
   * §7 fixes the card at four things (business, phone, rating, website) and Phase
   * 4 CUT the old 📞 button rather than hiding it. It resurfaces here, one tap
   * deeper, on the surface you already open by tapping a card — so the board stays
   * a datagrid and the action still exists.
   *
   * The lead rides to Coach through a one-shot sessionStorage handoff, because
   * these are two routes now rather than two views of one document. Coach reads
   * and clears it on mount, so a reload loses the attachment exactly as the old
   * app's in-memory `attachedLead` did.
   */
  function onCallLead() {
    if (!lead) return
    setPendingLead({ id: lead.id, business: leadBusinessName(lead) })
    onOpenChange(false)
    // router.push scrolls to top by default, which is the old app's explicit
    // `window.scrollTo({ top: 0 })` in `startCallForLead`.
    router.push("/coach")
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (key: string) => String(form.get(key) ?? "").trim()

    const payload: Record<string, string> = {
      stage: value("stage"),
      notes: value("notes"),
    }
    for (const field of FIELDS) payload[field.key] = value(field.key)

    // Client-side, as well as the 400 the route returns. `required` on the
    // inputs catches empty; this catches whitespace, which `required` does not.
    if (!payload.business || !payload.phone) {
      toast("Business and phone are required", "err")
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const data = await leadsApi<{ lead: Lead }>(
          `/api/leads?id=${encodeURIComponent(lead.id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
          "Could not save lead",
        )
        onSaved(data.lead)
        toast("Lead updated", "ok")
      } else {
        const data = await leadsApi<{ lead: Lead }>(
          "/api/leads",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
          "Could not create lead",
        )
        onSaved(data.lead)
        toast("Lead added", "ok")
      }
      onOpenChange(false)
    } catch (err) {
      // The modal stays open with everything the owner typed still in it, so
      // pressing Save again is a real retry rather than a re-entry (§4.4).
      toast(errorText(err, "Save failed"), "err")
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!lead) return
    setDeleting(true)
    try {
      await leadsApi(
        `/api/leads?id=${encodeURIComponent(lead.id)}`,
        { method: "DELETE" },
        "Could not delete lead",
      )
      onDeleted(lead.id)
      setConfirmOpen(false)
      onOpenChange(false)
      toast("Lead deleted", "ok")
    } catch (err) {
      // Both dialogs stay open — the lead still exists, so the screen should
      // still say so. Retry is one tap away.
      toast(errorText(err, "Delete failed"), "err")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Wide, because this modal carries a SCORECARD, not just a form (amended
        // 2026-07-30). At the default 512px the audit grid, the metrics strip and
        // the transcript all had to be read through a letterbox, sideways. 1024px
        // is close to full width on a ~1150px viewport and still leaves the scrim
        // visible, so it reads as a panel over the board rather than a new page.
        className="max-w-5xl"
        // `key` remounts the form when the modal moves to another lead, so the
        // uncontrolled inputs pick up the new defaultValues. Without it, opening
        // lead B after lead A shows A's details.
        key={lead?.id ?? "new"}
        ref={contentRef}
        // Radix's focus scope opens with focusFirst(..., { select: true }),
        // which calls .select() on the first tabbable input. On an EDIT that
        // hands you the contact name pre-highlighted, so the next keystroke
        // replaces it — a data-loss footgun on a form opened by tapping a card.
        //
        // So: take the focus decision back. Adding a lead still lands in the
        // first field, because you opened it to type (that is the old app's
        // behaviour, minus the selection). Editing focuses the panel instead —
        // nothing is highlighted, no phone keyboard slides up over the form,
        // and Tab still walks the fields from the top.
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (editing) contentRef.current?.focus()
          else firstFieldRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Edit lead" : "Add lead"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this lead, move it to another stage, or delete it."
              : "Business and phone are required. Everything else can wait."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {/* Two columns once there is room (amended 2026-07-30). A 1024px-wide
              single-line text input is worse than a cramped one — the eye has to
              travel the whole panel to read six characters of phone number. The
              short fields pair up; Notes and Calls below span the full width,
              because those two actually want it. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((field, i) => (
              <div key={field.key}>
                <label
                  htmlFor={`lead-${field.key}`}
                  className="eyebrow mb-2 block"
                >
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                <Input
                  id={`lead-${field.key}`}
                  name={field.key}
                  type={field.type}
                  required={field.required}
                  ref={i === 0 ? firstFieldRef : undefined}
                  defaultValue={
                    lead && lead[field.key] != null ? String(lead[field.key]) : ""
                  }
                />
              </div>
            ))}

            <div>
              <label htmlFor="lead-stage" className="eyebrow mb-2 block">
                Stage
              </label>
              <Select
                id="lead-stage"
                name="stage"
                defaultValue={lead?.stage || "new"}
              >
                {STAGES.map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label htmlFor="lead-notes" className="eyebrow mb-2 block">
              Notes
            </label>
            <Textarea
              id="lead-notes"
              name="notes"
              defaultValue={lead?.notes ?? ""}
            />
          </div>

          {/* ── Calls (Phase 5) ───────────────────────────────────────────
              Edit only — an unsaved lead has no id to fetch against. It sits
              between the fields and the actions because that is the reading
              order: what this lead is, what happened on the calls, then what to
              do about it. Every control inside is type="button", so nothing here
              can submit the form it lives in. */}
          {editing ? <LeadCalls leadId={lead.id} toast={toast} /> : null}

          <DialogFooter className="mt-4">
            {editing ? (
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  {/* type=button, or it submits the form it sits in. */}
                  <Button
                    type="button"
                    variant="destructive"
                    className="sm:mr-auto"
                    disabled={saving}
                  >
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This cannot be undone. Any calls linked to this lead are
                      kept — they lose the link, not the recording.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      // Not `onSelect` — the default closes the dialog on click,
                      // and the pending state has to outlive the tap.
                      onClick={(event) => {
                        event.preventDefault()
                        void onDelete()
                      }}
                      disabled={deleting}
                    >
                      {deleting ? "Deleting…" : "Delete lead"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}

            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>

            {/* Outline, not the primary: Save is the action this form exists
                for, and two cyan buttons side by side would make the reader pick
                which one the modal is about. */}
            {editing ? (
              <Button
                type="button"
                variant="outline"
                onClick={onCallLead}
                disabled={saving}
              >
                Call this lead
              </Button>
            ) : null}

            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save lead" : "Add lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
