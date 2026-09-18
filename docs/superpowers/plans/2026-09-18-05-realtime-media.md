# Koine Realtime Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two or more browsers see and hear each other through the self-hosted SFU, with working mute, camera, screen share, speaking indicators and reconnection.

**Architecture:** Containers call LiveKit hooks and render the presentational components from plan 02. No component imports LiveKit; no container contains styling. Every meeting uses the SFU at every size — peer-to-peer was rejected, and the reasoning is in the spec.

**Tech Stack:** livekit-client, @livekit/components-react (hooks only, not the prebuilt UI), React 19, Playwright.

**Spec:** [`../specs/2026-09-18-koine/05-realtime-media.md`](../specs/2026-09-18-koine/05-realtime-media.md)

## Global Constraints

- **Node 22**, pnpm, TypeScript. Test-first.
- **Hooks only.** Do not import LiveKit's prebuilt UI components — the design is already built.
- **Containers hold LiveKit calls; components take props.** A container has no story; a component has no LiveKit import.
- **Never test LiveKit itself.** Test our wiring.
- **Mute disables the track; it never republishes it** — republishing flickers for everyone else.
- **A muted participant is never shown as speaking** (enforced in plan 02's component).
- **Colour is never the only signal.**
- **Recording is out of scope.**
- Dark theme only; colours from tokens.

---

## File Structure

```
apps/web/src/containers/
  RoomConnection.tsx        token → <LiveKitRoom>; owns nothing else
  RoomGrid.tsx              useTracks → ParticipantTile[] / ScreenShareTile
  LocalControls.tsx         device state → ControlBar
  ConnectionBanner.tsx      reconnecting / failed states
apps/web/src/lib/
  useLocalDevices.ts        mute + camera, enable/disable semantics
  useLocalDevices.test.ts
  grid.ts                   ordering + pagination, pure
  grid.test.ts
apps/web/src/routes/
  Room.tsx                  /m/:code
apps/web/e2e/
  call.spec.ts              the two-browser spec
```

---

### Task 1: Grid ordering and pagination

Pure logic first, because it is the part with a right answer and no I/O.

**Files:**
- Create: `apps/web/src/lib/grid.ts`, `apps/web/src/lib/grid.test.ts`

**Interfaces:**
- Produces:
```ts
type GridEntry = { identity: string; name: string; speaking: boolean; isSelf: boolean }
function orderTiles(entries: GridEntry[], maxVisible?: number): { visible: GridEntry[]; overflow: number }
```

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { type GridEntry, orderTiles } from './grid'

const person = (identity: string, over: Partial<GridEntry> = {}): GridEntry => ({
  identity,
  name: identity,
  speaking: false,
  isSelf: false,
  ...over,
})

describe('orderTiles', () => {
  it('shows everyone when the room is small', () => {
    const { visible, overflow } = orderTiles([person('a'), person('b'), person('c')])
    expect(visible).toHaveLength(3)
    expect(overflow).toBe(0)
  })

  it('caps at nine and reports the remainder', () => {
    const many = Array.from({ length: 25 }, (_, i) => person(`p${i}`))
    const { visible, overflow } = orderTiles(many)
    expect(visible).toHaveLength(9)
    expect(overflow).toBe(16)
  })

  it('never paginates the active speaker off screen', () => {
    // The bug this prevents: someone talks, and the person who needs to see
    // them is on page two. It is the whole reason ordering exists.
    const many = Array.from({ length: 25 }, (_, i) => person(`p${i}`))
    many[20] = person('p20', { speaking: true })

    const { visible } = orderTiles(many)
    expect(visible.map((p) => p.identity)).toContain('p20')
    expect(visible[0]?.identity).toBe('p20')
  })

  it('keeps self visible even in a full room', () => {
    const many = Array.from({ length: 25 }, (_, i) => person(`p${i}`))
    many[22] = person('p22', { isSelf: true })
    expect(orderTiles(many).visible.map((p) => p.identity)).toContain('p22')
  })

  it('puts the speaker ahead of self when both compete', () => {
    const many = Array.from({ length: 25 }, (_, i) => person(`p${i}`))
    many[5] = person('p5', { isSelf: true })
    many[20] = person('p20', { speaking: true })
    expect(orderTiles(many).visible[0]?.identity).toBe('p20')
  })

  it('is stable for equal entries so tiles do not shuffle every render', () => {
    const many = Array.from({ length: 12 }, (_, i) => person(`p${i}`))
    expect(orderTiles(many).visible.map((p) => p.identity)).toEqual(
      orderTiles(many).visible.map((p) => p.identity),
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @koine/web test grid`
Expected: FAIL — cannot resolve `./grid`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/grid.ts`:
```ts
export type GridEntry = {
  identity: string
  name: string
  speaking: boolean
  isSelf: boolean
}

const MAX_VISIBLE = 9

/**
 * Speakers first, then self, then everyone else in arrival order.
 *
 * `Array.prototype.sort` is stable in every engine we target, so equal entries
 * keep their relative order and tiles do not shuffle on each render — a
 * comparator that returns 0 must not be "improved" into a tiebreaker.
 */
export function orderTiles(
  entries: GridEntry[],
  maxVisible = MAX_VISIBLE,
): { visible: GridEntry[]; overflow: number } {
  const rank = (e: GridEntry) => (e.speaking ? 0 : e.isSelf ? 1 : 2)
  const ordered = [...entries].sort((a, b) => rank(a) - rank(b))

  return {
    visible: ordered.slice(0, maxVisible),
    overflow: Math.max(0, ordered.length - maxVisible),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @koine/web test grid`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/grid.ts apps/web/src/lib/grid.test.ts
git commit -m "feat(web): tile ordering that never paginates the speaker away"
```

---

### Task 2: Device control

**Files:**
- Create: `apps/web/src/lib/useLocalDevices.ts`, `apps/web/src/lib/useLocalDevices.test.ts`

**Interfaces:**
- Produces: `useLocalDevices(room: Room | undefined)` returning `{ micOn, cameraOn, toggleMic, toggleCamera }`
- Produces: `applyMicState(room, on)` and `applyCameraState(room, on)` — pure enough to test without a room.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/useLocalDevices.test.ts`:
```ts
import { expect, it, vi } from 'vitest'
import { applyCameraState, applyMicState } from './useLocalDevices'

function fakeRoom() {
  const setMicrophoneEnabled = vi.fn(async () => {})
  const setCameraEnabled = vi.fn(async () => {})
  const unpublishTrack = vi.fn(async () => {})
  return {
    room: { localParticipant: { setMicrophoneEnabled, setCameraEnabled, unpublishTrack } },
    setMicrophoneEnabled,
    setCameraEnabled,
    unpublishTrack,
  }
}

it('mutes by disabling the track, not by unpublishing it', async () => {
  // Unpublishing tears down the subscription for every other participant and
  // shows a visible flicker on their screens. Disabling is silent.
  const f = fakeRoom()
  await applyMicState(f.room as never, false)

  expect(f.setMicrophoneEnabled).toHaveBeenCalledWith(false)
  expect(f.unpublishTrack).not.toHaveBeenCalled()
})

it('turns the camera off by disabling the track', async () => {
  const f = fakeRoom()
  await applyCameraState(f.room as never, false)
  expect(f.setCameraEnabled).toHaveBeenCalledWith(false)
  expect(f.unpublishTrack).not.toHaveBeenCalled()
})

it('is a no-op without a room rather than throwing', async () => {
  await expect(applyMicState(undefined, true)).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @koine/web test useLocalDevices`
Expected: FAIL — module missing.

- [ ] **Step 3: Install and implement**

Run: `pnpm --filter @koine/web add livekit-client @livekit/components-react`

`apps/web/src/lib/useLocalDevices.ts`:
```ts
import type { Room } from 'livekit-client'
import { useCallback, useState } from 'react'

export async function applyMicState(room: Room | undefined, on: boolean): Promise<void> {
  await room?.localParticipant.setMicrophoneEnabled(on)
}

export async function applyCameraState(room: Room | undefined, on: boolean): Promise<void> {
  await room?.localParticipant.setCameraEnabled(on)
}

export function useLocalDevices(room: Room | undefined, initial = { mic: true, camera: true }) {
  const [micOn, setMicOn] = useState(initial.mic)
  const [cameraOn, setCameraOn] = useState(initial.camera)

  const toggleMic = useCallback(async () => {
    const next = !micOn
    // Optimistic: the indicator must move the instant the user clicks, or they
    // click twice and end up back where they started.
    setMicOn(next)
    try {
      await applyMicState(room, next)
    } catch {
      setMicOn(!next)
    }
  }, [room, micOn])

  const toggleCamera = useCallback(async () => {
    const next = !cameraOn
    setCameraOn(next)
    try {
      await applyCameraState(room, next)
    } catch {
      setCameraOn(!next)
    }
  }, [room, cameraOn])

  return { micOn, cameraOn, toggleMic, toggleCamera }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @koine/web test useLocalDevices`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(web): device control that disables rather than republishes"
```

---

### Task 3: Room containers

**Files:**
- Create: `apps/web/src/containers/RoomConnection.tsx`, `RoomGrid.tsx`, `LocalControls.tsx`, `ConnectionBanner.tsx`
- Create: `apps/web/src/routes/Room.tsx`
- Modify: `apps/web/src/router.tsx`

**Interfaces:**
- Consumes: `JoinResponse` in `sessionStorage` under `koine:<code>` (written by plan 04's PreJoin)
- Produces: route `/m/:code`

- [ ] **Step 1: Write the connection container**

`apps/web/src/containers/RoomConnection.tsx`:
```tsx
import { LiveKitRoom } from '@livekit/components-react'
import type { JoinResponse } from '@koine/shared'
import type { ReactNode } from 'react'

export function RoomConnection({
  credentials,
  onLeave,
  children,
}: {
  credentials: JoinResponse
  onLeave: () => void
  children: ReactNode
}) {
  return (
    <LiveKitRoom
      token={credentials.livekitToken}
      serverUrl={credentials.livekitUrl}
      connect
      audio
      video
      onDisconnected={onLeave}
      options={{
        // Small tiles do not need full resolution, and on self-hosted
        // infrastructure the egress saving is ours to keep.
        publishDefaults: { simulcast: true },
        adaptiveStream: true,
        dynacast: true,
      }}
    >
      {children}
    </LiveKitRoom>
  )
}
```

`adaptiveStream` and `dynacast` are the two settings that make 25 participants
viable: the first drops the resolution of tiles that are small or off screen, the
second stops the SFU forwarding layers nobody is watching.

- [ ] **Step 2: Write the grid container**

`apps/web/src/containers/RoomGrid.tsx`:
```tsx
import {
  useLocalParticipant,
  useParticipants,
  useTracks,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { ParticipantTile } from '../components/ParticipantTile'
import { ScreenShareTile } from '../components/ScreenShareTile'
import { type GridEntry, orderTiles } from '../lib/grid'

export function RoomGrid() {
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()

  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: true })
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true })
  const share = screenTracks[0]

  const entries: GridEntry[] = participants.map((p) => ({
    identity: p.identity,
    name: p.name || p.identity,
    speaking: p.isSpeaking,
    isSelf: p.identity === localParticipant.identity,
  }))

  const { visible, overflow } = orderTiles(entries, share ? 4 : 9)

  const streamFor = (identity: string) => {
    const pub = cameraTracks.find((t) => t.participant.identity === identity)
    const track = pub?.publication?.track
    return track ? new MediaStream([track.mediaStreamTrack]) : undefined
  }

  const mutedFor = (identity: string) =>
    !participants.find((p) => p.identity === identity)?.isMicrophoneEnabled

  return (
    <div className="grid h-full min-h-0 w-full gap-2.5 md:grid-cols-2">
      {share && (
        <div className="md:col-span-2">
          <ScreenShareTile
            presenterName={share.participant.name || share.participant.identity}
            stream={
              share.publication?.track
                ? new MediaStream([share.publication.track.mediaStreamTrack])
                : undefined
            }
          />
        </div>
      )}

      {visible.map((entry) => (
        <ParticipantTile
          key={entry.identity}
          name={entry.name}
          speaking={entry.speaking}
          muted={mutedFor(entry.identity)}
          cameraOff={!streamFor(entry.identity)}
          stream={streamFor(entry.identity)}
          isSelf={entry.isSelf}
        />
      ))}

      {overflow > 0 && (
        <div className="grid place-items-center rounded-[18px] border border-[var(--edge)] bg-[var(--pane)] text-fg-2">
          +{overflow} more
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write the controls container**

`apps/web/src/containers/LocalControls.tsx`:
```tsx
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { useState } from 'react'
import { ControlBar } from '../components/ControlBar'
import { useLocalDevices } from '../lib/useLocalDevices'

export function LocalControls({
  captions,
  onToggleCaptions,
  onLeave,
}: {
  captions: boolean
  onToggleCaptions: () => void
  onLeave: () => void
}) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const { micOn, cameraOn, toggleMic, toggleCamera } = useLocalDevices(room)
  const [hand, setHand] = useState(false)

  const presenting = localParticipant.isScreenShareEnabled

  return (
    <ControlBar
      mic={micOn}
      camera={cameraOn}
      captions={captions}
      hand={hand}
      presenting={presenting}
      onToggle={async (control) => {
        if (control === 'mic') await toggleMic()
        else if (control === 'camera') await toggleCamera()
        else if (control === 'captions') onToggleCaptions()
        else if (control === 'hand') setHand((h) => !h)
        else if (control === 'present') {
          // One screen share at a time. Starting a second replaces the first,
          // which LiveKit handles; we only flip our own.
          await localParticipant.setScreenShareEnabled(!presenting)
        }
      }}
      onLeave={onLeave}
    />
  )
}
```

- [ ] **Step 4: Write the connection banner**

`apps/web/src/containers/ConnectionBanner.tsx`:
```tsx
import { useConnectionState } from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'

export function ConnectionBanner() {
  const state = useConnectionState()
  if (state === ConnectionState.Connected) return null

  // An empty grid with no explanation is how a reconnect looks like a crash.
  const message =
    state === ConnectionState.Reconnecting
      ? 'Reconnecting…'
      : state === ConnectionState.Connecting
        ? 'Joining the meeting…'
        : 'You have been disconnected. Rejoin from the meeting link.'

  return (
    <div
      role="status"
      className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-[var(--edge)] bg-black/70 px-4 py-2 text-[13px] backdrop-blur-[28px]"
    >
      {message}
    </div>
  )
}
```

- [ ] **Step 5: Write the route**

`apps/web/src/routes/Room.tsx`:
```tsx
import { JoinResponse } from '@koine/shared'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { MeetingInfoBar } from '../components/MeetingInfoBar'
import { PanelToggles, type PanelName } from '../components/PanelToggles'
import { ConnectionBanner } from '../containers/ConnectionBanner'
import { LocalControls } from '../containers/LocalControls'
import { RoomConnection } from '../containers/RoomConnection'
import { RoomGrid } from '../containers/RoomGrid'
import { useElapsed } from '../lib/useElapsed'

export function Room() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [panel, setPanel] = useState<PanelName | null>(null)
  const [captions, setCaptions] = useState(true)
  const elapsed = useElapsed()

  const raw = sessionStorage.getItem(`koine:${code}`)
  const parsed = raw ? JoinResponse.safeParse(JSON.parse(raw)) : null

  // Arriving here without credentials means a refresh or a shared URL. Send
  // them through pre-join rather than showing a broken room.
  if (!parsed?.success) return <Navigate to={`/j/${code}`} replace />

  return (
    <RoomConnection credentials={parsed.data} onLeave={() => navigate('/')}>
      <div className="grid h-dvh grid-rows-[1fr_auto] bg-ink">
        <div className="relative min-h-0 p-3">
          <ConnectionBanner />
          <RoomGrid />
        </div>

        <div className="grid grid-cols-1 items-center gap-3 px-4 pb-4 pt-2.5 md:grid-cols-[1fr_auto_1fr]">
          <div className="hidden md:block">
            <MeetingInfoBar elapsedSeconds={elapsed} code={code} />
          </div>
          <div className="justify-self-center">
            <LocalControls
              captions={captions}
              onToggleCaptions={() => setCaptions((c) => !c)}
              onLeave={() => navigate('/')}
            />
          </div>
          <div className="hidden md:block">
            <PanelToggles active={panel} participantCount={0} onOpen={setPanel} />
          </div>
        </div>
      </div>
    </RoomConnection>
  )
}
```

`apps/web/src/lib/useElapsed.ts`:
```ts
import { useEffect, useState } from 'react'

export function useElapsed(): number {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return Math.floor((now - start) / 1000)
}
```

Add to `apps/web/src/router.tsx`:
```tsx
{ path: '/m/:code', element: <Room /> },
```
importing `Room` from `./routes/Room`.

- [ ] **Step 6: Verify the app builds and typechecks**

Run: `pnpm types && pnpm --filter @koine/web build`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): room containers wired to livekit hooks"
```

---

### Task 4: The two-browser call

The highest-value test in the project. Everything before this was preparation.

**Files:**
- Create: `apps/web/e2e/call.spec.ts`

**Interfaces:**
- Consumes: the whole stack — API, LiveKit, and the routes from plan 04 and Task 3

- [ ] **Step 1: Write the spec**

`apps/web/e2e/call.spec.ts`:
```ts
import { type Browser, type Page, expect, test } from '@playwright/test'

const API = process.env.VITE_API_URL ?? 'http://localhost:3000'

async function createMeeting(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post(`${API}/api/meetings`, {
    data: { floorLang: 'en' },
    headers: { 'x-test-user': 'u_e2e_host' },
  })
  expect(res.ok(), 'meeting creation must succeed').toBeTruthy()
  return (await res.json()).code as string
}

async function join(browser: Browser, code: string, name: string): Promise<Page> {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const page = await context.newPage()

  await page.goto(`/j/${code}`)
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Join now' }).click()
  await expect(page).toHaveURL(new RegExp(`/m/${code}`))

  return page
}

test.describe('a real call between two browsers', () => {
  test('each participant renders the other', async ({ browser, request }) => {
    const code = await createMeeting(request)

    const alice = await join(browser, code, 'Alice')
    const bob = await join(browser, code, 'Bob')

    // The assertion the whole architecture exists to make true: media crossed
    // the SFU and arrived somewhere else.
    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })

    await alice.close()
    await bob.close()
  })

  test('muting shows on the other side', async ({ browser, request }) => {
    const code = await createMeeting(request)
    const alice = await join(browser, code, 'Alice')
    const bob = await join(browser, code, 'Bob')

    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })
    await alice.getByLabel('Mute microphone').click()

    // Bob sees Alice's tile carry the mute indicator. Two indicators exist on
    // Bob's screen (his own and Alice's), so scope to her tile.
    const aliceTile = bob.getByTestId('participant-tile').filter({ hasText: 'Alice' })
    await expect(aliceTile.getByLabel('Microphone off')).toBeVisible({ timeout: 10_000 })

    await alice.close()
    await bob.close()
  })

  test('a screen share appears for the other participant', async ({ browser, request }) => {
    const code = await createMeeting(request)
    const alice = await join(browser, code, 'Alice')
    const bob = await join(browser, code, 'Bob')

    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })
    await alice.getByLabel('Present now').click()

    await expect(bob.getByTestId('screen-share-tile')).toBeVisible({ timeout: 15_000 })
    await expect(bob.getByText('Alice is presenting')).toBeVisible()

    await alice.close()
    await bob.close()
  })
})
```

Screen share needs Chromium to auto-select a source. Add to the `launchOptions.args`
in `apps/web/playwright.config.ts`:
```ts
'--auto-select-desktop-capture-source=Entire screen',
'--auto-accept-this-tab-capture',
```

- [ ] **Step 2: Start the full stack**

Run: `docker compose --profile apps up -d`
Then: `docker compose ps`
Expected: postgres and redis healthy; livekit, api, web up.

- [ ] **Step 3: Run the spec**

Run: `pnpm --filter @koine/web e2e call`
Expected: PASS — 3 tests.

**If the participant list populates but no tile appears**, the cause is almost
certainly `rtc.node_ip` in `docker/livekit.dev.yaml`. Check
`docker compose logs livekit | grep nodeIP` reports `127.0.0.1`. That symptom
logs no error anywhere, which is why the spec calls it out.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "test(web): two-browser call, mute and screen share"
```

