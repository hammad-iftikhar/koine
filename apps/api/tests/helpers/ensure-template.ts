// Builds the test template database ahead of time (see ./db.ts). The harness
// does this on demand, but running it as its own step makes a migration
// failure in CI report as a migration failure rather than as a test failure.
import { ensureTemplateDatabase } from '@tests/helpers/db'

await ensureTemplateDatabase()
