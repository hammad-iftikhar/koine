/** The API's origin. Exported so nothing else has to re-derive it. */
export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    // Without this the class stringifies as a plain "Error" in logs.
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Sessions are cookies. Without this the browser sends none and every
    // request looks signed out.
    credentials: 'include',
    headers: {
      // Only when there is a body to describe. Setting it on a GET makes the
      // request non-simple and costs a CORS preflight on every cold load.
      ...(init?.body === undefined || init.body === null
        ? {}
        : { 'content-type': 'application/json' }),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new ApiError(res.status, body?.message ?? 'Something went wrong. Please try again.')
  }

  return (await res.json()) as T
}
