// §4 as data, for the /styleguide acceptance test.
//
// `hex` and `spec` here are DOCUMENTATION copied from the plan. The swatches and
// specimens on /styleguide render from the live CSS variables and utilities, not
// from these strings — so if a value in globals.css drifts from §4, the swatch
// and its printed hex stop agreeing and the styleguide fails visibly. That
// disagreement is the test.

export type PaletteToken = {
  token: string
  hex: string
  /** §4.5's value behind the same token when `.dark` is on <html>. */
  hexDark: string
  role: string
  /** Tailwind utilities backed by this token, for call sites. */
  utilities: string
}

export const PALETTE: PaletteToken[] = [
  {
    token: "--bg",
    hex: "#F7F9FC",
    hexDark: "#0B1220",
    role: "App background (light frost / near-black navy)",
    utilities: "bg-background",
  },
  {
    token: "--surface",
    hex: "#FFFFFF",
    hexDark: "#101A2E",
    role: "Cards, panels, modals",
    utilities: "bg-card, bg-popover",
  },
  {
    token: "--surface-2",
    hex: "#EFF3F9",
    hexDark: "#18233A",
    role: "Insets, table header rows, collapsed rail",
    utilities: "bg-muted, bg-secondary, bg-accent",
  },
  {
    token: "--border",
    hex: "#E2E8F0",
    hexDark: "#263248",
    role: "All borders, 1px, no exceptions",
    utilities: "border-border, border-input",
  },
  {
    token: "--text",
    hex: "#0A1128",
    hexDark: "#E7ECF5",
    role: "Primary text (midnight navy / frost)",
    utilities: "text-foreground",
  },
  {
    token: "--text-2",
    hex: "#3E4C66",
    hexDark: "#AEBACE",
    role: "Secondary text",
    utilities: "text-foreground-2",
  },
  {
    token: "--text-3",
    hex: "#64748B",
    hexDark: "#7E8CA6",
    role: "Muted / labels / timestamps (slate)",
    utilities: "text-muted-foreground",
  },
  {
    token: "--accent",
    hex: "#0891B2",
    hexDark: "#22D3EE",
    role: "Cyan. Interactive states ONLY — focus rings, active nav, primary buttons, links. ≤5% of any viewport, in both skins.",
    utilities: "bg-primary, text-primary, outline-ring",
  },
  {
    token: "--pass",
    hex: "#16A34A",
    hexDark: "#22C55E",
    role: "Pass / success / score ≥4",
    utilities: "text-pass, tint-pass",
  },
  {
    token: "--warn",
    hex: "#D97706",
    hexDark: "#F59E0B",
    role: "Warnings / neutral-outcome toasts / score 3",
    utilities: "text-warn, tint-warn",
  },
  {
    token: "--fail",
    hex: "#DC2626",
    hexDark: "#F87171",
    role: "Miss / errors / destructive / score ≤2. Dark takes two steps of lift where pass and warn take one — red is the darkest of the three hues, so it needs more to clear the same contrast bar on the badge tint (§4.5).",
    utilities: "text-fail, tint-fail, bg-destructive",
  },
  {
    token: "--scrim",
    hex: "rgba(10,17,40,0.2)",
    hexDark: "rgba(0,0,0,0.5)",
    role: "Modal overlays only (§4.5). Dimming means darker in both skins — this is the one token that is not a solid colour.",
    utilities: "bg-scrim",
  },
]

export type TypeRole = {
  utility: string
  role: string
  spec: string
  sample: string
}

export const TYPE_RAMP: TypeRole[] = [
  {
    utility: "text-stat",
    role: "Hero stat (dashboard numbers, overall score)",
    spec: "44px / 700 / -0.02em / tabular-nums",
    sample: "4 / 25",
  },
  {
    utility: "text-title",
    role: "Page title",
    spec: "24px / 600 / -0.01em",
    sample: "Dashboard",
  },
  {
    utility: "text-section",
    role: "Section header",
    spec: "18px / 600",
    sample: "Review audit",
  },
  {
    utility: "text-subhead",
    role: "Card header / criterion name",
    spec: "15px / 600",
    sample: "Discovery questions",
  },
  {
    utility: "text-body",
    role: "Body / evidence text",
    spec: "15px / 400 / 1.6 line-height",
    sample:
      "“So what I do is I build websites for businesses like yours” — no question asked in the first ninety seconds.",
  },
  {
    utility: "eyebrow",
    role: "Label / meta / eyebrow",
    spec: "12px / 500 / +0.04em / uppercase / --text-3",
    sample: "Longest monologue",
  },
]

export const SPACING_SCALE = [
  { px: 8, utility: "p-2 / gap-2" },
  { px: 16, utility: "p-4 / gap-4" },
  { px: 32, utility: "p-8 / gap-8" },
  { px: 64, utility: "p-16 / gap-16" },
]
