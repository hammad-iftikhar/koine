import { expect, test } from '@playwright/test'

test('the app loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-title')).toHaveText('Koine')
})

test('fake media devices are available to two independent contexts', async ({ browser }) => {
  // The two-context pattern every later media test is built on: two real
  // browsers, each with its own synthetic camera and microphone.
  const alice = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const bob = await browser.newContext({ permissions: ['camera', 'microphone'] })

  try {
    for (const [name, context] of [
      ['alice', alice],
      ['bob', bob],
    ] as const) {
      const page = await context.newPage()
      await page.goto('/')

      const trackKinds = await page.evaluate(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        const kinds = stream
          .getTracks()
          .map((t) => t.kind)
          .sort()
        for (const track of stream.getTracks()) track.stop()
        return kinds
      })

      expect(trackKinds, `${name} should get both tracks`).toEqual(['audio', 'video'])
    }
  } finally {
    await alice.close()
    await bob.close()
  }
})
