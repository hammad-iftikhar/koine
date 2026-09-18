# Koine Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every presentational component from the spec's inventory, each with stories covering its states, passing a11y, rendering against the tokens from plan 01.

**Architecture:** Presentational components take props only and live in `src/components/`. Containers call LiveKit hooks, contain no styling, and arrive in plan 05. Storybook is the workbench and the test environment — a story *is* the test.

**Tech Stack:** React 19, Tailwind v4, shadcn/ui, lucide-react, Storybook, Vitest.

**Spec:** [`../specs/2026-09-18-koine/02-design-system.md`](../specs/2026-09-18-koine/02-design-system.md)

## Global Constraints

- **Node 22**, pnpm, TypeScript. Test-first.
- **Dark theme only.** No light mode, no theme toggle, no `prefers-color-scheme` branch.
- **No hex literals outside `src/styles/tokens.css`.** Task 7 enforces this with a test.
- **No gradients in backgrounds.** Flat `--ink`; translucent white fills for raised surfaces.
- **Three colours, three meanings, no overlap:** blue = active/you, red = off/out, amber = degraded. Green is a connected confirmation only.
- **Colour is never the only signal** — a state that uses colour also changes icon or shape.
- **Recording is out of scope.** No "Rec" chip.
- **No snapshot tests, no coverage threshold.**
- Components take props only. If a component needs `useParticipants()`, it belongs in `containers/` and has no story.

---

## File Structure

```
apps/web/src/components/
  ParticipantTile.tsx        + .stories.tsx
  ScreenShareTile.tsx        + .stories.tsx
  ControlButton.tsx          + .stories.tsx
  ControlBar.tsx             + .stories.tsx
  PanelToggles.tsx           + .stories.tsx
  CaptionBox.tsx             + .stories.tsx
  ChatMessage.tsx            + .stories.tsx
  ChatPanel.tsx              + .stories.tsx
  MeetingInfoBar.tsx         + .stories.tsx
  DevicePreview.tsx          + .stories.tsx
  LanguagePicker.tsx         + .stories.tsx
  JoinCodeField.tsx          + .stories.tsx
  SpeakingBars.tsx           (exists, plan 01)
apps/web/src/lib/
  cn.ts                      class merge helper
  perf.ts                    blur/perf switch
apps/web/src/styles/
  tokens.css                 (exists, plan 01) — extended in Task 1
  tokens.test.ts             enforces "no hex outside tokens.css"
```

---

### Task 1: Glass surface utilities and the class helper

**Files:**
- Create: `apps/web/src/lib/cn.ts`, `apps/web/src/lib/perf.ts`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` — every later component imports it.
- Produces: `.glass` and `.glass-strong` CSS classes.
- Produces: `setBlurEnabled(on: boolean): void` and `isBlurEnabled(): boolean` from `perf.ts`.

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter @koine/web add clsx tailwind-merge lucide-react`

- [ ] **Step 2: Create the class helper**

`apps/web/src/lib/cn.ts`:
```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes so a caller's class wins over a component default. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: Add the glass utilities**

Append to `apps/web/src/styles/global.css`:
```css
/* Glass is for things that float over content, never for the ground itself. */
.glass {
  background: var(--pane);
  border: 1px solid var(--edge);
  box-shadow: inset 0 1px 0 var(--edge-top), var(--lift);
  -webkit-backdrop-filter: var(--blur);
  backdrop-filter: var(--blur);
}

.glass-strong {
  background: var(--pane-2);
  border: 1px solid var(--edge-top);
  box-shadow: inset 0 1px 0 var(--edge-top), var(--lift);
  -webkit-backdrop-filter: var(--blur);
  backdrop-filter: var(--blur);
}

/* The performance switch. backdrop-filter beside nine live <video> elements is
   expensive; this drops it to a flat fill without touching any component. */
:root[data-blur='off'] .glass,
:root[data-blur='off'] .glass-strong {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  background: rgb(26 26 30);
}
```

- [ ] **Step 4: Write the failing test for the perf switch**

`apps/web/src/lib/perf.test.ts`:
```ts
import { beforeEach, expect, it } from 'vitest'
import { isBlurEnabled, setBlurEnabled } from './perf'

beforeEach(() => {
  document.documentElement.removeAttribute('data-blur')
})

it('defaults to enabled', () => {
  expect(isBlurEnabled()).toBe(true)
})

it('stamps the root when disabled', () => {
  setBlurEnabled(false)
  expect(document.documentElement.dataset.blur).toBe('off')
  expect(isBlurEnabled()).toBe(false)
})

