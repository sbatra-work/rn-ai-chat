import type {
  SqlDatabase,
  SqlExecutor,
  SqlValue,
} from '../features/chat/storage/sqliteChatRepository';

/** The few parts of `node:sqlite` used here. The app itself has no Node types. */
interface NodeSqlite {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: SqlValue[]): unknown;
      all(...params: SqlValue[]): unknown[];
      get(...params: SqlValue[]): unknown;
    };
  };
}

/**
 * Wraps Node's built-in SQLite in the small async interface the repository
 * uses. The tests then run the real SQL, schema and migrations, with no
 * native module and no mocks.
 */
export function openTestDatabase(): SqlDatabase {
  // Loaded with require so Jest's module system leaves the built-in alone.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as NodeSqlite;
  const db = new DatabaseSync(':memory:');

  const executor: SqlExecutor = {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params: SqlValue[]) {
      return db.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string, params: SqlValue[]) {
      return db.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[]) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
  };

  return {
    ...executor,
    async withExclusiveTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task(executor);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
