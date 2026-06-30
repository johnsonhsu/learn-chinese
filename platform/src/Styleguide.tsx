import { useState, useEffect, type ReactNode } from 'react';
import { Button, Card, BackButton, ModuleScreen, CharTile } from './ui/index.ts';
import { THEMES, DEFAULT_THEME_ID, ROOT_THEME_ID } from './theme/themes.ts';
// Import the writing-challenge module's REAL stylesheet so the char-box / track
// specimens render with the exact production CSS — including its editorial
// override cascade (the `.char-box` block at ~995 that beats the candy block at
// ~538 by source order). Hand-copying that drifted once; this can't. Only this
// dev `?ui` route loads it, and its other `.sp-*` rules are inert here (no
// module mounted, no elements with those classes).
import '../../modules/writing-challenge/src/App.css';

/**
 * Living styleguide / component gallery / THEME INSPECTOR.
 *
 * A REAL, rendered page (not a doc) that imports the ACTUAL shared UI kit
 * (`./ui/index.ts`) and references the REAL canonical design tokens (the
 * `:root` custom properties in `index.css`) plus the shared classes
 * (`.module-tile`, `.char-tile`, the writing-challenge `.char-box*` states).
 * Because it composes the live primitives + the live tokens, it stays accurate
 * as the kit evolves AND it re-skins with whatever theme is selected — so every
 * theme can be inspected surface-by-surface from one page.
 *
 * The whole page is wrapped in `.app-shell` so the kit's stylesheet
 * (ui-kit.css, all selectors prefixed `.app-shell`) actually applies — exactly
 * as it does when a module renders inside ActiveModuleView's `.app-shell`.
 *
 * THEME PREVIEW: the bar at the top writes `body[data-theme]` directly so the
 * whole page re-skins live. It is a PREVIEW only — nothing is persisted (no
 * theme-store / localStorage writes), and the app's real effective theme is
 * captured on mount and restored on unmount, so leaving the page reverts.
 *
 * Reachable two ways (see App.tsx): a top-level `?ui` query-param route
 * (mirrors the `?landing`/`?app` pattern) and a "UI Components" link in Device
 * Settings → Advanced. Demo content uses plain English labels (this is a dev
 * reference); the persistent nav label that opens it is routed through i18n.
 */

// The canonical color tokens worth eyeballing as swatches. Names are the REAL
// `:root` custom properties from index.css — we read them live via var(), so
// each swatch shows the ACTIVE theme's resolved value.
const COLOR_TOKENS: { name: string; note: string; dark?: boolean }[] = [
  { name: '--bg', note: 'app canvas / paper field' },
  { name: '--bg-raised', note: 'panel interior' },
  { name: '--bg-raised-2', note: 'sunken fill (done tile)' },
  { name: '--bg-input', note: 'input fill' },
  { name: '--border', note: 'hairline border' },
  { name: '--border-hover', note: 'hover border', dark: true },
  { name: '--gold', note: 'primary CTA face', dark: true },
  { name: '--gold-dark', note: 'primary CTA lip', dark: true },
  { name: '--teal', note: 'celadon — writing', dark: true },
  { name: '--pink', note: 'clay-rose — word-sets', dark: true },
  { name: '--orange', note: 'ochre — copybook', dark: true },
  { name: '--blue', note: 'indigo — practice EN', dark: true },
  { name: '--text', note: 'body text', dark: true },
  { name: '--text-muted', note: 'muted text', dark: true },
  { name: '--text-dim', note: 'dim text' },
];

