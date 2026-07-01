import { useState, useRef, useCallback, useEffect } from "react";
import { BackButton } from "@platform/ui/index.ts";
import { speak } from "@platform/utils/speech.ts";
import { useOffline } from "@platform/offline/offline-context.tsx";
import { demoKey } from "@platform/offline/demo-key.ts";
import {
  buildReadingPool,
  tapTile,
  firstUnresolvedIndex,
  type ReadingSlot,
} from "@shared/character-stats/reading";
import { getNextReadingSentence, submitReadingResult } from "../utils/api.ts";
import type { NextSentenceResponse, CharAttemptResult, CharResult } from "../utils/api.ts";
import { useT } from "../i18n/index.ts";

interface Props {
  onStop: () => void;
}

/**
 * The reading-comprehension screen (issue #65). Reconstruct the sentence by
 * tapping its characters IN ORDER from a shuffled pool of the sentence's own
 * chars. Correct tap → the tile is consumed and the slot advances; wrong tap →
 * red-shake feedback, no advance (green pop / red shake reuse practice-english's
 * signature). Auto-skip ON omits the hard chars from the pool (recorded as skip);
 * OFF shows all. NO HanziWriter is used.
 */
export function ReadingPage({ onStop }: Props) {
  const t = useT();
  const { dataLayer } = useOffline();
  const [sentence, setSentence] = useState<NextSentenceResponse | null>(null);
  const [slots, setSlots] = useState<ReadingSlot[]>([]);
  const [tiles, setTiles] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [wrongTile, setWrongTile] = useState<{ char: string; nonce: number } | null>(null);
  const [poppedIndex, setPoppedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [fluency, setFluency] = useState(0);
  const [totalKnown, setTotalKnown] = useState(0);

  const autoSkipKey = demoKey("reading_auto_skip");
  const [autoSkip, setAutoSkip] = useState(() => localStorage.getItem(autoSkipKey) === "true");
  const toggleAutoSkip = () => {
    const next = !autoSkip;
    setAutoSkip(next);
    localStorage.setItem(autoSkipKey, next ? "true" : "false");
  };

  const sentenceStart = useRef(Date.now());
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
    getNextReadingSentence(dataLayer)
      .then((s) => {
        if (loadId.current !== thisLoad) return;
        const pool = buildReadingPool({
          text: s.text,
          charRanks: s.charRanks || {},
          level: s.level,
          aboveLevelThreshold: s.aboveLevelThreshold ?? 30,
          autoSkip,
        });
        setSentence(s);
        setSlots(pool.slots);
        setTiles(pool.tiles);
        setIndex(firstUnresolvedIndex(pool.slots));
        setFluency(s.fluency);
        setTotalKnown(s.totalKnown);
        sentenceStart.current = Date.now();
        speak(s.text);
      })
      .catch((e) => {
        if (loadId.current === thisLoad) setError(e.message);
      })
      .finally(() => {
        if (loadId.current === thisLoad) setLoading(false);
      });
  }, [dataLayer, autoSkip]);

  useEffect(() => {
    loadSentence();
  }, [loadSentence]);

  // Assemble the per-char results (by slot index, so duplicate chars are scored
  // independently) + submit to the READING track only. A slot tapped with no
  // wrong attempts = perfect; with ≥1 wrong = correct; auto-skipped = skip.
  const finish = useCallback(async () => {
    if (!dataLayer || !sentence) return;
    const results: CharAttemptResult[] = slots.map((s, i) => {
      if (s.autoSkipped) {
        return {
          char: s.char,
          result: "skip" as CharResult,
          failedStrokes: 0,
          hintUsed: true,
          durationMs: 0,
        };
      }
      const m = mistakes.current[i] || 0;
      return {
        char: s.char,
        result: (m === 0 ? "perfect" : "correct") as CharResult,
        failedStrokes: 0,
        hintUsed: false,
        durationMs: 0,
      };
    });
    const durationMs = Date.now() - sentenceStart.current;
    const resp = await submitReadingResult(dataLayer, sentence.sentenceId, durationMs, results);
    if (resp.fluency !== undefined) setFluency(resp.fluency);
    if (resp.totalKnown !== undefined) setTotalKnown(resp.totalKnown);
    setDone(true);
  }, [dataLayer, sentence, slots]);

  const onTapTile = useCallback(
    (tapped: string, tileIdx: number) => {
      const res = tapTile(slots, index, tiles, tapped);
      if (res.outcome === "wrong") {
        mistakes.current[index] = (mistakes.current[index] || 0) + 1;
        setWrongTile({ char: tapped, nonce: Date.now() + tileIdx });
        return;
      }
      setWrongTile(null);
      setPoppedIndex(index);
      setTiles(res.tiles);
      setIndex(res.nextIndex);
      if (res.done) {
        void finish();
      }
    },
    [slots, index, tiles, finish],
  );

  // --- Done screen ---
  if (done) {
    const scoredIdx = slots.map((s, i) => ({ s, i })).filter(({ s }) => !s.autoSkipped);
    const perfect = scoredIdx.filter(({ i }) => (mistakes.current[i] ?? 0) === 0).length;
    const perfectAll =
      scoredIdx.length > 0 && scoredIdx.every(({ i }) => (mistakes.current[i] ?? 0) === 0);
    return (
      <div className="rc-page rc-page--done">
        <div className="rc-done-card">
          <div className="rc-done-fluency">
            {t("reading.fluency")} {fluency} — {totalKnown} {t("reading.chars")}
          </div>
          {sentence?.definition && <div className="rc-done-meaning">{sentence.definition}</div>}
          <div className="rc-done-sentence" onClick={() => sentence && speak(sentence.text)}>
            {slots.map((s, i) => (
              <span key={i} className={`rc-done-char${s.autoSkipped ? " rc-done-char--skip" : ""}`}>
                {s.char}
              </span>
            ))}
          </div>
          {perfectAll ? (
            <div className="rc-celebrate">
              <span aria-hidden>✨</span> {t("reading.perfectAll")} <span aria-hidden>✨</span>
            </div>
          ) : (
            <div className="rc-done-stats">
              {perfect} {t("reading.correct")}
            </div>
          )}
          <div className="rc-done-actions">
            <button className="rc-btn-primary" onClick={loadSentence}>
              {t("reading.nextSession")}
            </button>
            <button className="rc-btn-secondary" onClick={onStop}>
              {t("reading.stop")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="rc-empty">{t("reading.loading")}</div>;
  if (error)
    return (
      <div className="rc-empty" style={{ color: "var(--error)" }}>
        {error}
      </div>
    );
  if (!sentence) return <div className="rc-empty">{t("reading.noSentences")}</div>;

  return (
    <div className="rc-page">
      <div className="rc-top">
        <BackButton size="sm" onClick={onStop} label={t("reading.back")} />
        <div className="rc-level">R{fluency}</div>
        <div className="rc-settings">
          <button
            className={`sp-autoskip-toggle${autoSkip ? " active" : ""}`}
            onClick={toggleAutoSkip}
            title="Auto-skip chars above your level"
          >
            {t("reading.autoSkip")} {autoSkip ? t("reading.on") : t("reading.off")}
          </button>
          <button className="rc-new-btn" onClick={loadSentence} title={t("reading.newSentence")}>
            ↻
          </button>
        </div>
      </div>

      <div className="rc-prompt-card">
        <div className="rc-prompt-row">
          <button
            type="button"
            className="rc-audio-btn"
            onClick={() => speak(sentence.text)}
            aria-label={t("reading.hearSentence")}
          >
            🔊
          </button>
          {sentence.definition && <div className="rc-prompt-meaning">{sentence.definition}</div>}
        </div>

        {/* In-order sentence strip: filled slots show the tapped char; the current
            slot is highlighted; not-yet-reached slots show a blank placeholder. */}
        <div className="rc-sentence-strip">
          {slots.map((s, i) => {
            const filled = i < index;
            const isActive = i === index;
            const isAuto = s.autoSkipped;
            const cls = [
              "rc-slot",
              filled && "rc-slot--filled",
              isActive && "rc-slot--active",
              isAuto && "rc-slot--skip",
              poppedIndex === i && "rc-slot--pop",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <span key={i} className={cls}>
                {filled || isAuto ? s.char : ""}
              </span>
            );
          })}
        </div>

        <div className="rc-instruction">{t("reading.instruction")}</div>

        {/* Tile pool: the shuffled sentence chars still to place. Each tap tests
            against the current slot; a correct tap consumes the tile. */}
        <div className="rc-tile-pool">
          {tiles.map((c, i) => {
            const isWrong = wrongTile && wrongTile.char === c;
            return (
              <button
                key={`${c}-${i}`}
                className={`rc-tile${isWrong ? " rc-tile--wrong" : ""}`}
                onClick={() => onTapTile(c, i)}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
