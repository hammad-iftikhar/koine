import { TRANSLATION_PREFIX } from '@koine/shared'
import { AudioByteStream } from '@livekit/agents'
import {
  type AudioFrame,
  AudioSource,
  LocalAudioTrack,
  type LocalParticipant,
  type Room,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node'

/**
 * Everything the worker sends back into the room as audio: one track per
 * target language, named `tr:<lang>`.
 *
 * The FFI is reached through one seam — a {@link ChannelFactory} — so the
 * policy above it is ordinary logic and is tested as such in `tracks.test.ts`:
 * one source per language, per-language serialization, eviction of a failed
 * publish, the backlog ceiling, and a close that stays closed. Only
 * {@link liveKitChannels} itself talks to the SDK, and even the part of it
 * that matters — unpublish before close — is lifted into {@link channelFrom}
 * so a fake participant can prove it happens. That is the same split as
 * `audio.ts` and `ingest.ts`.
 */

/**
 * The format `openai.ts` asks OpenAI's speech endpoint for: 24 kHz, mono,
 * 16-bit signed little-endian, headerless. Nothing in the bytes says so, so
 * this constant and the comment on `response_format: 'pcm'` are the contract.
 */
export const TTS_SAMPLE_RATE = 24_000
const TTS_CHANNELS = 1
const BYTES_PER_SAMPLE = 2

/**
 * How much of a language's audio may already be waiting before a new segment
 * is dropped rather than queued, in milliseconds.
 *
 * The spec's latency table spends about 1.4 s of its 1.5 s target on the
 * pipeline itself (capture 150 + recognition 400 + translation 300 + synthesis
 * 400 + delivery 150), which leaves roughly 1.1 s of slack under the 2.5 s
 * hard ceiling — past which, in the spec's words, the product stops being a
 * conversation. A segment that would sit longer than that behind the chain has
 * already spent that slack before it is heard, so it is better skipped than
 * played late: synthesized speech routinely outruns its 4 s source window, and
 * with nothing to shed the chain drifts by the difference on every window and
 * never recovers. Dropping lets it drain back to live.
 */
const MAX_BACKLOG_MS = 1_000

/** Just enough of `AudioSource` for the playback chain. */
export type Source = {
  /** Milliseconds accepted by the SDK but not yet played out. */
  readonly queuedDuration: number
  captureFrame(frame: AudioFrame): Promise<void>
  close(): Promise<void>
}

/** One live `tr:<lang>` channel: where frames go, and how to take it down. */
export type Channel = {
  readonly queuedDuration: number
  captureFrame(frame: AudioFrame): Promise<void>
  close(): Promise<void>
}

export type ChannelFactory = (lang: string) => Promise<Channel>

/** How long `audio` plays for, at the format `openai.ts` asks for. */
function durationMs(audio: Buffer): number {
  return (audio.length / (TTS_SAMPLE_RATE * TTS_CHANNELS * BYTES_PER_SAMPLE)) * 1000
}

/**
 * Wraps a published track as a {@link Channel}.
 *
 * `close()` unpublishes *before* releasing the source, and that order is the
 * whole point of this function. `AudioSource.close()` clears its timeout,
 * releases its waiter and disposes the FFI handle — it does not touch the
 * publication. Closing the source alone leaves `tr:<lang>` published,
 * subscribed and unmuted, so no `TrackUnpublished` and no `TrackMuted` reaches
 * the client, `syncAudio` still sees a live translation track, and the floor
 * stays ducked to 20% under a channel that will never speak again.
 *
 * `unpublishTrack(sid, stopOnUnpublish)` is `@livekit/rtc-node`'s real
 * signature; the second argument becomes `UnpublishTrackRequest.stopOnUnpublish`
 * and defaults to `true`. It asks the FFI to *stop* the track on the way out
 * rather than keep it alive for a later republish, which is exactly what is
 * wanted here — nothing republishes a channel this worker has torn down.
 */
export function channelFrom(
  local: Pick<LocalParticipant, 'unpublishTrack'>,
  publication: { sid?: string },
  source: Source,
): Channel {
  return {
    get queuedDuration() {
      return source.queuedDuration
    },
    captureFrame: (frame) => source.captureFrame(frame),
    async close() {
      const sid = publication.sid
      // A publication with no sid was never acknowledged by the server, so
      // there is nothing to unpublish and the source is all there is to free.
      if (sid) await local.unpublishTrack(sid, true)
      await source.close()
    },
  }
}

/** The real factory: publishes a `tr:<lang>` track and hands back its channel. */
export function liveKitChannels(room: Room): ChannelFactory {
  return async (lang: string) => {
    const local = room.localParticipant
    // Publishing before the room is connected would hand back a source
    // that swallows audio into a track nobody ever sees.
    if (!local) {
      throw new Error(`tracks: cannot publish ${TRANSLATION_PREFIX}${lang}, room is not connected`)
    }

    const source = new AudioSource(TTS_SAMPLE_RATE, TTS_CHANNELS)
    const track = LocalAudioTrack.createAudioTrack(`${TRANSLATION_PREFIX}${lang}`, source)
    const publication = await local.publishTrack(
      track,
      new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
    )
    return channelFrom(local, publication, source)
  }
}

export function createTranslationTracks(room: Room) {
  return createTrackPublisher(liveKitChannels(room))
}

export function createTrackPublisher(openChannel: ChannelFactory) {
  // Keyed by language, holding the in-flight open rather than the settled
  // channel: two segments for the same language can arrive together, and two
  // tracks named tr:es would be two half-conversations.
  const channels = new Map<string, Promise<Channel>>()
  // The settled ones, so the backlog check below can read `queuedDuration`
  // without awaiting anything.
  const live = new Map<string, Channel>()
  // Also keyed by language: the tail of that language's playback chain. One
  // source plays one thing at a time, so two overlapping utterances must
  // queue rather than interleave their frames into gibberish.
  const playing = new Map<string, Promise<void>>()
  // Milliseconds handed to a language's chain that it has not started on yet.
  // This is the quantity that diverges: `queuedDuration` only ever reports
  // what the SDK has already accepted, which the FFI caps at its own queue
  // size, so it cannot see a chain ten utterances deep.
  const waiting = new Map<string, number>()
  let closed = false

  function channelFor(lang: string): Promise<Channel> {
    const existing = channels.get(lang)
    if (existing) return existing

    const created: Promise<Channel> = openChannel(lang).then((channel) => {
      // Opened into a publisher that has already been torn down — close()
      // took its snapshot before this one existed. Take it straight back down
      // rather than leaving tr:<lang> published with nothing holding it. The
      // throw is what stops close()'s own snapshot from closing it twice: it
      // awaits this same promise, and a rejected one has no channel to close.
      if (closed) {
        return channel.close().then<Channel>(() => {
          throw new Error(`tracks: ${TRANSLATION_PREFIX}${lang} was closed while publishing`)
        })
      }
      live.set(lang, channel)
      return channel
    })

    channels.set(lang, created)
    // A transient publish failure must not cache itself: without this, every
    // later segment in this language re-awaits the same rejection forever.
    created.catch(() => {
      if (channels.get(lang) === created) channels.delete(lang)
    })

    return created
  }

  async function play(audio: Buffer, lang: string): Promise<void> {
    const channel = await channelFor(lang)
    const stream = new AudioByteStream(TTS_SAMPLE_RATE, TTS_CHANNELS)
    for (const frame of stream.write(audio)) await channel.captureFrame(frame)
    for (const frame of stream.flush()) await channel.captureFrame(frame)
  }

  return {
    /** Plays one synthesized segment, after anything already queued for its language. */
    publish(audio: Buffer, lang: string): Promise<void> {
      // Closed stays closed. Segment A's synthesis can still be in flight when
      // segment B trips the spend ceiling and closes everything; without this
      // A would come back, find no channel, publish a *second* tr:<lang>, and
      // the client — which matches by name — would render both.
      if (closed) return Promise.resolve()

      const backlog = (waiting.get(lang) ?? 0) + (live.get(lang)?.queuedDuration ?? 0)
      if (backlog > MAX_BACKLOG_MS) {
        console.warn(
          `tracks: dropping ${TRANSLATION_PREFIX}${lang} segment, ${Math.round(backlog)}ms already queued`,
        )
        return Promise.resolve()
      }

      const pending = durationMs(audio)
      waiting.set(lang, (waiting.get(lang) ?? 0) + pending)

      const queued = (playing.get(lang) ?? Promise.resolve()).then(() => {
        waiting.set(lang, Math.max((waiting.get(lang) ?? 0) - pending, 0))
        if (closed) return
        return play(audio, lang)
      })
      // The chain keeps going after a failure; the caller still sees this one reject.
      playing.set(
        lang,
        queued.catch(() => {}),
      )
      return queued
    },

    async close(): Promise<void> {
      // Set before anything is cleared, so an in-flight publish that returns
      // mid-teardown is refused rather than racing the clear.
      closed = true
      const pending = [...channels.values()]
      channels.clear()
      playing.clear()
      waiting.clear()
      live.clear()
      await Promise.allSettled(pending.map(async (channel) => (await channel).close()))
    },
  }
}
