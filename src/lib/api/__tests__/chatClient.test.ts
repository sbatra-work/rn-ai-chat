import { jsonResponse, sse, streamResponse } from '../../../test/sseResponse';
import { ChatApiError, createChatClient, type FetchLike } from '../chatClient';

const question = [{ role: 'user' as const, content: 'hi' }];

function setup(fetchFn: FetchLike) {
  const client = createChatClient({
    baseUrl: 'http://api.test',
    fetchFn,
    getDeviceId: async () => 'device-1234',
  });
  const deltas: string[] = [];
  const run = (signal = new AbortController().signal) =>
    client.streamChat({ messages: question, signal, onDelta: (text) => deltas.push(text) });
  return { run, deltas };
}

async function failure(promise: Promise<unknown>): Promise<ChatApiError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ChatApiError);
  return error as ChatApiError;
}

describe('createChatClient', () => {
  it('posts the conversation with the device id', async () => {
    const fetchFn = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () =>
      streamResponse([sse({ type: 'done', finishReason: 'stop' })]),
    );
    await setup(fetchFn).run();

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api.test/v1/chat');
    expect(init.method).toBe('POST');
    expect(init.headers['x-device-id']).toBe('device-1234');
    expect(JSON.parse(init.body)).toEqual({ messages: question });
  });

  it('delivers deltas in order and resolves with the finish reason', async () => {
    const { run, deltas } = setup(async () =>
      streamResponse([
        sse({ type: 'delta', text: 'Hello ' }),
        sse({ type: 'delta', text: 'world' }) + sse({ type: 'done', finishReason: 'stop' }),
      ]),
    );
    await expect(run()).resolves.toBe('stop');
    expect(deltas).toEqual(['Hello ', 'world']);
  });

  it('handles events split across network chunks', async () => {
    const whole =
      sse({ type: 'delta', text: 'split me' }) + sse({ type: 'done', finishReason: 'stop' });
    const { run, deltas } = setup(async () =>
      streamResponse([whole.slice(0, 9), whole.slice(9, 31), whole.slice(31)]),
    );
    await expect(run()).resolves.toBe('stop');
    expect(deltas).toEqual(['split me']);
  });

  it('keeps a multi-byte character that is split across chunks', async () => {
    const bytes = new TextEncoder().encode(
      sse({ type: 'delta', text: 'naïve 👍' }) + sse({ type: 'done', finishReason: 'stop' }),
    );
    // Cut inside the 4-byte emoji.
    const cut = bytes.indexOf(0xf0) + 2;
    const { run, deltas } = setup(async () =>
      streamResponse([bytes.slice(0, cut), bytes.slice(cut)]),
    );
    await run();
    expect(deltas).toEqual(['naïve 👍']);
  });

  it('reports a refusal as an outcome, not an error', async () => {
    const { run, deltas } = setup(async () =>
      streamResponse([
        sse({ type: 'delta', text: 'No.' }),
        sse({ type: 'done', finishReason: 'refusal' }),
      ]),
    );
    await expect(run()).resolves.toBe('refusal');
    expect(deltas).toEqual(['No.']);
  });

  it('skips events it does not understand', async () => {
    const { run, deltas } = setup(async () =>
      streamResponse([
        sse({ type: 'usage', tokens: 12 }),
        'data: not json\n\n',
        sse({ type: 'delta', text: 'ok' }),
        sse({ type: 'done', finishReason: 'stop' }),
      ]),
    );
    await expect(run()).resolves.toBe('stop');
    expect(deltas).toEqual(['ok']);
  });

  it('ignores anything after the final event', async () => {
    const { run, deltas } = setup(async () =>
      streamResponse([
        sse({ type: 'done', finishReason: 'stop' }) + sse({ type: 'delta', text: 'late' }),
      ]),
    );
    await run();
    expect(deltas).toEqual([]);
  });

  it('throws the error sent inside the stream, after the text before it', async () => {
    const { run, deltas } = setup(async () =>
      streamResponse([
        sse({ type: 'delta', text: 'Partial' }),
        sse({ type: 'error', code: 'upstream_error', message: 'Model failed.' }),
      ]),
    );
    const error = await failure(run());
    expect(error).toMatchObject({
      code: 'upstream_error',
      message: 'Model failed.',
      retryable: true,
    });
    expect(deltas).toEqual(['Partial']);
  });

  it('throws when the stream ends without a final event', async () => {
    const { run } = setup(async () => streamResponse([sse({ type: 'delta', text: 'cut off' })]));
    expect(await failure(run())).toMatchObject({ code: 'network', retryable: true });
  });

  it('turns an error status into a typed error', async () => {
    const { run } = setup(async () =>
      jsonResponse(429, { error: { code: 'rate_limited', message: 'Try again in 30 seconds.' } }),
    );
    expect(await failure(run())).toMatchObject({
      code: 'rate_limited',
      message: 'Try again in 30 seconds.',
      retryable: true,
    });
  });

  it('marks errors that a retry cannot fix', async () => {
    const { run } = setup(async () =>
      jsonResponse(413, { error: { code: 'too_long', message: 'Too long.' } }),
    );
    expect((await failure(run())).retryable).toBe(false);
  });

  it('copes with an error status that has no usable body', async () => {
    const { run } = setup(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('not json');
      },
      body: null,
    }));
    expect(await failure(run())).toMatchObject({
      code: 'bad_response',
      message: 'The server returned 502.',
    });
  });

  it('reports a failed connection as a network error', async () => {
    const { run } = setup(async () => {
      throw new TypeError('Network request failed');
    });
    expect(await failure(run())).toMatchObject({ code: 'network', retryable: true });
  });

  it('resolves with "cancelled" when aborted before the response', async () => {
    const controller = new AbortController();
    const { run } = setup(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          // Like the real fetch: reject at once if already aborted, else on abort.
          const abort = () => reject(new Error('Aborted'));
          if (init.signal.aborted) abort();
          else init.signal.addEventListener('abort', abort);
        }),
    );
    const pending = run(controller.signal);
    controller.abort();
    await expect(pending).resolves.toBe('cancelled');
  });

  it('resolves with "cancelled" when aborted part way, keeping earlier text', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const { run, deltas } = setup(async (_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(encoder.encode(sse({ type: 'delta', text: 'First' })));
          init.signal.addEventListener('abort', () => stream.error(new Error('Aborted')));
        },
      });
      return { ok: true, status: 200, json: async () => ({}), body };
    });

    const pending = run(controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    await expect(pending).resolves.toBe('cancelled');
    expect(deltas).toEqual(['First']);
  });
});
