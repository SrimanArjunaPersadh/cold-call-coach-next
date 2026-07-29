import Link from "next/link"

import { SiteNav } from "@/components/site-nav"

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
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <Container className="flex h-16 items-center justify-between gap-4">
          {/* Hidden below 640px: wordmark + three nav items need 400px and an
              iPhone SE gives 375. On a phone the nav is the whole chrome, and it
              already says where you are. */}
          <Link
            href="/coach"
            className="eyebrow hidden text-foreground hover:text-primary sm:inline-block"
          >
            Cold Call Coach
          </Link>
          <SiteNav />
        </Container>
      </header>

      <main className="flex-1 py-8">{children}</main>
    </div>
  )
}
