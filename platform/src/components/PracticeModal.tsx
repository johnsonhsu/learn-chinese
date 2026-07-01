import { useState, useRef, useCallback, useEffect } from 'react';
import { WritingCanvas } from './WritingCanvas.tsx';
import type { WritingCanvasHandle } from './WritingCanvas.tsx';
import { speak } from '../utils/speech.ts';
import { useOffline } from '../offline/offline-context.tsx';

interface Props {
  character: string;
  userId: number;
  leniency?: number;
  onClose: () => void;
  // --- Placement-test reuse seam (defaults preserve normal practice behaviour) ---
  // Fires the scored outcome (perfect/correct/incorrect) for one completed,
  // big-char-hidden attempt. The placement test reads this to drive its staircase.
  onResult?: (_result: 'perfect' | 'correct' | 'incorrect') => void;
  // When false, the attempt is NOT written to stats — the placement test must not
  // pollute char history or trip needsPlacement() before it has finished.
  recordResults?: boolean;
  // Start with the prompt char hidden (placement quizzes the user immediately).
  startHidden?: boolean;
}

export function PracticeModal({
  character,
  userId,
  leniency = 1.0,
  onClose,
  onResult,
  recordResults = true,
  startHidden = false,
}: Props) {
  const [bigCharShown, setBigCharShown] = useState(!startHidden);
  const [strokesPerFail, setStrokesPerFail] = useState(3);
  const [attemptKey, setAttemptKey] = useState(0);
  const [mastery, setMastery] = useState(0);
  const [rank, setRank] = useState<number | null>(null);
  const [zhuyin, setZhuyin] = useState('');
  const helpUsed = useRef(false);
  const startTime = useRef(Date.now());
  const canvasRef = useRef<WritingCanvasHandle>(null);
  const { dataLayer } = useOffline();

  const loadMastery = useCallback(() => {
    // Local-first: read mastery/rank from the on-device data layer when ready.
    if (dataLayer) {
      try {
        setMastery(dataLayer.getCharMastery(character));
        setRank(dataLayer.getCharRank(character));
        setZhuyin(dataLayer.getCharZhuyin(character));
      } catch { /* ignore */ }
      return;
    }
    fetch(`/api/writing-challenge/char-mastery?userId=${userId}&char=${encodeURIComponent(character)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && typeof d.mastery === 'number') setMastery(d.mastery);
        if (d && typeof d.rank === 'number') setRank(d.rank);
      })
      .catch(() => { /* ignore */ });
  }, [userId, character, dataLayer]);

  useEffect(() => {
    if (dataLayer) {
      const s = dataLayer.getModuleSettings();
      if (s.strokes_per_fail) setStrokesPerFail(parseInt(s.strokes_per_fail));
    } else {
      fetch('/api/writing-challenge/settings')
        .then(r => r.ok ? r.json() : {})
        .then((s: Record<string, string>) => {
          if (s.strokes_per_fail) setStrokesPerFail(parseInt(s.strokes_per_fail));
        })
        .catch(() => { /* ignore */ });
    }
    loadMastery();
  }, [loadMastery, dataLayer]);

  const handleHint = useCallback(() => {
    helpUsed.current = true;
    canvasRef.current?.animateHint();
  }, []);

  const handleShowCanvasChar = useCallback(() => {
    helpUsed.current = true;
    canvasRef.current?.showChar();
  }, []);

  const toggleBigChar = useCallback(() => {
    // Toggling resets the canvas/attempt
    setBigCharShown(prev => !prev);
    helpUsed.current = false;
    startTime.current = Date.now();
    setAttemptKey(k => k + 1);
  }, []);

  return (
    <div className="ws-practice-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ws-practice-modal" style={{ position: 'relative' }}>
        {rank !== null && (
          <span style={{ position: 'absolute', top: 10, right: 14, fontSize: 14, fontWeight: 400, color: 'var(--text-muted, #888)' }}>
            #{rank}
          </span>
        )}
        <div className="ws-practice-char-display" onClick={toggleBigChar} style={{ cursor: 'pointer', userSelect: 'none' }}>
          {bigCharShown ? character : '—'}
          {bigCharShown && zhuyin && (
            <span style={{
              display: 'block', fontSize: 18, fontWeight: 500, marginTop: 6,
              color: 'var(--text-muted)', WebkitTextFillColor: 'var(--text-muted)',
            }}>
              {zhuyin}
            </span>
          )}
          <span className="mastery-bar" style={{ marginTop: 6 }}>
            <span className="mastery-bar-fill" style={{ width: `${mastery}%`, background: mastery >= 80 ? '#4caf50' : mastery >= 50 ? '#ff9800' : mastery > 0 ? '#f44336' : '#444' }} />
          </span>
        </div>
        <div className="ws-practice-controls">
          <button className="sp-audio-btn" onClick={() => speak(character)}>🔊</button>
          <button className="sp-hint-btn" onClick={handleHint}>💡</button>
          <button className="sp-show-btn" onClick={handleShowCanvasChar}>👁</button>
          <button className="ws-close-btn" onClick={onClose}>✕</button>
        </div>
        <WritingCanvas
          ref={canvasRef}
          character={character}
          quizSession={attemptKey}
          showGuide={false}
          quizMode={true}
          hintAfterMisses={3}
          showMistakes={false}
          leniency={leniency}
          size={280}
          onQuizComplete={(totalMistakes: number) => {
            // Big char shown → practice/reference mode, attempts not recorded
            if (bigCharShown) {
              setAttemptKey(k => k + 1);
              startTime.current = Date.now();
              return;
            }
            // Big char hidden → record the attempt with full logic
            const durationMs = Date.now() - startTime.current;
            const failedStrokes = Math.floor(totalMistakes / strokesPerFail);
            const usedHelp = helpUsed.current;
            let result: 'perfect' | 'correct' | 'incorrect';
            if (usedHelp) result = 'incorrect';
            else if (totalMistakes === 0) result = 'perfect';
            else if (failedStrokes === 0) result = 'correct';
            else result = 'incorrect';
            // Surface the outcome to callers (placement test) before any recording.
            onResult?.(result);
            // Placement reuse: skip writing to stats so the test doesn't pollute
            // char history or mark needsPlacement() done prematurely.
            if (!recordResults) {
              helpUsed.current = false;
              startTime.current = Date.now();
              setAttemptKey(k => k + 1);
              return;
            }
            if (dataLayer) {
              // Local-first: record straight to the on-device store.
              dataLayer.recordAttempt(character, result, failedStrokes, usedHelp, durationMs).then(() => loadMastery());
            } else {
              // Server mode (dev only): record to the API.
              const payload = { userId, char: character, result, failedStrokes, hintUsed: usedHelp, durationMs };
              fetch('/api/character-stats/record', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
                .then(() => loadMastery())
                .catch(() => { /* ignore */ });
            }
            // Reset for another attempt — don't dismiss
            helpUsed.current = false;
            startTime.current = Date.now();
            setAttemptKey(k => k + 1);
          }}
        />
      </div>
    </div>
  );
}
