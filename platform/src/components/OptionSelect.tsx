import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** One selectable option in an {@link OptionSelect}. */
export interface SelectOption {
  /** Stable value passed back to onChange. Use '' for an "inherit/none" row. */
  value: string;
  /** Visible label. */
  label: string;
  /** Optional trailing adornment (e.g. a 🔒 lock badge for gated rows). */
  badge?: ReactNode;
}

/**
 * Generic custom dropdown — the SAME cartoon-themed picker UI built for English
 * VoiceSelect, extracted so other settings (theme picker, …) reuse it verbatim.
 * Controlled (value/onChange). The open list is `position: fixed`, anchored to
 * the trigger, so it floats above settings cards that clip with overflow:hidden.
 * Styling reuses the existing `.voice-dd*` classes in index.css (no new CSS).
 *
 * Behaviour matches the original VoiceSelect exactly: reposition on scroll/resize,
 * flip upward when there's no room below, close on outside-click / Escape.
 */
export function OptionSelect({ value, options, onChange, ariaLabel }: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Anchor the fixed-position list to the trigger; recompute on scroll/resize.
  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const below = window.innerHeight - r.bottom - gap;
    const above = r.top - gap;
    const up = below < 220 && above > below;
    const maxH = Math.min(window.innerHeight * 0.5, Math.max(up ? above : below, 140) - 8);
    setPos({ left: r.left, top: up ? r.top - gap : r.bottom + gap, width: r.width, maxH, up });
  };

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    reposition();
    const onMove = () => reposition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const triggerText = selected ? selected.label : (options[0]?.label ?? '');

  const select = (v: string) => {
    setOpen(false);
    onChange(v);
  };

  return (
    <div className="voice-dd" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="voice-dd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="voice-dd-current">{triggerText}</span>
        <span className={`voice-dd-caret${open ? ' open' : ''}`} aria-hidden="true">▾</span>
      </button>
      {open && pos && (
        <ul
          className="voice-dd-list"
          role="listbox"
          style={{
            left: pos.left,
            top: pos.top,
            width: pos.width,
            maxHeight: pos.maxH,
            transform: pos.up ? 'translateY(-100%)' : undefined,
          }}
        >
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={`voice-dd-opt${o.value === value ? ' selected' : ''}`}
                onClick={() => select(o.value)}
              >
                <span className="voice-dd-check" aria-hidden="true">{o.value === value ? '✓' : ''}</span>
                <span className="voice-dd-label">{o.label}</span>
                {o.badge !== undefined && <span className="voice-dd-badge">{o.badge}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
