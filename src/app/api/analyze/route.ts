import { requireSecret } from "@/lib/api/auth"
import {
  errorMessage,
  json,
  methodNotAllowed,
  readJson,
} from "@/lib/api/http"
import {
  encodeStoragePath,
  getBucket,
  getUserId,
  requireEnv,
  supabaseFetch,
} from "@/lib/api/supabase"

// Node runtime, not Edge — deliberate, carried over from the old app (§2).
export const runtime = "nodejs"

const ALLOW = "POST"

// ---------------------------------------------------------------------------
// FROZEN BRAIN (§5.1). DIMENSION_KEYS, RUBRIC_TOOL and RUBRIC_SYSTEM below are
// copied verbatim from the old app's api/analyze.js. Not renamed, not
// reordered, not "improved". A scoring-logic change is its own planning pass
// with its own test calls — never a rider on this migration.
// ---------------------------------------------------------------------------

// The six fixed Hormozi cold-calling dimensions (PHASE1-DESIGN §5a).
const DIMENSION_KEYS = [
  "opener_pattern_interrupt",
  "offer_clarity",
  "problem_tie",
  "objection_handling",
  "close_or_cta",
  "permission_and_framing",
]

// Forced tool-use schema. strict:true guarantees the JSON validates exactly —
// no prose, no arithmetic, only 1–5 judgments + evidence quotes (§5a).
const RUBRIC_TOOL = {
  name: "score_cold_call",
  description:
    "Record Hormozi cold-calling rubric scores for this call. Score every dimension from text alone; never compute numbers.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      overall_score: {
        type: "integer",
        enum: [1, 2, 3, 4, 5],
        description: "Overall call quality, 1 (poor) to 5 (excellent).",
      },
      top_fix: {
        type: "string",
        description: "The single highest-leverage change the rep should make.",
      },
      dimensions: {
        type: "array",
        description:
          "Exactly one entry per dimension key, in this order: " +
          DIMENSION_KEYS.join(", ") + ".",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: { type: "string", enum: DIMENSION_KEYS },
            score: {
              type: "integer",
              enum: [1, 2, 3, 4, 5],
              description: "1 (poor) to 5 (excellent) for this dimension.",
            },
            evidence: {
              type: "string",
              description:
                "A short verbatim quote from the transcript that justifies the score, or an empty string if the rep never did this.",
            },
            fix: {
              type: "string",
              description: "One concrete, specific improvement for this dimension.",
            },
          },
          required: ["key", "score", "evidence", "fix"],
        },
      },
    },
    required: ["overall_score", "top_fix", "dimensions"],
  },
}

const RUBRIC_SYSTEM =
  "You are a cold-calling coach grading a rep against Alex Hormozi's principles. " +
  "You are given a diarized transcript (Speaker 0 is the rep, other speakers are the prospect) " +
  "and the rep's current offer. Score each dimension from the text alone — tonality and prosody " +
  "are out of scope. Pull evidence quotes verbatim from the transcript. Do not compute any numbers; " +
  "only give 1–5 judgments, quotes, and one concrete fix per dimension. Call the score_cold_call tool."

// ---------------------------------------------------------------------------

/** One diarised turn as Deepgram + the merge below produce it. */
type DiarisedTurn = {
  speaker: number
  start: number
  end: number
  text: string
}

type DeepgramWord = {
  speaker?: number
  punctuated_word?: string
  word?: string
  start?: number
  end: number
}

type DeepgramResponse = {
  results?: {
    channels?: { alternatives?: { words?: DeepgramWord[] }[] }[]
  }
  err_msg?: string
  message?: string
  error?: string
}

type AnthropicResponse = {
  content?: { type: string; input?: unknown }[]
  model?: string
  error?: { message?: string }
}

function transcriptToText(turns: DiarisedTurn[]): string {
  return turns
    .map((t) => `Speaker ${t.speaker}: ${t.text}`)
    .join("\n")
}

async function scoreRubric(turns: DiarisedTurn[], offerContext: string | null) {
  const apiKey = requireEnv("ANTHROPIC_API_KEY")
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5"

  const offer = offerContext && offerContext.trim()
    ? offerContext.trim()
    : "(No offer context provided.)"
  const userText =
    `Offer being sold on this call:\n${offer}\n\n` +
    `Diarized transcript:\n${transcriptToText(turns)}`

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: RUBRIC_SYSTEM,
      tools: [RUBRIC_TOOL],
      tool_choice: { type: "tool", name: "score_cold_call" },
      messages: [{ role: "user", content: userText }],
    }),
  })

  const text = await res.text()
  // Renamed from the old app's local `json` only to avoid shadowing the shared
  // response helper. Same value, same use.
  const body: AnthropicResponse = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const message = (body.error && body.error.message) || `Claude failed: ${res.status}`
    throw new Error(message)
  }

  const toolUse = (body.content || []).find((b) => b.type === "tool_use")
  if (!toolUse) throw new Error("Claude did not return rubric scores")

  return { rubricScores: toolUse.input, analysisModel: body.model || model }
}

