// Route Handler plumbing. The old app's serverless functions wrote to a Node
// `res` object; Route Handlers return a `Response`. These helpers are that
// translation and nothing more — same status codes, same bodies, same headers.
//
// Nothing in here is imported by a client component. Every module under
// src/lib/api is server-only by construction (§9: zero frontend token lines).

/**
 * The old app's `json(res, status, body)`. Note the explicit charset —
 * `Response.json()` omits it, and the old routes always sent it.
 */
export function json(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(headers || {}),
    },
  })
}

/** The old app's `405 + Allow` tail on every handler. */
export function methodNotAllowed(allow: string): Response {
  return json(405, { error: "Method not allowed" }, { allow })
}

/**
 * The old app's `readJson(req)`. Vercel's Node runtime pre-parsed `req.body`;
 * Route Handlers never do, so this is the raw-stream branch only. An empty body
 * is `{}` (as before); malformed JSON throws and the caller's catch turns it
 * into the same 500 the old app returned.
 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

/**
 * The old app's `getQuery(req, key)`. `req.url` is absolute inside a Route
 * Handler, so the old `new URL(req.url, "http://localhost")` fallback and its
 * try/catch are unnecessary — the result is identical.
 */
export function getQuery(req: Request, key: string): string {
  return new URL(req.url).searchParams.get(key) || ""
}

/** `err.message` with the old `|| "fallback"` shape, minus the `any`. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : ""
}
