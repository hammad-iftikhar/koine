import { type Browser, expect, type Page, test } from '@playwright/test'

const API = process.env.VITE_API_URL ?? 'http://localhost:3000'

async function createMeeting(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post(`${API}/api/meetings`, {
    data: { floorLang: 'en' },
    headers: { 'x-test-user': 'u_e2e_host' },
  })
  expect(res.ok(), 'meeting creation must succeed').toBeTruthy()
  return (await res.json()).code as string
}

async function join(browser: Browser, code: string, name: string): Promise<Page> {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const page = await context.newPage()

  await page.goto(`/j/${code}`)
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Join now' }).click()
  await expect(page).toHaveURL(new RegExp(`/m/${code}`))

  return page
}

test.describe('a real call between two browsers', () => {
  test('each participant renders the other', async ({ browser, request }) => {
    const code = await createMeeting(request)

    const alice = await join(browser, code, 'Alice')
    const bob = await join(browser, code, 'Bob')

    // The assertion the whole architecture exists to make true: media crossed
    // the SFU and arrived somewhere else.
    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })

    await alice.close()
    await bob.close()
  })

  test('muting shows on the other side', async ({ browser, request }) => {
    const code = await createMeeting(request)
    const alice = await join(browser, code, 'Alice')
    const bob = await join(browser, code, 'Bob')

    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })
    await alice.getByLabel('Mute microphone').click()

    // Bob sees Alice's tile carry the mute indicator. Two indicators exist on
    // Bob's screen (his own and Alice's), so scope to her tile.
    const aliceTile = bob.getByTestId('participant-tile').filter({ hasText: 'Alice' })
    await expect(aliceTile.getByLabel('Microphone off')).toBeVisible({ timeout: 10_000 })

    await alice.close()
    await bob.close()
  })

  test('a screen share appears for the other participant', async ({ browser, request }) => {
    test.skip(
      process.platform === 'darwin',
      'getDisplayMedia needs a macOS Screen Recording grant for the Playwright Chromium binary, which CI (Linux) does not need. Grant it in System Settings > Privacy & Security > Screen Recording to run this locally.',
    )

    const code = await createMeeting(request)
    const alice = await join(browser, code, 'Alice')
    const bob = await join(browser, code, 'Bob')

    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })
    await alice.getByLabel('Present now').click()

    await expect(bob.getByTestId('screen-share-tile')).toBeVisible({ timeout: 15_000 })
    await expect(bob.getByText('Alice is presenting')).toBeVisible()

    await alice.close()
    await bob.close()
  })
})
