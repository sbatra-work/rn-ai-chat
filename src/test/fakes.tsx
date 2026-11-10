import { act, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type { ChatRepository } from '../features/chat/storage/chatRepository';
import { createMemoryChatRepository } from './memoryChatRepository';
import type { Message } from '../features/chat/types';
import type { ChatClient, StreamChatParams, StreamOutcome } from '../lib/api/chatClient';
import { ServicesProvider, type Services } from '../lib/services';

/**
 * A chat client the test drives by hand: it decides when each piece of the
 * answer arrives and how the stream ends. This is what makes the streaming
 * states easy to pin down in a test.
 */
export interface ControlledClient extends ChatClient {
  /** One entry per request the screen has made. */
  requests: StreamChatParams[];
  emit(text: string): Promise<void>;
  finish(outcome?: StreamOutcome): Promise<void>;
  fail(error: Error): Promise<void>;
}

export function createControlledClient(): ControlledClient {
  let settle: { resolve: (outcome: StreamOutcome) => void; reject: (error: Error) => void } | null =
    null;
  const requests: StreamChatParams[] = [];

  function current(): StreamChatParams {
    const request = requests.at(-1);
    if (!request || !settle) throw new Error('No request is in flight.');
    return request;
  }

  return {
    requests,
    streamChat(params) {
      requests.push(params);
      return new Promise<StreamOutcome>((resolve, reject) => {
        settle = { resolve, reject };
        params.signal.addEventListener('abort', () => resolve('cancelled'));
      }).finally(() => {
        settle = null;
      });
    },
    emit: (text) => act(async () => current().onDelta(text)),
    finish: (outcome = 'stop') =>
      act(async () => {
        current();
        settle?.resolve(outcome);
      }),
    fail: (error) =>
      act(async () => {
        current();
        settle?.reject(error);
      }),
  };
}

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    role: 'user',
    content: 'hello',
    status: 'complete',
    createdAt: 1,
    ...overrides,
  };
}

interface TestServices {
  repository: ChatRepository;
  client: ControlledClient;
}

/** Render a screen with in-memory storage and a hand-driven chat client. */
export async function renderWithServices(
  ui: ReactElement,
  { seed = [] }: { seed?: Message[] } = {},
): Promise<TestServices> {
  const repository = createMemoryChatRepository(seed);
  const client = createControlledClient();
  let nextId = 0;
  const services: Services = {
    repository,
    chatClient: client,
    newId: () => `id-${++nextId}`,
  };
  await render(<ServicesProvider value={services}>{ui}</ServicesProvider>);
  return { repository, client };
}
