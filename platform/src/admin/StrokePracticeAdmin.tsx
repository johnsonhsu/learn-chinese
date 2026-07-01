import { useState, useEffect } from 'react';
import { SettingsGroup, InfoTip } from '../components/SettingsGroup.tsx';

function WeightTriple({ recent, overall, streak, onChange }: {
  recent: number; overall: number; streak: number;
  onChange: (_r: number, _o: number, _s: number) => void;
}) {
  const total = recent + overall + streak;

  return (
    <div className="sa-weight-triple">
      <div className="sa-weight-header">
        <span>Score Weights</span>
        <span className={`sa-weight-total${total === 100 ? '' : ' invalid'}`}>{total}/100</span>
      </div>
      <div className="sa-weight-bars">
        <div className="sa-weight-bar" style={{ flex: recent || 0.01 }}>
          <span className="sa-weight-bar-fill recent" />
        </div>
        <div className="sa-weight-bar" style={{ flex: overall || 0.01 }}>
          <span className="sa-weight-bar-fill overall" />
        </div>
        <div className="sa-weight-bar" style={{ flex: streak || 0.01 }}>
          <span className="sa-weight-bar-fill streak" />
        </div>
      </div>
      <div className="sa-weight-row">
        <label>Recent</label>
        <input type="range" min="0" max="100" step="1" value={recent} onChange={e => onChange(Number(e.target.value), overall, streak)} />
        <span className="sa-setting-value">{recent}</span>
      </div>
      <div className="sa-weight-row">
        <label>Overall</label>
        <input type="range" min="0" max="100" step="1" value={overall} onChange={e => onChange(recent, Number(e.target.value), streak)} />
        <span className="sa-setting-value">{overall}</span>
      </div>
      <div className="sa-weight-row">
        <label>Streak</label>
        <input type="range" min="0" max="100" step="1" value={streak} onChange={e => onChange(recent, overall, Number(e.target.value))} />
        <span className="sa-setting-value">{streak}</span>
      </div>
    </div>
  );
}


