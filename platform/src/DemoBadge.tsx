/**
 * DEMO-SITE BADGE (issue #27 (C)). A small, always-present pill shown only on the
 * public, always-fresh demo session (`isDemoMode()`). It tells visitors this is a
 * demo and that a refresh resets progress — so accruing in-session practice isn't
 * mistaken for saved data. Non-dismissable on purpose (clearly persistent, per the
 * acceptance criteria). Renders nothing outside demo mode, so the installed PWA
 * and dev/LAN sessions never see it.
 *
 * Pinned bottom-centre so it stays clear of the top UpdateBanner and the
 * bottom-edge offline/stroke toasts are short-lived. Localized via LanguageContext.
 */
import { useContext } from 'react';
import { LanguageContext, useT } from './i18n/index.ts';
import { isDemoMode } from './offline/demo-mode.ts';

export default function DemoBadge() {
  const t = useT();
  // Read the language so the badge re-renders on a language switch.
  useContext(LanguageContext);
  if (!isDemoMode()) return null;
  return (
    <div className="demo-badge" role="status" aria-label={t('demo.note')} title={t('demo.note')}>
      <span className="demo-badge__dot" aria-hidden>●</span>
      <span className="demo-badge__text">{t('demo.note')}</span>
    </div>
  );
}
