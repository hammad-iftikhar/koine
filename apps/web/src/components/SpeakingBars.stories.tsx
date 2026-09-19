import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { SpeakingBars } from './SpeakingBars'

const meta: Meta<typeof SpeakingBars> = {
  title: 'Primitives/SpeakingBars',
  component: SpeakingBars,
}
export default meta

type Story = StoryObj<typeof SpeakingBars>

export const Speaking: Story = {
  args: { active: true },
  play: async ({ canvasElement }) => {
    const el = within(canvasElement).getByTestId('speaking-bars')
    await expect(el).toHaveAttribute('data-active', 'true')
    await expect(el.children).toHaveLength(3)
  },
}

export const Silent: Story = {
  args: { active: false },
  play: async ({ canvasElement }) => {
    const el = within(canvasElement).getByTestId('speaking-bars')
    await expect(el).toHaveAttribute('data-active', 'false')
  },
}
