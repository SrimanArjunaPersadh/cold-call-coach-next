// Server-side Supabase access, service-role. This module must never be imported
// from a client component — the key it reads would ship to the browser (§9:
// "Service-role client exists server-side only; zero frontend lines carry any
// token"). Route Handlers only.

const DEFAULT_BUCKET = "recordings"
const DEFAULT_USER_ID = "solo"

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export function getBucket(): string {
  return process.env.SUPABASE_RECORDINGS_BUCKET || DEFAULT_BUCKET
}

/**
 * The `user_id` every query in every route clamps to (§9). One place, so a
 * route physically cannot forget it the way five copied constants could.
 */
export function getUserId(): string {
  return process.env.PHASE1_USER_ID || DEFAULT_USER_ID
}

export async function supabaseFetch<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const url = requireEnv("SUPABASE_URL").replace(/\/$/, "")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const res = await fetch(`${url}${path}`, {
    ...options,
    // Next patches fetch. The old app talked to PostgREST over bare Node fetch
    // and always saw live rows; this keeps that true no matter what the
    // framework's caching defaults do next.
    cache: "no-store",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      ...(options.headers || {}),
    },
  })

  const text = await res.text()
  const body: unknown = text ? JSON.parse(text) : null
  if (!res.ok) {
    const err = (body || {}) as {
      message?: string
      error?: string
      msg?: string
    }
    const message = err.message || err.error || err.msg
    throw new Error(message || `Supabase request failed: ${res.status}`)
  }
  return body as T
}

export function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/")
}
