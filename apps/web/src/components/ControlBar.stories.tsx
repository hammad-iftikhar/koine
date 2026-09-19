import type { Meta, StoryObj } from '@storybook/react-vite'
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
    for (const label of [
      'Mute microphone',
      'Turn off camera',
      'Turn on captions',
      'Raise hand',
      'Present now',
      'Leave call',
    ]) {
      await expect(c.getByLabelText(label)).toBeInTheDocument()
    }
    // Mic-live indicator: the same SpeakingBars primitive used in a tile and
    // in pre-join must also render beside the control-bar mic button.
    await expect(c.getByTestId('speaking-bars')).toHaveAttribute('data-active', 'true')
  },
}

export const Muted: Story = {
  args: { mic: false },
  play: async ({ canvasElement }) => {
    // Label flips with state: it names what the click will do.
    const btn = within(canvasElement).getByLabelText('Unmute microphone')
    await expect(btn).toHaveAttribute('data-state', 'danger')
    await expect(within(canvasElement).getByTestId('speaking-bars')).toHaveAttribute(
      'data-active',
      'false',
    )
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

export const SomeoneElsePresenting: Story = {
  args: { presentDisabled: true },
  play: async ({ canvasElement }) => {
    // Unavailable, and it says why — "Present now" greyed out explains nothing.
    const btn = within(canvasElement).getByLabelText('Someone else is presenting')
    await expect(btn).toBeDisabled()
  },
}
