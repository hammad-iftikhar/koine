import type { Meta, StoryObj } from '@storybook/react-vite'
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
