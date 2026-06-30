import { useState, useRef, useEffect } from 'react';

/**
 * Collapsible settings group — platform-level component for module admin pages.
 *
 * Usage:
 *   <SettingsGroup title="Stroke Recognition">
 *     ...settings content...
 *   </SettingsGroup>
 *
 *   <SettingsGroup title="Templates" count={12}>
 *     ...content with count badge...
 *   </SettingsGroup>
 */

interface Props {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function SettingsGroup({ title, count, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="settings-group">
      <button className="settings-group-header" onClick={() => setOpen(!open)}>
        <span className={`settings-group-arrow${open ? ' open' : ''}`}>&#9656;</span>
        <span className="settings-group-title">{title}</span>
        {count !== undefined && (
          <span className="settings-group-count">{count}</span>
        )}
      </button>
      {open && <div className="settings-group-body">{children}</div>}
    </div>
  );
}

/**
 * Info tooltip — click to show/hide explanation text.
 */
export function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (show && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 4, left: rect.right + 8 });
    }
  }, [show]);

  return (
    <span className="settings-infotip" onClick={() => setShow(!show)}>
      <span className="settings-infotip-icon" ref={iconRef}>i</span>
      {show && <span className="settings-infotip-text" style={{ top: pos.top, left: Math.min(pos.left, window.innerWidth - 300) }}>{text}</span>}
    </span>
  );
}

/**
 * Setting row — label + control + value display.
 */
export function SettingRow({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <label>
        {label}
        {info && <InfoTip text={info} />}
      </label>
      {children}
    </div>
  );
}

/**
 * Setting slider — range input with value display.
 */
export function SettingSlider({ label, info, value, min, max, step, onChange, suffix }: {
  label: string;
  info?: string;
  value: string | number;
  min: number;
  max: number;
  step: number;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  return (
    <SettingRow label={label} info={info}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <span className="settings-value">{value}{suffix || ''}</span>
    </SettingRow>
  );
}

/**
 * Setting toggle — flat/scaled or similar binary choice.
 */
export function SettingToggle({ label, info, options, value, onChange }: {
  label: string;
  info?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SettingRow label={label} info={info}>
      <div className="settings-toggle-group">
        {options.map(o => (
          <button
            key={o.value}
            className={`settings-toggle-btn${value === o.value ? ' active' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </SettingRow>
  );
}
