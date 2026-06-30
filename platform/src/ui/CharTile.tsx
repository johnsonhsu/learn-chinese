import type { CSSProperties, KeyboardEvent } from 'react';

/** Where the character's frequency rank sits relative to the learner's level —
 *  drives the corner ribbon color (below = on-track accent, target = success,
 *  above = danger). */
export type CharTileRibbon = 'below' | 'target' | 'above';

/** Recent practice outcome, one per dot (P=perfect, C=correct, I=incorrect,
 *  S=skip). Same letter codes the data layer already stores in `recentResults`. */
export type CharResultCode = 'P' | 'C' | 'I' | 'S';

export interface CharTileProps {
  /** The Chinese character (the visual focus). */
  char: string;
  /** Frequency rank; shown as `#N` in the top row. Omit/0 → shown as `#?`. */
  rank?: number;
  /** Short level label (already stripped to e.g. "1", "1*", "2"). */
  level?: string;
  /** Mastery / progress 0–100 → the full-bleed bottom bar. Omit to hide the bar. */
  mastery?: number;
  /** Recent-result dots (most-recent-last). Omit/empty → no dots row. */
  recent?: CharResultCode[];
  /** Corner ribbon state. Omit → no ribbon. */
  ribbon?: CharTileRibbon;
  /** Marks a fully-known character → success-tinted face + glow. */
  known?: boolean;
  /** lg = My Characters grid (default); sm = compact "Next up" / word-set chips. */
  size?: 'lg' | 'sm';
  /** Tap-to-practice / tap-to-speak. When set the tile is a focusable button-role. */
  onActivate?: () => void;
  /** Accessible label (already localized by the caller, e.g. "Practice 字"). */
  ariaLabel?: string;
  className?: string;
}

// score → bar color, in the editorial palette (ink-green / ochre / seal / faint).
function masteryFillColor(pct: number): string {
  return pct >= 80 ? '#4F7A3A' : pct >= 50 ? '#B5701C' : pct > 0 ? '#C0392B' : '#C7BCA6';
}

/**
 * The ONE shared per-character practice tile, rendered identically on My
 * Characters (lg), writing-challenge's "Next up" preview (sm) and word-sets'
 * tappable chips (sm). Canonical look + tokens live in ui-kit.css under
 * `.app-shell .char-tile`.
 *
 * Redesign baked in here: a SQUARE leaf of paper with a faint 米字格 cross-hair.
 * Rank (plain tabular numerals, prefixed by a colored mastery PIP) sits top-left
 * and the level chip top-right — both in a flex row with side padding and a
 * stacking context, so a 4-digit rank (#1119) or a starred level (4*) ALWAYS
 * sits clear of the rounded corners. The calligraphic glyph is the centered
 * focus; recent-result dots sit above an inset hairline mastery bar.
 */
export function CharTile({
  char,
  rank,
  level,
  mastery,
  recent,
  ribbon,
  known,
  size = 'lg',
  onActivate,
  ariaLabel,
  className,
}: CharTileProps) {
  const cls = [
    'char-tile',
    `char-tile--${size}`,
    known && 'char-tile--known',
    onActivate && 'char-tile--tappable',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const hasTop = rank !== undefined || level !== undefined;
  const hasBar = mastery !== undefined;
  const fill = hasBar ? Math.max(0, Math.min(100, mastery as number)) : 0;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onActivate) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  };

  return (
    <div
      className={cls}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={ariaLabel}
    >
      {hasTop && (
        <div className="char-tile-top">
          <span className="char-tile-rank">
            {ribbon && <span className={`char-tile-pip char-tile-pip--${ribbon}`} aria-hidden="true" />}
            #{rank || '?'}
          </span>
          {level !== undefined && <span className="char-tile-level">{level}</span>}
        </div>
      )}

      <span className="char-tile-glyph">{char}</span>

      <div className="char-tile-foot">
        {recent && recent.length > 0 && (
          <span className="char-tile-dots" aria-hidden="true">
            {recent.map((r, i) => (
              <span key={i} className={`char-tile-dot char-tile-dot--${r}`} />
            ))}
          </span>
        )}
      </div>

      {hasBar && (
        <span className="char-tile-bar" aria-hidden="true">
          <span
            className="char-tile-bar-fill"
            style={{ width: `${fill}%`, background: masteryFillColor(fill) } as CSSProperties}
          />
        </span>
      )}
    </div>
  );
}
