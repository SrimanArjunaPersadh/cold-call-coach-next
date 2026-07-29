"use client"

// Phase 5's two new treatments on /styleguide, so they exist on the acceptance
// page before they exist anywhere else (§4: "Any treatment §4 doesn't cover goes
// on /styleguide first"). Phases 3 and 4 put the scorecard, inputs, modal,
// recorder, card, column and toast here; this follows that pattern for the
// attach-to-lead combobox and the call-history row.
//
// Both render the REAL components — `LeadCombobox` and `CallRow` — not a mock-up
// of them, so the page cannot drift from the app. `CallRow` was split out of
// `LeadCalls` for exactly this reason: the row without the fetch.
//
// It also gives the owner a way to check the combobox with a thumb, and to see a
// pre-metrics call render, without a Deepgram + Claude round trip.

import { useState } from "react"

import { CallRow } from "@/components/lead-calls"
import { LeadCombobox } from "@/components/lead-combobox"
import type { Lead } from "@/lib/board"
import type { StoredCall } from "@/lib/call-history"
import { GOLDEN_TRANSCRIPT } from "@/lib/__fixtures__/golden-call"
import { computeMetrics } from "@/lib/metrics"
import { cn } from "@/lib/utils"

const SAMPLE_LEADS: Lead[] = [
  { id: "l1", business: "Kloof Panel & Paint", phone: "031 764 1200" },
  { id: "l2", business: "Auxiliary Plumbers", phone: "+27 82 555 0110" },
  { id: "l3", business: "Westville Autobody", name: "Sipho Ndlovu", phone: "031 200 1234" },
  { id: "l4", business: "Hillcrest Electrical", phone: "031 765 4321" },
]

const SAMPLE_SCORES = {
  overall_score: 2,
  top_fix:
    "Open with the reason for the call, then ask permission — you pitched before she knew who you were.",
  dimensions: [
    {
      key: "opener_pattern_interrupt",
      score: 2,
      evidence: "Is this the owner of Auxiliary Plumbers that I'm speaking to?",
      fix: "Say your name once, cleanly, then state why you are calling in one sentence.",
    },
    {
      key: "offer_clarity",
      score: 1,
      evidence: "",
      fix: "Name the offer explicitly: what you build, for whom, and what it costs them to find out more.",
    },
    {
      key: "problem_tie",
      score: 3,
      evidence: "I couldn't really find, like, a website.",
      fix: "Verify the claim before you make it — she had two sites, and the call ended there.",
    },
    {
      key: "objection_handling",
      score: 1,
      evidence: "Okay. You too. Thanks.",
      fix: "Acknowledge the objection and ask one question instead of accepting the hang-up.",
    },
    {
      key: "close_or_cta",
      score: 1,
      evidence: "",
      fix: "Ask for a specific next step with a time attached, every call, even a bad one.",
    },
    {
      key: "permission_and_framing",
      score: 4,
      evidence: "How are you doing, man?",
      fix: "Follow the warm open with an explicit ask for thirty seconds.",
    },
  ],
}

/** A scored call with real stored metrics — the happy row. */
const SCORED: StoredCall = {
  id: "c1",
  created_at: "2026-07-29T14:03:00.000Z",
  status: "scored",
  rubric_scores: SAMPLE_SCORES,
  transcript: GOLDEN_TRANSCRIPT,
  rep_speaker: 0,
  // Written the way the Coach panel writes it, then stored. History FORMATS this
  // — it never recomputes, which is why the strip below cannot drift from Coach.
  metrics: computeMetrics(GOLDEN_TRANSCRIPT, 0),
}

/** The 15 July case: scored before metrics existed. NO strip — not zeros, not "—". */
const NO_METRICS: StoredCall = {
  ...SCORED,
  id: "c2",
  created_at: "2026-07-15T09:48:00.000Z",
  metrics: null,
}

