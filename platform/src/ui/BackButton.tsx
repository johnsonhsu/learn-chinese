import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface BackButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Click handler that performs the "go back" navigation. */
  onClick?: () => void;
  /** Label for the pill (already localized). Defaults to "← Back". */
  label?: ReactNode;
  /**
   * Visual size. `'md'` (default) is the big cream candy pill used by
   * <ModuleScreen> main screens + word-sets. `'sm'` is a compact arrow-sized
   * control for in-game/practice top rows where the back sits inline with the
   * other controls (Stop / Auto-Skip / refresh) rather than as a banner pill.
   */
  size?: 'md' | 'sm';
}

/**
 * The shared back pill (`.module-back`) as a STANDALONE primitive — for screens
 * that need a back but aren't wrapped in a <ModuleScreen> (e.g. a module's
 * in-game/practice screen). <ModuleScreen> renders the same pill internally when
 * given `onBack`; this is the same look for use outside that shell.
 *
 * Forwards native button props plus an optional extra `className`. Styling lives
 * in platform/src/index.css under `.app-shell .module-back`.
 *
 *   <BackButton onClick={onExit} label={t('practice.back')} />
 *   <BackButton size="sm" onClick={onExit} label={t('practice.back')} />  // compact, inline
 */
export function BackButton({ onClick, label, className, size = 'md', ...rest }: BackButtonProps) {
  const cls = ['module-back', size === 'sm' && 'module-back--sm', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} {...rest}>
      {label ?? '← Back'}
    </button>
  );
}
