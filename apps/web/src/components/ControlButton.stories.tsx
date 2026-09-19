import type { Meta, StoryObj } from '@storybook/react-vite'
import { Mic } from 'lucide-react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ControlButton } from './ControlButton'

const meta: Meta<typeof ControlButton> = {
  title: 'Room/ControlButton',
  component: ControlButton,
  args: {
    label: 'Mute microphone',
    icon: <Mic size={20} />,
    onClick: fn(),
  },
}
export default meta
type Story = StoryObj<typeof ControlButton>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const btn = within(canvasElement).getByLabelText('Mute microphone')
    await expect(btn).toHaveAttribute('data-state', 'default')
  },
}

export const Active: Story = {
  args: { state: 'active' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Mute microphone')).toHaveAttribute(
      'data-state',
      'active',
    )
  },
}

export const Danger: Story = {
  args: { state: 'danger' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Mute microphone')).toHaveAttribute(
      'data-state',
      'danger',
    )
  },
}

export const Wide: Story = {
  args: { wide: true, label: 'Leave call' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Leave call')).toBeInTheDocument()
  },
}

export const Clicking: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByLabelText('Mute microphone'))
    await expect(args.onClick).toHaveBeenCalled()
  },
}
