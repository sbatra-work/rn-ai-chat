import type { ChatTurn } from '../../../shared/protocol.ts';
import { UpstreamError, type ChatProvider } from './types.ts';

/**
 * A stand-in model that needs no key and no network.
 *
 * It answers a small set of questions about this app, so a demo reads like
 * a real conversation, and the same question always gets the same text. The
 * app, the tests and the screenshots behave the same way on every machine.
 *
 * One question is a failure demo: asking what happens when the connection
 * drops makes the stream fail part way on the first try and succeed on the
 * next, which is how the app's error and retry states are exercised.
 */

const TOPICS: { match: RegExp; answer: string }[] = [
  {
    match: /\bconnection\b.*\b(drops?|fails?|lost|cuts? out)\b/i,
    answer:
      'If the connection drops while an answer is arriving, the app keeps the text it ' +
      'already has and shows a Retry button under it. Retry asks for the answer again in ' +
      'the same place, so the chat never fills up with half-finished replies. Your question ' +
      'is saved on the device before the request is sent, so it is never lost.',
  },
  {
    match: /\bstream(ing|s|ed)?\b/i,
    answer:
      'Streaming sends the answer in small pieces as the model writes it. ' +
      'The server forwards each piece as a server-sent event, and the app adds it to the ' +
      'message on screen. You see the first words in well under a second instead of ' +
      'waiting for the whole reply.',
  },
  {
    match: /\boffline\b|\bno (internet|signal|network)\b/i,
    answer:
      'When the device is offline the app shows a banner and turns off the send button. ' +
      'Your earlier conversations still open, because they are saved in SQLite on the ' +
      'device. Sending works again as soon as the connection is back.',
  },
  {
    match: /\b(api )?keys?\b|\bsecur(e|ity)\b|\bsafe\b/i,
    answer:
      'The model API key never leaves the server. The app only knows the server address, ' +
      'and the server adds the key when it calls the model. The server also caps message ' +
      'length and limits how many requests one device can send each minute.',
  },
  {
    match: /\baccessib|\bscreen reader\b|\bvoiceover\b|\btalkback\b/i,
    answer:
      'Every button and input has a label and a role, so VoiceOver and TalkBack can name ' +
      'them. A finished answer is read out once, instead of word by word while it streams. ' +
      'Text follows the system font size and touch targets are at least 44 points tall.',
  },
  {
    match: /\b(hi|hello|hey)\b/i,
    answer:
      'Hello! I am the demo model that ships with this app, so no API key is needed. ' +
      'Ask me how streaming works or what happens when you are offline.',
  },
];

const FALLBACK =
  'I am the demo model that ships with this app, so I can only answer a few questions ' +
  'about how it works. Try asking how streaming works, what happens offline, or how the ' +
  'API key is kept safe. Set LLM_API_KEY on the server to talk to a real model.';

/** The failure demo is the first topic. It stops after this many pieces. */
const FAILURE_TOPIC = TOPICS[0];
const FAIL_AFTER_TOKENS = 18;

export function fakeAnswer(question: string): string {
  return TOPICS.find((topic) => topic.match.test(question))?.answer ?? FALLBACK;
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
  // Odd attempts at the failure demo fail and even ones succeed, so a retry
  // always works and the demo can be repeated.
  let failureDemoAttempts = 0;

  return {
    async *stream(messages: ChatTurn[], signal: AbortSignal) {
      const question = messages[messages.length - 1]?.content ?? '';
      const isFailureDemo = FAILURE_TOPIC?.match.test(question) ?? false;
      const failPartWay = isFailureDemo && ++failureDemoAttempts % 2 === 1;
      const tokens = tokenize(fakeAnswer(question));

      for (const [index, token] of tokens.entries()) {
        if (signal.aborted) return;
        if (failPartWay && index === FAIL_AFTER_TOKENS) {
          throw new UpstreamError('The model stopped responding. Please try again.');
        }
        yield token;
        await sleep(delayMs, signal);
      }
    },
  };
}
