import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { CAPTION_DOCK, CaptionBox } from './CaptionBox'

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

export const Docked: Story = {
  args: {
    original:
      'Creo que deberíamos posponer la vista de reportes hasta el próximo ciclo, porque el equipo no va a terminar a tiempo.',
    translated:
      'I think we should postpone the reporting view until the next cycle, because the team will not finish in time.',
  },
  // The stage `LiveCaptions` renders into, at a width where the box should be
  // at its full 640px. The dock is imported rather than retyped so this
  // measures the real one.
  render: (args) => (
    <div className="relative h-[220px] w-[800px] bg-ink">
      <div className={CAPTION_DOCK}>
        <CaptionBox {...args} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // `w-[min(640px,92%)]` resolves its percentage against whatever the dock
    // leaves it. Shrink-to-fit plus `left-1/2` left it 92% of half the stage,
    // so a long caption wrapped into a narrow column and could never reach
    // 640px however wide the room got.
    const box = within(canvasElement).getByTestId('caption-box')
    await expect(Math.round(box.getBoundingClientRect().width)).toBe(640)
  },
}
