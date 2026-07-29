import { Container } from "@/components/app-shell"
import { ScoreBadge } from "@/components/score-badge"
import { BoardDemo } from "@/components/styleguide/board-demo"
import {
  CallHistoryDemo,
  ComboboxDemo,
} from "@/components/styleguide/history-demo"
import { ScorecardDemo } from "@/components/styleguide/scorecard-demo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PALETTE, SPACING_SCALE, TYPE_RAMP } from "@/lib/design-tokens"

export const metadata = { title: "Styleguide · Cold Call Coach" }

// The visual acceptance test for §4 (Phase 0). Every token, type role, badge
// colour and button state renders here. If a screen elsewhere in the app needs a
// treatment that is not on this page, the treatment is wrong — or this page is
// missing an entry and §4 needs amending first.
//
// Verify on laptop AND phone. Cyan audit: the only cyan on this page is the
// active nav item, the primary button, the link, the focus rings, and the single
// --accent swatch below.

function Section({
  title,
  reference,
  children,
}: {
  title: string
  reference: string
  children: React.ReactNode
}) {
  return (
    // min-w-0 so the wide tables below scroll inside their own overflow-x-auto
    // box instead of widening the page.
    <section className="min-w-0 border-t border-border pt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-section">{title}</h2>
        <span className="eyebrow shrink-0">{reference}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function StyleguidePage() {
  return (
    <Container className="flex flex-col gap-8 pb-16">
      <header>
        <p className="eyebrow">Phase 0 acceptance test</p>
        <h1 className="mt-2 text-title">Styleguide — Light Terminal</h1>
        <p className="mt-2 max-w-prose text-body text-foreground-2">
          Every token in §4 of the migration plan, rendered from the live CSS
          variables. Swatches show the computed colour; the hex beside each one is
          the value §4 specifies. If a swatch and its hex disagree, globals.css has
          drifted from the plan.
        </p>
      </header>

      {/* ---------------------------------------------------------------- §4.1 */}
      <Section title="Palette" reference="§4.1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-xl border-collapse text-body">
            <thead>
              <tr className="bg-muted text-left">
                <th className="eyebrow p-2 font-medium">Swatch</th>
                <th className="eyebrow p-2 font-medium">Token</th>
                <th className="eyebrow p-2 font-medium">Hex</th>
                <th className="eyebrow p-2 font-medium">Role</th>
                <th className="eyebrow p-2 font-medium">Utilities</th>
              </tr>
            </thead>
            <tbody>
              {PALETTE.map((t) => (
                <tr key={t.token} className="border-t border-border align-top">
                  <td className="p-2">
                    <span
                      aria-hidden
                      className="block size-8 rounded-md border border-border"
                      style={{ background: `var(${t.token})` }}
                    />
                  </td>
                  <td className="p-2 font-mono text-label">{t.token}</td>
                  <td className="p-2 font-mono text-label uppercase">{t.hex}</td>
                  <td className="max-w-xs p-2 text-foreground-2">{t.role}</td>
                  <td className="p-2 font-mono text-label text-muted-foreground">
                    {t.utilities}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- §4.2 */}
      <Section title="Type ramp — Plus Jakarta Sans" reference="§4.2">
        <div className="flex flex-col gap-8">
          {TYPE_RAMP.map((t) => (
            <div key={t.utility}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-label text-primary">
                  .{t.utility}
                </span>
                <span className="text-label text-muted-foreground">
                  {t.role} · {t.spec}
                </span>
              </div>
              <p className={`mt-2 ${t.utility === "eyebrow" ? "eyebrow" : t.utility}`}>
                {t.sample}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-body text-foreground-2">
          Numbers in data contexts carry{" "}
          <code className="font-mono text-label">tabular-nums</code> so columns
          align. Compare — the digits below sit in the same columns on every row:
        </p>
        <div className="mt-4 w-fit rounded-lg border border-border">
          {["58% · 42s · 14", "07% · 09s · 91", "11% · 68s · 30"].map((row) => (
            <p
              key={row}
              data-numeric
              className="border-b border-border px-4 py-2 text-body last:border-b-0"
            >
              {row}
            </p>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- §4.1 */}
      <Section title="Score badges" reference="§4.1 · §5.2">
        <p className="max-w-prose text-body text-foreground-2">
          1–2 → fail · 3 → warn · 4–5 → pass. Tinted background at 10% of the
          semantic colour, solid semantic text. Identical in the Coach panel, lead
          call history and dashboard — all of them render{" "}
          <code className="font-mono text-label">&lt;ScoreBadge /&gt;</code>.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {[1, 2, 3, 4, 5].map((score) => (
            <ScoreBadge key={score} score={score} />
          ))}
        </div>
        <p className="eyebrow mt-8">Hero size — scorecard call header</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <ScoreBadge score={2} size="hero" />
          <ScoreBadge score={3} size="hero" />
          <ScoreBadge score={5} size="hero" />
        </div>
        <p className="eyebrow mt-8">Other badge variants</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="muted">Not interested (12)</Badge>
        </div>
        <p className="eyebrow mt-8">
          Semantic text — pass / warn / fail, never decoration
        </p>
        <div className="mt-2 flex flex-col gap-2 text-body">
          <p className="text-pass">Metrics saved.</p>
          <p className="text-warn">
            Scrape finished — every result was filtered out.
          </p>
          <p className="text-fail">Upload failed. The call was not saved.</p>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- §4.3 */}
      <Section title="Buttons — every variant and state" reference="§4.3 · §10">
        <p className="max-w-prose text-body text-foreground-2">
          Hover each one; then tab through them to check the 2px cyan focus ring.
          Every size is at least 44px tall — the sub-44px sizes were removed from
          the component, not merely avoided.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-xl border-collapse text-body">
            <thead>
              <tr className="bg-muted text-left">
                <th className="eyebrow p-2 font-medium">Variant</th>
                <th className="eyebrow p-2 font-medium">Default</th>
                <th className="eyebrow p-2 font-medium">Disabled</th>
                <th className="eyebrow p-2 font-medium">Use for</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["default", "Record call", "The one primary action per screen"],
                  ["outline", "Link to lead", "Secondary actions"],
                  ["secondary", "Swap speakers", "Tertiary / inline actions"],
                  ["ghost", "Cancel", "Dismissals, toolbar actions"],
                  ["destructive", "Delete call", "Destructive, behind a confirm"],
                  ["link", "View scorecard", "Navigation inside prose"],
                ] as const
              ).map(([variant, label, use]) => (
                <tr key={variant} className="border-t border-border align-middle">
                  <td className="p-2 font-mono text-label">{variant}</td>
                  <td className="p-2">
                    <Button variant={variant}>{label}</Button>
                  </td>
                  <td className="p-2">
                    <Button variant={variant} disabled>
                      {label}
                    </Button>
                  </td>
                  <td className="max-w-xs p-2 text-foreground-2">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="eyebrow mt-8">Sizes — all ≥44px</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Button size="default">Default · 44px</Button>
          <Button size="lg">Large · 48px</Button>
          <Button size="icon" aria-label="Icon button · 44px">
            <span aria-hidden>+</span>
          </Button>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- §4.3 */}
      <Section title="Geometry & elevation" reference="§4.3">
        <p className="eyebrow">Spacing — 8 / 16 / 32 / 64 only</p>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          {SPACING_SCALE.map((s) => (
            <div key={s.px} className="flex flex-col items-center gap-2">
              <span
                aria-hidden
                className="block bg-primary/20"
                style={{ width: s.px, height: s.px }}
              />
              <span className="font-mono text-label">{s.px}px</span>
              <span className="text-label text-muted-foreground">
                {s.utility}
              </span>
            </div>
          ))}
        </div>

        <p className="eyebrow mt-8">Radius — 6px and 8px, nothing else exists</p>
        <div className="mt-2 flex flex-wrap gap-4">
          <div className="flex flex-col items-center gap-2">
            <span
              aria-hidden
              className="block size-16 rounded-md border border-border bg-muted"
            />
            <span className="font-mono text-label">6px · rounded-md</span>
            <span className="text-label text-muted-foreground">
              buttons, badges, chips
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span
              aria-hidden
              className="block size-16 rounded-lg border border-border bg-muted"
            />
            <span className="font-mono text-label">8px · rounded-lg</span>
            <span className="text-label text-muted-foreground">
              cards, modals, inputs
            </span>
          </div>
        </div>

        <p className="eyebrow mt-8">Elevation — one shadow, floating surfaces only</p>
        <div className="mt-2 flex flex-wrap gap-8">
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border border-border bg-card p-4 text-body">
              Resting card — border only
            </div>
            <span className="text-label text-muted-foreground">
              No shadow. Ever.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border border-border bg-card p-4 text-body shadow-md">
              Floating surface — modal, popover, drag ghost
            </div>
            <span className="font-mono text-label text-muted-foreground">
              0 4px 20px -2px rgba(10,17,40,0.05)
            </span>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- §4.4 */}
      <Section title="The four states" reference="§4.4">
        <p className="max-w-prose text-body text-foreground-2">
          Every surface ships all four or it does not ship. These are the reference
          renderings — copy the treatment, not the copy.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Empty</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body text-foreground-2">
                No calls yet. Record your first call to see it scored here.
              </p>
              <Button className="mt-4">Record call</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Loading</CardTitle>
            </CardHeader>
            <CardContent>
              <div aria-busy className="flex flex-col gap-2">
                <span className="block h-8 w-1/3 rounded-md bg-muted" />
                <span className="block h-4 w-full rounded-md bg-muted" />
                <span className="block h-4 w-2/3 rounded-md bg-muted" />
              </div>
              <p className="mt-4 text-label text-muted-foreground">
                Skeleton in --surface-2. No spinners-as-personality.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body text-fail">
                Microphone access was denied, so recording can&rsquo;t start.
              </p>
              <p className="mt-2 text-body text-foreground-2">
                Allow the microphone in your browser&rsquo;s site settings, then
                try again.
              </p>
              <Button variant="outline" className="mt-4">
                Try again
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Happy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <ScoreBadge score={4} size="hero" />
                <div>
                  <p className="eyebrow">Top fix</p>
                  <p className="text-body">
                    Ask a discovery question before pitching.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------- §4.3 · §10 */}
      <Section title="Inputs, and the one modal treatment" reference="§4.3 · §4.4">
        <p className="max-w-prose text-body text-foreground-2">
          Inputs take the 8px radius (§4.3 groups them with cards and modals, not
          buttons) and are 44px tall. The Unlock modal is the only floating
          surface Phase 3 ships: the page dims behind it with{" "}
          <code className="font-mono text-label">--text</code> at 20%, and the
          panel is the one shadow. Shown flattened here — the live one is fixed
          over the viewport.
        </p>
        <p className="mt-4 max-w-prose text-body text-foreground-2">
          §4.3&rsquo;s modal rules, added 2026-07-30, are structural and cannot be
          shown flattened — check them on the real lead modal instead. A modal
          carrying only a form stays at 512px; one carrying a scorecard takes
          1024px. The <strong className="font-semibold">panel never scrolls</strong>
          — a region inside it does, so the close control stays put instead of
          scrolling away from you. And the content column is{" "}
          <code className="font-mono text-label">1fr</code>, never{" "}
          <code className="font-mono text-label">auto</code>: an auto column takes
          the width of its widest child, which is what made the lead modal scroll
          sideways.
        </p>
        <div className="mt-4 grid gap-8 sm:grid-cols-2">
          <div>
            <label htmlFor="sg-input" className="eyebrow mb-2 block">
              Passphrase
            </label>
            <Input id="sg-input" type="password" defaultValue="hunter2" />
            <p role="alert" className="mt-2 text-body text-fail">
              That passphrase was rejected. Try again.
            </p>
          </div>
          <div className="flex items-center justify-center rounded-lg bg-foreground/20 p-8">
            <div className="w-full rounded-lg border border-border bg-card p-8 shadow-md">
              <p className="text-section">Unlock</p>
              <p className="mt-2 text-body text-foreground-2">
                This app is locked to you. Enter the passphrase to continue.
              </p>
              <Button className="mt-8 w-full">Unlock</Button>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- §4.1 · §4.4 */}
      <Section title="Recorder — state, never interaction" reference="§4.1 · §4.4">
        <p className="max-w-prose text-body text-foreground-2">
          Record is a primary action, so it earns cyan. The recording indicator
          and the level meter are <em>state</em>, so they do not: the dot is{" "}
          <code className="font-mono text-label">--text</code>, the meter fill is{" "}
          <code className="font-mono text-label">--text-3</code> on a{" "}
          <code className="font-mono text-label">--border</code> track. Same rule
          as the dashboard&rsquo;s progress bar in §8.
        </p>
        <div className="mt-4 flex max-w-md items-center gap-4 rounded-lg bg-muted p-4">
          <span
            aria-hidden
            className="size-2 shrink-0 animate-pulse rounded-md bg-foreground"
          />
          <span className="eyebrow">Recording</span>
          <span data-numeric className="text-subhead">
            1:24
          </span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-md bg-border">
            <span aria-hidden className="block h-full w-2/3 bg-muted-foreground" />
          </span>
        </div>
      </Section>

      {/* ---------------------------------------------------------- §5.2 */}
      <Section title="Scorecard — the sanctioned refine" reference="§5.2">
        <p className="max-w-prose text-body text-foreground-2">
          One component renders this everywhere: the Coach panel now, Phase
          5&rsquo;s lead call history later, off stored rows. It only renders —
          it never fetches and never computes a metric. All four states below;
          the swap control in the first one is live, so tapping it recomputes
          talk share, longest monologue and fillers from the same turns.
        </p>
        <div className="mt-4">
          <ScorecardDemo />
        </div>
      </Section>

      {/* ---------------------------------------------------------- §7 */}
      <Section title="Kanban — card and column" reference="§7 · §4.4">
        <p className="max-w-prose text-body text-foreground-2">
          The Phase 4 treatments. §7 fixes the card at four things — business
          name, phone, maps rating, website link — so the extras the old card
          carried (a Maps link, a &ldquo;No website&rdquo; flag, an industry
          chip, a notes flag, a Call button) are gone. All six stages are full
          columns; see the amendment note below. Nothing here is cyan: a drop
          target is state, not interaction — the same ruling that keeps the
          recorder&rsquo;s indicator grey.
        </p>
        <div className="mt-4">
          <BoardDemo />
        </div>
      </Section>

      {/* ---------------------------------------------------------- Phase 5 */}
      <Section title="Attach-to-lead combobox" reference="§10 · §4.4">
        <p className="max-w-prose text-body text-foreground-2">
          Hand-rolled rather than a primitive, for one reason: option selection
          fires on <code className="font-mono text-label">mousedown</code> with{" "}
          <code className="font-mono text-label">preventDefault()</code>, so the
          choice lands before the input blurs (§10). A{" "}
          <code className="font-mono text-label">click</code> handler loses that
          race on a phone. Click-outside closes, Enter picks the active row,
          Escape closes, arrows move; rows are 44px. Search matches business,
          contact name or phone. The linked-state chip at the bottom is state, not
          interaction, so it takes no cyan — the same ruling as the recorder&rsquo;s
          indicator and the board&rsquo;s drop highlight.
        </p>
        <div className="mt-4">
          <ComboboxDemo />
        </div>
      </Section>

      <Section title="Call history row" reference="§5.2 · §4.4 · §6">
        <p className="max-w-prose text-body text-foreground-2">
          The per-lead history inside the lead modal. Each call collapses to a
          badge, a date and its top fix; opening one renders the SAME scorecard
          component the Coach panel uses, read-only — no swap control, because
          swapping here would recompute and re-persist metrics the Coach panel
          owns. The metrics strip is <strong className="font-semibold">formatted
          from the stored object, never recomputed</strong> (§6), so a call saved
          before metrics existed renders no strip at all rather than zeros or
          dashes. Delete uses the AlertDialog and pending state Phase 4 built for
          lead delete, which closes the one ⚠ gap STATUS §4 recorded against it.
        </p>
        <div className="mt-4">
          <CallHistoryDemo />
        </div>
      </Section>

      {/* ------------------------------------------------------------- §1 · §4.1 */}
      <Section title="Cyan audit" reference="§1.5 · §4.1">
        <p className="max-w-prose text-body text-foreground-2">
          Cyan is capped at 5% of any viewport and appears only on interaction:
          focus rings, the active nav item, primary buttons, and links. Never a
          background, never a heading, never decoration. On this page the cyan is
          the active nav underline, the primary buttons, the{" "}
          <a href="#" className="text-primary underline underline-offset-4">
            link treatment
          </a>
          , the type-ramp utility names, the spacing swatches, and one palette
          swatch — check the phone viewport too, where the same pixels take up a
          larger share.
        </p>
        <p className="mt-4 max-w-prose text-body text-foreground-2">
          Green, red and amber mean pass, fail and warn. They mean nothing else and
          they are never decoration.
        </p>
      </Section>
    </Container>
  )
}
