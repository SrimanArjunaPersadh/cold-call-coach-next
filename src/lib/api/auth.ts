import { timingSafeEqual } from "node:crypto"
import { json } from "./http"

// Shared-secret gate for a single-user tool on a public URL. Every API route
// calls requireSecret() before doing any work. Fails CLOSED: if APP_SECRET is
// not configured we refuse all requests rather than serving open. The secret
// and the incoming header value are never logged.
//
// Translation note (§9): the old app's requireSecret wrote the failure response
// itself and returned a boolean. A Route Handler cannot write to a response, so
// this returns the failure `Response` (or null to proceed) and callers do:
//   const denied = requireSecret(req)
//   if (denied) return denied
// as the first two lines of every handler.

// Constant-time compare. timingSafeEqual requires equal-length buffers, so a
// length mismatch is a definite fail (checked before the compare).
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(String(provided), "utf8")
  const b = Buffer.from(String(expected), "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** null → the request may proceed. A Response → send it and stop. */
export function requireSecret(req: Request): Response | null {
  const expected = process.env.APP_SECRET
  if (!expected) {
    return json(503, { error: "APP_SECRET not configured" })
  }
  const provided = req.headers.get("x-app-secret")
  if (typeof provided !== "string" || !secretsMatch(provided, expected)) {
    return json(401, { error: "unauthorized" })
  }
  return null
}
