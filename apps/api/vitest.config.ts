import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // vitest loads no .env, and the modules under test (db client, auth) throw
    // at import time when their env vars are unset. These defaults let
    // `pnpm --filter @koine/api test` run with no shell env configured.
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://koine:koine@localhost:5432/koine',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test_auth_secret_at_least_32_characters',
      GUEST_TOKEN_SECRET:
        process.env.GUEST_TOKEN_SECRET ?? 'test_guest_secret_at_least_32_character',
      // Silences Better Auth's startup warnings about a missing base URL and
      // Google credentials — neither is exercised by these tests, but an
      // unset value logs a warning on every run that imports auth.ts.
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? 'test_google_client_id',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? 'test_google_client_secret',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? 'devkey',
      LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? 'devsecret_change_me_at_least_32_chars',
    },
  },
})
