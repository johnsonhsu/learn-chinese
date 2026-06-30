/**
 * Triage view for the SILOED feedback store (the "local Mac sees feedback + sets
 * status" side). DEV-only admin panel. Reads the admin-gated endpoints in
 * platform/server/feedback-routes.ts:
 *   GET   /api/feedback?status=        → { counts, items }
 *   GET   /api/feedback/:id/screenshot → image bytes (used as <img src ?secret=>)
 *   PATCH /api/feedback/:id { status } → set status
 * All gated by the `x-feedback-admin-secret` header (or `?secret=`), matched
 * against FEEDBACK_ADMIN_SECRET in the dev .env. The secret is entered once here
 * and kept in localStorage; nothing app/user/content-related is reachable.
 */
import { useState, useEffect, useCallback } from 'react';

const STATUSES = ['new', 'triaged', 'in-progress', 'resolved', 'wontfix'] as const;
type Status = (typeof STATUSES)[number];
const HEADER = 'x-feedback-admin-secret';
const SECRET_KEY = 'lc-feedback-admin-secret';

interface FeedbackRow {
  id: number;
  created_at: string;
  category: string;
  option: string;
  message: string;
  screen: string;
  context_json: string;
  ua: string;
  app_version: string;
  profile_id: number | null;
  status: string;
  has_screenshot: number;
}

const CAT_LABEL: Record<string, string> = {
  bug: '🐞 Bug', suggestion: '💡 Suggestion', content: '📝 Content', confusing: '❓ Confusing', other: '· Other',
};
const STATUS_LABEL: Record<string, string> = {
  new: 'New', triaged: 'Triaged', 'in-progress': 'In progress', resolved: 'Resolved', wontfix: "Won't fix",
};

function fmtContext(json: string): string {
  if (!json) return '';
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(o)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join('  ·  ');
  } catch {
    return json;
  }
}

export function FeedbackPanel() {
  const [secret, setSecret] = useState(() => localStorage.getItem(SECRET_KEY) || '');
  const [secretInput, setSecretInput] = useState('');
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>(''); // '' = all
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await fetch(`/api/feedback${qs}`, { headers: { [HEADER]: secret } });
      if (res.status === 403) { setError('forbidden'); setItems([]); setCounts({}); return; }
      if (!res.ok) { setError(`error ${res.status}`); return; }
      const data = (await res.json()) as { counts: Record<string, number>; items: FeedbackRow[] };
      setItems(data.items || []);
      setCounts(data.counts || {});
    } catch {
      setError('network');
    } finally {
      setLoading(false);
    }
  }, [secret, filter]);

  useEffect(() => { void load(); }, [load]);

  const saveSecret = () => {
    const s = secretInput.trim();
    if (!s) return;
    localStorage.setItem(SECRET_KEY, s);
    setSecret(s);
    setSecretInput('');
    setError(null);
  };

  const changeStatus = async (id: number, status: Status) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    try {
      await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', [HEADER]: secret },
        body: JSON.stringify({ status }),
      });
    } catch { /* keep optimistic update */ }
    void load(); // refresh counts
  };

  // --- Secret entry (no secret, or rejected) ---
  if (!secret || error === 'forbidden') {
    return (
      <div className="admin-empty" style={{ maxWidth: 440 }}>
        <p style={{ marginTop: 0 }}>
          {error === 'forbidden' ? 'That secret was rejected.' : 'Enter the feedback admin secret'}
        </p>
        <p style={{ fontSize: 13, color: '#666' }}>
          This is <code>FEEDBACK_ADMIN_SECRET</code> from your dev <code>.env</code> (reads are closed without it).
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveSecret()}
            placeholder="admin secret"
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc' }}
          />
          <button onClick={saveSecret} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Unlock</button>
        </div>
      </div>
    );
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ padding: 4 }}>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <button
          onClick={() => setFilter('')}
          style={chip(filter === '')}
        >All ({total})</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={chip(filter === s)}>
            {STATUS_LABEL[s]} ({counts[s] || 0})
          </button>
        ))}
        <button onClick={() => void load()} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid #ccc', background: '#fff' }}>
          ↻ Refresh
        </button>
      </div>

      {loading && <p style={{ color: '#888' }}>Loading…</p>}
      {error && error !== 'forbidden' && <p style={{ color: '#c00' }}>Failed to load ({error}).</p>}
      {!loading && !error && items.length === 0 && <div className="admin-empty">No feedback{filter ? ` with status “${STATUS_LABEL[filter]}”` : ''} yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it) => (
          <div key={it.id} style={card}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {it.has_screenshot ? (
                <img
                  src={`/api/feedback/${it.id}/screenshot?secret=${encodeURIComponent(secret)}`}
                  alt="screenshot"
                  onClick={() => setEnlarged(enlarged === it.id ? null : it.id)}
                  style={{
                    width: enlarged === it.id ? 360 : 72,
                    height: 'auto', maxHeight: enlarged === it.id ? 'none' : 96,
                    objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd', cursor: 'zoom-in', flex: '0 0 auto',
                  }}
                />
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: '#555' }}>
                  <strong style={{ color: '#222' }}>#{it.id}</strong>
                  <span>{CAT_LABEL[it.category] || it.category}</span>
                  {it.option && <span style={{ padding: '1px 7px', borderRadius: 999, background: sevBg(it.option), color: '#fff', fontWeight: 700 }}>{it.option}</span>}
                  <span>· {it.screen || 'unknown screen'}</span>
                  {it.profile_id != null && <span>· profile {it.profile_id}</span>}
                  <span style={{ marginLeft: 'auto', color: '#999' }}>{it.created_at} UTC</span>
                </div>
                <p style={{ margin: '6px 0', whiteSpace: 'pre-wrap', color: '#111' }}>{it.message}</p>
                <div style={{ fontSize: 11, color: '#999', wordBreak: 'break-word' }}>
                  {it.app_version && <span>v{it.app_version} · </span>}{fmtContext(it.context_json)}
                </div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 2, wordBreak: 'break-word' }}>{it.ua}</div>
              </div>
              <select
                value={it.status}
                onChange={(e) => void changeStatus(it.id, e.target.value as Status)}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #ccc', alignSelf: 'flex-start', cursor: 'pointer' }}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    border: active ? '1px solid #2563eb' : '1px solid #ccc',
    background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#333',
  };
}
const card: React.CSSProperties = {
  padding: 12, borderRadius: 12, border: '1px solid #e3e3e3', background: '#fff',
};
function sevBg(sev: string): string {
  return sev === 'high' ? '#c62828' : sev === 'medium' ? '#ef6c00' : '#789';
}
