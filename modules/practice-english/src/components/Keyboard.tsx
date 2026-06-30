import { useEffect, useState, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

/** A single special key the keyboard can emit besides a letter. */
export type KeyAction =
  | { type: 'letter'; value: string }
  | { type: 'backspace' }
  | { type: 'enter' };

interface Props {
  /** Called when a key is committed. Letters are lowercase a–z. */
  onKey: (action: KeyAction) => void;
  /** Disable all input (e.g. between rounds while feedback animates). */
  disabled?: boolean;
  /** Label for the backspace key (i18n). */
  backspaceLabel: string;
  /** Label for the enter key (i18n). */
  enterLabel: string;
}

/**
 * Standard full QWERTY layout (reference: a phone keyboard).
 *   Row 1: Q W E R T Y U I O P  (10)
 *   Row 2: A S D F G H J K L     (9)
 *   Row 3: ENTER  Z X C V B N M  ⌫
 * Letters are emitted lowercase. Apostrophes/hyphens are auto-inserted by the
 * game, so no `'`/`-` keys are needed.
 */
const TOP_ROW = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const MID_ROW = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const BOTTOM_ROW = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

/**
 * On-screen, big-tappable spelling keyboard (mobile-first).
 *
 * Press-to-preview-then-commit: a key HIGHLIGHTS on pointer-down (no commit
 * yet) and only COMMITS on pointer-up while the pointer is still over that same
 * key. Sliding off the key before releasing cancels the tap — so a mis-tap can
 * be backed out. Implemented with pointer events (works for touch + mouse).
 *
 * Also forwards physical keyboard input (nice on desktop), which commits
 * immediately as expected for a real keyboard.
 */
export default function Keyboard({ onKey, disabled, backspaceLabel, enterLabel }: Props) {
  // The id of the key currently held down (highlighted, not yet committed).
  const [pressed, setPressed] = useState<string | null>(null);

  // Accept physical keyboard input too (commits immediately — real keyboard).
  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        onKey({ type: 'backspace' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onKey({ type: 'enter' });
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        onKey({ type: 'letter', value: e.key.toLowerCase() });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey, disabled]);

  // Is the point (clientX, clientY) inside the key's own bounding box?
  const pointInside = (el: HTMLElement, x: number, y: number) => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  // pointer-DOWN: highlight the key and capture the pointer so we keep getting
  // its move/up events even if the finger slides off. DON'T commit yet.
  const handleDown = useCallback((id: string, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPressed(id);
  }, [disabled]);

  // pointer-MOVE (while held): keep the highlight only while the finger is still
  // over THIS key. Slide off → un-highlight (preview the back-out); slide back
  // on → re-highlight. The highlight is the single source of truth for commit.
  const handleMove = useCallback((id: string, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const inside = pointInside(e.currentTarget, e.clientX, e.clientY);
    setPressed((cur) => {
      if (inside) return id;          // re-arm if finger is back over this key
      return cur === id ? null : cur; // slid off → clear this key's highlight
    });
  }, [disabled]);

  // pointer-UP: commit ONLY if released while still over the same key (i.e. the
  // key is still highlighted). Releasing after sliding off backs out silently.
  const handleUp = useCallback((id: string, action: KeyAction, e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const stillOver = pointInside(e.currentTarget, e.clientX, e.clientY);
    setPressed((cur) => (cur === id ? null : cur));
    if (stillOver && !disabled) onKey(action);
  }, [onKey, disabled]);

  // pointer cancelled (e.g. the OS stole it) → back out, no commit.
  const handleCancel = useCallback((id: string) => {
    setPressed((cur) => (cur === id ? null : cur));
  }, []);

  const renderKey = (id: string, action: KeyAction, extraClass: string, label: ReactNode, ariaLabel?: string) => (
    <button
      key={id}
      type="button"
      className={`kbd-key${extraClass}${pressed === id ? ' kbd-key--pressed' : ''}`}
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(e) => handleDown(id, e)}
      onPointerMove={(e) => handleMove(id, e)}
      onPointerUp={(e) => handleUp(id, action, e)}
      onPointerLeave={() => handleCancel(id)}
      onPointerCancel={() => handleCancel(id)}
    >
      {label}
    </button>
  );

  const letterKey = (letter: string) =>
    renderKey(letter, { type: 'letter', value: letter }, '', letter);

  return (
    <div className={`kbd${disabled ? ' kbd--disabled' : ''}`} aria-hidden={disabled}>
      <div className="kbd-row">{TOP_ROW.map(letterKey)}</div>
      <div className="kbd-row kbd-row--mid">{MID_ROW.map(letterKey)}</div>
      <div className="kbd-row">
        {renderKey(
          'enter',
          { type: 'enter' },
          ' kbd-key--wide kbd-key--action kbd-key--enter',
          enterLabel,
          enterLabel,
        )}
        {BOTTOM_ROW.map(letterKey)}
        {renderKey(
          'backspace',
          { type: 'backspace' },
          ' kbd-key--wide kbd-key--back',
          '⌫',
          backspaceLabel,
        )}
      </div>
    </div>
  );
}
