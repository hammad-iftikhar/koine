import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { fakeStream } from '@/lib/fakeStream'
import { DevicePreview, type DevicePreviewProps } from './DevicePreview'

/**
 * `DevicePreview` takes props only, so a story that actually toggles the
 * camera (rather than just asserting the click callback fires) needs a thin
 * stateful wrapper to flip `cameraOn` the way a real container would.
 */
function StatefulDevicePreview(props: DevicePreviewProps) {
  const [cameraOn, setCameraOn] = useState(props.cameraOn)
  return (
    <DevicePreview
      {...props}
      cameraOn={cameraOn}
      onToggle={(device) => {
        if (device === 'camera') setCameraOn((v) => !v)
        props.onToggle(device)
      }}
    />
  )
}

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

export const WithStream: Story = {
  args: { stream: fakeStream('You') },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('video')).toBeTruthy()
  },
}

export const StreamSurvivesCameraToggle: Story = {
  // Toggling the camera off and on again with the *same* MediaStream mounts
  // a fresh <video> element (it swaps with a "Camera is off" paragraph in
  // between). The video must still get its srcObject set on the way back —
  // regression coverage for useVideoStream re-attaching per element, not
  // just per stream.
  args: { stream: fakeStream('You') },
  render: (args) => <StatefulDevicePreview {...args} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByLabelText('Turn off camera'))
    await expect(c.getByText('Camera is off')).toBeInTheDocument()

    await userEvent.click(c.getByLabelText('Turn on camera'))
    const video = canvasElement.querySelector('video')
    await expect(video).toBeTruthy()
    await expect(video?.srcObject).toBeTruthy()
  },
}
