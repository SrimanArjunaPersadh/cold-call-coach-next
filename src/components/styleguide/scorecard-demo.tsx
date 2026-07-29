"use client"

// The §5.2 scorecard on /styleguide, so every treatment Phase 3 introduces —
// metrics tiles, the ESTIMATE tag, the audit grid, transcript turns, the swap
// control, the withheld block, the skeleton — is on the acceptance page before
// it is anywhere else (§4 "new treatments go on /styleguide first").
//
// It also gives the owner a way to check the layout on a real phone without
// burning a Deepgram + Claude round trip on a test call.
//
// SAMPLE DATA. The turns are the golden call's real transcript so the numbers
// below are the real ~58% / 0:19 of 0:33; the rubric scores are illustrative.

import { useState } from "react"

import { Scorecard, ScorecardEmpty, ScorecardSkeleton } from "@/components/scorecard"
import { nextRepSpeaker } from "@/lib/coach"
import { GOLDEN_TRANSCRIPT } from "@/lib/__fixtures__/golden-call"
import { computeMetrics } from "@/lib/metrics"
import type { RubricScores } from "@/lib/rubric"

const SAMPLE_SCORES: RubricScores = {
  overall_score: 2,
  top_fix: "Open with the reason for the call, then ask permission — you pitched before she knew who you were.",
  dimensions: [
    {
      key: "opener_pattern_interrupt",
      score: 2,
      evidence: "Hi. Is this is this this is Shimon. Is this the owner of Auxiliary Plumbers that I'm speaking to?",
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
      evidence: "I was looking for a plumber in the area, and I couldn't really find, like, a website.",
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

const SINGLE_SPEAKER = GOLDEN_TRANSCRIPT.map((t) => ({ ...t, speaker: 0 }))

export function ScorecardDemo() {
  const [repSpeaker, setRepSpeaker] = useState<number | null>(0)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow mb-2">Happy — swap the speaker and watch all three metrics move</p>
        <Scorecard
          data={{
            createdAt: "2026-07-29T14:03:00.000Z",
            durationSeconds: 69,
            scores: SAMPLE_SCORES,
            turns: GOLDEN_TRANSCRIPT,
            repSpeaker,
            metrics: computeMetrics(GOLDEN_TRANSCRIPT, repSpeaker),
          }}
          onSwapSpeaker={() =>
            setRepSpeaker(nextRepSpeaker(GOLDEN_TRANSCRIPT, repSpeaker))
          }
          saveNote={{ tone: "info", text: "Speaker & metrics saved." }}
        />
      </div>

      <div>
        <p className="eyebrow mb-2">
          Error — diarisation found one voice, so the metrics are withheld
        </p>
        <Scorecard
          data={{
            createdAt: "2026-07-29T14:03:00.000Z",
            durationSeconds: 69,
            scores: SAMPLE_SCORES,
            turns: SINGLE_SPEAKER,
            repSpeaker: 0,
            metrics: null,
          }}
          saveNote={{
            tone: "error",
            text: "Save failed (500). The metrics above are still correct — they're computed locally.",
          }}
        />
      </div>

      <div>
        <p className="eyebrow mb-2">Loading — skeleton in --surface-2 while analyze runs</p>
        <ScorecardSkeleton />
      </div>

      <div>
        <p className="eyebrow mb-2">Empty</p>
        <ScorecardEmpty />
      </div>
    </div>
  )
}