/** Recorded, never scored. The status supplies the headline. */
const UNSCORED: StoredCall = {
  id: "c3",
  created_at: "2026-07-12T16:02:00.000Z",
  status: "error",
  rubric_scores: null,
  transcript: null,
  rep_speaker: null,
  metrics: null,
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow mb-2">{children}</p>
}

/** The status line under the combobox, in each of its three tones. */
function AttachStatus({
  tone,
  children,
}: {
  tone: "info" | "ok" | "err"
  children: React.ReactNode
}) {
  return (
    <p
      className={cn(
        "mt-2 text-label",
        tone === "err"
          ? "text-fail"
          : tone === "ok"
            ? "text-pass"
            : "text-muted-foreground",
      )}
    >
      {children}
    </p>
  )
}

export function ComboboxDemo() {
  const [live, setLive] = useState("")
  const [noMatch, setNoMatch] = useState("zzzz")

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Label>
          Happy — focus to open. Selection fires on mousedown, so the tap lands
          before the input blurs (§10). Arrows move, Enter picks, Escape closes.
        </Label>
        <LeadCombobox
          leads={SAMPLE_LEADS}
          value={live}
          onValueChange={setLive}
          onSelect={(lead) => setLive(lead.business || "")}
        />
        <AttachStatus tone="ok">Linked to Kloof Panel &amp; Paint.</AttachStatus>
      </div>

      <div>
        <Label>Empty — the query matches nothing</Label>
        <LeadCombobox
          leads={SAMPLE_LEADS}
          value={noMatch}
          onValueChange={setNoMatch}
          onSelect={() => {}}
        />
      </div>

      <div>
        <Label>Loading — the PATCH is in flight</Label>
        <LeadCombobox
          leads={SAMPLE_LEADS}
          value="Auxiliary Plumbers"
          onValueChange={() => {}}
          onSelect={() => {}}
        />
        <AttachStatus tone="info">Linking…</AttachStatus>
      </div>

      <div>
        <Label>Error — the server&rsquo;s own message, next to the control</Label>
        <LeadCombobox
          leads={SAMPLE_LEADS}
          value="Auxiliary Plumbers"
          onValueChange={() => {}}
          onSelect={() => {}}
        />
        <AttachStatus tone="err">Call not found</AttachStatus>
      </div>

      <div>
        <Label>
          Calling chip — linked state is STATE, not interaction, so no cyan
        </Label>
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted p-2">
          <span className="eyebrow shrink-0">Calling</span>
          <span className="min-w-0 flex-1 truncate text-subhead">
            Kloof Panel &amp; Paint
          </span>
          <span className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground">
            <span aria-hidden>✕</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export function CallHistoryDemo() {
  /** Never actually deletes — this is the acceptance page. */
  const noop = async () => false

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Label>
          Happy — collapsed, newest first. Open one: read-only scorecard, no swap
          control, stored metrics formatted rather than recomputed.
        </Label>
        <div className="flex flex-col gap-2">
          <CallRow call={SCORED} onDelete={noop} />
          <CallRow call={NO_METRICS} onDelete={noop} />
          <CallRow call={UNSCORED} onDelete={noop} />
        </div>
        <p className="mt-2 text-label text-muted-foreground">
          Row 2 was scored before metrics existed — open it and there is no
          metrics band at all, which is the honest answer. Row 3 never scored, so
          the badge is a dash and the status supplies the line.
        </p>
      </div>

      <div>
        <Label>Loading</Label>
        <p className="text-body text-muted-foreground">Loading calls…</p>
      </div>

      <div>
        <Label>Error — the placeholder carries what happened</Label>
        <p className="text-body text-fail">
          Cannot reach the server. Check your connection and try again.
        </p>
      </div>

      <div>
        <Label>Empty — an invitation, not a void</Label>
        <p className="text-body text-muted-foreground">
          No calls yet. Record one from Coach and link it here.
        </p>
      </div>
    </div>
  )
}
