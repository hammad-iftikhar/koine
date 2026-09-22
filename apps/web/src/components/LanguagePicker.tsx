import { FLOOR, LANGUAGES } from '@koine/shared'

export type LanguagePickerProps = {
  speak: string
  hear: string
  onChange: (which: 'speak' | 'hear', code: string) => void
}

const SELECT =
  'w-full cursor-pointer appearance-none rounded-xl border border-(--edge) bg-(--well) px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue'

/** Two language selectors sharing one floating surface, like the meeting info bar. */
export function LanguagePicker({ speak, hear, onChange }: LanguagePickerProps) {
  return (
    <div className="glass flex w-full gap-2 rounded-2xl p-3">
      <label className="flex flex-1 flex-col gap-1.5 text-left">
        <span className="pl-0.5 text-[11.5px] text-fg-2">I speak</span>
        <select
          id="lang-speak"
          value={speak}
          onChange={(e) => onChange('speak', e.target.value)}
          className={SELECT}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-1 flex-col gap-1.5 text-left">
        <span className="pl-0.5 text-[11.5px] text-fg-2">I hear</span>
        <select
          id="lang-hear"
          value={hear}
          onChange={(e) => onChange('hear', e.target.value)}
          className={SELECT}
        >
          <option value={FLOOR}>Original audio</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
