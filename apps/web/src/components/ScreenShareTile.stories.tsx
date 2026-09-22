import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { fakeStream } from '@/lib/fakeStream'
import { ScreenShareTile } from './ScreenShareTile'

const meta: Meta<typeof ScreenShareTile> = {
  title: 'Room/ScreenShareTile',
  component: ScreenShareTile,
  args: { presenterName: 'Kenji' },
  decorators: [
    (Story) => (
      <div style={{ width: 480, height: 270 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ScreenShareTile>

export const WaitingForStream: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/waiting for the screen/i)).toBeInTheDocument()
  },
}

export const WithStream: Story = {
  args: { stream: fakeStream('Kenji') },
  play: async ({ canvasElement }) => {
    const tile = within(canvasElement).getByTestId('screen-share-tile')
    await expect(tile.querySelector('video')).toBeTruthy()
    await expect(within(canvasElement).getByText('Kenji is presenting')).toBeInTheDocument()
  },
}
