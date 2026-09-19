import { expect, type Page, test } from '@playwright/test'

test('the app loads', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Meetings where nobody switches languages.' }),
  ).toBeVisible()
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

  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New meeting' })).toHaveCount(0)
})

test('a signed-in visitor sees a way to start a meeting and no sign-in button', async ({
  page,
}) => {
  await stubMe(page, {
    user: { id: 'u1', name: 'Mariam', email: 'mariam@example.com', image: null },
  })
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'New meeting' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
})

test('an unknown meeting code is reported, not swallowed', async ({ page }) => {
  await page.goto('/j/aaa-aaaa-aaa')
  await expect(page.getByText('Meeting not found')).toBeVisible()
})

test('a malformed code is rejected before any request is made', async ({ page }) => {
  let calledApi = false
  // Fails the test the moment validation regresses into making a network
  // call, rather than trusting the assertion below to notice indirectly.
  await page.route('**/api/meetings/**', (route) => {
    calledApi = true
    return route.abort()
  })

  await page.goto('/')
  await page.getByLabel('Meeting code or link').fill('nope')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByRole('alert')).toContainText(/does not look like a meeting code/i)
  expect(calledApi).toBe(false)
})
