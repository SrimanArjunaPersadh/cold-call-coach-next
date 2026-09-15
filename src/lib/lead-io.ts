// ══ Leads in and leads out (Phase 8c) ══════════════════════════════════════
//
// The client-side decisions of import and export, as pure functions — the same
// shape `lib/scrape.ts` gave the scraper in Phase 6, and for the same reason:
// the copy contract and the mapping rules become tests instead of comments.
//
// §0's ruling 2 CUT CSV import for this migration, and §12 logged the trigger
// to revisit: "if a real lead list ever arrives from outside Google Maps". It
// did, and the owner reversed the ruling on 2026-09-15 — the one-line
// instruction §0 says either default can be reversed with. See §3's amendment.
//
// WHAT CAME BACK AND WHAT DID NOT. §3 struck "CSV import (incl. garbage-file
// guard, auto-mapper, mapping UI)" as "disproportionately complex". The
// auto-mapper and the mapping UI are back, because a spreadsheet that arrives
// from outside has whatever headers its author felt like, and the alternative
// is editing it in Excel before every import. The garbage-file guard is NOT:
// there is no heuristic here deciding a file is not really a lead list. The
// preview shows what will land, and a preview that reads wrong IS the guard —
// it needs no threshold to argue with.
//
// NO EMAIL. Not a column, not a synonym, not a mapping target (§10, and
// `LEAD_FIELDS` in the route omits it deliberately). A spreadsheet full of
// addresses imports cleanly with the email column simply ignored, and that is
// the intended behaviour rather than an oversight — re-adding the field is a
// POPIA decision, not a code cleanup.

import { STAGES, type Lead, type StageKey } from "./board"
import {
  parseDelimited,
  readField,
  toDelimited,
  type ParsedTable,
} from "./delimited"

/**
 * The lead columns this feature reads and writes. A subset of the route's
 * `LEAD_FIELDS`, minus the ones the server owns (`position`) and email.
 */
export type ImportField =
  | "business"
  | "name"
  | "phone"
  | "website"
  | "industry"
  | "notes"
  | "address"
  | "stage"
  | "maps_rating"
  | "maps_url"

/** field → the column index it reads from. Absent = not imported. */
export type Mapping = Partial<Record<ImportField, number>>

/** A row on its way to `POST /api/leads`. Strings only; the route coerces. */
export type LeadDraft = Record<string, string>

/**
 * The server's own bulk cap (`route.ts`: "Import is capped at 500 leads at a
 * time"). Repeated here so the client can CHUNK rather than collide with it —
 * a 1,240-row list imports as three requests, not one rejection.
 */
export const IMPORT_LIMIT = 500

/**
 * The mapping targets, in priority order, with the headers that auto-match them.
 *
 * ORDER IS LOAD-BEARING. `business` is resolved before `name`, so a sheet with
 * both `Business Name` and `Contact` puts the right string in the right column;
 * flip them and every card headlines the company twice.
 *
 * Synonyms are matched against a NORMALISED header (lowercased, punctuation to
 * single spaces), so `Phone #`, `phone_number` and `PHONE NUMBER` are one entry
 * here rather than three. They are a starting guess, never a verdict: every
 * field is re-pointable in the modal's dropdowns, which is what makes a wrong
 * guess a two-second fix instead of a corrupted board.
 */
