import type { ConversationSummary, Message } from '../types';

/**
 * Everything the chat feature needs from storage.
 *
 * Screens and hooks depend on this interface, not on SQLite. The app uses
 * the SQLite version, tests use the in-memory one, and a server-backed
 * version could be added later without touching the UI.
 */
export interface ChatRepository {
  /** Newest first. */
  listConversations(): Promise<ConversationSummary[]>;
  /** Oldest first. */
  getMessages(conversationId: string): Promise<Message[]>;
  /**
   * Insert or replace a message. Creates the conversation on first use, so
   * a conversation with no messages never exists.
   */
  saveMessage(message: Message): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
}

export const TITLE_MAX_CHARS = 48;

export function titleFrom(text: string): string {
  const oneLine = text.trim().replace(/\s+/g, ' ');
  return oneLine.length > TITLE_MAX_CHARS
    ? `${oneLine.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`
    : oneLine;
}
