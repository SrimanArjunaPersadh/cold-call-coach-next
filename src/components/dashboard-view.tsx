"use client"

// ══ The dashboard-for-one (§8) ══════════════════════════════════════════════
//
// Three groups, top to bottom, answering three questions for one person.
// "Nothing else" is part of the spec, so this file is as notable for what is
// absent as for what is here: no average overall score, no week-over-week delta,
// no talk-time tile, no funnel, no per-dimension bar list, no lead-name lists
// inside the hygiene tile. Every one of those exists in the old app's dashboard,
// in the same functions the arithmetic was ported from — §3 CUTs them by name.
//
// THIS COMPONENT DOES NO ARITHMETIC (§6). Not a division, not a percentage, not
// a `.length` — every number below arrives already computed by `buildDashboard`
// in `lib/dashboard.ts`, including both progress-bar widths, the trend's SVG
// path and the count in its caption, and `dashboard.test.ts` pins them. The
// component prints. (The only `/` and `%` characters here are the literal slash
// in `4 / 25` and the CSS unit on a bar's width.)
//
// NO NEW ROUTE, AND NO NEW FETCH WRAPPER. `GET /api/calls` with no `lead_id`
// shipped in Phase 1 for exactly this screen; leads come through `leadsCache`,
// which calls `leadsApi` — the only door to the API in this codebase (§9's table
// has five routes and gains none here).
//
// Built failure-paths-first, like Phases 3–6. The two fetches settle
// independently: a failed leads GET must not take the week's call count down
// with it, and a group that cannot be computed says so instead of rendering a
// confident zero.

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Container } from "@/components/app-shell"
import { ScoreBadge } from "@/components/score-badge"
import { SecretModal } from "@/components/secret-modal"
import { Button } from "@/components/ui/button"
import {
  buildDashboard,
  SCORED_GATE,
  TREND_GEOMETRY,
  trendPath,
  trendY,
  type Dashboard,
  type DashboardCall,
  type DashboardLead,
  type ScoredCall,
  type WeakestDimension,
} from "@/lib/dashboard"
import { fmtCallDate, fmtTime } from "@/lib/format"
import { errorText, leadsApi } from "@/lib/leads-api"
import { leadsCache } from "@/lib/leads-cache"
import { setOpenLead } from "@/lib/open-lead"
import { scoreTone } from "@/lib/score"
import { cn } from "@/lib/utils"

const CARD = "rounded-lg border border-border bg-card"

/** §4.1's semantic fills. A dimension mean is a /5 score, so it takes the same
 *  mapping as every badge — solid, on a `--border` track. Never cyan. */
const TONE_FILL = {
  pass: "bg-pass",
  warn: "bg-warn",
  fail: "bg-fail",
} as const

// ── Chrome ─────────────────────────────────────────────────────────────────

/**
 * One of §8's three questions. The question IS the header — a stranger should
 * know what the group is for before reading a single number (§1 rule 3).
 *
 * No section-number chip beside it, unlike /styleguide. That page is an
 * acceptance test and its readers are checking it against the plan; this is the
 * instrument, and "§8.1" is a thing on screen that does not earn its place.
 */