// The SEMANTIC / STATE colors — the "color logic". These are what give the
// writing-challenge char track and the char tiles their meaning, and they are
// the tokens most likely to drift per-theme (a theme that remaps the ink/seal
// palette but doesn't re-anchor these inherits the wrong hue). Inspect these
// across themes. `--grad-primary` may resolve to a gradient — the chip paints it.
const SEMANTIC_TOKENS: { name: string; note: string; dark?: boolean }[] = [
  { name: '--ink', note: 'current pill fill · upcoming text', dark: true },
  { name: '--paper-raised', note: 'upcoming pill fill' },
  { name: '--rule-strong', note: 'upcoming pill border' },
  { name: '--bg-raised-2', note: 'done pill (sunken)' },
  { name: '--seal', note: 'theme accent (landing stat / outline) — NOT the above-level pill', dark: true },
  { name: '--seal-wash', note: 'theme accent wash' },
  { name: '--seal-deep', note: 'theme accent (deep)', dark: true },
  { name: '--success', note: 'pass · mastery≥80 · target', dark: true },
  { name: '--warning', note: 'warn · mastery≥50', dark: true },
  { name: '--error', note: 'fail · stroke-result incorrect · above-level / auto-skip (true red, all share it)', dark: true },
  { name: '--text-dim', note: 'user-skipped text' },
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

function Swatches({ tokens }: { tokens: { name: string; note: string; dark?: boolean }[] }) {
  return (
    <div className="sg-swatches">
      {tokens.map((tok) => (
        <div className="sg-swatch" key={tok.name}>
          <div
            className="sg-swatch-chip"
            style={{ background: `var(${tok.name})`, color: tok.dark ? '#fff' : 'var(--text)' }}
          >
            <span className="sg-swatch-name">{tok.name}</span>
          </div>
          <span className="sg-swatch-note">{tok.note}</span>
        </div>
      ))}
    </div>
  );
}

export default function Styleguide() {
  // Local toggle so the candy press/active states are observable on touch too.
  const [armed, setArmed] = useState(false);

  // Controlled text for the input specimens so legibility (typed text vs fill)
  // is inspectable per-theme — the regression in #38 was light-text-on-white.
  const [demoName, setDemoName] = useState('小明');
  const [demoAge, setDemoAge] = useState('7');
  const [demoProfile, setDemoProfile] = useState('新使用者');
  const [demoSettingsName, setDemoSettingsName] = useState('顯示名稱');
  const [demoKey, setDemoKey] = useState('');

  // THEME PREVIEW — drive body[data-theme] directly. Open on the app's DEFAULT
  // selection (Indigo) so the inspector reflects what new users actually see;
  // capture the real attribute on mount and restore it on unmount so previewing
  // never leaks into the user's saved theme.
  const [theme, setTheme] = useState<string>(DEFAULT_THEME_ID);
  useEffect(() => {
    const original = document.body.getAttribute('data-theme');
    if (DEFAULT_THEME_ID === ROOT_THEME_ID) document.body.removeAttribute('data-theme');
    else document.body.setAttribute('data-theme', DEFAULT_THEME_ID);
    return () => {
      if (original) document.body.setAttribute('data-theme', original);
      else document.body.removeAttribute('data-theme');
    };
  }, []);
  const applyTheme = (id: string) => {
    setTheme(id);
    // ROOT theme (Paper) is the no-attribute :root look; everything else sets it.
    if (id === ROOT_THEME_ID) document.body.removeAttribute('data-theme');
    else document.body.setAttribute('data-theme', id);
  };

  // CHAR-TILE SCREEN CONTEXT — char-tiles intensify (gold/silver faces, filled
  // level badge, brighter glyph) ONLY on the My-Characters screen, because every
  // theme gates that look behind `body[data-screen="mychars"]`. Off that screen
  // (writing's Next-up, word-set chips) they use the quieter base look. Mirror
  // the real body attribute here so the specimens match the device exactly;
  // restore whatever it was on unmount.
  const [tileCtx, setTileCtx] = useState<'mychars' | 'other'>('mychars');
  useEffect(() => {
    const original = document.body.dataset.screen;
    document.body.dataset.screen = tileCtx === 'mychars' ? 'mychars' : 'home';
    return () => {
      if (original) document.body.dataset.screen = original;
      else delete document.body.dataset.screen;
    };
  }, [tileCtx]);

  return (
    // `.app-shell` makes the kit's `.app-shell .ui-*` / `.module-tile` /
    // `.char-tile` rules apply; `screen-settings` paints the same backdrop the
    // rest of the app uses for its settings surface (canonical --screen-bg).
    <div className="app-shell screen-settings sg-page">
      <style>{styleguideCss}</style>

      {/* THEME SWITCHER — fixed dark chrome (does NOT itself re-theme, so it
          stays legible on every theme's backdrop). The specimens below DO. */}
      <div className="sg-themebar" role="group" aria-label="Preview theme">
        <span className="sg-themebar-title">Theme</span>
        <div className="sg-themebar-btns">
          {THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              className={`sg-theme-btn${theme === th.id ? ' is-active' : ''}`}
              aria-pressed={theme === th.id}
              onClick={() => applyTheme(th.id)}
            >
              {th.name}
              {th.premium && <span className="sg-theme-prem" aria-label="premium">★</span>}
            </button>
          ))}
        </div>
        <span className="sg-themebar-note">Preview only — your saved theme is unchanged</span>
      </div>

      <header className="sg-header">
        <h1 className="sg-title">UI Components</h1>
        <p className="sg-subtitle">
          Living gallery of <code>platform/src/ui</code> + the canonical <code>:root</code> tokens —
          rendered, not documented. Flip the theme above to inspect every surface.
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

      {/* ── TEXT INPUTS ─────────────────────────────────────────────────── */}
      <Section
        title="Text input"
        desc="Typed text and the input fill must always move together with the theme — both read theme tokens (background: var(--bg-input); color: var(--text)). The onboarding/welcome name + age fields use .welcome-popup-input; the profile-switcher 'new profile' field is .user-create input; the Settings display-name + Gemini-key fields are .settings-name-row input; the shared kit uses .fb-* (.fb-select/.fb-textarea). Type here and switch themes: text stays legible on every theme (Paper white, Indigo navy, gold/silver dark) — no light-on-light or dark-on-dark. This specimen exists so the #38 invisibility class of bug is catchable from the inspector — the first pass missed .user-create/.settings-name-row because a later hardcoded background:#fff rule overrode their token fill."
      >
        <div className="sg-row sg-row--wrap">
          <Specimen label=".welcome-popup-input (profile name)">
            <div className="welcome-popup-field">
              <label className="welcome-popup-label" htmlFor="sg-name">Your name</label>
              <input
                id="sg-name"
                className="welcome-popup-input"
                type="text"
                value={demoName}
                onChange={(e) => setDemoName(e.target.value)}
                placeholder="Type a name…"
              />
            </div>
          </Specimen>
          <Specimen label=".welcome-popup-input (native-speaker age)">
            <div className="welcome-popup-field">
              <label className="welcome-popup-label" htmlFor="sg-age">Age</label>
              <input
                id="sg-age"
                className="welcome-popup-input"
                type="number"
                inputMode="numeric"
                value={demoAge}
                onChange={(e) => setDemoAge(e.target.value)}
                placeholder="Age"
              />
            </div>
          </Specimen>
          <Specimen label=".user-create input (new-profile name)">
            <div className="user-create">
              <input
                type="text"
                value={demoProfile}
                onChange={(e) => setDemoProfile(e.target.value)}
                placeholder="Add a profile…"
              />
              <button type="button">Create</button>
            </div>
          </Specimen>
          <Specimen label=".settings-name-row input (Settings display name)">
            <div className="settings-name-row">
              <input
                type="text"
                value={demoSettingsName}
                onChange={(e) => setDemoSettingsName(e.target.value)}
                placeholder="Display name…"
              />
            </div>
          </Specimen>
          <Specimen label=".settings-name-row input (Settings Gemini key)">
            <div className="settings-name-row">
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={demoKey}
                onChange={(e) => setDemoKey(e.target.value)}
                placeholder="AIza…"
              />
              <button type="button" className="lever-pill" style={{ flex: '0 0 auto' }}>Test</button>
            </div>
          </Specimen>
          <Specimen label=".fb-textarea (shared kit pattern)">
            <textarea
              className="fb-textarea"
              defaultValue="The quick brown fox"
              placeholder="Shared-kit field…"
            />
          </Specimen>
        </div>
      </Section>

      {/* ── CHARACTER TILES ─────────────────────────────────────────────── */}
      <Section
        title="Character tile (CharTile)"
        desc="The ONE shared per-character tile. On the My Characters screen it intensifies — gold/silver faces, filled level badge, brighter glyph — while off it (Next-up, word-set chips) it stays quieter. Use the Screen toggle to compare; both match the device. Recent-result dots and the known-face tint read theme tokens. NOTE: the mastery-bar fill is hardcoded hex in CharTile.tsx (masteryFillColor) — it does NOT follow a theme."
      >
        <div className="sg-ctx" role="group" aria-label="Char-tile screen context">
          <span className="sg-ctx-label">Screen</span>
          <button
            type="button"
            className={`sg-ctx-btn${tileCtx === 'mychars' ? ' is-active' : ''}`}
            onClick={() => setTileCtx('mychars')}
          >
            My Characters
          </button>
          <button
            type="button"
            className={`sg-ctx-btn${tileCtx === 'other' ? ' is-active' : ''}`}
            onClick={() => setTileCtx('other')}
          >
            Next-up / chips
          </button>
        </div>
        <div className="sg-tilegrid">
          <Specimen label="lg · ribbon below · 85%">
            <CharTile char="字" rank={42} level="1" mastery={85} recent={['P', 'P', 'C']} ribbon="below" />
          </Specimen>
          <Specimen label="lg · ribbon target · 55%">
            <CharTile char="學" rank={318} level="2" mastery={55} recent={['C', 'I', 'C']} ribbon="target" />
          </Specimen>
          <Specimen label="lg · ribbon above · 20%">
            <CharTile char="鬱" rank={1119} level="4*" mastery={20} recent={['I', 'S', 'I']} ribbon="above" />
          </Specimen>
          <Specimen label="lg · known (success face)">
            <CharTile char="我" rank={8} level="1" mastery={100} recent={['P', 'P', 'P']} ribbon="target" known />
          </Specimen>
          <Specimen label="lg · fresh (0%, no dots)">
            <CharTile char="龜" rank={2750} level="5" mastery={0} ribbon="above" />
          </Specimen>
          <Specimen label="sm · Next-up chip">
            <CharTile char="們" rank={56} level="1" size="sm" />
          </Specimen>
        </div>
        <p className="sg-mono-note">
          Result dots, in order: <code>P</code> perfect · <code>C</code> correct · <code>I</code> incorrect ·{' '}
          <code>S</code> skipped.
        </p>
      </Section>

      {/* ── WRITING-CHALLENGE CHARACTER TRACK ───────────────────────────── */}
      <Section
        title="Writing-challenge character track"
        desc="The sentence shown as a scroll of SEMANTIC state pills — current, upcoming, done, above-level / auto-skip, user-skipped. Rendered with the writing-challenge module's REAL stylesheet (imported), so what you see here is exactly what the live module renders under each theme."
      >
        {/* Realistic row, as it appears mid-sentence. */}
        <div className="sg-track-surface">
          <div className="sp-char-scroll">
            <span className="char-box char-box-active">ㄨㄛˇ</span>
            <span className="char-box">們</span>
            <span className="char-box">全</span>
            <span className="char-box">家</span>
            <span className="char-box char-box-done">人</span>
            <span className="char-box char-box-above">預</span>
          </div>
        </div>

        {/* Each state, labelled, on the themed module surface. */}
        <div className="sg-track-surface sg-track-legend">
          <div className="sg-legend-item">
            <span className="char-box char-box-active">ㄨㄛˇ</span>
            <code>current · .char-box-active</code>
          </div>
          <div className="sg-legend-item">
            <span className="char-box">們</span>
            <code>upcoming · .char-box</code>
          </div>
          <div className="sg-legend-item">
            <span className="char-box char-box-done">家</span>
            <code>done · .char-box-done</code>
          </div>
          <div className="sg-legend-item">
            <span className="char-box char-box-above">預</span>
            <code>above-level / auto-skip (= fail red) · .char-box-above</code>
          </div>
          <div className="sg-legend-item">
            <span className="char-box char-box-skipped">計</span>
            <code>user-skipped · .char-box-skipped</code>
          </div>
        </div>

        <h3 className="sg-subhead">Stroke-result states (practice-done tiles)</h3>
        <div className="sg-track-surface sg-track-legend">
          <div className="sg-legend-item">
            <span className="char-box char-box-pass">字</span>
            <code>pass · .char-box-pass</code>
          </div>
          <div className="sg-legend-item">
            <span className="char-box char-box-warn">字</span>
            <code>warn · .char-box-warn</code>
          </div>
          <div className="sg-legend-item">
            <span className="char-box char-box-fail">字</span>
            <code>fail · .char-box-fail</code>
          </div>
        </div>
        {/* Live combos: a COMPLETED char in the track carries BOTH .char-box-done AND
            the result class (e.g. `char-box-done char-box-fail`). These tiles reproduce
            exactly what the live track renders, and verify the result colour wins over
            the grey done style — a completed-incorrect char must read RED. The
            above-level pill uses the SAME --error red (it IS a fail/negative state), so
            it sits here as the matching red, not a contrast. */}
        <h3 className="sg-subhead">Completed-char result combos (live track)</h3>
        <div className="sg-track-surface sg-track-legend">
          <div className="sg-legend-item">
            <span className="char-box char-box-done char-box-pass">字</span>
            <code>done perfect · .char-box-done.char-box-pass</code>
          </div>
          <div className="sg-legend-item">
            <span className="char-box char-box-done char-box-warn">字</span>
            <code>done correct · .char-box-done.char-box-warn</code>
          </div>
          <div className="sg-legend-item">
            <span className="char-box char-box-done char-box-fail">字</span>
            <code>done incorrect · .char-box-done.char-box-fail</code>
          </div>
          <div className="sg-legend-item">
            <span className="char-box char-box-above">預</span>
            <code>above-level / auto-skip (= fail) · .char-box-above</code>
          </div>
        </div>
      </Section>

      {/* ── CARD ────────────────────────────────────────────────────────── */}
      <Section
        title="Card"
        desc="The shared cream candy panel (the .module-tile look) for use OUTSIDE a full ModuleScreen."
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
        desc="The shared back pill (.module-back) as a standalone primitive. ModuleScreen renders the same pill internally when given onBack."
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
        desc="The standard module MAIN-screen shell: optional back pill + shared card + title, then children. Shown here at reduced scale inside framed stages."
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
        desc="Canonical :root custom properties from index.css. Each swatch is painted with its live var(), so it always matches the SELECTED theme above."
      >
        <Swatches tokens={COLOR_TOKENS} />
      </Section>

      {/* ── SEMANTIC / STATE COLORS ─────────────────────────────────────── */}
      <Section
        title="Semantic & state colors"
        desc="The tokens the writing-challenge char track + tiles actually read. The track is built from the ink / paper / seal palette — so a theme that remaps those (e.g. Midnight) re-skins every state automatically. Compare across themes to see each state's resolved color."
      >
        <Swatches tokens={SEMANTIC_TOKENS} />
      </Section>

      {/* ── PER-SCREEN BACKGROUNDS ──────────────────────────────────────── */}
      <Section
        title="Per-screen backgrounds"
        desc="Each app screen sets a --screen-bg / --screen-bg-dark pair (declared on the .screen-* classes). The chips below ARE those classes, so they render the real backdrop."
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
        Source: <code>platform/src/ui</code> · tokens: <code>platform/src/index.css :root</code> ·
        char track: <code>modules/writing-challenge/src/App.css</code>
      </footer>
    </div>
  );
}

