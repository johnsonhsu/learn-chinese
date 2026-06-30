import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { BackButton, Button } from '@platform/ui/index.ts';
import { useOffline } from '../offline/offline-context.js';
import { useT } from '../i18n/index.js';
import { speak } from '../speech.js';
import type { SpellQuestion } from '../cloze.js';
import Keyboard, { type KeyAction } from '../components/Keyboard.js';

interface SessionResult {
  total: number;   // words attempted across the session
  correct: number; // words spelled with zero wrong keys
}

interface Props {
  /** Return to the module's MAIN screen (landing); drives onDone, "Stop", and Back. */
  onDone: () => void;
}

/** Letter count of a word's KEY (separators like ' and - don't count as slots). */
function letterCount(key: string): number {
  return key.replace(/[^a-z]/g, '').length;
}

export default function PracticePage({ onDone }: Props) {
  const t = useT();
  const { dataLayer } = useOffline();
  const [question, setQuestion] = useState<SpellQuestion | null>(null);

  // progress[i] = the correctly-entered prefix of word i (lowercased letters/separators).
  const [progress, setProgress] = useState<string[]>([]);
  // Index of the active word (the one currently being spelled).
  const [activeIdx, setActiveIdx] = useState(0);
  // Words (by index) that had ≥1 wrong key this round → counted as not-mastered.
  const errorWordsRef = useRef<Set<number>>(new Set());
  // Transient wrong-key flash for the active blank.
  const [wrongFlash, setWrongFlash] = useState(false);
  const wrongTimer = useRef<number | undefined>(undefined);

  const [roundDone, setRoundDone] = useState(false);
  const [session, setSession] = useState<SessionResult>({ total: 0, correct: 0 });
  const [showDone, setShowDone] = useState(false);

  const loadNext = useCallback(() => {
    if (!dataLayer) return;
    const q = dataLayer.getNextSentence();
    if (!q) { setShowDone(true); return; }
    errorWordsRef.current = new Set();
    setQuestion(q);
    setProgress(q.words.map(() => ''));
    setActiveIdx(0);
    setWrongFlash(false);
    setRoundDone(false);
  }, [dataLayer]);

  useEffect(() => { loadNext(); }, [loadNext]);
  useEffect(() => () => window.clearTimeout(wrongTimer.current), []);

  const recordRound = useCallback(async (q: SpellQuestion) => {
    let correctCount = 0;
    for (let i = 0; i < q.words.length; i++) {
      const ok = !errorWordsRef.current.has(i);
      if (ok) correctCount++;
      if (dataLayer) await dataLayer.submitResult(q.sentenceId, q.words[i].key, ok);
    }
    setSession((prev) => ({
      total: prev.total + q.words.length,
      correct: prev.correct + correctCount,
    }));
  }, [dataLayer]);

  const handleKey = useCallback((action: KeyAction) => {
    if (!question || roundDone) return;

    const word = question.words[activeIdx];
    if (!word) return;
    const answer = word.key; // lowercase, may contain ' or -
    const current = progress[activeIdx];

    if (action.type === 'enter') {
      // ENTER = submit/skip the current word: reveal it fully (counts as an
      // error since it wasn't spelled out) and advance to the next blank.
      if (current.length < answer.length) errorWordsRef.current.add(activeIdx);
      const revealed = progress.map((v, i) => (i === activeIdx ? answer : v));
      const nextIdx = activeIdx + 1;
      setProgress(revealed);
      setActiveIdx(nextIdx);
      if (nextIdx >= question.words.length) {
        setRoundDone(true);
        void recordRound(question);
      }
      return;
    }

    if (action.type === 'backspace') {
      if (current.length === 0) return;
      // Drop the last letter, plus any trailing auto-inserted separators.
      let next = current.slice(0, -1);
      while (next.length > 0 && !/[a-z]/.test(next[next.length - 1])) next = next.slice(0, -1);
      setProgress((p) => p.map((v, i) => (i === activeIdx ? next : v)));
      return;
    }

    // Letter pressed. Auto-insert any separators (', -) that precede the next letter.
    let pos = current.length;
    let prefix = current;
    while (pos < answer.length && !/[a-z]/.test(answer[pos])) {
      prefix += answer[pos];
      pos++;
    }

    if (pos < answer.length && answer[pos] === action.value) {
      // Correct next letter → reveal it (plus auto separators), advance.
      const nextPrefix = prefix + answer[pos];
      const newProgress = progress.map((v, i) => (i === activeIdx ? nextPrefix : v));

      if (nextPrefix.length >= answer.length) {
        // Word complete → lock green, advance to next blank (or finish round).
        const nextIdx = activeIdx + 1;
        setProgress(newProgress);
        setActiveIdx(nextIdx);
        if (nextIdx >= question.words.length) {
          setRoundDone(true);
          void recordRound(question);
        }
      } else {
        setProgress(newProgress);
      }
    } else {
      // Wrong key → flash red + shake, count an error, do NOT advance.
      errorWordsRef.current.add(activeIdx);
      setWrongFlash(true);
      window.clearTimeout(wrongTimer.current);
      wrongTimer.current = window.setTimeout(() => setWrongFlash(false), 350);
    }
  }, [question, roundDone, activeIdx, progress, recordRound]);

  if (showDone || !question) {
    return (
      <div className="practice-done">
        <div className="practice-done-card">
          <div className="practice-done-icon">🎉</div>
          <h2>{t('practice.results')}</h2>
          <div className="practice-done-stats">
            <span className="practice-done-score">{session.correct}/{session.total}</span>
          </div>
          <Button variant="primary" className="practice-done-btn" onClick={onDone}>{t('practice.done')}</Button>
        </div>
      </div>
    );
  }

  // Render tokens: word tokens become blanks (by word index), others render literally.
  let wordCursor = 0;

  return (
    <div className="practice-page">
      {/* Top row: a compact back arrow (top-left) shares the line with the
          in-game "Stop" + score pill on the right. Back returns to the module's
          MAIN screen (landing) — NOT out of the module; "Stop" also ends the round. */}
      <div className="practice-header">
        <BackButton size="sm" onClick={onDone} label={t('app.back')} />
        <div className="practice-header-right">
          <Button variant="secondary" className="practice-stop-btn" onClick={onDone}>{t('practice.stop')}</Button>
          <div className="practice-score">{session.correct}/{session.total}</div>
        </div>
      </div>

      <div className="practice-card">
        <div className="practice-prompt-row">
          <button
            type="button"
            className="practice-speak-btn"
            onClick={() => speak(question.english)}
            title={t('practice.hearSentence')}
            aria-label={t('practice.hearSentence')}
          >🔊</button>
          <div className="practice-chinese">{question.chinese}</div>
        </div>

        <div className="practice-spell">
          {question.tokens.map((tok, ti) => {
            if (!tok.isWord) {
              return <span className="practice-sep" key={`s${ti}`}>{tok.text}</span>;
            }
            const idx = wordCursor++;
            const word = question.words[idx];
            const typed = progress[idx] ?? '';
            const done = !roundDone ? idx < activeIdx : true;
            const active = !roundDone && idx === activeIdx;
            // Width is proportional to the word's letter count, so the learner
            // can see how long each word is. Per-letter slot is fixed in CSS.
            const slots = Math.max(1, letterCount(word.key));

            const cls = [
              'practice-blank',
              done && 'practice-blank--done',
              active && 'practice-blank--active',
              active && wrongFlash && 'practice-blank--wrong',
            ].filter(Boolean).join(' ');

            return (
              <span
                className={cls}
                key={`w${ti}`}
                style={{ '--pe-slots': slots } as CSSProperties}
                ref={active ? (el) => { el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } : undefined}
              >
                <span className="practice-blank-text">{typed || ' '}</span>
                {active && !wrongFlash && <span className="practice-caret" />}
              </span>
            );
          })}
        </div>

        {!roundDone && question.words[activeIdx] && (
          <div className="practice-word-audio">
            <button
              type="button"
              className="practice-speak-btn practice-speak-btn--sm"
              onClick={() => speak(question.words[activeIdx].text)}
              title={t('practice.hearWord')}
              aria-label={t('practice.hearWord')}
            >🔊 {t('practice.hearWord')}</button>
          </div>
        )}
      </div>

      {roundDone ? (
        <div className="practice-next">
          <Button variant="primary" className="practice-next-btn" onClick={loadNext}>
            {t('practice.next')} →
          </Button>
        </div>
      ) : (
        <Keyboard
          onKey={handleKey}
          backspaceLabel={t('practice.backspace')}
          enterLabel={t('practice.enter')}
        />
      )}
    </div>
  );
}
