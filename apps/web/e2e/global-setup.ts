import { execFileSync } from 'node:child_process'

// meeting.host_user_id and participant.user_id are real foreign keys to `user`,
// so the x-test-user identity these specs send needs a backing row. The API's
// own vitest suite seeds its own; the compose database has nobody to seed this.
export default function seedTestUser() {
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
}
