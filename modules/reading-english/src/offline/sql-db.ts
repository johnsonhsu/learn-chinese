import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

export async function initSqlite(): Promise<void> {
  if (SQL) return;
  SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
}

export function openDatabase(data: ArrayLike<number>): SqlJsDatabase {
  if (!SQL) throw new Error('sql.js not initialized');
  return new SQL.Database(new Uint8Array(data));
}

export type { SqlJsDatabase };
