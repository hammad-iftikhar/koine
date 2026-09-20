/**
 * Translation agent worker — the composition root.
 *
 * Two roles separated by a CaptionSegment message: the transcriber emits, the
 * synthesizer consumes. Both run in this one process in v1 — see spec module 06,
 * "Two roles, one process".
 *
 * Nothing here decides anything. The channel set comes from `room.ts`, the
 * framing from `audio.ts`, the pipeline from `transcriber.ts` and
 * `synthesizer.ts`, and each of those is tested where it lives. This file only
 * says which of them talks to which, and hands the result to LiveKit Agents.
 */
import { fileURLToPath } from 'node:url'
import { TRANSLATION_PREFIX } from '@koine/shared'
import {
  AutoSubscribe,
  cli,
  defineAgent,
  type JobContext,
  ServerOptions,
  WorkerPermissions,
} from '@livekit/agents'
import {
  type AudioFrame,
  AudioStream,
  ParticipantKind,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  RoomEvent,
  TrackSource,
} from '@livekit/rtc-node'
import Redis from 'ioredis'
import postgres from 'postgres'
import { createBus } from './bus'
import { createIngest } from './ingest'
import { createOpenAIClient } from './openai'
import { createChannelState, createRosterLoader } from './room'
import { createSpendTracker } from './spend'
import { createSynthesizer } from './synthesizer'
import { createTranslationTracks } from './tracks'
import { createTranscriber } from './transcriber'

// LIVEKIT_API_KEY and LIVEKIT_API_SECRET are what the framework registers the
// worker with and what it mints each job's token from; OPENAI_API_KEY is what
// the pipeline runs on. Missing any of them is a startup failure, not a
// degradation: without them the worker would join rooms and do nothing.
const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'OPENAI_API_KEY',
] as const

const missing = required.filter((key) => !process.env[key])
if (missing.length > 0) {
  console.error(`agent: missing required environment: ${missing.join(', ')}`)
  process.exit(1)
}

/** What microphone audio is decoded to before it is uploaded for transcription. */
const INGEST_SAMPLE_RATE = 16_000
const INGEST_WINDOW_MS = 4_000

/**
 * How often the channel set is rebuilt regardless of events.
 *
 * Two holes nothing else covers: a first refresh that failed would otherwise
 * leave the room with no channels for its whole life, and a participant
 * switching their hearLang mid-meeting produces no LiveKit event at all. Half
 * a minute is a tolerable wait for a new language and one indexed query per
 * room per 30s is nothing; a tighter interval would buy latency nobody asked
 * for at the cost of a steady query load per live room.
 */
const CHANNEL_REFRESH_MS = 30_000

const client = createOpenAIClient()
const bus = createBus()
const sql = postgres(process.env.DATABASE_URL as string, { max: 4 })
const redis = new Redis(process.env.REDIS_URL as string, { maxRetriesPerRequest: 2 })
const spend = createSpendTracker(redis)
const loadRoster = createRosterLoader(sql)
const channelState = createChannelState({ load: loadRoster })

export default defineAgent({
  entry: async (ctx: JobContext) => {
    // The room name is the meeting's id (plan 04 R22), so it is also the key
    // every module below is scoped by.
    const dispatched = ctx.job.room?.name
    if (!dispatched) throw new Error('agent: dispatched a job with no room name')
    const roomId: string = dispatched

    const transcriber = createTranscriber({
      client,
      bus,
      channels: () => channelState.channels(roomId),
    })
    const tracks = createTranslationTracks(ctx.room)
    const synthesizer = createSynthesizer({
      client,
      bus,
      spend,
      publishAudio: (audio, lang) => tracks.publish(audio, lang),
      // The ceiling is per meeting, so all of the room's languages go at once.
      endChannels: () => tracks.close(),
    })
    const ingest = createIngest({
      loadRoster,
      transcriber,
      sampleRate: INGEST_SAMPLE_RATE,
      windowMs: INGEST_WINDOW_MS,
    })

    // Listeners before connecting: a participant who joins in the gap would
    // otherwise never reach the channel set.
    const refresh = () => void channelState.refresh(roomId)
    ctx.room.on(RoomEvent.ParticipantConnected, refresh)
    ctx.room.on(RoomEvent.ParticipantDisconnected, refresh)
    ctx.room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (publication.source !== TrackSource.SOURCE_MICROPHONE) return
        // Never transcribe another worker's output. `tracks.ts` publishes
        // tr:<lang> *as* a microphone source — LiveKit has no source kind for
        // synthesized speech — so the source check above does not exclude it.
        // Two workers in one room is not hypothetical: it is the failover
        // window, when LiveKit has replaced a partitioned worker that has not
        // died yet. Each would transcribe the other's translation and
        // re-translate it, a feedback loop billed to OpenAI both ways.
        if (participant.kind === ParticipantKind.AGENT) return
        if (publication.name?.startsWith(TRANSLATION_PREFIX)) return
        // Cast because this package compiles with the DOM lib, whose
        // ReadableStream is not typed as async iterable; Node's is, at runtime.
        const frames = new AudioStream(track, {
          sampleRate: INGEST_SAMPLE_RATE,
          numChannels: 1,
        }) as unknown as AsyncIterable<AudioFrame>

        // Translation is an enhancement layer: a failure here is logged and the
        // call carries on untranslated.
        ingest
          .listen(roomId, participant.identity, frames)
          .catch((error) =>
            console.error(`agent: transcription stopped for ${participant.identity}`, error),
          )
      },
    )

    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY)
    await channelState.refresh(roomId)
    const ticker = setInterval(refresh, CHANNEL_REFRESH_MS)

    const detachSynthesizer = synthesizer.attach(roomId)
    // The captions half of the pipeline: every segment the transcriber emits
    // goes out on the reliable data channel as UTF-8 JSON, which is what the
    // web client parses (spec module 06). No topic — the client validates the
    // shape and ignores anything else, so a topic would buy nothing.
    const encoder = new TextEncoder()
    const detachCaptions = bus.subscribe(roomId, (segment) => {
      void ctx.room.localParticipant
        ?.publishData(encoder.encode(JSON.stringify(segment)), { reliable: true })
        .catch((error) => console.error(`agent: caption broadcast failed in ${roomId}`, error))
    })

    ctx.addShutdownCallback(async () => {
      clearInterval(ticker)
      detachCaptions()
      detachSynthesizer()
      channelState.forget(roomId)
      ingest.forget(roomId)
      await tracks.close()
    })
  },
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      // Not hidden, deliberately, and this is the one place the plan could not
      // be followed: LiveKit's own guidance on this option is that "when
      // hidden, it will also not be able to publish tracks to the room as it
      // won't be visible" (docs.livekit.io/agents/server/options). A worker
      // nobody can subscribe to publishes tr:<lang> into the void, so the
      // worker joins visible and the client hides it from the roster instead.
      permissions: new WorkerPermissions(true, true, true, false, [], false),
    }),
  )
}
