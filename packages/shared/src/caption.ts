import { z } from 'zod'

export const CaptionSegment = z.object({
  speakerIdentity: z.string(),
  sourceLang: z.string(),
  /** What was actually said. Always carried, always rendered above the translation. */
  original: z.string(),
  /** language code → translated text. One entry per active channel. */
  translations: z.record(z.string(), z.string()),
  /** Interim results update the current line; final commits it. */
  final: z.boolean(),
  at: z.number(),
})

export type CaptionSegment = z.infer<typeof CaptionSegment>
