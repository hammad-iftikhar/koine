import { Hand, Mic, MicOff, MonitorUp, PhoneOff, Subtitles, Video, VideoOff } from 'lucide-react'
import { ControlButton } from './ControlButton'
import { SpeakingBars } from './SpeakingBars'

export type ControlBarProps = {
  mic: boolean
  camera: boolean
  captions: boolean
  hand: boolean
  presenting: boolean
  presentDisabled?: boolean
  onToggle: (control: 'mic' | 'camera' | 'captions' | 'hand' | 'present') => void
  onLeave: () => void
}

export function ControlBar({
  mic,
  camera,
  captions,
  hand,
  presenting,
  presentDisabled = false,
  onToggle,
  onLeave,
}: ControlBarProps) {
  return (
    <div className="glass flex items-center gap-2 rounded-full p-2">
      <div className="flex items-center gap-2">
        <ControlButton
          label={mic ? 'Mute microphone' : 'Unmute microphone'}
          state={mic ? 'default' : 'danger'}
          icon={mic ? <Mic size={20} /> : <MicOff size={20} />}
          onClick={() => onToggle('mic')}
        />
        {/* Mic-live indicator — the same primitive used for speaking in a
            tile and the input level meter in pre-join. Decorative: mic state
            is still carried by the icon glyph above. */}
        <SpeakingBars active={mic} />
      </div>
      <ControlButton
        label={camera ? 'Turn off camera' : 'Turn on camera'}
        state={camera ? 'default' : 'danger'}
        icon={camera ? <Video size={20} /> : <VideoOff size={20} />}
        onClick={() => onToggle('camera')}
      />
      <ControlButton
        label={captions ? 'Turn off captions' : 'Turn on captions'}
        state={captions ? 'active' : 'default'}
        icon={<Subtitles size={20} />}
        onClick={() => onToggle('captions')}
      />
      <ControlButton
        label={hand ? 'Lower hand' : 'Raise hand'}
        state={hand ? 'active' : 'default'}
        icon={<Hand size={20} />}
        onClick={() => onToggle('hand')}
      />
      <ControlButton
        // The label carries the reason when the control is unavailable; a
        // greyed-out "Present now" would leave the user guessing.
        label={
          presenting
            ? 'Stop presenting'
            : presentDisabled
              ? 'Someone else is presenting'
              : 'Present now'
        }
        state={presenting ? 'active' : 'default'}
        disabled={presentDisabled}
        icon={<MonitorUp size={20} />}
        onClick={() => onToggle('present')}
      />
      <ControlButton
        label="Leave call"
        state="danger"
        wide
        icon={<PhoneOff size={20} />}
        onClick={onLeave}
      />
    </div>
  )
}