/* Page-only layout. Uses ONLY canonical tokens (no new palette) EXCEPT the
   fixed-dark theme switcher chrome (intentionally theme-independent so it stays
   legible on every backdrop). Scoped under `.sg-page` so nothing leaks. The
   `.char-box*` + `.sp-char-scroll` styles are NOT here — they come from the real
   module stylesheet imported at the top of this file, so they stay in sync. */
const styleguideCss = `
.sg-page {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 16px calc(60px + env(safe-area-inset-bottom, 0px));
}

/* — Theme switcher (fixed dark chrome) — */
.sg-themebar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin: 0 -16px 22px;
  padding: 11px 16px;
  background: #20242e;
  border-bottom: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 6px 18px -10px rgba(0,0,0,0.6);
}
.sg-themebar-title {
  font-family: var(--font); font-weight: 900; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.65);
}
.sg-themebar-btns { display: flex; flex-wrap: wrap; gap: 7px; }
.sg-theme-btn {
  font-family: var(--font); font-size: 14px; font-weight: 800; color: #fff;
  cursor: pointer; padding: 7px 13px; border-radius: 999px;
  border: 1.5px solid rgba(255,255,255,0.26);
  background: rgba(255,255,255,0.08);
  display: inline-flex; align-items: center; gap: 5px;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
}
.sg-theme-btn:active { transform: translateY(1px); }
.sg-theme-btn.is-active { background: #fff; color: #1a1d24; border-color: #fff; }
.sg-theme-prem { font-size: 11px; color: #E8C940; line-height: 1; }
.sg-theme-btn.is-active .sg-theme-prem { color: #B58A00; }
.sg-themebar-note {
  font-family: var(--font); font-size: 12px; color: rgba(255,255,255,0.55);
  margin-left: auto;
}
@media (max-width: 600px) { .sg-themebar-note { display: none; } }

.sg-header { margin: 8px 0 28px; }
.sg-title {
  margin: 0; font-family: var(--font); font-size: 34px; font-weight: 900;
  color: var(--text); letter-spacing: 0.5px;
}
.sg-subtitle {
  margin: 8px 0 0; font-family: var(--font); font-size: 15px;
  color: var(--text-muted); line-height: 1.5;
}
.sg-page code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
.sg-section {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 22px 20px;
  margin: 0 0 26px;
}
.sg-section-title { margin: 0; font-family: var(--font); font-size: 22px; font-weight: 900; color: var(--text); }
.sg-section-desc { margin: 8px 0 0; font-family: var(--font); font-size: 14px; line-height: 1.5; color: var(--text-muted); }
.sg-section-body { margin-top: 18px; }
.sg-subhead {
  margin: 22px 0 12px; font-family: var(--font); font-size: 14px; font-weight: 800;
  letter-spacing: 0.04em; color: var(--text-muted);
}
.sg-row { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
.sg-row + .sg-row { margin-top: 18px; }
.sg-row--wrap { align-items: stretch; }
.sg-specimen { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.sg-specimen-stage { display: flex; align-items: center; justify-content: center; }
.sg-specimen-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text-muted); text-align: center; }
.sg-page .ui-btn.sg-armed { transform: translateY(4px); box-shadow: 0 1px 0 var(--gold-dark); }
.sg-ctx { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.sg-ctx-label { font-family: var(--font); font-weight: 800; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.sg-ctx-btn {
  font-family: var(--font); font-size: 13px; font-weight: 800; cursor: pointer;
  padding: 5px 11px; border-radius: 999px; border: 1.5px solid var(--border);
  background: var(--bg-raised); color: var(--text);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.sg-ctx-btn.is-active { background: var(--text); color: var(--bg-raised); border-color: var(--text); }
.sg-tilegrid { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
.sg-frames { display: flex; flex-wrap: wrap; gap: 18px; }
.sg-frame {
  flex: 1 1 280px;
  background:
    radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px) 0 0 / 22px 22px,
    var(--screen-bg-dark, #2C2150);
  border-radius: var(--radius); padding: 14px 4px; overflow: hidden;
}
.sg-demo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* — Writing-challenge track surface (the .char-box pills themselves come from
   the imported module stylesheet, not from here) — */
.sg-track-surface {
  background: var(--screen-bg, var(--bg-raised-2));
  border: 1px solid var(--tile-edge);
  border-radius: var(--radius-lg);
  margin-bottom: 14px;
  overflow: hidden;
}
.sg-track-legend { display: flex; flex-wrap: wrap; gap: 18px; padding: 16px; }
.sg-legend-item { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 150px; }
.sg-legend-item code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
  color: var(--text-muted); text-align: center;
}
/* NOTE: .char-box*, .char-box-active/-done/-above/-skipped/-pass/-warn/-fail and
   .sp-char-scroll are intentionally NOT defined here — they come from the imported
   real module stylesheet (top of file), so this inspector renders the production
   cascade exactly and stays in sync automatically. */

.sg-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
.sg-swatch { display: flex; flex-direction: column; gap: 6px; }
.sg-swatch-chip {
  height: 64px; border-radius: var(--radius-sm); border: 1px solid var(--border);
  display: flex; align-items: flex-end; padding: 8px;
}
.sg-swatch-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 700; }
.sg-swatch-note { font-family: var(--font); font-size: 12px; color: var(--text-muted); }
.sg-screens { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
.sg-screen-chip {
  min-height: 84px; border-radius: var(--radius-sm); border: 1px solid rgba(0,0,0,0.18);
  display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end;
  gap: 2px; padding: 10px; color: #fff; font-family: var(--font); font-weight: 800;
  text-shadow: 0 1px 2px rgba(0,0,0,0.4);
}
.sg-screen-chip code { font-weight: 600; font-size: 11px; opacity: 0.9; }
.sg-type { display: flex; flex-direction: column; gap: 14px; }
.sg-type-row {
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: 8px; border-bottom: 1px dashed var(--bg-raised-2); padding-bottom: 12px;
}
.sg-type-row code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text-muted); }
.sg-mono-note { margin: 14px 0 0; font-family: var(--font); font-size: 13px; color: var(--text-muted); }
.sg-footer { margin-top: 8px; text-align: center; font-family: var(--font); font-size: 13px; color: var(--text-muted); }
`;
