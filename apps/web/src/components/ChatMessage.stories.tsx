import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ChatMessage } from './ChatMessage'

const meta: Meta<typeof ChatMessage> = {
  title: 'Room/ChatMessage',
  component: ChatMessage,
  decorators: [
    (Story) => (
      <div style={{ width: 300 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    author: 'Kenji',
    time: '10:42',
    body: 'Slide 4 is the one we disagreed on.',
  },
}
export default meta
type Story = StoryObj<typeof ChatMessage>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Kenji')).toBeInTheDocument()
    await expect(c.getByText('10:42')).toBeInTheDocument()
    await expect(c.getByText('Slide 4 is the one we disagreed on.')).toBeInTheDocument()
  },
}

export const WithTranslation: Story = {
  args: {
    author: 'Mariam',
    body: 'Puedo explicarlo en un minuto.',
    translated: 'I can explain it in a minute.',
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // The original stays visible alongside its translation.
    await expect(c.getByText('Puedo explicarlo en un minuto.')).toBeInTheDocument()
    await expect(c.getByText('I can explain it in a minute.')).toBeInTheDocument()
  },
}

export const Own: Story = {
  args: {
    author: 'You',
    body: "Go ahead — I'll take notes.",
    own: true,
    // Exercises the translated line rendered against the blue fill, so the
    // a11y gate scans that secondary-text combination too, not just the body.
    translated: 'Adelante, yo tomo notas.',
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByTestId('chat-message')).toHaveAttribute('data-own', 'true')
    await expect(c.getByText('Adelante, yo tomo notas.')).toBeInTheDocument()

    // `own` is never colour-only: an own bubble also mirrors its rounded
    // corner (tail on the opposite side) compared to someone else's message.
    const bubble = c.getByTestId('message-bubble')
    const style = getComputedStyle(bubble)
    await expect(style.borderBottomRightRadius).toBe('4px')
    await expect(style.borderBottomLeftRadius).toBe('14px')
  },
}

export const OwnTranslationFailed: Story = {
  // A message you sent can still fail to translate for another reader.
  // Covers the failed-translation line rendered against the own bubble's
  // blue fill, so the a11y gate scans that combination too.
  args: { author: 'You', body: "I'll send the slides after.", own: true, translationFailed: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText("I'll send the slides after.")).toBeInTheDocument()
    await expect(c.getByText(/translation unavailable/i)).toBeInTheDocument()
  },
}

export const OtherHasMirroredCorner: Story = {
  args: { author: 'Kenji', body: 'Not my message.', own: false },
  play: async ({ canvasElement }) => {
    const bubble = within(canvasElement).getByTestId('message-bubble')
    const style = getComputedStyle(bubble)
    await expect(style.borderBottomLeftRadius).toBe('4px')
    await expect(style.borderBottomRightRadius).toBe('14px')
  },
}

export const TranslationFailed: Story = {
  args: {
    author: 'Mariam',
    body: 'Vale, lo vemos mañana.',
    translationFailed: true,
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // The message is never hidden because it could not be translated.
    await expect(c.getByText('Vale, lo vemos mañana.')).toBeInTheDocument()
    await expect(c.getByText(/translation unavailable/i)).toBeInTheDocument()
  },
}
