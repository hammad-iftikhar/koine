import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ChatPanel } from './ChatPanel'

const meta: Meta<typeof ChatPanel> = {
  title: 'Room/ChatPanel',
  component: ChatPanel,
  decorators: [
    (Story) => (
      <div style={{ width: 316, height: 520 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onSend: fn(),
    onClose: fn(),
    messages: [
      { id: '1', author: 'Kenji', time: '10:42', body: 'Slide 4 is the one we disagreed on.' },
      {
        id: '2',
        author: 'Mariam',
        time: '10:43',
        body: 'Puedo explicarlo en un minuto.',
        translated: 'I can explain it in a minute.',
      },
      { id: '3', author: 'You', time: '10:43', body: "Go ahead — I'll take notes.", own: true },
    ],
  },
}
export default meta
type Story = StoryObj<typeof ChatPanel>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // People assume chat is private. It is not, and the panel says so.
    await expect(c.getByText(/visible to everyone/i)).toBeInTheDocument()
    await expect(c.getByText('I can explain it in a minute.')).toBeInTheDocument()
  },
}

export const SendingCallsBack: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByLabelText('Send a message')
    await userEvent.type(input, 'Sounds good{Enter}')
    await expect(args.onSend).toHaveBeenCalledWith('Sounds good')
  },
}

export const ClosingCallsBack: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByLabelText('Close chat'))
    await expect(args.onClose).toHaveBeenCalled()
  },
}

export const EmptyMessageIsNotSent: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByLabelText('Send a message')
    await userEvent.type(input, '   {Enter}')
    await expect(args.onSend).not.toHaveBeenCalled()
  },
}

export const TranslationFailed: Story = {
  args: {
    messages: [
      {
        id: '1',
        author: 'Mariam',
        time: '10:44',
        body: 'Vale, lo vemos mañana.',
        translationFailed: true,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // The message is never hidden because it could not be translated.
    await expect(c.getByText('Vale, lo vemos mañana.')).toBeInTheDocument()
    await expect(c.getByText(/translation unavailable/i)).toBeInTheDocument()
  },
}