const BASE = '/api/writing-challenge';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function StrokePracticeAdmin() {
  const [moduleSettings, setModuleSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = () => {
    api<Record<string, string>>('/admin/settings')
      .then(ms => setModuleSettings(ms))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSettingChange = async (key: string, value: string) => {
    const updated = await api<Record<string, string>>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ [key]: value }),
    });
    setModuleSettings(updated);
  };

  if (loading) return <div className="admin-empty">Loading...</div>;

  return (
    <div className="sa-container">
      <h2 className="sa-page-title">Settings</h2>

      <SettingsGroup title="Stroke Recognition">
        <div className="sa-setting-row">
          <label>Leniency <InfoTip text="How forgiving stroke matching is. Higher = more tolerant of imprecise strokes. 0.5 = strict, 1.0 = normal, 2.0 = very loose." /></label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={moduleSettings['stroke_leniency'] || '1.0'}
            onChange={e => handleSettingChange('stroke_leniency', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['stroke_leniency'] || '1.0'}</span>
        </div>
        <div className="sa-setting-row">
          <label>Attempts per stroke <InfoTip text="Wrong attempts allowed per stroke before it's marked as failed. After this many failures on a single stroke, the correct stroke is shown as a hint and the attempt counts as hinted (not scored)." /></label>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={moduleSettings['strokes_per_fail'] || '3'}
            onChange={e => handleSettingChange('strokes_per_fail', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['strokes_per_fail'] || '3'}</span>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Mastery Scoring">
        <div className="sa-formula">
          <div className="sa-formula-title">Today Score (0-100)</div>
          <code>recent_trend × {moduleSettings['weight_recent'] || '50'}% + overall_ratio × {moduleSettings['weight_overall'] || '30'}% + streak × {moduleSettings['weight_streak'] || '20'}%</code>
          <div className="sa-formula-detail">
            <span>recent_trend = weighted avg of last 10 results (P=1, C={moduleSettings['correct_weight'] || '0.6'}, I=0, later results weigh more)</span>
            <span>overall_ratio = (perfects + corrects × {moduleSettings['correct_weight'] || '0.6'}) / total_seen</span>
            <span>streak = min(current_correct_streak / {moduleSettings['streak_cap'] || '5'}, 1)</span>
          </div>
          <div className="sa-formula-title">Retention Score</div>
          <code>{(moduleSettings['decay_mode'] || 'scaled') === 'flat'
            ? `today × (1 - ${moduleSettings['decay_per_day'] || '1'}%)^days_since_last_seen`
            : `today × (1 - ${moduleSettings['decay_per_day'] || '1'}% × (1 - today/200))^days_since_last_seen`
          }</code>
          <div className="sa-formula-detail">
            <span>{(moduleSettings['decay_mode'] || 'scaled') === 'scaled'
              ? 'Scaled: stronger memories decay slower (today=90 → ~0.55%/day, today=30 → ~0.85%/day)'
              : 'Flat: all characters decay at the same rate regardless of mastery'
            }</span>
          </div>
          <div className="sa-formula-title">Result Classification</div>
          <div className="sa-formula-detail">
            <span><b>Perfect</b> = every stroke correct on first attempt</span>
            <span><b>Correct</b> = all strokes passed (some retries, none hit {moduleSettings['strokes_per_fail'] || '3'}-fail limit)</span>
            <span><b>Incorrect</b> = 1+ strokes hit the fail limit</span>
            <span><b>Hinted</b> = hint was shown → attempt not counted in scores</span>
          </div>
        </div>
        <div className="sa-setting-row">
          <label>Correct weight</label>
          <input
            type="range" min="0" max="1" step="0.1"
            value={moduleSettings['correct_weight'] || '0.6'}
            onChange={e => handleSettingChange('correct_weight', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['correct_weight'] || '0.6'}</span>
        </div>
        <WeightTriple
          recent={parseInt(moduleSettings['weight_recent'] || '50')}
          overall={parseInt(moduleSettings['weight_overall'] || '30')}
          streak={parseInt(moduleSettings['weight_streak'] || '20')}
          onChange={(r, o, s) => {
            handleSettingChange('weight_recent', String(r));
            handleSettingChange('weight_overall', String(o));
            handleSettingChange('weight_streak', String(s));
          }}
        />
        <div className="sa-setting-row">
          <label>Streak cap</label>
          <input
            type="range" min="3" max="20" step="1"
            value={moduleSettings['streak_cap'] || '5'}
            onChange={e => handleSettingChange('streak_cap', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['streak_cap'] || '5'}</span>
        </div>
        <div className="sa-setting-row">
          <label>Decay %/day</label>
          <input
            type="range" min="0" max="5" step="0.1"
            value={moduleSettings['decay_per_day'] || '1'}
            onChange={e => handleSettingChange('decay_per_day', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['decay_per_day'] || '1'}</span>
        </div>
        <div className="sa-setting-row">
          <label>Decay mode</label>
          <div className="sa-toggle-group">
            <button
              className={`sa-toggle-btn${(moduleSettings['decay_mode'] || 'scaled') === 'flat' ? ' active' : ''}`}
              onClick={() => handleSettingChange('decay_mode', 'flat')}
            >Flat</button>
            <button
              className={`sa-toggle-btn${(moduleSettings['decay_mode'] || 'scaled') === 'scaled' ? ' active' : ''}`}
              onClick={() => handleSettingChange('decay_mode', 'scaled')}
            >Scaled</button>
          </div>
        </div>
        <div className="sa-formula-title" style={{ marginTop: 12 }}>Character "Known" Criteria</div>
        <div className="sa-formula-detail">
          <span>A character is "known" when all enabled conditions are met.</span>
        </div>

        {/* Criterion 1: Recent accuracy */}
        <div className="sa-known-criterion">
          <div className="sa-setting-row">
            <label>Recent accuracy</label>
            <div className="sa-toggle-group">
              <button
                className={`sa-toggle-btn${(moduleSettings['known_recent_enabled'] ?? 'true') === 'true' ? ' active' : ''}`}
                onClick={() => handleSettingChange('known_recent_enabled', (moduleSettings['known_recent_enabled'] ?? 'true') === 'true' ? 'false' : 'true')}
              >{(moduleSettings['known_recent_enabled'] ?? 'true') === 'true' ? 'ON' : 'OFF'}</button>
            </div>
          </div>
          {(moduleSettings['known_recent_enabled'] ?? 'true') === 'true' && (
            <>
              <div className="sa-setting-row">
                <label>Required correct <InfoTip text="Number of correct/perfect attempts needed." /></label>
                <input
                  type="range" min="1" max="10" step="1"
                  value={moduleSettings['known_recent_good'] || '3'}
                  onChange={e => handleSettingChange('known_recent_good', e.target.value)}
                />
                <span className="sa-setting-value">{moduleSettings['known_recent_good'] || '3'}</span>
              </div>
              <div className="sa-setting-row">
                <label>Out of last <InfoTip text="Window of recent attempts to check." /></label>
                <input
                  type="range" min="2" max="10" step="1"
                  value={moduleSettings['known_recent_window'] || '4'}
                  onChange={e => handleSettingChange('known_recent_window', e.target.value)}
                />
                <span className="sa-setting-value">{moduleSettings['known_recent_window'] || '4'}</span>
              </div>
            </>
          )}
        </div>

        {/* Criterion 2: Retention score */}
        <div className="sa-known-criterion">
          <div className="sa-setting-row">
            <label>Min retention</label>
            <div className="sa-toggle-group">
              <button
                className={`sa-toggle-btn${(moduleSettings['known_retention_enabled'] ?? 'true') === 'true' ? ' active' : ''}`}
                onClick={() => handleSettingChange('known_retention_enabled', (moduleSettings['known_retention_enabled'] ?? 'true') === 'true' ? 'false' : 'true')}
              >{(moduleSettings['known_retention_enabled'] ?? 'true') === 'true' ? 'ON' : 'OFF'}</button>
            </div>
          </div>
          {(moduleSettings['known_retention_enabled'] ?? 'true') === 'true' && (
            <div className="sa-setting-row">
              <label>Threshold <InfoTip text="Minimum mastery retention score (0-100) for a character to count as known." /></label>
              <input
                type="range" min="50" max="100" step="5"
                value={moduleSettings['known_retention_min'] || '80'}
                onChange={e => handleSettingChange('known_retention_min', e.target.value)}
              />
              <span className="sa-setting-value">{moduleSettings['known_retention_min'] || '80'}</span>
            </div>
          )}
        </div>

        {/* Criterion 3: Recency */}
        <div className="sa-known-criterion">
          <div className="sa-setting-row">
            <label>Recency check</label>
            <div className="sa-toggle-group">
              <button
                className={`sa-toggle-btn${(moduleSettings['known_recency_enabled'] ?? 'true') === 'true' ? ' active' : ''}`}
                onClick={() => handleSettingChange('known_recency_enabled', (moduleSettings['known_recency_enabled'] ?? 'true') === 'true' ? 'false' : 'true')}
              >{(moduleSettings['known_recency_enabled'] ?? 'true') === 'true' ? 'ON' : 'OFF'}</button>
            </div>
          </div>
          {(moduleSettings['known_recency_enabled'] ?? 'true') === 'true' && (
            <div className="sa-setting-row">
              <label>Max days <InfoTip text="Max days since last correct/perfect. After this, the character loses known status." /></label>
              <input
                type="range" min="7" max="90" step="1"
                value={moduleSettings['known_recency_days'] || '30'}
                onChange={e => handleSettingChange('known_recency_days', e.target.value)}
              />
              <span className="sa-setting-value">{moduleSettings['known_recency_days'] || '30'}</span>
            </div>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Word Selection">
        <div className="sa-setting-row">
          <label>Frequency source <InfoTip text="Which frequency data to use for ranking characters. Movie/Book uses mainland Chinese corpus data. Taiwan uses Wiktionary Taiwan frequency list. Chars missing from the chosen source fall back to the other." /></label>
          <select
            value={moduleSettings['freq_model'] || 'book'}
            onChange={e => handleSettingChange('freq_model', e.target.value)}
          >
            <option value="book">Movie / Book</option>
            <option value="taiwan">Taiwan</option>
          </select>
        </div>
        <div className="sa-setting-row">
          <label>Frequency / Level weight <InfoTip text="Balance between frequency (common chars rank higher) and TOCFL level (lower level chars rank higher). Must add to 100%." /></label>
          <input
            type="range" min="0" max="100" step="1"
            value={moduleSettings['rank_freq_weight'] || '60'}
            onChange={e => {
              const freq = Number(e.target.value);
              handleSettingChange('rank_freq_weight', String(freq));
              handleSettingChange('rank_level_weight', String(100 - freq));
            }}
          />
          <span className="sa-setting-value">{moduleSettings['rank_freq_weight'] || '60'} / {moduleSettings['rank_level_weight'] || '40'}</span>
        </div>
        <div className="sa-setting-row">
          <label>Above level threshold <InfoTip text="Characters ranked this many positions above your level are marked red and auto-skipped. Lower = stricter." /></label>
          <input
            type="range" min="1" max="100" step="1"
            value={moduleSettings['above_level_threshold'] || '30'}
            onChange={e => handleSettingChange('above_level_threshold', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['above_level_threshold'] || '30'}</span>
        </div>
        <div className="sa-setting-row">
          <label>Level known % <InfoTip text="Percentage of the top N ranked chars you must know for your level to be N. Lower = advance faster with more gaps. Higher = stricter mastery required." /></label>
          <input
            type="range" min="1" max="100" step="1"
            value={moduleSettings['level_known_pct'] || '80'}
            onChange={e => handleSettingChange('level_known_pct', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['level_known_pct'] || '80'}%</span>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Target Words">
        <div className="sa-setting-row">
          <label>Include gaps <InfoTip text="Also target any unknown char ranked below your level. Forces filling knowledge gaps before advancing." /></label>
          <div className="sa-toggle-group">
            <button
              className={`sa-toggle-btn${(moduleSettings['target_include_gaps'] ?? 'true') === 'true' ? ' active' : ''}`}
              onClick={() => handleSettingChange('target_include_gaps', (moduleSettings['target_include_gaps'] ?? 'true') === 'true' ? 'false' : 'true')}
            >{(moduleSettings['target_include_gaps'] ?? 'true') === 'true' ? 'ON' : 'OFF'}</button>
          </div>
        </div>
        <div className="sa-setting-row">
          <label>Look back % <InfoTip text="How far behind your rank level to look for unknown chars to review. E.g. 2% at level 100 = look back to rank 98." /></label>
          <input
            type="range" min="0" max="20" step="1"
            value={moduleSettings['target_lookback_pct'] || '2'}
            onChange={e => handleSettingChange('target_lookback_pct', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['target_lookback_pct'] || '2'}%</span>
        </div>
        <div className="sa-setting-row">
          <label>Look ahead % <InfoTip text="How far ahead of your rank level to look for new chars. E.g. 5% at level 100 = look ahead to rank 105. Always at least +5." /></label>
          <input
            type="range" min="1" max="30" step="1"
            value={moduleSettings['target_lookahead_pct'] || '5'}
            onChange={e => handleSettingChange('target_lookahead_pct', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['target_lookahead_pct'] || '5'}%</span>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Character Selection (parity)">
        <div className="sa-formula-detail">
          <span>Balances which target chars get picked: weak, stale, and recently-missed chars are prioritised — each capped so practice stays even rather than fixating on a few chars.</span>
        </div>
        <div className="sa-setting-row">
          <label>Weak-char boost cap <InfoTip text="Max extra weight a low-mastery char can get. Higher = weak chars chosen more often." /></label>
          <input
            type="range" min="1" max="8" step="0.5"
            value={moduleSettings['parity_need_cap'] || '4'}
            onChange={e => handleSettingChange('parity_need_cap', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['parity_need_cap'] || '4'}×</span>
        </div>
        <div className="sa-setting-row">
          <label>Staleness boost cap <InfoTip text="Max extra weight for chars not seen in a while (anti-starvation)." /></label>
          <input
            type="range" min="1" max="6" step="0.5"
            value={moduleSettings['parity_recency_cap'] || '3'}
            onChange={e => handleSettingChange('parity_recency_cap', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['parity_recency_cap'] || '3'}×</span>
        </div>
        <div className="sa-setting-row">
          <label>Mastery influence <InfoTip text="How strongly low mastery raises a char's priority." /></label>
          <input
            type="range" min="0" max="3" step="0.1"
            value={moduleSettings['parity_mastery_weight'] || '1.5'}
            onChange={e => handleSettingChange('parity_mastery_weight', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['parity_mastery_weight'] || '1.5'}</span>
        </div>
        <div className="sa-setting-row">
          <label>Recent-miss boost <InfoTip text="Extra priority for chars missed within the recent window below." /></label>
          <input
            type="range" min="0" max="3" step="0.5"
            value={moduleSettings['parity_miss_boost'] || '1'}
            onChange={e => handleSettingChange('parity_miss_boost', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['parity_miss_boost'] || '1'}</span>
        </div>
        <div className="sa-setting-row">
          <label>Recent-miss window <InfoTip text="How many recent attempts count toward 'recently missed'." /></label>
          <input
            type="range" min="1" max="10" step="1"
            value={moduleSettings['weight_incorrect_count'] || '5'}
            onChange={e => handleSettingChange('weight_incorrect_count', e.target.value)}
          />
          <span className="sa-setting-value">{moduleSettings['weight_incorrect_count'] || '5'}</span>
        </div>
      </SettingsGroup>
    </div>
  );
}
