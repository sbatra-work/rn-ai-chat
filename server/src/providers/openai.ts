import type { ChatTurn } from '../../../shared/protocol.ts';
import { createSseParser } from '../../../shared/sse.ts';
import { UpstreamError, type ChatProvider } from './types.ts';

const SYSTEM_PROMPT =
  'You are a helpful assistant inside a mobile chat app. ' +
  'Keep answers short and use plain text, because the app does not render markdown.';

interface Options {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Injected so tests can run without a network. */
  fetchFn?: typeof fetch;
}

function extractDelta(data: string): string {
  try {
    const parsed = JSON.parse(data) as {
      choices?: { delta?: { content?: unknown } }[];
    };
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === 'string' ? content : '';
  } catch {
    return '';
  }
}

/**
 * Streams from any service that speaks the OpenAI chat completions API.
 * The key is added here, on the server. It never reaches the app.
 */
export function createOpenAiProvider({
  apiKey,
  baseUrl,
  model,
  fetchFn = fetch,
}: Options): ChatProvider {
  return {
    async *stream(messages: ChatTurn[], signal: AbortSignal) {
      let response: Response;
      try {
        response = await fetchFn(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            stream: true,
            max_tokens: 600,
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          }),
        });
      } catch (error) {
        if (signal.aborted) return;
        throw new UpstreamError('Could not reach the model service.', { cause: error });
      }

      if (!response.ok || !response.body) {
        // The upstream body can hold account details, so it is logged by the
        // caller and never forwarded to the app.
        throw new UpstreamError(`The model service returned ${response.status}.`);
      }

      const pending: string[] = [];
      let finished = false;
      const parser = createSseParser((message) => {
        if (message.data === '[DONE]') {
          finished = true;
          return;
        }
        const delta = extractDelta(message.data);
        if (delta) pending.push(delta);
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
          yield* pending.splice(0);
        }
      } catch (error) {
        if (signal.aborted) return;
        throw new UpstreamError('The model stream was cut off.', { cause: error });
      } finally {
        reader.cancel().catch(() => {});
      }
    },
  };
}