function deepgramTurns(result: DeepgramResponse): DiarisedTurn[] {
  const words = result.results?.channels?.[0]?.alternatives?.[0]?.words || []
  const turns: DiarisedTurn[] = []

  for (const word of words) {
    const speaker = Number.isInteger(word.speaker) ? (word.speaker as number) : 0
    const text = word.punctuated_word || word.word || ""
    if (!text) continue

    const last = turns[turns.length - 1]
    if (last && last.speaker === speaker) {
      last.text += " " + text
      last.end = word.end
    } else {
      turns.push({
        speaker,
        start: word.start || 0,
        end: word.end || word.start || 0,
        text,
      })
    }
  }

  return turns
}

async function markError(callId: string, message: string) {
  await supabaseFetch(
    `/rest/v1/calls?id=eq.${encodeURIComponent(callId)}` +
      `&user_id=eq.${encodeURIComponent(getUserId())}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ status: "error", error_message: message }),
    },
  ).catch(() => {})
}

export async function POST(req: Request) {
  const denied = requireSecret(req)
  if (denied) return denied

  const userId = getUserId()

  let callId = ""
  try {
    const payload = await readJson(req)
    callId = typeof payload.call_id === "string" ? payload.call_id : ""
    if (!callId) return json(400, { error: "Missing call_id" })

    // Server-side clamp (§9). The old app scoped this route by call id alone —
    // the only route that did. A call id belonging to anyone else now reads as
    // "not found" and is never transcribed, scored, or written to.
    const rows = await supabaseFetch<
      { id: string; audio_path: string; offer_context: string | null }[]
    >(
      `/rest/v1/calls?id=eq.${encodeURIComponent(callId)}` +
        `&user_id=eq.${encodeURIComponent(userId)}` +
        `&select=id,audio_path,offer_context`,
    )
    const call = rows && rows[0]
    if (!call) return json(404, { error: "Call not found" })

    await supabaseFetch(
      `/rest/v1/calls?id=eq.${encodeURIComponent(callId)}` +
        `&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ status: "transcribing", error_message: null }),
      },
    )

    const bucket = getBucket()
    const signedDownload = await supabaseFetch<{
      signedURL?: string
      signedUrl?: string
      url?: string
    }>(`/storage/v1/object/sign/${bucket}/${encodeStoragePath(call.audio_path)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 600 }),
    })

    const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "")
    const signedPath =
      signedDownload.signedURL || signedDownload.signedUrl || signedDownload.url
    if (!signedPath) throw new Error("Could not create audio download URL")
    // signedPath is relative to /storage/v1 (e.g. "/object/sign/...") — make it absolute.
    const audioUrl = signedPath.startsWith("http")
      ? signedPath
      : `${supabaseUrl}/storage/v1${signedPath}`

    const deepgramKey = requireEnv("DEEPGRAM_API_KEY")
    const deepgramUrl = "https://api.deepgram.com/v1/listen?model=nova-3&diarize=true&punctuate=true&smart_format=true"
    const dgRes = await fetch(deepgramUrl, {
      method: "POST",
      headers: {
        authorization: `Token ${deepgramKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
    })
    const dgText = await dgRes.text()
    const dgJson: DeepgramResponse = dgText ? JSON.parse(dgText) : {}
    if (!dgRes.ok) {
      const message = dgJson.err_msg || dgJson.message || dgJson.error || `Deepgram failed: ${dgRes.status}`
      throw new Error(message)
    }

    const transcript = deepgramTurns(dgJson)

    // Claude Haiku forced tool-use → rubric JSON (§5a). No arithmetic here —
    // the client computes the metrics from these turns (§6, §9).
    const { rubricScores, analysisModel } = await scoreRubric(
      transcript,
      call.offer_context,
    )

    await supabaseFetch(
      `/rest/v1/calls?id=eq.${encodeURIComponent(callId)}` +
        `&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({
          transcript,
          rubric_scores: rubricScores,
          analysis_model: analysisModel,
          stt_provider: "deepgram",
          status: "scored",
        }),
      },
    )

    return json(200, { call_id: callId, transcript, rubric_scores: rubricScores })
  } catch (err) {
    const message = errorMessage(err) || "Analyze failed"
    if (callId) await markError(callId, message)
    return json(500, { error: message })
  }
}

// The old handler's `405 + Allow` tail, after requireSecret.
async function notAllowed(req: Request) {
  const denied = requireSecret(req)
  if (denied) return denied
  return methodNotAllowed(ALLOW)
}

export const GET = notAllowed
export const PUT = notAllowed
export const PATCH = notAllowed
export const DELETE = notAllowed
