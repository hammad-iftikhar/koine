/**
 * How loud the original stays underneath the translated voice.
 *
 * A tunable constant, not a magic number: it is the same convention as
 * simultaneous interpretation, and it becomes a user setting for free.
 */
export const DUCK_GAIN = 0.2

export function createDucker(context: AudioContext) {
  const gain = context.createGain()
  gain.gain.value = 1
  gain.connect(context.destination)

  return {
    attachFloor(stream: MediaStream): void {
      context.createMediaStreamSource(stream).connect(gain)
    },
    setDucked(on: boolean): void {
      gain.gain.value = on ? DUCK_GAIN : 1
    },
  }
}
