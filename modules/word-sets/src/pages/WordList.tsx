import { useState, useCallback, useEffect } from 'react';
import { PracticeModal } from '@platform/components/PracticeModal.tsx';
import { speak } from '@platform/utils/speech.ts';
import { useOffline } from '@platform/offline/offline-context.tsx';
import { BackButton, CharTile } from '@platform/ui/index.ts';
import type { Category, CategoryWord } from '../utils/api.ts';
import { useT } from '../i18n/index.ts';

interface Props {
  userId: number;
  category: Category;
  words: CategoryWord[];
  onBack: () => void;
}

export function WordList({ userId, category, words, onBack }: Props) {
  const t = useT();
  const { dataLayer } = useOffline();
  const [practiceChar, setPracticeChar] = useState<string | null>(null);
  const [charRanks, setCharRanks] = useState<Record<string, number>>({});

  useEffect(() => {
    const allChars = new Set<string>();
    for (const w of words) {
      for (const c of w.word) {
        if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(c)) allChars.add(c);
      }
    }
    if (allChars.size === 0) return;
    // Local-first: ranks from the on-device dictionary when ready.
    if (dataLayer) {
      setCharRanks(dataLayer.getCharFreqRanks([...allChars]));
      return;
    }
    fetch(`/api/char-ranks?chars=${[...allChars].join(',')}`)
      .then(r => r.json())
      .then(setCharRanks)
      .catch(() => {});
  }, [words, dataLayer]);

  const handleCharTap = useCallback((char: string) => {
    speak(char);
    setPracticeChar(char);
  }, []);

  return (
    <div className="ws-word-list">
      {/* Compact shared back pill + the category title, together at the top-left. */}
      <div className="ws-header">
        <BackButton onClick={onBack} label={t('back')} />
        <div className="ws-header-title">
          <span className="ws-header-zh">{category.nameZh}</span>
          <span className="ws-header-en">{category.nameEn}</span>
        </div>
      </div>

      {/* Word stack */}
      <div className="ws-words">
        {words.map(w => (
          <div key={w.id} className="ws-word-row">
            <button className="ws-word-speak" onClick={() => speak(w.word)}>🔊</button>
            <div className="ws-word-chars">
              {[...w.word].map((c, i) => (
                /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c) ? (
                  <CharTile
                    key={i}
                    char={c}
                    rank={charRanks[c]}
                    size="sm"
                    ariaLabel={t('practiceChar').replace('{char}', c)}
                    onActivate={() => handleCharTap(c)}
                  />
                ) : (
                  <span key={i} className="ws-word-punct">{c}</span>
                )
              ))}
            </div>
            <div className="ws-word-info">
              {w.zhuyin && <span className="ws-word-zhuyin">{w.zhuyin}</span>}
              <span className="ws-word-def">{w.definition}</span>
            </div>
          </div>
        ))}
      </div>

      {practiceChar && (
        <PracticeModal
          character={practiceChar}
          userId={userId}
          onClose={() => setPracticeChar(null)}
        />
      )}
    </div>
  );
}
