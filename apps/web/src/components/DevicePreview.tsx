import { Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { useVideoStream } from '../lib/useVideoStream'
import { ControlButton } from './ControlButton'
import { SpeakingBars } from './SpeakingBars'

export type DevicePreviewProps = {
  stream?: MediaStream
  micOn: boolean
  cameraOn: boolean
  onToggle: (device: 'mic' | 'camera') => void
}

export function DevicePreview({ stream, micOn, cameraOn, onToggle }: DevicePreviewProps) {
  const video = useVideoStream(stream)

  return (
    <div className="relative grid aspect-video w-full max-w-full place-items-center overflow-hidden rounded-[20px] border border-[var(--edge)] bg-[rgba(255,255,255,0.05)]">
      {stream && cameraOn ? (
        <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
      ) : (
        <p className="text-fg-2">Camera is off</p>
      )}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3">
        <div className="flex items-center gap-2">
          <ControlButton
            label={micOn ? 'Mute microphone' : 'Unmute microphone'}
            state={micOn ? 'default' : 'danger'}
            icon={micOn ? <Mic size={20} /> : <MicOff size={20} />}
            onClick={() => onToggle('mic')}
          />
          {/* Input level meter, the same primitive used for speaking/mic-live elsewhere. */}
          <SpeakingBars active={micOn} />
        </div>
        <ControlButton
          label={cameraOn ? 'Turn off camera' : 'Turn on camera'}
          state={cameraOn ? 'default' : 'danger'}
          icon={cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
          onClick={() => onToggle('camera')}
        />
      </div>
    </div>
  )
}
