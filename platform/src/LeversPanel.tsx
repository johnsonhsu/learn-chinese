/**
 * In-app "levers" panel — lets a device tune the same engine settings the Mac
 * admin exposes. Shipped (Mac-baked) values are the defaults; changes here are
 * stored as per-device overrides (offline-data-layer.setLeverOverride), persist
 * across content updates, and ride along in backups. Reset restores defaults.
 *
 * Only LIVE levers are shown: the dead weight_gap_* / weight_incorrect_multiplier
 * knobs from the old selection model are intentionally omitted, and the real
 * parity_* selection levers (invisible in the legacy admin) are surfaced here.
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useOffline } from './offline/offline-context.tsx';
import { useT, LanguageContext } from './i18n/index.ts';

type L = { zh: string; en: string };
type Control =
  | { kind: 'range'; min: number; max: number; step: number; suffix?: string }
  | { kind: 'toggle' }
  | { kind: 'select'; options: { value: string; label: L }[] };
interface Lever {
  key: string;
  label: L;
  hint?: L;
  /** Fallback default for keys the engine reads but the shipped DB doesn't seed. */
  def: string;
  control: Control;
  /** Optional derived/read-only note (e.g. the complementary level weight). */
  derived?: (v: number) => L;
}
interface Group { id: string; title: L; levers: Lever[]; }

