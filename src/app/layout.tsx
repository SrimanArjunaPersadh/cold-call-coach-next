import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"

import { AppShell } from "@/components/app-shell"
import { THEME_INIT_SCRIPT } from "@/lib/theme"
import "./globals.css"

// §4.2 — Plus Jakarta Sans for everything, self-hosted by next/font. Variable
// font, so no per-weight files. Exposed as --font-jakarta, which globals.css
// wires to Tailwind's --font-sans.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Cold Call Coach",
  description: "Record a cold call, get it scored, work the leads.",
}

// Light is the default skin (§4.5), so the server sends light's --surface; the
// init script and the toggle retint via lib/theme.ts when the dark skin is on.
// No static colorScheme — the CSS `color-scheme` on :root / .dark owns it now,
// and a meta pinned to "light" would fight the dark skin's form controls.
export const viewport: Viewport = {
  themeColor: "#ffffff",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning: the init script below may put `.dark` on <html>
    // before React hydrates, and that class difference is the one we want.
    <html lang="en" className={`${jakarta.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        {/* §4.5 — FIRST child of <body>: runs after the stylesheets, before
            anything paints. This is what keeps a dark-mode tab from flashing
            white on every load. The script lives in lib/theme.ts beside the
            toggle it mirrors. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
