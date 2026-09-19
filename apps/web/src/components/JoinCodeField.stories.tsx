import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { JoinCodeField } from './JoinCodeField'

const meta: Meta<typeof JoinCodeField> = {
  title: 'Home/JoinCodeField',
  component: JoinCodeField,
  args: { value: '', onChange: fn(), onSubmit: fn() },
}
export default meta
type Story = StoryObj<typeof JoinCodeField>

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Meeting code or link')).toBeInTheDocument()
  },
}

export const WithError: Story = {
  args: {
    value: 'kxv-nvra-dwq',
    error: 'Meeting code not found — check the code or ask the host for the link',
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const input = c.getByLabelText('Meeting code or link')
    // The error must be associated, not merely nearby.
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(c.getByRole('alert')).toHaveTextContent(/not found/i)
  },
}

export const SubmitOnEnter: Story = {
  args: { value: 'kxv-nvra-dwq' },
  play: async ({ canvasElement, args }) => {
    await userEvent.type(within(canvasElement).getByLabelText('Meeting code or link'), '{Enter}')
    await expect(args.onSubmit).toHaveBeenCalled()
  },
}
