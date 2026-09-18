# 02 — Design System

The approved design is the prototype at `koine-meet` — dark only, flat black
ground, Apple glass materials, Google Meet layout placement.

## Rules

**Dark only.** No light mode, no theme toggle, no `prefers-color-scheme` branch.

**Flat black ground.** No gradients in backgrounds. Surfaces that need to read as
raised use a translucent white fill, not a gradient.

**Glass is for things that float.** The app surface is black. Translucency and
`backdrop-filter` are reserved for the control capsule, the chat panel, the
caption box, name pills and the code field — chrome that sits *over* content.

## Tokens

Defined once as CSS custom properties and mapped into Tailwind v4's `@theme`.
Nothing hardcodes a hex value.

```css
--ink:      #000000;                    /* app ground */
--pane:     rgba(255,255,255,.07);      /* floating surface */
--pane2:    rgba(255,255,255,.11);      /* hover / raised control */
--edge:     rgba(255,255,255,.12);      /* hairline border */
--edge-top: rgba(255,255,255,.22);      /* inset highlight */
--well:     rgba(0,0,0,.34);            /* inset field */

--fg:  #F5F5F7;  --fg-2: #A1A1AA;  --fg-3: #6E6E76;

--blue:  #0A84FF;   /* primary, active speaker, active toggle */
--red:   #FF453A;   /* mic muted, leave */
--green: #30D158;   /* connected */
--amber: #FF9F0A;   /* degraded connection */

--blur: blur(28px) saturate(180%);
--lift: 0 18px 44px -22px rgba(0,0,0,.9);
```

Type: **Schibsted Grotesk**, one family. `font-variant-numeric: tabular-nums` on
timers, counts and meeting codes.

### Colour meanings

Three states, three colours, no overlap:

| | Means | Where |
|---|---|---|
| Blue | Active / you | Active speaker ring, enabled toggles, primary buttons, your own chat |
| Red | Off or out | Mic muted, leave button |
| Amber | Degraded | Weak connection only |

Green is reserved for a connected confirmation and is not used for anything else.
A state is never signalled by colour alone — the mic icon changes shape as well.

## Layout placement

Taken from Google Meet, deliberately:

- **Bottom-left** — elapsed time, meeting code
- **Bottom-centre** — controls in a floating capsule: mic, camera, captions, raise
  hand, present, more, leave
- **Bottom-right** — panel toggles: details, people with count, chat, languages
- **Right panel** — chat shrinks the grid rather than overlaying it
- **Tiles** — name bottom-left, mic state top-right, blue ring on active speaker
- **Captions** — floating above the control bar, centred, max 640px

## Component inventory

Presentational components take props only and each has a story. Containers call
LiveKit hooks, contain no styling, and have no stories.

```
components/                          presentational
  ParticipantTile     { name, speaking, muted, cameraOff, stream?, pinned }
  ScreenShareTile     { presenterName, stream? }
  SpeakingBars        { active }                    one primitive, three uses
  ControlBar          { mic, camera, captions, hand, presenting, onToggle, onLeave }
  ControlButton       { icon, label, state: 'default'|'active'|'danger' }
  PanelToggles        { activePanel, participantCount, onOpen }
  CaptionBox          { speaker, original, translated, sourceLang }
  ChatPanel           { messages, onSend, onClose }
  ChatMessage         { author, time, body, translated? , own }
  MeetingInfoBar      { elapsedSeconds, code }
  DevicePreview       { stream?, micOn, cameraOn, onToggle }
  LanguagePicker      { speak, hear, onChange }
  JoinCodeField       { value, onChange, onSubmit, error? }

containers/                          LiveKit wiring, no styling
  RoomGrid            useTracks / useParticipants → ParticipantTile[]
  LiveCaptions        data-channel subscription   → CaptionBox
  RoomChat            data channel + REST history → ChatPanel
  LocalControls       device state                → ControlBar
```

`SpeakingBars` is one component doing three jobs: the speaking indicator in a
tile, the mic-live indicator in the control bar, and the input level meter in
pre-join. Build it once.

## Grid behaviour at 25+

- LiveKit speaker detection orders tiles; the active speaker is never paginated
  off screen
- At most 9 tiles rendered; the rest collapse into an overflow count
- Small tiles subscribe to the low simulcast layer, the large tile to high
- Screen share takes the large slot and demotes participants to a strip

## Performance switch

`backdrop-filter` is expensive beside nine live `<video>` elements. A setting —
default auto — drops blur to a flat `--pane` fill when the frame budget is
missed. Structure the CSS so this is one class on the root, not a rewrite.

## Accessibility

- Every control has an `aria-label`; icon-only buttons are not left unlabelled
- `:focus-visible` is styled, never removed
- `prefers-reduced-motion` stops the speaking bars and any transition
- Captions meet contrast against their own backing, not against the video
- The a11y addon runs on every story and fails CI on violations

## Carried over from the mockup

The prototype shows a **"Rec" chip** in the bottom-left. Recording is not in v1.
Remove the chip, or gate it behind a flag that ships off. Do not implement it.

## Done when

- Every component above exists with a story covering its states
- Tokens live in one file; a grep for `#` in component CSS returns nothing
- Stories pass a11y checks in CI
- The room screen matches the approved prototype at 1440px, 900px and 400px
