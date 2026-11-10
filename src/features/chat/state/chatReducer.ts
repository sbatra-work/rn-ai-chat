import type { Message } from '../types';

/**
 * All changes to the message list go through this reducer. It is a pure
 * function, so every streaming case can be tested without a screen.
 */

export interface ChatState {
  /** False until saved messages have been read from storage. */
  loaded: boolean;
  messages: Message[];
}

export const initialChatState: ChatState = { loaded: false, messages: [] };

type FinalFields = Pick<Message, 'status' | 'errorMessage' | 'retryable'>;

export type ChatAction =
  | { type: 'loaded'; messages: Message[] }
  /** Add new messages, or replace ones with the same id (used by retry). */
  | { type: 'upserted'; messages: Message[] }
  | { type: 'delta'; id: string; text: string }
  | ({ type: 'finished'; id: string } & FinalFields);

function update(messages: Message[], id: string, change: (message: Message) => Message): Message[] {
  return messages.map((message) => (message.id === id ? change(message) : message));
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'loaded':
      return { loaded: true, messages: action.messages };

    case 'upserted': {
      const incoming = new Map(action.messages.map((message) => [message.id, message]));
      const messages = state.messages.map((message) => {
        const replacement = incoming.get(message.id);
        incoming.delete(message.id);
        return replacement ?? message;
      });
      return { ...state, messages: [...messages, ...incoming.values()] };
    }

    case 'delta':
      return {
        ...state,
        messages: update(state.messages, action.id, (message) =>
          // A late delta must not reopen a message that has already ended.
          message.status === 'streaming'
            ? { ...message, content: message.content + action.text }
            : message,
        ),
      };

    case 'finished':
      return {
        ...state,
        messages: update(state.messages, action.id, (message) => ({
          ...message,
          status: action.status,
          errorMessage: action.errorMessage,
          retryable: action.retryable,
        })),
      };
  }
}

export function isStreaming(state: ChatState): boolean {
  return state.messages.at(-1)?.status === 'streaming';
}

/**
 * The message a retry would act on, or null when there is nothing to retry.
 *
 * Two cases: the last answer failed or was stopped, or the last message is
 * a question with no answer (the app was closed while the answer was arriving).
 */
export function retryTarget(state: ChatState): Message | null {
  const last = state.messages.at(-1);
  if (!last) return null;
  if (last.role === 'user') return last;
  if ((last.status === 'error' || last.status === 'cancelled') && last.retryable !== false) {
    return last;
  }
  return null;
}
