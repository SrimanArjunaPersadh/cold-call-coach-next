<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cold Call Coach — agent rules

**Read `MIGRATION-MASTER-PLAN.md` at the root before doing anything.** It is the
source of truth. Where it and improvisation disagree, it wins. Per §10, re-read
§1 (design philosophy), §6 (deterministic engine) and §10 (how the owner works)
at the start of every session.

The old app — the thing being translated — lives at
`C:\Users\Administrator\Downloads\PROJECT1\cold-call-coach`. Its `api/*.js`,
scoring schema and metrics math are the behavioural reference for Phase 1+.

## Never

- Invent features. §3's inventory is closed.
- Reopen the scoring schema (§5.1 — frozen, copy verbatim).
- Let the model do arithmetic (§6). JavaScript computes; the model transcribes
  and judges.
- Restyle beyond §4. New treatments go on `/styleguide` first, and only after §4
  is amended.
- Build ahead of the current phase (§11).

## Every change

Deliver (a) the change, (b) exact test/verify steps, (c) exact git commands. The
owner runs the dev server and verifies on a real phone — you cannot reach it, so
always state exactly what to check.

## Pre-merge checklist (§10)

`requireSecret` line one · no email fields · server-side clamps · zero frontend
token lines · four states present · cyan ≤5%.

## Design system quick reference

Tokens live in `src/app/globals.css`. §4's names (`--bg`, `--surface`, `--text`,
`--accent`, `--pass`…) are the source of truth; shadcn's semantic names
(`--background`, `--foreground`, `--primary`…) are wired to them. Components use
Tailwind utilities, never raw hex.

Watch out: shadcn's `--accent` means "subtle hover surface", NOT §4's cyan. Cyan
reaches components through `--primary` and `--ring` only.