const GROUPS: Group[] = [
  {
    id: 'parity',
    title: { zh: '選字平衡', en: 'Character selection' },
    levers: [
      {
        key: 'parity_need_cap', def: '4',
        label: { zh: '弱字加權上限', en: 'Weak-char boost cap' },
        hint: { zh: '越高，越常挑你比較不熟的字。', en: 'Higher = weaker characters get chosen more often.' },
        control: { kind: 'range', min: 1, max: 8, step: 0.5 },
      },
      {
        key: 'parity_recency_cap', def: '3',
        label: { zh: '久未練加權上限', en: 'Staleness boost cap' },
        hint: { zh: '越高，越會回頭練很久沒寫的字。', en: 'Higher = revisits characters you haven’t seen in a while.' },
        control: { kind: 'range', min: 1, max: 6, step: 0.5 },
      },
      {
        key: 'parity_mastery_weight', def: '1.5',
        label: { zh: '熟練度影響', en: 'Mastery influence' },
        hint: { zh: '低熟練度把字往前排的力道。', en: 'How strongly low mastery raises a character’s priority.' },
        control: { kind: 'range', min: 0, max: 3, step: 0.1 },
      },
      {
        key: 'parity_miss_boost', def: '1',
        label: { zh: '近期失誤加權', en: 'Recent-miss boost' },
        hint: { zh: '最近寫錯的字會額外提高優先。', en: 'Extra priority for characters you recently got wrong.' },
        control: { kind: 'range', min: 0, max: 3, step: 0.5 },
      },
      {
        key: 'weight_incorrect_count', def: '5',
        label: { zh: '失誤偵測範圍（最近 N 次）', en: 'Miss window (last N)' },
        hint: { zh: '判定「近期失誤」時看最近幾次。', en: 'How many recent attempts count toward "recent miss".' },
        control: { kind: 'range', min: 1, max: 10, step: 1 },
      },
    ],
  },
  {
    id: 'ranking',
    title: { zh: '排序', en: 'Ranking' },
    levers: [
      {
        key: 'freq_model', def: 'book',
        label: { zh: '頻率來源', en: 'Frequency source' },
        control: { kind: 'select', options: [
          { value: 'book', label: { zh: '書面語', en: 'Book' } },
          { value: 'taiwan', label: { zh: '台灣（維基）', en: 'Taiwan (wiki)' } },
        ] },
      },
      {
        key: 'rank_freq_weight', def: '60',
        label: { zh: '頻率 / 程度 權重', en: 'Frequency vs level weight' },
        hint: { zh: '越高越偏常用字；其餘權重給 TOCFL 程度。', en: 'Higher favors common characters; the rest goes to TOCFL level.' },
        control: { kind: 'range', min: 0, max: 100, step: 5 },
        derived: (v) => ({ zh: `程度權重：${100 - v}`, en: `Level weight: ${100 - v}` }),
      },
    ],
  },
  {
    id: 'level',
    title: { zh: '程度與目標字', en: 'Level & targets' },
    levers: [
      {
        key: 'level_known_pct', def: '80',
        label: { zh: '升級門檻（已會 %）', en: 'Level-up threshold (% known)' },
        hint: { zh: '前 N 名中要會多少 % 才解鎖該程度。', en: 'Share of ranked characters you must know to unlock a level.' },
        control: { kind: 'range', min: 1, max: 100, step: 1, suffix: '%' },
      },
      {
        key: 'target_include_gaps', def: 'true',
        label: { zh: '補練落後字', en: 'Include gaps' },
        hint: { zh: '把程度以下還沒會的字一起納入練習。', en: 'Also drill not-yet-known characters below your level.' },
        control: { kind: 'toggle' },
      },
      {
        key: 'target_lookback_pct', def: '2',
        label: { zh: '回顧範圍 %', en: 'Look-back %' },
        control: { kind: 'range', min: 0, max: 20, step: 1, suffix: '%' },
      },
      {
        key: 'target_lookahead_pct', def: '5',
        label: { zh: '預習範圍 %', en: 'Look-ahead %' },
        control: { kind: 'range', min: 1, max: 30, step: 1, suffix: '%' },
      },
      {
        key: 'above_level_threshold', def: '30',
        label: { zh: '超綱標示門檻 %', en: 'Above-level flag %' },
        control: { kind: 'range', min: 1, max: 100, step: 1, suffix: '%' },
      },
    ],
  },
  {
    id: 'known',
    title: { zh: '「已會」判定', en: '"Known" criteria' },
    levers: [
      { key: 'known_recent_enabled', def: 'true', label: { zh: '近期正確率', en: 'Recent accuracy' }, control: { kind: 'toggle' } },
      { key: 'known_recent_good', def: '3', label: { zh: '需正確次數', en: 'Required correct' }, control: { kind: 'range', min: 1, max: 10, step: 1 } },
      { key: 'known_recent_window', def: '4', label: { zh: '最近幾次中', en: 'Out of last N' }, control: { kind: 'range', min: 2, max: 10, step: 1 } },
      { key: 'known_retention_enabled', def: 'true', label: { zh: '最低記憶分數', en: 'Min retention' }, control: { kind: 'toggle' } },
      { key: 'known_retention_min', def: '80', label: { zh: '門檻', en: 'Threshold' }, control: { kind: 'range', min: 50, max: 100, step: 5 } },
      { key: 'known_recency_enabled', def: 'true', label: { zh: '近期練過', en: 'Recency check' }, control: { kind: 'toggle' } },
      { key: 'known_recency_days', def: '30', label: { zh: '最多幾天內', en: 'Within N days' }, control: { kind: 'range', min: 7, max: 90, step: 1 } },
    ],
  },
  {
    id: 'mastery',
    title: { zh: '熟練度計分', en: 'Mastery scoring' },
    levers: [
      { key: 'correct_weight', def: '0.6', label: { zh: '「正確」相對「完美」', en: 'Correct vs perfect' }, control: { kind: 'range', min: 0, max: 1, step: 0.1 } },
      { key: 'weight_recent', def: '50', label: { zh: '近期表現權重', en: 'Recent weight' }, control: { kind: 'range', min: 0, max: 100, step: 5 } },
      { key: 'weight_overall', def: '30', label: { zh: '整體正確率權重', en: 'Overall weight' }, control: { kind: 'range', min: 0, max: 100, step: 5 } },
      { key: 'weight_streak', def: '20', label: { zh: '連續權重', en: 'Streak weight' }, control: { kind: 'range', min: 0, max: 100, step: 5 } },
      { key: 'streak_cap', def: '5', label: { zh: '連續上限', en: 'Streak cap' }, control: { kind: 'range', min: 3, max: 20, step: 1 } },
      { key: 'decay_per_day', def: '1', label: { zh: '每日衰退 %', en: 'Decay %/day' }, control: { kind: 'range', min: 0, max: 5, step: 0.1, suffix: '%' } },
      {
        key: 'decay_mode', def: 'scaled', label: { zh: '衰退模式', en: 'Decay mode' },
        control: { kind: 'select', options: [
          { value: 'scaled', label: { zh: '按分數', en: 'Scaled' } },
          { value: 'flat', label: { zh: '固定', en: 'Flat' } },
        ] },
      },
    ],
  },
  {
    id: 'stroke',
    title: { zh: '筆畫辨識', en: 'Stroke recognition' },
    levers: [
      {
        key: 'stroke_leniency', def: '1.0',
        label: { zh: '寬鬆度', en: 'Leniency' },
        hint: { zh: '越高越容易判定筆畫正確。', en: 'Higher accepts looser strokes.' },
        control: { kind: 'range', min: 0.5, max: 2, step: 0.1 },
      },
      {
        key: 'strokes_per_fail', def: '3',
        label: { zh: '幾次後提示', en: 'Attempts before hint' },
        control: { kind: 'range', min: 1, max: 5, step: 1 },
      },
    ],
  },
];

