import { DEVICE_ID_HEADER, parseStreamEvent, type StreamEvent } from '../../shared/protocol.ts';
import { createSseParser } from '../../shared/sse.ts';
import { createApp, type AppDeps, type Handler } from '../src/app.ts';
import { createFakeProvider } from '../src/providers/fake.ts';
import { createRateLimiter } from '../src/rateLimit.ts';

export const DEVICE_ID = 'test-device-0001';

export function makeApp(overrides: Partial<AppDeps> = {}): Handler {
  return createApp({
    provider: createFakeProvider(0),
    rateLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    mode: 'fake',
    ...overrides,
  });
}

export function chatRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://test.local/v1/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [DEVICE_ID_HEADER]: DEVICE_ID, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function ask(content: string): { messages: { role: 'user'; content: string }[] } {
  return { messages: [{ role: 'user', content }] };
}

/** Read a whole SSE response and return its events in order. */
export async function readEvents(response: Response): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  const parser = createSseParser((message) => {
    const event = parseStreamEvent(message.data);
    if (event) events.push(event);
  });
  parser.feed(await response.text());
  return events;
}

export function textOf(events: StreamEvent[]): string {
  return events.map((event) => (event.type === 'delta' ? event.text : '')).join('');
}