export const IMPORT_FIELDS: readonly {
  key: ImportField
  label: string
  /** Exactly the two fields `POST /api/leads` rejects a row for missing. */
  required?: boolean
  synonyms: readonly string[]
}[] = [
  {
    key: "business",
    label: "Business",
    required: true,
    synonyms: [
      "business",
      "business name",
      "company",
      "company name",
      "organisation",
      "organization",
      "trading name",
      "firm",
      "account",
      "account name",
      "place",
      "place name",
      "title",
      "venue",
    ],
  },
  {
    key: "phone",
    label: "Phone",
    required: true,
    synonyms: [
      "phone",
      "phone number",
      "phone no",
      "telephone",
      "telephone number",
      "tel",
      "mobile",
      "mobile number",
      "cell",
      "cellphone",
      "cell number",
      "contact number",
      "number",
      "whatsapp",
    ],
  },
  {
    key: "name",
    label: "Contact name",
    synonyms: [
      "name",
      "contact",
      "contact name",
      "contact person",
      "person",
      "owner",
      "owner name",
      "full name",
      "first name",
      "decision maker",
    ],
  },
  {
    key: "website",
    label: "Website",
    synonyms: ["website", "web site", "web", "url", "site", "domain", "homepage"],
  },
  {
    key: "address",
    label: "Address",
    synonyms: [
      "address",
      "street address",
      "physical address",
      "street",
      "location",
      "suburb",
      "area",
      "city",
      "town",
    ],
  },
  {
    key: "industry",
    label: "Industry",
    synonyms: [
      "industry",
      "category",
      "sector",
      "type",
      "business type",
      "niche",
      "vertical",
    ],
  },
  {
    key: "notes",
    label: "Notes",
    synonyms: [
      "notes",
      "note",
      "comment",
      "comments",
      "description",
      "remarks",
      "memo",
      "detail",
      "details",
    ],
  },
  {
    key: "stage",
    label: "Stage",
    synonyms: [
      "stage",
      "status",
      "lead status",
      "pipeline",
      "pipeline stage",
      "state",
      "column",
    ],
  },
  {
    key: "maps_rating",
    label: "Rating",
    synonyms: ["maps rating", "google rating", "rating", "stars", "star rating"],
  },
  {
    key: "maps_url",
    label: "Maps link",
    synonyms: [
      "maps url",
      "maps link",
      "google maps",
      "google maps url",
      "map link",
    ],
  },
]

/** The fields a mapping dropdown offers, in display order. */
export const MAPPABLE: readonly {
  key: ImportField
  label: string
  required: boolean
}[] = IMPORT_FIELDS.map((f) => ({
  key: f.key,
  label: f.label,
  required: !!f.required,
}))

/** Header text → the form the synonym lists are written in. */
export function normHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/**
 * Headers → a first guess at the mapping.
 *
 * Two passes, then one fixup:
 *   1. exact match on the normalised header;
 *   2. the same with spaces removed, so `PhoneNumber` matches `phone number`;
 *   3. THE FIXUP — if nothing mapped to `business` but something mapped to
 *      `name`, `business` takes that column and `name` is left unmapped.
 *
 * The fixup earns its keep on the commonest file in the world: one column
 * called `Name` and one called `Phone`. `business` is required by the route, so
 * without it every row of that file is skipped and the import reports zero —
 * technically correct and completely useless. A lead whose business and contact
 * are the same string is also exactly what the scraper writes (`name ===
 * business`), so the board already renders that shape correctly.
 */
export function autoMap(headers: readonly string[]): Mapping {
  const normalised = headers.map(normHeader)
  const squashed = normalised.map((h) => h.replace(/ /g, ""))
  const mapping: Mapping = {}
  const used = new Set<number>()

  for (const field of IMPORT_FIELDS) {
    if (mapping[field.key] !== undefined) continue
    for (const synonym of field.synonyms) {
      const exact = normalised.indexOf(synonym)
      if (exact !== -1 && !used.has(exact)) {
        mapping[field.key] = exact
        used.add(exact)
        break
      }
      const loose = squashed.indexOf(synonym.replace(/ /g, ""))
      if (loose !== -1 && !used.has(loose)) {
        mapping[field.key] = loose
        used.add(loose)
        break
      }
    }
  }

  if (mapping.business === undefined && mapping.name !== undefined) {
    mapping.business = mapping.name
    delete mapping.name
  }

  return mapping
}

// ── Stage ───────────────────────────────────────────────────────────────────

/**
 * Every spelling of a stage a human column might carry, → the stage key.
 *
 * Built from §7's own keys and labels FIRST, so the six stages can never drift
 * from the board, then extended with the words other CRMs use for the same
 * states — the owner's spreadsheet may well be a GoHighLevel or Pipedrive
 * export, and `Lost` there is `not_interested` here.
 */
const STAGE_ALIASES: Record<string, StageKey> = (() => {
  const map: Record<string, StageKey> = {}
  for (const stage of STAGES) {
    map[normHeader(stage.key)] = stage.key
    map[normHeader(stage.label)] = stage.key
  }
  const extra: [string, StageKey][] = [
    ["lead", "new"],
    ["new lead", "new"],
    ["open", "new"],
    ["untouched", "new"],
    ["no answer", "no_answer"],
    ["voicemail", "no_answer"],
    ["vm", "no_answer"],
    ["missed", "no_answer"],
    ["left message", "no_answer"],
    ["call back", "callback"],
    ["callback requested", "callback"],
    ["call back requested", "callback"],
    ["follow up", "callback"],
    ["warm", "interested"],
    ["qualified", "interested"],
    ["meeting", "booked"],
    ["meeting booked", "booked"],
    ["appointment", "booked"],
    ["won", "booked"],
    ["lost", "not_interested"],
    ["dead", "not_interested"],
    ["no", "not_interested"],
    ["disqualified", "not_interested"],
    ["unqualified", "not_interested"],
  ]
  for (const [alias, key] of extra) map[normHeader(alias)] = key
  return map
})()

