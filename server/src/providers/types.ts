import type { ChatTurn } from '../../../shared/protocol.ts';

/**
 * The one seam between the HTTP layer and a language model.
 * To add a provider (Anthropic, a local model), implement this and pick it
 * in `createProvider`. Nothing else changes.
 */
export interface ChatProvider {
  /** Yields pieces of the answer as they are produced. */
  stream(messages: ChatTurn[], signal: AbortSignal): AsyncIterable<string>;
}

/** Thrown when the model service fails. The message is safe to show a user. */
export class UpstreamError extends Error {
  override name = 'UpstreamError';
}
