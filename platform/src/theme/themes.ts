/**
 * THEME REGISTRY — the single, extensible source of truth for the app's visual
 * themes. A theme controls EVERYTHING visual: backgrounds, tiles, buttons, text,
 * and the module-selection arrangement. Adding a future theme is just one entry
 * in THEMES below (id + name + premium flag); its look lives in index.css under
 * `body[data-theme="<id>"]`.
 *
 * Resolution + storage live in ./theme-store.ts; the actual CSS token values
 * live in index.css (keyed on body[data-theme]). This file is the contract +
 * catalogue both sides agree on.
 */

/**
 * THE TOKEN CONTRACT — the named CSS custom properties every themeable surface
 * reads from. A theme is, conceptually, a value for each of these. The DEFAULT
 * theme sets none of them explicitly (the `:root` editorial values stand in,
 * pixel-identical to today); premium themes override the family under their
 * `body[data-theme]` block. Kept here as documentation + a typed allow-list so
 * future themes have a checklist of "everything possible" to fill in.
 *
 * Surfaces that consume these:
 *   - Backgrounds: profile-selection, module-selection/home, each module's bg
 *   - My-Characters tile (CharTile): face / frame / glyph / chips
 *   - Buttons: bg / border / font / shadow / radius
 *   - Text: font family, size scale, weight/style
 *   - Module-selection ARRANGEMENT variant (grid vs list etc.)
 */
export const THEME_TOKENS = [
  // — Backgrounds (per surface) —
  'theme-bg-profile',   // profile-selection screen field
  'theme-bg-home',      // module-selection / home screen field
  'theme-bg-module',    // each module's main background field
  'theme-halo',         // optional top vignette / overlay tint
  // — Decorative foil family (premium skins; default leaves unset) —
  'theme-foil',
  'theme-foil-edge',
  'theme-foil-glow',
  'theme-foil-ink',
  'theme-foil-halo',
  'theme-foil-edge-shadow',
  'theme-foil-text-shadow',
  'theme-emblem',       // crown/marker glyph used by premium shells
  'theme-title-sweep',  // shimmering wordmark gradient
  // — My-Characters tile —
  'theme-tile-face',    // CharTile face fill
  'theme-tile-frame',   // CharTile border / frame
  'theme-tile-glyph',   // CharTile glyph color
  'theme-tile-glow',    // CharTile shadow / glow
  // — Buttons —
  'theme-btn-bg',
  'theme-btn-border',
  'theme-btn-font',
  'theme-btn-shadow',
  'theme-btn-radius',
  'theme-btn-ink',      // button text color
  // — Text —
  'theme-font',         // body / UI font family
  'theme-font-display', // heading / wordmark font family
  'theme-text-scale',   // multiplier applied to the base size scale
  'theme-text-weight',  // base body weight
  'theme-text-style',   // normal | italic
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

/** How the module-selection grid is laid out for a theme. The home screen reads
 *  this off the theme so a future theme can re-arrange the activity tiles
 *  without touching App.tsx. */
export type ModuleArrangement = 'grid' | 'list';

export interface Theme {
  /** Stable id — also the value of `body[data-theme]` + the persisted key. */
  id: string;
  /** Human label shown in the selectors (English; zh falls back to this). */
  name: string;
  /** Localized label key (optional) — when present the selector localizes via i18n. */
  nameKey?: string;
  /** Premium themes are code-gated (code 9999); free themes are always available. */
  premium: boolean;
  /** Module-selection layout variant. Defaults to 'grid'. */
  arrangement: ModuleArrangement;
  /**
   * Token values are NOT inlined here — they live in index.css under
   * `body[data-theme="<id>"]` (so the cascade, media queries, ::before/::after
   * and animations all work natively). This flag documents that a theme's tokens
   * are CSS-defined; kept for the registry to stay declarative + future-proof.
   */
  cssDefined: true;
}

/**
 * THE REGISTRY. Order here is the order shown in the selectors. To add a theme:
 *   1) add an entry here (id, name, premium, arrangement),
 *   2) add a `body[data-theme="<id>"] { … }` block in index.css filling the
 *      token contract,
 *   3) (premium only) optionally mint a new unlock code in utils/unlocks.ts.
 * Nothing else needs editing — selectors, storage, gating + resolution are
 * all data-driven off this list.
 */
export const THEMES: Theme[] = [
  { id: 'default', name: 'Default', nameKey: 'theme.default', premium: false, arrangement: 'grid', cssDefined: true },
  { id: 'gold',    name: 'Gold',    nameKey: 'theme.gold',    premium: true,  arrangement: 'grid', cssDefined: true },
  { id: 'silver',  name: 'Silver',  nameKey: 'theme.silver',  premium: true,  arrangement: 'grid', cssDefined: true },
  { id: 'midnight', name: 'Midnight', nameKey: 'theme.midnight', premium: false, arrangement: 'grid', cssDefined: true },
  { id: 'sakura',   name: 'Sakura',   nameKey: 'theme.sakura',   premium: false, arrangement: 'grid', cssDefined: true },
  { id: 'matcha',   name: 'Matcha',   nameKey: 'theme.matcha',   premium: false, arrangement: 'grid', cssDefined: true },
];

/** The id rendered when nothing is selected anywhere. Pixel-identical to today. */
export const DEFAULT_THEME_ID = 'default';

/** Feature key (in utils/unlocks.ts CODE_FEATURES) that ungates premium themes. */
export const PREMIUM_FEATURE = 'premium';

const THEME_BY_ID = new Map(THEMES.map((th) => [th.id, th]));

/** Look up a theme by id; returns the default theme for unknown/legacy ids. */
export function getTheme(id: string | null | undefined): Theme {
  return (id && THEME_BY_ID.get(id)) || THEME_BY_ID.get(DEFAULT_THEME_ID)!;
}

/** Whether an id names a real, registered theme. */
export function isThemeId(id: string | null | undefined): id is string {
  return !!id && THEME_BY_ID.has(id);
}
