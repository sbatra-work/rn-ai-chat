import type { ConversationSummary, Message } from '../features/chat/types';
import { titleFrom, type ChatRepository } from '../features/chat/storage/chatRepository';

interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

/** A ChatRepository that keeps everything in memory, for tests. */
export function createMemoryChatRepository(seed: Message[] = []): ChatRepository {
  const conversations = new Map<string, Conversation>();

  const repository: ChatRepository = {
    async listConversations() {
      return [...conversations.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(({ id, title, updatedAt, messages }): ConversationSummary => {
          const latest = [...messages]
            .sort((a, b) => a.createdAt - b.createdAt)
            .findLast((message) => message.content !== '');
          return { id, title, updatedAt, preview: latest?.content.slice(0, 120) ?? '' };
        });
    },

    async getMessages(conversationId) {
      const messages = conversations.get(conversationId)?.messages ?? [];
      // Array sort is stable, so messages with the same time keep insert order.
      return [...messages].sort((a, b) => a.createdAt - b.createdAt);
    },

    async saveMessage(message) {
      let conversation = conversations.get(message.conversationId);
      if (!conversation) {
        conversation = {
          id: message.conversationId,
          title: message.role === 'user' ? titleFrom(message.content) : 'New chat',
          updatedAt: message.createdAt,
          messages: [],
        };
        conversations.set(conversation.id, conversation);
      }
      const index = conversation.messages.findIndex((existing) => existing.id === message.id);
      if (index === -1) conversation.messages.push({ ...message });
      else conversation.messages[index] = { ...message };
      conversation.updatedAt = Math.max(conversation.updatedAt, message.createdAt);
    },

    async deleteConversation(conversationId) {
      conversations.delete(conversationId);
    },
  };

  for (const message of seed) void repository.saveMessage(message);
  return repository;
}
