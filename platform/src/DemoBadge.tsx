/**
 * DEMO-SITE BANNER (issue #27 (C), redesigned in PR #31 review). A slim, always-
 * present top ribbon shown only on the public, always-fresh demo session
 * (`isDemoMode()`). It tells visitors this is a demo and that a refresh resets
 * progress — so in-session practice isn't mistaken for saved data. Renders
 * nothing outside demo mode, so the installed PWA and dev/LAN sessions never
 * see it.
 *
 * DESIGN — native chrome, not a floating toast. A full-bleed frosted ribbon
 * pinned to the TOP of the page, built entirely from the per-theme token
 * contract (--paper-raised / --rule / --ink / --seal …), so it reads as part of
 * the surface on Paper AND all six themes (light blush/sage, dark navy/ink,
 * gold/silver foil) with no per-theme rule. The brand's 朱印 seal language is
 * the one accent: a small vermilion/seal "Demo" chip, then a quiet note. The
 * ribbon adds top padding to #root (via the `demo-active` body class) so it
 * never overlaps the header / landing menu / module screens beneath it.
 *
 * Non-dismissable on purpose — a persistent demo indicator, not a notice to
 * clear. When the rare UpdateBanner appears it stacks ABOVE this (higher
 * z-index), which is correct: that one is transient + actionable. Localized via
 * LanguageContext.
 */
import { useContext, useEffect } from 'react';
import { LanguageContext, useT } from './i18n/index.ts';
import { isDemoMode } from './offline/demo-mode.ts';

export default function DemoBadge() {
  const t = useT();
  // Read the language so the banner re-renders on a language switch.
  useContext(LanguageContext);
  const demo = isDemoMode();

  // Reserve space for the fixed ribbon by tagging <body> while it's mounted, so
  // #root content (header / landing menu / module screens) clears it. Toggled
  // here rather than statically so a non-demo session keeps the exact original
  // layout (no stray top gap).
  useEffect(() => {
    if (!demo) return;
    document.body.classList.add('demo-active');
    return () => document.body.classList.remove('demo-active');
  }, [demo]);

  if (!demo) return null;
  return (
    <div className="demo-ribbon" role="status" aria-label={t('demo.note')}>
      <div className="demo-ribbon__inner">
        <span className="demo-ribbon__chip" aria-hidden>
          <span className="demo-ribbon__seal" />
          {t('demo.badge')}
        </span>
        <span className="demo-ribbon__note">{t('demo.note')}</span>
      </div>
    </div>
  );
}
