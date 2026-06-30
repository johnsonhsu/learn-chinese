import type { ReactNode } from 'react';

export interface ModuleScreenProps {
  /** Already-localized screen title (the module passes t(name)). */
  title: ReactNode;
  /** If given, renders the shared back pill that calls this on click. */
  onBack?: () => void;
  /** Label for the back pill (already localized). Defaults to "← Back". */
  backLabel?: ReactNode;
  /** Extra class on the inner card, for module-specific inner layout. */
  cardClassName?: string;
  /** Widen the card (e.g. for a multi-column grid that's cramped at the default width). */
  wide?: boolean;
  /** Extra class on the page wrapper. */
  className?: string;
  children?: ReactNode;
}

/**
 * The standard module MAIN-screen shell. This is the big reuse win — a new
 * module's landing becomes:
 *
 *   <ModuleScreen title={localizedName} onBack={onExit}>
 *     …content…
 *   </ModuleScreen>
 *
 * It renders:
 *   • the shared back pill (`.module-back`) — only when `onBack` is provided,
 *   • the shared cream card (`.module-tile`) containing
 *   • the shared title (`.module-tile-title`) followed by `children`.
 *
 * All three classes live in platform/src/index.css under `.app-shell`, so the
 * look matches everywhere and survives a module's scoped CSS reset.
 */
export function ModuleScreen({
  title,
  onBack,
  backLabel,
  cardClassName,
  wide,
  className,
  children,
}: ModuleScreenProps) {
  const screenCls = ['ui-screen', className].filter(Boolean).join(' ');
  const cardCls = ['module-tile', 'ui-screen-card', wide && 'ui-screen-card--wide', cardClassName].filter(Boolean).join(' ');
  return (
    <div className={screenCls}>
      {onBack && (
        <button className="module-back" onClick={onBack}>
          {backLabel ?? '← Back'}
        </button>
      )}
      <div className={cardCls}>
        <h1 className="module-tile-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}
