import { useState, type ReactNode } from 'react';
import { Button, Card, BackButton, ModuleScreen } from './ui/index.ts';

/**
 * Living styleguide / component gallery.
 *
 * A REAL, rendered page (not a doc) that imports the ACTUAL shared UI kit
 * (`./ui/index.ts`) and references the REAL canonical design tokens (the
 * `:root` custom properties in `index.css`) plus the shared classes
 * (`.module-tile`, `.module-back`, etc.). Because it composes the live
 * primitives, it stays accurate as the kit evolves.
 *
 * The whole page is wrapped in `.app-shell` so the kit's stylesheet
 * (ui-kit.css, all selectors prefixed `.app-shell`) actually applies — exactly
 * as it does when a module renders inside ActiveModuleView's `.app-shell`.
 *
 * Reachable two ways (see App.tsx): a top-level `?ui` query-param route
 * (mirrors the `?landing`/`?app` pattern) and a "UI Components" link in Device
 * Settings → Advanced (where dev/device tooling lives). Demo content uses plain
 * English labels (this is a dev reference); the persistent nav label that opens
 * it is routed through i18n.
 */

// The canonical color tokens worth eyeballing as swatches. Names are the REAL
// `:root` custom properties from index.css — we read them live via var().
const COLOR_TOKENS: { name: string; note: string; dark?: boolean }[] = [
  { name: '--bg', note: 'deep teal ink-board', dark: true },
  { name: '--bg-raised', note: 'cream panel interior' },
  { name: '--bg-raised-2', note: 'cream-dark' },
  { name: '--bg-input', note: 'near-white input fill' },
  { name: '--border', note: 'purple panel border', dark: true },
  { name: '--border-hover', note: 'purple hover', dark: true },
  { name: '--gold', note: 'primary candy face' },
  { name: '--gold-dark', note: 'primary candy lip', dark: true },
  { name: '--teal', note: 'accent teal', dark: true },
  { name: '--teal-dark', note: 'accent teal lip', dark: true },
  { name: '--green', note: 'success / green', dark: true },
  { name: '--green-dark', note: 'green lip', dark: true },
  { name: '--red', note: 'error / red', dark: true },
  { name: '--red-dark', note: 'red lip', dark: true },
  { name: '--accent', note: 'orange-dark accent', dark: true },
  { name: '--accent-bg', note: 'accent tint' },
  { name: '--text', note: 'dark text on cream', dark: true },
  { name: '--text-muted', note: 'muted text', dark: true },
  { name: '--text-dim', note: 'dim text' },
];

// The per-screen background hues set on `<body data-screen>` by AppInner.
// Each token pair is declared on the matching `.screen-*` class in index.css.
const SCREEN_BACKGROUNDS: { label: string; cls: string }[] = [
  { label: 'home / settings', cls: 'screen-home' },
  { label: 'profile', cls: 'screen-profile' },
  { label: 'writing', cls: 'screen-writing' },
  { label: 'word-sets', cls: 'screen-wordsets' },
  { label: 'my chars', cls: 'screen-mychars' },
  { label: 'settings', cls: 'screen-settings' },
];

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="sg-section">
      <h2 className="sg-section-title">{title}</h2>
      {desc && <p className="sg-section-desc">{desc}</p>}
      <div className="sg-section-body">{children}</div>
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sg-specimen">
      <div className="sg-specimen-stage">{children}</div>
      <code className="sg-specimen-label">{label}</code>
    </div>
  );
}

