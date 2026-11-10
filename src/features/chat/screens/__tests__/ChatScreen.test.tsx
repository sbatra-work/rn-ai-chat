import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { act, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { LIMITS } from '../../../../../shared/protocol';
import { ChatApiError } from '../../../../lib/api/chatClient';
import { makeMessage, renderWithServices } from '../../../../test/fakes';
import { ChatScreen } from '../ChatScreen';

const mockedNetInfo = jest.mocked(NetInfo);

/** Make the device report a connection state, as NetInfo would. */
async function setOnline(online: boolean): Promise<void> {
  const listener = mockedNetInfo.addEventListener.mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('The screen has not subscribed to NetInfo.');
  await act(async () =>
    listener({ isConnected: online, isInternetReachable: online } as NetInfoState),
  );
}

async function ask(text: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Message'), text);
  await user.press(screen.getByRole('button', { name: 'Send' }));
}

function bubbles(role: 'user' | 'assistant'): string[] {
  return screen.queryAllByTestId(`message-${role}`).map((node) => node.props.accessibilityLabel);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

describe('ChatScreen', () => {
  it('shows an empty state with a disabled send button', async () => {
    await renderWithServices(<ChatScreen conversationId="c1" />);

    expect(await screen.findByRole('header', { name: 'Ask anything' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('streams an answer piece by piece and saves it when done', async () => {
    const { client, repository } = await renderWithServices(<ChatScreen conversationId="c1" />);

    await ask('What is SSE?');

    // The question shows at once, with a placeholder for the answer.
    expect(bubbles('user')).toEqual(['You: What is SSE?']);
    expect(bubbles('assistant')).toEqual(['Assistant is thinking']);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeOnTheScreen();
    expect(client.requests[0]?.messages).toEqual([{ role: 'user', content: 'What is SSE?' }]);

    await client.emit('Server-sent ');
    expect(bubbles('assistant')).toEqual(['Assistant: Server-sent ']);

    await client.emit('events.');
    expect(bubbles('assistant')).toEqual(['Assistant: Server-sent events.']);

    await client.finish();
    expect(screen.getByRole('button', { name: 'Send' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Assistant: Server-sent events.',
    );

    expect(await repository.getMessages('c1')).toMatchObject([
      { role: 'user', content: 'What is SSE?', status: 'complete' },
      { role: 'assistant', content: 'Server-sent events.', status: 'complete' },
    ]);
  });

  it('clears the input after sending', async () => {
    await renderWithServices(<ChatScreen conversationId="c1" />);
    await ask('hello');
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('');
  });

  it('sends earlier turns as context', async () => {
    const { client } = await renderWithServices(<ChatScreen conversationId="c1" />, {
      seed: [
        makeMessage({ id: 'a', content: 'First question' }),
        makeMessage({ id: 'b', role: 'assistant', content: 'First answer', createdAt: 2 }),
      ],
    });

    await ask('Follow up');

    expect(client.requests[0]?.messages).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Follow up' },
    ]);
  });

  it('stops on cancel and keeps the text that already arrived', async () => {
    const { client, repository } = await renderWithServices(<ChatScreen conversationId="c1" />);
    await ask('Tell me a long story');
    await client.emit('Once upon');

    await userEvent.setup().press(screen.getByRole('button', { name: 'Stop' }));

    expect(client.requests[0]?.signal.aborted).toBe(true);
    expect(await screen.findByText('Stopped')).toBeOnTheScreen();
    expect(bubbles('assistant')).toEqual(['Assistant: Once upon. Stopped']);
    expect(screen.getByRole('button', { name: 'Send' })).toBeOnTheScreen();
    expect(await repository.getMessages('c1')).toMatchObject([
      { role: 'user' },
      { role: 'assistant', content: 'Once upon', status: 'cancelled' },
    ]);
  });

  it('shows the error with a retry button, and retry replaces the failed answer', async () => {
    const { client, repository } = await renderWithServices(<ChatScreen conversationId="c1" />);
    await ask('Will this work?');
    await client.emit('It might');
    await client.fail(new ChatApiError('upstream_error', 'The model stopped responding.'));

    expect(await screen.findByText('The model stopped responding.')).toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Error: The model stopped responding.',
    );

    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry' }));

    // The failed text is not sent back as context, and there is still one answer slot.
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1]?.messages).toEqual([{ role: 'user', content: 'Will this work?' }]);
    expect(bubbles('assistant')).toEqual(['Assistant is thinking']);

    await client.emit('Yes.');
    await client.finish();

    expect(screen.queryByText('The model stopped responding.')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeOnTheScreen();
    expect(await repository.getMessages('c1')).toMatchObject([
      { role: 'user', content: 'Will this work?' },
      { role: 'assistant', content: 'Yes.', status: 'complete' },
    ]);
  });

  it('offers no retry for an error that retrying cannot fix', async () => {
    const { client } = await renderWithServices(<ChatScreen conversationId="c1" />);
    await ask('hello');
    await client.fail(new ChatApiError('too_long', 'That message is too long.'));

    expect(await screen.findByText('That message is too long.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeOnTheScreen();
  });

  it('marks a refused request and offers no retry', async () => {
    const { client } = await renderWithServices(<ChatScreen conversationId="c1" />);
    await ask('something not allowed');
    await client.emit("I can't help with that.");
    await client.finish('refusal');

    expect(await screen.findByText('Request declined')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeOnTheScreen();
  });

  it('loads a saved conversation', async () => {
    await renderWithServices(<ChatScreen conversationId="c1" />, {
      seed: [
        makeMessage({ id: 'a', content: 'Saved question' }),
        makeMessage({ id: 'b', role: 'assistant', content: 'Saved answer', createdAt: 2 }),
      ],
    });

    expect(await screen.findByText('Saved question')).toBeOnTheScreen();
    expect(screen.getByText('Saved answer')).toBeOnTheScreen();
  });

  it('offers a retry for a saved question that never got an answer', async () => {
    const { client } = await renderWithServices(<ChatScreen conversationId="c1" />, {
      seed: [makeMessage({ content: 'Asked just before the app closed' })],
    });

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Retry' }));

    expect(client.requests[0]?.messages).toEqual([
      { role: 'user', content: 'Asked just before the app closed' },
    ]);
  });

  it('pauses sending while offline and resumes when back online', async () => {
    const { client } = await renderWithServices(<ChatScreen conversationId="c1" />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Message'), 'Are you there?');

    await setOnline(false);
    expect(screen.getByRole('alert')).toHaveTextContent(/You are offline/);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'Send' }));
    expect(client.requests).toHaveLength(0);

    await setOnline(true);
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    // The draft is still there.
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('Are you there?');

    await user.press(screen.getByRole('button', { name: 'Send' }));
    expect(client.requests).toHaveLength(1);
  });

  it('blocks a message over the length cap and says why', async () => {
    const { client } = await renderWithServices(<ChatScreen conversationId="c1" />);
    const user = userEvent.setup();

    await user.paste(
      await screen.findByLabelText('Message'),
      'x'.repeat(LIMITS.maxMessageChars + 1),
    );

    expect(screen.getByTestId('char-counter')).toHaveTextContent(
      `Too long: ${LIMITS.maxMessageChars + 1} of ${LIMITS.maxMessageChars} characters`,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(client.requests).toHaveLength(0);
  });

  it('starts a chat from a suggestion', async () => {
    const { client } = await renderWithServices(<ChatScreen conversationId="c1" />);

    await userEvent
      .setup()
      .press(await screen.findByRole('button', { name: 'How does streaming work?' }));

    expect(client.requests[0]?.messages).toEqual([
      { role: 'user', content: 'How does streaming work?' },
    ]);
  });
});
