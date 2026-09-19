import { expect, type Page, test } from '@playwright/test'

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

// /api/me is stubbed rather than served by a live API. With the API down the
// page's state depends on a race between react-query's retries and this
// file's expect timeout, which is flaky at best; and CI runs no API at all.
// Stubbing makes both renders assertable and removes the dependency.
async function stubMe(page: Page, body: unknown) {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

test('a visitor who is not signed in sees a sign-in button, not an error', async ({ page }) => {
  await stubMe(page, { user: null })
  await page.goto('/')

  await expect(page.getByTestId('sign-in')).toBeVisible()
  await expect(page.getByTestId('signed-in')).toHaveCount(0)
})

test('a signed-in visitor sees their email and no sign-in button', async ({ page }) => {
  await stubMe(page, {
    user: { id: 'u1', name: 'Mariam', email: 'mariam@example.com', image: null },
  })
  await page.goto('/')

  await expect(page.getByTestId('signed-in')).toContainText('mariam@example.com')
  await expect(page.getByTestId('sign-in')).toHaveCount(0)
})
