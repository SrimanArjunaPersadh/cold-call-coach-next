// ══ Delimited text — the format layer, and nothing about leads (Phase 8c) ═══
//
// A hand-written RFC 4180 reader and writer. No dependency, and that is a
// decision rather than an accident: PapaParse is 45KB to do what 120 lines do,
// and the app's only other data-acquisition path (the scraper) already proved
// that a small tested module beats a library whose edge cases you inherit
// without reading. The parser is pure and string-in/string-out, so every rule
// below is a unit test rather than a comment.
//
// WHAT THIS DELIBERATELY DOES NOT DO: Excel workbooks. `.xlsx` is a ZIP of XML
// and reading it means either a ~400KB dependency or a hand-rolled inflate —
// both disproportionate for a solo tool whose owner can press File → Save As.
// `ImportModal` detects the signature and says exactly that. Ruled 2026-09-15.

/** The three separators a spreadsheet export actually uses in the wild. */
export type Delimiter = "," | ";" | "\t"

export type ParsedTable = {
  /** Row one, trimmed. Empty strings are kept — a blank header is a real column. */
  headers: string[]
  /** Every row after the first, padded to `headers.length`. */
  rows: string[][]
  delimiter: Delimiter
}

const DELIMITERS: readonly Delimiter[] = [",", ";", "\t"]

/**
 * Excel writes a UTF-8 BOM and reads one back as a hint. It is a byte-order
 * mark, not data, and a header called `\uFEFFbusiness` matches nothing.
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Which separator this file uses, decided on the header line only.
 *
 * Counted OUTSIDE quotes, which is the whole reason this is not `split(",")`:
 * `"Panelbeaters, Kloof";031 764 1122` is a semicolon file with a comma in it,
 * and counting naively picks comma and shreds every row. Ties go to comma —
 * a file with neither semicolons nor tabs is a CSV by default, not by evidence.
 */
export function detectDelimiter(text: string): Delimiter {
  const line = firstLine(stripBom(text))
  let best: Delimiter = ","
  let bestCount = 0
  for (const d of DELIMITERS) {
    const count = countOutsideQuotes(line, d)
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

/** The first physical line, quotes ignored — the header cannot span lines. */
function firstLine(text: string): string {
  const end = text.search(/\r\n|\n|\r/)
  return end === -1 ? text : text.slice(0, end)
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // A doubled quote inside a quoted field is an escaped quote, not a close.
      if (quoted && line[i + 1] === '"') i++
      else quoted = !quoted
    } else if (ch === delimiter && !quoted) count++
  }
  return count
}

/**
 * Text → a table. `delimiter` is detected when not given.
 *
 * The rules, each one a test in `delimited.test.ts`:
 *   · `"` opens a quoted field; `""` inside it is one literal quote.
 *   · a delimiter or a newline inside quotes is data, not structure.
 *   · CRLF, LF and lone CR all end a row — a Mac-classic export is still a file.
 *   · a completely empty row is dropped, so a trailing newline costs nothing
 *     and neither does the blank line Excel leaves between blocks.
 *   · a short row is padded and a long one is kept whole: the mapper indexes by
 *     column, and dropping the overflow would silently lose a field the owner
 *     can still point at in the dropdown.
 */
export function parseDelimited(text: string, delimiter?: Delimiter): ParsedTable {
  const source = stripBom(text)
  const sep = delimiter ?? detectDelimiter(source)

  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  const endField = () => {
    row.push(field)
    field = ""
  }
  const endRow = () => {
    endField()
    // "Empty" means every cell is blank — not merely one empty cell.
    if (row.some((cell) => cell !== "")) rows.push(row)
    row = []
  }

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]

    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === sep) {
      endField()
    } else if (ch === "\r") {
      // Swallow the LF of a CRLF so the pair ends one row, not two.
      if (source[i + 1] === "\n") i++
      endRow()
    } else if (ch === "\n") {
      endRow()
    } else {
      field += ch
    }
  }
  // Whatever is still in hand when the text runs out is the last row — a file
  // with no trailing newline is the common case, not the exception.
  if (field !== "" || row.length) endRow()

  const headerRow = rows.shift() ?? []
  const headers = headerRow.map((h) => h.trim())
  const width = headers.length
  const padded = rows.map((r) =>
    r.length >= width ? r : [...r, ...Array(width - r.length).fill("")],
  )

  return { headers, rows: padded, delimiter: sep }
}

/**
 * A field Excel would treat as a formula rather than text.
 *
 * The values here come from Google Maps via Apify — a third party — and land in
 * a file the owner opens in a spreadsheet. `=`, `+`, `-` and `@` in the first
 * position are the four characters that start a formula there.
 */
function isFormula(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value)
}

/**
 * Whether this value needs the `'` guard — a formula, OR an already-guarded
 * value, recursively.
 *
 * The recursion is the fix for a real (if rare) round-trip bug: a business
 * literally named `'=Kloof` is not a formula, so it would go out unguarded and
 * come back as `=Kloof`, because `readField` cannot tell a `'` the exporter
 * added from one the data always had. Guarding it makes the two cases different
 * bytes on disk, which is what makes them different values on the way back.
 */
function needsGuard(value: string): boolean {
  if (isFormula(value)) return true
  return value.startsWith("'") && needsGuard(value.slice(1))
}

/**
 * One cell, ready to write. Quoted when it has to be; a formula-leading value
 * additionally gets a `'` in front of it.
 *
 * WHY THE `'` AND NOT A REFUSAL: it is what a spreadsheet itself writes to mean
 * "this is text", every reader understands it, and `parseField` below takes it
 * back off — so `export → open in Excel → save → import` round-trips to the
 * same bytes it started with. Stripping or rejecting the value would not.
 */
export function writeField(value: string, delimiter: Delimiter = ","): string {
  const escaped = needsGuard(value) ? `'${value}` : value
  const mustQuote =
    escaped.includes(delimiter) ||
    escaped.includes('"') ||
    escaped.includes("\n") ||
    escaped.includes("\r") ||
    escaped !== escaped.trim()
  if (!mustQuote) return escaped
  return `"${escaped.replace(/"/g, '""')}"`
}

/** `writeField`'s inverse: the `'` an export added in front of a formula. */
export function readField(value: string): string {
  return value.startsWith("'") && needsGuard(value.slice(1))
    ? value.slice(1)
    : value
}

/**
 * Rows → CSV text. CRLF line endings, because that is what RFC 4180 says and
 * what Excel expects; every other reader accepts them.
 *
 * No BOM here — that is the caller's call, since a BOM belongs on a FILE and
 * this function returns a string. `lead-io.ts` adds it on the way to the disk.
 */
export function toDelimited(
  rows: readonly (readonly string[])[],
  delimiter: Delimiter = ",",
): string {
  return rows
    .map((row) => row.map((cell) => writeField(cell, delimiter)).join(delimiter))
    .join("\r\n")
}
