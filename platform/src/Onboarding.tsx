/**
 * New-profile onboarding. Replaces the char-by-char placement TEST: new users
 * shouldn't be tested, and learning/native users self-select instead.
 *
 * Three paths ("Which are you?"):
 *   1. NEW       → seed nothing, go straight into the app at the true beginning.
 *   2. LEARNING  → Beginner / Intermediate / Advanced → seed the first N
 *                  frequency-ranked chars as known.
 *   3. NATIVE    → age input → map an age band to a known-char threshold
 *                  (a native — even a young child — already reads many chars).
 *
 * "Seed" = pre-mark the first N chars from the existing ranking as known
 * (dataLayer.seedKnownFromPlacement), so the EXISTING level/target engine then
 * serves chars + sentences that fit. We're seeding the starting point, not
 * building a new selector — N is the only knob, and ONBOARDING_SEED below is the
 * single place to tune it.
 *
 * Skippable + re-runnable (reachable from profile Settings, same hook as before).
 */
import { useMemo, useState } from 'react';
import { useOffline } from './offline/offline-context.tsx';
import { useT } from './i18n/index.ts';
import PlacementTest from './PlacementTest.tsx';

/**
 * Seed mapping — how many of the first frequency-ranked chars to pre-mark as
 * "known" for each path. Tune these freely; they're indices into the existing
 * ranking (≈3,556 ranked chars). For calibration: TOCFL L1≈357, L1–2≈660,
 * L1–3≈875, L1–4≈1,408 cumulative. Level N (the engine's notion) ≈ "knows the
 * first N ranked chars", so these double as the starting level.
 */
export const ONBOARDING_SEED = {
  // Learning self-select → starting known-char count. Values are HALVED from the
  // reading/recognition research (NAER TBCL char ladder, TOCFL/CEFR) because this
  // app trains WRITING — active production lags passive reading, so ~½ recognition.
  learning: {
    beginner: 250,     // ½ of TBCL L1–2 (CEFR A2 ≈ 504 chars read)
    intermediate: 650, // ½ of TBCL L1–4 (CEFR B2 ≈ 1,300 read)
    advanced: 950,     // ½ of TBCL L1–5 (CEFR C1 ≈ 1,900 read)
  },
  /**
   * Native age bands → known-char count. HALVED from the 2008 NTNU national
   * norming study of chars RECOGNIZED per grade (writing ≈ ½ reading).
   * [maxAgeInclusive, knownChars]; first band whose max ≥ age wins, else fallback.
   */
  nativeAgeBands: [
    { maxAge: 6, known: 150 },   // ½ of ~300 (pre-/early reader)
    { maxAge: 9, known: 750 },   // ½ of ~1,500 (measured G2–G3)
    { maxAge: 12, known: 1300 }, // ½ of ~2,600 (measured G4)
    { maxAge: 17, known: 1650 }, // ½ of ~3,300 (measured G7–G9 plateau)
  ] as { maxAge: number; known: number }[],
  nativeAdult: 1750,             // ½ of ~3,500 (adult functional literacy)
} as const;

/** Resolve a native speaker's age to a known-char count via ONBOARDING_SEED. */
export function knownCountForAge(age: number): number {
  for (const band of ONBOARDING_SEED.nativeAgeBands) {
    if (age <= band.maxAge) return band.known;
  }
  return ONBOARDING_SEED.nativeAdult;
}

type Phase = 'who' | 'learning' | 'native' | 'test' | 'finishing';

