// Display formatters. Pure, so the decisions with a right answer are testable
// without a DOM (§ Phase 3 test rule).
//
// `fmtTime` and `fmtSize` are the old app's verbatim — same flooring, same
// thresholds, same rounding — because they format numbers that appear in copy
// the plan quotes ("0:19 of 0:33 in turns").

/** Seconds → `m:ss`. Used for durations, monologue lengths and turn timestamps. */
export function fmtTime(seconds: number): string {
  const sec = Number(seconds) || 0
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`
}

/** Bytes → `KB` under a megabyte, `MB` with one decimal above it. */
export function fmtSize(bytes: number): string {
  const b = Number(bytes) || 0
  return b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * ISO timestamp → `29 Jul 2026 · 14:03`, in the reader's own timezone.
 *
 * Hand-rolled rather than `toLocaleString` so the string does not change with
 * the runtime's locale data. It IS timezone-dependent, so if Phase 5 ever
 * renders a stored call on the server, that call header has to be client-side.
 * In Phase 3 the scorecard only ever exists after a fetch in the browser.
 */
export function fmtCallDate(iso: string | null | undefined): string {
  if (!iso) return "Date unknown"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "Date unknown"
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`
}
