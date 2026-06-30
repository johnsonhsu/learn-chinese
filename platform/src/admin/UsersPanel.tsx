import { useState, useEffect } from 'react';

interface AdminUser {
  id: number;
  name: string;
  displayName: string;
  createdAt: string;
  settings: { language: string; theme: string };
}

interface CharStat {
  character: string;
  timesSeen: number;
  timesPerfect: number;
  timesCorrect: number;
  timesIncorrect: number;
  timesHintUsed: number;
  streakPerfect: number;
  streakCorrect: number;
  bestStreakPerfect: number;
  bestStreakCorrect: number;
  firstSeen: string;
  lastSeen: string;
  lastResult: string;
  lastFailedStrokes: number;
  fastestMs: number;
  slowestMs: number;
  avgMs: number;
  recentResults: string;
  firstResult: string;
}

interface UserStats {
  profile: { assessedLevel: number; currentLevel: number };
  charStats: CharStat[];
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api<AdminUser[]>('/admin/users').then(setUsers).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    await api('/admin/users/' + id, { method: 'DELETE' });
    load();
  };

  if (loading) return <div className="admin-empty">Loading...</div>;

  if (selectedUser) {
    return <UserDetail user={selectedUser} onBack={() => setSelectedUser(null)} />;
  }

  return (
    <div>
      {users.length === 0 ? (
        <div className="admin-empty">No users</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Display Name</th>
              <th>Language</th>
              <th>Theme</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="admin-clickable-row" onClick={() => setSelectedUser(u)}>
                <td>{u.id}</td>
                <td>{u.name}</td>
                <td>{u.displayName}</td>
                <td>{u.settings.language}</td>
                <td>{u.settings.theme}</td>
                <td>{u.createdAt}</td>
                <td>
                  <button className="admin-delete-btn" onClick={e => handleDelete(e, u.id, u.name)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// --- Mastery Score (uses shared canonical implementation) ---

import { computeTodayScore, computeRetention, masteryConfigFromSettings } from '@shared/character-stats/mastery';

const configFromSettings = masteryConfigFromSettings;

function masteryColor(score: number): string {
  if (score >= 80) return '#4caf50';
  if (score >= 60) return '#8bc34a';
  if (score >= 40) return '#ffeb3b';
  if (score >= 20) return '#ff9800';
  return '#f44336';
}

// --- User Detail ---

function UserDetail({ user, onBack }: { user: AdminUser; onBack: () => void }) {
  const [tab, setTab] = useState<'overview' | 'writing-challenge'>('writing-challenge');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [moduleSettings, setModuleSettings] = useState<Record<string, string>>({});
  const [debugInfo, setDebugInfo] = useState<{ level: number; totalRanked: number } | null>(null);
  const [charTocfl, setCharTocfl] = useState<Record<string, string>>({});
  const [charRanks, setCharRanks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<UserStats>(`/writing-challenge/admin/user-stats?userId=${user.id}`),
      api<Record<string, string>>('/writing-challenge/admin/settings'),
      api<{ level: number; totalRanked: number }>(`/writing-challenge/debug-info?userId=${user.id}`).catch(() => null),
      api<Record<string, string>>('/content/admin/char-tocfl-levels').catch(() => ({})),
      api<{ char: string; rank: number }[]>('/content/admin/char-ranking').catch(() => []),
    ])
      .then(([s, ms, di, tocfl, ranking]) => {
        setStats(s);
        setModuleSettings(ms);
        if (di) setDebugInfo(di);
        setCharTocfl(tocfl as Record<string, string>);
        // Build rank map from ranking array
        const ranks: Record<string, number> = {};
        if (Array.isArray(ranking)) {
          for (const r of ranking) ranks[r.char] = r.rank;
        }
        setCharRanks(ranks);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.id]);

  const [sortCol, setSortCol] = useState<string>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  if (loading) return <div className="admin-empty">Loading...</div>;

  const charStats = stats?.charStats || [];
  const cfg = configFromSettings(moduleSettings);

  // Compute today/retention for sorting
  const charStatsWithScores = charStats.map((c: CharStat) => {
    const today = computeTodayScore(c, cfg);
    const ret = computeRetention(today, c.lastSeen, cfg);
    return { ...c, _today: today, _retention: ret, _rank: charRanks[c.character] || 99999, _level: charTocfl[c.character] || '' };
  });

  const sortedStats = [...charStatsWithScores].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'rank': cmp = a._rank - b._rank; break;
      case 'level': cmp = (a._level || 'zzz').localeCompare(b._level || 'zzz'); break;
      case 'today': cmp = a._today - b._today; break;
      case 'retention': cmp = a._retention - b._retention; break;
      case 'lastSeen': cmp = (a.lastSeen || '').localeCompare(b.lastSeen || ''); break;
      default: cmp = 0;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  return (
    <div className="user-detail">
      <div className="user-detail-header">
        <button className="back-btn" onClick={onBack}>← Users</button>
        <h3>{user.displayName}</h3>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button className={`admin-tab${tab === 'writing-challenge' ? ' active' : ''}`} onClick={() => setTab('writing-challenge')}>
          Stroke Practice
        </button>
      </div>

      {tab === 'overview' && (
        <div className="user-detail-overview">
          <div className="user-detail-summary">
            <div className="user-detail-stat">
              <span className="user-detail-stat-value">{user.name}</span>
              <span className="user-detail-stat-label">Username</span>
            </div>
            <div className="user-detail-stat">
              <span className="user-detail-stat-value">{user.settings.language}</span>
              <span className="user-detail-stat-label">Language</span>
            </div>
            <div className="user-detail-stat">
              <span className="user-detail-stat-value">{user.settings.theme}</span>
              <span className="user-detail-stat-label">Theme</span>
            </div>
            <div className="user-detail-stat">
              <span className="user-detail-stat-value">{user.createdAt.slice(0, 10)}</span>
              <span className="user-detail-stat-label">Created</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'writing-challenge' && <>
      {stats?.profile && (
        <div className="user-detail-summary">
          <div className="user-detail-stat">
            <span className="user-detail-stat-value">{debugInfo ? `${debugInfo.level}` : '—'}</span>
            <span className="user-detail-stat-label">Level / {debugInfo?.totalRanked || '?'}</span>
          </div>
          <div className="user-detail-stat">
            <span className="user-detail-stat-value">{charStats.length}</span>
            <span className="user-detail-stat-label">Characters Seen</span>
          </div>
          <div className="user-detail-stat">
            <span className="user-detail-stat-value">{charStats.filter(c => c.lastResult === 'perfect').length}</span>
            <span className="user-detail-stat-label">Last Perfect</span>
          </div>
          <div className="user-detail-stat">
            <span className="user-detail-stat-value">{charStats.reduce((sum, c) => sum + c.timesSeen, 0)}</span>
            <span className="user-detail-stat-label">Total Attempts</span>
          </div>
        </div>
      )}

      {charStats.length === 0 ? (
        <div className="admin-empty">No character data yet</div>
      ) : (
        <div className="user-detail-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Char</th>
                <th className="sortable" onClick={() => handleSort('rank')}>Rank {sortCol === 'rank' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="sortable" onClick={() => handleSort('level')}>Level {sortCol === 'level' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="sortable" onClick={() => handleSort('today')}>Today {sortCol === 'today' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="sortable" onClick={() => handleSort('retention')}>Retention {sortCol === 'retention' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th>Seen</th>
                <th>P / C / I</th>
                <th>Streak</th>
                <th>Best</th>
                <th>Last</th>
                <th>Avg ms</th>
                <th>Recent</th>
                <th className="sortable" onClick={() => handleSort('lastSeen')}>Last Seen {sortCol === 'lastSeen' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {sortedStats.map(c => {
                const today = c._today;
                const ret = c._retention;
                return (
                <tr key={c.character}>
                  <td className="user-detail-char">{c.character}</td>
                  <td className="ud-rank">{charRanks[c.character] || '—'}</td>
                  <td className="ud-level">{charTocfl[c.character] ? charTocfl[c.character].replace('第','').replace('級','') : '—'}</td>
                  <td>
                    <div className="ud-mastery">
                      <div className="ud-mastery-bar" style={{ width: today + '%', background: masteryColor(today) }} />
                      <span className="ud-mastery-value">{today}</span>
                    </div>
                  </td>
                  <td>
                    <div className="ud-mastery">
                      <div className="ud-mastery-bar" style={{ width: ret + '%', background: masteryColor(ret) }} />
                      <span className="ud-mastery-value">{ret}</span>
                    </div>
                  </td>
                  <td>{c.timesSeen}</td>
                  <td>
                    <span className="ud-perfect">{c.timesPerfect}</span>
                    {' / '}
                    <span className="ud-correct">{c.timesCorrect}</span>
                    {' / '}
                    <span className="ud-incorrect">{c.timesIncorrect}</span>
                  </td>
                  <td>{c.streakCorrect}</td>
                  <td>{c.bestStreakCorrect}</td>
                  <td>
                    <span className={`ud-result ud-${c.lastResult}`}>
                      {c.lastResult === 'perfect' ? 'P' : c.lastResult === 'correct' ? 'C' : c.lastResult === 'incorrect' ? 'I' : '—'}
                    </span>
                  </td>
                  <td>{c.avgMs > 0 ? Math.round(c.avgMs / 100) / 10 + 's' : '—'}</td>
                  <td className="ud-recent">
                    {c.recentResults ? c.recentResults.split(',').map((r, i) => (
                      <span key={i} className={`ud-dot ud-${r === 'P' ? 'perfect' : r === 'C' ? 'correct' : r === 'S' ? 'skip' : 'incorrect'}`} />
                    )) : '—'}
                  </td>
                  <td className="ud-date">{c.lastSeen ? c.lastSeen.slice(0, 10) : '—'}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </>}
    </div>
  );
}
