import { MeResponse } from '@koine/shared'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'

export function useMe() {
  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => MeResponse.parse(await apiFetch('/api/me')),
    staleTime: 5 * 60 * 1000,
  })
  return { user: query.data?.user ?? null, isLoading: query.isLoading }
}

/**
 * The app has no toast surface yet, so this is the failure path: say what
 * broke and what to do about it, rather than leaving a dead button and an
 * unhandled rejection in the console.
 */
function reportFailure(whatFailed: string, error: unknown): void {
  console.error(`${whatFailed} failed`, error)
  const detail = error instanceof Error ? error.message : 'Something went wrong.'
  window.alert(`Could not ${whatFailed}. ${detail} Please check your connection and try again.`)
}

export async function signInWithGoogle(callbackURL = window.location.href): Promise<void> {
  try {
    // A POST, not a navigation: /api/auth/sign-in/social is POST-only, so
    // sending the browser there with a GET lands on a blank 404. The response
    // carries the Google URL to hand the browser instead.
    const { url } = await apiFetch<{ url?: string; redirect?: boolean }>(
      '/api/auth/sign-in/social',
      { method: 'POST', body: JSON.stringify({ provider: 'google', callbackURL }) },
    )
    if (!url) throw new Error('The server did not return a sign-in link.')
    window.location.assign(url)
  } catch (error) {
    reportFailure('start sign-in with Google', error)
  }
}

export async function signOut(): Promise<void> {
  try {
    await apiFetch('/api/auth/sign-out', { method: 'POST', body: '{}' })
  } catch (error) {
    reportFailure('sign out', error)
    return
  }
  window.location.reload()
}