it('clears the stamp when re-enabled', () => {
  setBlurEnabled(false)
  setBlurEnabled(true)
  expect(document.documentElement.dataset.blur).toBeUndefined()
  expect(isBlurEnabled()).toBe(true)
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @koine/web test perf`
Expected: FAIL — cannot resolve `./perf`.

- [ ] **Step 6: Write the implementation**

`apps/web/src/lib/perf.ts`:
```ts
/**
 * One attribute on the root toggles every glass surface at once. Components
 * never branch on it — that is the whole point of putting it in CSS.
 */
export function setBlurEnabled(on: boolean): void {
  if (on) document.documentElement.removeAttribute('data-blur')
  else document.documentElement.dataset.blur = 'off'
}

export function isBlurEnabled(): boolean {
  return document.documentElement.dataset.blur !== 'off'
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @koine/web test perf`
Expected: PASS — 3 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib apps/web/src/styles
git commit -m "feat(web): glass utilities, class helper and performance switch"
```

---

### Task 2: ParticipantTile

The most state-dense component in the product: speaking, muted, camera off, and a live stream, in any combination.

**Files:**
- Create: `apps/web/src/components/ParticipantTile.tsx`, `apps/web/src/components/ParticipantTile.stories.tsx`

**Interfaces:**
- Consumes: `cn` (Task 1), `SpeakingBars` (plan 01)
- Produces:
```ts
type ParticipantTileProps = {
  name: string
  speaking?: boolean
  muted?: boolean
  cameraOff?: boolean
  stream?: MediaStream
  isSelf?: boolean
}
```
  Plan 05's `RoomGrid` renders this. Prop names are fixed here.

- [ ] **Step 1: Write the failing stories**

`apps/web/src/components/ParticipantTile.stories.tsx`:
```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from 'storybook/test'
import { ParticipantTile } from './ParticipantTile'

const meta: Meta<typeof ParticipantTile> = {
  title: 'Room/ParticipantTile',
  component: ParticipantTile,
  decorators: [
    (Story) => (
      <div style={{ width: 420, height: 264 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ParticipantTile>

export const CameraOff: Story = {
  args: { name: 'Mariam', cameraOff: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Mariam')).toBeInTheDocument()
    await expect(c.getByTestId('avatar')).toHaveTextContent('M')
  },
}

export const Speaking: Story = {
  args: { name: 'Mariam', cameraOff: true, speaking: true },
  play: async ({ canvasElement }) => {
    const tile = within(canvasElement).getByTestId('participant-tile')
    await expect(tile).toHaveAttribute('data-speaking', 'true')
  },
}

export const Muted: Story = {
  args: { name: 'Kenji', cameraOff: true, muted: true },
  play: async ({ canvasElement }) => {
    // The mute indicator must be reachable by label, not only by colour.
    await expect(within(canvasElement).getByLabelText('Microphone off')).toBeInTheDocument()
  },
}

export const MutedAndSpeaking: Story = {
  // Really happens: the speech detector lags the mute toggle by a frame.
  // Mute must win, or someone believes they are being heard when they are not.
  args: { name: 'Kenji', cameraOff: true, muted: true, speaking: true },
  play: async ({ canvasElement }) => {
    const tile = within(canvasElement).getByTestId('participant-tile')
    await expect(tile).toHaveAttribute('data-speaking', 'false')
    await expect(within(canvasElement).getByLabelText('Microphone off')).toBeInTheDocument()
  },
}

export const Self: Story = {
  args: { name: 'Hammad', cameraOff: true, isSelf: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('You')).toBeInTheDocument()
  },
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @koine/web test ParticipantTile`
Expected: FAIL — cannot resolve `./ParticipantTile`.

- [ ] **Step 3: Write the component**

`apps/web/src/components/ParticipantTile.tsx`:
```tsx
import { MicOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '../lib/cn'
import { SpeakingBars } from './SpeakingBars'

export type ParticipantTileProps = {
  name: string
  speaking?: boolean
  muted?: boolean
  cameraOff?: boolean
  stream?: MediaStream
  isSelf?: boolean
}

export function ParticipantTile({
  name,
  speaking = false,
  muted = false,
  cameraOff = false,
  stream,
  isSelf = false,
}: ParticipantTileProps) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = video.current
    if (!el || !stream) return
    el.srcObject = stream
    return () => {
      el.srcObject = null
    }
  }, [stream])

  // A muted participant is never shown as speaking. The detector can lag the
  // toggle, and "you are being heard" is the wrong thing to get wrong.
  const isSpeaking = speaking && !muted
  const label = isSelf ? 'You' : name

  return (
    <div
      data-testid="participant-tile"
      data-speaking={String(isSpeaking)}
      className={cn(
        'relative grid h-full w-full place-items-center overflow-hidden rounded-[18px]',
        'border border-[var(--edge)] bg-[rgba(255,255,255,0.05)]',
        isSpeaking && 'border-blue shadow-[0_0_0_1px_var(--blue),0_0_32px_-10px_var(--blue)]',
      )}
    >
      {stream && !cameraOff ? (
        <video
          ref={video}
          autoPlay
          playsInline
          muted={isSelf}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          data-testid="avatar"
          className="grid h-14 w-14 place-items-center rounded-full bg-blue text-[19px] font-semibold text-white"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}

      <span className="absolute bottom-2.5 left-2.5 flex items-center gap-[7px] rounded-full border border-[var(--edge)] bg-black/55 px-2.5 py-1 text-[12.5px] backdrop-blur-[14px]">
        {isSpeaking && <SpeakingBars active />}
        {label}
      </span>

      {muted && (
        <span
          aria-label="Microphone off"
          role="img"
          className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full border border-[var(--edge)] bg-black/50 text-red backdrop-blur-[14px]"
        >
          <MicOff size={14} aria-hidden="true" />
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @koine/web test ParticipantTile`
Expected: PASS — 5 story tests.

- [ ] **Step 5: Check a11y in Storybook**

Run: `pnpm --filter @koine/web storybook`, open Room/ParticipantTile, check the a11y panel on every story.
Expected: zero violations. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): ParticipantTile with speaking, muted and camera-off states"
```

---

### Task 3: ControlButton, ControlBar and PanelToggles

Google Meet's placement: controls bottom-centre in a floating capsule, panel toggles bottom-right.

**Files:**
- Create: `apps/web/src/components/ControlButton.tsx`, `ControlBar.tsx`, `PanelToggles.tsx` and a `.stories.tsx` for each

**Interfaces:**
- Produces:
```ts
type ControlButtonProps = {
  label: string                                   // aria-label, always required
  icon: React.ReactNode
  state?: 'default' | 'active' | 'danger'
  wide?: boolean
  onClick?: () => void
}

type ControlBarProps = {
  mic: boolean; camera: boolean; captions: boolean; hand: boolean; presenting: boolean
  onToggle: (control: 'mic' | 'camera' | 'captions' | 'hand' | 'present') => void
  onLeave: () => void
}

type PanelName = 'details' | 'people' | 'chat' | 'languages'
type PanelTogglesProps = {
  active: PanelName | null
  participantCount: number
  onOpen: (panel: PanelName) => void
}
```
  Plan 05's `LocalControls` renders `ControlBar`. Names fixed here.

- [ ] **Step 1: Write the failing stories**

`apps/web/src/components/ControlBar.stories.tsx`:
```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ControlBar } from './ControlBar'

const meta: Meta<typeof ControlBar> = {
  title: 'Room/ControlBar',
  component: ControlBar,
  args: {
    mic: true,
    camera: true,
    captions: false,
    hand: false,
    presenting: false,
    onToggle: fn(),
    onLeave: fn(),
  },
}
export default meta
type Story = StoryObj<typeof ControlBar>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // Every control is reachable by name — icon-only buttons are not exempt.
    for (const label of ['Mute microphone', 'Turn off camera', 'Turn on captions', 'Raise hand', 'Present now', 'Leave call']) {
      await expect(c.getByLabelText(label)).toBeInTheDocument()
    }
  },
}

