import type { ChatTurn } from '../../../shared/protocol.ts';
import { UpstreamError, type ChatProvider } from './types.ts';

/**
 * A stand-in model that needs no key and no network.
 *
 * The same question always gets the same answer, so the app, the tests and
 * the screenshots all behave the same way on every machine.
 *
 * Send a message containing "simulate error" to make the stream fail
 * part way, which is how the app's error and retry states are exercised.
 */

const CANNED: { match: RegExp; answer: string }[] = [
  {
    match: /\bstream(ing|s|ed)?\b/i,
    answer:
      'Streaming sends the answer in small pieces as the model writes it. ' +
      'The server forwards each piece as a server-sent event, and the app adds it to the ' +
      'message on screen. You see the first words in well under a second instead of ' +
      'waiting for the whole reply.',
  },
  {
    match: /\boffline\b/i,
    answer:
      'When the device is offline the app shows a banner and turns off the send button. ' +
      'Your earlier conversations still open, because they are saved in SQLite on the ' +
      'device. Sending works again as soon as the connection is back.',
  },
  {
    match: /\b(hi|hello|hey)\b/i,
    answer: 'Hello! This is the fake model, so no API key is needed. Ask me anything.',
  },
];

export function fakeAnswer(question: string): string {
  const canned = CANNED.find((entry) => entry.match.test(question));
  if (canned) return canned.answer;

  const trimmed = question.trim().replace(/\s+/g, ' ');
  const quoted = trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
  return (
    `You asked: "${quoted}". This reply comes from the fake model, which runs with no ` +
    'API key and always gives the same answer to the same question. ' +
    'Set LLM_API_KEY on the server to talk to a real model.'
  );
}

/** Split text into word-sized pieces, keeping the spaces. */
export function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

export function createFakeProvider(delayMs: number): ChatProvider {
  return {
    async *stream(messages: ChatTurn[], signal: AbortSignal) {
      const question = messages[messages.length - 1]?.content ?? '';
      const failPartWay = /simulate error/i.test(question);
      const tokens = tokenize(fakeAnswer(question));

      for (const [index, token] of tokens.entries()) {
        if (signal.aborted) return;
        if (failPartWay && index === 6) {
          throw new UpstreamError('The model stopped responding. Please try again.');
        }
        yield token;
        await sleep(delayMs, signal);
      }
    },
  };
}
