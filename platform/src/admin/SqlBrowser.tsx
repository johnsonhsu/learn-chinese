import { useState, useEffect } from 'react';

interface DbInfo {
  name: string;
  path: string;
}

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

interface QueryError {
  error: string;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function SqlBrowser() {
  const [databases, setDatabases] = useState<DbInfo[]>([]);
  const [selectedDb, setSelectedDb] = useState<DbInfo | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<DbInfo[]>('/admin/databases').then(dbs => {
      setDatabases(dbs);
      if (dbs.length > 0) selectDb(dbs[0]);
    });
  }, []);

  const selectDb = async (db: DbInfo) => {
    setSelectedDb(db);
    setResult(null);
    setError('');
    setSql('');
    const res = await api<QueryResult | QueryError>('/admin/sql/tables', {
      method: 'POST',
      body: JSON.stringify({ dbPath: db.path }),
    });
    if ('error' in res) {
      setTables([]);
    } else {
      setTables(res.rows.map(r => String(r[0])));
    }
  };

  const runSql = async () => {
    if (!selectedDb || !sql.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    const res = await api<QueryResult | QueryError>('/admin/sql/query', {
      method: 'POST',
      body: JSON.stringify({ dbPath: selectedDb.path, sql: sql.trim() }),
    });
    if ('error' in res) {
      setError(res.error);
    } else {
      setResult(res);
    }
    setLoading(false);
  };

  const quickQuery = (table: string) => {
    setSql(`SELECT * FROM ${table} LIMIT 50`);
  };

  return (
    <div className="sql-browser">
      <div className="sql-sidebar">
        <div className="sql-db-select">
          {databases.map(db => (
            <button
              key={db.name}
              className={`sql-db-btn${selectedDb?.name === db.name ? ' active' : ''}`}
              onClick={() => selectDb(db)}
            >
              {db.name}
            </button>
          ))}
        </div>
        {tables.length > 0 && (
          <div className="sql-tables">
            <h4>Tables</h4>
            {tables.map(t => (
              <button key={t} className="sql-table-btn" onClick={() => quickQuery(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="sql-main">
        <div className="sql-input-row">
          <textarea
            className="sql-input"
            value={sql}
            onChange={e => setSql(e.target.value)}
            placeholder="SELECT * FROM ..."
            rows={3}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                runSql();
              }
            }}
          />
          <button className="sql-run-btn" onClick={runSql} disabled={loading}>
            {loading ? '...' : 'Run'}
          </button>
        </div>
        <div className="sql-hint">Cmd+Enter to run</div>
        {error && <div className="sql-error">{error}</div>}
        {result && (
          <div className="sql-result">
            <div className="sql-row-count">{result.rowCount} row{result.rowCount !== 1 ? 's' : ''}</div>
            <div className="sql-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {result.columns.map(c => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell === null ? <span className="sql-null">NULL</span> : String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