export const Muted: Story = {
  args: { mic: false },
  play: async ({ canvasElement }) => {
    // Label flips with state: it names what the click will do.
    const btn = within(canvasElement).getByLabelText('Unmute microphone')
    await expect(btn).toHaveAttribute('data-state', 'danger')
  },
}

export const CaptionsOn: Story = {
  args: { captions: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Turn off captions')).toHaveAttribute(
      'data-state',
      'active',
    )
  },
}

export const TogglingMicCallsBack: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByLabelText('Mute microphone'))
    await expect(args.onToggle).toHaveBeenCalledWith('mic')
  },
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @koine/web test ControlBar`
Expected: FAIL — cannot resolve `./ControlBar`.

- [ ] **Step 3: Write ControlButton**

`apps/web/src/components/ControlButton.tsx`:
```tsx
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type ControlButtonProps = {
  label: string
  icon: ReactNode
  state?: 'default' | 'active' | 'danger'
  wide?: boolean
  onClick?: () => void
}

export function ControlButton({
  label,
  icon,
  state = 'default',
  wide = false,
  onClick,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-state={state}
      onClick={onClick}
      className={cn(
        'grid h-[46px] place-items-center rounded-full border transition-colors',
        wide ? 'w-auto gap-2 px-[22px]' : 'w-[46px]',
        state === 'default' &&
          'border-[var(--edge)] bg-[var(--pane-2)] text-fg hover:bg-white/20',
        state === 'active' && 'border-white/25 bg-blue text-white',
        state === 'danger' && 'border-white/25 bg-red text-white',
      )}
    >
      {icon}
    </button>
  )
}
```

- [ ] **Step 4: Write ControlBar**

`apps/web/src/components/ControlBar.tsx`:
```tsx
import { Hand, Mic, MicOff, MonitorUp, PhoneOff, Subtitles, Video, VideoOff } from 'lucide-react'
import { ControlButton } from './ControlButton'

export type ControlBarProps = {
  mic: boolean
  camera: boolean
  captions: boolean
  hand: boolean
  presenting: boolean
  onToggle: (control: 'mic' | 'camera' | 'captions' | 'hand' | 'present') => void
  onLeave: () => void
}

