import type { ChatMessageDTO } from '@koine/shared'
import { expect, it } from 'vitest'
import { decodeChatMessage } from './chat-messages'

const MESSAGE: ChatMessageDTO = {
  id: 'm_1',
  author: 'Mariam',
  participantId: 'p_mariam',
  body: 'Puedo explicarlo en un minuto.',
  lang: 'es',
  translations: { en: 'I can explain it in a minute.' },
  createdAt: '2026-09-18T00:00:00.000Z',
}

/** Exactly what `RoomChat` puts on the wire: UTF-8 JSON, no topic filtering here. */
function broadcast(message: ChatMessageDTO): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message))
}

it('accepts a packet whose sender matches the participantId inside it', () => {
  expect(decodeChatMessage(broadcast(MESSAGE), { identity: 'p_mariam' })).toEqual(MESSAGE)
})

it('refuses a packet whose participantId does not match the sender', () => {
  // Every joiner's token carries canPublishData, so this packet is as
  // well-formed as Mariam's own — it just claims to be from her while
  // actually arriving from somebody else's connection.
  const forged = { ...MESSAGE, body: 'I agree to the new terms.' }
  expect(decodeChatMessage(broadcast(forged), { identity: 'p_someone_else' })).toBeUndefined()
})

it('refuses a packet with no sender', () => {
  expect(decodeChatMessage(broadcast(MESSAGE), undefined)).toBeUndefined()
})

it('refuses JSON that is not a well-shaped ChatMessageDTO', () => {
  const notAMessage = new TextEncoder().encode(JSON.stringify({ speakerIdentity: 'p_1' }))
  expect(decodeChatMessage(notAMessage, { identity: 'p_1' })).toBeUndefined()
})

it('drops bytes that are not JSON without throwing', () => {
  // This runs inside LiveKit's own event emitter; a throw here takes the
  // room's chat listener with it.
  expect(decodeChatMessage(new Uint8Array([0xff, 0x00, 0x42]), { identity: 'p_1' })).toBeUndefined()
})
