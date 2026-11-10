import type { ChatRole } from '../../../shared/protocol';

/**
 * - `streaming`: the answer is still arriving. Never saved in this state.
 * - `complete`:  finished normally.
 * - `cancelled`: the user pressed stop. Any text that arrived is kept.
 * - `refused`:   the server declined the request.
 * - `error`:     the request failed. `errorMessage` says why.
 */
export type MessageStatus = 'streaming' | 'complete' | 'cancelled' | 'refused' | 'error';

export interface Message {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  status: MessageStatus;
  errorMessage?: string;
  /** False when sending again cannot work, for example a message that is too long. */
  retryable?: boolean;
  /** Milliseconds since the Unix epoch. */
  createdAt: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  /** Start of the latest message, for the list row. */
  preview: string;
  updatedAt: number;
}
