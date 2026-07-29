"use client"

// ══ The Coach loop (Phase 3) ═══════════════════════════════════════════════
//
// Record → create-upload → signed PUT → analyze → scorecard → speaker swap →
// debounced persist. Translated from the old app's index.html; the behaviour is
// the reference, React is only the syntax.
//
// Built in the old app's order — the mic-permission state machine first, then
// the recorder, then the happy path — because the failure paths are the ones
// that actually happen on a phone, and that ordering is why they work.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Container } from "@/components/app-shell"
import { LeadCombobox } from "@/components/lead-combobox"
import {
  Scorecard,
  ScorecardEmpty,
  ScorecardSkeleton,
} from "@/components/scorecard"
import { SecretModal } from "@/components/secret-modal"
import { Button } from "@/components/ui/button"
import type { Lead } from "@/lib/board"
import { attachPayload } from "@/lib/call-history"
import { metricsForPersist, nextRepSpeaker } from "@/lib/coach"
import { fmtSize, fmtTime } from "@/lib/format"
import { leadBusinessName } from "@/lib/lead-combo"
import { errorText, leadsApi } from "@/lib/leads-api"
import { leadsCache } from "@/lib/leads-cache"
import { computeMetrics, type DiarisedTurn } from "@/lib/metrics"
import { takePendingLead, type PendingLead } from "@/lib/pending-call"
import { asRubricScores, type RubricScores } from "@/lib/rubric"
import { apiFetch } from "@/lib/secret"
import { cn } from "@/lib/utils"

// ── Mic-permission state machine ──────────────────────────────────────────
// The #1 failure path. Pre-checks the environment and the Permissions API, then
// branches. getUserMedia is only *attempted* on Record; its errors feed back
// into this same machine. Copy is the old app's, verbatim.

type MicStateKey =
  | "checking"
  | "insecure"
  | "unsupported"
  | "prompt"
  | "granted"
  | "denied"
  | "no-device"

type MicTone = "info" | "ok" | "warn" | "err"

type MicState = {
  tone: MicTone
  /** Is the Record button enabled in this state? */
  record: boolean
  retry: boolean
  title: string
  detail: () => React.ReactNode
  steps?: string[]
}

const MIC_STATES: Record<MicStateKey, MicState> = {
  checking: {
    tone: "info",
    record: false,
    retry: false,
    title: "Checking microphone…",
    detail: () => null,
  },
  insecure: {
    tone: "err",
    record: false,
    retry: false,
    title: "Recording needs https or localhost.",
    detail: () => (
      <>
        You&rsquo;re on{" "}
        <code className="font-mono text-label">
          {typeof location === "undefined" ? "" : location.origin || location.href}
        </code>
        . Serve via Live Server (localhost) or deploy to Vercel (https).
      </>
    ),
  },
  unsupported: {
    tone: "warn",
    record: false,
    retry: false,
    title: "Use Chrome to record.",
    detail: () =>
      "MediaRecorder is unreliable in this browser. Chrome desktop is the tested path.",
  },
  prompt: {
    tone: "info",
    record: true,
    retry: false,
    title: "Ready when you are.",
    detail: () => (
      <>
        Click Record, then <strong className="font-semibold">Allow</strong> the mic
        prompt.
      </>
    ),
  },
  granted: {
    tone: "ok",
    record: true,
    retry: false,
    title: "Microphone ready.",
    detail: () => "Click Record to start capturing this call.",
  },
  denied: {
    tone: "err",
    record: false,
    retry: true,
    title: "Mic blocked.",
    detail: () => "Chrome is refusing microphone access for this site:",
    steps: [
      "Click the 🔒 icon in the address bar",
      "Site settings → Microphone → Allow",
      "Reload the page",
    ],
  },
  "no-device": {
    tone: "err",
    record: false,
    retry: true,
    title: "No microphone found.",
    detail: () =>
      "Plug one in, or check your system sound settings, then retry.",
  },
}

const TONE_TEXT: Record<MicTone, string> = {
  info: "text-foreground",
  ok: "text-pass",
  warn: "text-warn",
  err: "text-fail",
}

