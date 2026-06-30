import { useState, useEffect, useCallback } from 'react';
import { LanguageContext, useT } from './i18n/index.ts';
import type { Language } from './i18n/index.ts';
import { useOffline } from '@platform/offline/offline-context.tsx';
import { PracticeModal } from '@platform/components/PracticeModal.tsx';
import { speak } from '@platform/utils/speech.ts';
import { CharTile, type CharResultCode } from '@platform/ui/index.ts';
import {
  computeMastery as sharedComputeMastery,
  masteryConfigFromSettings,
  computeTodayScore,
  computeRetention,
} from '@shared/character-stats/mastery';
import './App.css';

interface CharStat {
  character: string;
  timesSeen: number;
  timesPerfect: number;
  timesCorrect: number;
  timesIncorrect: number;
  streakCorrect: number;
  bestStreakCorrect: number;
  lastSeen: string;
  lastPerfect: string;
  lastCorrect: string;
  lastResult: string;
  avgMs: number;
  recentResults: string;
}

// Mastery — single source of truth from shared package (pure, no node deps)
function computeMastery(s: CharStat | undefined, settings: Record<string, string>): number {
  return sharedComputeMastery(s, masteryConfigFromSettings(settings));
}

// Score → color, matching the admin stats table.
function masteryColor(score: number): string {
  if (score >= 80) return '#4caf50';
  if (score >= 60) return '#8bc34a';
  if (score >= 40) return '#ffeb3b';
  if (score >= 20) return '#ff9800';
  return '#f44336';
}

function isCharKnownClient(s: CharStat, settings: Record<string, string>): boolean {
  // Condition 1: recent accuracy
  if (settings['known_recent_enabled'] !== 'false') {
    const needed = parseInt(settings['known_recent_good'] || '3');
    const window = parseInt(settings['known_recent_window'] || '4');
    const codes = s.recentResults.split(',').filter(c => c && c !== 'S'); // exclude skips
    if (codes.length < needed) return false;
    const lastN = codes.slice(-window);
    if (lastN.filter(c => c === 'P' || c === 'C').length < needed) return false;
  }
  // Condition 2: retention (uses shared mastery)
  if (settings['known_retention_enabled'] !== 'false') {
    const retMin = parseInt(settings['known_retention_min'] || '80');
    if (s.timesSeen === 0) return false;
    const ret = sharedComputeMastery(s, masteryConfigFromSettings(settings));
    if (ret < retMin) return false;
  }
  // Condition 3: recency
  if (settings['known_recency_enabled'] !== 'false') {
    const maxDays = parseInt(settings['known_recency_days'] || '30');
    const lastGood = s.lastPerfect > s.lastCorrect ? s.lastPerfect : s.lastCorrect;
    if (!lastGood) return false;
    const days = Math.floor((Date.now() - new Date(lastGood).getTime()) / 86400000);
    if (days > maxDays) return false;
  }
  return true;
}

// Unified stat tile for the My Characters screen. Candy 3D treatment (solid
// face + darker "lip" shadow, matching .module-tile / .btn-primary), a distinct
// accent per stat, an icon, and a clear value→label hierarchy. Rendered
// identically in both the grid and table views via the shared stat set below.
function MyCharsStat({ icon, value, label, accent }: {
  icon: string; value: string | number; label: string;
  accent: 'gold' | 'green' | 'teal' | 'orange' | 'purple';
}) {
  return (
    <div className={`mc-stat mc-stat-${accent}`}>
      <span className="mc-stat-icon" aria-hidden="true">{icon}</span>
      <span className="mc-stat-value">{value}</span>
      <span className="mc-stat-label">{label}</span>
    </div>
  );
}

