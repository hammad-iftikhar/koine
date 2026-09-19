import { AlertCircle, Video } from 'lucide-react'

export type JoinCodeFieldProps = {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  error?: string
}

export function JoinCodeField({ value, onChange, onSubmit, error }: JoinCodeFieldProps) {
  return (
    <div>
      <div className="glass flex items-center gap-2.5 rounded-full py-1 pl-4 pr-1">
        <Video size={17} className="text-fg-3" aria-hidden="true" />
        <input
          id="join-code"
          aria-label="Meeting code or link"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'join-code-error' : undefined}
          placeholder="Enter a code or link"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
          }}
          className="w-[170px] border-0 bg-transparent text-fg tabular-nums outline-none placeholder:text-fg-3"
        />
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-full px-4 py-2.5 text-[14px] font-semibold text-blue hover:bg-blue/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        >
          Join
        </button>
      </div>
      {error && (
        <p
          id="join-code-error"
          role="alert"
          className="mt-2 flex items-center gap-1.5 text-[13px] text-red"
        >
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
