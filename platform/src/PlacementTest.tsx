/**
 * Adaptive writing placement test (Learning + Native onboarding paths).
 *
 * The onboarding self-select (level / age) gives a STARTING level estimate; this
 * test then refines it with 10 adaptive items, all written + scored through the
 * SAME writing-challenge writing engine the real practice uses — reused the EXACT
 * way the copybook module reuses it: we render the shared writing-challenge
 * `PracticePage` and feed it a placement `provideSession` (instead of the bank
 * source) plus a placement `submitSession` (instead of the progress write-back).
 * No cloned canvas/scorer: writing, the zhuyin cue, the hidden glyph, the
 * per-stroke scoring (perfect/correct/incorrect) and skip all come from the engine.
 *
 *   1. Char phase (5 items): each round serves a ONE-character `text` whose
 *      frequency RANK is within ±10% of the moving estimate. The engine shows the
 *      char's ZHUYIN and hides the glyph (its normal quiz behavior), so the user
 *      recalls + writes it. Right → est ×1.1, wrong → est ×0.9; re-pick each round.
 *   2. Sentence phase (5 items): each round serves a bank sentence whose difficulty
 *      (rank-scaled bankDifficulty, comparable to the level scale) is within ±10%
 *      of the estimate; the engine writes its chars one-by-one, each zhuyin-cued.
 *      Sentence correct = ALL its chars correct. Right → ×1.1, wrong → ×0.9.
 *
 * Each item is one engine "session". The engine fires `submitSession(charResults)`
 * once the session's chars are all written; we read that to score the item, step
 * the estimate, pick the next item, and AUTO-ADVANCE by bumping the component key
 * (remount → the engine's mount effect loads the next `provideSession`), so the
 * user never sees the per-session done screen between placement items.
 *
 * The converged estimate after all 10 items is the user's true level; we seed the
 * first <trueLevel> ranked chars as known (seedKnownFromPlacement) + mark placement
 * done, exactly like the old self-select path — the test just sets a better N.
 *
 * No-recording: placement's `submitSession` is a stats no-op (it never calls the
 * data layer's submitResult), so the test cannot pollute character_stats — the
 * only writes happen once at the end via seedKnownFromPlacement.
 *
 * Architecture note: PlacementTest lives in PLATFORM while PracticePage lives in
 * the writing-challenge MODULE. Importing `@modules/writing-challenge` here is a
 * platform→module import, which vite + the platform tsconfig already resolve (the
 * platform offline-context already imports the same module's api.ts to wire the
 * offline layer). It's the same clean reuse seam copybook uses, so we rely on it
 * rather than re-cloning the writer.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  PracticePage as WritingPracticePage,
  WCLanguageContext,
  type NextSentenceResponse,
  type SentenceResultResponse,
  type CharAttemptResult,
} from '@modules/writing-challenge';
import { useOffline } from './offline/offline-context.tsx';
import { useT, LanguageContext } from './i18n/index.ts';

const STEP_UP = 1.1;
const STEP_DOWN = 0.9;
const BAND = 0.1; // ±10% pick window for both chars and sentences
const CHAR_ROUNDS = 5;
const SENTENCE_ROUNDS = 5;

/**
 * A char attempt is a pass when written without help/failed strokes. The engine's
 * CharResult is 'perfect' | 'correct' | 'incorrect' | 'skip'; a placement item is
 * passed only on 'perfect'/'correct' (skip & incorrect both fail it).
 */
function isPass(result: CharAttemptResult['result']): boolean {
  return result === 'perfect' || result === 'correct';
}

interface Props {
  /** Starting level estimate from the onboarding self-select (ONBOARDING_SEED). */
  startEstimate: number;
  /** Called with the final converged level once seeded + placement marked done. */
  onDone: () => void;
  /**
   * Settings opener — still threaded by Onboarding for parity, but the placement
   * screen no longer renders a gear (decluttered), so it's intentionally unused.
   */
  onOpenSettings?: () => void;
}

type CharItem = { kind: 'char'; text: string };
type SentItem = { kind: 'sentence'; id: number; text: string; chars: string[] };
type Item = CharItem | SentItem;

