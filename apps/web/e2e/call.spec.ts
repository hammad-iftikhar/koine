import { type Browser, expect, type Page, test } from '@playwright/test'

/**
 * Leave ~60s between consecutive runs of this file.
 *
 * `GET /api/meetings/:code` is rate limited to 10 lookups per 60s per IP
 * (`LOOKUP_LIMIT` in `apps/api/src/routes/meetings.ts`), and every browser here
 * reaches the API as the same Docker gateway address, so the whole file shares
 * one bucket. One run spends 6 of the 10 — three tests, two browsers each, one
 * pre-join lookup apiece (measured: the bucket reads 6 after a run from a clean
 * window, 12 after two back-to-back). A second run inside the same window
 * therefore runs out partway, and the symptom looks nothing like a media bug:
 * pre-join renders "Couldn't load this meeting" and the test dies at its 30s
 * timeout waiting for the name field, with the call never starting.
 *
 * That is the limiter working as plan 04 designed it, not flakiness. Do not
 * loosen it and do not add a retry here — just pause between runs. An earlier
 * round misread exactly this as host CPU contention and spent a session on it.
 */
const API = process.env.VITE_API_URL ?? 'http://localhost:3000'

// Needs the local docker stack: the API on :3000 to mint a meeting and a token,
// and the LiveKit SFU to carry the media. CI has neither — no compose project
// runs there and standing one up belongs to the deployment module — so the file
// skips itself rather than reporting absent infrastructure as a media failure.
test.skip(!!process.env.CI, 'needs the local docker stack (API + LiveKit); CI runs neither')

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

/**
 * Width of the frame the named participant's tile has actually decoded, or 0
 * while it has none. `videoWidth` stays 0 until a frame arrives, so a non-zero
 * value is proof that media crossed the SFU and was decoded here — presence
 * alone would render the avatar fallback instead.
 *
 * Reads the `<video>` from inside the tile rather than locating it directly:
 * the tile exists from the moment the participant is known, but the `<video>`
 * only mounts once a camera track is subscribed, and a locator for a missing
 * element throws instead of polling.
 */
const decodedWidth = (page: Page, name: string) =>
  page
    .getByTestId('participant-tile')
    .filter({ hasText: name })
    .evaluate((tile) => tile.querySelector('video')?.videoWidth ?? 0)

test.describe('a real call between two browsers', () => {
  test('each participant renders the other', async ({ browser, request }) => {
    const code = await createMeeting(request)

    const alice = await join(browser, code, 'Alice')
    const bob = await join(browser, code, 'Bob')

    // Each browser knows the other is in the room. This is signalling only —
    // a tile renders from participant presence and falls back to an avatar.
    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })

    // The assertion the whole architecture exists to make true: each browser
    // has decoded a frame of the other's camera, so media really did cross the
    // self-hosted SFU rather than merely being announced over the signal link.
    await expect.poll(() => decodedWidth(bob, 'Alice'), { timeout: 15_000 }).toBeGreaterThan(0)
    await expect.poll(() => decodedWidth(alice, 'Bob'), { timeout: 15_000 }).toBeGreaterThan(0)

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

  test('a message sent by one participant arrives for the other', async ({ browser, request }) => {
    const code = await createMeeting(request)
    const alice = await join(browser, code, 'Alice')
    const bob = await join(browser, code, 'Bob')

    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })

    await alice.getByLabel('Chat').click()
    await bob.getByLabel('Chat').click()

    await alice.getByLabel('Send a message').fill('Slide 4 is the one')
    await alice.getByLabel('Send a message').press('Enter')

    await expect(bob.getByText('Slide 4 is the one')).toBeVisible({ timeout: 10_000 })

    await alice.close()
    await bob.close()
  })
})