export function ControlBar({
  mic,
  camera,
  captions,
  hand,
  presenting,
  onToggle,
  onLeave,
}: ControlBarProps) {
  return (
    <div className="glass flex items-center gap-2 rounded-full p-2">
      <ControlButton
        label={mic ? 'Mute microphone' : 'Unmute microphone'}
        state={mic ? 'default' : 'danger'}
        icon={mic ? <Mic size={20} /> : <MicOff size={20} />}
        onClick={() => onToggle('mic')}
      />
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
        label={presenting ? 'Stop presenting' : 'Present now'}
        state={presenting ? 'active' : 'default'}
        icon={<MonitorUp size={20} />}
        onClick={() => onToggle('present')}
      />
      <ControlButton label="Leave call" state="danger" wide icon={<PhoneOff size={20} />} onClick={onLeave} />
    </div>
  )
}
```

- [ ] **Step 5: Write PanelToggles and its story**

`apps/web/src/components/PanelToggles.tsx`:
```tsx
import { Globe, Info, MessageSquare, Users } from 'lucide-react'
import { cn } from '../lib/cn'

export type PanelName = 'details' | 'people' | 'chat' | 'languages'

export type PanelTogglesProps = {
  active: PanelName | null
  participantCount: number
  onOpen: (panel: PanelName) => void
}

const PANELS: { name: PanelName; label: string; icon: typeof Info }[] = [
  { name: 'details', label: 'Meeting details', icon: Info },
  { name: 'people', label: 'People', icon: Users },
  { name: 'chat', label: 'Chat', icon: MessageSquare },
  { name: 'languages', label: 'Languages', icon: Globe },
]