export default function Styleguide({ onBack }: { onBack?: () => void }) {
  // When opened via ?ui (no in-app navigator), fall back to history.back().
  const back = onBack ?? (() => window.history.back());
  // Local toggle so the candy press/active states are observable on touch too.
  const [armed, setArmed] = useState(false);

  return (
    // `.app-shell` makes the kit's `.app-shell .ui-*` / `.module-tile` rules
    // apply; `screen-settings` paints the same dotted purple backdrop the rest
    // of the app uses for its settings surface (canonical --screen-bg tokens).
    <div className="app-shell screen-settings sg-page">
      <style>{styleguideCss}</style>

      <BackButton onClick={back} label="← Back" />

      <header className="sg-header">
        <h1 className="sg-title">UI Components</h1>
        <p className="sg-subtitle">
          Living gallery of <code>platform/src/ui</code> — the real shared kit &amp; canonical{' '}
          <code>:root</code> tokens. Rendered, not documented.
        </p>
      </header>

      {/* ── BUTTONS ─────────────────────────────────────────────────────── */}
      <Section
        title="Button"
        desc="The 3D candy button. Three variants share one base; the chunky bottom box-shadow is the pressable lip — :active sinks the face onto it. Hover-lift is pointer-only; reduced-motion neutralizes transforms."
      >
        <div className="sg-row">
          <Specimen label='variant="primary"'>
            <Button variant="primary">Start Practice</Button>
          </Specimen>
          <Specimen label='variant="secondary"'>
            <Button variant="secondary">Maybe Later</Button>
          </Specimen>
          <Specimen label='variant="ghost"'>
            <Button variant="ghost">Skip</Button>
          </Specimen>
        </div>
        <div className="sg-row">
          <Specimen label="primary · disabled">
            <Button variant="primary" disabled>Start Practice</Button>
          </Specimen>
          <Specimen label="secondary · disabled">
            <Button variant="secondary" disabled>Maybe Later</Button>
          </Specimen>
          <Specimen label="ghost · disabled">
            <Button variant="ghost" disabled>Skip</Button>
          </Specimen>
        </div>
        <div className="sg-row">
          <Specimen label="press state (tap to hold armed)">
            <Button
              variant="primary"
              className={armed ? 'sg-armed' : undefined}
              onClick={() => setArmed((a) => !a)}
            >
              {armed ? 'Pressed (lip compressed)' : 'Tap me'}
            </Button>
          </Specimen>
        </div>
      </Section>

      {/* ── CARD ────────────────────────────────────────────────────────── */}
      <Section
        title="Card"
        desc="The shared cream candy panel (the .module-tile look: purple border, 3D drop, cream fill, centered max-width) for use OUTSIDE a full ModuleScreen."
      >
        <Card>
          <h3 style={{ margin: 0 }}>A standalone Card</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Renders the real <code>.module-tile</code> class. Drop any content inside.
          </p>
          <Button variant="primary">Action inside a Card</Button>
        </Card>
      </Section>

      {/* ── BACK BUTTON ─────────────────────────────────────────────────── */}
      <Section
        title="BackButton"
        desc="The shared back pill (.module-back) as a standalone primitive — solid cream-white candy pill, purple border + flat 3D lip. ModuleScreen renders the same pill internally when given onBack."
      >
        <div className="sg-row">
          <Specimen label="default label">
            <BackButton onClick={() => {}} />
          </Specimen>
          <Specimen label="custom label">
            <BackButton onClick={() => {}} label="← 返回" />
          </Specimen>
        </div>
      </Section>

      {/* ── MODULE SCREEN ───────────────────────────────────────────────── */}
      <Section
        title="ModuleScreen"
        desc="The standard module MAIN-screen shell: optional back pill + shared cream card + title, then children. Shown here at reduced scale inside framed stages."
      >
        <div className="sg-frames">
          <Specimen label="title + onBack (default width)">
            <div className="sg-frame">
              <ModuleScreen title="Writing Challenge" onBack={() => {}} backLabel="← Back">
                <p style={{ margin: 0, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Module content goes here.
                </p>
                <Button variant="primary">Start</Button>
              </ModuleScreen>
            </div>
          </Specimen>
          <Specimen label="wide variant + cardClassName, no back">
            <div className="sg-frame">
              <ModuleScreen title="Word Sets" wide cardClassName="sg-demo-grid">
                <Button variant="secondary">Animals</Button>
                <Button variant="secondary">Food</Button>
                <Button variant="secondary">Family</Button>
                <Button variant="secondary">Colors</Button>
              </ModuleScreen>
            </div>
          </Specimen>
        </div>
      </Section>

      {/* ── COLOR TOKENS ────────────────────────────────────────────────── */}
      <Section
        title="Color tokens"
        desc="Canonical :root custom properties from index.css — the single source of truth. Each swatch is painted with its live var(), so it always matches the running theme."
      >
        <div className="sg-swatches">
          {COLOR_TOKENS.map((tok) => (
            <div className="sg-swatch" key={tok.name}>
              <div
                className="sg-swatch-chip"
                style={{
                  background: `var(${tok.name})`,
                  color: tok.dark ? '#fff' : 'var(--text)',
                }}
              >
                <span className="sg-swatch-name">{tok.name}</span>
              </div>
              <span className="sg-swatch-note">{tok.note}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── PER-SCREEN BACKGROUNDS ──────────────────────────────────────── */}
      <Section
        title="Per-screen backgrounds"
        desc="Each app screen sets a saturated --screen-bg / --screen-bg-dark pair (declared on the .screen-* classes). The chips below ARE those classes, so they render the real backdrop gradient."
      >
        <div className="sg-screens">
          {SCREEN_BACKGROUNDS.map((s) => (
            <div className={`sg-screen-chip ${s.cls}`} key={s.cls}>
              <span>{s.label}</span>
              <code>.{s.cls}</code>
            </div>
          ))}
        </div>
      </Section>

      {/* ── SURFACE CLASSES ─────────────────────────────────────────────── */}
      <Section
        title="Surface classes"
        desc="The shared chrome classes used across screens, rendered as their real selectors."
      >
        <div className="sg-row sg-row--wrap">
          <Specimen label=".module-tile (cream panel)">
            <div className="module-tile" style={{ maxWidth: 220, margin: 0 }}>
              <p style={{ margin: 0, textAlign: 'center', fontWeight: 800 }}>.module-tile</p>
            </div>
          </Specimen>
          <Specimen label=".module-back (back pill)">
            <button className="module-back" type="button">← Back</button>
          </Specimen>
        </div>
      </Section>

      {/* ── TYPOGRAPHY ──────────────────────────────────────────────────── */}
      <Section
        title="Typography"
        desc="Display vs body share one canonical family: --font (with --font-display as its alias). Sizes below mirror the real kit/title scale."
      >
        <div className="sg-type">
          <div className="sg-type-row">
            <span className="module-tile-title" style={{ margin: 0 }}>標題 Display 32px</span>
            <code>.module-tile-title · 32px / 900</code>
          </div>
          <div className="sg-type-row">
            <span style={{ fontFamily: 'var(--font)', fontWeight: 900, fontSize: 17 }}>
              Button label 17px
            </span>
            <code>.ui-btn · 17px / 900</code>
          </div>
          <div className="sg-type-row">
            <span style={{ fontFamily: 'var(--font)', fontWeight: 800, fontSize: 15 }}>
              Back pill 15px
            </span>
            <code>.module-back · 15px / 800</code>
          </div>
          <div className="sg-type-row">
            <span style={{ fontFamily: 'var(--font)', fontSize: 16, color: 'var(--text)' }}>
              Body text 16px — the quick brown 狐狸 jumps.
            </span>
            <code>body · var(--font)</code>
          </div>
          <div className="sg-type-row">
            <span style={{ fontFamily: 'var(--font)', fontSize: 14, color: 'var(--text-muted)' }}>
              Muted hint 14px
            </span>
            <code>color: var(--text-muted)</code>
          </div>
        </div>
        <p className="sg-mono-note">
          Family: <code>var(--font)</code> = "SF Pro Rounded", "Nunito", system-ui, …
        </p>
      </Section>

      <footer className="sg-footer">
        Source: <code>platform/src/ui</code> · tokens: <code>platform/src/index.css :root</code>
      </footer>
    </div>
  );
}

/* Page-only layout. Uses ONLY canonical tokens (no new palette). Scoped under
   `.sg-page` so it can't leak. Respects prefers-reduced-motion via the kit. */
const styleguideCss = `
.sg-page {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 16px calc(60px + env(safe-area-inset-bottom, 0px));
}
.sg-header { margin: 8px 0 28px; }
.sg-title {
  margin: 0;
  font-family: var(--font);
  font-size: 34px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 0 rgba(0,0,0,0.25);
}
.sg-subtitle {
  margin: 8px 0 0;
  font-family: var(--font);
  font-size: 15px;
  color: rgba(255,255,255,0.88);
  line-height: 1.5;
}
.sg-page code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}
.sg-section {
  background: var(--bg-raised);
  border: 3px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 0 var(--border);
  padding: 22px 20px;
  margin: 0 0 26px;
}
.sg-section-title {
  margin: 0;
  font-family: var(--font);
  font-size: 22px;
  font-weight: 900;
  color: var(--text);
}
.sg-section-desc {
  margin: 8px 0 0;
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-muted);
}
.sg-section-body { margin-top: 18px; }
.sg-row {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: flex-start;
}
.sg-row + .sg-row { margin-top: 18px; }
.sg-row--wrap { align-items: stretch; }
.sg-specimen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.sg-specimen-stage {
  display: flex;
  align-items: center;
  justify-content: center;
}
.sg-specimen-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}
/* Hold the armed demo button in its pressed pose for touch users. */
.sg-page .ui-btn.sg-armed {
  transform: translateY(4px);
  box-shadow: 0 1px 0 var(--gold-dark);
}
.sg-frames {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}
.sg-frame {
  flex: 1 1 280px;
  background:
    radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px) 0 0 / 22px 22px,
    var(--screen-bg-dark, #2C2150);
  border-radius: var(--radius);
  padding: 14px 4px;
  overflow: hidden;
}
.sg-demo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.sg-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}
.sg-swatch { display: flex; flex-direction: column; gap: 6px; }
.sg-swatch-chip {
  height: 64px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--border);
  display: flex;
  align-items: flex-end;
  padding: 8px;
}
.sg-swatch-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 700;
}
.sg-swatch-note {
  font-family: var(--font);
  font-size: 12px;
  color: var(--text-muted);
}
.sg-screens {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}
.sg-screen-chip {
  min-height: 84px;
  border-radius: var(--radius-sm);
  border: 2px solid rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 2px;
  padding: 10px;
  color: #fff;
  font-family: var(--font);
  font-weight: 800;
  text-shadow: 0 1px 2px rgba(0,0,0,0.4);
}
.sg-screen-chip code {
  font-weight: 600;
  font-size: 11px;
  opacity: 0.9;
}
.sg-type { display: flex; flex-direction: column; gap: 14px; }
.sg-type-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px dashed var(--bg-raised-2);
  padding-bottom: 12px;
}
.sg-type-row code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--text-muted);
}
.sg-mono-note {
  margin: 14px 0 0;
  font-family: var(--font);
  font-size: 13px;
  color: var(--text-muted);
}
.sg-footer {
  margin-top: 8px;
  text-align: center;
  font-family: var(--font);
  font-size: 13px;
  color: rgba(255,255,255,0.85);
}
`;
