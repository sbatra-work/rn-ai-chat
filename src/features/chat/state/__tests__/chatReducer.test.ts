import { LIMITS } from '../../../../../shared/protocol';
import type { Message } from '../../types';
import { buildContext } from '../buildContext';
import {
  chatReducer,
  initialChatState,
  isStreaming,
  retryTarget,
  type ChatState,
} from '../chatReducer';

let counter = 0;
function message(overrides: Partial<Message> = {}): Message {
  counter += 1;
  return {
    id: `m${counter}`,
    conversationId: 'c1',
    role: 'user',
    content: 'hello',
    status: 'complete',
    createdAt: counter,
    ...overrides,
  };
}

function stateWith(...messages: Message[]): ChatState {
  return { loaded: true, messages };
}

describe('chatReducer', () => {
  it('marks the state as loaded', () => {
    const saved = [message()];
    expect(chatReducer(initialChatState, { type: 'loaded', messages: saved })).toEqual({
      loaded: true,
      messages: saved,
    });
  });

  it('adds new messages at the end', () => {
    const first = message();
    const question = message();
    const answer = message({ role: 'assistant', content: '', status: 'streaming' });
    const next = chatReducer(stateWith(first), { type: 'upserted', messages: [question, answer] });
    expect(next.messages).toEqual([first, question, answer]);
  });

  it('replaces a message with the same id in place', () => {
    const question = message();
    const failed = message({ role: 'assistant', status: 'error', errorMessage: 'x' });
    const fresh: Message = { ...failed, content: '', status: 'streaming', errorMessage: undefined };
    const next = chatReducer(stateWith(question, failed), { type: 'upserted', messages: [fresh] });
    expect(next.messages).toEqual([question, fresh]);
  });

  it('appends deltas to the streaming message only', () => {
    const question = message();
    const answer = message({ role: 'assistant', content: '', status: 'streaming' });
    let state = stateWith(question, answer);
    state = chatReducer(state, { type: 'delta', id: answer.id, text: 'Hel' });
    state = chatReducer(state, { type: 'delta', id: answer.id, text: 'lo' });
    expect(state.messages[1]?.content).toBe('Hello');
    expect(state.messages[0]).toBe(question);
  });

  it('ignores a delta that arrives after the message has ended', () => {
    const answer = message({ role: 'assistant', content: 'Done', status: 'cancelled' });
    const state = chatReducer(stateWith(answer), { type: 'delta', id: answer.id, text: ' late' });
    expect(state.messages[0]?.content).toBe('Done');
  });

  it('records how a message ended and keeps its text', () => {
    const answer = message({ role: 'assistant', content: 'Half an ans', status: 'streaming' });
    const state = chatReducer(stateWith(answer), {
      type: 'finished',
      id: answer.id,
      status: 'error',
      errorMessage: 'Connection lost.',
      retryable: true,
    });
    expect(state.messages[0]).toMatchObject({
      content: 'Half an ans',
      status: 'error',
      errorMessage: 'Connection lost.',
    });
  });
});

describe('isStreaming and retryTarget', () => {
  it('is streaming only while the last message is arriving', () => {
    expect(isStreaming(stateWith())).toBe(false);
    expect(isStreaming(stateWith(message({ role: 'assistant', status: 'streaming' })))).toBe(true);
    expect(isStreaming(stateWith(message({ role: 'assistant' })))).toBe(false);
  });

  it('offers no retry after a normal or refused answer', () => {
    expect(retryTarget(stateWith())).toBeNull();
    expect(retryTarget(stateWith(message(), message({ role: 'assistant' })))).toBeNull();
    expect(
      retryTarget(stateWith(message(), message({ role: 'assistant', status: 'refused' }))),
    ).toBeNull();
  });

  it('offers a retry for a failed or stopped answer', () => {
    const failed = message({ role: 'assistant', status: 'error' });
    const stopped = message({ role: 'assistant', status: 'cancelled' });
    expect(retryTarget(stateWith(message(), failed))).toBe(failed);
    expect(retryTarget(stateWith(message(), stopped))).toBe(stopped);
  });

  it('offers no retry when the error cannot be fixed by retrying', () => {
    const failed = message({ role: 'assistant', status: 'error', retryable: false });
    expect(retryTarget(stateWith(message(), failed))).toBeNull();
  });

  it('offers a retry for a question that never got an answer', () => {
    const question = message();
    expect(retryTarget(stateWith(question))).toBe(question);
  });
});

describe('buildContext', () => {
  it('sends roles and text only', () => {
    const turns = buildContext([
      message({ content: 'Q1' }),
      message({ role: 'assistant', content: 'A1' }),
      message({ content: 'Q2' }),
    ]);
    expect(turns).toEqual([
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
    ]);
  });

  it('leaves out failed and empty answers but keeps stopped ones', () => {
    const turns = buildContext([
      message({ content: 'Q1' }),
      message({ role: 'assistant', content: 'half', status: 'error' }),
      message({ content: 'Q2' }),
      message({ role: 'assistant', content: '', status: 'cancelled' }),
      message({ content: 'Q3' }),
      message({ role: 'assistant', content: 'stopped early', status: 'cancelled' }),
      message({ content: 'Q4' }),
    ]);
    expect(turns.map((turn) => turn.content)).toEqual(['Q1', 'Q2', 'Q3', 'stopped early', 'Q4']);
  });

  it('keeps only the newest turns when there are too many', () => {
    const many = Array.from({ length: LIMITS.maxMessages + 6 }, (_, index) =>
      message({ role: index % 2 === 0 ? 'user' : 'assistant', content: `turn ${index}` }),
    );
    many.push(message({ content: 'latest' }));
    const turns = buildContext(many);

    expect(turns.length).toBeLessThanOrEqual(LIMITS.maxMessages);
    expect(turns.at(-1)).toEqual({ role: 'user', content: 'latest' });
    expect(turns[0]?.role).toBe('user');
  });

  it('stays under the total character cap', () => {
    const big = 'x'.repeat(LIMITS.maxMessageChars);
    const turns = buildContext(Array.from({ length: 10 }, () => message({ content: big })));
    const total = turns.reduce((sum, turn) => sum + turn.content.length, 0);

    expect(total).toBeLessThanOrEqual(LIMITS.maxTotalChars);
    expect(turns).toHaveLength(Math.floor(LIMITS.maxTotalChars / LIMITS.maxMessageChars));
  });
});
