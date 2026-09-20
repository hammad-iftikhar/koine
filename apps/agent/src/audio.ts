/**
 * The format seam between LiveKit and the TranslationClient.
 *
 * LiveKit hands the worker raw PCM frames; `openai.ts` uploads what it is given
 * as `audio.wav` with content type `audio/wav`. Naked PCM under a WAV label is
 * a lie the STT endpoint would have to guess its way through, so the bytes get
 * a real RIFF header here before they leave for OpenAI.
 *
 * Deliberately free of LiveKit and OpenAI imports: this file is pure, so its
 * tests need neither a native binding nor a network.
 */

const BYTES_PER_SAMPLE = 2
const HEADER_BYTES = 44

/** Wraps 16-bit little-endian PCM in a RIFF/WAVE header. */
export function wavFromPcm(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const header = Buffer.alloc(HEADER_BYTES)
  const byteRate = sampleRate * channels * BYTES_PER_SAMPLE

  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(HEADER_BYTES - 8 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16) // PCM fmt chunk length
  header.writeUInt16LE(1, 20) // 1 = uncompressed PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(channels * BYTES_PER_SAMPLE, 32) // block align
  header.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}

/**
 * Collects audio frames into fixed windows and emits each as a WAV buffer.
 *
 * Fixed windows, not voice activity detection: VAD would need the Silero
 * plugin and its model download, which is more than this task carries. The
 * cost is that an utterance can be cut mid-sentence at a window boundary.
 */
export function createUtteranceBuffer(opts: {
  sampleRate: number
  channels?: number
  windowMs?: number
  onUtterance: (wav: Buffer) => void
}) {
  const channels = opts.channels ?? 1
  const windowMs = opts.windowMs ?? 4000
  const windowBytes = Math.round((opts.sampleRate * windowMs) / 1000) * channels * BYTES_PER_SAMPLE

  let pending: Buffer[] = []
  let pendingBytes = 0

  function emit(): void {
    if (pendingBytes === 0) return
    const pcm = Buffer.concat(pending)
    pending = []
    pendingBytes = 0
    opts.onUtterance(wavFromPcm(pcm, opts.sampleRate, channels))
  }

  return {
    push(frame: { data: Int16Array }): void {
      pending.push(Buffer.copyBytesFrom(frame.data))
      pendingBytes += frame.data.byteLength
      if (pendingBytes >= windowBytes) emit()
    },

    /** Emits whatever is left, for when a track ends mid-window. */
    flush: emit,
  }
}
