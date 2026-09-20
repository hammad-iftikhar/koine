import { execFileSync } from 'node:child_process'

// meeting.host_user_id and participant.user_id are real foreign keys to `user`,
// so the x-test-user identity these specs send needs a backing row. The API's
// own vitest suite seeds its own; the compose database has nobody to seed this.
//
// A missing stack is not a failure here. Playwright aborts the entire run when
// globalSetup throws, which would take down smoke.spec.ts — which needs nothing
// but the preview server — along with it. The specs that do need the stack skip
// themselves (see call.spec.ts and reconnect.spec.ts).
export default function seedTestUser() {
  try {
    execFileSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'koine',
        '-d',
        'koine',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ('u_e2e_host', 'u_e2e_host', 'u_e2e_host@test.invalid', false, now(), now())
         ON CONFLICT (id) DO NOTHING;`,
      ],
      { stdio: 'inherit' },
    )
  } catch {
    console.warn(
      '[e2e] could not seed u_e2e_host: the compose Postgres is not reachable. ' +
        'smoke.spec.ts still runs; call.spec.ts and reconnect.spec.ts need the local ' +
        'docker stack (API + LiveKit) and will skip. ' +
        'After a cold `docker compose down -v` the database is empty and has no schema: ' +
        'run `pnpm --filter @koine/api db:migrate` before the e2e suite — the API container ' +
        'runs `tsx watch src/server.ts`, which has no pre-migrate step of its own.',
    )
  }
}
