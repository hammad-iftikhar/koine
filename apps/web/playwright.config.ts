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
            //
            // The switch is `...-for-media-stream`. `...-for-media-capture` is
            // not a Chromium switch: it is accepted silently and ignored, so
            // the tests quietly drive the host's real camera instead. On a
            // developer Mac that camera stays `live` while producing no frames
            // at all, so `videoWidth` never leaves 0, no video track ever
            // reaches the SFU, and every media assertion that only checks
            // presence still passes. Do not "tidy" this name.
            '--use-fake-device-for-media-stream',
            // Grants the permission prompt automatically. Without it the call
            // hangs forever waiting for a click nobody will make.
            '--use-fake-ui-for-media-stream',
            // Screen share needs Chromium to auto-select a source and
            // auto-accept the tab-capture prompt instead of hanging on UI
            // nobody will click. Tab capture (not "Entire screen") is
            // deliberate: it is in-process and needs no OS-level Screen
            // Recording grant the way display capture does — which is why the
            // screen-share test runs on macOS too. Its old "Could not start
            // video source" failure was the fake-device switch above being
            // misspelled, not a missing TCC grant.
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
