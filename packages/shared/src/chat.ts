import { z } from 'zod'

export const SendMessageBody = z.object({
  participantId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
})

export const ChatMessageDTO = z.object({
  id: z.string(),
  author: z.string(),
  participantId: z.string(),
  body: z.string(),
  lang: z.string(),
  translations: z.record(z.string(), z.string()),
  createdAt: z.string(),
})

export const MessagesResponse = z.object({
  messages: z.array(ChatMessageDTO),
  nextCursor: z.string().nullable(),
})

export type SendMessageBody = z.infer<typeof SendMessageBody>
export type ChatMessageDTO = z.infer<typeof ChatMessageDTO>
export type MessagesResponse = z.infer<typeof MessagesResponse>
