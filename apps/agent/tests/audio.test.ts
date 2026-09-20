import { expect, it, vi } from 'vitest'
import { createUtteranceBuffer, wavFromPcm } from '@/audio'

it('wraps PCM in a WAV header that describes the bytes honestly', () => {
  // openai.ts uploads these bytes as audio/wav, so the header has to be real.
  const pcm = Buffer.alloc(320)
  const wav = wavFromPcm(pcm, 16_000, 1)

  expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF')
  expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE')
  expect(wav.readUInt16LE(20)).toBe(1) // uncompressed PCM
  expect(wav.readUInt16LE(22)).toBe(1) // channels
  expect(wav.readUInt32LE(24)).toBe(16_000) // sample rate
  expect(wav.readUInt32LE(28)).toBe(32_000) // byte rate
  expect(wav.readUInt16LE(34)).toBe(16) // bits per sample
  expect(wav.subarray(36, 40).toString('ascii')).toBe('data')
  expect(wav.readUInt32LE(40)).toBe(pcm.length)
  expect(wav.readUInt32LE(4)).toBe(36 + pcm.length)
  expect(wav.length).toBe(44 + pcm.length)
})

it('emits one utterance per full window and holds the remainder', () => {
  const onUtterance = vi.fn()
  const buffer = createUtteranceBuffer({ sampleRate: 1000, windowMs: 100, onUtterance })
  // 100ms at 1kHz mono = 100 samples per window.
  const frame = { data: new Int16Array(60) }

  buffer.push(frame)
  expect(onUtterance).not.toHaveBeenCalled()

  buffer.push(frame)
  expect(onUtterance).toHaveBeenCalledTimes(1)
  expect(onUtterance.mock.calls[0]?.[0].readUInt32LE(40)).toBe(240)

  buffer.push(frame)
  expect(onUtterance).toHaveBeenCalledTimes(1)
})

it('flushes a partial window when the track ends', () => {
  const onUtterance = vi.fn()
  const buffer = createUtteranceBuffer({ sampleRate: 1000, windowMs: 100, onUtterance })

  buffer.push({ data: new Int16Array(10) })
  buffer.flush()

  expect(onUtterance).toHaveBeenCalledTimes(1)
  expect(onUtterance.mock.calls[0]?.[0].readUInt32LE(40)).toBe(20)
})

it('stays quiet when there is nothing buffered to flush', () => {
  const onUtterance = vi.fn()
  createUtteranceBuffer({ sampleRate: 1000, onUtterance }).flush()
  expect(onUtterance).not.toHaveBeenCalled()
})
