import type { ConversationSummary, Message, MessageStatus } from '../types';
import { titleFrom, type ChatRepository } from './chatRepository';

/**
 * The part of the expo-sqlite API this file uses. Writing it down as an
 * interface lets the tests run the same SQL against Node's built-in SQLite.
 */
export type SqlValue = string | number | null;

export interface SqlExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
}

export interface SqlDatabase extends SqlExecutor {
  withExclusiveTransactionAsync(task: (txn: SqlExecutor) => Promise<void>): Promise<void>;
}

/**
 * Schema changes, oldest first. To change the schema, add an entry. Never
 * edit an old one: phones in the field have already run it.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    retryable INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX messages_by_conversation ON messages (conversation_id, created_at);
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

/** Bring the database up to the latest schema. Safe to run on every launch. */
export async function migrate(db: SqlDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) break;
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(sql);
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: string;
  error_message: string | null;
  retryable: number | null;
  created_at: number;
}

const SAVED_STATUSES: readonly string[] = ['complete', 'cancelled', 'refused', 'error'];

function toMessage(row: MessageRow): Message {
  const message: Message = {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    // A "streaming" row means the app died mid-write. Treat it as stopped.
    status: SAVED_STATUSES.includes(row.status) ? (row.status as MessageStatus) : 'cancelled',
    createdAt: row.created_at,
  };
  if (row.error_message !== null) message.errorMessage = row.error_message;
  if (row.retryable !== null) message.retryable = row.retryable === 1;
  return message;
}

export function createSqliteChatRepository(db: SqlDatabase): ChatRepository {
  return {
    listConversations() {
      return db.getAllAsync<ConversationSummary>(
        `SELECT c.id, c.title, c.updated_at AS updatedAt,
           COALESCE((
             SELECT substr(m.content, 1, 120) FROM messages m
             WHERE m.conversation_id = c.id AND m.content != ''
             ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1
           ), '') AS preview
         FROM conversations c
         ORDER BY c.updated_at DESC`,
        [],
      );
    },

    async getMessages(conversationId) {
      const rows = await db.getAllAsync<MessageRow>(
        `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid`,
        [conversationId],
      );
      return rows.map(toMessage);
    },

    async saveMessage(message) {
      const title = message.role === 'user' ? titleFrom(message.content) : 'New chat';
      const retryable = message.retryable === undefined ? null : Number(message.retryable);

      // One transaction, so a message can never exist without its conversation.
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync(
          `INSERT INTO conversations (id, title, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET updated_at = max(updated_at, excluded.updated_at)`,
          [message.conversationId, title, message.createdAt],
        );
        await txn.runAsync(
          `INSERT INTO messages
             (id, conversation_id, role, content, status, error_message, retryable, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             content = excluded.content,
             status = excluded.status,
             error_message = excluded.error_message,
             retryable = excluded.retryable`,
          [
            message.id,
            message.conversationId,
            message.role,
            message.content,
            message.status,
            message.errorMessage ?? null,
            retryable,
            message.createdAt,
          ],
        );
      });
    },

    async deleteConversation(conversationId) {
      // Messages go with it through ON DELETE CASCADE.
      await db.runAsync('DELETE FROM conversations WHERE id = ?', [conversationId]);
    },
  };
}

/**
 * A random ID made once per install and sent with each request, so the
 * server can rate limit per device. It identifies an install, not a person.
 */
export async function getOrCreateDeviceId(
  db: SqlExecutor,
  generate: () => string,
): Promise<string> {
  const candidate = generate();
  await db.runAsync(`INSERT OR IGNORE INTO settings (key, value) VALUES ('device_id', ?)`, [
    candidate,
  ]);
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'device_id'`,
    [],
  );
  return row?.value ?? candidate;
}
