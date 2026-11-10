import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { LIMITS } from '../../../../shared/protocol';
import { ChatApiError } from '../../../lib/api/chatClient';
import { useServices } from '../../../lib/services';
import { buildContext } from '../state/buildContext';
import { chatReducer, initialChatState, isStreaming, retryTarget } from '../state/chatReducer';
import type { Message } from '../types';

export interface UseChat {
  /** False until saved messages have been read from storage. */
  loaded: boolean;
  messages: Message[];
  streaming: boolean;
  canRetry: boolean;
  send: (text: string) => void;
  /** Stop the answer that is arriving. Text received so far is kept. */
  cancel: () => void;
  retry: () => void;
}

/**
 * Runs one conversation: loads it, sends messages, streams answers into
 * state, and saves the result.
 *
 * Saving happens once per message, when it ends, not once per token.
 * If the app is killed while an answer is arriving, the question is already
 * saved and the chat reopens with a retry button.
 */
export function useChat(conversationId: string): UseChat {
  const { repository, chatClient, newId } = useServices();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const abortRef = useRef<AbortController | null>(null);

  // Callbacks read the latest state from here, so they keep a stable identity.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    let active = true;
    repository
      .getMessages(conversationId)
      .then((messages) => active && dispatch({ type: 'loaded', messages }))
      .catch(() => active && dispatch({ type: 'loaded', messages: [] }));
    return () => {
      active = false;
      // Leaving the screen stops the request. The partial answer is saved.
      abortRef.current?.abort();
    };
  }, [conversationId, repository]);

  const streamAnswer = useCallback(
    async (history: Message[], answer: Message) => {
      const controller = new AbortController();
      abortRef.current = controller;
      let content = '';
      let final: Pick<Message, 'status' | 'errorMessage' | 'retryable'>;

      try {
        const outcome = await chatClient.streamChat({
          messages: buildContext(history),
          signal: controller.signal,
          onDelta: (text) => {
            content += text;
            dispatch({ type: 'delta', id: answer.id, text });
          },
        });
        final = {
          status: outcome === 'stop' ? 'complete' : outcome === 'refusal' ? 'refused' : 'cancelled',
        };
      } catch (error) {
        const known = error instanceof ChatApiError;
        final = {
          status: 'error',
          errorMessage: known ? error.message : 'Something went wrong.',
          retryable: known ? error.retryable : true,
        };
      }

      if (abortRef.current === controller) abortRef.current = null;
      dispatch({ type: 'finished', id: answer.id, ...final });

      if (final.status === 'error') {
        AccessibilityInfo.announceForAccessibility(`Error: ${final.errorMessage}`);
      } else if (final.status !== 'cancelled') {
        AccessibilityInfo.announceForAccessibility(`Assistant: ${content}`);
      }

      await repository.saveMessage({ ...answer, content, ...final }).catch(() => {
        // Storage failed. The answer stays on screen for this session.
      });
    },
    [chatClient, repository],
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      const current = stateRef.current;
      if (
        content === '' ||
        content.length > LIMITS.maxMessageChars ||
        !current.loaded ||
        isStreaming(current)
      ) {
        return;
      }

      const now = Date.now();
      const question: Message = {
        id: newId(),
        conversationId,
        role: 'user',
        content,
        status: 'complete',
        createdAt: now,
      };
      const answer: Message = {
        id: newId(),
        conversationId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: now + 1,
      };

      dispatch({ type: 'upserted', messages: [question, answer] });
      // The question is saved first, so it survives even if the answer never comes.
      void repository
        .saveMessage(question)
        .catch(() => {})
        .then(() => streamAnswer([...current.messages, question], answer));
    },
    [conversationId, newId, repository, streamAnswer],
  );

  const retry = useCallback(() => {
    const current = stateRef.current;
    const target = retryTarget(current);
    if (!target || isStreaming(current)) return;

    if (target.role === 'user') {
      // A question with no answer: start a fresh answer for it.
      const answer: Message = {
        id: newId(),
        conversationId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: Date.now(),
      };
      dispatch({ type: 'upserted', messages: [answer] });
      void streamAnswer(current.messages, answer);
      return;
    }

    // A failed or stopped answer: run it again in the same slot.
    const answer: Message = {
      id: target.id,
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: target.createdAt,
    };
    dispatch({ type: 'upserted', messages: [answer] });
    void streamAnswer(
      current.messages.filter((message) => message.id !== target.id),
      answer,
    );
  }, [conversationId, newId, streamAnswer]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return {
    loaded: state.loaded,
    messages: state.messages,
    streaming: isStreaming(state),
    canRetry: !isStreaming(state) && retryTarget(state) !== null,
    send,
    cancel,
    retry,
  };
}
