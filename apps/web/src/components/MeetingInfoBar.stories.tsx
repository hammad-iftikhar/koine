import type { Meta, StoryObj } from '@storybook/react-vite'
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
