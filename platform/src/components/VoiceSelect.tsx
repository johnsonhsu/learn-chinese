import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getEnglishVoices, previewVoice, voiceLabel } from '../utils/voices.ts';

/** A labeled English-voice dropdown + 🔊 preview. Controlled (value/onChange).
 *  `inheritLabel` (when set) adds a leading "" option meaning "fall back".
 *  Custom (non-native) dropdown so its option list matches the app's cartoon theme.
 *  The open list is `position: fixed`, anchored to the trigger, so it floats above
 *  the settings cards (which clip with `overflow: hidden`). */
export function VoiceSelect({ value, onChange, inheritLabel }: {
  value: string;
  onChange: (_name: string) => void;
  inheritLabel?: string;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const load = () => setVoices(getEnglishVoices());
    load();
    speechSynthesis.onvoiceschanged = load;
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, []);

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

  // Position before paint when opening, then keep it pinned to the trigger.
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

  // Close on click-outside / Escape while open.
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

  const selected = voices.find((v) => v.name === value);
  const triggerText = value
    ? (selected ? voiceLabel(selected).replace(/\s*—.*$/, '') : value)
    : (inheritLabel ?? '');

  const select = (name: string) => {
    setOpen(false);
    onChange(name); // onChange already previews when name is non-empty
  };

  return (
    <div className="voice-select-row">
      <div className="voice-dd" ref={wrapRef}>
        <button
          type="button"
          ref={triggerRef}
          className="voice-dd-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Choose voice"
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
            {inheritLabel !== undefined && (
              <li role="option" aria-selected={value === ''}>
                <button
                  type="button"
                  className={`voice-dd-opt${value === '' ? ' selected' : ''}`}
                  onClick={() => select('')}
                >
                  <span className="voice-dd-check" aria-hidden="true">{value === '' ? '✓' : ''}</span>
                  <span className="voice-dd-label">{inheritLabel}</span>
                </button>
              </li>
            )}
            {voices.map((v) => (
              <li key={v.name} role="option" aria-selected={v.name === value}>
                <button
                  type="button"
                  className={`voice-dd-opt${v.name === value ? ' selected' : ''}`}
                  onClick={() => select(v.name)}
                >
                  <span className="voice-dd-check" aria-hidden="true">{v.name === value ? '✓' : ''}</span>
                  <span className="voice-dd-label">{voiceLabel(v)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        className="voice-preview"
        title="Preview"
        aria-label="Preview voice"
        onClick={() => previewVoice(value || voices[0]?.name || '')}
      >🔊</button>
    </div>
  );
}
