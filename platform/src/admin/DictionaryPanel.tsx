import { useState, useEffect, useCallback, useRef } from "react";
import HanziWriter, { type CharacterJson } from "hanzi-writer";

interface DictInfo {
  id: number;
  code: string;
  name: string;
  charCount: number;
  wordCount: number;
  linkCount: number;
  withStrokes: number;
}

interface CharEntry {
  id: number;
  character: string;
  strokeCount: number;
  [key: string]: unknown; // metadata fields
}

interface WordEntry {
  id: number;
  word: string;
  definition: string;
  grammar: string;
  level: string;
  zhuyin: string;
  pinyin: string;
}

interface CharDetail {
  id: number;
  character: string;
  strokeCount: number;
  metadata: Record<string, string>;
  words: { word: string; definition: string; level: string; zhuyin: string }[];
}

function CharPreview({ character }: { character: string }) {
  const animRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);

  useEffect(() => {
    if (!animRef.current || !staticRef.current) return;
    animRef.current.innerHTML = "";
    staticRef.current.innerHTML = "";

    try {
      const styles = getComputedStyle(document.documentElement);
      const borderColor = styles.getPropertyValue("--border").trim() || "#333";
      const textColor = styles.getPropertyValue("--text").trim() || "#ddd";

      const charDataLoader = (char: string, onLoad: (_data: CharacterJson) => void) => {
        fetch(`/stroke-data/${encodeURIComponent(char)}.json`)
          .then((r) =>
            r.ok
              ? r.json()
              : fetch(
                  `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`,
                ).then((r2) => r2.json()),
          )
          .then(onLoad)
          .catch(() =>
            fetch(
              `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`,
            )
              .then((r) => r.json())
              .then(onLoad)
              .catch(() => {}),
          );
      };

      // Animated stroke-by-stroke
      const animWriter = HanziWriter.create(animRef.current, character, {
        charDataLoader,
        width: 150,
        height: 150,
        padding: 10,
        showCharacter: false,
        showOutline: true,
        strokeColor: "#4a90d9",
        outlineColor: borderColor,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 300,
      });
      writerRef.current = animWriter;
      animWriter.loopCharacterAnimation();

      // Static completed character
      HanziWriter.create(staticRef.current, character, {
        charDataLoader,
        width: 150,
        height: 150,
        padding: 10,
        showCharacter: true,
        showOutline: false,
        strokeColor: textColor,
      });
    } catch {
      /* char not in hanzi-writer */
    }

    return () => {
      // Stop the running loopCharacterAnimation before dropping the ref — otherwise
      // its requestAnimationFrame loop keeps ticking on a detached writer after unmount.
      try {
        writerRef.current?.pauseAnimation();
      } catch {
        /* ignore */
      }
      try {
        writerRef.current?.cancelQuiz();
      } catch {
        /* ignore */
      }
      writerRef.current = null;
    };
  }, [character]);

  return (
    <div className="dict-char-preview">
      <div className="dict-char-canvas" ref={animRef} />
      <div className="dict-char-canvas" ref={staticRef} />
    </div>
  );
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function DictionaryPanel() {
  const [dicts, setDicts] = useState<DictInfo[]>([]);
  const [selectedDict, setSelectedDict] = useState<DictInfo | null>(null);
  const [view, setView] = useState<"chars" | "words">("chars");
  const [search, setSearch] = useState("");
  const [chars, setChars] = useState<CharEntry[]>([]);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [charDetail, setCharDetail] = useState<CharDetail | null>(null);
  const [offset, setOffset] = useState(0);
  const [tocflOnly, setTocflOnly] = useState(true);
  const [charSort, setCharSort] = useState<"freq" | "blended">("freq");

  useEffect(() => {
    api<DictInfo[]>("/dictionaries").then(setDicts);
  }, []);

  const loadChars = useCallback(
    (dictId: number, q: string, off: number, tocfl: boolean, sort: string = "freq") => {
      if (sort === "blended") {
        // Fetch blended ranking from the content admin, then paginate client-side
        Promise.all([
          api<{ char: string; rank: number; tocflLevel: string }[]>("/content/admin/char-ranking"),
          api<CharEntry[]>(
            `/dictionaries/${dictId}/chars?q=${encodeURIComponent(q)}&offset=0&limit=9999${tocfl ? "&tocfl=1" : ""}`,
          ),
        ]).then(([ranking, allChars]) => {
          const rankMap = new Map(ranking.map((r) => [r.char, r.rank]));
          const sorted = allChars.sort(
            (a, b) => (rankMap.get(a.character) || 99999) - (rankMap.get(b.character) || 99999),
          );
          setChars(sorted.slice(off, off + 50));
        });
      } else {
        api<CharEntry[]>(
          `/dictionaries/${dictId}/chars?q=${encodeURIComponent(q)}&offset=${off}&limit=50${tocfl ? "&tocfl=1" : ""}`,
        ).then(setChars);
      }
    },
    [],
  );

  const loadWords = useCallback((dictId: number, q: string, off: number, tocfl: boolean) => {
    api<WordEntry[]>(
      `/dictionaries/${dictId}/words?q=${encodeURIComponent(q)}&offset=${off}&limit=50${tocfl ? "&tocfl=1" : ""}`,
    ).then(setWords);
  }, []);

  const handleSelectDict = (d: DictInfo) => {
    setSelectedDict(d);
    setSearch("");
    setOffset(0);
    setCharDetail(null);
    loadChars(d.id, "", 0, tocflOnly, charSort);
  };

  const handleSearch = () => {
    if (!selectedDict) return;
    setOffset(0);
    setCharDetail(null);
    if (view === "chars") loadChars(selectedDict.id, search, 0, tocflOnly, charSort);
    else loadWords(selectedDict.id, search, 0, tocflOnly);
  };

  const handleViewChange = (v: "chars" | "words") => {
    setView(v);
    setOffset(0);
    setCharDetail(null);
    if (!selectedDict) return;
    if (v === "chars") loadChars(selectedDict.id, search, 0, tocflOnly, charSort);
    else loadWords(selectedDict.id, search, 0, tocflOnly);
  };

  const handleToggleTocfl = () => {
    const next = !tocflOnly;
    setTocflOnly(next);
    setOffset(0);
    if (!selectedDict) return;
    if (view === "chars") loadChars(selectedDict.id, search, 0, next, charSort);
    else loadWords(selectedDict.id, search, 0, next);
  };

  const handlePage = (dir: number) => {
    if (!selectedDict) return;
    const next = Math.max(0, offset + dir * 50);
    setOffset(next);
    if (view === "chars") loadChars(selectedDict.id, search, next, tocflOnly, charSort);
    else loadWords(selectedDict.id, search, next, tocflOnly);
  };

  const handleCharClick = (charId: number) => {
    if (!selectedDict) return;
    api<CharDetail>(`/dictionaries/${selectedDict.id}/char/${charId}`).then(setCharDetail);
  };

  // --- Dictionary list ---
  if (!selectedDict) {
    return (
      <div className="dict-panel">
        <h3>Dictionaries</h3>
        {dicts.length === 0 ? (
          <div className="admin-empty">No dictionaries imported</div>
        ) : (
          <div className="dict-list">
            {dicts.map((d) => (
              <button key={d.id} className="dict-card" onClick={() => handleSelectDict(d)}>
                <div className="dict-card-name">{d.name}</div>
                <div className="dict-card-code">{d.code}</div>
                <div className="dict-card-stats">
                  <span>{d.charCount.toLocaleString()} chars</span>
                  <span>{d.wordCount.toLocaleString()} words</span>
                  <span>{d.linkCount.toLocaleString()} links</span>
                  <span>{d.withStrokes.toLocaleString()} with strokes</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Char detail sidebar ---
  if (charDetail) {
    return (
      <div className="dict-panel">
        <div className="dict-header">
          <button className="back-btn" onClick={() => setCharDetail(null)}>
            ← Back
          </button>
          <span className="dict-detail-char">{charDetail.character}</span>
        </div>
        <CharPreview character={charDetail.character} />
        <div className="dict-detail">
          <div className="dict-detail-section">
            <div className="dict-detail-row">
              <span className="dict-detail-label">Strokes</span>
              <span>{charDetail.strokeCount > 0 ? charDetail.strokeCount : "—"}</span>
            </div>
            {Object.entries(charDetail.metadata).map(([k, v]) => (
              <div key={k} className="dict-detail-row">
                <span className="dict-detail-label">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
          <h4>Words ({charDetail.words.length})</h4>
          <div className="dict-detail-words">
            {charDetail.words.map((w, i) => (
              <div key={i} className="dict-detail-word-row">
                <span className="dict-detail-word">{w.word}</span>
                <span className="dict-detail-word-level">{w.level}</span>
                <span className="dict-detail-word-def">{w.definition?.slice(0, 50)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Browse view ---
  return (
    <div className="dict-panel">
      <div className="dict-header">
        <button className="back-btn" onClick={() => setSelectedDict(null)}>
          ← Dictionaries
        </button>
        <span>{selectedDict.name}</span>
      </div>

      <div className="dict-controls">
        <div className="dict-tabs">
          <button
            className={`dict-tab${view === "chars" ? " active" : ""}`}
            onClick={() => handleViewChange("chars")}
          >
            Chars
          </button>
          <button
            className={`dict-tab${view === "words" ? " active" : ""}`}
            onClick={() => handleViewChange("words")}
          >
            Words
          </button>
          <button className={`dict-tab${tocflOnly ? " active" : ""}`} onClick={handleToggleTocfl}>
            TOCFL only
          </button>
          {view === "chars" && (
            <button
              className={`dict-tab${charSort === "blended" ? " active" : ""}`}
              onClick={() => {
                const next = charSort === "freq" ? "blended" : "freq";
                setCharSort(next);
                setOffset(0);
                if (selectedDict) loadChars(selectedDict.id, search, 0, tocflOnly, next);
              }}
            >
              {charSort === "freq" ? "Frequency" : "Blended"}
            </button>
          )}
        </div>
        <div className="dict-search">
          <input
            className="sa-input"
            placeholder={view === "chars" ? "Search chars..." : "Search words..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{ flex: 1 }}
          />
          <button className="sa-add-btn" onClick={handleSearch}>
            🔍
          </button>
        </div>
      </div>

      {view === "chars" ? (
        <div className="dict-char-grid">
          {chars.map((c) => (
            <button key={c.id} className="dict-char-cell" onClick={() => handleCharClick(c.id)}>
              <span className="dict-char-big">{c.character}</span>
              <span className="dict-char-strokes">
                {c.strokeCount > 0 ? `${c.strokeCount}画` : ""}
              </span>
              {c.tocfl_level ? (
                <span className="dict-char-level">{String(c.tocfl_level)}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="dict-word-table">
          {words.map((w) => (
            <div key={w.id} className="dict-word-row">
              <span className="dict-word-text">{w.word}</span>
              <span className="dict-word-zhuyin">{w.zhuyin}</span>
              <span className="dict-word-level">{w.level}</span>
              <span className="dict-word-grammar">{w.grammar}</span>
              <span className="dict-word-def">{w.definition?.slice(0, 60)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="dict-pager">
        <button disabled={offset === 0} onClick={() => handlePage(-1)}>
          ← Prev
        </button>
        <span>
          {offset + 1}–{offset + (view === "chars" ? chars.length : words.length)}
        </span>
        <button onClick={() => handlePage(1)}>Next →</button>
      </div>
    </div>
  );
}
