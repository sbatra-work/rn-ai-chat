import { makeMessage } from '../../../../test/fakes';
import { openTestDatabase } from '../../../../test/nodeSqlite';
import { titleFrom, type ChatRepository } from '../chatRepository';
import { createMemoryChatRepository } from '../memoryChatRepository';
import { createSqliteChatRepository, getOrCreateDeviceId, migrate } from '../sqliteChatRepository';

/**
 * One set of tests, run against both implementations. The in-memory
 * repository is what the screen tests use, so it has to behave the same
 * way as the SQLite one the app ships with.
 */
const implementations: [string, () => Promise<ChatRepository>][] = [
  ['in-memory', async () => createMemoryChatRepository()],
  [
    'SQLite',
    async () => {
      const db = openTestDatabase();
      await migrate(db);
      return createSqliteChatRepository(db);
    },
  ],
];

describe.each(implementations)('%s chat repository', (_name, create) => {
  let repository: ChatRepository;
  beforeEach(async () => {
    repository = await create();
  });

  it('starts empty', async () => {
    expect(await repository.listConversations()).toEqual([]);
    expect(await repository.getMessages('missing')).toEqual([]);
  });

  it('creates the conversation with the first message and titles it from the question', async () => {
    await repository.saveMessage(
      makeMessage({ content: '  What is\n streaming?  ', createdAt: 10 }),
    );

    expect(await repository.listConversations()).toEqual([
      { id: 'c1', title: 'What is streaming?', preview: '  What is\n streaming?  ', updatedAt: 10 },
    ]);
  });

  it('returns messages oldest first with every field intact', async () => {
    const question = makeMessage({ id: 'q', createdAt: 1 });
    const answer = makeMessage({
      id: 'a',
      role: 'assistant',
      content: 'partial',
      status: 'error',
      errorMessage: 'Connection lost.',
      retryable: false,
      createdAt: 2,
    });
    await repository.saveMessage(answer);
    await repository.saveMessage(question);

    expect(await repository.getMessages('c1')).toEqual([question, answer]);
  });

  it('replaces a message saved again with the same id', async () => {
    await repository.saveMessage(makeMessage({ id: 'q', createdAt: 1 }));
    const failed = makeMessage({
      id: 'a',
      role: 'assistant',
      content: '',
      status: 'error',
      errorMessage: 'x',
      createdAt: 2,
    });
    await repository.saveMessage(failed);
    await repository.saveMessage({
      ...failed,
      content: 'It worked',
      status: 'complete',
      errorMessage: undefined,
    });

    const messages = await repository.getMessages('c1');
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({
      id: 'a',
      conversationId: 'c1',
      role: 'assistant',
      content: 'It worked',
      status: 'complete',
      createdAt: 2,
    });
  });

  it('lists conversations by latest activity and previews the latest text', async () => {
    await repository.saveMessage(
      makeMessage({ id: '1', conversationId: 'a', content: 'A', createdAt: 1 }),
    );
    await repository.saveMessage(
      makeMessage({ id: '2', conversationId: 'b', content: 'B', createdAt: 2 }),
    );
    await repository.saveMessage(
      makeMessage({
        id: '3',
        conversationId: 'a',
        role: 'assistant',
        content: 'Reply',
        createdAt: 3,
      }),
    );
    // An empty stopped answer must not blank out the preview.
    await repository.saveMessage(
      makeMessage({
        id: '4',
        conversationId: 'b',
        role: 'assistant',
        content: '',
        status: 'cancelled',
        createdAt: 2,
      }),
    );

    expect(await repository.listConversations()).toEqual([
      { id: 'a', title: 'A', preview: 'Reply', updatedAt: 3 },
      { id: 'b', title: 'B', preview: 'B', updatedAt: 2 },
    ]);
  });

  it('keeps conversations separate', async () => {
    await repository.saveMessage(makeMessage({ id: '1', conversationId: 'a' }));
    await repository.saveMessage(makeMessage({ id: '2', conversationId: 'b' }));

    expect(await repository.getMessages('a')).toHaveLength(1);
    expect((await repository.getMessages('b'))[0]?.id).toBe('2');
  });

  it('deletes a conversation together with its messages', async () => {
    await repository.saveMessage(makeMessage({ id: '1', conversationId: 'a' }));
    await repository.saveMessage(makeMessage({ id: '2', conversationId: 'b' }));

    await repository.deleteConversation('a');

    expect((await repository.listConversations()).map((c) => c.id)).toEqual(['b']);
    expect(await repository.getMessages('a')).toEqual([]);
  });
});

describe('SQLite specifics', () => {
  it('can run migrations again without changing anything', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const repository = createSqliteChatRepository(db);
    await repository.saveMessage(makeMessage());

    await migrate(db);

    expect(await repository.getMessages('c1')).toHaveLength(1);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 1 });
  });

  it('reads a row left in the streaming state as stopped', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const repository = createSqliteChatRepository(db);
    await repository.saveMessage(makeMessage({ role: 'assistant', status: 'streaming' }));

    expect((await repository.getMessages('c1'))[0]?.status).toBe('cancelled');
  });

  it('makes the device id once and then keeps it', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const generate = jest.fn().mockReturnValueOnce('first-id').mockReturnValueOnce('second-id');

    expect(await getOrCreateDeviceId(db, generate)).toBe('first-id');
    expect(await getOrCreateDeviceId(db, generate)).toBe('first-id');
  });
});

describe('titleFrom', () => {
  it('collapses whitespace and shortens long text', () => {
    expect(titleFrom('  two\n\nlines ')).toBe('two lines');
    const title = titleFrom('word '.repeat(40));
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith('…')).toBe(true);
  });
});