export default function PlacementTest({ startEstimate, onDone }: Props) {
  const t = useT();
  const language = useContext(LanguageContext);
  const { dataLayer } = useOffline();

  const ranking = useMemo(() => dataLayer?.getCharRanking() ?? [], [dataLayer]);
  const maxLevel = Math.max(1, ranking.length);
  const clamp = useCallback((n: number) => Math.max(1, Math.min(maxLevel, Math.round(n))), [maxLevel]);

  // Char rank -> char lookup. ranking is sorted by rank asc (rank = index + 1).
  const charByRank = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of ranking) m.set(r.rank, r.char);
    return m;
  }, [ranking]);

  // Bank sentences with their rank-scaled difficulty (comparable to the level scale).
  const bankSentences = useMemo<{ id: number; sentence: string; difficulty: number }[]>(() => {
    return dataLayer?.getBankSentences('', 50000)?.sentences ?? [];
  }, [dataLayer]);

  // Writing-challenge quiz tuning (same source the engine's PracticePage reads).
  const settings = useMemo(() => {
    try { return dataLayer?.getModuleSettings() ?? {}; } catch { return {}; }
  }, [dataLayer]);
  const strokesPerFail = parseInt(settings['strokes_per_fail'] || '3', 10);
  const leniency = parseFloat(settings['stroke_leniency'] || '1.0');

  /** Zhuyin (注音) for the cue, or '' when none is available (graceful fallback). */
  const zhuyinOf = useCallback((char: string): string => {
    try { return dataLayer?.getCharZhuyin(char) ?? ''; } catch { return ''; }
  }, [dataLayer]);

  // Adaptive state. The estimate moves on each item; `round`/`phase` track the
  // 5-char-then-5-sentence sequence; `seq` is the engine remount key that
  // auto-advances to the next item without showing the per-session done screen.
  const estimateRef = useRef(clamp(startEstimate));
  const phaseRef = useRef<'char' | 'sentence'>('char');
  const roundRef = useRef(0); // 0-indexed within the current phase
  const [seq, setSeq] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Items already used this run, so we don't re-test the same one.
  const usedChars = useRef<Set<string>>(new Set());
  const usedSentenceIds = useRef<Set<number>>(new Set());

  // The item currently being served (set by provideSession, read by the progress
  // label + submitSession). Kept in a ref so the engine's stable callbacks see it.
  const currentItem = useRef<Item | null>(null);
  const [, forceLabel] = useState(0); // re-render the progress label on item change

  /**
   * Pick an untested char whose rank is within ±BAND of `est`, nearest to it.
   * Prefer chars that have a zhuyin cue (so the prompt can show 注音); only fall
   * back to a cue-less char when none in range have zhuyin — never block on it.
   */
  const pickChar = useCallback((est: number): string | null => {
    const lo = clamp(est * (1 - BAND));
    const hi = clamp(est * (1 + BAND));
    let best: string | null = null;       // best cue-bearing candidate
    let bestDist = Infinity;
    let fallback: string | null = null;   // nearest candidate regardless of cue
    let fallbackDist = Infinity;
    for (let r = lo; r <= hi; r++) {
      const c = charByRank.get(r);
      if (!c || usedChars.current.has(c)) continue;
      const d = Math.abs(r - est);
      if (d < fallbackDist) { fallback = c; fallbackDist = d; }
      if (zhuyinOf(c) && d < bestDist) { best = c; bestDist = d; }
    }
    // Band exhausted (small/edge ranges): widen to the nearest untested char.
    if (!best && !fallback) {
      for (const rc of ranking) {
        if (usedChars.current.has(rc.char)) continue;
        const d = Math.abs(rc.rank - est);
        if (d < fallbackDist) { fallback = rc.char; fallbackDist = d; }
        if (zhuyinOf(rc.char) && d < bestDist) { best = rc.char; bestDist = d; }
      }
    }
    return best ?? fallback;
  }, [charByRank, clamp, ranking, zhuyinOf]);

  /** Pick an untested bank sentence whose difficulty is within ±BAND of `est`. */
  const pickSentence = useCallback((est: number): SentItem | null => {
    const lo = est * (1 - BAND);
    const hi = est * (1 + BAND);
    let best: { id: number; sentence: string } | null = null;
    let bestDist = Infinity;
    for (const s of bankSentences) {
      if (usedSentenceIds.current.has(s.id)) continue;
      const inBand = s.difficulty >= lo && s.difficulty <= hi;
      const d = Math.abs(s.difficulty - est);
      // Prefer in-band; otherwise fall back to the nearest-difficulty sentence.
      if (inBand && d < bestDist) { best = s; bestDist = d; }
    }
    if (!best) {
      for (const s of bankSentences) {
        if (usedSentenceIds.current.has(s.id)) continue;
        const d = Math.abs(s.difficulty - est);
        if (d < bestDist) { best = s; bestDist = d; }
      }
    }
    if (!best) return null;
    const chars = [...best.sentence].filter((c) => /[一-鿿㐀-䶿]/.test(c));
    if (chars.length === 0) return null;
    return { kind: 'sentence', id: best.id, text: best.sentence, chars };
  }, [bankSentences]);

  /** Final eval: seed the first <finalLevel> ranked chars as known, mark done. */
  const seedAndFinish = useCallback(async (finalLevel: number) => {
    setFinishing(true);
    const known = clamp(finalLevel);
    const chars = ranking.slice(0, Math.min(known, ranking.length)).map((r) => r.char);
    if (chars.length > 0) await dataLayer?.seedKnownFromPlacement(chars);
    await dataLayer?.setPlacementDone();
    onDone();
  }, [clamp, ranking, dataLayer, onDone]);

  /**
   * Choose the next item for the CURRENT phase/round around the current estimate,
   * store it in currentItem, and bump the remount key so the engine loads it.
   * Returns false if no item could be produced (caller should finish instead).
   */
  const serveNextItem = useCallback((): Item | null => {
    if (phaseRef.current === 'char') {
      const c = pickChar(estimateRef.current);
      if (!c) return null;
      usedChars.current.add(c);
      const item: CharItem = { kind: 'char', text: c };
      currentItem.current = item;
      return item;
    }
    const item = pickSentence(estimateRef.current);
    if (!item) return null;
    usedSentenceIds.current.add(item.id);
    currentItem.current = item;
    return item;
  }, [pickChar, pickSentence]);

  // ---- The engine seam (copybook-style provideSession / submitSession) --------

  /**
   * provideSession: hand the engine the current placement item as a one-session
   * `text`. charZhuyin is populated so the engine shows the zhuyin cue (its quiz
   * mode already hides the glyph). level/threshold are pinned high so the engine's
   * auto-skip never fires on the picked item — placement always tests what it picks.
   */
  const provideSession = useCallback(async (): Promise<NextSentenceResponse> => {
    // First call (or any call where nothing's queued): produce the first item.
    if (!currentItem.current) serveNextItem();
    const item = currentItem.current;
    const text = item?.text ?? '';
    const distinct = [...new Set([...text].filter((c) => /[一-鿿㐀-䶿]/.test(c)))];
    const charZhuyin: Record<string, string> = {};
    for (const c of distinct) {
      const z = zhuyinOf(c);
      if (z) charZhuyin[c] = z;
    }
    const id = Date.now();
    return {
      sessionId: id,
      sentenceId: id,
      text,
      definition: '', // no English gloss → the engine hides the meaning pill
      templatePattern: '',
      slotFills: [],
      zhuyin: '',
      targetChar: distinct[0] ?? '',
      targetChars: distinct,
      level: maxLevel, // pin high so nothing reads as "above level" (no auto-skip)
      knownInLevel: 0,
      totalInLevel: 0,
      charRanks: {},
      charZhuyin,
      charMastery: {},
      fluency: 0,
      totalKnown: 0,
      aboveLevelThreshold: maxLevel,
    };
  }, [serveNextItem, zhuyinOf, maxLevel]);

  /**
   * submitSession: the engine calls this once a session's chars are all written.
   * Placement reads the per-char results to score the item, steps the estimate,
   * advances the phase/round, and auto-advances to the next item by bumping `seq`.
   * It NEVER records to character_stats (stats no-op) — the only persistence is
   * the final seedKnownFromPlacement in seedAndFinish.
   */
  const submitSession = useCallback(async (
    _userId: number,
    _sentenceId: number,
    _durationMs: number,
    charResults: CharAttemptResult[],
  ): Promise<SentenceResultResponse> => {
    const item = currentItem.current;
    // Item pass: char = its single result passed; sentence = ALL chars passed.
    const scored = charResults.filter((r) => r.result !== 'skip');
    const pass = item?.kind === 'sentence'
      ? charResults.length > 0 && charResults.every((r) => isPass(r.result))
      : scored.length > 0 && scored.every((r) => isPass(r.result));

    const stepped = clamp(estimateRef.current * (pass ? STEP_UP : STEP_DOWN));
    estimateRef.current = stepped;

    const nextRound = roundRef.current + 1;
    const phaseTotal = phaseRef.current === 'char' ? CHAR_ROUNDS : SENTENCE_ROUNDS;

    if (nextRound >= phaseTotal) {
      if (phaseRef.current === 'char') {
        // Move into the sentence phase from the post-char estimate.
        phaseRef.current = 'sentence';
        roundRef.current = 0;
        currentItem.current = null;
        const item2 = serveNextItem();
        if (!item2) {
          // No usable bank sentences — converge on the char-phase estimate.
          void seedAndFinish(stepped);
          return { level: 0, knownInLevel: 0, totalInLevel: 0, fluency: 0, totalKnown: 0 };
        }
        setSeq((s) => s + 1); // remount → engine loads the next item
        return { level: 0, knownInLevel: 0, totalInLevel: 0, fluency: 0, totalKnown: 0 };
      }
      // Sentence phase complete: the converged estimate is the true level.
      void seedAndFinish(stepped);
      return { level: 0, knownInLevel: 0, totalInLevel: 0, fluency: 0, totalKnown: 0 };
    }

    roundRef.current = nextRound;
    currentItem.current = null;
    const next = serveNextItem();
    if (!next) {
      void seedAndFinish(stepped);
      return { level: 0, knownInLevel: 0, totalInLevel: 0, fluency: 0, totalKnown: 0 };
    }
    setSeq((s) => s + 1); // remount → engine loads the next item
    return { level: 0, knownInLevel: 0, totalInLevel: 0, fluency: 0, totalKnown: 0 };
  }, [clamp, serveNextItem, seedAndFinish]);

  // Re-render whenever the served item changes (the engine remount also
  // re-renders, but downstream reads refs so nudge it explicitly).
  useEffect(() => { forceLabel((n) => n + 1); }, [seq]);

  if (finishing) {
    return (
      <div className="placement-page">
        <div className="placement-card">
          <div className="placement-emoji">✨</div>
          <h2>{t('placement.finishing')}</h2>
        </div>
      </div>
    );
  }

  // Decluttered placement: no gear, no top instruction/progress tile — just the
  // shared writing engine + its controls. (The progress label + settings gear
  // were removed at the user's request.)
  return (
    <div className="placement-page">
      {/* The shared writing-challenge engine, fed the placement source. Remounts on
          each `seq` bump to auto-advance to the next item (skips the done screen).
          It reads writing-challenge's own LanguageContext — feed it the platform's
          current language so its labels match.

          NOTE (memory-leak audit): this `key={seq}` remount is INTENTIONALLY kept.
          It's the ONLY mechanism that re-runs PracticePage's mount effect to fetch
          the next placement item via provideSession and reset the whole page's
          state — that's PracticePage-level "real work" with no imperative reload
          seam, so it can't move into WritingCanvas. It remounts once PER ITEM (10×,
          one-time onboarding), not per character, so the writer churn is negligible;
          the hot-path per-character writer leak is fixed inside WritingCanvas. */}
      <WCLanguageContext.Provider value={language}>
        <WritingPracticePage
          key={seq}
          userId={0}
          leniency={leniency}
          strokesPerFail={strokesPerFail}
          provideSession={provideSession}
          submitSession={submitSession}
          autoSkipKey="placement:auto-skip"
          showBack={false}
          onStop={onDone}
        />
      </WCLanguageContext.Provider>
    </div>
  );
}