---

### Task 5: Reconnection

Where meeting apps feel broken, and invisible in a happy-path demo.

**Files:**
- Modify: `apps/web/src/containers/RoomConnection.tsx`
- Create: `apps/web/e2e/reconnect.spec.ts`

**Interfaces:**
- Consumes: Task 3's containers

- [ ] **Step 1: Write the failing spec**

`apps/web/e2e/reconnect.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

const API = process.env.VITE_API_URL ?? 'http://localhost:3000'

test('mute survives a reconnect', async ({ browser, request }) => {
  const res = await request.post(`${API}/api/meetings`, {
    data: { floorLang: 'en' },
    headers: { 'x-test-user': 'u_e2e_host' },
  })
  const code = (await res.json()).code as string

  const context = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const page = await context.newPage()

  await page.goto(`/j/${code}`)
  await page.getByLabel('Your name').fill('Alice')
  await page.getByRole('button', { name: 'Join now' }).click()
  await expect(page.getByLabel('Mute microphone')).toBeVisible({ timeout: 15_000 })

  await page.getByLabel('Mute microphone').click()
  await expect(page.getByLabel('Unmute microphone')).toBeVisible()

  // Drop the network, let LiveKit notice, restore it.
  await context.setOffline(true)
  await expect(page.getByRole('status')).toContainText(/reconnect/i, { timeout: 20_000 })
  await context.setOffline(false)

  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 30_000 })

  // The bug this catches: state is restored from whatever the server last saw,
  // so a reconnect silently unmutes someone who thought they were muted.
  await expect(page.getByLabel('Unmute microphone')).toBeVisible()

  await context.close()
})
```