function Group({
  question,
  children,
}: {
  question: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0">
      <h2 className="text-section">{question}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** A skeleton bar in `--surface-2` (§4.4 loading). */
function Bar({ className }: { className?: string }) {
  return <span className={cn("block h-4 rounded-md bg-muted", className)} />
}

/**
 * §4.4 error: what happened, and what to do. Never a silent zero — a hygiene
 * count of 0 and a hygiene count that could not be loaded look identical on
 * screen, and only one of them means "nobody to call".
 */
function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={cn(CARD, "p-8")}>
      <p className="text-body text-fail">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

/**
 * §8's progress bar. `--text-3` fill on a `--border` track, turning `--pass` at
 * ≥100% — and never cyan, because progress is STATE, not interaction. Same
 * ruling as the Coach recording indicator and the board's drop highlight, and
 * the treatment /styleguide already describes under "Recorder — state, never
 * interaction".
 *
 * The width is the only inline style in this file: it is a computed value, so it
 * cannot be a utility class. The number itself came from `weeklyActivity`.
 */
function ProgressBar({
  pct,
  atTarget,
  label,
  valueText,
  tone,
}: {
  pct: number
  atTarget?: boolean
  label: string
  /**
   * What the bar means in ITS OWN units, when those are not percent. The
   * weakest-dimension bar is a /5 mean drawn as a width, so without this a
   * screen reader announces "54" under a label that says "2.7 out of 5".
   */
  valueText?: string
  tone?: keyof typeof TONE_FILL
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText}
      className="mt-4 h-2 overflow-hidden rounded-md bg-border"
    >
      <span
        aria-hidden
        className={cn(
          "block h-full rounded-md",
          tone ? TONE_FILL[tone] : atTarget ? "bg-pass" : "bg-muted-foreground",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** The honest empty/gate state inside a tile: a statement, never a blank box. */
function Held({ children }: { children: React.ReactNode }) {
  return <p className="text-body text-muted-foreground">{children}</p>
}

// ── 1. Am I doing the work? ────────────────────────────────────────────────

function ActivityTile({ activity }: { activity: Dashboard["activity"] }) {
  return (
    <div className={cn(CARD, "p-8")}>
      <p className="eyebrow">Calls this week</p>
      <p data-numeric className="mt-2 text-stat">
        {activity.count}
        <span className="text-muted-foreground"> / {activity.target}</span>
      </p>
      <ProgressBar
        pct={activity.pct}
        atTarget={activity.atTarget}
        label={`Calls this week against a target of ${activity.target}`}
      />
      <p className="mt-4 text-label text-muted-foreground">
        {activity.atTarget
          ? "Weekly target met."
          : activity.count === 0
            ? "No calls logged this week yet."
            : `${activity.remaining} more to hit the target.`}{" "}
        Week starts Monday; errored uploads don&rsquo;t count.
      </p>
    </div>
  )
}

// ── 2. Am I getting better? ────────────────────────────────────────────────

/**
 * §8's hero: the most recent scored call, its overall badge and its `top_fix` —
 * "the single most actionable datum for a solo practitioner".
 *
 * The tap goes to the call's LEAD, where Phase 5's modal already renders the full
 * scorecard through the same `<Scorecard />` component the Coach panel uses. A
 * call with `lead_id: null` has no destination anywhere in the app, so it renders
 * as a plain tile that says so rather than a link that goes nowhere.
 */
function LastCallTile({ last }: { last: ScoredCall | null }) {
  if (!last) {
    return (
      <div className={cn(CARD, "p-8")}>
        <p className="eyebrow">Most recent scored call</p>
        <p className="mt-4 text-subhead">No call scored yet.</p>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          Record one in Coach and press Analyze. Its overall score and the one fix
          worth making next land here.
        </p>
      </div>
    )
  }

  const leadId = last.call.lead_id ? String(last.call.lead_id) : null
  const duration =
    last.call.duration_seconds === null || last.call.duration_seconds === undefined
      ? ""
      : ` · ${fmtTime(Number(last.call.duration_seconds))}`

  const body = (
    <>
      <ScoreBadge score={last.overall} size="hero" />
      <div className="min-w-0 flex-1">
        <p data-numeric className="eyebrow">
          {fmtCallDate(last.call.created_at)}
          {duration}
        </p>
        <p className="eyebrow mt-4">Top fix</p>
        <p className="mt-2 text-section">{last.scores.top_fix}</p>
        {leadId ? (
          // The only cyan in this group, and it is a link — §4.1's one sanctioned
          // use. The arrow marks the tap-through without a second colour.
          <p className="mt-4 text-label font-medium text-primary">
            Open the full scorecard on this lead &rarr;
          </p>
        ) : (
          <p className="mt-4 text-label text-muted-foreground">
            Not linked to a lead, so there is no scorecard to open. Link a call to
            a lead in Coach to keep it reachable.
          </p>
        )}
      </div>
    </>
  )

  const shell = cn(CARD, "flex flex-wrap items-start gap-4 p-8")

  if (!leadId) return <div className={shell}>{body}</div>

  return (
    <Link
      href="/leads"
      // The board reads this on its next load and opens the lead's modal —
      // read-and-clear, so it fires exactly once (`lib/open-lead.ts`).
      //
      // NOT ON A MODIFIER CLICK. Ctrl/Cmd-click opens /leads in a NEW tab while
      // this one stays on the dashboard, so writing the handoff here would park
      // it in this tab's sessionStorage — and the next time this tab reached
      // /leads through the nav, minutes or hours later, a modal would open for a
      // lead nobody just asked for. That is precisely the "out of nowhere"
      // failure `open-lead.ts` exists to argue against.
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        if (event.button !== 0) return
        setOpenLead(leadId)
      }}
      className={cn(shell, "transition-colors hover:bg-muted")}
    >
      {body}
    </Link>
  )
}

/**
 * §8's secondary: the weakest dimension across all scored calls, "as a labelled
 * bar". Gated at the same 5 scored calls as the trend — adjudicated this phase,
 * because §8 left it open and §1 rule 6 wants the whole group to tell one story
 * on thin data.
 *
 * §3 CUT the old app's list of all six dimension bars. This is the floor and
 * nothing else.
 */
function WeakestTile({
  weakest,
  gated,
  scoredCount,
}: {
  weakest: WeakestDimension | null
  gated: boolean
  scoredCount: number
}) {
  return (
    <div className={cn(CARD, "p-8")}>
      <p className="eyebrow">Weakest dimension</p>
      <div className="mt-4">
        {gated ? (
          <Held>
            Your floor unlocks at {SCORED_GATE} scored calls &middot; you have{" "}
            <span data-numeric>{scoredCount}</span>
          </Held>
        ) : !weakest ? (
          // Reachable only from malformed jsonb: five scored calls whose
          // dimensions carry no usable score. Named rather than blank.
          <Held>No dimension scores available yet.</Held>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <p className="text-section">
                <span className="font-semibold">{weakest.label}</span> is your
                floor &mdash; drill it.
              </p>
              <ScoreBadge score={weakest.mean} />
            </div>
            <ProgressBar
              pct={weakest.pct}
              tone={scoreTone(weakest.mean)}
              label={`${weakest.label} mean score`}
              valueText={`${weakest.mean} out of 5`}
            />
            <p className="mt-4 text-label text-muted-foreground">
              Mean across <span data-numeric>{weakest.n}</span> scored answers on
              this dimension.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * §8's trend, gated per §0. Under 5 scored calls it renders §0's message
 * verbatim; at ≥5 it is a minimal line — navy stroke, no gradient fill, no
 * dots-per-point decoration.
 *
 * The two rules at 5 and 1 are 1px `--border` (§4.3's "structured grids, 1px
 * border lines"), and they are what makes the line readable without axis labels:
 * every point sits between them, and the y of each is computed by the same
 * `trendY` the path uses, so they cannot drift apart.
 */
function TrendTile({
  trend,
  trendCount,
  gated,
  scoredCount,
}: {
  trend: number[]
  trendCount: number
  gated: boolean
  scoredCount: number
}) {
  const { width, height, padX } = TREND_GEOMETRY

  return (
    <div className={cn(CARD, "p-8")}>
      <p className="eyebrow">Score trend</p>
      <div className="mt-4">
        {gated ? (
          <Held>
            Trend unlocks at {SCORED_GATE} scored calls &middot; you have{" "}
            <span data-numeric>{scoredCount}</span>
          </Held>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`Overall score across the last ${trendCount} scored calls, on a scale of 1 to 5`}
              className="w-full"
            >
              {[5, 1].map((score) => (
                <line
                  key={score}
                  x1={padX}
                  x2={width - padX}
                  y1={trendY(score, TREND_GEOMETRY)}
                  y2={trendY(score, TREND_GEOMETRY)}
                  className="stroke-border"
                  strokeWidth={1}
                />
              ))}
              <path
                d={trendPath(trend, TREND_GEOMETRY)}
                fill="none"
                className="stroke-foreground"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="mt-4 text-label text-muted-foreground">
              Overall score, last <span data-numeric>{trendCount}</span> scored
              calls &middot; oldest to newest, scale 1&ndash;5.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── 3. Who do I call next? ─────────────────────────────────────────────────

/**
 * §8's hygiene tile — "this is the call queue".
 *
 * THE COUNTS DO NOT TAP THROUGH, and that is a decision rather than an omission.
 * §8 wants them filtering the kanban; §12 defers the kanban-side filter. A link
 * that lands on an unfiltered board reads as "show me those 5" and shows you all
 * of them, which is precisely the silent-wrong-answer §4.4 exists to prevent. The
 * tap-through arrives with the filter.
 */
function HygieneTile({ hygiene }: { hygiene: Dashboard["hygiene"] }) {
  if (!hygiene.leads) {
    return (
      <div className={cn(CARD, "p-8")}>
        <p className="text-subhead">No leads yet.</p>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          Find leads on the board and they show up here as a call queue — who has
          never been called, and who has gone quiet.
        </p>
      </div>
    )
  }

  return (
    <div className={cn(CARD, "grid gap-8 p-8 sm:grid-cols-2")}>
      <div>
        <p data-numeric className="text-stat">
          {hygiene.neverCalled}
        </p>
        <p className="eyebrow mt-2">Leads never called</p>
        <p className="mt-2 text-label text-muted-foreground">
          No call is linked to them at all.
        </p>
      </div>
      <div>
        <p data-numeric className="text-stat">
          {hygiene.quiet}
        </p>
        <p className="eyebrow mt-2">Quiet for 7+ days</p>
        <p className="mt-2 text-label text-muted-foreground">
          No call, and no edit or board move, in the last week. A never-called
          lead joins this count once it is a week old, so the two overlap.
        </p>
      </div>
    </div>
  )
}

// ── The screen ─────────────────────────────────────────────────────────────

type Snapshot = {
  calls: DashboardCall[] | null
  leads: DashboardLead[] | null
  callsError: string | null
  leadsError: string | null
  /**
   * The clock the whole screen was computed against, captured once per load. Two
   * tiles asking `new Date()` separately could straddle midnight and disagree
   * about which week it is.
   */
  now: Date
}

export function DashboardView() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)

  /**
   * Both requests, settled independently.
   *
   * `allSettled`, not `all`: the old app used `Promise.all` and one failure blanked
   * the whole dashboard. Here a failed leads GET costs only group 3 — the week's
   * count and the last call are already in hand, and on a phone in a parking lot
   * that is the difference between a useful screen and an error page.
   *
   * `leadsCache.load(true)` FORCES the fetch. The cache exists to stop a second
   * caller issuing a duplicate GET (Phase 5), not to serve a stale answer: a
   * hygiene count is a claim about right now, and one computed off rows the board
   * loaded an hour ago is a wrong call queue. Forcing still joins an in-flight
   * request, which is the part that matters.
   */
  const load = useCallback(async () => {
    const [calls, leads] = await Promise.allSettled([
      leadsApi<{ calls: DashboardCall[] }>(
        "/api/calls",
        undefined,
        "Could not load calls",
      ),
      leadsCache.load(true),
    ])

    setSnapshot({
      calls: calls.status === "fulfilled" ? calls.value.calls || [] : null,
      leads: leads.status === "fulfilled" ? leads.value : null,
      callsError:
        calls.status === "rejected"
          ? errorText(calls.reason, "Could not load calls")
          : null,
      leadsError:
        leads.status === "rejected"
          ? errorText(leads.reason, "Could not load leads")
          : null,
      now: new Date(),
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    // Fetch-on-mount. `set-state-in-effect` traces one level into `load` and sees
    // its two state writes, even though both happen after the `await` and neither
    // is synchronous with this effect. The rule is aimed at cascading renders;
    // loading the dashboard's data when the page opens is the data fetch React
    // still has no better primitive for here. Phase 5's `LeadCalls` carries the
    // identical disable for the identical reason, and Phase 4's board escapes the
    // rule only because its setState sits one hop further down — a difference in
    // what the analyser can see, not in behaviour.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; every write in `load` is post-await
    void load()
  }, [load])

  const retry = useCallback(() => {
    setLoading(true)
    void load()
  }, [load])

  /**
   * Every number on the screen, computed once, in one place (§6).
   *
   * A failed fetch contributes an empty array here and the groups that depend on
   * it render their error state instead — the arithmetic is harmless, but its
   * result is never shown, because "0 calls this week" and "could not load your
   * calls" are different statements and only one of them is true.
   */
  const dash = useMemo(
    () =>
      snapshot
        ? buildDashboard(snapshot.calls ?? [], snapshot.leads ?? [], snapshot.now)
        : null,
    [snapshot],
  )

  const callsFailed = snapshot?.callsError ?? null
  // Group 3 needs BOTH: never-called is a question about calls as much as leads.
  const hygieneFailed = callsFailed ?? snapshot?.leadsError ?? null

  return (
    <Container className="flex flex-col gap-8 pb-16">
      <header>
        <h1 className="text-title">Dashboard</h1>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          Three questions, and nothing else: am I doing the work, am I getting
          better, who do I call next.
        </p>
      </header>

      <Group question="Am I doing the work?">
        {loading || !dash ? (
          <div className={cn(CARD, "p-8")}>
            <Bar className="w-32" />
            <Bar className="mt-4 h-11 w-40" />
            <Bar className="mt-4 h-2 w-full" />
          </div>
        ) : callsFailed ? (
          <Failed message={callsFailed} onRetry={retry} />
        ) : (
          <ActivityTile activity={dash.activity} />
        )}
      </Group>

      <Group question="Am I getting better?">
        {loading || !dash ? (
          <div className="flex flex-col gap-8">
            <div className={cn(CARD, "flex flex-wrap items-start gap-4 p-8")}>
              <span className="block size-16 rounded-md bg-muted" />
              <div className="min-w-0 flex-1">
                <Bar className="w-40" />
                <Bar className="mt-4 w-full max-w-md" />
                <Bar className="mt-2 w-2/3 max-w-sm" />
              </div>
            </div>
            <div className="grid gap-8 lg:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className={cn(CARD, "p-8")}>
                  <Bar className="w-32" />
                  <Bar className="mt-4 w-full" />
                  <Bar className="mt-2 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        ) : callsFailed ? (
          <Failed message={callsFailed} onRetry={retry} />
        ) : (
          <div className="flex flex-col gap-8">
            <LastCallTile last={dash.lastScored} />
            <div className="grid gap-8 lg:grid-cols-2">
              <WeakestTile
                weakest={dash.weakest}
                gated={dash.gated}
                scoredCount={dash.scoredCount}
              />
              <TrendTile
                trend={dash.trend}
                trendCount={dash.trendCount}
                gated={dash.gated}
                scoredCount={dash.scoredCount}
              />
            </div>
          </div>
        )}
      </Group>

      <Group question="Who do I call next?">
        {loading || !dash ? (
          <div className={cn(CARD, "grid gap-8 p-8 sm:grid-cols-2")}>
            {[0, 1].map((i) => (
              <div key={i}>
                <Bar className="h-11 w-16" />
                <Bar className="mt-2 w-32" />
                <Bar className="mt-2 w-full" />
              </div>
            ))}
          </div>
        ) : hygieneFailed ? (
          <Failed message={hygieneFailed} onRetry={retry} />
        ) : (
          <HygieneTile hygiene={dash.hygiene} />
        )}
      </Group>

      {/* Every fetch on this page goes through `apiFetch`, which needs somewhere
          to ask for the passphrase — /dashboard can be the first page a fresh tab
          lands on. Same mounting as the board and the Coach panel. */}
      <SecretModal />
    </Container>
  )
}
