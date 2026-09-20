import { z } from 'zod'
import { FLOOR, LANGUAGES, type LanguageCode } from './languages'

const langCodes = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]]

/**
 * A listening target: either a real language code or `FLOOR`, the sentinel
 * for "original audio, no translation". Shared so every place that accepts a
 * listening language from an untrusted caller — join's body, chat history's
 * `?hear=` — validates against the exact same set rather than each reaching
 * for its own ad hoc check.
 */
export const HearLang = z.union([z.literal(FLOOR), z.enum(langCodes)])

export const CreateMeetingBody = z.object({
  title: z.string().trim().max(120).optional(),
  floorLang: z.enum(langCodes).default('en'),
})

export const JoinMeetingBody = z.object({
  displayName: z.string().trim().min(1).max(60),
  speakLang: z.enum(langCodes),
  hearLang: HearLang,
})

export const MeetingResponse = z.object({
  code: z.string(),
  title: z.string().nullable(),
  floorLang: z.string(),
  ended: z.boolean(),
  participants: z.array(z.object({ id: z.string(), displayName: z.string() })),
})

export const JoinResponse = z.object({
  livekitToken: z.string(),
  livekitUrl: z.string(),
  identity: z.string(),
  participantId: z.string(),
  guestToken: z.string().nullable(),
  /**
   * Read back out of the row the join just wrote, not taken from the
   * client's own state: the row is authoritative and survives a refresh,
   * and a second stored key would be more state carrying less truth. It is
   * what the client subscribes its one `tr:<lang>` channel by, and it is
   * the same row the agent builds the channel set from.
   */
  hearLang: z.string(),
})

export const CreateMeetingResponse = z.object({
  code: z.string(),
})

export type HearLang = z.infer<typeof HearLang>
export type CreateMeetingBody = z.infer<typeof CreateMeetingBody>
export type JoinMeetingBody = z.infer<typeof JoinMeetingBody>
export type MeetingResponse = z.infer<typeof MeetingResponse>
export type JoinResponse = z.infer<typeof JoinResponse>
export type CreateMeetingResponse = z.infer<typeof CreateMeetingResponse>
