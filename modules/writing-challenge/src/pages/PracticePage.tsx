import { useState, useRef, useCallback, useEffect } from "react";
import { WritingCanvas, type WritingCanvasHandle } from "../components/WritingCanvas.tsx";
import { BackButton } from "@platform/ui/index.ts";
import { PracticeModal } from "@platform/components/PracticeModal.tsx";
import { speak } from "../utils/speech.ts";
import { getZhuyin } from "../utils/zhuyin.ts";
import { getNextSentence, submitResult } from "../utils/api.ts";
import type {
  NextSentenceResponse,
  SentenceResultResponse,
  CharAttemptResult,
  CharResult,
} from "../utils/api.ts";
import { useT } from "../i18n/index.ts";
import { useDebug } from "@platform/DebugOverlay.tsx";
import { demoKey } from "@platform/offline/demo-key.ts";

interface Props {
  userId: number;
  leniency: number;
  strokesPerFail: number;
  onStop: () => void;
  // --- Injection seam (defaults preserve writing-challenge's bank-sentence flow) ---
  // What to practice: returns the next set of chars in the shape this component
  // already consumes. Writing-challenge passes its bank-sentence source (default);
  // other modules (copybook) pass a source built from a user-supplied char list.
  provideSession?: (_userId: number) => Promise<NextSentenceResponse>;
  // What happens when a finished session is submitted (progress write-back).
  submitSession?: (
    _userId: number,
    _sentenceId: number,
    _durationMs: number,
    _charResults: CharAttemptResult[],
  ) => Promise<SentenceResultResponse>;
  // localStorage key for the auto-skip toggle (per-module so settings don't bleed).
  autoSkipKey?: string;
  // Whether this component draws its own in-page back button. Writing-challenge
  // draws it (default); copybook hides it because the platform already renders a
  // module back button for non-writing-challenge modules (avoids a double back).
  showBack?: boolean;
}

