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
    },
  },
})
