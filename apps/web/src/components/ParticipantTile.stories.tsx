import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { fakeStream } from '../../.storybook/fakeStream'
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

export const WithStream: Story = {
  args: { name: 'Priya', stream: fakeStream('Priya') },
  play: async ({ canvasElement }) => {
    const video = within(canvasElement).getByTestId('participant-tile').querySelector('video')
    await expect(video).toBeTruthy()
    await expect(video?.srcObject).toBeTruthy()
  },
}