export function PracticePage({
  userId,
  leniency,
  strokesPerFail,
  onStop,
  provideSession = getNextSentence,
  submitSession = submitResult,
  autoSkipKey = "wc_auto_skip",
  showBack = true,
}: Props) {
  // Demo-isolate the auto-skip key (issue #48). The prop is a base name (the WC
  // default 'wc_auto_skip' or PlacementTest's 'placement:auto-skip'); demoKey()
  // suffixes it in demo so the toggle never reads/writes the real instance's key.
  const storedAutoSkipKey = demoKey(autoSkipKey);
  const t = useT();
  const [sentence, setSentence] = useState<NextSentenceResponse | null>(null);
  const [charIndex, setCharIndex] = useState(0);
  const [charResults, setCharResults] = useState<CharAttemptResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showingChar, setShowingChar] = useState(false);
  const [done, setDone] = useState(false);
  const [level, setLevel] = useState(0);
  const [fluency, setFluency] = useState(0);
  const [totalKnown, setTotalKnown] = useState(0);
  const [autoSkip, setAutoSkip] = useState(
    () => localStorage.getItem(storedAutoSkipKey) === "true",
  );
  const [practiceChar, setPracticeChar] = useState<string | null>(null);
  const [liveMistakes, setLiveMistakes] = useState(0);
  const [liveUsedHelp, setLiveUsedHelp] = useState(false);
  const [mustRepeat, setMustRepeat] = useState(false);
  const [charResultMap, setCharResultMap] = useState<Record<number, CharResult>>({});
  // Attempt token for the (now persistent) WritingCanvas writer. The canvas is no
  // longer remounted per char (that leaked hanzi-writer's global listeners); instead
  // it re-quizzes whenever this token changes. Bumped on the SAME triple the old
  // remount `key` used — sentence + char position + first/repeat — so duplicate
  // consecutive glyphs and "must repeat" re-attempts still restart the quiz exactly
  // as before, even when the glyph itself is unchanged.
  const [quizSession, setQuizSession] = useState(0);
  const hintUsed = useRef(false);
  const showingCharRef = useRef(false);
  const charStartTime = useRef(Date.now());
  const sentenceStartTime = useRef(Date.now());
  const canvasRef = useRef<WritingCanvasHandle>(null);
  const debug = useDebug();
  const debugRef = useRef(debug);
  debugRef.current = debug;

  const toggleAutoSkip = () => {
    const next = !autoSkip;
    setAutoSkip(next);
    localStorage.setItem(storedAutoSkipKey, next ? "true" : "false");
  };

  // Helper: is a char "above level" (red)?
  const threshold = sentence?.aboveLevelThreshold ?? 30;

  const isAboveLevel = useCallback(
    (c: string) => {
      if (!sentence) return false;
      const rank = sentence.charRanks?.[c] || 0;
      return rank > level + threshold;
    },
    [sentence, level, threshold],
  );

  const loadId = useRef(0);

  const loadSentence = useCallback(() => {
    const thisLoad = ++loadId.current;
    setLoading(true);
    setDone(false);
    setCharIndex(0);
    setCharResults([]);
    setCharResultMap({});
    setShowingChar(false);
    showingCharRef.current = false;
    hintUsed.current = false;
    provideSession(userId)
      .then((s) => {
        if (loadId.current !== thisLoad) return; // stale response, ignore
        setSentence(s);
        setLevel(s.level);
        setFluency(s.fluency);
        window.dispatchEvent(
          new CustomEvent("fluency-changed", { detail: { fluency: s.fluency } }),
        );
        setTotalKnown(s.totalKnown);
        sentenceStartTime.current = Date.now();
        charStartTime.current = Date.now();
        speak(s.text);
      })
      .catch((e) => {
        if (loadId.current === thisLoad) setError(e.message);
      })
      .finally(() => {
        if (loadId.current === thisLoad) setLoading(false);
      });
  }, [userId, provideSession]);

  useEffect(() => {
    loadSentence();
  }, [loadSentence]);

  const chars = sentence
    ? [...sentence.text].filter((c) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c))
    : [];
  const currentChar = chars[charIndex] || "";

  // Live status: 'correct' threshold (has mistakes but not failed), 'incorrect' threshold (failed or used help)
  // If mustRepeat (initial attempt failed), tile stays red regardless of retry progress
  const liveFailedStrokes = Math.floor(liveMistakes / strokesPerFail);
  const liveStatus = mustRepeat
    ? "incorrect"
    : liveUsedHelp
      ? "incorrect"
      : liveMistakes === 0
        ? ""
        : liveFailedStrokes > 0
          ? "incorrect"
          : "correct";

  // Auto-skip: find first non-red char index
  useEffect(() => {
    if (!autoSkip || !sentence || chars.length === 0) return;
    // Compute directly from sentence data to avoid stale state
    const sentenceLevel = sentence.level;
    const sentenceThreshold = sentence.aboveLevelThreshold ?? 30;
    const sentenceRanks = sentence.charRanks || {};

    let firstNonRed = 0;
    const results: CharAttemptResult[] = [];
    for (let i = 0; i < chars.length; i++) {
      const rank = sentenceRanks[chars[i]] || 0;
      if (rank > sentenceLevel + sentenceThreshold) {
        results.push({
          char: chars[i],
          result: "skip",
          failedStrokes: 0,
          hintUsed: true,
          durationMs: 0,
        });
        firstNonRed = i + 1;
      } else {
        break;
      }
    }
    if (firstNonRed > 0 && firstNonRed < chars.length) {
      setCharResults(results);
      setCharIndex(firstNonRed);
    } else if (firstNonRed >= chars.length) {
      setCharResults(results);
      finishSentenceRef.current(results);
    }
  }, [sentence?.sentenceId]); // only on new sentence

  useEffect(() => {
    charStartTime.current = Date.now();
    hintUsed.current = false;
    setLiveMistakes(0);
    setLiveUsedHelp(false);
    setMustRepeat(false);
  }, [charIndex]);

  // Bump the canvas attempt token on the same (sentence, char, first/repeat) triple
  // the old remount key used, so the persistent writer restarts the quiz for the new
  // char / duplicate glyph / repeat — preserving the pre-persistence behavior. Skip
  // the initial run: the canvas already quizzes the first char on its own mount, so
  // bumping then would redundantly re-quiz it.
  const quizSessionMounted = useRef(false);
  useEffect(() => {
    if (!quizSessionMounted.current) {
      quizSessionMounted.current = true;
      return;
    }
    setQuizSession((s) => s + 1);
  }, [sentence?.sentenceId, charIndex, mustRepeat]);

  // Push debug data
  useEffect(() => {
    if (!sentence) return;
    const lines: { label: string; value: string }[] = [
      {
        label: "Lv",
        value: `${sentence.level} (${sentence.knownInLevel}/${sentence.totalInLevel})`,
      },
      { label: "F", value: String(sentence.fluency) },
      { label: "Target", value: sentence.targetChar },
      { label: "Targets", value: sentence.targetChars.slice(0, 8).join(" ") },
    ];
    debugRef.current.setLines(lines);
  }, [sentence]);

  const finishSentence = useCallback(
    async (results: CharAttemptResult[]) => {
      if (!sentence) return;
      const durationMs = Date.now() - sentenceStartTime.current;
      const resp = await submitSession(userId, sentence.sentenceId, durationMs, results);
      setLevel(resp.level);
      if (resp.fluency !== undefined) {
        setFluency(resp.fluency);
        window.dispatchEvent(
          new CustomEvent("fluency-changed", { detail: { fluency: resp.fluency } }),
        );
      }
      if (resp.totalKnown !== undefined) setTotalKnown(resp.totalKnown);
      setDone(true);
    },
    [sentence, userId, submitSession],
  );

  // Stable ref for finishSentence so auto-skip effect can call it
  const finishSentenceRef = useRef(finishSentence);
  finishSentenceRef.current = finishSentence;

  // Advance to next char, with auto-skip for red chars
  const advanceChar = useCallback(
    (newResults: CharAttemptResult[]) => {
      let next = charIndex + 1;

      if (autoSkip) {
        // Auto-skip consecutive red chars after current
        const autoResults = [...newResults];
        while (next < chars.length && isAboveLevel(chars[next])) {
          autoResults.push({
            char: chars[next],
            result: "skip",
            failedStrokes: 0,
            hintUsed: true,
            durationMs: 0,
          });
          next++;
        }
        if (next >= chars.length) {
          setCharResults(autoResults);
          finishSentence(autoResults);
          return;
        }
        setCharResults(autoResults);
        setCharIndex(next);
      } else {
        if (next >= chars.length) {
          finishSentence(newResults);
          return;
        }
        setCharIndex(next);
      }
    },
    [charIndex, chars, autoSkip, isAboveLevel, finishSentence],
  );

  const handleCharComplete = useCallback(
    (totalMistakes: number) => {
      // If char was showing (user pressed 👁), treat completion as a skip
      if (showingCharRef.current) {
        const attempt: CharAttemptResult = {
          char: currentChar,
          result: "skip",
          failedStrokes: 0,
          hintUsed: true,
          durationMs: 0,
        };
        const newResults = [...charResults, attempt];
        setCharResults(newResults);
        // Only record initial result for display (don't overwrite on repeat)
        setCharResultMap((prev) =>
          prev[charIndex] !== undefined ? prev : { ...prev, [charIndex]: "skip" },
        );
        setShowingChar(false);
        showingCharRef.current = false;
        canvasRef.current?.clear();
        advanceChar(newResults);
        return;
      }

      const durationMs = Date.now() - charStartTime.current;
      const failedStrokes = Math.floor(totalMistakes / strokesPerFail);
      const usedHelp = hintUsed.current || showingCharRef.current;
      let charResult: CharResult;
      if (usedHelp) charResult = "incorrect";
      else if (totalMistakes === 0) charResult = "perfect";
      else if (failedStrokes === 0) charResult = "correct";
      else charResult = "incorrect";

      // Always record the attempt to server log
      const attempt: CharAttemptResult = {
        char: currentChar,
        result: charResult,
        failedStrokes,
        hintUsed: usedHelp,
        durationMs,
      };
      const newResults = [...charResults, attempt];
      setCharResults(newResults);

      // Display map: only stores the initial attempt result per position
      setCharResultMap((prev) =>
        prev[charIndex] !== undefined ? prev : { ...prev, [charIndex]: charResult },
      );

      // If incorrect, force repeat — but reset the help/hint state so the retry isn't auto-incorrect
      if (charResult === "incorrect" && !mustRepeat) {
        setMustRepeat(true);
        hintUsed.current = false;
        setShowingChar(false);
        showingCharRef.current = false;
        canvasRef.current?.clear();
        return;
      }

      setShowingChar(false);
      showingCharRef.current = false;
      setMustRepeat(false);
      canvasRef.current?.clear();

      advanceChar(newResults);
    },
    [charResults, charIndex, currentChar, strokesPerFail, mustRepeat, advanceChar],
  );

  const handleSkip = useCallback(() => {
    const attempt: CharAttemptResult = {
      char: currentChar,
      result: "skip",
      failedStrokes: 0,
      hintUsed: true,
      durationMs: 0,
    };
    const newResults = [...charResults, attempt];
    setCharResults(newResults);
    setShowingChar(false);
    showingCharRef.current = false;
    canvasRef.current?.clear();

    advanceChar(newResults);
  }, [charResults, currentChar, advanceChar]);

  // --- Sentence complete: continue or stop ---
  if (done) {
    // Build display: one entry per char position, using the initial attempt result
    const displayResults: { char: string; result: CharResult }[] = chars.map((c, i) => ({
      char: c,
      result: (charResultMap[i] || "skip") as CharResult,
    }));

    const perfect = displayResults.filter((r) => r.result === "perfect").length;
    const correct = displayResults.filter((r) => r.result === "correct").length;

    const parts: string[] = [];
    if (perfect > 0) parts.push(`${perfect} ${t("practice.perfect")}`);
    if (correct > 0) parts.push(`${correct} ${t("practice.correct")}`);

    const scored = displayResults.filter((r) => r.result !== "skip");
    const perfectSentence = scored.length > 0 && scored.every((r) => r.result === "perfect");

    return (
      <div className="sp-assessment">
        <div className="sp-center-card">
          <div className="sp-sentence-done-level">
            {t("practice.fluency")} {fluency} — {totalKnown} {t("practice.chars")}
          </div>
          {sentence?.definition && <div className="sp-word-definition">{sentence.definition}</div>}
          {perfectSentence && (
            <div className="sp-celebrate">
              <span className="sp-celebrate-spark">✨</span>
              {t("practice.perfectAll")}
              <span className="sp-celebrate-spark">✨</span>
            </div>
          )}
          {parts.length > 0 && <div className="sp-sentence-done-stats">{parts.join(", ")}</div>}
          {/* All chars in sentence order */}
          <div className="sp-sentence-done-chars">
            {displayResults.map((r, i) => {
              const rank = sentence?.charRanks?.[r.char] || 0;
              const rankCat =
                rank === 0
                  ? "target"
                  : rank > level + threshold
                    ? "above"
                    : rank <= level
                      ? "below"
                      : "target";
              const isAutoSkip = r.result === "skip" && isAboveLevel(r.char);
              const isUserSkip = r.result === "skip" && !isAutoSkip;
              const charClass = isAutoSkip
                ? "sp-result-autoskip"
                : isUserSkip
                  ? "sp-result-userskip"
                  : `sp-result-${r.result}`;
              const mastery = sentence?.charMastery?.[r.char] ?? 0;
              const masteryColor =
                mastery >= 80
                  ? "#4caf50"
                  : mastery >= 50
                    ? "#ff9800"
                    : mastery > 0
                      ? "#f44336"
                      : "#444";
              return (
                <span
                  key={i}
                  className={`sp-result-char ${charClass}`}
                  onClick={() => {
                    speak(r.char);
                    setPracticeChar(r.char);
                  }}
                  style={{ cursor: "pointer", animationDelay: `${i * 0.04}s` }}
                >
                  <span className={`sp-rank-corner sp-rank-corner-${rankCat}`} />
                  {r.result === "perfect" && <span className="sp-token">⭐</span>}
                  {r.char}
                  <span className="mastery-bar">
                    <span
                      className="mastery-bar-fill"
                      style={{ width: `${mastery}%`, background: masteryColor }}
                    />
                  </span>
                </span>
              );
            })}
          </div>
          <div className="sp-sentence-done-actions">
            <button className="sp-btn-primary" onClick={loadSentence}>
              {t("practice.nextSession")}
            </button>
            <button className="sp-btn-secondary" onClick={onStop}>
              {t("practice.stop")}
            </button>
          </div>
        </div>

        {practiceChar && (
          <PracticeModal
            character={practiceChar}
            userId={userId}
            leniency={leniency}
            onClose={() => setPracticeChar(null)}
          />
        )}
      </div>
    );
  }

  if (loading) return <div className="sp-page-empty">Loading...</div>;
  if (error)
    return (
      <div className="sp-page-empty" style={{ color: "var(--error)" }}>
        {error}
      </div>
    );
  if (!sentence) return <div className="sp-page-empty">{t("practice.noSentences")}</div>;

  return (
    <div className="sp-assessment">
      {/* Top row: a compact back arrow (top-left) sharing the line with the
          settings controls (auto-skip + new sentence) on the right. Back returns
          to the module's main screen (not out of the module) — see onStop. */}
      <div className="sp-practice-top">
        {showBack && <BackButton size="sm" onClick={onStop} label={t("practice.back")} />}
        <div className="sp-practice-level">F{fluency}</div>
        <div className="sp-practice-settings">
          <button
            className={`sp-autoskip-toggle${autoSkip ? " active" : ""}`}
            onClick={toggleAutoSkip}
            title="Auto-skip chars above your level"
          >
            {t("practice.autoSkip")} {autoSkip ? "ON" : "OFF"}
          </button>
          <button className="sp-new-sentence-btn" onClick={loadSentence} title="New sentence">
            ↻
          </button>
        </div>
      </div>

      {/* Prompt card: ONE cohesive cream tile holding sentence audio + English
          meaning + zhuyin char tiles + the writing pad + the control buttons
          (mirrors practice-english's .practice-card, unified into a single panel). */}
      <div className="sp-prompt-card">
        <div className="sp-prompt-row">
          <button
            type="button"
            className="sp-audio-btn"
            onClick={() => speak(sentence.text)}
            aria-label="Hear sentence"
          >
            🔊
          </button>
          {sentence.definition && <div className="sp-prompt-meaning">{sentence.definition}</div>}
        </div>

        {/* Char scroll */}
        <div className="sp-char-scroll">
          {chars.map((c, i) => {
            const rank = sentence.charRanks?.[c] || 0;
            const above = rank > level + threshold;
            const isDone = i < charIndex;
            const isActive = i === charIndex;
            const doneResult = charResultMap[i];
            const doneClass =
              isDone && doneResult === "perfect"
                ? " char-box-pass"
                : isDone && doneResult === "correct"
                  ? " char-box-warn"
                  : isDone && doneResult === "incorrect"
                    ? " char-box-fail"
                    : "";
            const liveClass =
              isActive && liveStatus === "correct"
                ? " char-box-warn"
                : isActive && liveStatus === "incorrect"
                  ? " char-box-fail"
                  : "";
            return (
              <span
                key={i}
                ref={
                  isActive
                    ? (el) => {
                        el?.scrollIntoView({
                          behavior: "smooth",
                          inline: "center",
                          block: "nearest",
                        });
                      }
                    : undefined
                }
                className={`char-box${isActive ? " char-box-active" : ""}${isDone ? " char-box-done" : ""}${above ? " char-box-above" : ""}${doneClass}${liveClass}`}
                onClick={() => speak(c)}
              >
                {isDone ? c : autoSkip && above ? c : sentence.charZhuyin?.[c] || getZhuyin(c)}
              </span>
            );
          })}
        </div>

        {/* Writing area: canvas sits cleanly inside the cream tile (no cream-on-cream
            frame — just the dark drawing surface with a subtle inset). */}
        <div className="sp-canvas-frame">
          <WritingCanvas
            ref={canvasRef}
            character={currentChar}
            quizSession={quizSession}
            showGuide={false}
            quizMode={true}
            hintAfterMisses={3}
            showMistakes={false}
            leniency={leniency}
            size={320}
            onQuizComplete={handleCharComplete}
            onMistake={(total) => setLiveMistakes(total)}
          />
        </div>

        {/* Writing controls: hint / peek / skip — tidy candy row at the bottom of the tile */}
        <div className="sp-top-bar">
          {showingChar ? (
            <button className="sp-skip-btn" onClick={handleSkip}>
              ⏭
            </button>
          ) : (
            <button
              className="sp-hint-btn"
              onClick={() => {
                hintUsed.current = true;
                setLiveUsedHelp(true);
                canvasRef.current?.showHint();
              }}
            >
              💡
            </button>
          )}
          <button
            className={`sp-show-btn${showingChar ? " active" : ""}`}
            onClick={() => {
              if (showingChar) {
                canvasRef.current?.hideChar();
                setShowingChar(false);
                showingCharRef.current = false;
                showingCharRef.current = false;
              } else {
                hintUsed.current = true;
                setLiveUsedHelp(true);
                canvasRef.current?.showChar();
                setShowingChar(true);
                showingCharRef.current = true;
              }
            }}
          >
            {showingChar ? "👁" : "👁‍🗨"}
          </button>
        </div>
      </div>
    </div>
  );
}
