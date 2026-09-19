import { expect, test } from '@playwright/test'

const API = process.env.VITE_API_URL ?? 'http://localhost:3000'

test('mute survives a reconnect', async ({ browser, request }) => {
  const res = await request.post(`${API}/api/meetings`, {
    data: { floorLang: 'en' },
    headers: { 'x-test-user': 'u_e2e_host' },
  })
  const code = (await res.json()).code as string

  const context = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const page = await context.newPage()

  await page.goto(`/j/${code}`)
  await page.getByLabel('Your name').fill('Alice')
  await page.getByRole('button', { name: 'Join now' }).click()
  await expect(page.getByLabel('Mute microphone')).toBeVisible({ timeout: 15_000 })

  await page.getByLabel('Mute microphone').click()
  await expect(page.getByLabel('Unmute microphone')).toBeVisible()

  // Drop the network, let LiveKit notice, restore it.
  await context.setOffline(true)
  await expect(page.getByRole('status')).toContainText(/reconnect/i, { timeout: 20_000 })
  await context.setOffline(false)

  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 30_000 })

  // The bug this catches: state is restored from whatever the server last saw,
  // so a reconnect silently unmutes someone who thought they were muted.
  await expect(page.getByLabel('Unmute microphone')).toBeVisible()

  await context.close()
})
