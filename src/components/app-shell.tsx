import Link from "next/link"

import { SiteNav } from "@/components/site-nav"
import { ThemeToggle } from "@/components/theme-toggle"

/** Page width and gutters. Gutters are 16px / 32px — on the §4.3 spacing scale. */
export function Container({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 sm:px-8 ${className ?? ""}`}>
      {children}
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      {/* `--nav-h` is on the HEADER, not on the Container inside it, and that is
          the fix for a real bug rather than a tidy-up. The height has to be the
          space this bar OCCUPIES, because the kanban pane subtracts it from the
          viewport: with the height on the Container, the 1px `border-b` sat
          outside it, the nav took 65px, the pane took 64, and the document grew a
          scrollbar it should never have — which then scrolled the pinned column
          headers off the top of the screen. box-sizing is border-box, so putting
          it here makes the border part of the 4rem instead of extra. */}
      <header className="sticky top-0 z-10 h-[var(--nav-h)] border-b border-border bg-card">
        <Container className="flex h-full items-center justify-between gap-4">
          {/* Hidden below 640px: wordmark + three nav items need 400px and an
              iPhone SE gives 375. On a phone the nav is the whole chrome, and it
              already says where you are. */}
          <Link
            href="/coach"
            className="eyebrow hidden text-foreground hover:text-primary sm:inline-block"
          >
            Cold Call Coach
          </Link>
          {/* gap-2 (8px, on scale) between the nav and the theme toggle; the
              nav's own -mb-px underline trick is unaffected because the wrapper
              is baseline-neutral. Still fits an iPhone SE with the wordmark
              hidden: three nav items ≈230px + 44px toggle < 375. */}
          <div className="flex items-center gap-2">
            <SiteNav />
            <ThemeToggle />
          </div>
        </Container>
      </header>

      <main className="flex-1 py-8">{children}</main>
    </div>
  )
}
