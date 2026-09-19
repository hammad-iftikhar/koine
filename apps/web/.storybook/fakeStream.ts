/**
 * A real MediaStream from a canvas — moving pixels, no camera, no permission
 * prompt. Used by video stories and reused by the Playwright specs.
 */
export function fakeStream(label: string): MediaStream {
  const canvas = Object.assign(document.createElement('canvas'), {
    width: 640,
    height: 360,
  })
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas context unavailable')

  let tick = 0
  setInterval(() => {
    tick += 2
    ctx.fillStyle = `hsl(${tick % 360} 45% 22%)`
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f5f5f7'
    ctx.font = '28px sans-serif'
    ctx.fillText(label, 24, 48)
  }, 40)

  return canvas.captureStream(30)
}
