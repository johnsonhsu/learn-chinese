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
  "theme-bg-profile", // profile-selection screen field
  "theme-bg-home", // module-selection / home screen field
  "theme-bg-module", // each module's main background field
  "theme-halo", // optional top vignette / overlay tint
  // — Decorative foil family (premium skins; default leaves unset) —
  "theme-foil",
  "theme-foil-edge",
  "theme-foil-glow",
  "theme-foil-ink",
  "theme-foil-halo",
  "theme-foil-edge-shadow",
  "theme-foil-text-shadow",
  "theme-emblem", // crown/marker glyph used by premium shells
  "theme-title-sweep", // shimmering wordmark gradient
  // — My-Characters tile —
  "theme-tile-face", // CharTile face fill
  "theme-tile-frame", // CharTile border / frame
  "theme-tile-glyph", // CharTile glyph color
  "theme-tile-glow", // CharTile shadow / glow
  // — Buttons —
  "theme-btn-bg",
  "theme-btn-border",
  "theme-btn-font",
  "theme-btn-shadow",
  "theme-btn-radius",
  "theme-btn-ink", // button text color
  // — Text —
  "theme-font", // body / UI font family
  "theme-font-display", // heading / wordmark font family
  "theme-text-scale", // multiplier applied to the base size scale
  "theme-text-weight", // base body weight
  "theme-text-style", // normal | italic
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

/** How the module-selection grid is laid out for a theme. The home screen reads
 *  this off the theme so a future theme can re-arrange the activity tiles
 *  without touching App.tsx. */
export type ModuleArrangement = "grid" | "list";

export interface Theme {
  /** Stable id — also the value of `body[data-theme]` + the persisted key. */
  id: string;
  /** Human label shown in the selectors (English; zh falls back to this). */
  name: string;
  /** Localized label key (optional) — when present the selector localizes via i18n. */
  nameKey?: string;
  /**
   * Premium themes are code-gated; free themes are always available. Under the
   * granular scheme (issue #40) each premium theme is keyed on its OWN unlock
   * feature (see `unlockFeature`), gated behind the 9000 premium prerequisite.
   */
  premium: boolean;
  /**
   * For a premium theme, the unlock feature key (in utils/unlocks CODE_FEATURES)
   * that makes it available — Silver keys off 9900's grant, Gold off 9901's.
   * Free themes leave this unset. A device that stored the LEGACY blanket
   * 'premium' feature (old code 9999) still ungates every premium theme — see
   * theme-store.isThemeAvailable's back-compat branch.
   */
  unlockFeature?: string;
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
 *   1) add an entry here (id, name, premium, arrangement; premium → unlockFeature),
 *   2) add a `body[data-theme="<id>"] { … }` block in index.css filling the
 *      token contract,
 *   3) (premium only) mint its unlock code in utils/unlocks.ts CODE_FEATURES,
 *      gated behind the 'premium' prerequisite (code 9000).
 * Nothing else needs editing — selectors, storage, gating + resolution are
 * all data-driven off this list.
 */
export const THEMES: Theme[] = [
  {
    id: "indigo",
    name: "Indigo",
    nameKey: "theme.indigo",
    premium: false,
    arrangement: "grid",
    cssDefined: true,
  },
  {
    id: "default",
    name: "Paper",
    nameKey: "theme.default",
    premium: false,
    arrangement: "grid",
    cssDefined: true,
  },
  {
    id: "midnight",
    name: "Midnight",
    nameKey: "theme.midnight",
    premium: false,
    arrangement: "grid",
    cssDefined: true,
  },
  {
    id: "sakura",
    name: "Sakura",
    nameKey: "theme.sakura",
    premium: false,
    arrangement: "grid",
    cssDefined: true,
  },
  {
    id: "matcha",
    name: "Matcha",
    nameKey: "theme.matcha",
    premium: false,
    arrangement: "grid",
    cssDefined: true,
  },
  {
    id: "retro",
    name: "90s",
    nameKey: "theme.retro",
    premium: false,
    arrangement: "grid",
    cssDefined: true,
  },
  {
    id: "80s-motiv",
    name: "80s Motiv",
    nameKey: "theme.80s-motiv",
    premium: false,
    arrangement: "grid",
    cssDefined: true,
  },
  {
    id: "outer-space",
    name: "Outer Space",
    nameKey: "theme.outer-space",
    premium: false,
    arrangement: "grid",
    cssDefined: true,
  },
  // Premium foils — always listed LAST (the picker also sorts premium to the end).
  // Each keys on its OWN unlock feature (Gold ← 9901, Silver ← 9900), gated
  // behind the 9000 premium prerequisite.
  {
    id: "gold",
    name: "Gold",
    nameKey: "theme.gold",
    premium: true,
    unlockFeature: "theme-gold",
    arrangement: "grid",
    cssDefined: true,
  },
  {
    id: "silver",
    name: "Silver",
    nameKey: "theme.silver",
    premium: true,
    unlockFeature: "theme-silver",
    arrangement: "grid",
    cssDefined: true,
  },
];

/** The DEFAULT SELECTION for a new device/profile — what the picker starts on.
 *  "Indigo" (the landing look), applied like any theme via `body[data-theme]`.
 *  Typed as `string` (not the literal) so it composes with the other id-typed
 *  values and so callers may legitimately compare it against ROOT_THEME_ID
 *  (these two are config knobs that COULD be set equal). */
export const DEFAULT_THEME_ID: string = "indigo";

/** The id whose tokens ARE :root — applied by REMOVING `body[data-theme]` (the
 *  editorial "Paper" baseline). Kept DISTINCT from DEFAULT_THEME_ID so the
 *  default selection can be a real applied theme (Indigo) while the cascade
 *  still has a no-attribute fallback. Typed as `string` so the "are these two
 *  configured equal?" guards in callers type-check instead of being flagged as
 *  a provably-false literal comparison (TS2367). */
export const ROOT_THEME_ID: string = "default";

/**
 * LEGACY blanket premium feature key. Granted by the retired code 9999, it
 * ungated BOTH foils at once. The granular scheme (issue #40) no longer mints it
 * — 9000 grants it only as a PREREQUISITE that reveals nothing on its own (the
 * per-theme keys 9900/9901 do the revealing). Kept as the BACK-COMPAT key:
 * a device that already stored it keeps every premium theme available, and it
 * remains the prerequisite that gates the 99xx codes (see utils/unlocks).
 */
export const PREMIUM_FEATURE = "premium";

const THEME_BY_ID = new Map(THEMES.map((th) => [th.id, th]));

/** Look up a theme by id; returns the default theme for unknown/legacy ids. */
export function getTheme(id: string | null | undefined): Theme {
  return (id && THEME_BY_ID.get(id)) || THEME_BY_ID.get(DEFAULT_THEME_ID)!;
}

/** Whether an id names a real, registered theme. */
export function isThemeId(id: string | null | undefined): id is string {
  return !!id && THEME_BY_ID.has(id);
}
