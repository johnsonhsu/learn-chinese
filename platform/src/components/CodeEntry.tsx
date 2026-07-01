import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.ts';
import './CodeEntry.css';

const CODE_LENGTH = 4;
// How long the results modal lingers before auto-dismissing (also tap-to-close).
const RESULT_TIMEOUT_MS = 2200;

/**
 * The outcome of redeeming an entered code, as resolved by the caller's
 * {@link CodeEntry} `onSubmit`. A discriminated union matching utils/unlocks
 * `redeemCode`:
 *   · 'granted'              — `feature` is the granted key; the keypad fires
 *                              `onUnlocked(feature)` and shows that feature's
 *                              success message + emoji.
 *   · 'prerequisite-missing' — the code is valid but its prerequisite isn't
 *                              unlocked yet; nothing was granted. SECURITY BY
 *                              OBSCURITY: the keypad renders this EXACTLY like
 *                              'unknown' (generic "Invalid code" ❌) so a
 *                              valid-but-locked code gives NO hint that it's real
 *                              or that a prerequisite exists.
 *   · 'unknown'              — unrecognised code → generic "Invalid code".
 * The keypad stays provider-agnostic: it only knows these shapes, not codes.
 */
export type CodeResult =
  | { status: 'granted'; feature: string }
  | { status: 'prerequisite-missing'; required: string }
  | { status: 'unknown' };

/** A single 0–9 digit key in the on-screen pad. */
function KeypadKey({ label, ariaLabel, onPress }: {
  label: React.ReactNode;
  ariaLabel: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="codepad-key"
      onClick={onPress}
      aria-label={ariaLabel}
    >
      {label}
    </button>
  );
}

/**
 * Reusable 4-digit code entry. Renders an on-screen 0–9 keypad (no `*`/`#`), a
 * 4-slot entered-digits display that reveals the typed digits (with a backspace
 * key at the end of that row), and — once the 4th digit lands — an
 * auto-submitting results modal.
 *
 * The keypad is provider-agnostic: it doesn't know what a code means. The caller
 * passes {@link onSubmit}, which redeems the code in whatever scope it owns
 * (device-level {@link redeemCode}, or a per-profile unlock) and returns a
 * {@link CodeResult}. The keypad turns that into a per-outcome message + emoji:
 *   · granted 'admin'          → "Admin settings unlocked" 🔧
 *   · granted 'admin-prereq'   → "Admin code accepted — enter the menu code" 🔑
 *   · granted 'premium-prereq' → "Premium unlocked — enter a theme code" ✨
 *   · granted 'theme-silver'   → "Silver theme unlocked" 🥈
 *   · granted 'theme-gold'     → "Gold theme unlocked" 🥇
 *   · prerequisite-missing     → "Invalid code" ❌ (identical to unknown — no hint)
 *   · unknown                  → "Invalid code" ❌
 * On a 'granted' outcome it fires {@link onUnlocked} with the feature key so the
 * caller can apply the unlock. The results modal auto-dismisses after ~2.2s
 * (tap also closes).
 *
 * Both keypad presses and the physical keyboard drive entry (0–9, Backspace,
 * Escape to cancel); keys show a visible focus ring for accessibility.
 */
export function CodeEntry({ onSubmit, onUnlocked, onClose }: {
  /** Redeem the completed code in the caller's scope; return the outcome. */
  onSubmit: (_code: string) => CodeResult;
  /** Called once on a successful unlock, with the granted feature key. */
  onUnlocked?: (_feature: string) => void;
  /** Dismiss the whole flow (cancel from the keypad, or after results close). */
  onClose: () => void;
}) {
  const t = useT();
  const [digits, setDigits] = useState('');
  // null = still on the keypad; set = showing the results modal for this outcome.
  const [result, setResult] = useState<CodeResult | null>(null);
  const onUnlockedRef = useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;

  // Submit the completed code: resolve the outcome, fire onUnlocked for a real
  // unlock, then swap the keypad for the results modal.
  const submit = useCallback((code: string) => {
    const res = onSubmit(code);
    setResult(res);
    if (res.status === 'granted') onUnlockedRef.current?.(res.feature);
  }, [onSubmit]);

  // Append a digit; auto-submit the moment the 4th lands.
  const pushDigit = useCallback((d: string) => {
    if (result) return; // results showing — ignore further input
    setDigits((prev) => {
      if (prev.length >= CODE_LENGTH) return prev;
      const next = prev + d;
      if (next.length === CODE_LENGTH) submit(next);
      return next;
    });
  }, [result, submit]);

  const backspace = useCallback(() => {
    if (result) return;
    setDigits((prev) => prev.slice(0, -1));
  }, [result]);

  // Auto-dismiss the results modal after a beat (tap also dismisses via onClose).
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(onClose, RESULT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [result, onClose]);

  // Physical-keyboard support: digits type, Backspace deletes, Escape cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (result) return; // results modal: only Esc/tap dismisses
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); pushDigit(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pushDigit, backspace, result, onClose]);

  // Localized message + emoji for the resolved outcome.
  const resultView = (() => {
    if (!result) return null;
    if (result.status === 'granted') {
      switch (result.feature) {
        case 'admin':          return { emoji: '🔧', msg: t('unlock.adminUnlocked') };
        case 'admin-prereq':   return { emoji: '🔑', msg: t('unlock.adminReady') };
        case 'premium-prereq': return { emoji: '✨', msg: t('unlock.premiumUnlocked') };
        case 'theme-silver':   return { emoji: '🥈', msg: t('unlock.silverUnlocked') };
        case 'theme-gold':     return { emoji: '🥇', msg: t('unlock.goldUnlocked') };
        default:               return { emoji: '✅', msg: t('unlock.unlocked') };
      }
    }
    // 'prerequisite-missing' and 'unknown' both render as the generic invalid
    // code — a valid-but-locked code (e.g. 9900 before 9000) is deliberately
    // indistinguishable from a genuinely bad one, giving away no hint that the
    // code is real or that a prerequisite exists. Neither grants anything.
    return { emoji: '❌', msg: t('unlock.invalid') };
  })();

  if (resultView) {
    return (
      <div className="codepad-overlay" onClick={onClose}>
        <div
          className="codepad-result"
          role="alertdialog"
          aria-modal="true"
          aria-label={resultView.msg}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="codepad-result__emoji" aria-hidden="true">{resultView.emoji}</div>
          <p className="codepad-result__msg">{resultView.msg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="codepad-overlay" onClick={onClose}>
      <div
        className="codepad-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('unlock.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t('unlock.title')}</h3>
        {/* Entered-digits row: 4 slots reveal the digits as typed; a backspace
            key sits at the end (right) and deletes the last digit. */}
        <div className="codepad-entry">
          <div className="codepad-slots">
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={i < digits.length ? 'codepad-slot codepad-slot--filled' : 'codepad-slot'}
                aria-hidden="true"
              >
                {i < digits.length ? digits[i] : ''}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="codepad-backspace"
            onClick={backspace}
            disabled={digits.length === 0}
            aria-label={t('unlock.delete')}
          >
            ⌫
          </button>
        </div>
        {/* Number grid: 1–9 (3×3), then 0 centered on the last row. */}
        <div className="codepad-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <KeypadKey key={d} label={d} ariaLabel={d} onPress={() => pushDigit(d)} />
          ))}
          <span aria-hidden="true" />
          <KeypadKey label="0" ariaLabel="0" onPress={() => pushDigit('0')} />
          <span aria-hidden="true" />
        </div>
        <button type="button" className="codepad-cancel" onClick={onClose}>
          {t('unlock.cancel')}
        </button>
      </div>
    </div>
  );
}