/**
 * A stage cell → a real stage key, or null when the word means nothing here.
 *
 * Null is NOT an error. The route already drops an unrecognised stage and lets
 * the row default to `new` (`pickFields`), and that is the right outcome: a
 * lead in the wrong column is a one-second drag, while refusing an import over
 * one unrecognised word is an afternoon in Excel. The number of rows this
 * happened to is reported, so it is never silent.
 */
export function normaliseStage(value: string): StageKey | null {
  return STAGE_ALIASES[normHeader(value)] ?? null
}

// ── Rows → drafts ───────────────────────────────────────────────────────────

export type DraftResult = {
  /** Rows that will be sent. Order preserved — the file's order is the board's. */
  drafts: LeadDraft[]
  /** Rows dropped for missing business or phone, which the route requires. */
  skipped: number
  /** Rows whose stage word was not recognised and will land in New. */
  stageFallbacks: number
}

/**
 * The parsed table plus a mapping → the rows to POST.
 *
 * Three rules worth knowing:
 *   · every value is trimmed, and `readField` takes off the `'` an export adds
 *     in front of a formula-leading value, so a round trip is lossless;
 *   · an empty `business` falls back to the row's contact `name` — the same
 *     substitution `autoMap`'s fixup makes for a whole file, made per row for a
 *     file that is merely patchy;
 *   · `maps_rating` is only sent when it parses as a finite number, so a rating
 *     column full of "N/A" contributes nothing rather than poisoning the card.
 */
export function draftRows(table: ParsedTable, mapping: Mapping): DraftResult {
  const drafts: LeadDraft[] = []
  let skipped = 0
  let stageFallbacks = 0

  for (const row of table.rows) {
    const read = (field: ImportField): string => {
      const index = mapping[field]
      if (index === undefined) return ""
      return readField(row[index] ?? "").trim()
    }

    const business = read("business") || read("name")
    const phone = read("phone")
    if (!business || !phone) {
      skipped++
      continue
    }

    const draft: LeadDraft = { business, phone }

    const name = read("name")
    if (name) draft.name = name
    for (const field of [
      "website",
      "industry",
      "notes",
      "address",
      "maps_url",
    ] as const) {
      const value = read(field)
      if (value) draft[field] = value
    }

    const rating = read("maps_rating")
    if (rating && Number.isFinite(Number(rating))) draft.maps_rating = rating

    const rawStage = read("stage")
    if (rawStage) {
      const stage = normaliseStage(rawStage)
      if (stage) draft.stage = stage
      else stageFallbacks++
    }

    drafts.push(draft)
  }

  return { drafts, skipped, stageFallbacks }
}

/** Drafts → the batches `POST /api/leads` will accept, in file order. */
export function chunk<T>(items: readonly T[], size = IMPORT_LIMIT): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ── The file itself ─────────────────────────────────────────────────────────

/**
 * What the modal says when handed a workbook rather than a text file.
 *
 * Ruled 2026-09-15, with §3's Google Places rejection as the precedent: reading
 * `.xlsx` means either a ~400KB dependency or a hand-rolled ZIP inflate, for a
 * conversion the owner can do in three clicks in the app that produced the file.
 * The message names those clicks, so a wrong file is a redirect and never a
 * dead end (§4.4 — an error state says what to do next).
 */
export const WORKBOOK_HELP =
  "That is an Excel workbook, which this cannot read. In Excel: File → Save As → CSV UTF-8, then choose the .csv file here."

/** The generic unreadable-file message. */
export const NOT_A_TABLE =
  "No columns found in that file. It needs a header row — one line naming the columns — above the leads."

/**
 * Is this a spreadsheet binary rather than delimited text?
 *
 * Checked on the CONTENT as well as the extension: `PK` is the ZIP magic every
 * `.xlsx` starts with, and `ÐÏ` the OLE compound-document magic of a legacy
 * `.xls`. A workbook renamed to `.csv` is still a workbook, and an extension
 * check alone would let it reach the parser, which would find one column of
 * mojibake and say something unhelpful about headers.
 */
