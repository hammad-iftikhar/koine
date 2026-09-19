import {
  CreateMeetingResponse,
  type JoinMeetingBody,
  JoinResponse,
  MeetingResponse,
} from '@koine/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'

export function useMeeting(code: string | undefined) {
  return useQuery({
    queryKey: ['meeting', code],
    enabled: Boolean(code),
    retry: false,
    // The lookup route is rate-limited per IP (10/60s). Without this, alt-tabbing
    // back to the pre-join screen refetches on window focus and spends the same
    // bucket a legitimate join attempt needs.
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    queryFn: async () => MeetingResponse.parse(await apiFetch(`/api/meetings/${code}`)),
  })
}

export function useCreateMeeting() {
  return useMutation({
    mutationFn: async () =>
      CreateMeetingResponse.parse(
        await apiFetch('/api/meetings', {
          method: 'POST',
          body: JSON.stringify({ floorLang: 'en' }),
        }),
      ).code,
  })
}

export function useJoinMeeting(code: string) {
  return useMutation({
    mutationFn: async (body: JoinMeetingBody) =>
      JoinResponse.parse(
        await apiFetch(`/api/meetings/${code}/join`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
  })
}
