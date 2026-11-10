import { LIMITS, type ChatTurn } from '../../../../shared/protocol';
import type { Message } from '../types';

/**
 * Pick the turns to send to the server as context for the next answer.
 *
 * Keeps the newest turns that fit inside the server's caps, so a long
 * conversation keeps working instead of being rejected as too long.
 */
export function buildContext(messages: Message[]): ChatTurn[] {
  const usable = messages.filter(
    (message) => message.content.trim() !== '' && message.status !== 'error',
  );

  const turns: ChatTurn[] = [];
  let totalChars = 0;

  for (let i = usable.length - 1; i >= 0 && turns.length < LIMITS.maxMessages; i--) {
    const message = usable[i];
    if (!message) break;
    if (totalChars + message.content.length > LIMITS.maxTotalChars) break;
    totalChars += message.content.length;
    turns.unshift({ role: message.role, content: message.content });
  }

  // A context that opens with an answer has lost the question it belongs to.
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns;
}
