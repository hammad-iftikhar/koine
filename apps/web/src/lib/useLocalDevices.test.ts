// @vitest-environment jsdom
// jsdom because the direction-gate tests render the hook. The `unit` project
// runs in Node by default (see vite.config.ts); perf.test.ts sets the same
// override for the same reason.
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { applyCameraState, applyMicState, useLocalDevices } from './useLocalDevices'

function fakeRoom() {
  const setMicrophoneEnabled = vi.fn(async () => {})
  const setCameraEnabled = vi.fn(async () => {})
  const unpublishTrack = vi.fn(async () => {})
  return {
    room: { localParticipant: { setMicrophoneEnabled, setCameraEnabled, unpublishTrack } },
    setMicrophoneEnabled,
    setCameraEnabled,
    unpublishTrack,
  }
}

it('mutes by disabling the track, not by unpublishing it', async () => {
  // Unpublishing tears down the subscription for every other participant and
  // shows a visible flicker on their screens. Disabling is silent.
  const f = fakeRoom()
  await applyMicState(f.room as never, false)

  expect(f.setMicrophoneEnabled).toHaveBeenCalledWith(false)
  expect(f.unpublishTrack).not.toHaveBeenCalled()
})

it('turns the camera off by disabling the track', async () => {
  const f = fakeRoom()
  await applyCameraState(f.room as never, false)
  expect(f.setCameraEnabled).toHaveBeenCalledWith(false)
  expect(f.unpublishTrack).not.toHaveBeenCalled()
})

it('is a no-op without a room rather than throwing', async () => {
  await expect(applyMicState(undefined, true)).resolves.toBeUndefined()
})

/**
 * A room that mutes in place, the way LiveKit does: `setMicrophoneEnabled`
 * flips `isMuted` on the publication that is already there and hands back the
 * same publication, wrapping the same track. Republishing would produce new
 * objects and go through publish/unpublish, so object identity across a toggle
 * is a direct assertion that we took the mute path.
 */
function mutingRoom() {
  const mediaStreamTrack = { id: 'mst-1' }
  const track = { mediaStreamTrack }
  const publication = { trackSid: 'TR_1', track, isMuted: false }
  const publishTrack = vi.fn(async () => publication)
  const unpublishTrack = vi.fn(async () => {})
  const setMicrophoneEnabled = vi.fn(async (on: boolean) => {
    publication.isMuted = !on
    return publication
  })
  return {
    room: { localParticipant: { setMicrophoneEnabled, publishTrack, unpublishTrack } },
    publication,
    publishTrack,
    unpublishTrack,
    setMicrophoneEnabled,
  }
}

it('keeps the publication and its track identical across a mute toggle', async () => {
  // The spec's test for the branch's central constraint: toggling mute
  // enables/disables rather than republishing. Republishing flickers on every
  // other participant's screen, which is exactly what an SFU should never do
  // for something as ordinary as a mute.
  const f = mutingRoom()
  const before = f.publication
  const trackBefore = f.publication.track
  const mediaBefore = f.publication.track.mediaStreamTrack

  await applyMicState(f.room as never, false)
  expect(f.publication.isMuted).toBe(true)
  await applyMicState(f.room as never, true)
  expect(f.publication.isMuted).toBe(false)

  expect(f.publication).toBe(before)
  expect(f.publication.track).toBe(trackBefore)
  expect(f.publication.track.mediaStreamTrack).toBe(mediaBefore)
  expect(f.publishTrack).not.toHaveBeenCalled()
  expect(f.unpublishTrack).not.toHaveBeenCalled()
})

/** A room whose device calls reject on demand, to drive the rollback gate. */
function failingRoom() {
  const state = { fail: false }
  const reject = async () => {
    if (state.fail) throw new Error('device call failed')
  }
  return {
    state,
    room: {
      localParticipant: {
        setMicrophoneEnabled: vi.fn(reject),
        setCameraEnabled: vi.fn(reject),
      },
    },
  }
}

it('leaves the indicator muted when the mute itself fails', async () => {
  // The silent-unmute guard. Rolling a failed mute back to "live" tells the
  // user they are being heard when the only thing we know is that the call
  // errored — the one failure mode this hook exists to prevent.
  const f = failingRoom()
  const { result } = renderHook(() => useLocalDevices())
  expect(result.current.micOn).toBe(true)

  f.state.fail = true
  await act(async () => {
    await result.current.toggleMic(f.room as never)
  })

  expect(result.current.micOn).toBe(false)
})

it('rolls back to muted when the unmute fails', async () => {
  // The other direction, where rollback is safe: reverting a failed unmute
  // only ever lands back on muted, which is the state the user is already in.
  const f = failingRoom()
  const { result } = renderHook(() => useLocalDevices())

  await act(async () => {
    await result.current.toggleMic(f.room as never)
  })
  expect(result.current.micOn).toBe(false)

  f.state.fail = true
  await act(async () => {
    await result.current.toggleMic(f.room as never)
  })

  expect(result.current.micOn).toBe(false)
})

it('leaves the camera off when turning it off fails', async () => {
  // Same gate on the camera: a failed camera-off must not flick the preview
  // back on for everyone else.
  const f = failingRoom()
  const { result } = renderHook(() => useLocalDevices())

  f.state.fail = true
  await act(async () => {
    await result.current.toggleCamera(f.room as never)
  })

  expect(result.current.cameraOn).toBe(false)
})

it('rolls back to camera off when turning it on fails', async () => {
  const f = failingRoom()
  const { result } = renderHook(() => useLocalDevices())

  await act(async () => {
    await result.current.toggleCamera(f.room as never)
  })
  expect(result.current.cameraOn).toBe(false)

  f.state.fail = true
  await act(async () => {
    await result.current.toggleCamera(f.room as never)
  })

  expect(result.current.cameraOn).toBe(false)
})