export function isWorkbook(fileName: string, head: string): boolean {
  if (/\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/i.test(fileName.trim())) return true
  return (
    head.startsWith("PK") ||
    head.startsWith("ÐÏà")
  )
}

/**
 * File text → a table, with the delimiter detected. Thin, but it is the seam
 * the modal is tested against.
 */
export function readTable(text: string): ParsedTable {
  return parseDelimited(text)
}

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * The export's columns, in order.
 *
 * These ARE the importer's own field keys, which makes the round trip free:
 * export a board, edit it in Excel, import it back, and `autoMap` matches every
 * column exactly, because it is reading headers this file wrote. Nothing
 * derived and nothing computed — §6's rule reaches here too, so there is no
 * "days since called" column, which would be arithmetic wearing a header.
 *
 * `id` is deliberately absent. An export is a lead LIST, not a backup: a file
 * carrying ids invites a re-import to mean "update these rows", which is a sync
 * feature nobody asked for and which the route could not honour anyway.
 */
export const EXPORT_COLUMNS: readonly ImportField[] = [
  "business",
  "name",
  "phone",
  "website",
  "industry",
  "address",
  "stage",
  "maps_rating",
  "maps_url",
  "notes",
]

/** One lead → its row, in `EXPORT_COLUMNS` order. Null and undefined → "". */
export function leadRow(lead: Lead): string[] {
  return EXPORT_COLUMNS.map((column) => {
    const value = (lead as Record<string, unknown>)[column]
    return value === null || value === undefined ? "" : String(value)
  })
}

/**
 * Leads → CSV text, header row included.
 *
 * Comma-delimited regardless of what the last IMPORT used: the file is written
 * for Excel and for this app's own importer, and both read commas. A semicolon
 * export would only ever be a guess about the reader's locale.
 */
export function toLeadCsv(leads: readonly Lead[]): string {
  return toDelimited([[...EXPORT_COLUMNS], ...leads.map(leadRow)])
}

/**
 * `leads-2026-09-15.csv`, from the LOCAL date.
 *
 * Local rather than ISO-UTC for the reason §11 records against the weekly
 * count: in SAST an export at 01:00 on the 4th would be stamped the 3rd, and
 * the owner would go looking for a file named after the wrong day.
 * `toISOString().slice(0, 10)` is the bug here, not the shortcut.
 */
export function exportFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `leads-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`
}

// ── The outcome copy ────────────────────────────────────────────────────────

/** The counts an import run accumulates across its chunks. */
export type ImportTally = {
  /** Rows the server actually inserted. */
  imported: number
  /** Rows already on the board, by the phone-first dedupe rule. */
  duplicates: number
  /** Rows the file could not supply a business or a phone for. */
  skipped: number
  /** Rows whose stage word was unrecognised; they landed in New. */
  stageFallbacks: number
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * The outcome toast — the same ruling `scrapeOutcome` carries, for the same
 * reason, because this is the second way leads arrive and it must not report
 * success differently from the first.
 *
 * **A run that added nothing is not a success.** A file of 200 leads you already
 * have is a perfectly correct import that changes nothing, and dressing that in
 * the same green as 200 new ones teaches the owner to stop reading toasts. So:
 * `--warn` at `imported === 0`, `--pass` above it (§4.1).
 *
 * Every number here is the SERVER's, counted server-side and only added up
 * across chunks — the one piece of arithmetic §6 leaves to the client, because
 * it is a sum of counts the client was handed rather than a figure it derived.
 */
export function importOutcome(tally: ImportTally): {
  text: string
  tone: "ok" | "warn"
} {
  const parts = [`${plural(tally.imported, "lead")} added`]
  if (tally.duplicates) {
    parts.push(`${plural(tally.duplicates, "duplicate")} skipped`)
  }
  if (tally.skipped) parts.push(`${plural(tally.skipped, "row")} incomplete`)
  if (tally.stageFallbacks) parts.push(`${tally.stageFallbacks} into New`)
  return { text: parts.join(", "), tone: tally.imported === 0 ? "warn" : "ok" }
}

/** What `POST /api/leads` answers a bulk insert with. Counts only. */
export type ImportResponse = {
  leads?: Lead[] | null
  imported?: number
  skipped?: number
  duplicates?: number
}
