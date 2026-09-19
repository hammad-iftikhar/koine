import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
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
            // nobody will click. Tab capture (not "Entire screen") is
            // deliberate: it is in-process and should not need an OS-level
            // Screen Recording grant the way display capture does. On this
            // macOS host it still fails with "Could not start video source"
            // (see call.spec.ts's darwin skip) — kept anyway because it is
            // the correct choice for CI (Linux), where it is expected to work.
            '--auto-select-tab-capture-source-by-title=Koine',
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
