import { Container } from "@/components/app-shell"

/**
 * Honest placeholder for a route the app shell can reach but the build has not
 * reached yet. It states the phase that fills it and what will be there — the
 * §4.4 rule that a screen never renders a blank void, applied to the one case
 * §4.4 doesn't cover: not-built-yet.
 *
 * Delete each usage as its phase lands. When none remain, delete this file.
 */
export function PhasePlaceholder({
  title,
  phase,
  summary,
}: {
  title: string
  phase: string
  summary: string
}) {
  return (
    <Container>
      <h1 className="text-title">{title}</h1>
      <div className="mt-8 rounded-lg border border-border bg-muted p-8">
        <p className="eyebrow">{phase}</p>
        <p className="mt-2 max-w-prose text-body text-foreground-2">{summary}</p>
      </div>
    </Container>
  )
}
