import OpenAI, { toFile } from 'openai'

/**
 * The seam that keeps OpenAI out of every test. The real client is
 * constructed once at startup; tests pass a stub with the same shape.
 *
 * The cascade pipeline (STT -> translate -> TTS) was chosen over OpenAI's
 * speech-to-speech path because the Task 1 latency spike could not be run —
 * no API key and no real recorded speech fixtures were available at
 * implementation time. See spec module 06, "Latency budget" /
 * "Measurement outcome".
 *
 * Model names are NOT hardcoded from any document — they come from
 * environment variables (OPENAI_STT_MODEL, OPENAI_TRANSLATE_MODEL,
 * OPENAI_TTS_MODEL), with defaults chosen by checking the current OpenAI
 * model catalogue at implementation time rather than inheriting a name from
 * a document written earlier:
 *
 * - OPENAI_STT_MODEL default `gpt-transcribe` — OpenAI's current recommended
 *   file-transcription model, replacing whisper-1 / gpt-4o-transcribe
 *   (deprecated Aug 2026, removed Feb 2027).
 * - OPENAI_TRANSLATE_MODEL default `gpt-5.6-luna` — the cost-optimized
 *   variant of the current GPT-5.6 family, sized for a high-volume,
 *   per-utterance call rather than the flagship `gpt-5.6` (Sol) alias.
 * - OPENAI_TTS_MODEL default `gpt-4o-mini-tts` — OpenAI's current
 *   text-to-speech model.
 *
 * Record the values actually used alongside the latency numbers when the
 * spike is finally run (spec module 06, "Measurement outcome").
 */
export type TranslationClient = {
  transcribe(audio: Buffer, sourceLang: string): Promise<string>
  translate(text: string, from: string, to: string[]): Promise<Record<string, string>>
  synthesize(text: string, lang: string): Promise<Buffer>
}

export function createOpenAIClient(): TranslationClient {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const client = new OpenAI({ apiKey })

  const sttModel = process.env.OPENAI_STT_MODEL ?? 'gpt-transcribe'
  const translateModel = process.env.OPENAI_TRANSLATE_MODEL ?? 'gpt-5.6-luna'
  const ttsModel = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts'

  return {
    async transcribe(audio, sourceLang) {
      const file = await toFile(audio, 'audio.wav', { type: 'audio/wav' })
      const transcription = await client.audio.transcriptions.create({
        file,
        model: sttModel,
        language: sourceLang,
      })
      return transcription.text
    },

    // One call for every target language — a call per target multiplies
    // cost by the language count for no benefit.
    async translate(text, from, to) {
      if (to.length === 0) return {}

      const schema = {
        type: 'object',
        properties: Object.fromEntries(to.map((lang) => [lang, { type: 'string' }])),
        required: to,
        additionalProperties: false,
      }

      const completion = await client.chat.completions.create({
        model: translateModel,
        messages: [
          {
            role: 'system',
            content:
              'You translate spoken meeting captions. Given source text and a ' +
              'list of target language codes, return a JSON object keyed by ' +
              'language code with the translation into each. Preserve meaning ' +
              'and register; do not add commentary.',
          },
          {
            role: 'user',
            content: `Source language: ${from}\nTarget languages: ${to.join(', ')}\nText: ${text}`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'translations', strict: true, schema },
        },
      })

      const content = completion.choices[0]?.message?.content
      if (!content) return {}

      // Parse defensively: a malformed or partial response must not throw
      // an unhandled error that takes the room down. Any target the model
      // omitted, or returned as something other than a string, is simply
      // absent from the result rather than present with junk.
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        return {}
      }

      if (typeof parsed !== 'object' || parsed === null) return {}

      const result: Record<string, string> = {}
      for (const lang of to) {
        const value = (parsed as Record<string, unknown>)[lang]
        if (typeof value === 'string' && value.trim()) result[lang] = value
      }
      return result
    },

    async synthesize(text, lang) {
      const speech = await client.audio.speech.create({
        model: ttsModel,
        input: text,
        voice: 'alloy',
        instructions: `Speak naturally in ${lang}.`,
      })
      const arrayBuffer = await speech.arrayBuffer()
      return Buffer.from(arrayBuffer)
    },
  }
}
