/**
 * The wire contract between the app and the server.
 *
 * Both sides import this file, so a change to the contract is a type error
 * on whichever side was not updated.
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

/** Body of `POST /v1/chat`. */
export interface ChatRequest {
  messages: ChatTurn[];
}

/** Input caps. The server enforces them. The app uses them to warn early. */
export const LIMITS = {
  /** Longest single user message, in characters. */
  maxMessageChars: 2000,
  /** Most turns the app may send as context. */
  maxMessages: 20,
  /** Cap on all turns added together, in characters. */
  maxTotalChars: 12000,
} as const;

export const DEVICE_ID_HEADER = 'x-device-id';
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export type ErrorCode =
  'invalid_request' | 'too_long' | 'rate_limited' | 'upstream_error' | 'internal_error';

/** JSON body of any non-2xx response. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

export type FinishReason = 'stop' | 'refusal';

/**
 * One server-sent event on the chat stream. Each event is one `data:` line
 * holding one of these as JSON.
 *
 * A stream always ends with exactly one `done` or one `error`.
 */
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; finishReason: FinishReason }
  | { type: 'error'; code: ErrorCode; message: string };

const ERROR_CODES: readonly string[] = [
  'invalid_request',
  'too_long',
  'rate_limited',
  'upstream_error',
  'internal_error',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value);
}

/**
 * Turn the text of one SSE `data:` field into a StreamEvent.
 * Returns null for anything that does not match the contract, so a bad or
 * newer server can never crash the app.
 */
export function parseStreamEvent(data: string): StreamEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  switch (value.type) {
    case 'delta':
      return typeof value.text === 'string' ? { type: 'delta', text: value.text } : null;
    case 'done':
      return value.finishReason === 'stop' || value.finishReason === 'refusal'
        ? { type: 'done', finishReason: value.finishReason }
        : null;
    case 'error':
      return isErrorCode(value.code) && typeof value.message === 'string'
        ? { type: 'error', code: value.code, message: value.message }
        : null;
    default:
      return null;
  }
}

export function parseErrorBody(value: unknown): ErrorBody | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const { code, message } = value.error;
  if (!isErrorCode(code) || typeof message !== 'string') return null;
  return { error: { code, message } };
}
