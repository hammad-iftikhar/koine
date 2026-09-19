import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { DevicePreview } from './DevicePreview'

const meta: Meta<typeof DevicePreview> = {
  title: 'Prejoin/DevicePreview',
  component: DevicePreview,
  args: { micOn: true, cameraOn: true, onToggle: fn() },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof DevicePreview>

export const CameraOff: Story = {
  args: { cameraOn: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Camera is off')).toBeInTheDocument()
  },
}

export const Muted: Story = {
  args: { micOn: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Unmute microphone')).toBeInTheDocument()
  },
}

export const TogglingCallsBack: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByLabelText('Mute microphone'))
    await expect(args.onToggle).toHaveBeenCalledWith('mic')
  },
}
