import { type JoinMeetingBody, JoinResponse, MeetingResponse } from '@koine/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'

export function useMeeting(code: string | undefined) {
  return useQuery({
    queryKey: ['meeting', code],
    enabled: Boolean(code),
    retry: false,
    queryFn: async () => MeetingResponse.parse(await apiFetch(`/api/meetings/${code}`)),
  })
}

export function useCreateMeeting() {
  return useMutation({
    mutationFn: async () =>
      (
        await apiFetch<{ code: string }>('/api/meetings', {
          method: 'POST',
          body: JSON.stringify({ floorLang: 'en' }),
        })
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
