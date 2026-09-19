import { formatMeetingCode, normalizeMeetingCode } from '@koine/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { JoinCodeField } from '../components/JoinCodeField'
import { signInWithGoogle, useMe } from '../lib/auth'
import { useCreateMeeting } from '../lib/meetings'

export function Home() {
  const { user } = useMe()
  const navigate = useNavigate()
  const create = useCreateMeeting()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()

  function join() {
    // Accepts a bare code or a full link — people paste whatever they were sent.
    const fromLink = code.trim().split('/').pop() ?? ''
    const normalized = normalizeMeetingCode(fromLink)
    if (!normalized) {
      setError('That does not look like a meeting code. Check it, or paste the link you were sent.')
      return
    }
    setError(undefined)
    navigate(`/j/${formatMeetingCode(normalized)}`)
  }

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-8 px-6 py-16">
      <h1 className="m-0 max-w-[18ch] text-[clamp(32px,4.4vw,46px)] font-semibold leading-[1.08] tracking-[-0.035em]">
        Meetings where nobody switches languages.
      </h1>
      <p className="m-0 max-w-[44ch] text-base text-fg-2">
        Speak the way you normally would. Everyone else hears and reads it in theirs, live.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {user ? (
          <button
            type="button"
            disabled={create.isPending}
            onClick={async () => {
              const newCode = await create.mutateAsync()
              navigate(`/j/${formatMeetingCode(newCode)}`)
            }}
            className="inline-flex items-center gap-2.5 rounded-full bg-blue px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            <Plus size={18} aria-hidden="true" />
            {create.isPending ? 'Creating…' : 'New meeting'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="rounded-full bg-blue px-5 py-3 font-semibold text-white"
          >
            Continue with Google
          </button>
        )}

        <JoinCodeField value={code} onChange={setCode} onSubmit={join} error={error} />
      </div>

      <p className="m-0 text-[13.5px] text-fg-3">
        No account needed to join with a code — sign in only to start a meeting of your own.
      </p>
    </main>
  )
}
