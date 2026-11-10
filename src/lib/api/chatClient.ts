import {
  DEVICE_ID_HEADER,
  parseErrorBody,
  parseStreamEvent,
  type ChatRequest,
  type ChatTurn,
  type ErrorCode,
  type FinishReason,
} from '../../../shared/protocol';
import { createSseParser } from '../../../shared/sse';

/**
 * Typed client for the chat endpoint.
 *
 * It knows HTTP and the stream format and nothing about React, storage or
 * screens. `fetchFn` is passed in, so tests drive it with a plain function
 * and the app passes the streaming `fetch` from `expo/fetch`.
 */

/** `network` and `bad_response` are detected on the device. The rest come from the server. */
export type ChatErrorCode = ErrorCode | 'network' | 'bad_response';

export class ChatApiError extends Error {
  override name = 'ChatApiError';
  readonly code: ChatErrorCode;

  constructor(code: ChatErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }

  /** False when sending the same request again cannot succeed. */
  get retryable(): boolean {
    return this.code !== 'invalid_request' && this.code !== 'too_long';
  }
}

/** The small part of `fetch` this client needs. */
export type FetchLike = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  body: ReadableStream<Uint8Array> | null;
}>;

export type StreamOutcome = FinishReason | 'cancelled';

export interface StreamChatParams {
  messages: ChatTurn[];
  /** Abort to cancel. The promise then resolves with "cancelled". */
  signal: AbortSignal;
  /** Called with each piece of the answer, in order. */
  onDelta: (text: string) => void;
}

export interface ChatClient {
  streamChat(params: StreamChatParams): Promise<StreamOutcome>;
}

interface ClientOptions {
  baseUrl: string;
  fetchFn: FetchLike;
  getDeviceId: () => Promise<string>;
}

const FALLBACK_MESSAGES: Partial<Record<number, string>> = {
  429: 'Too many requests. Please wait a moment and try again.',
  413: 'That message is too long.',
};

export function createChatClient({ baseUrl, fetchFn, getDeviceId }: ClientOptions): ChatClient {
  return {
    async streamChat({ messages, signal, onDelta }) {
      const request: ChatRequest = { messages };

      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await fetchFn(`${baseUrl}/v1/chat`, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
            [DEVICE_ID_HEADER]: await getDeviceId(),
          },
          body: JSON.stringify(request),
        });
      } catch (error) {
        if (signal.aborted) return 'cancelled';
        throw new ChatApiError('network', 'Could not reach the server.', { cause: error });
      }

      if (!response.ok) {
        const body = parseErrorBody(await response.json().catch(() => null));
        if (body) throw new ChatApiError(body.error.code, body.error.message);
        throw new ChatApiError(
          'bad_response',
          FALLBACK_MESSAGES[response.status] ?? `The server returned ${response.status}.`,
        );
      }
      if (!response.body) {
        throw new ChatApiError('bad_response', 'The server sent an empty response.');
      }

      let outcome: FinishReason | undefined;
      let streamError: ChatApiError | undefined;
      const parser = createSseParser((message) => {
        // Anything after the final event is ignored.
        if (outcome !== undefined || streamError !== undefined) return;
        const event = parseStreamEvent(message.data);
        if (!event) return; // unknown event from a newer server
        if (event.type === 'delta') onDelta(event.text);
        else if (event.type === 'done') outcome = event.finishReason;
        else streamError = new ChatApiError(event.code, event.message);
      });

      const reader = response.body.getReader();
      // `stream: true` keeps a character that is split across two chunks intact.
      const decoder = new TextDecoder();
      try {
        while (outcome === undefined && streamError === undefined) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        if (signal.aborted) return 'cancelled';
        throw new ChatApiError('network', 'The connection was lost.', { cause: error });
      } finally {
        reader.cancel().catch(() => {});
      }

      if (streamError) throw streamError;
      if (outcome) return outcome;
      if (signal.aborted) return 'cancelled';
      throw new ChatApiError('network', 'The connection closed before the answer finished.');
    },
  };
}
