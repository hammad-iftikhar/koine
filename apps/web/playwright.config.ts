import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera', 'microphone'],
        launchOptions: {
          args: [
            // getUserMedia returns a synthetic stream instead of failing on a
            // machine with no camera, which is every CI machine.
            '--use-fake-device-for-media-capture',
            // Grants the permission prompt automatically. Without it the call
            // hangs forever waiting for a click nobody will make.
            '--use-fake-ui-for-media-stream',
            // Screen share needs Chromium to auto-select a source and
            // auto-accept the tab-capture prompt instead of hanging on UI
            // nobody will click.
            '--auto-select-desktop-capture-source=Entire screen',
            '--auto-accept-this-tab-capture',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
