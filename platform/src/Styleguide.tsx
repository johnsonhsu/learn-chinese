import { useState, useEffect, useContext, type ReactNode } from "react";
import { Button, Card, BackButton, ModuleScreen, CharTile } from "./ui/index.ts";
import { THEMES, DEFAULT_THEME_ID, ROOT_THEME_ID } from "./theme/themes.ts";
import { LanguageContext, t } from "./i18n/index.ts";
import type { Language } from "./i18n/index.ts";
// Import the writing-challenge module's REAL stylesheet so the char-box / track
// specimens render with the exact production CSS — including its editorial
// override cascade (the `.char-box` block at ~995 that beats the candy block at
// ~538 by source order). Hand-copying that drifted once; this can't. Only this
// dev `?ui` route loads it, and its other `.sp-*` rules are inert here (no
// module mounted, no elements with those classes).
import "../../modules/writing-challenge/src/App.css";

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
 * LANGUAGE TOGGLE: the local language toggle lets reviewers switch the styleguide
 * text/examples between English and Chinese without changing the global app
 * language. Reachable at /?ui (dev-only).
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
  { name: "--bg", note: "app canvas / paper field" },
  { name: "--bg-raised", note: "panel interior" },
  { name: "--bg-raised-2", note: "sunken fill (done tile)" },
  { name: "--bg-input", note: "input fill" },
  { name: "--border", note: "hairline border" },
  { name: "--border-hover", note: "hover border", dark: true },
  { name: "--gold", note: "primary CTA face", dark: true },
  { name: "--gold-dark", note: "primary CTA lip", dark: true },
  { name: "--teal", note: "celadon — writing", dark: true },
  { name: "--pink", note: "clay-rose — word-sets", dark: true },
  { name: "--orange", note: "ochre — copybook", dark: true },
  { name: "--blue", note: "indigo — practice EN", dark: true },
  { name: "--text", note: "body text", dark: true },
  { name: "--text-muted", note: "muted text", dark: true },
  { name: "--text-dim", note: "dim text" },
];

// The SEMANTIC / STATE colors — the "color logic". These are what give the
// writing-challenge char track and the char tiles their meaning, and they are
// the tokens most likely to drift per-theme (a theme that remaps the ink/seal
// palette but doesn't re-anchor these inherits the wrong hue). Inspect these
// across themes. `--grad-primary` may resolve to a gradient — the chip paints it.
const SEMANTIC_TOKENS: { name: string; note: string; dark?: boolean }[] = [
  { name: "--ink", note: "current pill fill · upcoming text", dark: true },
  { name: "--paper-raised", note: "upcoming pill fill" },
  { name: "--rule-strong", note: "upcoming pill border" },
  { name: "--bg-raised-2", note: "done pill (sunken)" },
  {
    name: "--seal",
    note: "theme accent (landing stat / outline) — NOT the above-level pill",
    dark: true,
  },
  { name: "--seal-wash", note: "theme accent wash" },
  { name: "--seal-deep", note: "theme accent (deep)", dark: true },
  { name: "--success", note: "pass · mastery≥80 · target", dark: true },
  { name: "--warning", note: "warn · mastery≥50", dark: true },
  {
    name: "--error",
    note: "fail · stroke-result incorrect · above-level / auto-skip (true red, all share it)",
    dark: true,
  },
  { name: "--text-dim", note: "user-skipped text" },
];

// The per-screen background hues set on `<body data-screen>` by AppInner.
// Each token pair is declared on the matching `.screen-*` class in index.css.
const SCREEN_BACKGROUNDS: { label: string; cls: string }[] = [
  { label: "home / settings", cls: "screen-home" },
  { label: "profile", cls: "screen-profile" },
  { label: "writing", cls: "screen-writing" },
  { label: "word-sets", cls: "screen-wordsets" },
  { label: "my chars", cls: "screen-mychars" },
  { label: "settings", cls: "screen-settings" },
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
            style={{ background: `var(${tok.name})`, color: tok.dark ? "#fff" : "var(--text)" }}
          >
            <span className="sg-swatch-name">{tok.name}</span>
          </div>
          <span className="sg-swatch-note">{tok.note}</span>
        </div>
      ))}
    </div>
  );
}

