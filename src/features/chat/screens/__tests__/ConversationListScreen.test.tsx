import { screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { makeMessage, renderWithServices } from '../../../../test/fakes';
import { ConversationListScreen } from '../ConversationListScreen';

const seed = [
  makeMessage({ id: 'a', conversationId: 'old', content: 'Older chat', createdAt: 1000 }),
  makeMessage({ id: 'b', conversationId: 'new', content: 'Newer chat', createdAt: 2000 }),
  makeMessage({
    id: 'c',
    conversationId: 'new',
    role: 'assistant',
    content: 'The latest answer',
    createdAt: 3000,
  }),
];

describe('ConversationListScreen', () => {
  it('shows an empty state and starts a new chat', async () => {
    const onNew = jest.fn();
    await renderWithServices(<ConversationListScreen onOpen={jest.fn()} onNew={onNew} />);

    expect(await screen.findByRole('header', { name: 'No chats yet' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'New chat' }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('lists chats newest first with a preview, and opens one on press', async () => {
    const onOpen = jest.fn();
    await renderWithServices(<ConversationListScreen onOpen={onOpen} onNew={jest.fn()} />, {
      seed,
    });

    const rows = await screen.findAllByTestId('conversation-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/Newer chat/);
    expect(rows[0]).toHaveTextContent(/The latest answer/);
    expect(rows[1]).toHaveTextContent(/Older chat/);

    await userEvent.setup().press(rows[1]!);
    expect(onOpen).toHaveBeenCalledWith('old');
  });

  it('deletes a chat after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const { repository } = await renderWithServices(
      <ConversationListScreen onOpen={jest.fn()} onNew={jest.fn()} />,
      { seed },
    );

    const rows = await screen.findAllByTestId('conversation-row');
    await userEvent.setup().longPress(rows[0]!);

    expect(alert).toHaveBeenCalledWith('Delete this chat?', expect.any(String), expect.any(Array));
    expect(await screen.findAllByTestId('conversation-row')).toHaveLength(1);
    expect(await repository.listConversations()).toMatchObject([{ id: 'old' }]);
  });
});
