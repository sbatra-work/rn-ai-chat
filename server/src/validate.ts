import { LIMITS, type ChatRequest, type ChatTurn, type ErrorCode } from '../../shared/protocol.ts';

export type ValidationResult =
  { ok: true; value: ChatRequest } | { ok: false; code: ErrorCode; message: string };

function fail(code: ErrorCode, message: string): ValidationResult {
  return { ok: false, code, message };
}

/**
 * Check an untrusted request body against the contract and the input caps.
 * Nothing past this function sees unchecked input.
 */
export function validateChatRequest(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return fail('invalid_request', 'Body must be a JSON object.');
  }
  const { messages } = body as { messages?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) {
    return fail('invalid_request', '"messages" must be a non-empty array.');
  }
  if (messages.length > LIMITS.maxMessages) {
    return fail('too_long', `At most ${LIMITS.maxMessages} messages are allowed.`);
  }

  const turns: ChatTurn[] = [];
  let totalChars = 0;

  for (const item of messages as unknown[]) {
    if (typeof item !== 'object' || item === null) {
      return fail('invalid_request', 'Each message must be an object.');
    }
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') {
      return fail('invalid_request', 'Message role must be "user" or "assistant".');
    }
    if (typeof content !== 'string' || content.trim() === '') {
      return fail('invalid_request', 'Message content must be a non-empty string.');
    }
    // Only user turns get the per-message cap. Model answers can be longer,
    // and they are still bounded by the total cap below.
    if (role === 'user' && content.length > LIMITS.maxMessageChars) {
      return fail('too_long', `A message can be at most ${LIMITS.maxMessageChars} characters.`);
    }
    totalChars += content.length;
    turns.push({ role, content });
  }

  if (totalChars > LIMITS.maxTotalChars) {
    return fail('too_long', `The conversation is over ${LIMITS.maxTotalChars} characters.`);
  }
  if (turns[turns.length - 1]?.role !== 'user') {
    return fail('invalid_request', 'The last message must be from the user.');
  }

  return { ok: true, value: { messages: turns } };
}
