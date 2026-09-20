import OpenAI from 'openai'

export type TextTranslator = {
  translate(text: string, from: string, to: string[]): Promise<Record<string, string>>
}

let translator: TextTranslator = {
  async translate() {
    throw new Error('translator not configured')
  },
}

export function setTranslator(next: TextTranslator): void {
  translator = next
}

export function getTranslator(): TextTranslator {
  return translator
}

/**
 * The real implementation, mirroring apps/agent/src/openai.ts's `translate`:
 * one chat-completions call covering every target language (a call per
 * target multiplies cost by language count for no benefit), the same
 * OPENAI_TRANSLATE_MODEL env var and default, and the same defensive parse
 * — a malformed or partial response drops the offending target rather than
 * throwing, so one bad reply never takes the whole request down.
 */
export function createOpenAITranslator(): TextTranslator {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const client = new OpenAI({ apiKey })
  const translateModel = process.env.OPENAI_TRANSLATE_MODEL ?? 'gpt-5.6-luna'

  return {
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
  }
}