export default function Onboarding({ onDone, onOpenSettings }: { onDone: () => void; onOpenSettings: () => void }) {
  const t = useT();
  const { dataLayer } = useOffline();
  const ranking = useMemo(() => dataLayer?.getCharRanking() ?? [], [dataLayer]);
  const [phase, setPhase] = useState<Phase>('who');
  const [age, setAge] = useState('');
  // Starting level estimate handed to the adaptive writing test (Learning/Native).
  const [startEstimate, setStartEstimate] = useState(0);

  /** Seed the first N ranked chars as known, mark onboarding done, enter the app. */
  const seedAndFinish = async (knownCount: number) => {
    setPhase('finishing');
    if (knownCount > 0) {
      const chars = ranking.slice(0, Math.min(knownCount, ranking.length)).map((r) => r.char);
      await dataLayer?.seedKnownFromPlacement(chars);
    }
    await dataLayer?.setPlacementDone();
    onDone();
  };

  // NEW: no testing, no seeding — straight into the app at the very start.
  const chooseNew = () => { void seedAndFinish(0); };

  // Learning/Native self-select sets only a STARTING estimate; the adaptive
  // writing test (test phase) then refines it and does the seeding itself.
  const startTest = (seed: number) => {
    setStartEstimate(seed);
    setPhase('test');
  };

  const submitAge = () => {
    const n = parseInt(age, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    startTest(knownCountForAge(n));
  };

  const Gear = (
    <button
      className="icon-btn placement-gear"
      onClick={onOpenSettings}
      title={t('settings.title')}
      aria-label={t('settings.title')}
    >
      &#9881;
    </button>
  );

  if (phase === 'finishing') {
    return (
      <div className="placement-page">
        <div className="placement-card">
          <div className="placement-emoji">✨</div>
          <h2>{t('placement.finishing')}</h2>
        </div>
      </div>
    );
  }

  // Adaptive writing placement test — refines the self-selected starting estimate
  // and does its own seeding + setPlacementDone before calling onDone.
  if (phase === 'test') {
    return (
      <PlacementTest
        startEstimate={startEstimate}
        onDone={onDone}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  if (phase === 'learning') {
    return (
      <div className="placement-page">
        {Gear}
        <div className="placement-card">
          <div className="placement-emoji">📚</div>
          <h2>{t('onboarding.learningTitle')}</h2>
          <p className="placement-intro">{t('onboarding.learningIntro')}</p>
          <div className="placement-actions">
            <button className="lever-pill active" onClick={() => startTest(ONBOARDING_SEED.learning.beginner)}>
              {t('onboarding.beginner')}
            </button>
            <button className="lever-pill active" onClick={() => startTest(ONBOARDING_SEED.learning.intermediate)}>
              {t('onboarding.intermediate')}
            </button>
            <button className="lever-pill active" onClick={() => startTest(ONBOARDING_SEED.learning.advanced)}>
              {t('onboarding.advanced')}
            </button>
            <button className="lever-pill" onClick={() => setPhase('who')}>{t('app.back')}</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'native') {
    return (
      <div className="placement-page">
        {Gear}
        <div className="placement-card">
          <div className="placement-emoji">🧒</div>
          <h2>{t('onboarding.nativeTitle')}</h2>
          <p className="placement-intro">{t('onboarding.nativeIntro')}</p>
          <input
            className="welcome-popup-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            value={age}
            placeholder={t('onboarding.agePlaceholder')}
            onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
            onKeyDown={(e) => e.key === 'Enter' && submitAge()}
            autoFocus
          />
          <div className="placement-actions">
            <button className="lever-pill active" onClick={submitAge} disabled={!age.trim()}>
              {t('onboarding.continue')}
            </button>
            <button className="lever-pill" onClick={() => setPhase('who')}>{t('app.back')}</button>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'who'
  return (
    <div className="placement-page">
      {Gear}
      <div className="placement-card">
        <div className="placement-emoji">🧭</div>
        <h2>{t('onboarding.whichTitle')}</h2>
        <p className="placement-intro">{t('onboarding.whichIntro')}</p>
        <div className="placement-actions">
          <button className="lever-pill active" onClick={chooseNew}>
            {t('onboarding.new')}
          </button>
          <button className="lever-pill active" onClick={() => setPhase('learning')}>
            {t('onboarding.learning')}
          </button>
          <button className="lever-pill active" onClick={() => setPhase('native')}>
            {t('onboarding.native')}
          </button>
        </div>
      </div>
    </div>
  );
}
