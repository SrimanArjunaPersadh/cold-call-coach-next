import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"

import { AppShell } from "@/components/app-shell"
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

// Light only (§4). Declared so mobile browsers don't tint chrome for dark mode.
export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