type StyleguideKey =
  | "styleguide.themeLabel"
  | "styleguide.themeNote"
  | "styleguide.title"
  | "styleguide.subtitle"
  | "styleguide.section.button.title"
  | "styleguide.section.button.desc"
  | "styleguide.section.textInput.title"
  | "styleguide.section.textInput.desc"
  | "styleguide.section.charTile.title"
  | "styleguide.section.charTile.desc"
  | "styleguide.section.charTile.screenMyCharacters"
  | "styleguide.section.charTile.screenOther"
  | "styleguide.section.writingTrack.title"
  | "styleguide.section.writingTrack.desc"
  | "styleguide.section.card.title"
  | "styleguide.section.card.desc"
  | "styleguide.section.backButton.title"
  | "styleguide.section.backButton.desc"
  | "styleguide.section.moduleScreen.title"
  | "styleguide.section.moduleScreen.desc"
  | "styleguide.section.colorTokens.title"
  | "styleguide.section.colorTokens.desc"
  | "styleguide.section.semanticColors.title"
  | "styleguide.section.semanticColors.desc"
  | "styleguide.section.screenBackgrounds.title"
  | "styleguide.section.screenBackgrounds.desc"
  | "styleguide.section.surfaces.title"
  | "styleguide.section.surfaces.desc"
  | "styleguide.section.typography.title"
  | "styleguide.section.typography.desc"
  | "styleguide.footer";

