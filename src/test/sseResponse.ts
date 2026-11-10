import type { FetchLike } from '../lib/api/chatClient';

type FetchResult = Awaited<ReturnType<FetchLike>>;

/** A streaming 200 response that delivers the given chunks one read at a time. */
export function streamResponse(chunks: (string | Uint8Array)[]): FetchResult {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return { ok: true, status: 200, json: async () => ({}), body };
}

export function jsonResponse(status: number, body: unknown): FetchResult {
  return { ok: false, status, json: async () => body, body: null };
}

export function sse(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
