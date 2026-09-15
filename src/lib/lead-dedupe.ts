// ══ One definition of "the same lead" (Phase 8c) ═══════════════════════════
//
// This was written in Phase 6 and lived inside `api/scrape/route.ts`, where it
// was the only caller. Phase 8c added a second acquisition path — CSV import —
// and a second path must not bring a second opinion about what a duplicate is.
// A spreadsheet of Durban panelbeaters overlaps the scrape that found them; if
// the two disagree by so much as a leading zero, the board grows twin cards and
// the owner calls the same number twice.
//
// MOVED, NOT REWRITTEN. Every rule below is Phase 6's, byte for byte; the only
// change is the file it sits in and the tests that now cover it.
//
// Server-side only in practice, because deduping needs the rows already on the
// board — but this module imports nothing, touches no env and holds no token,
// so it is safe in either bundle (§9: zero frontend token lines).

/** The shape the key needs, from a scraped place, a CSV row or a stored lead. */
export type LeadIdentity = {
  phone?: unknown
  name?: unknown
  business?: unknown
  address?: unknown
}

/**
 * Phone → digits only, keeping the last 9 significant digits, so the same SA
 * number written `+27 31 764 1122`, `031 764 1122` and `31 764 1122` collapses
 * to one key. Empty when the value has no digits at all.
 *
 * Nine is not arbitrary: an SA national number is 9 digits after the trunk 0,
 * so the last 9 is exactly the part that identifies the line.
 */
export function normPhone(v: unknown): string {
  const digits = String(v || "").replace(/\D/g, "")
  return digits.length > 9 ? digits.slice(-9) : digits
}

/** Loose text key for the no-phone fallback identity. */
export function normText(v: unknown): string {
  return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/**
 * A lead's dedupe key: normalized phone FIRST; with no phone, fall back to
 * (name || business) + address. Returns "" for a lead with no usable identity,
 * and a caller must treat "" as "cannot tell" — never as a match.
 */
export function dedupeKey(lead: LeadIdentity): string {
  const phone = normPhone(lead.phone)
  if (phone) return "p:" + phone
  const id = normText(lead.name || lead.business) + "|" + normText(lead.address)
  return id === "|" ? "" : "n:" + id
}

/**
 * The keys already on the board. Built once per import or scrape and then
 * added to as the batch is walked, so a batch also dedupes against itself.
 */
export function dedupeSet(existing: readonly LeadIdentity[]): Set<string> {
  const seen = new Set<string>()
  for (const lead of existing) {
    const key = dedupeKey(lead)
    if (key) seen.add(key)
  }
  return seen
}