export default function LeversPanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useContext(LanguageContext);
  const { getLevers, setLever, resetLever, resetAllLevers } = useOffline();
  const [tick, setTick] = useState(0);
  // Local draft values for sliders → snappy UI without an IndexedDB write per tick.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const commitTimer = useRef<number | undefined>(undefined);
  // tick forces a re-read of the in-memory overrides after each mutation.
  const data = useMemo(() => getLevers(), [getLevers, tick]);
  const pick = (l: L) => (lang === 'en' ? l.en : l.zh);

  // Cancel any pending debounced range commit on unmount so the timer can't fire
  // (calling setLever/bump) after the panel is gone.
  useEffect(() => () => clearTimeout(commitTimer.current), []);

  if (!data) return null;
  const { defaults, overrides } = data;
  const overrideCount = Object.keys(overrides).length;

  const bump = () => setTick((x) => x + 1);
  const clearDraft = (key: string) => setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
  // Toggles/selects commit immediately; ranges are debounced via onRange.
  const onSet = async (key: string, value: string) => { await setLever(key, value); bump(); };
  const onRange = (key: string, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(async () => { await setLever(key, value); bump(); clearDraft(key); }, 300);
  };
  const onReset = async (key: string) => { await resetLever(key); clearDraft(key); bump(); };
  const onResetAll = async () => { await resetAllLevers(); setDrafts({}); bump(); };

  const renderControl = (lever: Lever, val: string) => {
    const c = lever.control;
    if (c.kind === 'range') {
      return (
        <div className="lever-range">
          <input
            type="range" min={c.min} max={c.max} step={c.step}
            value={Number(val)}
            onChange={(e) => onRange(lever.key, e.target.value)}
          />
          <span className="lever-range__val">{val}{c.suffix ?? ''}</span>
        </div>
      );
    }
    if (c.kind === 'toggle') {
      const on = val === 'true';
      return (
        <div className="lever-pills">
          <button className={`lever-pill${on ? ' active' : ''}`} onClick={() => onSet(lever.key, 'true')}>{t('levers.on')}</button>
          <button className={`lever-pill${!on ? ' active' : ''}`} onClick={() => onSet(lever.key, 'false')}>{t('levers.off')}</button>
        </div>
      );
    }
    return (
      <div className="lever-pills">
        {c.options.map((o) => (
          <button
            key={o.value}
            className={`lever-pill${val === o.value ? ' active' : ''}`}
            onClick={() => onSet(lever.key, o.value)}
          >{pick(o.label)}</button>
        ))}
      </div>
    );
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>{t('app.back')}</button>
        <h2>{t('levers.title')}</h2>
      </div>

      <p className="settings-hint" style={{ margin: '0 0 14px' }}>{t('levers.intro')}</p>

      <div className="settings-section lever-summary">
        <span className="settings-hint" style={{ margin: 0 }}>
          {overrideCount > 0 ? `${overrideCount} ${t('levers.overridden')}` : t('levers.allDefault')}
        </span>
        <button className="lever-reset-all" disabled={overrideCount === 0} onClick={onResetAll}>
          {t('levers.resetAll')}
        </button>
      </div>

      {GROUPS.map((g) => (
        <div className="settings-section" key={g.id}>
          <h3>{pick(g.title)}</h3>
          {g.levers.map((lever) => {
            const shipped = defaults[lever.key] ?? lever.def;
            const cur = overrides[lever.key] ?? shipped;
            const shown = drafts[lever.key] ?? cur;
            const isOver = overrides[lever.key] !== undefined;
            return (
              <div className={`lever-row${isOver ? ' lever-row--over' : ''}`} key={lever.key}>
                <div className="lever-row__head">
                  <span className="lever-row__label">
                    {pick(lever.label)}
                    {isOver && <span className="lever-badge">{t('levers.overridden')}</span>}
                  </span>
                  {isOver && (
                    <button className="lever-reset" title={`${t('levers.reset')} → ${shipped}`} onClick={() => onReset(lever.key)}>↺</button>
                  )}
                </div>
                {lever.hint && <p className="lever-row__hint">{pick(lever.hint)}</p>}
                {renderControl(lever, shown)}
                {lever.derived && <p className="lever-row__hint">{pick(lever.derived(Number(shown)))}</p>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
