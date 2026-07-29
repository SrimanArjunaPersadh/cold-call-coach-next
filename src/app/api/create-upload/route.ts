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

// Creates the call row, then hands the browser a signed direct-PUT URL for the
// private recordings bucket. The service-role key stays here; the browser only
// ever sees a short-lived signed URL (§9).

export async function POST(req: Request) {
  const denied = requireSecret(req)
  if (denied) return denied

  try {
    const payload = await readJson(req)

    const bucket = getBucket()
    const userId = getUserId()
    const durationSeconds = Number.isFinite(Number(payload.duration_seconds))
      ? Number(payload.duration_seconds)
      : null
    const offerContext =
      typeof payload.offer_context === "string" ? payload.offer_context : ""
    // Optional CRM link — the lead the rep pressed "Call" on. Absent/blank → null.
    const leadId =
      typeof payload.lead_id === "string" && payload.lead_id
        ? payload.lead_id
        : null

    const inserted = await supabaseFetch<{ id: string; audio_path: string }[]>(
      "/rest/v1/calls?select=id,audio_path",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          user_id: userId,
          audio_path: `pending/${userId}`,
          duration_seconds: durationSeconds,
          offer_context: offerContext,
          lead_id: leadId,
          stt_provider: "deepgram",
          status: "recorded",
        }),
      },
    )

    const callId = inserted[0].id
    const storagePath = `${userId}/${callId}.webm`

    // Clamped like every other query (§9), though this id came from the insert
    // above rather than from the client — so the checklist greps clean and the
    // rule holds without an exception anyone has to remember.
    await supabaseFetch(
      `/rest/v1/calls?id=eq.${callId}` +
        `&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({ audio_path: storagePath }),
      },
    )

    const encodedPath = encodeStoragePath(storagePath)
    const signed = await supabaseFetch<{
      url?: string
      signedURL?: string
      signedUrl?: string
      token?: string
    }>(`/storage/v1/object/upload/sign/${bucket}/${encodedPath}`, {
      method: "POST",
    })

    // Supabase returns a path relative to /storage/v1 (e.g. "/object/upload/sign/...").
    // Turn it into an absolute URL so the browser PUTs to Supabase, not back to us.
    const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "")
    const signedPath = signed.url || signed.signedURL || signed.signedUrl
    if (!signedPath) throw new Error("Supabase did not return a signed upload URL")
    const signedUploadUrl = signedPath.startsWith("http")
      ? signedPath
      : `${supabaseUrl}/storage/v1${signedPath}`

    return json(200, {
      call_id: callId,
      storage_path: storagePath,
      signed_upload_url: signedUploadUrl,
      token: signed.token,
    })
  } catch (err) {
    return json(500, { error: errorMessage(err) || "Could not create upload" })
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
