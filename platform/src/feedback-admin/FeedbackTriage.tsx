/**
 * Triage UI for the SILOED feedback store — the SOLE feedback-admin surface
 * (issue #59). Mounted only by the standalone, unlinked `/feedback-admin` entry
 * (src/feedback-admin.tsx); it is deliberately NOT reachable from the main app and
 * links nowhere back into it. Supersedes the former in-app admin-console
 * `FeedbackPanel` tab (removed in the same change).
 *
 * Reads the admin-gated, feedback-siloed endpoints:
 *   GET   /api/feedback?status=        → { counts, items }
 *   GET   /api/feedback/:id/screenshot → image bytes (fetched WITH the header,
 *                                        rendered as an object-URL — see Screenshot)
 *   PATCH /api/feedback/:id { status } → set status
 *
 * AUTH: header-only `x-feedback-admin-secret` (audit M2 / issue #55). The secret is
 * entered once here and kept in localStorage; it is NEVER put in a URL/query param
 * (not even the screenshot `<img src>`) and is never baked into the bundle. Those
 * endpoints bind ONLY the feedback D1/R2 + the admin secret, so nothing
 * app/user/content-related is reachable. If the secret is unset/wrong the endpoints
 * are 403 (fail-safe closed).
 *
 * LOGIN PROBES THE SERVER (issue #59). Unlock does a real `GET /api/feedback?limit=1`
 * with the entered secret and only commits it to localStorage on a 200. A 403 shows a
 * clear inline error on the unlock screen instead of silently storing the secret and
 * then bouncing back to "locked" on the first list/patch/screenshot call — the old
 * "I can log in but any action kicks me out" symptom. Because the endpoint returns an
 * indistinguishable 403 whether the secret is WRONG or simply NOT CONFIGURED on this
 * deployment, the error names both causes (the latter is the expected state on PR
 * PREVIEW deploys, where `FEEDBACK_ADMIN_SECRET` is only bound in the Pages project's
 * PRODUCTION environment — see ARCHITECTURE.md §6.5 provisioning runbook).
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

/**
 * Header-authenticated screenshot thumbnail. Fetches the image bytes with the
 * `x-feedback-admin-secret` HEADER (never a `?secret=` URL, which would leak into
 * logs/history/Referer — audit M2 / #55), then renders the result as an object-URL.
 * The object-URL is revoked on unmount and whenever the id/secret changes, so blobs
 * don't leak.
 */
function Screenshot({
  id,
  secret,
  enlarged,
  onClick,
}: {
  id: number;
  secret: string;
  enlarged: boolean;
  onClick: () => void;
}) {
  const [objUrl, setObjUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      try {
        const res = await fetch(`/api/feedback/${id}/screenshot`, { headers: { [HEADER]: secret } });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjUrl(created);
      } catch {
        /* leave the thumbnail blank on failure */
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, secret]);

  if (!objUrl) {
    return (
      <div
        style={{
          width: 72, height: 96, borderRadius: 8, border: '1px solid #ddd',
          background: '#f4f4f4', flex: '0 0 auto',
        }}
      />
    );
  }
  return (
    <img
      src={objUrl}
      alt="screenshot"
      onClick={onClick}
      style={{
        width: enlarged ? 360 : 72,
        height: 'auto', maxHeight: enlarged ? 'none' : 96,
        objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd', cursor: 'zoom-in', flex: '0 0 auto',
      }}
    />
  );
}

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

