import { Container } from "@/components/app-shell"
import { ScoreBadge } from "@/components/score-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
