/**
 * Translation agent worker.
 *
 * Two roles separated by a CaptionSegment message: the transcriber emits, the
 * synthesizer consumes. Both run in this one process in v1 — see spec module 06,
 * "Two roles, one process".
 */
const required = ['DATABASE_URL', 'REDIS_URL', 'LIVEKIT_URL'] as const

const missing = required.filter((key) => !process.env[key])
if (missing.length > 0) {
  console.error(`agent: missing required environment: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('agent: started, awaiting room dispatch')