export function FeedbackTriage() {
  const [secret, setSecret] = useState(() => localStorage.getItem(SECRET_KEY) || '');
  const [secretInput, setSecretInput] = useState('');
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>(''); // '' = all
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  // Inline error shown on the UNLOCK screen when a login probe fails (wrong/absent
  // secret, or network). Distinct from `error`, which annotates the loaded console.
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // A 403 while already unlocked means the secret stopped working (rotated, or this
  // deploy never had it). Clear it so the unlock screen reappears with the cause.
  const relock = useCallback(() => {
    localStorage.removeItem(SECRET_KEY);
    setSecret('');
    setUnlockError('forbidden');
  }, []);

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await fetch(`/api/feedback${qs}`, { headers: { [HEADER]: secret } });
      if (res.status === 403) { setItems([]); setCounts({}); relock(); return; }
      if (!res.ok) { setError(`error ${res.status}`); return; }
      const data = (await res.json()) as { counts: Record<string, number>; items: FeedbackRow[] };
      setItems(data.items || []);
      setCounts(data.counts || {});
    } catch {
      setError('network');
    } finally {
      setLoading(false);
    }
  }, [secret, filter, relock]);

  useEffect(() => { void load(); }, [load]);

  // Unlock = PROBE the server before committing the secret. On 200 store + enter the
  // console; on 403 show a clear cause (wrong OR not-configured-on-this-deploy) and
  // do NOT store — so a bad/absent secret can't slip in and then kick the user out on
  // the first real action. A transient network error is reported without storing.
  const saveSecret = async () => {
    const s = secretInput.trim();
    if (!s || unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await fetch('/api/feedback?limit=1', { headers: { [HEADER]: s } });
      if (res.status === 403) {
        setUnlockError('forbidden');
        return;
      }
      if (!res.ok) {
        setUnlockError(`error ${res.status}`);
        return;
      }
      // Accepted — persist and drop into the console. Prime the list from this probe.
      localStorage.setItem(SECRET_KEY, s);
      setSecret(s);
      setSecretInput('');
      setError(null);
      setUnlockError(null);
    } catch {
      setUnlockError('network');
    } finally {
      setUnlocking(false);
    }
  };

  const changeStatus = async (id: number, status: Status) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', [HEADER]: secret },
        body: JSON.stringify({ status }),
      });
      if (res.status === 403) { relock(); return; } // secret rotated / absent on this deploy
    } catch { /* keep optimistic update */ }
    void load(); // refresh counts
  };

  // --- Secret entry (no secret yet, or a probe/action was rejected) ---
  if (!secret) {
    const unlockMsg =
      unlockError === 'forbidden'
        ? 'That secret was rejected — either it is wrong, or FEEDBACK_ADMIN_SECRET is not configured on this deployment (expected on PR preview deploys; only production binds it).'
        : unlockError === 'network'
          ? "Couldn't reach the server. Check your connection and try again."
          : unlockError
            ? `Couldn't verify (${unlockError}). Try again.`
            : null;
    return (
      <div className="admin-empty" style={{ maxWidth: 460 }}>
        <p style={{ marginTop: 0 }}>Enter the feedback admin secret</p>
        <p style={{ fontSize: 13, color: '#666' }}>
          This is <code>FEEDBACK_ADMIN_SECRET</code> (reads are closed without it). It is sent as a request
          header only — never in a URL. Unlock verifies it against the server before it is stored.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void saveSecret()}
            placeholder="admin secret"
            disabled={unlocking}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc' }}
          />
          <button
            onClick={() => void saveSecret()}
            disabled={unlocking || !secretInput.trim()}
            style={{ padding: '8px 16px', borderRadius: 8, cursor: unlocking ? 'default' : 'pointer' }}
          >
            {unlocking ? 'Checking…' : 'Unlock'}
          </button>
        </div>
        {unlockMsg && <p style={{ fontSize: 13, color: '#c00', marginBottom: 0 }}>{unlockMsg}</p>}
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
      {error && <p style={{ color: '#c00' }}>Failed to load ({error}).</p>}
      {!loading && !error && items.length === 0 && <div className="admin-empty">No feedback{filter ? ` with status “${STATUS_LABEL[filter]}”` : ''} yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it) => (
          <div key={it.id} style={card}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {it.has_screenshot ? (
                <Screenshot
                  id={it.id}
                  secret={secret}
                  enlarged={enlarged === it.id}
                  onClick={() => setEnlarged(enlarged === it.id ? null : it.id)}
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