export default function Styleguide() {
  // Local language toggle: keep the Styleguide copy/examples switchable without
  // mutating the app-wide `LanguageContext` language preference.
  const appLang = useContext(LanguageContext);
  const [lang, setLang] = useState<Language>(appLang);
  const tc = (key: StyleguideKey) => t(key, lang);

  const switchLang = (next: Language) => {
    setLang(next);
    setDemoName(next === "en" ? "Ming" : "小明");
    setDemoProfile(next === "en" ? "New user" : "新使用者");
    setDemoSettingsName(next === "en" ? "Display name" : "顯示名稱");
  };

  // Local toggle so the candy press/active states are observable on touch too.
  const [armed, setArmed] = useState(false);

  // Controlled text for the input specimens so legibility (typed text vs fill)
  // is inspectable per-theme — the regression in #38 was light-text-on-white.
  const [demoName, setDemoName] = useState(lang === "en" ? "Ming" : "小明");
  const [demoAge, setDemoAge] = useState("7");
  const [demoProfile, setDemoProfile] = useState(lang === "en" ? "New user" : "新使用者");
  const [demoSettingsName, setDemoSettingsName] = useState(
    lang === "en" ? "Display name" : "顯示名稱",
  );
  const [demoKey, setDemoKey] = useState("");

  // THEME PREVIEW — drive body[data-theme] directly. Open on the app's DEFAULT
  // selection (Indigo) so the inspector reflects what new users actually see;
  // capture the real attribute on mount and restore it on unmount so previewing
  // never leaks into the user's saved theme.
  const [theme, setTheme] = useState<string>(DEFAULT_THEME_ID);
  useEffect(() => {
    const original = document.body.getAttribute("data-theme");
    if (DEFAULT_THEME_ID === ROOT_THEME_ID) document.body.removeAttribute("data-theme");
    else document.body.setAttribute("data-theme", DEFAULT_THEME_ID);
    return () => {
      if (original) document.body.setAttribute("data-theme", original);
      else document.body.removeAttribute("data-theme");
    };
  }, []);
  const applyTheme = (id: string) => {
    setTheme(id);
    if (id === ROOT_THEME_ID) document.body.removeAttribute("data-theme");
    else document.body.setAttribute("data-theme", id);
  };

  // CHAR-TILE SCREEN CONTEXT — char-tiles intensify (gold/silver faces, filled
  // the real body attribute here so the specimens match the device exactly;
  // restore whatever it was on unmount.
  const [tileCtx, setTileCtx] = useState<"mychars" | "other">("mychars");
  useEffect(() => {
    const original = document.body.dataset.screen;
    document.body.dataset.screen = tileCtx === "mychars" ? "mychars" : "home";
    return () => {
      if (original) document.body.dataset.screen = original;
      else delete document.body.dataset.screen;
    };
  }, [tileCtx]);

  return (
    // `.app-shell` makes the kit's `.app-shell .ui-*` / `.module-tile` /
    // `.char-tile` rules apply; `screen-settings` paints the same backdrop the
    // rest of the app uses for its settings surface (canonical --screen-bg).
    <LanguageContext.Provider value={lang}>
      <div className="app-shell screen-settings sg-page">
        <style>{styleguideCss}</style>
        {/* THEME / LANGUAGE SWITCHER — fixed dark chrome (does NOT itself re-theme, so it
            stays legible on every theme's backdrop). The specimens below DO. */}

        <div className="sg-themebar" role="group" aria-label={tc("styleguide.themeLabel")}>
          <span className="sg-themebar-title">{tc("styleguide.themeLabel")}</span>
          <div className="sg-themebar-btns">
            {THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                className={`sg-theme-btn${theme === th.id ? " is-active" : ""}`}
                aria-pressed={theme === th.id}
                onClick={() => applyTheme(th.id)}
              >
                {th.name}
                {th.premium && (
                  <span className="sg-theme-prem" aria-label="premium">
                    ★
                  </span>
                )}
              </button>
            ))}
          </div>
          <span className="sg-themebar-note">{tc("styleguide.themeNote")}</span>
        </div>

        <div className="sgbar-right">
          <div className="lp-langtoggle" role="group" aria-label="Language">
            <button
              type="button"
              className={`lp-lang-btn${lang === "en" ? " active" : ""}`}
              aria-pressed={lang === "en"}
              onClick={() => switchLang("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={`lp-lang-btn${lang === "zh-TW" ? " active" : ""}`}
              aria-pressed={lang === "zh-TW"}
              onClick={() => switchLang("zh-TW")}
            >
              中
            </button>
          </div>
        </div>

        <header className="sg-header">
          <h1 className="sg-title">{tc("styleguide.title")}</h1>
          <p
            className="sg-subtitle"
            dangerouslySetInnerHTML={{ __html: tc("styleguide.subtitle") }}
          />
          <a
            className="sg-subtitle"
            href="?ui=landscape"
            style={{
              display: "inline-block",
              marginTop: 6,
              fontWeight: 700,
              textDecoration: "underline",
            }}
          >
            Landscape-native redesign (epic #152) →
          </a>
          <a
            className="sg-subtitle"
            href="?devnotes"
            style={{
              display: "inline-block",
              marginTop: 6,
              fontWeight: 700,
              textDecoration: "underline",
            }}
          >
            Dev notes hub →
          </a>
        </header>

        {/* ── BUTTONS ─────────────────────────────────────────────────────── */}
        <Section
          title={tc("styleguide.section.button.title")}
          desc={tc("styleguide.section.button.desc")}
        >
          <div className="sg-row">
            <Specimen label='variant="primary"'>
              <Button variant="primary">{lang === "en" ? "Start Practice" : "開始練習"}</Button>
            </Specimen>
            <Specimen label='variant="secondary"'>
              <Button variant="secondary">{lang === "en" ? "Maybe Later" : "以後再說"}</Button>
            </Specimen>
            <Specimen label='variant="ghost"'>
              <Button variant="ghost">{lang === "en" ? "Skip" : "跳過"}</Button>
            </Specimen>
          </div>
          <div className="sg-row">
            <Specimen label="primary · disabled">
              <Button variant="primary" disabled>
                {lang === "en" ? "Start Practice" : "開始練習"}
              </Button>
            </Specimen>
            <Specimen label="secondary · disabled">
              <Button variant="secondary" disabled>
                {lang === "en" ? "Maybe Later" : "以後再說"}
              </Button>
            </Specimen>
            <Specimen label="ghost · disabled">
              <Button variant="ghost" disabled>
                {lang === "en" ? "Skip" : "跳過"}
              </Button>
            </Specimen>
          </div>
          <div className="sg-row">
            <Specimen label="press state (tap to hold armed)">
              <Button
                variant="primary"
                className={armed ? "sg-armed" : undefined}
                onClick={() => setArmed((a) => !a)}
              >
                {armed
                  ? lang === "en"
                    ? "Pressed (lip compressed)"
                    : "按下了（唇邊壓縮）"
                  : lang === "en"
                    ? "Tap me"
                    : "按按看"}
              </Button>
            </Specimen>
          </div>
        </Section>

        {/* ── TEXT INPUTS ─────────────────────────────────────────────────── */}
        <Section
          title={tc("styleguide.section.textInput.title")}
          desc={tc("styleguide.section.textInput.desc")}
        >
          <div className="sg-row sg-row--wrap">
            <Specimen
              label={
                lang === "en"
                  ? ".welcome-popup-input (profile name)"
                  : ".welcome-popup-input（使用者姓名）"
              }
            >
              <div className="welcome-popup-field">
                <label className="welcome-popup-label" htmlFor="sg-name">
                  {lang === "en" ? "Your name" : "你的名字"}
                </label>
                <input
                  id="sg-name"
                  className="welcome-popup-input"
                  type="text"
                  value={demoName}
                  onChange={(e) => setDemoName(e.target.value)}
                  placeholder={lang === "en" ? "Type a name…" : "請輸入名字…"}
                />
              </div>
            </Specimen>
            <Specimen
              label={
                lang === "en"
                  ? ".welcome-popup-input (native-speaker age)"
                  : ".welcome-popup-input（母語者年齡）"
              }
            >
              <div className="welcome-popup-field">
                <label className="welcome-popup-label" htmlFor="sg-age">
                  {lang === "en" ? "Age" : "年齡"}
                </label>
                <input
                  id="sg-age"
                  className="welcome-popup-input"
                  type="number"
                  inputMode="numeric"
                  value={demoAge}
                  onChange={(e) => setDemoAge(e.target.value)}
                  placeholder={lang === "en" ? "Age" : "年齡"}
                />
              </div>
            </Specimen>
            <Specimen
              label={
                lang === "en"
                  ? ".user-create input (new-profile name)"
                  : ".user-create input（新使用者名稱）"
              }
            >
              <div className="user-create">
                <input
                  type="text"
                  value={demoProfile}
                  onChange={(e) => setDemoProfile(e.target.value)}
                  placeholder={lang === "en" ? "Add a profile…" : "新增使用者…"}
                />
                <button type="button">{lang === "en" ? "Create" : "建立"}</button>
              </div>
            </Specimen>
            <Specimen
              label={
                lang === "en"
                  ? ".settings-name-row input (Settings display name)"
                  : ".settings-name-row input（設定顯示名稱）"
              }
            >
              <div className="settings-name-row">
                <input
                  type="text"
                  value={demoSettingsName}
                  onChange={(e) => setDemoSettingsName(e.target.value)}
                  placeholder={lang === "en" ? "Display name…" : "顯示名稱…"}
                />
              </div>
            </Specimen>
            <Specimen
              label={
                lang === "en"
                  ? ".settings-name-row input (Settings Gemini key)"
                  : ".settings-name-row input（設定 Gemini key）"
              }
            >
              <div className="settings-name-row">
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={demoKey}
                  onChange={(e) => setDemoKey(e.target.value)}
                  placeholder="AIza…"
                />
                <button type="button" className="lever-pill" style={{ flex: "0 0 auto" }}>
                  {lang === "en" ? "Test" : "測試"}
                </button>
              </div>
            </Specimen>
            <Specimen
              label={
                lang === "en"
                  ? ".fb-textarea (shared kit pattern)"
                  : ".fb-textarea（共用元件庫 pattern）"
              }
            >
              <textarea
                className="fb-textarea"
                defaultValue={lang === "en" ? "The quick brown fox" : "我是一隻透明的小 drafting"}
                placeholder={lang === "en" ? "Shared-kit field…" : "共用元件庫欄位…"}
              />
            </Specimen>
          </div>
        </Section>

        {/* ── CHARACTER TILES ─────────────────────────────────────────────── */}
        <Section
          title={tc("styleguide.section.charTile.title")}
          desc={tc("styleguide.section.charTile.desc")}
        >
          <div className="sg-ctx" role="group" aria-label={tc("styleguide.section.charTile.title")}>
            <span className="sg-ctx-label">{lang === "en" ? "Screen" : "畫面"}</span>
            <button
              type="button"
              className={`sg-ctx-btn${tileCtx === "mychars" ? " is-active" : ""}`}
              onClick={() => setTileCtx("mychars")}
            >
              {tc("styleguide.section.charTile.screenMyCharacters")}
            </button>
            <button
              type="button"
              className={`sg-ctx-btn${tileCtx === "other" ? " is-active" : ""}`}
              onClick={() => setTileCtx("other")}
            >
              {tc("styleguide.section.charTile.screenOther")}
            </button>
          </div>
          <div className="sg-tilegrid">
            <Specimen label="lg · ribbon below · 85%">
              <CharTile
                char="字"
                rank={42}
                level="1"
                mastery={85}
                recent={["P", "P", "C"]}
                ribbon="below"
              />
            </Specimen>
            <Specimen label="lg · ribbon target · 55%">
              <CharTile
                char="學"
                rank={318}
                level="2"
                mastery={55}
                recent={["C", "I", "C"]}
                ribbon="target"
              />
            </Specimen>
            <Specimen label="lg · ribbon above · 20%">
              <CharTile
                char="鬱"
                rank={1119}
                level="4*"
                mastery={20}
                recent={["I", "S", "I"]}
                ribbon="above"
              />
            </Specimen>
            <Specimen label="lg · known (success face)">
              <CharTile
                char="我"
                rank={8}
                level="1"
                mastery={100}
                recent={["P", "P", "P"]}
                ribbon="target"
                known
              />
            </Specimen>
            <Specimen label="lg · fresh (0%, no dots)">
              <CharTile char="龜" rank={2750} level="5" mastery={0} ribbon="above" />
            </Specimen>
            <Specimen label="sm · Next-up chip">
              <CharTile char="們" rank={56} level="1" size="sm" />
            </Specimen>
          </div>
          <p className="sg-mono-note">
            {lang === "en"
              ? "Result dots, in order: P perfect · C correct · I incorrect · S skipped."
              : "結果小點，依序為：P 完美 · C 正確 · I 錯誤 · S 跳過。"}
          </p>
        </Section>

        {/* ── WRITING-CHALLENGE CHARACTER TRACK ───────────────────────────── */}
        <Section
          title={tc("styleguide.section.writingTrack.title")}
          desc={tc("styleguide.section.writingTrack.desc")}
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

          <h3 className="sg-subhead">
            {lang === "en"
              ? "Stroke-result states (practice-done tiles)"
              : "書寫結果狀態（練習完成 tile）"}
          </h3>
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
          <h3 className="sg-subhead">
            {lang === "en"
              ? "Completed-char result combos (live track)"
              : "完成字卡的結果組合（live track）"}
          </h3>
          <div className="sg-track-surface sg-track-legend">
            <div className="sg-legend-item">
              <span className="char-box char-box-done char-box-pass">字</span>
              <code>
                {lang === "en" ? "done perfect" : "完成且完美"} · .char-box-done.char-box-pass
              </code>
            </div>
            <div className="sg-legend-item">
              <span className="char-box char-box-done char-box-warn">字</span>
              <code>
                {lang === "en" ? "done correct" : "完成且正確"} · .char-box-done.char-box-warn
              </code>
            </div>
            <div className="sg-legend-item">
              <span className="char-box char-box-done char-box-fail">字</span>
              <code>
                {lang === "en" ? "done incorrect" : "完成且錯誤"} · .char-box-done.char-box-fail
              </code>
            </div>
            <div className="sg-legend-item">
              <span className="char-box char-box-above">預</span>
              <code>above-level / auto-skip (= fail) · .char-box-above</code>
            </div>
          </div>
        </Section>

        {/* ── CARD ────────────────────────────────────────────────────────── */}
        <Section
          title={tc("styleguide.section.card.title")}
          desc={tc("styleguide.section.card.desc")}
        >
          <Card>
            <h3 style={{ margin: 0 }}>{lang === "en" ? "A standalone Card" : "單用的卡片"}</h3>
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              {lang === "en"
                ? "Renders the real .module-tile class. Drop any content inside."
                : "渲染真正的 .module-tile class，裡面可以放任何內容。"}
            </p>
            <Button variant="primary">
              {lang === "en" ? "Action inside a Card" : "卡片內的動作"}
            </Button>
          </Card>
        </Section>

        {/* ── BACK BUTTON ─────────────────────────────────────────────────── */}
        <Section
          title={tc("styleguide.section.backButton.title")}
          desc={tc("styleguide.section.backButton.desc")}
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
          title={tc("styleguide.section.moduleScreen.title")}
          desc={tc("styleguide.section.moduleScreen.desc")}
        >
          <div className="sg-frames">
            <Specimen label="title + onBack (default width)">
              <div className="sg-frame">
                <ModuleScreen
                  title={lang === "en" ? "Writing Challenge" : "寫字挑戰"}
                  onBack={() => {}}
                  backLabel="← Back"
                >
                  <p style={{ margin: 0, color: "var(--text-muted)", textAlign: "center" }}>
                    {lang === "en" ? "Module content goes here." : "模組內容放在這裡。"}
                  </p>
                  <Button variant="primary">Start</Button>
                </ModuleScreen>
              </div>
            </Specimen>
            <Specimen label="wide variant + cardClassName, no back">
              <div className="sg-frame">
                <ModuleScreen
                  title={lang === "en" ? "Word Sets" : "詞彙集"}
                  wide
                  cardClassName="sg-demo-grid"
                >
                  <Button variant="secondary">{lang === "en" ? "Animals" : "動物"}</Button>
                  <Button variant="secondary">{lang === "en" ? "Food" : "食物"}</Button>
                  <Button variant="secondary">{lang === "en" ? "Family" : "家庭"}</Button>
                  <Button variant="secondary">{lang === "en" ? "Colors" : "顏色"}</Button>
                </ModuleScreen>
              </div>
            </Specimen>
          </div>
        </Section>

        {/* ── COLOR TOKENS ────────────────────────────────────────────────── */}
        <Section
          title={tc("styleguide.section.colorTokens.title")}
          desc={tc("styleguide.section.colorTokens.desc")}
        >
          <Swatches tokens={COLOR_TOKENS} />
        </Section>

        {/* ── SEMANTIC / STATE COLORS ─────────────────────────────────────── */}
        <Section
          title={tc("styleguide.section.semanticColors.title")}
          desc={tc("styleguide.section.semanticColors.desc")}
        >
          <Swatches tokens={SEMANTIC_TOKENS} />
        </Section>

        {/* ── PER-SCREEN BACKGROUNDS ──────────────────────────────────────── */}
        <Section
          title={tc("styleguide.section.screenBackgrounds.title")}
          desc={tc("styleguide.section.screenBackgrounds.desc")}
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
          title={tc("styleguide.section.surfaces.title")}
          desc={tc("styleguide.section.surfaces.desc")}
        >
          <div className="sg-row sg-row--wrap">
            <Specimen
              label={lang === "en" ? ".module-tile (cream panel)" : ".module-tile（奶油面板）"}
            >
              <div className="module-tile" style={{ maxWidth: 220, margin: 0 }}>
                <p style={{ margin: 0, textAlign: "center", fontWeight: 800 }}>.module-tile</p>
              </div>
            </Specimen>
            <Specimen
              label={lang === "en" ? ".module-back (back pill)" : ".module-back（返回 pills）"}
            >
              <button className="module-back" type="button">
                ← Back
              </button>
            </Specimen>
          </div>
        </Section>

        {/* ── TYPOGRAPHY ──────────────────────────────────────────────────── */}
        <Section
          title={tc("styleguide.section.typography.title")}
          desc={tc("styleguide.section.typography.desc")}
        >
          <div className="sg-type">
            <div className="sg-type-row">
              <span className="module-tile-title" style={{ margin: 0 }}>
                {lang === "en" ? "Display 32px" : "標題 Display 32px"}
              </span>
              <code>.module-tile-title · 32px / 900</code>
            </div>
            <div className="sg-type-row">
              <span style={{ fontFamily: "var(--font)", fontWeight: 900, fontSize: 17 }}>
                {lang === "en" ? "Button label 17px" : "按鈕文字 17px"}
              </span>
              <code>.ui-btn · 17px / 900</code>
            </div>
            <div className="sg-type-row">
              <span style={{ fontFamily: "var(--font)", fontWeight: 800, fontSize: 15 }}>
                {lang === "en" ? "Back pill 15px" : "返回 pills 15px"}
              </span>
              <code>.module-back · 15px / 800</code>
            </div>
            <div className="sg-type-row">
              <span style={{ fontFamily: "var(--font)", fontSize: 16, color: "var(--text)" }}>
                {lang === "en"
                  ? "Body text 16px — the quick brown 狐狸 jumps."
                  : "內文 16px — The quick brown 狐狸 jumps."}
              </span>
              <code>body · var(--font)</code>
            </div>
            <div className="sg-type-row">
              <span style={{ fontFamily: "var(--font)", fontSize: 14, color: "var(--text-muted)" }}>
                {lang === "en" ? "Muted hint 14px" : "淡化提示 14px"}
              </span>
              <code>color: var(--text-muted)</code>
            </div>
          </div>
          <p className="sg-mono-note">
            {lang === "en"
              ? 'Family: var(--font) = "SF Pro Rounded", "Nunito", system-ui, …'
              : '字型家族：var(--font) = "SF Pro Rounded", "Nunito", system-ui, …'}
          </p>
        </Section>

        <footer
          className="sg-footer"
          dangerouslySetInnerHTML={{ __html: tc("styleguide.footer") }}
        />
      </div>
    </LanguageContext.Provider>
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
  justify-content: space-between;
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
.sg-lang-btn {
  font-family: var(--font); font-size: 13px; font-weight: 800; color: #fff;
  cursor: pointer; padding: 6px 12px; border-radius: 999px;
  border: 1.5px solid rgba(255,255,255,0.26);
  background: rgba(255,255,255,0.08);
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
}
.sg-lang-btn:active { transform: translateY(1px); }
.sg-lang-btn.is-active { background: #fff; color: #1a1d24; border-color: #fff; }
.sg-themebar-note {
  font-family: var(--font); font-size: 12px; color: rgba(255,255,255,0.55);
  margin-left: auto;
}
@media (max-width: 600px) { .sg-themebar-note { display: none; } }

.sgbar-right { display: flex; align-items: center; }
.lp-langtoggle { display: flex; gap: 7px; }
.lp-lang-btn {
  font-family: var(--font); font-size: 13px; font-weight: 800; color: #fff;
  cursor: pointer; padding: 6px 12px; border-radius: 999px;
  border: 1.5px solid rgba(255,255,255,0.26);
  background: rgba(255,255,255,0.08);
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
}
.lp-lang-btn:active { transform: translateY(1px); }
.lp-lang-btn.active { background: #fff; color: #1a1d24; border-color: #fff; }

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
