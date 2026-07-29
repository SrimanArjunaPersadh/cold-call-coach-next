# Cold Call Coach — Next.js

A solo cold-calling instrument: record a call, get it transcribed and scored on
six Hormozi dimensions, and work the resulting leads through a kanban. One user,
low volume, honest numbers.

This repo is the **Next.js rewrite** of an existing, working vanilla single-file
app. It is a translation of a frozen feature set, not a redesign and not a new
product. The old app stays live and untouched until the cutover in Phase 9.

- **Old app (behavioural reference):** `C:\Users\Administrator\Downloads\PROJECT1\cold-call-coach`
- **New app (this repo):** Next.js App Router · TypeScript strict · Tailwind v4 ·
  shadcn/ui · Vercel · same Supabase project

## Read this first

**[`MIGRATION-MASTER-PLAN.md`](./MIGRATION-MASTER-PLAN.md) is the source of
truth.** It holds the design system, the frozen scoring schema, the API
translation contract, the phase checklist, and the rules about what must never
change. Where the plan and anything else disagree — this README included — the
plan wins.

Start with §1 (design philosophy), §6 (the model never does arithmetic) and §10
(how the work gets done). `AGENTS.md` carries the same rules for coding agents.

## Where things are

| Path | What |
|---|---|
| `MIGRATION-MASTER-PLAN.md` | The spec. Read before touching anything. |
| `src/app/globals.css` | §4 design tokens — palette, type ramp, radius, the one shadow. |
| `src/app/styleguide/` | `/styleguide` — the visual acceptance test for §4. |
| `src/components/ui/` | shadcn primitives, adapted to §4. Header comments say how and why. |
| `src/lib/design-tokens.ts` | §4 as data, for the styleguide. |
| `.env.example` | Every environment variable, with the two known naming quirks documented. |

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in the real values
npm run dev
```

Then open `/styleguide` and check it against §4 of the plan — on a laptop and on
a phone. Verifying in a real browser on a real phone is the owner's job; it is
not something a coding agent can do for you.

## Build status

| Phase | State |
|---|---|
| 0 — Scaffold, tokens, styleguide, app shell | Done |
| 1 — API translation | Not started |
| 2 — Metrics engine + first tests | Not started |
| 3 — Coach loop | Not started |
| 4 — CRM kanban | Not started |
| 5 — Linking & call history | Not started |
| 6 — Scraper | Not started |
| 7 — Dashboard | Not started |
| 8 — Four-states sweep | Not started |
| 9 — Cutover | Not started |

`/coach`, `/leads` and `/dashboard` currently render placeholders naming the
phase that fills them. One phase per branch; do not start a phase until the
previous one is merged (§11).
