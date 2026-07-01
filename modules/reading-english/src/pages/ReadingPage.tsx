import { useState, useRef, useCallback, useEffect } from 'react';
import { BackButton } from '@platform/ui/index.ts';
import { demoKey } from '@platform/offline/demo-key.ts';
import { useOffline } from '../offline/offline-context.tsx';
import { speak } from '../speech.ts';
import { buildReadingPool, tapTile, firstUnresolvedIndex, type ReadingSlot } from '../reading.ts';
import type { ReadingQuestion } from '../cloze.ts';
import { useT } from '../i18n/index.ts';

interface Props {
  onStop: () => void;
}

/**
 * The English reading-comprehension screen (issue #69). Reconstruct the ENGLISH
 * translation of a bank sentence by tapping its WORDS IN ORDER from a shuffled
 * pool of the sentence's own words. Correct tap → the tile is consumed and the
 * slot advances; wrong tap → red-shake feedback, no advance (green pop / red shake
 * reuse practice-english's signature). Auto-skip ON omits the words the reader has
 * already MASTERED from the pool (recorded as a correct read); OFF shows all.
 * NO HanziWriter is used.
 */
export function ReadingPage({ onStop }: Props) {
  const t = useT();
  const { dataLayer } = useOffline();
  const [question, setQuestion] = useState<ReadingQuestion | null>(null);
  const [slots, setSlots] = useState<ReadingSlot[]>([]);
  const [tiles, setTiles] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [wrongTile, setWrongTile] = useState<{ word: string; nonce: number } | null>(null);
  const [poppedIndex, setPoppedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const autoSkipKey = demoKey('reading_english_auto_skip');
  const [autoSkip, setAutoSkip] = useState(() => localStorage.getItem(autoSkipKey) === 'true');
  const toggleAutoSkip = () => {
    const next = !autoSkip;
    setAutoSkip(next);
    localStorage.setItem(autoSkipKey, next ? 'true' : 'false');
  };

  const loadId = useRef(0);
  // Wrong-tap count per slot → feeds the recorded result (perfect vs correct).
  const mistakes = useRef<Record<number, number>>({});

  const loadSentence = useCallback(() => {
    if (!dataLayer) return;
    const thisLoad = ++loadId.current;
    setLoading(true);
    setDone(false);
    setWrongTile(null);
    setPoppedIndex(null);
    mistakes.current = {};
    try {
      const q = dataLayer.getNextReadingSentence();
      if (loadId.current !== thisLoad) return;
      if (!q) { setQuestion(null); setLoading(false); return; }
      const pool = buildReadingPool({
        english: q.english,
        masteredWords: dataLayer.getMasteredWords(),
        autoSkip,
      });
      setQuestion(q);
      setSlots(pool.slots);
      setTiles(pool.tiles);
      setIndex(firstUnresolvedIndex(pool.slots));
      setLoading(false);
      speak(q.english);
    } catch (e) {
      if (loadId.current === thisLoad) { setError((e as Error).message); setLoading(false); }
    }
  }, [dataLayer, autoSkip]);

  useEffect(() => { loadSentence(); }, [loadSentence]);

  // On completion, record EACH word into the reading store: an auto-skipped word
  // is a mastered read (recorded correct); a tapped word with no wrong attempts is
  // correct, with ≥1 wrong attempt is incorrect. Duplicate words are scored per
  // slot (each occurrence submits its own result for the same word key).
  const finish = useCallback(async (finalSlots: ReadingSlot[]) => {
    if (!dataLayer || !question) return;
    for (let i = 0; i < finalSlots.length; i++) {
      const s = finalSlots[i];
      const correct = s.autoSkipped ? true : (mistakes.current[i] || 0) === 0;
      await dataLayer.submitReadingResult(question.sentenceId, s.word, correct);
    }
    setDone(true);
  }, [dataLayer, question]);

  const onTapTile = useCallback((tapped: string, tileIdx: number) => {
    const res = tapTile(slots, index, tiles, tapped);
    if (res.outcome === 'wrong') {
      mistakes.current[index] = (mistakes.current[index] || 0) + 1;
      setWrongTile({ word: tapped, nonce: Date.now() + tileIdx });
      return;
    }
    setWrongTile(null);
    setPoppedIndex(index);
    setTiles(res.tiles);
    setIndex(res.nextIndex);
    if (res.done) { void finish(slots); }
  }, [slots, index, tiles, finish]);

  // --- Done screen ---
  if (done) {
    const scored = slots.map((s, i) => ({ s, i })).filter(({ s }) => !s.autoSkipped);
    const perfect = scored.filter(({ i }) => (mistakes.current[i] ?? 0) === 0).length;
    const perfectAll = scored.length > 0 && scored.every(({ i }) => (mistakes.current[i] ?? 0) === 0);
    return (
      <div className="re-page re-page--done">
        <div className="re-done-card">
          {question && <div className="re-done-chinese">{question.chinese}</div>}
          <div className="re-done-sentence" onClick={() => question && speak(question.english)}>
            {slots.map((s, i) => (
              <span key={i} className={`re-done-word${s.autoSkipped ? ' re-done-word--skip' : ''}`}>{s.word}</span>
            ))}
          </div>
          {perfectAll ? (
            <div className="re-celebrate"><span aria-hidden>✨</span> {t('reading.perfectAll')} <span aria-hidden>✨</span></div>
          ) : (
            <div className="re-done-stats">{perfect} {t('reading.correct')}</div>
          )}
          <div className="re-done-actions">
            <button className="re-btn-primary" onClick={loadSentence}>{t('reading.nextSession')}</button>
            <button className="re-btn-secondary" onClick={onStop}>{t('reading.stop')}</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="re-empty">{t('reading.loading')}</div>;
  if (error) return <div className="re-empty" style={{ color: 'var(--error)' }}>{error}</div>;
  if (!question) return <div className="re-empty">{t('reading.noSentences')}</div>;

  return (
    <div className="re-page">
      <div className="re-top">
        <BackButton size="sm" onClick={onStop} label={t('reading.back')} />
        <div className="re-settings">
          <button
            className={`sp-autoskip-toggle${autoSkip ? ' active' : ''}`}
            onClick={toggleAutoSkip}
            title="Auto-skip words you've mastered"
          >
            {t('reading.autoSkip')} {autoSkip ? t('reading.on') : t('reading.off')}
          </button>
          <button className="re-new-btn" onClick={loadSentence} title={t('reading.newSentence')}>↻</button>
        </div>
      </div>

      <div className="re-prompt-card">
        <div className="re-prompt-row">
          <button type="button" className="re-audio-btn" onClick={() => speak(question.english)} aria-label={t('reading.hearSentence')}>🔊</button>
          <div className="re-prompt-chinese">{question.chinese}</div>
        </div>

        {/* In-order sentence strip: filled slots show the tapped word; the current
            slot is highlighted; not-yet-reached slots show a blank placeholder. */}
        <div className="re-sentence-strip">
          {slots.map((s, i) => {
            const filled = i < index;
            const isActive = i === index;
            const isAuto = s.autoSkipped;
            const cls = ['re-slot',
              filled && 're-slot--filled',
              isActive && 're-slot--active',
              isAuto && 're-slot--skip',
              poppedIndex === i && 're-slot--pop',
            ].filter(Boolean).join(' ');
            return (
              <span key={i} className={cls}>
                {(filled || isAuto) ? s.word : ''}
              </span>
            );
          })}
        </div>

        <div className="re-instruction">{t('reading.instruction')}</div>

        {/* Tile pool: the shuffled sentence words still to place. Each tap tests
            against the current slot; a correct tap consumes the tile. */}
        <div className="re-tile-pool">
          {tiles.map((w, i) => {
            const isWrong = wrongTile && wrongTile.word === w;
            return (
              <button
                key={`${w}-${i}`}
                className={`re-tile${isWrong ? ' re-tile--wrong' : ''}`}
                onClick={() => onTapTile(w, i)}
              >
                {w}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