function MyCharsPage({ userId, onExit }: { userId: number; onExit?: () => void }) {
  const t = useT();
  const { dataLayer } = useOffline();
  const [stats, setStats] = useState<CharStat[]>([]);
  const [charRanks, setCharRanks] = useState<Record<string, number>>({});
  const [charTocfl, setCharTocfl] = useState<Record<string, string>>({});
  const [moduleSettings, setModuleSettings] = useState<Record<string, string>>({});
  const [userLevel, setUserLevel] = useState(0);
  const [fluency, setFluency] = useState(0);
  const [totalKnown, setTotalKnown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [practiceChar, setPracticeChar] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [sortCol, setSortCol] = useState<'rank' | 'level' | 'today' | 'retention' | 'seen' | 'lastSeen'>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir(col === 'rank' || col === 'level' ? 'asc' : 'desc'); }
  };

  const loadData = useCallback(() => {
    if (!dataLayer) return;
    setStats(dataLayer.getCharacterStatsList() as CharStat[]);
    setModuleSettings(dataLayer.getModuleSettings());
    const di = dataLayer.getDebugInfo();
    if (di) { setUserLevel(di.level || 0); setFluency(di.fluency || 0); setTotalKnown(di.totalKnown || 0); }
    setCharTocfl(dataLayer.getCharTocflLevels());
    const ranks: Record<string, number> = {};
    for (const r of dataLayer.getCharRanking()) ranks[r.char] = r.rank;
    setCharRanks(ranks);
    setLoading(false);
  }, [dataLayer]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="loading">Loading...</div>;

  // Sort by rank
  const sorted = [...stats].sort((a, b) => {
    const ra = charRanks[a.character] || 99999;
    const rb = charRanks[b.character] || 99999;
    return ra - rb;
  });

  // Categorize using full mastery criteria
  const known = sorted.filter(s => isCharKnownClient(s, moduleSettings));
  const learning = sorted.filter(s => !known.includes(s));
  const aboveThreshold = parseInt(moduleSettings['above_level_threshold'] || '30');

  // Per-character scores, computed once and shared by the stat tiles + table.
  // `today` = memory strength as of the last practice (no time decay);
  // `retention` = `today` decayed along the forgetting curve by days-since-seen.
  const cfg = masteryConfigFromSettings(moduleSettings);
  const scored = stats.map(s => {
    const today = computeTodayScore(s, cfg);
    return { s, today, retention: computeRetention(today, s.lastSeen, cfg) };
  });
  // Tile retention = mean current retention across every character seen.
  const avgRetention = scored.length
    ? Math.round(scored.reduce((sum, r) => sum + r.retention, 0) / scored.length)
    : 0;

  // ONE stat set, rendered identically in both views.
  const statTiles = (
    <div className="mc-stats">
      <MyCharsStat icon="⚡" accent="gold"   value={fluency}        label={t('myChars.fluency')} />
      <MyCharsStat icon="✓"  accent="green"  value={totalKnown}     label={t('myChars.known')} />
      <MyCharsStat icon="📈" accent="teal"   value={learning.length} label={t('myChars.learning')} />
      <MyCharsStat icon="🧠" accent="orange" value={`${avgRetention}%`} label={t('myChars.retention')} />
      <MyCharsStat icon="👁" accent="purple" value={stats.length}   label={t('myChars.seen')} />
    </div>
  );

  return (
    // `.app-shell` so the shared kit's `.app-shell .char-tile` rules apply on
    // this screen (same trick the Styleguide uses); it's just
    // `width:100%; position:relative`, so it has no layout side effects.
    <div className="my-chars-page app-shell">
      {practiceChar && (
        <PracticeModal
          character={practiceChar}
          userId={userId}
          onClose={() => { setPracticeChar(null); loadData(); }}
        />
      )}
      <div className="my-chars-header">
        <button className="back-btn" onClick={onExit}>←</button>
        <h2>{t('myChars.title')}</h2>
        <button
          className="icon-btn"
          onClick={() => setViewMode(v => (v === 'grid' ? 'table' : 'grid'))}
          title={viewMode === 'grid' ? t('myChars.statsTable') : t('myChars.grid')}
        >
          {viewMode === 'grid' ? '☰' : '▦'}
        </button>
      </div>

      {statTiles}

      {viewMode === 'grid' && known.length > 0 && (
        <div className="my-chars-section">
          <h3>{t('myChars.known')} ({known.length})</h3>
          <div className="my-chars-grid">
            {known.map(s => {
              const rank = charRanks[s.character] || 0;
              const cat = rank === 0 ? 'target' : rank > userLevel + aboveThreshold ? 'above' : rank <= userLevel ? 'below' : 'target';
              const mastery = computeMastery(s, moduleSettings);
              const level = charTocfl[s.character];
              return (
                <CharTile
                  key={s.character}
                  char={s.character}
                  rank={rank}
                  level={level ? level.replace('第', '').replace('級', '') : undefined}
                  mastery={mastery}
                  recent={s.recentResults.split(',').filter(Boolean).slice(-5) as CharResultCode[]}
                  ribbon={cat}
                  known
                  size="lg"
                  ariaLabel={t('myChars.practiceChar').replace('{char}', s.character)}
                  onActivate={() => { speak(s.character); setPracticeChar(s.character); }}
                />
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'grid' && learning.length > 0 && (
        <div className="my-chars-section">
          <h3>{t('myChars.learning')} ({learning.length})</h3>
          <div className="my-chars-grid">
            {learning.map(s => {
              const rank = charRanks[s.character] || 0;
              const cat = rank === 0 ? 'target' : rank > userLevel + aboveThreshold ? 'above' : rank <= userLevel ? 'below' : 'target';
              const mastery = computeMastery(s, moduleSettings);
              const level = charTocfl[s.character];
              return (
                <CharTile
                  key={s.character}
                  char={s.character}
                  rank={rank}
                  level={level ? level.replace('第', '').replace('級', '') : undefined}
                  mastery={mastery}
                  recent={s.recentResults.split(',').filter(Boolean).slice(-5) as CharResultCode[]}
                  ribbon={cat}
                  size="lg"
                  ariaLabel={t('myChars.practiceChar').replace('{char}', s.character)}
                  onActivate={() => { speak(s.character); setPracticeChar(s.character); }}
                />
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'table' && (() => {
        // Reuse the shared `scored` rows. Mem = today's memory strength (no time
        // decay); Retention = that strength decayed by days-since-last-seen.
        const rows = [...scored].sort((a, b) => {
          let cmp = 0;
          if (sortCol === 'rank') cmp = (charRanks[a.s.character] || 99999) - (charRanks[b.s.character] || 99999);
          else if (sortCol === 'level') cmp = (charTocfl[a.s.character] || 'zzz').localeCompare(charTocfl[b.s.character] || 'zzz');
          else if (sortCol === 'today') cmp = a.today - b.today;
          else if (sortCol === 'retention') cmp = a.retention - b.retention;
          else if (sortCol === 'seen') cmp = a.s.timesSeen - b.s.timesSeen;
          else cmp = (a.s.lastSeen || '').localeCompare(b.s.lastSeen || '');
          return sortDir === 'desc' ? -cmp : cmp;
        });
        const arrow = (c: typeof sortCol) => (sortCol === c ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
        return (
          <div className="user-detail-table-wrap">
            <table className="admin-table my-chars-table">
              <thead>
                <tr>
                  <th>{t('myChars.colChar')}</th>
                  <th className="sortable" onClick={() => handleSort('rank')}>{t('myChars.colRank')}{arrow('rank')}</th>
                  <th className="sortable" onClick={() => handleSort('level')}>{t('myChars.colLevel')}{arrow('level')}</th>
                  <th className="sortable" onClick={() => handleSort('today')}>{t('myChars.colMem')}{arrow('today')}</th>
                  <th className="sortable" onClick={() => handleSort('retention')}>{t('myChars.colRetention')}{arrow('retention')}</th>
                  <th className="sortable" onClick={() => handleSort('seen')}>{t('myChars.colSeen')}{arrow('seen')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, today, retention }) => (
                  <tr key={s.character} onClick={() => { speak(s.character); setPracticeChar(s.character); }}>
                    <td className="user-detail-char">{s.character}</td>
                    <td className="ud-rank">{charRanks[s.character] || '—'}</td>
                    <td className="ud-level">{charTocfl[s.character] ? charTocfl[s.character].replace('第', '').replace('級', '') : '—'}</td>
                    <td className="ud-mem" style={{ fontWeight: 800, color: masteryColor(today) }}>{today}</td>
                    <td className="ud-ret" style={{ fontWeight: 800, color: masteryColor(retention) }}>{retention}</td>
                    <td className="ud-seen">{s.timesSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

export default function App({ userId, language, onExit }: { userId: number; language: Language; onExit?: () => void }) {
  return (
    <LanguageContext.Provider value={language}>
      <MyCharsPage userId={userId} onExit={onExit} />
    </LanguageContext.Provider>
  );
}
