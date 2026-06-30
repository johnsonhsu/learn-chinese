// sql.js ships no type declarations and @types/sql.js isn't installed. Declare a
// minimal ambient module: the DB/Statement handles are `any` (matching the
// existing untyped usage), but `Database` is a real *type* export so callers can
// `import { type Database } from 'sql.js'`, and the init result exposes the
// `Database` constructor used by openDatabase().
declare module 'sql.js' {
  export type SqlValue = unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Database = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Statement = any;
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => Database;
  }
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