export function PanelToggles({ active, participantCount, onOpen }: PanelTogglesProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      {PANELS.map(({ name, label, icon: Icon }) => (
        <button
          key={name}
          type="button"
          aria-label={label}
          aria-pressed={active === name}
          onClick={() => onOpen(name)}
          className={cn(
            'relative grid h-[42px] w-[42px] place-items-center rounded-full text-fg-2 hover:bg-[var(--pane-2)] hover:text-fg',
            active === name && 'bg-blue/15 text-blue',
          )}
        >
          <Icon size={19} aria-hidden="true" />
          {name === 'people' && (
            <span className="absolute right-1 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-blue px-[3px] text-[10px] text-white">
              {participantCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
```

`apps/web/src/components/PanelToggles.stories.tsx`:
```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PanelToggles } from './PanelToggles'

const meta: Meta<typeof PanelToggles> = {
  title: 'Room/PanelToggles',
  component: PanelToggles,
  args: { active: null, participantCount: 4, onOpen: fn() },
}
export default meta
type Story = StoryObj<typeof PanelToggles>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('People')).toHaveTextContent('4')
  },
}

export const ChatOpen: Story = {
  args: { active: 'chat' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Chat')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

export const OpeningCallsBack: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByLabelText('Chat'))
    await expect(args.onOpen).toHaveBeenCalledWith('chat')
  },
}
```

- [ ] **Step 6: Run to verify all pass**

Run: `pnpm --filter @koine/web test`
Expected: PASS — ControlBar 4, PanelToggles 3, plus earlier tasks.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): control bar and panel toggles"
```

---

### Task 4: CaptionBox

The product's one real departure from Meet: the original stays visible above the translation.

**Files:**
- Create: `apps/web/src/components/CaptionBox.tsx`, `apps/web/src/components/CaptionBox.stories.tsx`

**Interfaces:**
- Produces:
```ts
type CaptionBoxProps = {
  speaker: string
  original: string
  translated: string
  sourceLang: string      // display name, e.g. 'Spanish'
  interim?: boolean
}
```
  Plan 06's `LiveCaptions` container renders this.

- [ ] **Step 1: Write the failing stories**

`apps/web/src/components/CaptionBox.stories.tsx`:
```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from 'storybook/test'
import { CaptionBox } from './CaptionBox'

const meta: Meta<typeof CaptionBox> = {
  title: 'Room/CaptionBox',
  component: CaptionBox,
  args: {
    speaker: 'Mariam',
    sourceLang: 'Spanish',
    original: 'Se movió la fecha al viernes.',
    translated: 'The deadline moved to Friday.',
  },
}
export default meta
type Story = StoryObj<typeof CaptionBox>

export const Final: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // Both lines present. A translation you cannot audit is one you cannot trust.
    await expect(c.getByText('Se movió la fecha al viernes.')).toBeInTheDocument()
    await expect(c.getByText('The deadline moved to Friday.')).toBeInTheDocument()
    await expect(c.getByText(/translated from Spanish/i)).toBeInTheDocument()
  },
}

export const Interim: Story = {
  args: { interim: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('caption-box')).toHaveAttribute(
      'data-interim',
      'true',
    )
  },
}

export const LongLine: Story = {
  args: {
    original:
      'Creo que deberíamos posponer la vista de reportes hasta el próximo ciclo, porque el equipo no va a terminar a tiempo.',
    translated:
      'I think we should postpone the reporting view until the next cycle, because the team will not finish in time.',
  },
  play: async ({ canvasElement }) => {
    // Text that outgrows its track must wrap, not clip.
    const box = within(canvasElement).getByTestId('caption-box')
    await expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1)
  },
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @koine/web test CaptionBox`
Expected: FAIL — cannot resolve `./CaptionBox`.

- [ ] **Step 3: Write the component**

`apps/web/src/components/CaptionBox.tsx`:
```tsx
import { Globe } from 'lucide-react'
import { cn } from '../lib/cn'

export type CaptionBoxProps = {
  speaker: string
  original: string
  translated: string
  sourceLang: string
  interim?: boolean
}

export function CaptionBox({
  speaker,
  original,
  translated,
  sourceLang,
  interim = false,
}: CaptionBoxProps) {
  return (
    <div
      data-testid="caption-box"
      data-interim={String(interim)}
      aria-live="polite"
      className={cn(
        'w-[min(640px,92%)] rounded-[18px] border border-[var(--edge)] bg-black/70 px-[18px] py-3.5 backdrop-blur-[28px]',
        interim && 'opacity-80',
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-fg-3">
        <Globe size={14} aria-hidden="true" />
        <b className="font-semibold text-fg-2">{speaker}</b>
        <span>· translated from {sourceLang}</span>
      </div>
      <p className="m-0 mb-1 break-words text-[13px] text-fg-3">{original}</p>
      <p className="m-0 break-words text-base leading-[1.4]">{translated}</p>
    </div>
  )
}
```

`aria-live="polite"` rather than `assertive`: captions update constantly, and an
assertive region would interrupt a screen reader on every word.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @koine/web test CaptionBox`
Expected: PASS — 3 story tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): caption box showing original above translation"
```

---

### Task 5: Chat components

**Files:**
- Create: `apps/web/src/components/ChatMessage.tsx`, `ChatPanel.tsx` and a `.stories.tsx` for each

**Interfaces:**
- Produces:
```ts
type ChatMessageProps = {
  author: string
  time: string              // pre-formatted, e.g. '10:43'
  body: string
  translated?: string       // absent when the reader shares the author's language
  own?: boolean
  translationFailed?: boolean
}

type ChatPanelProps = {
  messages: (ChatMessageProps & { id: string })[]
  onSend: (body: string) => void
  onClose: () => void
}
```
  Plan 07's `RoomChat` container renders `ChatPanel`.

- [ ] **Step 1: Write the failing stories**

`apps/web/src/components/ChatPanel.stories.tsx`:
```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ChatPanel } from './ChatPanel'

const meta: Meta<typeof ChatPanel> = {
  title: 'Room/ChatPanel',
  component: ChatPanel,
  decorators: [
    (Story) => (
      <div style={{ width: 316, height: 520 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onSend: fn(),
    onClose: fn(),
    messages: [
      { id: '1', author: 'Kenji', time: '10:42', body: 'Slide 4 is the one we disagreed on.' },
      {
        id: '2',
        author: 'Mariam',
        time: '10:43',
        body: 'Puedo explicarlo en un minuto.',
        translated: 'I can explain it in a minute.',
      },
      { id: '3', author: 'You', time: '10:43', body: "Go ahead — I'll take notes.", own: true },
    ],
  },
}
export default meta
type Story = StoryObj<typeof ChatPanel>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // People assume chat is private. It is not, and the panel says so.
    await expect(c.getByText(/visible to everyone/i)).toBeInTheDocument()
    await expect(c.getByText('I can explain it in a minute.')).toBeInTheDocument()
  },
}

export const SendingCallsBack: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByLabelText('Send a message')
    await userEvent.type(input, 'Sounds good{Enter}')
    await expect(args.onSend).toHaveBeenCalledWith('Sounds good')
  },
}

export const EmptyMessageIsNotSent: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByLabelText('Send a message')
    await userEvent.type(input, '   {Enter}')
    await expect(args.onSend).not.toHaveBeenCalled()
  },
}

export const TranslationFailed: Story = {
  args: {
    messages: [
      {
        id: '1',
        author: 'Mariam',
        time: '10:44',
        body: 'Vale, lo vemos mañana.',
        translationFailed: true,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // The message is never hidden because it could not be translated.
    await expect(c.getByText('Vale, lo vemos mañana.')).toBeInTheDocument()
    await expect(c.getByText(/translation unavailable/i)).toBeInTheDocument()
  },
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @koine/web test ChatPanel`
Expected: FAIL — cannot resolve `./ChatPanel`.

- [ ] **Step 3: Write ChatMessage**

`apps/web/src/components/ChatMessage.tsx`:
```tsx
import { cn } from '../lib/cn'

export type ChatMessageProps = {
  author: string
  time: string
  body: string
  translated?: string
  own?: boolean
  translationFailed?: boolean
}

export function ChatMessage({
  author,
  time,
  body,
  translated,
  own = false,
  translationFailed = false,
}: ChatMessageProps) {
  return (
    <div className="flex flex-col gap-[3px]">
      <div className="flex items-baseline gap-2">
        <b className="text-[13px] font-semibold">{author}</b>
        <span className="text-[11.5px] text-fg-3">{time}</span>
      </div>
      <div
        className={cn(
          'rounded-[14px] border px-3 py-2 text-[13.5px] break-words',
          own
            ? 'border-blue bg-blue text-white'
            : 'border-[var(--edge)] bg-[var(--pane)] text-fg-2',
        )}
      >
        <p className="m-0">{body}</p>
        {translated && (
          <p className="m-0 mt-1.5 border-l-2 border-blue pl-2 text-fg">{translated}</p>
        )}
        {translationFailed && (
          <p className="m-0 mt-1.5 text-[12px] text-fg-3">Translation unavailable</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write ChatPanel**

`apps/web/src/components/ChatPanel.tsx`:
```tsx
import { Send, X } from 'lucide-react'
import { useState } from 'react'
import { ChatMessage, type ChatMessageProps } from './ChatMessage'

export type ChatPanelProps = {
  messages: (ChatMessageProps & { id: string })[]
  onSend: (body: string) => void
  onClose: () => void
}

export function ChatPanel({ messages, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState('')

  function submit() {
    const body = draft.trim()
    if (!body) return
    onSend(body)
    setDraft('')
  }

  return (
    <aside className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-[18px]">
      <header className="flex items-center gap-2.5 border-b border-[var(--edge)] px-4 py-3.5">
        <h3 className="m-0 flex-1 text-[15px] font-semibold tracking-[-0.02em]">
          In-call messages
        </h3>
        <button
          type="button"
          aria-label="Close chat"
          onClick={onClose}
          className="grid h-[38px] w-[38px] place-items-center rounded-full text-fg-2 hover:bg-[var(--pane-2)] hover:text-fg"
        >
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-4 py-3.5">
        <p className="m-0 rounded-[12px] bg-[var(--well)] px-3 py-2.5 text-[12px] text-fg-3">
          Messages are visible to everyone in the call and translated to each person's language.
        </p>
        {messages.map(({ id, ...msg }) => (
          <ChatMessage key={id} {...msg} />
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--edge)] p-3">
        <input
          id="chat-draft"
          aria-label="Send a message"
          placeholder="Send a message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          className="min-w-0 flex-1 rounded-full border border-[var(--edge)] bg-[var(--well)] px-[15px] py-2.5 text-[14px] text-fg outline-none focus:border-blue"
        />
        <button
          type="button"
          aria-label="Send"
          onClick={submit}
          className="grid h-[38px] w-[38px] place-items-center rounded-full text-blue hover:bg-blue/15"
        >
          <Send size={19} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @koine/web test ChatPanel`
Expected: PASS — 4 story tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): chat panel with per-reader translation display"
```

---

### Task 6: Screen share, meeting info, device preview, language picker and join code

The remaining inventory. Each is small; they ship together because none of them is worth a separate review gate.

**Files:**
- Create: `apps/web/src/components/ScreenShareTile.tsx`, `MeetingInfoBar.tsx`, `DevicePreview.tsx`, `LanguagePicker.tsx`, `JoinCodeField.tsx` and a `.stories.tsx` for each
- Create: `packages/shared/src/languages.ts`

**Interfaces:**
- Produces from `@koine/shared`: `LANGUAGES: readonly { code: string; label: string }[]` and `FLOOR = 'floor'`. Plans 04, 06 and 07 all use these codes.
- Produces:
```ts
type ScreenShareTileProps = { presenterName: string; stream?: MediaStream }
type MeetingInfoBarProps = { elapsedSeconds: number; code: string }
type DevicePreviewProps = { stream?: MediaStream; micOn: boolean; cameraOn: boolean; onToggle: (d: 'mic' | 'camera') => void }
type LanguagePickerProps = { speak: string; hear: string; onChange: (which: 'speak' | 'hear', code: string) => void }
type JoinCodeFieldProps = { value: string; onChange: (v: string) => void; onSubmit: () => void; error?: string }
```

- [ ] **Step 1: Create the language list in shared**

`packages/shared/src/languages.ts`:
```ts
/** 'floor' means the original audio, untranslated. It is never a TTS channel. */
export const FLOOR = 'floor' as const

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ur', label: 'اردو' },
  { code: 'ja', label: '日本語' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code
}
```

Add to `packages/shared/src/index.ts`:
```ts
export { FLOOR, LANGUAGES, type LanguageCode, languageLabel } from './languages'
```

- [ ] **Step 2: Write the failing stories for MeetingInfoBar and JoinCodeField**

`apps/web/src/components/MeetingInfoBar.stories.tsx`:
```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from 'storybook/test'
import { MeetingInfoBar } from './MeetingInfoBar'

const meta: Meta<typeof MeetingInfoBar> = {
  title: 'Room/MeetingInfoBar',
  component: MeetingInfoBar,
  args: { elapsedSeconds: 1456, code: 'kxv-nvra-dwq' },
}
export default meta
type Story = StoryObj<typeof MeetingInfoBar>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('24:16')).toBeInTheDocument()
    await expect(c.getByText(/kxv-nvra-dwq/)).toBeInTheDocument()
  },
}

export const OverAnHour: Story = {
  args: { elapsedSeconds: 3725 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('1:02:05')).toBeInTheDocument()
  },
}
```

`apps/web/src/components/JoinCodeField.stories.tsx`:
```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { JoinCodeField } from './JoinCodeField'

const meta: Meta<typeof JoinCodeField> = {
  title: 'Home/JoinCodeField',
  component: JoinCodeField,
  args: { value: '', onChange: fn(), onSubmit: fn() },
}
export default meta
type Story = StoryObj<typeof JoinCodeField>

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Meeting code or link')).toBeInTheDocument()
  },
}

export const WithError: Story = {
  args: {
    value: 'kxv-nvra-dwq',
    error: 'Meeting code not found — check the code or ask the host for the link',
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const input = c.getByLabelText('Meeting code or link')
    // The error must be associated, not merely nearby.
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(c.getByRole('alert')).toHaveTextContent(/not found/i)
  },
}

export const SubmitOnEnter: Story = {
  args: { value: 'kxv-nvra-dwq' },
  play: async ({ canvasElement, args }) => {
    await userEvent.type(within(canvasElement).getByLabelText('Meeting code or link'), '{Enter}')
    await expect(args.onSubmit).toHaveBeenCalled()
  },
}
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @koine/web test MeetingInfoBar JoinCodeField`
Expected: FAIL — modules cannot be resolved.

- [ ] **Step 4: Write the five components**

`apps/web/src/components/MeetingInfoBar.tsx`:
```tsx
export type MeetingInfoBarProps = { elapsedSeconds: number; code: string }

/** m:ss under an hour, h:mm:ss over it. */
export function formatElapsed(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

export function MeetingInfoBar({ elapsedSeconds, code }: MeetingInfoBarProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-[13.5px] text-fg-2">
      <span className="tabular-nums">{formatElapsed(elapsedSeconds)}</span>
      <span className="truncate text-fg-3">· {code}</span>
    </div>
  )
}
```

`apps/web/src/components/JoinCodeField.tsx`:
```tsx
import { Video } from 'lucide-react'

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
          className="w-[170px] border-0 bg-transparent text-fg outline-none placeholder:text-fg-3"
        />
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-full px-4 py-2.5 text-[14px] font-semibold text-blue hover:bg-blue/15"
        >
          Join
        </button>
      </div>
      {error && (
        <p id="join-code-error" role="alert" className="mt-2 text-[13px] text-red">
          {error}
        </p>
      )}
    </div>
  )
}
```

`apps/web/src/components/ScreenShareTile.tsx`:
```tsx
import { useEffect, useRef } from 'react'

export type ScreenShareTileProps = { presenterName: string; stream?: MediaStream }

export function ScreenShareTile({ presenterName, stream }: ScreenShareTileProps) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = video.current
    if (!el || !stream) return
    el.srcObject = stream
    return () => {
      el.srcObject = null
    }
  }, [stream])

  return (
    <div
      data-testid="screen-share-tile"
      className="relative h-full w-full overflow-hidden rounded-[18px] border border-[var(--edge)] bg-[rgba(255,255,255,0.04)]"
    >
      {stream ? (
        <video ref={video} autoPlay playsInline muted className="h-full w-full object-contain" />
      ) : (
        <div className="grid h-full place-items-center text-fg-3">Waiting for the screen…</div>
      )}
      <span className="absolute left-2.5 top-2.5 rounded-full border border-[var(--edge)] bg-black/50 px-2.5 py-1 text-[11.5px] font-medium backdrop-blur-[14px]">
        {presenterName} is presenting
      </span>
    </div>
  )
}
```

`apps/web/src/components/LanguagePicker.tsx`:
```tsx
import { FLOOR, LANGUAGES } from '@koine/shared'

export type LanguagePickerProps = {
  speak: string
  hear: string
  onChange: (which: 'speak' | 'hear', code: string) => void
}

const SELECT =
  'w-full cursor-pointer appearance-none rounded-[12px] border border-[var(--edge)] bg-[var(--well)] px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-blue'

export function LanguagePicker({ speak, hear, onChange }: LanguagePickerProps) {
  return (
    <div className="flex w-full gap-2">
      <label className="flex flex-1 flex-col gap-1.5 text-left">
        <span className="pl-0.5 text-[11.5px] text-fg-3">I speak</span>
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
        <span className="pl-0.5 text-[11.5px] text-fg-3">I hear</span>
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
```

`apps/web/src/components/DevicePreview.tsx`:
```tsx
import { Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { ControlButton } from './ControlButton'

export type DevicePreviewProps = {
  stream?: MediaStream
  micOn: boolean
  cameraOn: boolean
  onToggle: (device: 'mic' | 'camera') => void
}

export function DevicePreview({ stream, micOn, cameraOn, onToggle }: DevicePreviewProps) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = video.current
    if (!el || !stream) return
    el.srcObject = stream
    return () => {
      el.srcObject = null
    }
  }, [stream])

  return (
    <div className="relative grid aspect-video w-full max-w-full place-items-center overflow-hidden rounded-[20px] border border-[var(--edge)] bg-[rgba(255,255,255,0.05)]">
      {stream && cameraOn ? (
        <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
      ) : (
        <p className="text-fg-2">Camera is off</p>
      )}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2.5">
        <ControlButton
          label={micOn ? 'Mute microphone' : 'Unmute microphone'}
          state={micOn ? 'default' : 'danger'}
          icon={micOn ? <Mic size={20} /> : <MicOff size={20} />}
          onClick={() => onToggle('mic')}
        />
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
```

- [ ] **Step 5: Write stories for the remaining three components**

`apps/web/src/components/ScreenShareTile.stories.tsx`, `LanguagePicker.stories.tsx` and
`DevicePreview.stories.tsx`. Each follows the same pattern — here is `LanguagePicker`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { LanguagePicker } from './LanguagePicker'

const meta: Meta<typeof LanguagePicker> = {
  title: 'Prejoin/LanguagePicker',
  component: LanguagePicker,
  args: { speak: 'en', hear: 'en', onChange: fn() },
}
export default meta
type Story = StoryObj<typeof LanguagePicker>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByLabelText('I speak')).toHaveValue('en')
    // 'Original audio' is only offered for hearing, never for speaking.
    await expect(within(c.getByLabelText('I hear')).getByText('Original audio')).toBeInTheDocument()
  },
}

export const ChangingHearCallsBack: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.selectOptions(within(canvasElement).getByLabelText('I hear'), 'es')
    await expect(args.onChange).toHaveBeenCalledWith('hear', 'es')
  },
}
```

For `ScreenShareTile` write `WaitingForStream` (asserts the waiting copy) and
`WithStream` (uses `fakeStream('Kenji')` from `.storybook/fakeStream.ts`, asserts a
`video` element exists). For `DevicePreview` write `CameraOff` (asserts "Camera is off")
and `Muted` (asserts `getByLabelText('Unmute microphone')`).

- [ ] **Step 6: Run the whole suite**

Run: `pnpm --filter @koine/web test`
Expected: PASS, all stories green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components packages/shared
git commit -m "feat(web): screen share, meeting info, device preview, language picker, join code"
```

---

### Task 7: Enforce the token rule

A constraint nobody can check by reading is a constraint that decays. This makes it a test.

**Files:**
- Create: `apps/web/src/styles/tokens.test.ts`

**Interfaces:**
- Consumes: every component file from Tasks 2–6
- Produces: a failing test the moment someone writes a hex literal in a component

- [ ] **Step 1: Write the failing test**

`apps/web/src/styles/tokens.test.ts`:
```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const COMPONENTS = join(import.meta.dirname, '..', 'components')

// rgba() with a plain white or black channel is how translucent glass is written
// and is allowed. A hex literal is a colour that escaped the token file.
const HEX = /#[0-9a-fA-F]{3,8}\b/g

it('no component contains a hex colour literal', () => {
  const offenders: string[] = []

  for (const file of readdirSync(COMPONENTS)) {
    if (!file.endsWith('.tsx') || file.endsWith('.stories.tsx')) continue
    const source = readFileSync(join(COMPONENTS, file), 'utf8')
    const found = source.match(HEX)
    if (found) offenders.push(`${file}: ${found.join(', ')}`)
  }

  expect(offenders, `Move these into src/styles/tokens.css:\n${offenders.join('\n')}`).toEqual([])
})
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @koine/web test tokens`
Expected: PASS if Tasks 2–6 were written correctly. **If it fails, that is a real finding** — move the offending colour into `tokens.css`, add a `--token` for it, and reference it via `var()`. Do not weaken the regex.

- [ ] **Step 3: Verify the test actually catches something**

Temporarily add `const x = '#ff0000'` to `apps/web/src/components/CaptionBox.tsx` and run: `pnpm --filter @koine/web test tokens`
Expected: FAIL naming `CaptionBox.tsx: #ff0000`. Remove the line.

A guard that has never been seen to fail is not known to work.

- [ ] **Step 4: Run the full check**

Run: `pnpm check && pnpm types && pnpm test`
Expected: all three exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles
git commit -m "test(web): enforce that colours live only in tokens.css"
```

---

## Done when

- [ ] Every component in the spec's inventory exists with stories covering its states
- [ ] `pnpm --filter @koine/web test` is green, including the token guard
- [ ] The a11y addon reports no violations on any story
- [ ] A grep for `#` in `src/components/*.tsx` returns nothing
- [ ] Storybook renders every component against flat black, with no background switcher

## Next

Plan 05 builds the containers that feed these components from LiveKit. No component
in this plan imports LiveKit, and none should.
