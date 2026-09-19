import { expect, it, vi } from 'vitest'
import { applyCameraState, applyMicState } from './useLocalDevices'

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
