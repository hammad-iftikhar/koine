import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { CaptionBox } from './CaptionBox'

const meta: Meta<typeof CaptionBox> = {
  title: 'Room/CaptionBox',
  component: CaptionBox,
  args: {
    speaker: 'Mariam',
    sourceLang: 'Spanish',
    original: 'Se movió la fecha al viernes.',
    translated: 'The deadline moved to Friday.',
  },
}
export default meta
type Story = StoryObj<typeof CaptionBox>

export const Final: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // Both lines present. A translation you cannot audit is one you cannot trust.
    const original = c.getByText('Se movió la fecha al viernes.')
    const translated = c.getByText('The deadline moved to Friday.')
    await expect(original).toBeInTheDocument()
    await expect(translated).toBeInTheDocument()
    await expect(c.getByText(/translated from Spanish/i)).toBeInTheDocument()

    // The one deliberate departure from Meet: the original stays visible
    // above its translation. Assert DOM order, not just presence — a
    // reordered layout must fail this.
    await expect(
      original.compareDocumentPosition(translated) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  },
}

export const Interim: Story = {
  args: { interim: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('caption-box')).toHaveAttribute(
      'data-interim',
      'true',
    )
  },
}

export const LongLine: Story = {
  args: {
    original:
      'Creo que deberíamos posponer la vista de reportes hasta el próximo ciclo, porque el equipo no va a terminar a tiempo.',
    translated:
      'I think we should postpone the reporting view until the next cycle, because the team will not finish in time.',
  },
  play: async ({ canvasElement }) => {
    // Text that outgrows its track must wrap, not clip.
    const box = within(canvasElement).getByTestId('caption-box')
    await expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1)
  },
}
