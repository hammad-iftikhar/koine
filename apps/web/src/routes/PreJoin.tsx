import { FLOOR, type LanguageCode, normalizeMeetingCode } from '@koine/shared'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { DevicePreview } from '@/components/DevicePreview'
import { LanguagePicker } from '@/components/LanguagePicker'
import { ApiError } from '@/lib/api'
import { useMe } from '@/lib/auth'
import { useJoinMeeting, useMeeting } from '@/lib/meetings'

export function PreJoin() {
  const { code = '' } = useParams()
  const { user } = useMe()
  const navigate = useNavigate()
  const meeting = useMeeting(code)
  const join = useJoinMeeting(code)

  const [stream, setStream] = useState<MediaStream>()
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [speak, setSpeak] = useState<LanguageCode>('en')
  const [hear, setHear] = useState<LanguageCode | typeof FLOOR>(FLOOR)
  const [name, setName] = useState('')

  useEffect(() => {
    let active = true
    let acquired: MediaStream | undefined

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => {
        acquired = s
        if (active) setStream(s)
        else {
          for (const t of s.getTracks()) t.stop()
        }
      })
      .catch(() => {
        // Permission denial is a state, not a crash. The preview shows
        // "Camera is off" and joining audio-only still works.
      })

    return () => {
      active = false
      for (const t of acquired?.getTracks() ?? []) t.stop()
    }
  }, [])

  useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user])

  if (meeting.isError) {
    const notFound = meeting.error instanceof ApiError && meeting.error.status === 404
    return (
      <main className="mx-auto max-w-130 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">
          {notFound ? 'Meeting not found' : "Couldn't load this meeting"}
        </h1>
        <p className="text-fg-2">
          {notFound
            ? 'Check the code, or ask the host for the link.'
            : 'Something went wrong — try again.'}
        </p>
      </main>
    )
  }

  const others = meeting.data?.participants ?? []

  return (
    <main className="mx-auto grid max-w-295 items-center gap-8 px-6 py-10 lg:grid-cols-[1.35fr_0.65fr]">
      <DevicePreview
        stream={stream}
        micOn={micOn}
        cameraOn={cameraOn}
        onToggle={(device) => {
          if (device === 'mic') {
            setMicOn((on) => {
              for (const t of stream?.getAudioTracks() ?? []) t.enabled = !on
              return !on
            })
          } else {
            setCameraOn((on) => {
              for (const t of stream?.getVideoTracks() ?? []) t.enabled = !on
              return !on
            })
          }
        }}
      />

      <div className="flex flex-col items-center gap-3.5 text-center">
        <h2 className="m-0 text-2xl font-semibold tracking-tight">Ready to join?</h2>
        <p className="m-0 text-[14px] text-fg-2">
          {others.length === 0
            ? 'No one else is here yet.'
            : `${others.map((p) => p.displayName).join(', ')} already in the call.`}
        </p>

        {!user && (
          <label className="w-full max-w-80 text-left">
            <span className="pl-0.5 text-[11.5px] text-fg-3">Your name</span>
            <input
              id="guest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How should people see you?"
              className="mt-1.5 w-full rounded-xl border border-(--edge) bg-(--well) px-3 py-2.5 text-[13.5px] outline-none focus:border-blue"
            />
          </label>
        )}

        <LanguagePicker
          speak={speak}
          hear={hear}
          onChange={(which, value) =>
            which === 'speak'
              ? setSpeak(value as LanguageCode)
              : setHear(value as LanguageCode | typeof FLOOR)
          }
        />

        <button
          type="button"
          disabled={!name.trim() || join.isPending}
          onClick={async () => {
            const result = await join.mutateAsync({
              displayName: name.trim(),
              speakLang: speak,
              hearLang: hear,
            })
            // Keyed by the normalized code so '/j/aaa-aaaa-aaa' and
            // '/j/aaaaaaaaaa' write the same key — plan 05 only needs to
            // read one spelling.
            sessionStorage.setItem(
              `koine:${normalizeMeetingCode(code) ?? code}`,
              JSON.stringify(result),
            )
            navigate(`/m/${code}`)
          }}
          className="w-full max-w-80 rounded-full bg-blue px-5 py-3.5 font-semibold text-white disabled:opacity-60"
        >
          {join.isPending ? 'Joining…' : 'Join now'}
        </button>

        {join.isError && <p className="m-0 text-[13px] text-red">{join.error.message}</p>}
      </div>
    </main>
  )
}
