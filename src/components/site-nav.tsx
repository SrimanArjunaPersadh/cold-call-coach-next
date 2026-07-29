"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

// §11 Phase 0: top nav, horizontal, left-to-right. Three destinations, nothing
// else — no settings, no account, no search. Every item is a 44px touch target
// (§10) and the active item is the only cyan on the page (§4.1).
const NAV = [
  { href: "/coach", label: "Coach" },
  { href: "/leads", label: "Leads" },
  { href: "/dashboard", label: "Dashboard" },
] as const

export function SiteNav() {
  const pathname = usePathname()

  return (
    // -mb-px drops the active underline onto the header's own border line.
    <nav aria-label="Primary" className="-mb-px flex items-center">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-16 items-center border-b-2 px-2 text-body font-medium transition-colors sm:px-4",
              active
                ? "border-b-primary text-primary"
                : "border-b-transparent text-foreground-2 hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
