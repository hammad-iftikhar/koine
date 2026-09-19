import { MeResponse } from '@koine/shared'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export function useMe() {
  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => MeResponse.parse(await apiFetch('/api/me')),
    staleTime: 5 * 60 * 1000,
  })
  return { user: query.data?.user ?? null, isLoading: query.isLoading }
}

export function signInWithGoogle(callbackURL = window.location.href): void {
  const url = new URL('/api/auth/sign-in/social', BASE)
  url.searchParams.set('provider', 'google')
  url.searchParams.set('callbackURL', callbackURL)
  window.location.assign(url.toString())
}

export async function signOut(): Promise<void> {
  await apiFetch('/api/auth/sign-out', { method: 'POST', body: '{}' })
  window.location.reload()
}
