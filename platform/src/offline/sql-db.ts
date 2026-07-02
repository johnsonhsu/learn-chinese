import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import type { DbQueryProvider } from "@shared/character-stats/types";
// Bundle the wasm with the app (Vite emits a hashed, same-origin asset with the
// correct MIME type) so it loads reliably and works fully offline — no CDN.
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

export async function initSqlite(): Promise<void> {
  if (SQL) return;
  SQL = await initSqlJs({
    locateFile: () => sqlWasmUrl,
  });
}

export function openDatabase(data: ArrayLike<number>): SqlJsDatabase {
  if (!SQL) throw new Error("sql.js not initialized — call initSqlite() first");
  return new SQL.Database(new Uint8Array(data));
}

export function sqlJsProvider(db: SqlJsDatabase): DbQueryProvider {
  return {
    queryAll<T>(sql: string, params?: unknown[]): T[] {
      const stmt = db.prepare(sql);
      if (params) stmt.bind(params);
      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return results;
    },
    queryOne<T>(sql: string, params?: unknown[]): T | undefined {
      const stmt = db.prepare(sql);
      if (params) stmt.bind(params);
      const result = stmt.step() ? (stmt.getAsObject() as T) : undefined;
      stmt.free();
      return result;
    },
    run(sql: string, params?: unknown[]): { changes: number; lastId: number } {
      db.run(sql, params);
      const changes = db.getRowsModified();
      const lastIdResult = db.exec("SELECT last_insert_rowid() as id");
      const lastId = lastIdResult.length > 0 ? (lastIdResult[0].values[0][0] as number) : 0;
      return { changes, lastId };
    },
  };
}

export function exportDatabase(db: SqlJsDatabase): Uint8Array {
  return db.export();
}

export type { SqlJsDatabase };