/** 'granted' | 'prompt' | 'denied' from the Permissions API map 1:1. */
function mapPermission(state: PermissionState): MicStateKey {
  return state === "granted" || state === "denied" ? state : "prompt"
}

/**
 * Prefer Opus-in-WebM (what Deepgram ingests directly); fall back gracefully.
 * `''` means "let the browser pick its default container". Resolved lazily — on
 * the server there is no MediaRecorder to ask.
 */
function pickMime(): string {
  if (typeof window === "undefined" || !("MediaRecorder" in window)) return ""
  for (const c of ["audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ""
}

type Phase = "idle" | "recording" | "recorded"

type Recording = { blob: Blob; seconds: number; mime: string }

type Analysis = {
  callId: string | null
  createdAt: string | null
  turns: DiarisedTurn[]
  repSpeaker: number | null
}

const NO_ANALYSIS: Analysis = {
  callId: null,
  createdAt: null,
  turns: [],
  repSpeaker: null,
}

type StatusTone = "info" | "ok" | "err"

export function CoachPanel() {
  const [micKey, setMicKey] = useState<MicStateKey>("checking")
  /** Overrides the state table's detail line (recording, or an odd gUM error). */
  const [micDetail, setMicDetail] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>("idle")
  const [elapsed, setElapsed] = useState(0)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [hint, setHint] = useState("No recording yet.")

  const [analyzeDisabled, setAnalyzeDisabled] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: "info",
    text: "",
  })

  const [analysis, setAnalysis] = useState<Analysis>(NO_ANALYSIS)
  const [scores, setScores] = useState<RubricScores | null>(null)
  const [saveNote, setSaveNote] = useState<{
    tone: "info" | "error"
    text: string
  } | null>(null)

  // ── Call ↔ lead linking (Phase 5) ───────────────────────────────────────
  // Two paths, both the old app's. FORWARD: the lead modal's "Call this lead"
  // hands a lead over, the chip names it, and create-upload saves `lead_id` with
  // the row. AFTER THE FACT: the combobox under a finished scorecard PATCHes the
  // link on. Neither replaces the other — you do not always know which lead you
  // are about to ring, and you always know afterwards.

  /** The lead the NEXT recording will link to. */
  const [attachedLead, setAttachedLead] = useState<PendingLead | null>(null)
  /** The just-analysed call, i.e. the one the combobox can still link. */
  const [lastCallId, setLastCallId] = useState<string | null>(null)
  const [attachLeads, setAttachLeads] = useState<Lead[]>([])
  const [attachQuery, setAttachQuery] = useState("")
  const [attachStatus, setAttachStatus] = useState<{
    tone: "info" | "ok" | "err"
    text: string
  } | null>(null)

  const rec = useRef({
    mr: null as MediaRecorder | null,
    stream: null as MediaStream | null,
    chunks: [] as Blob[],
    mime: "",
    startedAt: 0,
    timerId: 0 as ReturnType<typeof setInterval> | 0,
    audioCtx: null as AudioContext | null,
    rafId: 0,
  })
  const meterRef = useRef<HTMLSpanElement>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The call the panel is currently showing — a stale save must not touch it. */
  const currentCallId = useRef<string | null>(null)
  const playbackUrlRef = useRef<string | null>(null)

  const mic = MIC_STATES[micKey]

  const setMic = useCallback((key: MicStateKey, detail?: string) => {
    setMicKey(key)
    setMicDetail(detail ?? null)
  }, [])

  // ── Environment pre-check ───────────────────────────────────────────────
  // Resolves a starting state without prompting for the mic. Retry re-runs this
  // whole check, so allowing the mic in site settings and tapping Retry lands on
  // 'granted' rather than merely 'prompt'.
  const detectMicState = useCallback(async (): Promise<MicStateKey> => {
    if (!window.isSecureContext) return "insecure"
    if (
      !("MediaRecorder" in window) ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      return "unsupported"
    }
    // The Permissions API isn't universal (Firefox lacks 'microphone'); when
    // it's absent we fall back to 'prompt' and let the Record click resolve it.
    if (navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        })
        return mapPermission(permission.state)
      } catch {
        /* name unsupported → fall through */
      }
    }
    return "prompt"
  }, [])

  useEffect(() => {
    let cancelled = false
    let permission: PermissionStatus | null = null
    const onChange = () => {
      if (permission && !cancelled) setMic(mapPermission(permission.state))
    }

    void (async () => {
      const key = await detectMicState()
      if (cancelled) return
      setMic(key)
      if (key === "insecure" || key === "unsupported") return
      // Re-render live if the user changes the setting in another tab.
      if (navigator.permissions?.query) {
        try {
          permission = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          })
          if (!cancelled) permission.addEventListener("change", onChange)
        } catch {
          /* no live updates in this browser — Retry still works */
        }
      }
    })()

    return () => {
      cancelled = true
      permission?.removeEventListener("change", onChange)
    }
  }, [detectMicState, setMic])

  // ── Recorder ────────────────────────────────────────────────────────────

  const stopTimer = useCallback(() => {
    if (rec.current.timerId) clearInterval(rec.current.timerId)
    rec.current.timerId = 0
  }, [])

  const stopMeter = useCallback(() => {
    if (rec.current.rafId) cancelAnimationFrame(rec.current.rafId)
    rec.current.rafId = 0
    if (meterRef.current) meterRef.current.style.width = "0%"
    if (rec.current.audioCtx) {
      void rec.current.audioCtx.close().catch(() => {})
      rec.current.audioCtx = null
    }
  }, [])

  const cleanupStream = useCallback(() => {
    if (rec.current.stream) {
      rec.current.stream.getTracks().forEach((t) => t.stop())
      rec.current.stream = null
    }
  }, [])

  // Level meter — Web Audio RMS → bar width, written straight to the DOM rather
  // than through state: this ticks at frame rate and must not re-render the page.
  // The analyser is NOT connected to the output, so there is no monitoring
  // feedback into the recording. The whole thing is wrapped in try/catch — the
  // meter is cosmetic and must never block recording.
  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      const ctx = new Ctx()
      rec.current.audioCtx = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)
      const tick = () => {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length) // 0..~1
        if (meterRef.current) {
          meterRef.current.style.width =
            Math.min(100, Math.round(rms * 180)) + "%"
        }
        rec.current.rafId = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      /* meter is cosmetic — never block recording on it */
    }
  }, [])

  const resetAnalysis = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    currentCallId.current = null
    setAnalysis(NO_ANALYSIS)
    setScores(null)
    setSaveNote(null)
  }, [])

  // ── The forward path: a lead handed over by "Call this lead" ─────────────
  //
  // Read-and-clear on mount. `attachedLead` was a module variable in the old app,
  // so a reload lost it and the next recording went out unlinked; the handoff is
  // one-shot for exactly that reason. See lib/pending-call.ts.
  //
  // THE ONE SUPPRESSION IN THIS CODEBASE, and why it is the right call here.
  // `set-state-in-effect` is about cascading renders, and its own guidance carves
  // out reading from an external system — which sessionStorage is. Every way of
  // avoiding it is worse:
  //
  //   · `useState(() => takePendingLead())` or a ref read during render both run
  //     DURING render, so the server returns null (no window) and the client
  //     returns the lead. The first client render would then disagree with the
  //     prerendered HTML — a hydration mismatch — and render would stop being
  //     pure, because `takePendingLead` CLEARS the key it reads.
  //   · Putting the lead in the URL instead would fix the lint and break the
  //     behaviour: the attachment would survive a reload, which is the stale-link
  //     footgun lib/pending-call.ts exists to avoid.
  //
  // So: read after mount, which is correct, and accept one state update on the
  // pass that mounts an empty Coach panel.
  useEffect(() => {
    const pending = takePendingLead()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading sessionStorage after mount is the only hydration-safe option; see above
    if (pending) setAttachedLead(pending)
  }, [])

  /** The attach control is about ONE call, so a new recording makes it stale. */
  const resetAttach = useCallback(() => {
    setLastCallId(null)
    setAttachQuery("")
    setAttachStatus(null)
    // NOT `attachedLead`: that is the lead you are still calling, and recording a
    // second attempt at the same prospect must keep it. Only the ✕ clears it.
  }, [])

  /**
   * Load the leads the combobox lists, reusing the board's request.
   *
   * `leadsCache.load()` without `force` returns rows the board already fetched,
   * or joins its in-flight GET — so opening Coach after Leads costs no request at
   * all. A failure is deliberately swallowed: the call is already recorded and
   * scored, and the combobox degrades to "No leads match." rather than putting an
   * error over finished work. That is the old app's `catch (_) {}` at line 1796.
   */
  const revealAttach = useCallback(async () => {
    try {
      setAttachLeads(await leadsCache.load())
    } catch {
      /* combobox shows "No leads match." */
    }
  }, [])

  const attachToLead = useCallback(
    async (lead: Lead) => {
      if (!lastCallId) return
      const name = leadBusinessName(lead)
      setAttachStatus({ tone: "info", text: "Linking…" })
      try {
        await leadsApi(
          `/api/calls?id=${encodeURIComponent(lastCallId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(attachPayload(lead.id)),
          },
          "Could not link call",
        )
        setAttachQuery(name)
        setAttachStatus({ tone: "ok", text: `Linked to ${name}.` })
      } catch (err) {
        // The server's own message, in red, next to the control that failed —
        // and the picked lead stays pickable, so retry is one tap.
        setAttachStatus({
          tone: "err",
          text: errorText(err, "Could not link call"),
        })
      }
    },
    [lastCallId],
  )

  // Persist rep_speaker + metrics through PATCH /api/calls (the design doc's
  // save-analysis step, folded into the existing route). Debounced 500ms so
  // rapid swaps write once.
  const persistAnalysis = useCallback(
    (callId: string | null, turns: DiarisedTurn[], repSpeaker: number | null) => {
      if (!callId || repSpeaker === null) return
      if (persistTimer.current) clearTimeout(persistTimer.current)
      setSaveNote({ tone: "info", text: "Saving speaker & metrics…" })

      persistTimer.current = setTimeout(async () => {
        // Below two speakers the numbers are meaningless — store null, not noise.
        const metrics = metricsForPersist(turns, repSpeaker)
        try {
          const res = await apiFetch(
            `/api/calls?id=${encodeURIComponent(callId)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ rep_speaker: repSpeaker, metrics }),
            },
          )
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Save failed (${res.status}).`)
          }
          // Both paths check the panel hasn't moved on: a stale response must
          // never overwrite a newer call's note.
          if (currentCallId.current === callId) {
            setSaveNote({ tone: "info", text: "Speaker & metrics saved." })
          }
        } catch (err) {
          if (currentCallId.current !== callId) return
          const message = err instanceof Error ? err.message : "Save failed."
          setSaveNote({
            tone: "error",
            text: `${message} The metrics above are still correct — they're computed locally.`,
          })
        }
      }, 500)
    },
    [],
  )

  const finishRecording = useCallback(() => {
    const type =
      rec.current.mime || rec.current.chunks[0]?.type || "audio/webm"
    const blob = new Blob(rec.current.chunks, { type })
    const seconds = Math.max(
      0,
      Math.round((performance.now() - rec.current.startedAt) / 1000),
    )

    setRecording({ blob, seconds, mime: type })
    const url = URL.createObjectURL(blob)
    playbackUrlRef.current = url
    setPlaybackUrl(url)
    setAnalyzeDisabled(false)
    setStatus({ tone: "info", text: "" })
    setHint("Recorded. Click Analyze, or Record again to redo.")

    cleanupStream()
    setPhase("recorded")
  }, [cleanupStream])

  const startRecording = useCallback(async () => {
    setMic("checking") // disables the button during the await
    setHint("")
    setAnalyzeDisabled(true)
    resetAttach() // last call's attach control is stale now…
    resetAnalysis() // …and so are its transcript, metrics and scores
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current)
      playbackUrlRef.current = null
      setPlaybackUrl(null)
    }
    setRecording(null)

    let stream: MediaStream
    try {
      // Mono, and deliberately NO echo-cancellation / noise-suppression /
      // auto-gain: those are tuned to isolate the near speaker and would fight
      // capturing the prospect coming back through the phone speaker — the
      // far-end signal diarisation depends on.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    } catch (err) {
      const name = err instanceof Error ? err.name : ""
      if (name === "NotAllowedError" || name === "SecurityError") setMic("denied")
      else if (name === "NotFoundError" || name === "DevicesNotFoundError")
        setMic("no-device")
      else
        setMic(
          "denied",
          `Could not open the microphone: ${name || "unknown error"}.`,
        )
      return
    }

    setMic("granted", "Recording… click Stop when the call ends.")

    const mime = pickMime()
    rec.current.stream = stream
    rec.current.chunks = []
    rec.current.mime = mime
    rec.current.mr = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream)
    rec.current.mr.ondataavailable = (e) => {
      if (e.data && e.data.size) rec.current.chunks.push(e.data)
    }
    rec.current.mr.onstop = finishRecording
    rec.current.mr.onerror = () => {
      setHint("Recorder error — try again.")
      stopTimer()
      stopMeter()
      cleanupStream()
      setPhase("idle")
    }
    rec.current.mr.start(1000) // one chunk per second — safe for long calls

    rec.current.startedAt = performance.now()
    setElapsed(0)
    rec.current.timerId = setInterval(() => {
      setElapsed((performance.now() - rec.current.startedAt) / 1000)
    }, 250)
    startMeter(stream)
    setPhase("recording")
  }, [
    cleanupStream,
    finishRecording,
    resetAnalysis,
    resetAttach,
    setMic,
    startMeter,
    stopMeter,
    stopTimer,
  ])

  const stopRecording = useCallback(() => {
    if (rec.current.mr && rec.current.mr.state !== "inactive") {
      rec.current.mr.stop() // → onstop → finishRecording
    }
    stopTimer()
    stopMeter()
  }, [stopMeter, stopTimer])

  const onRecordClick = useCallback(() => {
    if (phase === "recording") stopRecording()
    else void startRecording()
  }, [phase, startRecording, stopRecording])

  // Tear everything down if the panel unmounts mid-recording.
  useEffect(() => {
    const refs = rec.current
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
      if (refs.timerId) clearInterval(refs.timerId)
      if (refs.rafId) cancelAnimationFrame(refs.rafId)
      if (refs.mr && refs.mr.state !== "inactive") refs.mr.stop()
      refs.stream?.getTracks().forEach((t) => t.stop())
      void refs.audioCtx?.close().catch(() => {})
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current)
    }
  }, [])

  // ── Upload → analyze ────────────────────────────────────────────────────

  const analyzeRecording = useCallback(async () => {
    if (!recording) return
    setAnalyzeDisabled(true)
    setAnalyzing(true)
    resetAnalysis() // don't leave the previous call's card on screen
    setStatus({ tone: "info", text: "Creating upload slot…" })
    setHint("Saving the recording before transcription.")

    try {
      const createRes = await apiFetch("/api/create-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          duration_seconds: recording.seconds,
          mime_type: recording.mime,
          // There was never a UI for this. It stays a localStorage default.
          offer_context: localStorage.getItem("offer_context_default") || "",
          // The lead handed over by "Call this lead", so the row is linked from
          // the moment it exists rather than PATCHed afterwards. Null when you
          // opened Coach directly — the combobox below the scorecard is the path
          // for that, and it is the common one.
          lead_id: attachedLead ? attachedLead.id : null,
        }),
      })
      const createJson = await createRes.json().catch(() => ({}))
      if (!createRes.ok)
        throw new Error(createJson.error || "Could not create upload.")

      setStatus({ tone: "info", text: "Uploading audio to private storage…" })
      const uploadUrl = createJson.signed_upload_url
      if (!uploadUrl) throw new Error("Upload URL missing from server response.")

      // Note: a plain fetch PUT, and deliberately no progress percentage — a
      // single fetch exposes no progress events, and swapping to XHR to
      // manufacture one is not a translation. Staged text status instead.
      // This request does NOT carry the app secret; it is Supabase's signed URL.
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": recording.mime || "audio/webm" },
        body: recording.blob,
      })
      if (!uploadRes.ok) {
        const detail = await uploadRes.text().catch(() => "")
        throw new Error(detail || `Upload failed with ${uploadRes.status}.`)
      }

      setStatus({
        tone: "ok",
        text: `Saved recording ${createJson.call_id}. Transcribing & scoring… (10–60s)`,
      })
      setHint(
        "Recording saved. Deepgram is transcribing, then Claude scores the rubric.",
      )

      const analyzeRes = await apiFetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ call_id: createJson.call_id }),
      })
      const analyzeJson = await analyzeRes.json().catch(() => ({}))
      if (!analyzeRes.ok)
        throw new Error(analyzeJson.error || "Could not make transcript.")

      // Seed rep_speaker from the first voice — on an outbound cold call that is
      // the rep nearly always. The swap fixes the rest with zero model calls.
      const turns: DiarisedTurn[] = Array.isArray(analyzeJson.transcript)
        ? analyzeJson.transcript
        : []
      const repSpeaker = turns.length ? Number(turns[0].speaker) : null
      const callId: string = createJson.call_id

      currentCallId.current = callId
      setAnalysis({
        callId,
        createdAt: new Date().toISOString(),
        turns,
        repSpeaker,
      })
      setScores(asRubricScores(analyzeJson.rubric_scores))
      persistAnalysis(callId, turns, repSpeaker)

      setStatus({
        tone: "ok",
        text: `Transcript and coaching scores ready for recording ${callId}.`,
      })
      setHint("Transcript and coaching scores ready.")

      // Offer the after-the-fact "Attach to lead" control. If a lead was already
      // handed over, create-upload saved `lead_id` with the row — so reflect that
      // rather than asking again.
      setLastCallId(callId)
      await revealAttach()
      if (attachedLead) {
        setAttachQuery(attachedLead.business)
        setAttachStatus({
          tone: "ok",
          text: `Linked to ${attachedLead.business}.`,
        })
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Upload failed."
      setStatus({ tone: "err", text: message })
      // The local blob is untouched, so Analyze is a real retry.
      setHint(
        "Upload failed. Your local recording is still here; you can retry Analyze.",
      )
      setAnalyzeDisabled(false)
    } finally {
      setAnalyzing(false)
    }
  }, [attachedLead, persistAnalysis, recording, resetAnalysis, revealAttach])

  // ── Speaker swap ────────────────────────────────────────────────────────

  const swapSpeaker = useCallback(() => {
    // Cycles the distinct voices; below two it is a no-op and the button is
    // disabled anyway. Every metric recomputes from the reassigned turns — this
    // is never a display relabel (§6).
    const next = nextRepSpeaker(analysis.turns, analysis.repSpeaker)
    if (next === analysis.repSpeaker) return
    setAnalysis((prev) => ({ ...prev, repSpeaker: next }))
    persistAnalysis(analysis.callId, analysis.turns, next)
  }, [analysis, persistAnalysis])

  // The one place metrics are computed for display. The scorecard never does it,
  // so the card Phase 5 renders off a stored row cannot drift from this one.
  const metrics = useMemo(
    () => computeMetrics(analysis.turns, analysis.repSpeaker),
    [analysis.turns, analysis.repSpeaker],
  )

  const hasAnalysis = analysis.turns.length > 0 || scores !== null

  return (
    <Container className="flex flex-col gap-8 pb-16">
      <header>
        <h1 className="text-title">Coach</h1>
      </header>

      {/* ── Calling <business> ──────────────────────────────────────────────
          Which lead the next recording links to. A LINKED-STATE INDICATOR IS
          STATE, NOT INTERACTION, so it does not earn cyan — the same ruling as
          Phase 3's recording indicator and Phase 4's drop highlight. --surface-2
          and a border carry it. */}
      {attachedLead ? (
        <section className="flex items-center gap-4 rounded-lg border border-border bg-muted p-2">
          <span className="eyebrow shrink-0">Calling</span>
          <span className="min-w-0 flex-1 truncate text-subhead">
            {attachedLead.business}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Don't link this call to ${attachedLead.business}`}
            onClick={() => setAttachedLead(null)}
          >
            <span aria-hidden>✕</span>
          </Button>
        </section>
      ) : null}

      {/* ── Mic state + record control ──────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-4">
        <p className={cn("text-subhead", TONE_TEXT[mic.tone])}>{mic.title}</p>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          {micDetail ?? mic.detail()}
        </p>

        {mic.steps ? (
          <ol className="mt-2 list-decimal space-y-2 pl-4 text-body text-foreground-2">
            {mic.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* Record is the one primary action on this screen, so it earns cyan. */}
          <Button
            type="button"
            size="lg"
            onClick={onRecordClick}
            disabled={phase !== "recording" && !mic.record}
          >
            {phase === "recording"
              ? "Stop"
              : phase === "recorded"
                ? "Record again"
                : "Record"}
          </Button>

          {mic.retry && phase === "idle" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMic("checking")
                void detectMicState().then(setMic)
              }}
            >
              Retry
            </Button>
          ) : null}

          {hint ? (
            <p className="text-body text-muted-foreground">{hint}</p>
          ) : null}
        </div>

        {/* Recording indicator: state, not interaction — so no cyan. */}
        {phase === "recording" ? (
          <div className="mt-4 flex items-center gap-4 rounded-lg bg-muted p-4">
            <span
              aria-hidden
              className="size-2 shrink-0 animate-pulse rounded-md bg-foreground"
            />
            <span className="eyebrow">Recording</span>
            <span data-numeric className="text-subhead" role="timer">
              {fmtTime(elapsed)}
            </span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-md bg-border">
              <span
                ref={meterRef}
                aria-hidden
                className="block h-full w-0 bg-muted-foreground"
              />
            </span>
          </div>
        ) : null}

        {/* Finished capture: playback, meta, Analyze. */}
        {phase === "recorded" && recording ? (
          <div className="mt-4 rounded-lg border border-border p-4">
            <audio
              controls
              src={playbackUrl ?? undefined}
              className="w-full"
            />
            <p data-numeric className="mt-2 text-label text-muted-foreground">
              Recording ready · {fmtTime(recording.seconds)} ·{" "}
              {fmtSize(recording.blob.size)} · {recording.mime}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void analyzeRecording()}
              disabled={analyzeDisabled}
            >
              Analyze
            </Button>
          </div>
        ) : null}

        {status.text ? (
          <p
            role="status"
            className={cn(
              "mt-4 text-body",
              status.tone === "err"
                ? "text-fail"
                : status.tone === "ok"
                  ? "text-pass"
                  : "text-foreground-2",
            )}
          >
            {status.text}
          </p>
        ) : null}
      </section>

      {/* ── Scorecard (§5.2) ────────────────────────────────────────────── */}
      {analyzing ? (
        <ScorecardSkeleton />
      ) : hasAnalysis ? (
        <Scorecard
          data={{
            createdAt: analysis.createdAt,
            durationSeconds: recording?.seconds ?? null,
            scores,
            turns: analysis.turns,
            repSpeaker: analysis.repSpeaker,
            metrics,
          }}
          onSwapSpeaker={swapSpeaker}
          saveNote={saveNote}
        />
      ) : (
        <ScorecardEmpty />
      )}

      {/* ── Attach to lead (§ the after-the-fact path) ───────────────────────
          Only once there is a call to attach. Sits below the scorecard because
          that is when the question arises: the call is scored, and now it needs
          somewhere to live. */}
      {lastCallId ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <label htmlFor="attach-lead" className="eyebrow mb-2 block">
            Attach to lead
          </label>
          <LeadCombobox
            id="attach-lead"
            leads={attachLeads}
            value={attachQuery}
            onValueChange={setAttachQuery}
            onSelect={(lead) => void attachToLead(lead)}
          />
          {attachStatus ? (
            <p
              role="status"
              className={cn(
                "mt-2 text-label",
                attachStatus.tone === "err"
                  ? "text-fail"
                  : attachStatus.tone === "ok"
                    ? "text-pass"
                    : "text-muted-foreground",
              )}
            >
              {attachStatus.text}
            </p>
          ) : (
            <p className="mt-2 text-label text-muted-foreground">
              Optional. Link this call to a lead to keep it in that lead&rsquo;s
              history.
            </p>
          )}
        </section>
      ) : null}

      <SecretModal />
    </Container>
  )
}