- [ ] **Step 2: Run to verify it fails or is flaky**

Run: `pnpm --filter @koine/web e2e reconnect`
Expected: FAIL — mute state is not reapplied after the reconnect.

- [ ] **Step 3: Reapply local state on reconnect**

Modify `apps/web/src/containers/RoomConnection.tsx` to accept and restore device state:
```tsx
import { LiveKitRoom, useRoomContext } from '@livekit/components-react'
import type { JoinResponse } from '@koine/shared'
import { RoomEvent } from 'livekit-client'
import { useEffect, type ReactNode } from 'react'
import { applyCameraState, applyMicState } from '../lib/useLocalDevices'

function RestoreDeviceState({ micOn, cameraOn }: { micOn: boolean; cameraOn: boolean }) {
  const room = useRoomContext()

  useEffect(() => {
    const restore = () => {
      // From local state, never from what the server last saw. The server's
      // view can be stale by exactly the window that caused the reconnect.
      void applyMicState(room, micOn)
      void applyCameraState(room, cameraOn)
    }
    room.on(RoomEvent.Reconnected, restore)
    return () => {
      room.off(RoomEvent.Reconnected, restore)
    }
  }, [room, micOn, cameraOn])

  return null
}

export function RoomConnection({
  credentials,
  micOn,
  cameraOn,
  onLeave,
  children,
}: {
  credentials: JoinResponse
  micOn: boolean
  cameraOn: boolean
  onLeave: () => void
  children: ReactNode
}) {
  return (
    <LiveKitRoom
      token={credentials.livekitToken}
      serverUrl={credentials.livekitUrl}
      connect
      audio
      video
      onDisconnected={onLeave}
      options={{
        publishDefaults: { simulcast: true },
        adaptiveStream: true,
        dynacast: true,
      }}
    >
      <RestoreDeviceState micOn={micOn} cameraOn={cameraOn} />
      {children}
    </LiveKitRoom>
  )
}
```

Lift `micOn`/`cameraOn` into `Room.tsx` so both `RoomConnection` and `LocalControls`
read the same state: call `useLocalDevices(undefined)` in `Room.tsx`, pass the values
down, and have `LocalControls` take them as props instead of calling the hook itself.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @koine/web e2e reconnect`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "fix(web): reapply device state after reconnect from local state"
```

---

## Done when

- [ ] Two browsers see and hear each other through the self-hosted SFU
- [ ] Mute, camera and screen share work and are reflected on the other side
- [ ] A nine-participant room renders without dropped frames with blur on
- [ ] The reconnect spec passes
- [ ] A token minted for room A cannot join room B (plan 04's test still green)

## Next

Plan 06 adds the translation agent. It subscribes to the microphone tracks this
plan publishes and adds `tr:<lang>` tracks alongside them.
