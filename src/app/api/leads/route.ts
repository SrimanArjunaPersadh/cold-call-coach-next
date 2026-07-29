import { requireSecret } from "@/lib/api/auth"
import {
  errorMessage,
  getQuery,
  json,
  methodNotAllowed,
  readJson,
} from "@/lib/api/http"
import { getUserId, requireEnv, supabaseFetch } from "@/lib/api/supabase"

// Node runtime, not Edge — deliberate, carried over from the old app (§2).
export const runtime = "nodejs"

const ALLOW = "GET, POST, PATCH, DELETE"

// Kanban columns = pipeline stages. The five call outcomes plus a "new" intake
// lane. Dragging a card between columns just PATCHes `stage`. How the board
// lays these out is a client decision this route knows nothing about; every one
// of them is an ordinary stage value here.
const STAGES = [
  "new",
  "no_answer",
  "callback",
  "interested",
  "booked",
  "not_interested",
]

// Whitelist of lead columns the client may write. Everything else (id,
// user_id, created_at, position, call_id) is server-controlled.
//
// `email` is deliberately absent (§10: "no email fields"). The old app
// whitelisted it to serve the CSV import mapper, which is CUT (§3); nothing
// writes an email now, and this route will not accept one if something tries.
// The column still exists in Supabase — no schema change (§2) — it just stays
// null. Re-adding the field is a POPIA decision, not a code cleanup.
const LEAD_FIELDS = [
  "name",
  "business",
  "phone",
  "website",
  "industry",
  "notes",
  "stage",
  "address",
  "maps_rating",
  "maps_url",
]

type LeadRow = Record<string, unknown>

// Keep only whitelisted fields, coerce to string|null, drop invalid stages.
function pickFields(payload: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const key of LEAD_FIELDS) {
    if (payload[key] === undefined) continue
    if (payload[key] === null || payload[key] === "") {
      out[key] = null
    } else {
      out[key] = String(payload[key])
    }
  }
  if (out.stage !== undefined && !STAGES.includes(out.stage as string)) {
    delete out.stage
  }
  return out
}

export async function GET(req: Request) {
  const denied = requireSecret(req)
  if (denied) return denied

  const userId = getUserId()

  try {
    // Fail fast with a clear message if Supabase env is missing.
    requireEnv("SUPABASE_URL")

    const rows = await supabaseFetch<LeadRow[]>(
      `/rest/v1/leads?user_id=eq.${encodeURIComponent(userId)}` +
        `&order=stage.asc,position.asc,created_at.asc`,
    )
    return json(200, { leads: rows || [] })
  } catch (err) {
    return json(500, { error: errorMessage(err) || "Leads request failed" })
  }
}

export async function POST(req: Request) {
  const denied = requireSecret(req)
  if (denied) return denied

  const userId = getUserId()

  try {
    requireEnv("SUPABASE_URL")

    const payload = await readJson(req)

    // Bulk insert: { leads: [...] } → one array insert. Rows are normalised
    // to identical columns so PostgREST accepts the heterogeneous batch. (The
    // CSV import UI that used to feed this is CUT per §3; the scraper's own
    // insert lives in api/scrape. This branch is translated as-is.)
    const batch = payload.leads
    if (Array.isArray(batch)) {
      if (batch.length > 500) {
        return json(400, { error: "Import is capped at 500 leads at a time" })
      }
      const now = Date.now()
      const rows: Record<string, unknown>[] = []
      let skipped = 0
      batch.forEach((raw: unknown, i: number) => {
        const f = pickFields((raw || {}) as Record<string, unknown>)
        const business = f.business
        const phone = f.phone
        if (!business || !business.trim() || !phone || !phone.trim()) {
          skipped++
          return
        }
        const row: Record<string, unknown> = { user_id: userId, position: now + i }
        for (const key of LEAD_FIELDS) row[key] = f[key] !== undefined ? f[key] : null
        if (!row.stage) row.stage = "new"
        rows.push(row)
      })
      if (!rows.length) {
        return json(400, {
          error: "No valid leads to import (each row needs a name)",
        })
      }
      const inserted = await supabaseFetch<LeadRow[]>("/rest/v1/leads?select=*", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify(rows),
      })
      return json(200, {
        leads: inserted || [],
        imported: (inserted || []).length,
        skipped,
      })
    }

    const fields = pickFields(payload)
    const business = fields.business
    const phone = fields.phone
    if (!business || !business.trim() || !phone || !phone.trim()) {
      return json(400, { error: "Business and phone are required" })
    }
    if (!fields.stage) fields.stage = "new"

    const inserted = await supabaseFetch<LeadRow[]>("/rest/v1/leads?select=*", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        ...fields,
        user_id: userId,
        position: Date.now(), // large gaps → midpoint reordering never collides
      }),
    })
    return json(200, { lead: inserted[0] })
  } catch (err) {
    return json(500, { error: errorMessage(err) || "Leads request failed" })
  }
}

export async function PATCH(req: Request) {
  const denied = requireSecret(req)
  if (denied) return denied

  const userId = getUserId()

  try {
    requireEnv("SUPABASE_URL")

    const id = getQuery(req, "id")
    if (!id) return json(400, { error: "Missing lead id" })

    const payload = await readJson(req)
    const fields: Record<string, string | number | null> = pickFields(payload)
    if (
      payload.position !== undefined &&
      Number.isFinite(Number(payload.position))
    ) {
      fields.position = Number(payload.position)
    }
    if (!Object.keys(fields).length) {
      return json(400, { error: "Nothing to update" })
    }
    fields.updated_at = new Date().toISOString()

    const updated = await supabaseFetch<LeadRow[]>(
      `/rest/v1/leads?id=eq.${encodeURIComponent(id)}` +
        `&user_id=eq.${encodeURIComponent(userId)}&select=*`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify(fields),
      },
    )
    if (!updated || !updated.length) {
      return json(404, { error: "Lead not found" })
    }
    return json(200, { lead: updated[0] })
  } catch (err) {
    return json(500, { error: errorMessage(err) || "Leads request failed" })
  }
}

export async function DELETE(req: Request) {
  const denied = requireSecret(req)
  if (denied) return denied

  const userId = getUserId()

  try {
    requireEnv("SUPABASE_URL")

    const id = getQuery(req, "id")
    if (!id) return json(400, { error: "Missing lead id" })
    await supabaseFetch(
      `/rest/v1/leads?id=eq.${encodeURIComponent(id)}` +
        `&user_id=eq.${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: { prefer: "return=minimal" } },
    )
    return json(200, { ok: true })
  } catch (err) {
    return json(500, { error: errorMessage(err) || "Leads request failed" })
  }
}

// The old handler's `405 + Allow` tail, after requireSecret.
async function notAllowed(req: Request) {
  const denied = requireSecret(req)
  if (denied) return denied
  return methodNotAllowed(ALLOW)
}

export const PUT = notAllowed
