import { buildApp } from './app'
import { createOpenAITranslator, setTranslator } from './translate'

const rawPort = process.env.PORT ?? '3000'
const port = Number(rawPort)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`api: invalid PORT "${rawPort}" — set PORT to an integer between 1 and 65535`)
  process.exit(1)
}

// The default translator throws — chat still works with that in place, it
// just shows every reader the original text instead of a translation. Only
// swap in the real OpenAI-backed one when there is a key to use it with.
if (process.env.OPENAI_API_KEY) {
  setTranslator(createOpenAITranslator())
} else {
  console.log('api: OPENAI_API_KEY not set — chat messages will not be translated')
}

const app = await buildApp()
await app.listen({ port, host: '0.0.0.0' })
console.log(`api listening on ${port}`)
