import type { CaptionSegment } from '@koine/shared'
import { ParticipantKind } from 'livekit-client'
import { expect, it } from 'vitest'
import { decodeCaption } from './captions'

const AGENT = { kind: ParticipantKind.AGENT }
const PERSON = { kind: ParticipantKind.STANDARD }

const SEGMENT: CaptionSegment = {
  speakerIdentity: 'p_mariam',
  sourceLang: 'es',
  original: 'Se movió la fecha al viernes.',
  translations: { en: 'The deadline moved to Friday.', ur: 'ڈیڈ لائن جمعہ کو منتقل ہوگئی۔' },
  final: true,
  at: 1_758_000_000_000,
}

/**
 * Exactly what the worker puts on the wire — see the agent's `main.ts`:
 * UTF-8 JSON over the reliable data channel, no topic.
 */
function broadcast(segment: CaptionSegment): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(segment))
}

it('survives the round trip from the worker with every field intact', () => {
  // The only test that crosses the caption boundary: encoded the way the
  // agent encodes, decoded the way the client decodes. A field the schema
  // quietly drops would be a caption rendered from a shape nobody checked.
  expect(decodeCaption(broadcast(SEGMENT), AGENT)).toEqual(SEGMENT)
})

it('carries an interim segment and a speaker with no translation for this room', () => {
  const interim: CaptionSegment = { ...SEGMENT, translations: {}, final: false }
  expect(decodeCaption(broadcast(interim), AGENT)).toEqual(interim)
})

it('refuses a caption from another participant', () => {
  // Every joiner's token carries canPublishData, so this packet is as
  // well-formed as the agent's — it just attributes someone else's words to
  // Mariam. Rendering it would put a fabricated quote on every screen under
  // her name, in a product whose premise is that a translation you cannot
  // audit is one you cannot trust.
  const forged = broadcast({ ...SEGMENT, original: 'I agree to the new terms.' })
  expect(decodeCaption(forged, PERSON)).toBeNull()
})

it('refuses a caption with no sender', () => {
  expect(decodeCaption(broadcast(SEGMENT), undefined)).toBeNull()
})

it('drops bytes that are not JSON without throwing', () => {
  // This runs inside LiveKit's own event emitter; a throw here takes the
  // room's caption listener with it.
  expect(decodeCaption(new Uint8Array([0xff, 0x00, 0x42]), AGENT)).toBeNull()
})

it('drops JSON that is not a caption segment', () => {
  const chatPacket = new TextEncoder().encode(JSON.stringify({ body: 'hello', from: 'p_1' }))
  expect(decodeCaption(chatPacket, AGENT)).toBeNull()
})
