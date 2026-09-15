import { requireSecret } from "@/lib/api/auth"
import {
  errorMessage,
  getQuery,
  json,
  methodNotAllowed,
  readJson,
} from "@/lib/api/http"
import { getUserId, requireEnv, supabaseFetch } from "@/lib/api/supabase"
import { dedupeKey, dedupeSet, type LeadIdentity } from "@/lib/lead-dedupe"

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
// whitelisted it to serve the CSV import mapper. CSV import came BACK in Phase
// 8c (§0's ruling 2, reversed by the owner 2026-09-15) and this line did not
// move: `lib/lead-io.ts` has no email field, no email synonym and no email
// export column, so a spreadsheet full of addresses imports cleanly with that
// column ignored. Nothing writes an email, and this route will not accept one
// if something tries. The column still exists in Supabase — no schema change
// (§2) — it just stays null. Re-adding the field is a POPIA decision, not a
// code cleanup.
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

    // ── Bulk insert: { leads: [...] } → one array insert ──────────────────
    //
    // This branch shipped in Phase 1 as a translation of the old app's CSV
    // import, and then sat unreachable for seven phases because §3 had CUT the
    // UI that fed it. Phase 8c gave it a caller again (`import-modal.tsx`).
    //
    // ONE BEHAVIOURAL CHANGE, AND IT IS DELIBERATE: it now DEDUPES, by exactly
    // the rule `/api/scrape` has always used. The old app's importer did not,
    // because when it was written the scraper did not exist and every lead
    // arrived by hand. Today the spreadsheet being imported is very likely to
    // overlap last week's scrape of the same suburb, and an importer that does
    // not dedupe produces twin cards and the same number called twice. Two
    // acquisition paths, one definition of "the same lead" (`lib/lead-dedupe`).
    //
    // The two counts are kept APART and reported separately, because they mean
    // different things to the person reading the toast: `skipped` is the file's
    // problem (a row with no business or no phone — go fix the spreadsheet),
    // `duplicates` is not a problem at all (you already have these).
    const batch = payload.leads
    if (Array.isArray(batch)) {
      if (batch.length > 500) {
        return json(400, { error: "Import is capped at 500 leads at a time" })
      }

      // Everything already on the board, by identity. The client chunks a long
      // file into 500s, so this is re-read per chunk — which is what makes a
      // duplicate INSIDE a 1,200-row file get caught across the chunk boundary.
      const existing = await supabaseFetch<LeadIdentity[]>(
        `/rest/v1/leads?user_id=eq.${encodeURIComponent(userId)}` +
          `&select=phone,name,business,address`,
      )
      const seen = dedupeSet(existing || [])

      const now = Date.now()
      const rows: Record<string, unknown>[] = []
      let skipped = 0
      let duplicates = 0
      batch.forEach((raw: unknown, i: number) => {
        const f = pickFields((raw || {}) as Record<string, unknown>)
        const business = f.business
        const phone = f.phone
        if (!business || !business.trim() || !phone || !phone.trim()) {
          skipped++
          return
        }
        const identity = dedupeKey(f)
        if (identity && seen.has(identity)) {
          duplicates++
          return
        }
        if (identity) seen.add(identity) // also dedupe within this same batch
        const row: Record<string, unknown> = { user_id: userId, position: now + i }
        for (const key of LEAD_FIELDS) row[key] = f[key] !== undefined ? f[key] : null
        if (!row.stage) row.stage = "new"
        rows.push(row)
      })

      // Nothing to insert is a 200, not a 400 — CHANGED in Phase 8c and this is
      // the reason. A file whose every row is already on the board is a correct
      // import that changes nothing, and the old 400 turned it into "No valid
      // leads to import (each row needs a name)", which is both wrong and
      // alarming. The client's neutral-amber toast reports it honestly instead.
      // A file with genuinely nothing usable still says so, via `skipped`.
      if (!rows.length) {
        return json(200, { leads: [], imported: 0, skipped, duplicates })
      }

      const inserted = await supabaseFetch<LeadRow[]>("/rest/v1/leads?select=*", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify(rows),
      })
      // Counts only — never any lead data, same as the scrape route's line.
      console.log(
        `leads-import: batch=${batch.length} imported=${(inserted || []).length}` +
          ` duplicates=${duplicates} skipped=${skipped}`,
      )
      return json(200, {
        leads: inserted || [],
        imported: (inserted || []).length,
        skipped,
        duplicates,
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

/**
 * `?id=` deletes one lead. `?ids=a,b,c` deletes up to 500 in one request —
 * added Phase 8c for the board's select mode.
 *
 * WHY A SECOND PARAMETER AND NOT A SIXTH ROUTE. §9's table has exactly five
 * routes and that is a boundary worth keeping: this is the same verb on the
 * same resource with the same `user_id` clamp, so it belongs to the handler
 * that already owns it. It mirrors POST, which has taken `{ leads: [...] }`
 * alongside a single lead since Phase 1.
 *
 * WHY NOT A LOOP IN THE CLIENT: clearing 200 dead leads would be 200 round
 * trips on a phone, each with its own chance to fail, leaving the board in a
 * state no toast can honestly describe. One request either deletes them or
 * does not.
 *
 * The single-id response (`{ ok: true }`) is untouched — `lead-modal.tsx` has
 * read it since Phase 4.
 */
export async function DELETE(req: Request) {
  const denied = requireSecret(req)
  if (denied) return denied

  const userId = getUserId()

  try {
    requireEnv("SUPABASE_URL")

    const bulk = getQuery(req, "ids")
    if (bulk) {
      const ids = bulk.split(",").map((id) => id.trim()).filter(Boolean)
      if (!ids.length) return json(400, { error: "Missing lead ids" })
      if (ids.length > 500) {
        return json(400, { error: "Delete is capped at 500 leads at a time" })
      }
      // Every id goes into a PostgREST `in.(…)` list, so anything that is not
      // plainly an identifier is refused here rather than escaped later. Real
      // ids are uuids; this also admits a bigint, and nothing else. A single
      // bad id fails the whole request instead of being silently dropped — a
      // partial delete the caller did not ask for is the worse outcome.
      if (ids.some((id) => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) {
        return json(400, { error: "Invalid lead id" })
      }

      // `return=representation` + `select=id` so the count is the SERVER's
      // count of rows that actually went — not the client's count of rows it
      // asked about. An id belonging to someone else, or already deleted, is
      // clamped out by `user_id` and simply is not in the answer.
      const deletedRows = await supabaseFetch<{ id: string }[]>(
        `/rest/v1/leads?id=in.(${ids.join(",")})` +
          `&user_id=eq.${encodeURIComponent(userId)}&select=id`,
        {
          method: "DELETE",
          headers: { prefer: "return=representation" },
        },
      )
      const deleted = (deletedRows || []).length
      console.log(`leads-delete: asked=${ids.length} deleted=${deleted}`)
      return json(200, { deleted, ids: (deletedRows || []).map((r) => r.id) })
    }

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
