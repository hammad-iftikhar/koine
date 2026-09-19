import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { LanguagePicker } from './LanguagePicker'

const meta: Meta<typeof LanguagePicker> = {
  title: 'Prejoin/LanguagePicker',
  component: LanguagePicker,
  args: { speak: 'en', hear: 'en', onChange: fn() },
}
export default meta
type Story = StoryObj<typeof LanguagePicker>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByLabelText('I speak')).toHaveValue('en')
    // 'Original audio' is only offered for hearing, never for speaking.
    await expect(within(c.getByLabelText('I hear')).getByText('Original audio')).toBeInTheDocument()
  },
}

export const ChangingHearCallsBack: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.selectOptions(within(canvasElement).getByLabelText('I hear'), 'es')
    await expect(args.onChange).toHaveBeenCalledWith('hear', 'es')
  },
}
