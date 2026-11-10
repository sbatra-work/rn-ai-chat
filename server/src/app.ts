import {
  DEVICE_ID_HEADER,
  DEVICE_ID_PATTERN,
  type ErrorBody,
  type ErrorCode,
  type StreamEvent,
} from '../../shared/protocol.ts';
import { moderate } from './moderation.ts';
import type { RateLimiter } from './rateLimit.ts';
import { UpstreamError, type ChatProvider } from './providers/types.ts';
import { validateChatRequest } from './validate.ts';

/**
 * The whole HTTP surface as one function from Request to Response.
 *
 * It uses only web-standard types, so the same code runs on Node (through
 * the small adapter in node.ts) and on Cloudflare Workers (worker.ts), and
 * tests can call it directly with no server and no ports.
 */

export interface AppDeps {
  provider: ChatProvider;
  rateLimiter: RateLimiter;
  mode: string;
  /** Called with errors that are hidden from the client. */
  logError?: (error: unknown) => void;
}

export type Handler = (request: Request) => Promise<Response>;

/** Request bodies above this are rejected before being parsed. */
const MAX_BODY_BYTES = 64 * 1024;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  const body: ErrorBody = { error: { code, message } };
  return json(status, body, headers);
}

function encodeEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Wrap a series of events in a streaming SSE response. */
function sseResponse(
  events: (signal: AbortSignal) => AsyncIterable<StreamEvent>,
  requestSignal: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  // Aborts when the client goes away, either by closing the connection
  // (requestSignal) or by cancelling the response body.
  const abort = new AbortController();
  requestSignal.addEventListener('abort', () => abort.abort(), { once: true });
  if (requestSignal.aborted) abort.abort();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events(abort.signal)) {
          if (abort.signal.aborted) break;
          controller.enqueue(encoder.encode(encodeEvent(event)));
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a cancel.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false };
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export function createApp({ provider, rateLimiter, mode, logError = () => {} }: AppDeps): Handler {
  async function handleChat(request: Request): Promise<Response> {
    // 1. Who is asking. Checked first so abuse is cheap to reject.
    const deviceId = request.headers.get(DEVICE_ID_HEADER) ?? '';
    if (!DEVICE_ID_PATTERN.test(deviceId)) {
      return errorResponse(
        400,
        'invalid_request',
        `Missing or malformed ${DEVICE_ID_HEADER} header.`,
      );
    }

    const limit = rateLimiter.check(deviceId);
    if (!limit.allowed) {
      return errorResponse(
        429,
        'rate_limited',
        `Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`,
        { 'retry-after': String(limit.retryAfterSeconds) },
      );
    }

    // 2. What they sent.
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return errorResponse(413, 'too_long', 'Request body is too large.');
    }
    const body = await readJsonBody(request);
    if (!body.ok) {
      return errorResponse(400, 'invalid_request', 'Body must be valid JSON under 64 KB.');
    }
    const parsed = validateChatRequest(body.value);
    if (!parsed.ok) {
      return errorResponse(parsed.code === 'too_long' ? 413 : 400, parsed.code, parsed.message);
    }
    const { messages } = parsed.value;

    // 3. Refusal path. Runs before any model call.
    const lastMessage = messages[messages.length - 1];
    const verdict = moderate(lastMessage?.content ?? '');
    if (!verdict.allowed) {
      const { message } = verdict;
      return sseResponse(async function* () {
        yield { type: 'delta', text: message };
        yield { type: 'done', finishReason: 'refusal' };
      }, request.signal);
    }

    // 4. Stream the answer.
    return sseResponse(async function* (signal) {
      try {
        for await (const text of provider.stream(messages, signal)) {
          yield { type: 'delta', text };
        }
        yield { type: 'done', finishReason: 'stop' };
      } catch (error) {
        if (signal.aborted) return;
        logError(error);
        // Once streaming has started the status code is already sent, so
        // failures travel as a final event instead.
        yield error instanceof UpstreamError
          ? { type: 'error', code: 'upstream_error', message: error.message }
          : { type: 'error', code: 'internal_error', message: 'Something went wrong.' };
      }
    }, request.signal);
  }

  return async function handle(request) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/health' && request.method === 'GET') {
        return json(200, { ok: true, mode });
      }
      if (pathname === '/v1/chat') {
        if (request.method !== 'POST') {
          return errorResponse(405, 'invalid_request', 'Use POST.', { allow: 'POST' });
        }
        return await handleChat(request);
      }
      return errorResponse(404, 'invalid_request', 'Not found.');
    } catch (error) {
      logError(error);
      return errorResponse(500, 'internal_error', 'Something went wrong.');
    }
  };
}
