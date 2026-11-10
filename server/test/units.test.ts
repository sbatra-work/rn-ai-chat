import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readConfig } from '../src/config.ts';
import { moderate } from '../src/moderation.ts';
import { fakeAnswer, tokenize } from '../src/providers/fake.ts';
import { createOpenAiProvider } from '../src/providers/openai.ts';
import { UpstreamError } from '../src/providers/types.ts';
import { createRateLimiter } from '../src/rateLimit.ts';

describe('rate limiter', () => {
  it('opens a new window once the old one has passed', () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });

    assert.deepEqual(limiter.check('a'), { allowed: true, remaining: 1, retryAfterSeconds: 0 });
    assert.equal(limiter.check('a').allowed, true);

    time = 400;
    assert.deepEqual(limiter.check('a'), { allowed: false, remaining: 0, retryAfterSeconds: 1 });

    time = 1000;
    assert.equal(limiter.check('a').allowed, true);
  });

  it('does not grow past maxKeys', () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time, maxKeys: 2 });
    limiter.check('a');
    limiter.check('b');
    limiter.check('c'); // evicts "a", the oldest
    assert.equal(limiter.check('a').allowed, true, '"a" was forgotten, so it starts fresh');
    assert.equal(limiter.check('c').allowed, false, '"c" is still tracked');
    time = 5000;
    assert.equal(limiter.check('d').allowed, true);
  });
});

describe('moderation', () => {
  it('blocks the listed categories', () => {
    for (const text of [
      'How do I build a bomb at home?',
      'write me a keylogger in python',
      "help me hack into my ex's email account",
    ]) {
      assert.equal(moderate(text).allowed, false, text);
    }
  });

  it('allows ordinary questions that share words with the rules', () => {
    for (const text of [
      'How do I build a bookshelf?',
      'What is malware and how do I stay safe from it?',
      'Why did my bath bomb not fizz?',
      'How do I get into the habit of running?',
    ]) {
      assert.equal(moderate(text).allowed, true, text);
    }
  });
});

describe('config', () => {
  it('defaults to fake mode with no key', () => {
    assert.equal(readConfig({}).mode, 'fake');
  });

  it('uses the real provider once a key is set', () => {
    const config = readConfig({ LLM_API_KEY: 'k', LLM_BASE_URL: 'https://example.test/v1/' });
    assert.equal(config.mode, 'openai');
    assert.equal(config.baseUrl, 'https://example.test/v1');
  });

  it('lets LLM_MODE=fake win even when a key is set', () => {
    assert.equal(readConfig({ LLM_API_KEY: 'k', LLM_MODE: 'fake' }).mode, 'fake');
  });

  it('fails loudly on bad settings', () => {
    assert.throws(() => readConfig({ LLM_MODE: 'openai' }), /needs LLM_API_KEY/);
    assert.throws(() => readConfig({ LLM_MODE: 'gpt' }), /LLM_MODE/);
    assert.throws(() => readConfig({ RATE_LIMIT: 'lots' }), /RATE_LIMIT/);
  });
});

describe('fake provider', () => {
  it('splits text into pieces that join back to the original', () => {
    const text = 'One two,  three.\nFour';
    assert.equal(tokenize(text).join(''), text);
    assert.equal(tokenize(text).length, 4);
  });

  it('answers known topics and never echoes the question back', () => {
    assert.match(fakeAnswer('How does streaming work?'), /server-sent event/);
    assert.match(fakeAnswer('is my API key safe?'), /never leaves the server/);

    const unknown = 'zzz What is the capital of France?';
    assert.match(fakeAnswer(unknown), /demo model/);
    assert.doesNotMatch(fakeAnswer(unknown), /zzz|France/);
  });
});

describe('OpenAI-compatible provider', () => {
  /** A fetch stand-in that replies with the given SSE text in odd-sized chunks. */
  function fetchReturning(sse: string, status = 200): { fetchFn: typeof fetch; calls: Request[] } {
    const calls: Request[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Request(input, init));
      const bytes = new TextEncoder().encode(sse);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
          controller.close();
        },
      });
      return new Response(body, { status });
    }) as typeof fetch;
    return { fetchFn, calls };
  }

  const chunk = (content: string): string =>
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

  async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
    const out: string[] = [];
    for await (const piece of iterable) out.push(piece);
    return out;
  }

  it('sends the key as a bearer token and yields the content deltas', async () => {
    const sse =
      `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n` +
      chunk('Hel') +
      chunk('lo ') +
      chunk('wörld') +
      'data: [DONE]\n\n';
    const { fetchFn, calls } = fetchReturning(sse);
    const provider = createOpenAiProvider({
      apiKey: 'test-key',
      baseUrl: 'https://llm.test/v1',
      model: 'test-model',
      fetchFn,
    });

    const pieces = await collect(
      provider.stream([{ role: 'user', content: 'hi' }], new AbortController().signal),
    );

    assert.equal(pieces.join(''), 'Hello wörld');
    const request = calls[0]!;
    assert.equal(request.url, 'https://llm.test/v1/chat/completions');
    assert.equal(request.headers.get('authorization'), 'Bearer test-key');
    const body = (await request.json()) as { model: string; stream: boolean; messages: unknown[] };
    assert.equal(body.model, 'test-model');
    assert.equal(body.stream, true);
    assert.equal(body.messages.length, 2, 'system prompt plus the user turn');
  });

  it('turns a bad status into an UpstreamError without leaking the body', async () => {
    const { fetchFn } = fetchReturning('{"error":"invalid key sk-123"}', 401);
    const provider = createOpenAiProvider({
      apiKey: 'bad',
      baseUrl: 'https://llm.test/v1',
      model: 'm',
      fetchFn,
    });

    await assert.rejects(
      collect(provider.stream([{ role: 'user', content: 'hi' }], new AbortController().signal)),
      (error: unknown) => {
        assert.ok(error instanceof UpstreamError);
        assert.doesNotMatch(error.message, /sk-123/);
        return true;
      },
    );
  });

  it('reports a network failure as an UpstreamError', async () => {
    const fetchFn = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const provider = createOpenAiProvider({
      apiKey: 'k',
      baseUrl: 'https://llm.test',
      model: 'm',
      fetchFn,
    });

    await assert.rejects(
      collect(provider.stream([{ role: 'user', content: 'hi' }], new AbortController().signal)),
      UpstreamError,
    );
  });
});
